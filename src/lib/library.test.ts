import { describe, expect, it } from 'vitest';
import { clearQueue } from './library';

const a = { videoId: 'aaaaaaaaaaa', title: 'A', thumbnail: null };
const b = { videoId: 'bbbbbbbbbbb', title: 'B', thumbnail: null };
const c = { videoId: 'ccccccccccc', title: 'C', thumbnail: null };

describe('clearQueue', () => {
  it('keeps tracks loaded on A or B and drops the rest', () => {
    expect(clearQueue([a, b, c], [a.videoId, b.videoId])).toEqual([a, b]);
    expect(clearQueue([a, b, c], [c.videoId, null])).toEqual([c]);
    expect(clearQueue([a, b, c], [null, undefined])).toEqual([]);
    expect(clearQueue([a, b, c], [])).toEqual([]);
  });

  it('does not duplicate when A and B hold the same track', () => {
    expect(clearQueue([a, b], [a.videoId, a.videoId])).toEqual([a]);
  });
});
