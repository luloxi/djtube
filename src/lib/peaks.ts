export const PEAK_BUCKETS = 1000;

export function peakIndex(time: number, duration: number, buckets = PEAK_BUCKETS): number {
  if (!(duration > 0) || buckets <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, time / duration));
  if (ratio >= 1) return buckets - 1;
  return Math.min(buckets - 1, Math.floor(ratio * buckets));
}

export function paintPeaks(
  peaks: number[],
  fromTime: number,
  toTime: number,
  duration: number,
  amplitude: number,
): number[] {
  const next = peaks.slice();
  if (!next.length || !(duration > 0)) return next;
  const start = peakIndex(Math.min(fromTime, toTime), duration, next.length);
  const end = peakIndex(Math.max(fromTime, toTime), duration, next.length);
  const level = Math.max(0, amplitude);
  for (let i = start; i <= end; i += 1) next[i] = Math.max(next[i] ?? 0, level);
  return next;
}

export function mergePeaks(previous: number[] | null, incoming: number[]): number[] {
  if (!previous || previous.length !== incoming.length) return incoming.slice();
  return incoming.map((value, index) => (value > 0.004 ? Math.max(previous[index] ?? 0, value) : (previous[index] ?? 0)));
}

export function slicePeaks(peaks: number[], duration: number, start: number, end: number): number[] {
  if (!peaks.length || !(duration > 0) || !(end > start)) return [];
  const from = peakIndex(start, duration, peaks.length);
  const to = peakIndex(end, duration, peaks.length);
  return peaks.slice(from, Math.max(from + 1, to + 1));
}

export function maxPeak(peaks: number[]): number {
  let max = 0;
  for (const value of peaks) if (value > max) max = value;
  return max;
}
