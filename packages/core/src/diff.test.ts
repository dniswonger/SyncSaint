import { describe, expect, it } from 'vitest';
import { diffPlaylist } from './diff';

const e = (trackId: string, itemId = `i-${trackId}`) => ({ trackId, itemId });

describe('diffPlaylist', () => {
  it('adds missing tracks in source order and removes extras', () => {
    const d = diffPlaylist(['a', 'b', 'c'], [e('b'), e('x')]);
    expect(d.toAdd).toEqual(['a', 'c']);
    expect(d.toRemove).toEqual([e('x')]);
  });

  it('removes duplicate entries on TIDAL and dedupes the source', () => {
    const d = diffPlaylist(['a', 'a'], [e('a', '1'), e('a', '2')]);
    expect(d.toAdd).toEqual([]);
    expect(d.toRemove).toEqual([e('a', '2')]);
  });

  it('is a no-op when already in sync', () => {
    expect(diffPlaylist(['a', 'b'], [e('a'), e('b')])).toEqual({ toAdd: [], toRemove: [] });
  });
});
