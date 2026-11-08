/**
 * Minimal TIDAL API v2 client (JSON:API, https://openapi.tidal.com/v2).
 * Shapes checked against the published OpenAPI spec, v1.10.239.
 */
import { z } from 'zod';
import { fetchJson, formBody } from './http';

const AUTH = 'https://login.tidal.com/authorize';
const TOKEN = 'https://auth.tidal.com/v1/oauth2/token';
const API = 'https://openapi.tidal.com/v2';
const JSONAPI = 'application/vnd.api+json';

export const TIDAL_SCOPES = ['playlists.read', 'playlists.write', 'user.read'];

const TokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  user_id: z.union([z.string(), z.number()]).optional(),
});
export interface TidalTokens {
  accessToken: string;
  refreshToken: string;
  userId?: string;
}

export function tidalAuthorizeUrl(opts: {
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
    scope: TIDAL_SCOPES.join(' '),
  });
  return `${AUTH}?${p}`;
}

function toTokens(raw: unknown, fallbackRefresh?: string): TidalTokens {
  const t = TokenResponse.parse(raw);
  const refreshToken = t.refresh_token ?? fallbackRefresh;
  if (!refreshToken) throw new Error('TIDAL did not return a refresh token');
  return {
    accessToken: t.access_token,
    refreshToken,
    ...(t.user_id !== undefined ? { userId: String(t.user_id) } : {}),
  };
}

export async function tidalExchangeCode(opts: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<TidalTokens> {
  const raw = await fetchJson(TOKEN, {
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
  return toTokens(raw);
}

export async function tidalRefresh(clientId: string, refreshToken: string): Promise<TidalTokens> {
  const raw = await fetchJson(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  return toTokens(raw, refreshToken);
}

const Resource = z.object({ id: z.string(), type: z.string() });
const TrackResource = Resource.extend({
  attributes: z.object({ isrc: z.string().optional(), title: z.string().optional() }).optional(),
});
const PlaylistItem = Resource.extend({
  meta: z.object({ itemId: z.string().optional() }).optional(),
});
const Links = z.object({
  next: z.string().optional(),
  meta: z.object({ nextCursor: z.string().optional() }).optional(),
});

export interface TidalPlaylistEntry {
  trackId: string;
  /** Per-entry id; required for removal. */
  itemId: string;
}

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, (i + 1) * size),
  );

export class TidalClient {
  constructor(
    private readonly accessToken: string,
    private readonly countryCode: string,
  ) {}

  private req<T>(
    method: string,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = path.startsWith('http') ? path : `${API}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: JSONAPI,
    };
    if (body !== undefined) headers['Content-Type'] = JSONAPI;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    return fetchJson(url, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }).then((r) => schema.parse(r));
  }

  /** Look up tracks by ISRC (max 20 per request). Returns ISRC -> first matching TIDAL track id. */
  async tracksByIsrc(isrcs: string[]): Promise<Map<string, string>> {
    const found = new Map<string, string>();
    for (const batch of chunk([...new Set(isrcs)], 20)) {
      const p = new URLSearchParams({ countryCode: this.countryCode });
      for (const isrc of batch) p.append('filter[isrc]', isrc);
      const res = await this.req('GET', `/tracks?${p}`, z.object({ data: z.array(TrackResource) }));
      for (const t of res.data) {
        const isrc = t.attributes?.isrc?.toUpperCase();
        if (isrc && !found.has(isrc)) found.set(isrc, t.id);
      }
    }
    return found;
  }

  async createPlaylist(name: string, accessType: 'PUBLIC' | 'UNLISTED' = 'UNLISTED') {
    const res = await this.req(
      'POST',
      '/playlists',
      z.object({ data: Resource }),
      { data: { type: 'playlists', attributes: { name: name.slice(0, 250), accessType } } },
      crypto.randomUUID(),
    );
    return res.data.id;
  }

  async playlistEntries(playlistId: string): Promise<TidalPlaylistEntry[]> {
    const out: TidalPlaylistEntry[] = [];
    const base = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;
    let cursor: string | undefined;
    do {
      const p = new URLSearchParams({ countryCode: this.countryCode });
      if (cursor) p.set('page[cursor]', cursor);
      const res = await this.req(
        'GET',
        `${base}?${p}`,
        z.object({ data: z.array(PlaylistItem).default([]), links: Links }),
      );
      for (const item of res.data) {
        if (item.type === 'tracks' && item.meta?.itemId) {
          out.push({ trackId: item.id, itemId: item.meta.itemId });
        }
      }
      cursor = res.links.meta?.nextCursor;
    } while (cursor);
    return out;
  }

  async addTracks(playlistId: string, trackIds: string[]): Promise<void> {
    const path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;
    for (const batch of chunk(trackIds, 50)) {
      await this.req(
        'POST',
        path,
        z.unknown(),
        {
          data: batch.map((id) => ({ type: 'tracks', id })),
          meta: { onDuplicates: 'SKIP' },
        },
        crypto.randomUUID(),
      );
    }
  }

  async removeEntries(playlistId: string, entries: TidalPlaylistEntry[]): Promise<void> {
    const path = `/playlists/${encodeURIComponent(playlistId)}/relationships/items`;
    for (const batch of chunk(entries, 50)) {
      await this.req('DELETE', path, z.unknown(), {
        data: batch.map((e) => ({ type: 'tracks', id: e.trackId, meta: { itemId: e.itemId } })),
      });
    }
  }
}
