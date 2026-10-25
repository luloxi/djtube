import { describe, expect, it } from 'vitest';
import {
  bpmFromEnergy,
  bpmFromIntervals,
  bpmFromTaps,
  correctBpmForRate,
  estimateBpmFromChannel,
  foldToRange,
  highestPlaybackRate,
  tempoSearchRange,
} from './bpm';
import { paintPeaks, peakIndex } from './peaks';

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

  it('estimates 120 BPM from a click track', () => {
    const sampleRate = 8000;
    const bpm = 120;
    const seconds = 4;
    const channel = new Float32Array(sampleRate * seconds);
    const interval = Math.round((60 / bpm) * sampleRate);
    for (let i = 0; i < channel.length; i += interval) {
      channel[i] = 1;
      if (i + 1 < channel.length) channel[i + 1] = 0.4;
    }
    expect(estimateBpmFromChannel(channel, sampleRate)).toBeCloseTo(120, 0);
    const hop = Math.floor(sampleRate / 100);
    const energy: number[] = [];
    for (let i = 0; i < channel.length; i += hop) energy.push(channel[i] === 1 ? 1 : 0);
    expect(bpmFromEnergy(energy, sampleRate / hop)).toBeCloseTo(120, 0);
  });

  it('divides the heard tempo by the playback rate before folding', () => {
    // 128 BPM heard at 2× is 256. Folding 256 first yields 128, and dividing that yields 64.
    expect(correctBpmForRate(256, 2)).toBe(128);
    expect(correctBpmForRate(256, 2)).not.toBe(foldToRange(256) / 2);
    expect(correctBpmForRate(240, 2)).toBe(120);
    expect(correctBpmForRate(180, 2)).toBe(90);
    expect(correctBpmForRate(200, 2)).toBe(100);
    expect(correctBpmForRate(90, 2)).toBe(90);
    expect(correctBpmForRate(160, 1.25)).toBe(128);
    expect(correctBpmForRate(128, 1)).toBe(128);
    expect(correctBpmForRate(128, 0)).toBe(128);
    expect(correctBpmForRate(null, 2)).toBeNull();
    expect(correctBpmForRate(Number.NaN, 2)).toBeNull();
  });

  it('widens the detector window so a sped-up track is not halved twice', () => {
    expect(tempoSearchRange(1)).toEqual({ minTempo: 70, maxTempo: 180 });
    expect(tempoSearchRange(2)).toEqual({ minTempo: 140, maxTempo: 360 });
    expect(tempoSearchRange(1.5).minTempo).toBe(105);
    expect(tempoSearchRange(0).minTempo).toBe(70);
    const heard = 128 * 2;
    const range = tempoSearchRange(2);
    expect(heard).toBeGreaterThanOrEqual(range.minTempo);
    expect(heard).toBeLessThanOrEqual(range.maxTempo);
    expect(highestPlaybackRate([0.25, 1, 1.5, 2])).toBe(2);
    expect(highestPlaybackRate([1, 1.25])).toBe(1.25);
    expect(highestPlaybackRate([])).toBe(2);
    expect(highestPlaybackRate([Number.NaN, 0, -1])).toBe(2);
  });

  it('paints amplitude into the buckets the playhead crosses', () => {
    const peaks = new Array(1000).fill(0);
    const painted = paintPeaks(peaks, 10, 12, 100, 0.5);
    expect(peakIndex(10, 100, 1000)).toBe(100);
    expect(painted[100]).toBe(0.5);
    expect(painted[119]).toBe(0.5);
    expect(painted[99]).toBe(0);
    expect(painted[130]).toBe(0);
  });
});
