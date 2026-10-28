import type { AnalysisMeta } from '../types';
import { maxPeak } from './peaks';

export type SyncTrack = {
  videoId: string;
  title: string;
  thumbnail: string | null;
};

export type SyncStatus = 'queued' | 'analyzing' | 'ready' | 'error';

export type SyncItem = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  status: SyncStatus;
  progress: number;
  bpm: number | null;
  error: string | null;
};

const VIDEO_ID = /^[\w-]{11}$/;

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

function cleanTrack(track: SyncTrack | null | undefined): SyncTrack | null {
  if (!track || !isVideoId(track.videoId)) return null;
  const title = typeof track.title === 'string' && track.title.trim() ? track.title.trim() : track.videoId;
  const thumbnail = typeof track.thumbnail === 'string' && track.thumbnail ? track.thumbnail : null;
  return { videoId: track.videoId, title, thumbnail };
}

/** Queue first, then whatever is on a deck and not already listed. */
export function collectTracks(library: readonly SyncTrack[], decks: readonly (SyncTrack | null | undefined)[]): SyncTrack[] {
  const out: SyncTrack[] = [];
  const seen = new Set<string>();
  for (const candidate of [...library, ...decks]) {
    const track = cleanTrack(candidate);
    if (!track || seen.has(track.videoId)) continue;
    seen.add(track.videoId);
    out.push(track);
  }
  return out;
}

/**
 * Keep in-progress rows. A videoId that is new to the list is ready when IndexedDB
 * already has it, otherwise it waits. A retry (status queued) is not flipped back to ready.
 */
export function mergeSyncItems(
  current: readonly SyncItem[],
  tracks: readonly SyncTrack[],
  readyBpm: ReadonlyMap<string, number | null>,
): SyncItem[] {
  const byId = new Map(current.map((item) => [item.videoId, item]));
  const next: SyncItem[] = [];
  const seen = new Set<string>();
  for (const candidate of tracks) {
    const track = cleanTrack(candidate);
    if (!track || seen.has(track.videoId)) continue;
    seen.add(track.videoId);
    const existing = byId.get(track.videoId);
    if (existing) {
      next.push({
        ...existing,
        title: track.title,
        thumbnail: track.thumbnail ?? existing.thumbnail,
      });
      continue;
    }
    const known = readyBpm.has(track.videoId);
    next.push({
      videoId: track.videoId,
      title: track.title,
      thumbnail: track.thumbnail,
      status: known ? 'ready' : 'queued',
      progress: known ? 1 : 0,
      bpm: known ? (readyBpm.get(track.videoId) ?? null) : null,
      error: null,
    });
  }
  return next;
}

export function nextQueued(items: readonly SyncItem[]): SyncItem | null {
  return items.find((item) => item.status === 'queued') ?? null;
}

export function overallProgress(items: readonly SyncItem[]): { ready: number; total: number; ratio: number } {
  const total = items.length;
  if (!total) return { ready: 0, total: 0, ratio: 0 };
  let ready = 0;
  let fraction = 0;
  for (const item of items) {
    if (item.status === 'ready') {
      ready += 1;
      fraction += 1;
    } else if (item.status === 'analyzing') {
      fraction += Math.min(1, Math.max(0, item.progress));
    }
  }
  return { ready, total, ratio: fraction / total };
}

function patch(items: readonly SyncItem[], videoId: string, edit: (item: SyncItem) => SyncItem): SyncItem[] {
  return items.map((item) => (item.videoId === videoId ? edit(item) : item));
}

export function markAnalyzing(items: readonly SyncItem[], videoId: string): SyncItem[] {
  return patch(items, videoId, (item) => ({ ...item, status: 'analyzing', progress: 0, error: null }));
}

export function markProgress(items: readonly SyncItem[], videoId: string, progress: number): SyncItem[] {
  return patch(items, videoId, (item) =>
    item.status === 'analyzing' ? { ...item, progress: Math.min(1, Math.max(0, progress)) } : item,
  );
}

export function markReady(items: readonly SyncItem[], videoId: string, bpm: number | null): SyncItem[] {
  return patch(items, videoId, (item) => ({ ...item, status: 'ready', progress: 1, bpm, error: null }));
}

export function markError(items: readonly SyncItem[], videoId: string, error: string): SyncItem[] {
  return patch(items, videoId, (item) => ({ ...item, status: 'error', progress: 0, error }));
}

export function retrySyncItem(items: readonly SyncItem[], videoId: string): SyncItem[] {
  return patch(items, videoId, (item) =>
    item.status === 'error' ? { ...item, status: 'queued', progress: 0, error: null } : item,
  );
}

export type ChimeClock = {
  /** Ids that were not ready at some point since the previous chime. */
  open: string[];
  chimed: boolean;
};

export function createChimeClock(): ChimeClock {
  return { open: [], chimed: false };
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Chime when every current row is ready and this batch had unfinished work.
 * An already-synced list does not chime. The next chime waits for new work to finish.
 * An error keeps the batch open.
 */
export function advanceChime(clock: ChimeClock, items: readonly SyncItem[]): { clock: ChimeClock; chime: boolean } {
  const ids = new Set(items.map((item) => item.videoId));
  const ready = new Set(items.filter((item) => item.status === 'ready').map((item) => item.videoId));
  const notReady = items.filter((item) => item.status !== 'ready').map((item) => item.videoId);
  const relevantOpen = clock.open.filter((id) => ids.has(id));
  const stillOpen = unique([...relevantOpen.filter((id) => !ready.has(id)), ...notReady]);
  const allReady = items.length > 0 && notReady.length === 0;
  if (!allReady || relevantOpen.length === 0) {
    return { clock: { open: stillOpen, chimed: clock.chimed }, chime: false };
  }
  return { clock: { open: [], chimed: true }, chime: true };
}

export function outcomeFromCapture(input: {
  peaks: number[];
  bpm: number | null;
  duration: number;
}): { ok: true; peaks: number[]; bpm: number | null; duration: number } | { ok: false; error: string } {
  if (!(input.duration > 0.4)) return { ok: false, error: 'No pude leer la duración.' };
  if (maxPeak(input.peaks) < 0.008) return { ok: false, error: 'No llegó audio de la pestaña.' };
  return { ok: true, peaks: input.peaks, bpm: input.bpm, duration: input.duration };
}

/** Peaks and BPM from the sync tab. A previously captured clip stays downloadable. */
export function mergeAnalysis(
  previous: AnalysisMeta | null,
  incoming: { videoId: string; peaks: number[]; duration: number; bpm: number | null; beatOffset?: number | null },
): AnalysisMeta {
  const keepAudio = Boolean(previous?.hasAudio);
  const duration = incoming.duration > 0 ? incoming.duration : (previous?.duration ?? 0);
  return {
    videoId: incoming.videoId,
    peaks: incoming.peaks,
    duration,
    bpm: incoming.bpm ?? previous?.bpm ?? null,
    beatOffset: incoming.beatOffset !== undefined ? incoming.beatOffset : (previous?.beatOffset ?? null),
    updatedAt: new Date().toISOString(),
    hasAudio: keepAudio,
    recordStart: keepAudio && previous ? previous.recordStart : 0,
    recordEnd: keepAudio && previous ? previous.recordEnd : duration,
  };
}
