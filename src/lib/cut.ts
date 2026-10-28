/** Seconds of audio on each row of the cut editor, like characters on a line of text. */
export const ROW_SECONDS = 10;
export const MIN_CUT = 0.1;

export function rowCount(duration: number, rowSeconds = ROW_SECONDS): number {
  return duration > 0 ? Math.ceil(duration / rowSeconds) : 0;
}

/** Row and horizontal fraction (0..1) of a moment. */
export function placeOf(time: number, rowSeconds = ROW_SECONDS): { row: number; frac: number } {
  const safe = Math.max(0, time);
  const row = Math.floor(safe / rowSeconds);
  return { row, frac: (safe - row * rowSeconds) / rowSeconds };
}

const round = (value: number) => Math.round(value * 100) / 100;

/** Moment under a point on the rows: clamped to the first and last row and to the track length. */
export function timeAt(row: number, frac: number, duration: number, rows: number, rowSeconds = ROW_SECONDS): number {
  if (!(duration > 0) || rows <= 0) return 0;
  const r = Math.min(rows - 1, Math.max(0, row));
  const f = Math.min(1, Math.max(0, frac));
  return round(Math.min(duration, (r + f) * rowSeconds));
}

export function orderRange(a: number, b: number): { start: number; end: number } {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

export type RowSpan = { row: number; from: number; to: number };

/** Part of [start, end] that falls on each row, as fractions of that row. */
export function rowSpans(start: number, end: number, rowSeconds = ROW_SECONDS): RowSpan[] {
  if (!(end > start)) return [];
  const first = Math.floor(start / rowSeconds);
  const last = Math.ceil(end / rowSeconds) - 1;
  const spans: RowSpan[] = [];
  for (let row = first; row <= last; row += 1) {
    const from = Math.max(start, row * rowSeconds);
    const to = Math.min(end, (row + 1) * rowSeconds);
    if (to > from) spans.push({ row, from: (from - row * rowSeconds) / rowSeconds, to: (to - row * rowSeconds) / rowSeconds });
  }
  return spans;
}

/** Which end of a selection a press lands on: same row and within `slack` seconds. */
export function nearHandle(time: number, range: { start: number; end: number } | null, slack: number, rowSeconds = ROW_SECONDS): 'start' | 'end' | null {
  if (!range) return null;
  const row = Math.floor(time / rowSeconds);
  const ds = Math.floor(range.start / rowSeconds) === row ? Math.abs(time - range.start) : Infinity;
  const de = Math.floor(range.end / rowSeconds) === row ? Math.abs(time - range.end) : Infinity;
  if (Math.min(ds, de) > slack) return null;
  return ds <= de ? 'start' : 'end';
}

export function defaultCutName(title: string, start: number): string {
  const m = Math.floor(start / 60);
  const s = Math.floor(start % 60);
  const clean = title.trim() || 'Corte';
  return `${clean.length > 40 ? `${clean.slice(0, 39)}…` : clean} ${m}:${String(s).padStart(2, '0')}`;
}
