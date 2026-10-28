import type { AnalysisMeta } from '../types';

const VIDEO_ID = /^[\w-]{11}$/;

export type AnalysisRecord = {
  videoId: string;
  bpm: number | null;
  beatOffset: number | null;
  duration: number;
  peaks: number[];
  updatedAt: string;
};

export type AnalysisSummary = Omit<AnalysisRecord, 'peaks'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function finiteOrNull(value: unknown, min: number, max: number): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return undefined;
  return value;
}

/** Body of PUT /api/analysis. Email is never taken from the client. */
export function parseAnalysisPut(body: unknown): Omit<AnalysisRecord, 'updatedAt'> | null {
  if (!isRecord(body) || typeof body.videoId !== 'string' || !VIDEO_ID.test(body.videoId)) return null;
  const bpm = finiteOrNull(body.bpm, 1, 400);
  const beatOffset = finiteOrNull(body.beatOffset, 0, 24 * 3600);
  if (bpm === undefined || beatOffset === undefined) return null;
  if (typeof body.duration !== 'number' || !Number.isFinite(body.duration) || body.duration < 0 || body.duration > 24 * 3600) return null;
  if (!Array.isArray(body.peaks) || body.peaks.length > 1000) return null;
  const peaks: number[] = [];
  for (const peak of body.peaks) {
    if (typeof peak !== 'number' || !Number.isFinite(peak) || peak < -2 || peak > 64) return null;
    peaks.push(Math.round(peak * 10000) / 10000);
  }
  if (!peaks.length && bpm == null) return null;
  return { videoId: body.videoId, bpm, beatOffset, duration: body.duration, peaks };
}

export function analysisToMeta(record: AnalysisRecord, previous: AnalysisMeta | null = null): AnalysisMeta {
  return {
    videoId: record.videoId,
    peaks: record.peaks,
    duration: record.duration,
    bpm: record.bpm,
    beatOffset: record.beatOffset,
    updatedAt: record.updatedAt,
    hasAudio: previous?.videoId === record.videoId ? previous.hasAudio : false,
    recordStart: previous?.videoId === record.videoId ? previous.recordStart : 0,
    recordEnd: previous?.videoId === record.videoId ? previous.recordEnd : record.duration,
  };
}

export function metaToPut(meta: AnalysisMeta): Omit<AnalysisRecord, 'updatedAt'> {
  return {
    videoId: meta.videoId,
    bpm: meta.bpm,
    beatOffset: meta.beatOffset ?? null,
    duration: meta.duration,
    peaks: meta.peaks.slice(0, 1000),
  };
}

/** Which copy to keep. A local row with no timestamp loses to the server. */
export function preferAnalysis(local: AnalysisMeta | null, remote: AnalysisRecord | null): 'local' | 'remote' | 'none' {
  if (!local && !remote) return 'none';
  if (!remote) return 'local';
  if (!local) return 'remote';
  const localAt = Date.parse(local.updatedAt ?? '');
  const remoteAt = Date.parse(remote.updatedAt);
  if (!Number.isFinite(localAt)) return 'remote';
  if (!Number.isFinite(remoteAt)) return 'local';
  return remoteAt > localAt ? 'remote' : 'local';
}
