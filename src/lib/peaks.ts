export const PEAK_BUCKETS = 1000;

export function peakIndex(time: number, duration: number, buckets = PEAK_BUCKETS): number {
  if (!(duration > 0) || buckets <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, time / duration));
  if (ratio >= 1) return buckets - 1;
  return Math.min(buckets - 1, Math.floor(ratio * buckets));
}

export function slicePeaks(peaks: number[], duration: number, start: number, end: number): number[] {
  if (!peaks.length || !(duration > 0) || !(end > start)) return [];
  const from = peakIndex(start, duration, peaks.length);
  const to = peakIndex(end, duration, peaks.length);
  return peaks.slice(from, Math.max(from + 1, to + 1));
}
