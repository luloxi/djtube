import { normalizeApiKey } from './yt-key';

export const PLAYLIST_NAME_MAX = 80;
export const PLAYLIST_TRACKS_MAX = 500;
export const PLAYLISTS_PER_USER = 30;
/** Request bodies above this many characters are refused before parsing. */
export const ACCOUNT_BODY_MAX = 120_000;

const VIDEO_ID = /^[\w-]{11}$/;

export type SavedTrack = { videoId: string; title: string };

export function cleanPlaylistName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name || name.length > PLAYLIST_NAME_MAX) return null;
  return name;
}

/** Keeps only well-formed tracks, drops duplicates, and refuses lists that are empty or too long. */
export function cleanTracks(raw: unknown): SavedTrack[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PLAYLIST_TRACKS_MAX) return null;
  const seen = new Set<string>();
  const tracks: SavedTrack[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const { videoId, title } = item as { videoId?: unknown; title?: unknown };
    if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const text = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    tracks.push({ videoId, title: text || videoId });
  }
  return tracks.length ? tracks : null;
}

export function parseSavedTracks(json: string): SavedTrack[] {
  try {
    return cleanTracks(JSON.parse(json)) ?? [];
  } catch {
    return [];
  }
}

export function cleanAccountKey(raw: unknown): string | null {
  return typeof raw === 'string' ? normalizeApiKey(raw) : null;
}

export type PlaylistSummary = { id: string; name: string; count: number; updatedAt: string };
