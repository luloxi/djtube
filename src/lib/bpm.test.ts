import { describe, expect, it } from 'vitest';
import { bpmFromIntervals, bpmFromTaps, foldToRange } from './bpm';

describe('BPM math', () => {
  it('folds octave errors into a DJ range', () => {
    expect(foldToRange(70)).toBe(140);
    expect(foldToRange(200)).toBe(100);
    expect(foldToRange(128)).toBe(128);
  });

  it('reads BPM from beat intervals and from taps', () => {
    expect(bpmFromIntervals([0.5, 0.5, 0.5, 0.5])).toBe(120);
    expect(bpmFromIntervals([1, 1, 1, 1])).toBe(120);
    expect(bpmFromIntervals([0.1])).toBeNull();
    const start = 1_000;
    const taps = [0, 1, 2, 3, 4].map((beat) => start + beat * 500);
    expect(bpmFromTaps(taps)).toBe(120);
  });
});
