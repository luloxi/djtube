import { describe, expect, it } from 'vitest';
import { bpmFromEnergy, bpmFromIntervals, bpmFromTaps, estimateBpmFromChannel, foldToRange } from './bpm';
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
