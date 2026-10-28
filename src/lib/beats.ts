/** Onset times in seconds, from the same flux peaks the BPM fallback uses. */
export function onsetTimes(channel: Float32Array, sampleRate: number): number[] {
  if (!(sampleRate > 0) || channel.length < sampleRate) return [];
  const hop = Math.max(1, Math.floor(sampleRate / 100));
  const energy: number[] = [];
  for (let i = 0; i < channel.length; i += hop) {
    let sum = 0;
    const end = Math.min(channel.length, i + hop);
    for (let j = i; j < end; j += 1) sum += channel[j] * channel[j];
    energy.push(sum / (end - i));
  }
  const envelopeHz = sampleRate / hop;
  const flux: number[] = [];
  for (let i = 1; i < energy.length; i += 1) flux.push(Math.max(0, energy[i] - energy[i - 1]));
  if (flux.length < 4) return [];
  const mean = flux.reduce((sum, value) => sum + value, 0) / flux.length;
  const threshold = Math.max(mean * 1.4, 1e-8);
  const minGap = Math.floor(envelopeHz * 0.12);
  const times: number[] = [];
  let last = -minGap;
  for (let i = 1; i < flux.length - 1; i += 1) {
    if (i - last < minGap) continue;
    if (flux[i] >= threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      times.push(i / envelopeHz);
      last = i;
    }
  }
  return times;
}

/**
 * Phase, in seconds, that lines `bpm` up with the onsets.
 * 0 is the start of the analyzed audio, not a downbeat index.
 */
export function beatOffsetFromOnsets(onsets: number[], bpm: number): number | null {
  if (onsets.length < 4 || !(bpm > 0)) return null;
  const period = 60 / bpm;
  if (!(period > 0.05) || period > 2) return null;
  const steps = 48;
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < steps; i += 1) {
    const offset = (period * i) / steps;
    let score = 0;
    for (const time of onsets) {
      const phase = ((time - offset) % period + period) % period;
      const dist = Math.min(phase, period - phase);
      score += 1 - dist / (period / 2);
    }
    if (score > bestScore) {
      bestScore = score;
      best = offset;
    }
  }
  return Math.round(best * 1000) / 1000;
}

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
