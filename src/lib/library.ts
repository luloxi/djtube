import type { Track } from '../types';

/** Drop queued tracks, but keep anything loaded on a live deck. */
export function clearQueue(tracks: Track[], keepIds: Array<string | null | undefined>): Track[] {
  const keep = new Set(keepIds.filter((id): id is string => Boolean(id)));
  return tracks.filter((track) => keep.has(track.videoId));
}
