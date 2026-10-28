import { DEFAULT_RATES } from '../types';

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** A = min(1, 2*(1-x)), B = min(1, 2*x). Center keeps both decks at full. */
export function transitionGain(x: number): { a: number; b: number } {
  const position = clamp01(x);
  return {
    a: Math.min(1, 2 * (1 - position)),
    b: Math.min(1, 2 * position),
  };
}

export function effectiveGain(transition: number, volume: number): number {
  return clamp01(transition) * clamp01(volume);
}

export function formatPercent(gain: number): string {
  return String(Math.round(clamp01(gain) * 100));
}

export function nearestPlaybackRate(desired: number, available: number[] = DEFAULT_RATES): number {
  const rates = available.length ? available : [1];
  return rates.reduce((best, rate) => (Math.abs(rate - desired) < Math.abs(best - desired) ? rate : best));
}

export function nudgedRate(current: number, direction: -1 | 1, available: number[] = DEFAULT_RATES): number {
  const sorted = [...(available.length ? available : [current])].sort((a, b) => a - b);
  if (direction > 0) {
    return sorted.find((rate) => rate > current + 0.001) ?? sorted[sorted.length - 1];
  }
  const lower = [...sorted].reverse().find((rate) => rate < current - 0.001);
  return lower ?? sorted[0];
}
