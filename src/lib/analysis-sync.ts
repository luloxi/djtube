import { analysisToMeta, metaToPut, preferAnalysis, type AnalysisRecord, type AnalysisSummary } from './analysis';
import { loadAnalysis, saveAnalysis } from './idb';
import type { AnalysisMeta } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function asRecord(value: unknown): AnalysisRecord | null {
  if (!isRecord(value) || typeof value.videoId !== 'string') return null;
  if (!Array.isArray(value.peaks)) return null;
  const peaks: number[] = [];
  for (const peak of value.peaks) {
    if (typeof peak !== 'number' || !Number.isFinite(peak)) return null;
    peaks.push(peak);
  }
  const bpm = value.bpm == null ? null : typeof value.bpm === 'number' && Number.isFinite(value.bpm) ? value.bpm : null;
  const beatOffset = value.beatOffset == null ? null : typeof value.beatOffset === 'number' && Number.isFinite(value.beatOffset) ? value.beatOffset : null;
  const duration = typeof value.duration === 'number' && Number.isFinite(value.duration) ? value.duration : 0;
  const updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : '';
  if (!updatedAt) return null;
  return { videoId: value.videoId, bpm, beatOffset, duration, peaks, updatedAt };
}

export async function pushAnalysis(meta: AnalysisMeta): Promise<boolean> {
  try {
    const response = await fetch('/api/analysis', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(metaToPut(meta)),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function pullAnalysis(videoId: string): Promise<AnalysisRecord | null> {
  try {
    const response = await fetch(`/api/analysis?videoId=${encodeURIComponent(videoId)}`, { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const data = (await response.json()) as { analysis?: unknown };
    return asRecord(data.analysis);
  } catch {
    return null;
  }
}

export async function pullAnalysisList(): Promise<AnalysisSummary[]> {
  try {
    const response = await fetch('/api/analysis', { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return [];
    const items: AnalysisSummary[] = [];
    for (const row of data.items) {
      const record = asRecord({ ...(isRecord(row) ? row : {}), peaks: [] });
      if (!record) continue;
      items.push({
        videoId: record.videoId,
        bpm: record.bpm,
        beatOffset: record.beatOffset,
        duration: record.duration,
        updatedAt: record.updatedAt,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** IndexedDB first, then the server copy if it is newer. Pushes a local-only row. */
export async function reconcileAnalysis(videoId: string): Promise<AnalysisMeta | null> {
  const local = await loadAnalysis(videoId);
  const remote = await pullAnalysis(videoId);
  const choice = preferAnalysis(local, remote);
  if (choice === 'remote' && remote) {
    const meta = analysisToMeta(remote, local);
    try {
      await saveAnalysis(meta);
    } catch {
      /* keep the memory copy */
    }
    return meta;
  }
  if (choice === 'local' && local) {
    if (!remote) void pushAnalysis(local);
    return local;
  }
  return null;
}
