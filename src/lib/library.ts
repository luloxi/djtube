import type { Track } from '../types';

export function trackIsLoaded(videoId: string, keepIds: Array<string | null | undefined>): boolean {
  return keepIds.some((id) => id === videoId);
}

/** Sideways drag past this many pixels commits a queue removal. */
export const SWIPE_COMMIT_PX = 72;

/** Loaded deck rows always snap back. A short drag snaps back too. */
export function swipeCommit(dx: number, locked: boolean, threshold = SWIPE_COMMIT_PX): 'remove' | 'snap' {
  if (locked || !Number.isFinite(dx) || Math.abs(dx) < threshold) return 'snap';
  return 'remove';
}

export function removeQueuedTrack(
  tracks: Track[],
  videoId: string,
  keepIds: Array<string | null | undefined>,
): { tracks: Track[]; removed: { track: Track; index: number } | null } {
  const index = tracks.findIndex((track) => track.videoId === videoId);
  if (index < 0 || trackIsLoaded(videoId, keepIds)) return { tracks, removed: null };
  const track = tracks[index];
  if (!track) return { tracks, removed: null };
  return {
    tracks: tracks.filter((item) => item.videoId !== videoId),
    removed: { track, index },
  };
}

let deckDrop = false;

/** The deck sets this from its drop handler so a swipe can tell a real load from a release. */
export function noteDeckDrop(): void {
  deckDrop = true;
}

export function consumeDeckDrop(): boolean {
  const hit = deckDrop;
  deckDrop = false;
  return hit;
}

export function restoreTrack(tracks: Track[], track: Track, index: number): Track[] {
  if (tracks.some((item) => item.videoId === track.videoId)) return tracks;
  const next = tracks.slice();
  const at = Math.max(0, Math.min(Number.isFinite(index) ? index : next.length, next.length));
  next.splice(at, 0, track);
  return next;
}
