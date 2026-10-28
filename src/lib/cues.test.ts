import { describe, expect, it } from 'vitest';
import { clearCue, emptyCues, parseHotCues, setCue } from './cues';

describe('hot cues', () => {
  it('starts empty and sets or clears a slot', () => {
    expect(emptyCues()).toEqual([null, null, null, null]);
    const set = setCue(emptyCues(), 2, 12.5);
    expect(set).toEqual([null, null, 12.5, null]);
    expect(clearCue(set, 2)).toEqual([null, null, null, null]);
  });

  it('ignores bad indexes and times, and parses stored rows', () => {
    const base = emptyCues();
    expect(setCue(base, -1, 1)).toBe(base);
    expect(setCue(base, 4, 1)).toBe(base);
    expect(setCue(base, 0, Number.NaN)).toBe(base);
    expect(setCue(base, 0, -1)).toBe(base);
    expect(parseHotCues(null)).toEqual(emptyCues());
    expect(parseHotCues([3, 'x', 9.2, -4, 99])).toEqual([3, null, 9.2, null]);
  });
});
