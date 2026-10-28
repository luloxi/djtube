import type { Track } from '../types';
import { decodeEntities } from './html-text';

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
