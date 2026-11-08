/**
 * Redeem a sealed link code produced by the web app (env LINK_CODE):
 *  - "tidal-account": connects your TIDAL account (do this first)
 *  - "spotify-owner": stores a playlist owner's Spotify token and creates a TIDAL mirror for
 *    each playlist they chose to share
 */
import {
  LinkCodeSchema,
  TidalClient,
  spotifyRefresh,
  tidalRefresh,
  unseal,
  type State,
} from '@syncsaint/core';
import { loadEnv, type Env } from '../env';
import { log, mask, shortId, summary } from '../log';
import { loadState, saveState } from '../stateStore';

const MAX_CODE_AGE_DAYS = 14;

async function main() {
  const env = loadEnv();
  const code = process.env.LINK_CODE?.trim();
  if (!code) throw new Error('LINK_CODE is empty');
  mask(code);

  const link = LinkCodeSchema.parse(await unseal(env.privateJwk, code));
  const ageDays = (Date.now() - Date.parse(link.createdAt)) / 86_400_000;
  if (ageDays > MAX_CODE_AGE_DAYS) {
    throw new Error(`Link code is ${Math.floor(ageDays)} days old; ask for a fresh one`);
  }

  const state = await loadState(env.stateFile, env.stateKey);

  if (link.kind === 'tidal-account') {
    mask(link.refreshToken);
    // Refresh immediately: proves the token works and stores the rotated one.
    const tokens = await tidalRefresh(env.tidalClientId, link.refreshToken);
    mask(tokens.accessToken);
    mask(tokens.refreshToken);
    state.tidal = {
      refreshToken: tokens.refreshToken,
      countryCode: link.countryCode,
      connectedAt: new Date().toISOString(),
      ...((tokens.userId ?? link.userId) ? { userId: tokens.userId ?? link.userId } : {}),
    };
    await saveState(env.stateFile, env.stateKey, state);
    summary('### ✅ TIDAL account connected');
    return;
  }

  await addOwner(env, state, link);
}

async function addOwner(
  env: Env,
  state: State,
  link: Extract<ReturnType<typeof LinkCodeSchema.parse>, { kind: 'spotify-owner' }>,
) {
  if (!state.tidal) throw new Error('Connect your TIDAL account first (redeem a TIDAL link code)');
  mask(link.owner.refreshToken);

  const spotify = await spotifyRefresh(env.spotifyClientId, link.owner.refreshToken);
  mask(spotify.accessToken);
  mask(spotify.refreshToken);
  state.owners[link.owner.spotifyUserId] = {
    displayName: link.owner.displayName,
    refreshToken: spotify.refreshToken,
    addedAt: new Date().toISOString(),
    status: 'ok',
  };

  const tidalTokens = await tidalRefresh(env.tidalClientId, state.tidal.refreshToken);
  mask(tidalTokens.accessToken);
  mask(tidalTokens.refreshToken);
  state.tidal.refreshToken = tidalTokens.refreshToken;
  // Persist rotated tokens before doing anything that might fail.
  await saveState(env.stateFile, env.stateKey, state);

  const tidal = new TidalClient(tidalTokens.accessToken, state.tidal.countryCode);
  let created = 0;
  for (const p of link.playlists) {
    const existing = state.links.find((l) => l.spotifyPlaylistId === p.id);
    if (existing) {
      existing.spotifyOwnerId = link.owner.spotifyUserId;
      existing.enabled = true;
      continue;
    }
    const tidalPlaylistId = await tidal.createPlaylist(p.name);
    state.links.push({
      spotifyPlaylistId: p.id,
      spotifyOwnerId: link.owner.spotifyUserId,
      name: p.name,
      tidalPlaylistId,
      enabled: true,
      lastSnapshotId: null,
      lastSyncedAt: null,
      lastError: null,
      unmatched: [],
    });
    created++;
    // Save after each creation so a failure doesn't orphan TIDAL playlists.
    await saveState(env.stateFile, env.stateKey, state);
    log.info(`Created TIDAL mirror for playlist ${shortId(p.id)}`);
  }
  await saveState(env.stateFile, env.stateKey, state);
  summary(
    `### ✅ Owner linked\n${link.playlists.length} playlist(s) shared, ${created} new TIDAL playlist(s) created. They'll fill on the next sync run.`,
  );
}

main().catch((err: unknown) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
