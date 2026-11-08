/**
 * Minimal Spotify Web API client, written against the post-February-2026 Development Mode API:
 *  - playlist tracks live at /playlists/{id}/items, and each entry's track is under `item`
 *    (older responses used `track`; both are accepted)
 *  - items are only returned for playlists the token's user owns or collaborates on, which is
 *    why SyncSaint reads each playlist with its *owner's* token.
 */
import { z } from 'zod';
import { fetchJson, formBody } from './http';

const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

export const SPOTIFY_OWNER_SCOPES = ['playlist-read-private', 'playlist-read-collaborative'];

const TokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});
export interface SpotifyTokens {
  accessToken: string;
  /** Spotify may rotate refresh tokens; always persist this value. */
  refreshToken: string;
}

export function spotifyAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: opts.codeChallenge,
    state: opts.state,
    scope: SPOTIFY_OWNER_SCOPES.join(' '),
  });
  return `${ACCOUNTS}/authorize?${p}`;
}

export async function spotifyExchangeCode(opts: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<SpotifyTokens> {
  const raw = await fetchJson(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.codeVerifier,
    }),
  });
  const t = TokenResponse.parse(raw);
  if (!t.refresh_token) throw new Error('Spotify did not return a refresh token');
  return { accessToken: t.access_token, refreshToken: t.refresh_token };
}

export async function spotifyRefresh(
  clientId: string,
  refreshToken: string,
): Promise<SpotifyTokens> {
  const raw = await fetchJson(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  const t = TokenResponse.parse(raw);
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? refreshToken };
}

const Me = z.object({ id: z.string(), display_name: z.string().nullable().optional() });

const SimplePlaylist = z.object({
  id: z.string(),
  name: z.string(),
  collaborative: z.boolean().optional(),
  owner: z.object({ id: z.string() }),
  images: z
    .array(z.object({ url: z.string() }))
    .nullable()
    .optional(),
});
export type SpotifySimplePlaylist = z.infer<typeof SimplePlaylist>;

const Paged = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next: z.string().nullable() });

const Track = z.object({
  id: z.string().nullable(),
  type: z.string(),
  name: z.string(),
  external_ids: z.object({ isrc: z.string().optional() }).partial().optional(),
  artists: z.array(z.object({ name: z.string() })).default([]),
});
const PlaylistEntry = z.object({
  is_local: z.boolean().optional(),
  item: Track.nullable().optional(),
  track: Track.nullable().optional(),
});

export interface SpotifyTrack {
  spotifyId: string | null;
  name: string;
  artists: string[];
  isrc: string | null;
}

export class SpotifyClient {
  constructor(private readonly accessToken: string) {}

  private get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const url = path.startsWith('http') ? path : `${API}${path}`;
    return fetchJson(url, { headers: { Authorization: `Bearer ${this.accessToken}` } }).then((r) =>
      schema.parse(r),
    );
  }

  async me() {
    const m = await this.get('/me', Me);
    return { id: m.id, displayName: m.display_name ?? m.id };
  }

  /** Playlists the current user owns or collaborates on (the only ones Dev Mode can read). */
  async myReadablePlaylists(): Promise<SpotifySimplePlaylist[]> {
    const me = await this.me();
    const out: SpotifySimplePlaylist[] = [];
    let next: string | null = '/me/playlists?limit=50';
    while (next) {
      const page: { items: SpotifySimplePlaylist[]; next: string | null } = await this.get(
        next,
        Paged(SimplePlaylist),
      );
      out.push(...page.items.filter((p) => p.owner.id === me.id || p.collaborative));
      next = page.next;
    }
    return out;
  }

  async playlistSnapshot(playlistId: string) {
    return this.get(
      `/playlists/${encodeURIComponent(playlistId)}?fields=snapshot_id,name`,
      z.object({ snapshot_id: z.string(), name: z.string() }),
    );
  }

  /** All tracks in a playlist, in order. Local files and podcast episodes are skipped. */
  async playlistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    const out: SpotifyTrack[] = [];
    let next: string | null = `/playlists/${encodeURIComponent(playlistId)}/items?limit=50`;
    while (next) {
      const page: { items: z.infer<typeof PlaylistEntry>[]; next: string | null } = await this.get(
        next,
        Paged(PlaylistEntry),
      );
      for (const entry of page.items) {
        const t = entry.item ?? entry.track;
        if (!t || entry.is_local || t.type !== 'track') continue;
        out.push({
          spotifyId: t.id,
          name: t.name,
          artists: t.artists.map((a) => a.name),
          isrc: t.external_ids?.isrc?.toUpperCase() ?? null,
        });
      }
      next = page.next;
    }
    return out;
  }
}
