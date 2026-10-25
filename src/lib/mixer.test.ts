import { describe, expect, it } from 'vitest';
import { DEFAULT_RATES } from '../types';
import {
  effectiveGain,
  formatPercent,
  nearestPlaybackRate,
  nudgedRate,
  syncPlaybackRate,
  transitionGain,
} from './mixer';

describe('transition gain', () => {
  it('is full A on the left, both full in the center, full B on the right', () => {
    expect(transitionGain(0)).toEqual({ a: 1, b: 0 });
    expect(transitionGain(0.5)).toEqual({ a: 1, b: 1 });
    expect(transitionGain(1)).toEqual({ a: 0, b: 1 });
    expect(transitionGain(0.25)).toEqual({ a: 1, b: 0.5 });
    expect(transitionGain(0.75)).toEqual({ a: 0.5, b: 1 });
  });

  it('clamps the fader and multiplies by the deck volume', () => {
    expect(transitionGain(-2)).toEqual({ a: 1, b: 0 });
    expect(transitionGain(3)).toEqual({ a: 0, b: 1 });
    expect(effectiveGain(1, 0.4)).toBeCloseTo(0.4);
    expect(effectiveGain(0.5, 0)).toBe(0);
    expect(formatPercent(effectiveGain(1, 0.96))).toBe('96');
  });
});

describe('sync rate', () => {
  it('suggests the rate that moves one deck onto the other tempo', () => {
    expect(syncPlaybackRate(128, 120)).toBeCloseTo(0.938, 3);
    expect(syncPlaybackRate(100, 140)).toBeCloseTo(1.4, 3);
    expect(syncPlaybackRate(0, 120)).toBeNull();
    expect(syncPlaybackRate(128, Number.NaN)).toBeNull();
  });

  it('snaps to a rate the YouTube player actually exposes', () => {
    expect(nearestPlaybackRate(0.938, DEFAULT_RATES)).toBe(1);
    expect(nearestPlaybackRate(1.4, DEFAULT_RATES)).toBe(1.5);
    expect(nudgedRate(1, 1, DEFAULT_RATES)).toBe(1.25);
    expect(nudgedRate(1, -1, DEFAULT_RATES)).toBe(0.75);
    expect(nudgedRate(2, 1, DEFAULT_RATES)).toBe(2);
  });
});
