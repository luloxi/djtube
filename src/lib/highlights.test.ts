import { describe, expect, it } from 'vitest';
import type { Highlight } from '../types';
import { addHighlight, exportHighlights, importHighlights, regionHasAudio, removeHighlight, searchHighlights } from './highlights';
import { slicePeaks } from './peaks';

const sample: Highlight = {
  id: 'h1',
  videoId: 'jNQXAC9IVRw',
  title: 'Me at the zoo',
  start: 2,
  end: 5,
  label: 'Entrada',
  peaks: [0.1, 0.4, 0.2],
};

describe('highlight store', () => {
  it('adds, searches, and deletes without touching the previous list', () => {
    const added = addHighlight([], sample);
    expect(added).toHaveLength(1);
    expect(searchHighlights(added, 'entra')).toEqual(added);
    expect(searchHighlights(added, 'zoo')).toEqual(added);
    expect(searchHighlights(added, 'nope')).toEqual([]);
    const removed = removeHighlight(added, 'h1');
    expect(removed).toEqual([]);
    expect(added).toHaveLength(1);
  });

  it('round-trips JSON and replaces the same id on import', () => {
    const json = exportHighlights([sample]);
    const renamed = { ...sample, label: 'Drop' };
    const merged = importHighlights([sample], exportHighlights([renamed]));
    expect(merged).toHaveLength(1);
    expect(merged[0].label).toBe('Drop');
    expect(importHighlights([], json)[0].title).toBe('Me at the zoo');
    expect(() => importHighlights([], '{')).toThrow(/invalid/);
    expect(() => importHighlights([], '{"highlights":[{"id":"x"}]}')).toThrow(/invalid/);
  });

  it('slices peaks for the region and knows when a clip can be downloaded', () => {
    const peaks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const slice = slicePeaks(peaks, 10, 2, 5);
    expect(slice[0]).toBe(2);
    expect(slice[slice.length - 1]).toBe(5);
    const coverage = { recordStart: 0, recordEnd: 30, hasAudio: true };
    expect(regionHasAudio(coverage, 2, 5)).toBe(true);
    expect(regionHasAudio(coverage, 28, 40)).toBe(false);
    expect(regionHasAudio({ ...coverage, hasAudio: false }, 2, 5)).toBe(false);
    expect(regionHasAudio(null, 2, 5)).toBe(false);
  });
});
