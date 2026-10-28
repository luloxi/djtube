import { describe, expect, it } from 'vitest';
import { impulseEnvelope, pitchRatio } from './voice';

describe('voice', () => {
  it('moves pitch by semitones and stays inside an octave', () => {
    expect(pitchRatio(0)).toBe(1);
    expect(pitchRatio(12)).toBe(2);
    expect(pitchRatio(-12)).toBe(0.5);
    expect(pitchRatio(3)).toBeCloseTo(2 ** (3 / 12), 5);
    expect(pitchRatio(40)).toBe(2);
    expect(pitchRatio(-40)).toBe(0.5);
  });

  it('decays the reverb impulse', () => {
    expect(impulseEnvelope(0, 100, 2)).toBeCloseTo(1, 5);
    expect(impulseEnvelope(99, 100, 2)).toBeCloseTo(0, 5);
    expect(impulseEnvelope(40, 100, 3)).toBeLessThan(impulseEnvelope(10, 100, 3));
    expect(impulseEnvelope(0, 1, 2)).toBe(0);
  });
});
