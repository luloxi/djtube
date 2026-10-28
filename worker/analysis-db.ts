import type { AnalysisRecord, AnalysisSummary } from '../src/lib/analysis';
import { normalizeEmail } from '../src/lib/access';
import type { D1Database } from './d1';

type Row = {
  video_id: string;
  bpm: number | null;
  beat_offset: number | null;
  duration: number | null;
  peaks?: string | null;
  updated_at: string;
};

function toRecord(row: Row, peaks: number[]): AnalysisRecord {
  return {
    videoId: row.video_id,
    bpm: typeof row.bpm === 'number' && Number.isFinite(row.bpm) ? row.bpm : null,
    beatOffset: typeof row.beat_offset === 'number' && Number.isFinite(row.beat_offset) ? row.beat_offset : null,
    duration: typeof row.duration === 'number' && Number.isFinite(row.duration) ? row.duration : 0,
    peaks,
    updatedAt: row.updated_at,
  };
}

function parsePeaks(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const peaks: number[] = [];
    for (const peak of parsed) {
      if (typeof peak !== 'number' || !Number.isFinite(peak)) return [];
      peaks.push(peak);
    }
    return peaks;
  } catch {
    return [];
  }
}

export async function readAnalysis(db: D1Database, email: string, videoId: string): Promise<AnalysisRecord | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  const row = await db
    .prepare('SELECT video_id, bpm, beat_offset, duration, peaks, updated_at FROM track_analysis WHERE email = ? AND video_id = ?')
    .bind(key, videoId)
    .first<Row>();
  if (!row) return null;
  return toRecord(row, parsePeaks(row.peaks));
}

export async function listAnalysis(db: D1Database, email: string): Promise<AnalysisSummary[]> {
  const key = normalizeEmail(email);
  if (!key) return [];
  const result = await db
    .prepare('SELECT video_id, bpm, beat_offset, duration, updated_at FROM track_analysis WHERE email = ? ORDER BY updated_at DESC LIMIT 200')
    .bind(key)
    .all<Row>();
  return (result.results ?? []).map((row) => {
    const record = toRecord(row, []);
    return {
      videoId: record.videoId,
      bpm: record.bpm,
      beatOffset: record.beatOffset,
      duration: record.duration,
      updatedAt: record.updatedAt,
    };
  });
}

export async function upsertAnalysis(db: D1Database, email: string, record: Omit<AnalysisRecord, 'updatedAt'>): Promise<AnalysisRecord> {
  const key = normalizeEmail(email);
  const updatedAt = new Date().toISOString();
  const peaks = JSON.stringify(record.peaks);
  await db
    .prepare(
      `INSERT INTO track_analysis (email, video_id, bpm, beat_offset, duration, peaks, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email, video_id) DO UPDATE SET
         bpm = excluded.bpm,
         beat_offset = excluded.beat_offset,
         duration = excluded.duration,
         peaks = excluded.peaks,
         updated_at = excluded.updated_at`,
    )
    .bind(key, record.videoId, record.bpm, record.beatOffset, record.duration, peaks, updatedAt)
    .run();
  return { ...record, updatedAt };
}
