import { describe, expect, it } from 'vitest';
import { defaultCutName, nearHandle, orderRange, placeOf, rowCount, rowSpans, timeAt } from './cut';

describe('cut rows', () => {
  it('counts rows, rounding the last partial one up', () => {
    expect(rowCount(0)).toBe(0);
    expect(rowCount(10)).toBe(1);
    expect(rowCount(25)).toBe(3);
  });

  it('maps a moment to a row and back', () => {
    expect(placeOf(23.5)).toEqual({ row: 2, frac: 0.35 });
    expect(timeAt(2, 0.35, 200, 20)).toBe(23.5);
  });

  it('clamps to the rows and the duration', () => {
    expect(timeAt(-3, 0.5, 25, 3)).toBe(5);
    expect(timeAt(9, 1, 25, 3)).toBe(25);
    expect(timeAt(0, -1, 25, 3)).toBe(0);
    expect(timeAt(0, 0.5, 0, 0)).toBe(0);
  });

  it('orders a range dragged backwards', () => {
    expect(orderRange(30, 12)).toEqual({ start: 12, end: 30 });
  });

  it('splits a selection across the rows it covers', () => {
    const spans = rowSpans(8, 23);
    expect(spans.map((s) => s.row)).toEqual([0, 1, 2]);
    expect(spans[0]).toEqual({ row: 0, from: 0.8, to: 1 });
    expect(spans[1]).toEqual({ row: 1, from: 0, to: 1 });
    expect(spans[2]?.to).toBeCloseTo(0.3);
    expect(rowSpans(5, 5)).toEqual([]);
  });

  it('finds the handle under a press on the same row only', () => {
    const range = { start: 8, end: 23 };
    expect(nearHandle(8.2, range, 0.5)).toBe('start');
    expect(nearHandle(22.9, range, 0.5)).toBe('end');
    expect(nearHandle(15, range, 0.5)).toBeNull();
    expect(nearHandle(12.1, { start: 12, end: 12.4 }, 0.5)).toBe('start');
    expect(nearHandle(3, null, 1)).toBeNull();
  });

  it('names a cut after the song and its start', () => {
    expect(defaultCutName('Song', 75)).toBe('Song 1:15');
    expect(defaultCutName('', 5)).toBe('Corte 0:05');
  });
});
