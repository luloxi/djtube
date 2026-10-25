/** Fold a detected tempo into the range DJs usually read (80–160). */
export function foldToRange(bpm: number, min = 80, max = 160): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return bpm;
  let value = bpm;
  let guard = 0;
  while (value < min && guard < 8) {
    value *= 2;
    guard += 1;
  }
  while (value > max && guard < 16) {
    value /= 2;
    guard += 1;
  }
  return Math.round(value * 10) / 10;
}

type BpmOptions = { fold?: boolean };

export function bpmFromIntervals(intervalsSec: number[], options?: BpmOptions): number | null {
  const fold = options?.fold !== false;
  const minInterval = fold ? 0.28 : 0.12;
  const bpms = intervalsSec
    .filter((seconds) => seconds >= minInterval && seconds <= 1.5)
    .map((seconds) => (fold ? foldToRange(60 / seconds) : 60 / seconds))
    .filter((bpm) => (fold ? bpm >= 70 && bpm <= 180 : bpm >= 40 && bpm <= 420));
  if (bpms.length < 3) return null;
  const sorted = [...bpms].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const rounded = Math.round(median * 10) / 10;
  return fold ? foldToRange(rounded) : rounded;
}

export function bpmFromTaps(timesMs: number[]): number | null {
  if (timesMs.length < 2) return null;
  const intervals: number[] = [];
  for (let i = 1; i < timesMs.length; i += 1) {
    intervals.push((timesMs[i] - timesMs[i - 1]) / 1000);
  }
  const recent = intervals.slice(-6).filter((seconds) => seconds > 0.2 && seconds < 2);
  if (!recent.length) return null;
  const average = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  return foldToRange(60 / average);
}

/** Positive energy differences → inter-onset intervals → BPM. `envelopeHz` is the envelope sample rate. */
export function bpmFromEnergy(energy: number[], envelopeHz: number, options?: BpmOptions): number | null {
  if (energy.length < envelopeHz || !(envelopeHz > 0)) return null;
  const fold = options?.fold !== false;
  const flux: number[] = [];
  for (let i = 1; i < energy.length; i += 1) {
    flux.push(Math.max(0, energy[i] - energy[i - 1]));
  }
  const mean = flux.reduce((sum, value) => sum + value, 0) / flux.length;
  const threshold = Math.max(mean * 1.4, 1e-8);
  const minGap = Math.floor(envelopeHz * (fold ? 0.28 : 0.12));
  const peaks: number[] = [];
  let last = -minGap;
  for (let i = 1; i < flux.length - 1; i += 1) {
    if (i - last < minGap) continue;
    if (flux[i] >= threshold && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      peaks.push(i);
      last = i;
    }
  }
  if (peaks.length < 4) return null;
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i += 1) {
    intervals.push((peaks[i] - peaks[i - 1]) / envelopeHz);
  }
  return bpmFromIntervals(intervals, options);
}

export function estimateBpmFromChannel(channel: Float32Array, sampleRate: number, options?: BpmOptions): number | null {
  if (!(sampleRate > 0) || channel.length < sampleRate * 2) return null;
  const hop = Math.max(1, Math.floor(sampleRate / 100));
  const energy: number[] = [];
  for (let i = 0; i < channel.length; i += hop) {
    let sum = 0;
    const end = Math.min(channel.length, i + hop);
    for (let j = i; j < end; j += 1) sum += channel[j] * channel[j];
    energy.push(sum / (end - i));
  }
  return bpmFromEnergy(energy, sampleRate / hop, options);
}

/** YouTube's fastest offered rate. Playback at this speed is what the sync tab analyzes. */
export function highestPlaybackRate(rates: readonly number[] | null | undefined, fallback = 2): number {
  let best = 0;
  for (const rate of rates ?? []) {
    if (Number.isFinite(rate) && rate > best) best = rate;
  }
  return best > 0 ? best : fallback;
}

/**
 * Tempo window for audio that was heard at `playbackRate`.
 * A 128 BPM track at 2× is heard near 256, so the detector must search that
 * high. Folding into 80–170 first and then dividing would halve the tempo again.
 */
export function tempoSearchRange(playbackRate: number, min = 70, max = 180): { minTempo: number; maxTempo: number } {
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  return {
    minTempo: Math.round(min * rate * 100) / 100,
    maxTempo: Math.round(max * rate * 100) / 100,
  };
}

/** Divide out the playback rate, then fold into the usual DJ range. */
export function correctBpmForRate(detectedBpm: number | null | undefined, playbackRate: number): number | null {
  if (detectedBpm == null || !Number.isFinite(detectedBpm) || detectedBpm <= 0) return null;
  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const corrected = foldToRange(detectedBpm / rate);
  if (!Number.isFinite(corrected) || corrected <= 0) return null;
  return corrected;
}
