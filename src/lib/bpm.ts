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

