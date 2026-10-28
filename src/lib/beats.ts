export type BeatMark = { time: number; downbeat: boolean };

/** Beat grid inside `[0, duration)`. `offset` itself is a downbeat. */
export function beatMarks(
  bpm: number | null | undefined,
  offset: number | null | undefined,
  duration: number,
  beatsPerBar = 4,
  limit = 800,
): BeatMark[] {
  if (bpm == null || !(bpm > 0) || offset == null || !Number.isFinite(offset) || !(duration > 0)) return [];
  const period = 60 / bpm;
  if (!(period >= 0.05) || !(period <= 2)) return [];
  const marks: BeatMark[] = [];
  const n0 = Math.ceil((0 - offset) / period - 1e-9);
  for (let n = n0; marks.length < limit; n += 1) {
    const time = offset + n * period;
    if (time >= duration - 1e-6) break;
    if (time < -1e-6) continue;
    const bar = ((n % beatsPerBar) + beatsPerBar) % beatsPerBar;
    marks.push({ time: Math.max(0, time), downbeat: bar === 0 });
  }
  return marks;
}

/** Media seconds until the next beat. Already on a beat returns 0. */
export function nextBeatDelay(time: number, bpm: number, offset: number): number {
  if (!(bpm > 0) || !Number.isFinite(time) || !Number.isFinite(offset)) return 0;
  const period = 60 / bpm;
  if (!(period > 0)) return 0;
  const phase = ((time - offset) % period + period) % period;
  if (phase < 0.03 || period - phase < 0.03) return 0;
  return period - phase;
}

/** Wait for the leader's next beat, then start. Speed matching is not part of this. */
export function planSyncedStart(input: {
  leaderTime: number;
  leaderBpm: number | null;
  leaderOffset: number | null;
  leaderRate: number;
  leaderPlaying: boolean;
}): { delayMs: number } | null {
  if (input.leaderBpm == null || !(input.leaderBpm > 0)) return null;
  const offset = input.leaderOffset ?? 0;
  const rate = input.leaderRate > 0 ? input.leaderRate : 1;
  const mediaDelay = input.leaderPlaying ? nextBeatDelay(input.leaderTime, input.leaderBpm, offset) : 0;
  return { delayMs: Math.round((mediaDelay / rate) * 1000) };
}
