import type { Track } from '../types';
import { decodeEntities } from './html-text';
import { parseYouTubeUrl, trackFromId } from './youtube';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
export const WATCH_VIDEOS_CHUNK = 50;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/** Three lines per track: title, link, blank line. */
export function queueLinksText(tracks: Array<Pick<Track, 'title' | 'videoId'>>): string {
  return tracks.map((track) => `${oneLine(decodeEntities(track.title)) || track.videoId}\nhttps://www.youtube.com/watch?v=${track.videoId}\n\n`).join('');
}

export function queueLinksFilename(now = new Date()): string {
  return `djtube-cola-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.txt`;
}

export function playlistTitle(now = new Date()): string {
  return `DJTube ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function watchVideosUrls(videoIds: string[], chunk = WATCH_VIDEOS_CHUNK): string[] {
  const urls: string[] = [];
  for (let i = 0; i < videoIds.length; i += chunk) {
    const ids = videoIds.slice(i, i + chunk).filter(Boolean);
    if (!ids.length) continue;
    urls.push(`https://www.youtube.com/watch_videos?video_ids=${ids.join(',')}`);
  }
  return urls;
}

export function hasYouTubeScope(scopes: string[] | null | undefined): boolean {
  if (!scopes?.length) return false;
  return scopes.some((scope) => scope.split(/[\s,]+/).includes(YOUTUBE_SCOPE));
}

export function youtubePlaylistUrl(id: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
}

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_TRACKS = 2000;

/**
 * Reads a file made by "Descargar" (title line, link line, blank line per track) or any text with
 * YouTube links. A title is the non-link line right before a link. Returns null when no video is found.
 */
export function parseQueueText(text: string): Array<{ videoId: string; title: string }> | null {
  if (typeof text !== 'string' || text.length > IMPORT_MAX_BYTES) return null;
  const seen = new Set<string>();
  const tracks: Array<{ videoId: string; title: string }> = [];
  let title = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      title = '';
      continue;
    }
    const videoId = /^https?:\/\//i.test(line) ? parseYouTubeUrl(line)?.videoId : undefined;
    if (!videoId) {
      title = /^https?:\/\//i.test(line) ? '' : line.slice(0, 200);
      continue;
    }
    if (!seen.has(videoId)) {
      seen.add(videoId);
      tracks.push({ videoId, title: title || videoId });
      if (tracks.length >= IMPORT_MAX_TRACKS) break;
    }
    title = '';
  }
  return tracks.length ? tracks : null;
}

/** Appends the tracks that are not queued yet, in file order. */
export function mergeImported(current: Track[], imported: Array<{ videoId: string; title: string }>): { tracks: Track[]; added: number } {
  const known = new Set(current.map((track) => track.videoId));
  const fresh = imported.filter((item) => !known.has(item.videoId)).map((item) => trackFromId(item.videoId, item.title));
  return { tracks: fresh.length ? [...current, ...fresh] : current, added: fresh.length };
}
