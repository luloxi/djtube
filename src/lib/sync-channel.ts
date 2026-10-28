import type { AnalysisMeta } from '../types';
import { isVideoId, type SyncTrack } from './sync-queue';

export const SYNC_CHANNEL = 'djtube-sync';

export type SyncMessage =
  | { type: 'tracks'; tracks: SyncTrack[] }
  | { type: 'request-tracks' }
  | { type: 'analysis'; meta: AnalysisMeta }
  | { type: 'chime' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function asTrack(value: unknown): SyncTrack | null {
  if (!isRecord(value) || typeof value.videoId !== 'string' || !isVideoId(value.videoId)) return null;
  const title = typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 300) : value.videoId;
  const thumbnail = typeof value.thumbnail === 'string' && value.thumbnail.startsWith('https://') ? value.thumbnail.slice(0, 500) : null;
  return { videoId: value.videoId, title, thumbnail };
}

function asMeta(value: unknown): AnalysisMeta | null {
  if (!isRecord(value) || typeof value.videoId !== 'string' || !isVideoId(value.videoId)) return null;
  if (!Array.isArray(value.peaks) || value.peaks.length < 8 || value.peaks.length > 4000) return null;
  const peaks: number[] = [];
  for (const peak of value.peaks) {
    if (typeof peak !== 'number' || !Number.isFinite(peak)) return null;
    peaks.push(peak);
  }
  if (typeof value.duration !== 'number' || !Number.isFinite(value.duration) || value.duration < 0) return null;
  if (!(value.bpm === null || (typeof value.bpm === 'number' && Number.isFinite(value.bpm) && value.bpm > 0 && value.bpm < 400))) return null;
  if (typeof value.recordStart !== 'number' || typeof value.recordEnd !== 'number') return null;
  if (!Number.isFinite(value.recordStart) || !Number.isFinite(value.recordEnd)) return null;
  if (typeof value.hasAudio !== 'boolean') return null;
  let beatOffset: number | null = null;
  if (value.beatOffset != null) {
    if (typeof value.beatOffset !== 'number' || !Number.isFinite(value.beatOffset) || value.beatOffset < 0 || value.beatOffset > 24 * 3600) return null;
    beatOffset = value.beatOffset;
  }
  return {
    videoId: value.videoId,
    peaks,
    duration: value.duration,
    bpm: value.bpm,
    beatOffset,
    recordStart: value.recordStart,
    recordEnd: value.recordEnd,
    hasAudio: value.hasAudio,
  };
}

export function parseSyncMessage(data: unknown): SyncMessage | null {
  if (!isRecord(data) || typeof data.type !== 'string') return null;
  if (data.type === 'request-tracks') return { type: 'request-tracks' };
  if (data.type === 'chime') return { type: 'chime' };
  if (data.type === 'tracks') {
    if (!Array.isArray(data.tracks) || data.tracks.length > 500) return null;
    const tracks: SyncTrack[] = [];
    for (const row of data.tracks) {
      const track = asTrack(row);
      if (track) tracks.push(track);
    }
    return { type: 'tracks', tracks };
  }
  if (data.type === 'analysis') {
    const meta = asMeta(data.meta);
    if (!meta) return null;
    return { type: 'analysis', meta };
  }
  return null;
}

export function openSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(SYNC_CHANNEL);
  } catch {
    return null;
  }
}
