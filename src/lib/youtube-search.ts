import { decodeEntities } from './html-text';

const VIDEO_ID = /^[\w-]{11}$/;
const PLAYLIST_ID = /^[\w-]{2,128}$/;

export type SearchKind = 'video' | 'playlist';

export type SearchHit = {
  videoId: string;
  /** Set for playlist results; `videoId` is empty then. */
  playlistId?: string;
  title: string;
  thumbnail: string | null;
  channel: string;
};

/** Items from YouTube Data API `search.list`. Titles only, never the request URL. */
export function parseSearchItems(data: unknown, kind: SearchKind = 'video'): SearchHit[] {
  const root = data && typeof data === 'object' ? (data as { items?: unknown }).items : null;
  if (!Array.isArray(root)) return [];
  const items: SearchHit[] = [];
  for (const raw of root) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as {
      id?: { videoId?: string; playlistId?: string };
      videoId?: string;
      playlistId?: string;
      title?: string;
      channel?: string;
      thumbnail?: string | null;
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    };
    const thumbs = item.snippet?.thumbnails;
    if (kind === 'playlist') {
      const playlistId = item.id?.playlistId || item.playlistId;
      if (!playlistId || !PLAYLIST_ID.test(playlistId)) continue;
      items.push({
        videoId: '',
        playlistId,
        title: decodeEntities(item.snippet?.title || item.title || playlistId),
        channel: decodeEntities(item.snippet?.channelTitle || item.channel || ''),
        thumbnail: thumbs?.medium?.url || thumbs?.default?.url || (typeof item.thumbnail === 'string' ? item.thumbnail : null),
      });
      continue;
    }
    const videoId = item.id?.videoId || item.videoId;
    if (!videoId || !VIDEO_ID.test(videoId)) continue;
    items.push({
      videoId,
      title: decodeEntities(item.snippet?.title || item.title || videoId),
      channel: decodeEntities(item.snippet?.channelTitle || item.channel || ''),
      thumbnail: thumbs?.medium?.url || thumbs?.default?.url || (typeof item.thumbnail === 'string' ? item.thumbnail : null),
    });
  }
  return items;
}
