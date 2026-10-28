import { nearestPlaybackRate } from './mixer';

/** 33⅓ RPM. One turn of the disc is this many seconds of the track. */
export const DISC_RPM = 100 / 3;
export const SECONDS_PER_REV = 60 / DISC_RPM;

export function discAngle(mediaTime: number): number {
  if (!Number.isFinite(mediaTime)) return 0;
  return (mediaTime / SECONDS_PER_REV) * 360;
}

export function jogTarget(startTime: number, deltaAngleDeg: number): number {
  const start = Number.isFinite(startTime) ? startTime : 0;
  const delta = Number.isFinite(deltaAngleDeg) ? deltaAngleDeg : 0;
  return Math.max(0, start + (delta / 360) * SECONDS_PER_REV);
}

/**
 * Forward drag raises the rate so the audio keeps up between seeks.
 * Backward drag pauses: YouTube cannot play in reverse, so the seek does the work.
 */
export function jogTransport(
  turnsPerSec: number,
  available: number[],
  base: number,
): { rate: number | null; pause: boolean } {
  if (!Number.isFinite(turnsPerSec)) return { rate: base, pause: false };
  if (turnsPerSec < -0.2) return { rate: null, pause: true };
  if (turnsPerSec > 0.35) {
    const desired = Math.min(2, Math.max(1, 1 + turnsPerSec * 0.45));
    return { rate: nearestPlaybackRate(desired, available), pause: false };
  }
  return { rate: base, pause: false };
}
