import { describe, expect, it } from 'vitest';
import { analysisToMeta, metaToPut, parseAnalysisPut, preferAnalysis } from './analysis';
import type { AnalysisMeta } from '../types';

const peaks = [0.1, 0.2, 0.4, 0.2, 0.1, 0.3, 0.2, 0.1];

function meta(over: Partial<AnalysisMeta> = {}): AnalysisMeta {
  return {
    videoId: 'abcdefghijk',
    peaks,
    duration: 90,
    bpm: 120,
    beatOffset: 0.2,
    hasAudio: false,
    recordStart: 0,
    recordEnd: 90,
    updatedAt: '2026-10-28T00:00:00.000Z',
    ...over,
  };
}

describe('analysis records', () => {
  it('rejects a body that is not one video with a bounded grid', () => {
    expect(parseAnalysisPut(null)).toBeNull();
    expect(parseAnalysisPut({ videoId: 'short', bpm: 120, duration: 1, peaks })).toBeNull();
    expect(parseAnalysisPut({ videoId: 'abcdefghijk', bpm: 0, duration: 1, peaks })).toBeNull();
    expect(parseAnalysisPut({ videoId: 'abcdefghijk', bpm: 120, beatOffset: -1, duration: 1, peaks })).toBeNull();
    expect(parseAnalysisPut({ videoId: 'abcdefghijk', bpm: null, duration: 1, peaks: [] })).toBeNull();
    expect(parseAnalysisPut({ videoId: 'abcdefghijk', bpm: 120, duration: 10, peaks: [Number.NaN] })).toBeNull();
    const ok = parseAnalysisPut({ videoId: 'abcdefghijk', bpm: 128.24, beatOffset: 1.25, duration: 200, peaks: [0.123456] });
    expect(ok).toEqual({ videoId: 'abcdefghijk', bpm: 128.24, beatOffset: 1.25, duration: 200, peaks: [0.1235] });
  });

  it('keeps the newer copy and does not let the client name the account', () => {
    const local = meta();
    const remote = { ...metaToPut(local), peaks, updatedAt: '2026-10-28T01:00:00.000Z' };
    expect(preferAnalysis(local, remote)).toBe('remote');
    expect(preferAnalysis(meta({ updatedAt: '2026-10-28T02:00:00.000Z' }), remote)).toBe('local');
    expect(preferAnalysis(meta({ updatedAt: undefined }), remote)).toBe('remote');
    expect(preferAnalysis(local, null)).toBe('local');
    expect(preferAnalysis(null, null)).toBe('none');
    const round = analysisToMeta(remote, meta({ hasAudio: true, recordStart: 4, recordEnd: 20 }));
    expect(round.hasAudio).toBe(true);
    expect(round.recordStart).toBe(4);
    expect(round.bpm).toBe(120);
  });
});
