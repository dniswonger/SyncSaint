import type { TidalPlaylistEntry } from './tidal';

export interface PlaylistDiff {
  toAdd: string[];
  toRemove: TidalPlaylistEntry[];
}

/**
 * One-way mirror: make the TIDAL playlist contain exactly `desiredTrackIds` (deduplicated).
 * New tracks are appended in source order; removed tracks (and duplicates, and anything added
 * by hand on TIDAL) are deleted. Reordering is not mirrored yet.
 */
export function diffPlaylist(
  desiredTrackIds: string[],
  current: TidalPlaylistEntry[],
): PlaylistDiff {
  const desired = new Set(desiredTrackIds);
  const kept = new Set<string>();
  const toRemove: TidalPlaylistEntry[] = [];

  for (const entry of current) {
    if (desired.has(entry.trackId) && !kept.has(entry.trackId)) kept.add(entry.trackId);
    else toRemove.push(entry);
  }

  const toAdd: string[] = [];
  for (const id of desiredTrackIds) {
    if (!kept.has(id)) {
      kept.add(id);
      toAdd.push(id);
    }
  }
  return { toAdd, toRemove };
}
