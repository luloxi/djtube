import { describe, expect, it } from 'vitest';
import { consumeDeckDrop, noteDeckDrop, removeQueuedTrack, restoreTrack, swipeCommit } from './library';

const a = { videoId: 'aaaaaaaaaaa', title: 'A', thumbnail: null };
const b = { videoId: 'bbbbbbbbbbb', title: 'B', thumbnail: null };
const c = { videoId: 'ccccccccccc', title: 'C', thumbnail: null };

describe('swipe a queue row', () => {
  it('removes only when the drag is long and the track is not on a deck', () => {
    expect(swipeCommit(20, false)).toBe('snap');
    expect(swipeCommit(-80, false)).toBe('remove');
    expect(swipeCommit(80, true)).toBe('snap');
    expect(swipeCommit(Number.NaN, false)).toBe('snap');
  });

  it('drops a free row and refuses one loaded on A or B', () => {
    expect(removeQueuedTrack([a, b, c], c.videoId, [a.videoId, b.videoId])).toEqual({
      tracks: [a, b],
      removed: { track: c, index: 2 },
    });
    expect(removeQueuedTrack([a, b, c], a.videoId, [a.videoId, null])).toEqual({
      tracks: [a, b, c],
      removed: null,
    });
    expect(removeQueuedTrack([a, b], 'missing', [])).toEqual({ tracks: [a, b], removed: null });
  });

  it('records a deck drop only until the swipe reads it', () => {
    expect(consumeDeckDrop()).toBe(false);
    noteDeckDrop();
    expect(consumeDeckDrop()).toBe(true);
    expect(consumeDeckDrop()).toBe(false);
  });

  it('puts an undone row back where it was', () => {
    const removed = removeQueuedTrack([a, b, c], b.videoId, []);
    expect(restoreTrack(removed.tracks, b, 1)).toEqual([a, b, c]);
    expect(restoreTrack([a, b], b, 0)).toEqual([a, b]);
    expect(restoreTrack([a], b, 9)).toEqual([a, b]);
  });
});
