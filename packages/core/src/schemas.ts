import { z } from 'zod';

// ---- Link codes: what the web app seals and the "Add link" workflow unseals ----

export const SpotifyOwnerLinkSchema = z.object({
  kind: z.literal('spotify-owner'),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  owner: z.object({
    spotifyUserId: z.string().min(1),
    displayName: z.string(),
    refreshToken: z.string().min(1),
  }),
  playlists: z
    .array(z.object({ id: z.string().min(1), name: z.string() }))
    .min(1)
    .max(50),
});
export type SpotifyOwnerLink = z.infer<typeof SpotifyOwnerLinkSchema>;

export const TidalAccountLinkSchema = z.object({
  kind: z.literal('tidal-account'),
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  userId: z.string().optional(),
  countryCode: z.string().length(2).default('US'),
  refreshToken: z.string().min(1),
});
export type TidalAccountLink = z.infer<typeof TidalAccountLinkSchema>;

export const LinkCodeSchema = z.discriminatedUnion('kind', [
  SpotifyOwnerLinkSchema,
  TidalAccountLinkSchema,
]);
export type LinkCode = z.infer<typeof LinkCodeSchema>;

// ---- Persistent sync state (always stored encrypted) ----

export const UnmatchedTrackSchema = z.object({
  spotifyId: z.string().nullable(),
  name: z.string(),
  artists: z.array(z.string()),
  isrc: z.string().nullable(),
});
export type UnmatchedTrack = z.infer<typeof UnmatchedTrackSchema>;

export const PlaylistLinkSchema = z.object({
  spotifyPlaylistId: z.string(),
  spotifyOwnerId: z.string(),
  name: z.string(),
  tidalPlaylistId: z.string(),
  enabled: z.boolean().default(true),
  lastSnapshotId: z.string().nullable().default(null),
  lastSyncedAt: z.iso.datetime().nullable().default(null),
  lastError: z.string().nullable().default(null),
  unmatched: z.array(UnmatchedTrackSchema).default([]),
});
export type PlaylistLink = z.infer<typeof PlaylistLinkSchema>;

export const SpotifyOwnerSchema = z.object({
  displayName: z.string(),
  refreshToken: z.string(),
  addedAt: z.iso.datetime(),
  status: z.enum(['ok', 'revoked']).default('ok'),
});
export type SpotifyOwner = z.infer<typeof SpotifyOwnerSchema>;

export const IsrcCacheEntrySchema = z.object({
  tidalTrackId: z.string().nullable(),
  checkedAt: z.iso.datetime(),
});

export const StateSchema = z.object({
  version: z.literal(1),
  tidal: z
    .object({
      refreshToken: z.string(),
      userId: z.string().optional(),
      countryCode: z.string().length(2),
      connectedAt: z.iso.datetime(),
    })
    .nullable()
    .default(null),
  owners: z.record(z.string(), SpotifyOwnerSchema).default({}),
  links: z.array(PlaylistLinkSchema).default([]),
  isrcCache: z.record(z.string(), IsrcCacheEntrySchema).default({}),
});
export type State = z.infer<typeof StateSchema>;

export const emptyState = (): State => StateSchema.parse({ version: 1 });
