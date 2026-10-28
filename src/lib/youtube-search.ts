import { decodeEntities } from './html-text';

const VIDEO_ID = /^[\w-]{11}$/;

export type SearchHit = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  channel: string;
};

/** Items from YouTube Data API `search.list`. Titles only, never the request URL. */
export function parseSearchItems(data: unknown): SearchHit[] {
  const root = data && typeof data === 'object' ? (data as { items?: unknown }).items : null;
  if (!Array.isArray(root)) return [];
  const items: SearchHit[] = [];
  for (const raw of root) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as {
      id?: { videoId?: string };
      videoId?: string;
      title?: string;
      channel?: string;
      thumbnail?: string | null;
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
      };
    };
    const videoId = item.id?.videoId || item.videoId;
    if (!videoId || !VIDEO_ID.test(videoId)) continue;
    const thumbs = item.snippet?.thumbnails;
    items.push({
      videoId,
      title: decodeEntities(item.snippet?.title || item.title || videoId),
      channel: decodeEntities(item.snippet?.channelTitle || item.channel || ''),
      thumbnail: thumbs?.medium?.url || thumbs?.default?.url || (typeof item.thumbnail === 'string' ? item.thumbnail : null),
    });
  }
  return items;
}
