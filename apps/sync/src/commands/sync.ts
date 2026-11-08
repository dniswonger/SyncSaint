/**
 * The scheduled job: mirror every linked Spotify playlist onto its TIDAL playlist.
 * Tracks are matched by ISRC; results (including misses) are cached in the encrypted state.
 */
import {
  HttpError,
  SpotifyClient,
  TidalClient,
  diffPlaylist,
  spotifyRefresh,
  tidalRefresh,
  type PlaylistLink,
  type State,
  type UnmatchedTrack,
} from '@syncsaint/core';
import { loadEnv, type Env } from '../env';
import { log, mask, shortId, summary } from '../log';
import { loadState, saveState } from '../stateStore';

const MISS_RETRY_MS = 7 * 86_400_000; // re-check unmatched ISRCs weekly; catalogs change

interface LinkResult {
  link: PlaylistLink;
  status: 'skipped' | 'synced' | 'error';
  added?: number;
  removed?: number;
  unmatched?: number;
}

async function main() {
  const env = loadEnv();
  const state = await loadState(env.stateFile, env.stateKey);
  if (!state.tidal) {
    log.warn('No TIDAL account connected yet; nothing to do.');
    return;
  }
  if (state.links.length === 0) {
    log.info('No playlists linked yet; nothing to do.');
    return;
  }

  const tidalTokens = await tidalRefresh(env.tidalClientId, state.tidal.refreshToken);
  mask(tidalTokens.accessToken);
  mask(tidalTokens.refreshToken);
  state.tidal.refreshToken = tidalTokens.refreshToken;
  await saveState(env.stateFile, env.stateKey, state);
  const tidal = new TidalClient(tidalTokens.accessToken, state.tidal.countryCode);

  const results: LinkResult[] = [];
  const ownerIds = [...new Set(state.links.filter((l) => l.enabled).map((l) => l.spotifyOwnerId))];

  for (const ownerId of ownerIds) {
    const owner = state.owners[ownerId];
    const links = state.links.filter((l) => l.enabled && l.spotifyOwnerId === ownerId);
    if (!owner || owner.status === 'revoked') {
      for (const link of links) {
        link.lastError = 'Owner access revoked; ask them for a new link code';
        results.push({ link, status: 'error' });
      }
      continue;
    }

    let spotify: SpotifyClient;
    try {
      const tokens = await spotifyRefresh(env.spotifyClientId, owner.refreshToken);
      mask(tokens.accessToken);
      mask(tokens.refreshToken);
      owner.refreshToken = tokens.refreshToken;
      await saveState(env.stateFile, env.stateKey, state);
      spotify = new SpotifyClient(tokens.accessToken);
    } catch (err) {
      // 400 invalid_grant: the owner revoked access in their Spotify account settings.
      if (err instanceof HttpError && err.status === 400) owner.status = 'revoked';
      for (const link of links) {
        link.lastError = `Spotify auth failed: ${errMsg(err)}`;
        results.push({ link, status: 'error' });
      }
      continue;
    }

    for (const link of links) {
      log.group(`Playlist ${shortId(link.spotifyPlaylistId)}`);
      try {
        results.push(await syncLink(env, state, spotify, tidal, link));
        link.lastError = null;
      } catch (err) {
        link.lastError = errMsg(err);
        log.error(`Playlist ${shortId(link.spotifyPlaylistId)}: ${link.lastError}`);
        results.push({ link, status: 'error' });
      } finally {
        log.endGroup();
        await saveState(env.stateFile, env.stateKey, state);
      }
    }
  }

  await saveState(env.stateFile, env.stateKey, state);
  writeSummary(results);
  if (results.some((r) => r.status === 'error')) process.exitCode = 1;
}

async function syncLink(
  env: Env,
  state: State,
  spotify: SpotifyClient,
  tidal: TidalClient,
  link: PlaylistLink,
): Promise<LinkResult> {
  const snap = await spotify.playlistSnapshot(link.spotifyPlaylistId);
  if (!env.force && snap.snapshot_id === link.lastSnapshotId) return { link, status: 'skipped' };

  const tracks = await spotify.playlistTracks(link.spotifyPlaylistId);

  // Resolve ISRCs, using the cache where it's fresh.
  const now = Date.now();
  const toLookup = new Set<string>();
  for (const t of tracks) {
    if (!t.isrc) continue;
    const cached = state.isrcCache[t.isrc];
    const stale =
      cached && !cached.tidalTrackId && now - Date.parse(cached.checkedAt) > MISS_RETRY_MS;
    if (!cached || stale) toLookup.add(t.isrc);
  }
  if (toLookup.size) {
    const found = await tidal.tracksByIsrc([...toLookup]);
    const checkedAt = new Date().toISOString();
    for (const isrc of toLookup) {
      state.isrcCache[isrc] = { tidalTrackId: found.get(isrc) ?? null, checkedAt };
    }
  }

  const desired: string[] = [];
  const unmatched: UnmatchedTrack[] = [];
  for (const t of tracks) {
    const id = t.isrc ? state.isrcCache[t.isrc]?.tidalTrackId : null;
    if (id) desired.push(id);
    else unmatched.push(t);
  }

  const current = await tidal.playlistEntries(link.tidalPlaylistId);
  const { toAdd, toRemove } = diffPlaylist(desired, current);
  if (toRemove.length) await tidal.removeEntries(link.tidalPlaylistId, toRemove);
  if (toAdd.length) await tidal.addTracks(link.tidalPlaylistId, toAdd);

  link.name = snap.name;
  link.lastSnapshotId = snap.snapshot_id;
  link.lastSyncedAt = new Date().toISOString();
  link.unmatched = unmatched;
  log.info(`+${toAdd.length} −${toRemove.length}, ${unmatched.length} unmatched`);
  return {
    link,
    status: 'synced',
    added: toAdd.length,
    removed: toRemove.length,
    unmatched: unmatched.length,
  };
}

function writeSummary(results: LinkResult[]) {
  // Deliberately no playlist or track names: Actions logs/summaries may be public.
  const rows = results.map(
    (r) =>
      `| ${shortId(r.link.spotifyPlaylistId)} | ${r.status} | ${r.added ?? '–'} | ${r.removed ?? '–'} | ${r.unmatched ?? '–'} |`,
  );
  summary(
    [
      '### SyncSaint run',
      '| Playlist | Status | Added | Removed | Unmatched |',
      '|---|---|---|---|---|',
      ...rows,
    ].join('\n'),
  );
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));

main().catch((err: unknown) => {
  log.error(errMsg(err));
  process.exit(1);
});
