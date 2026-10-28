import type { Track } from '../types';
import { thumbnailFor } from './youtube';

const VIDEO_ID = /^[\w-]{11}$/;
const DEAD_TITLE = /^(private video|deleted video|unavailable video|video unavailable|this video is unavailable|private|deleted)$/i;

export type PlaylistItem = {
  videoId: string;
  title: string;
  thumbnail: string | null;
};

export type PlaylistPage = {
  items: PlaylistItem[];
  nextPageToken: string | null;
};

export function isPlayablePlaylistItem(item: {
  videoId?: string | null;
  title?: string | null;
  privacyStatus?: string | null;
  playable?: boolean | null;
}): boolean {
  const videoId = item.videoId ?? '';
  if (!VIDEO_ID.test(videoId)) return false;
  if (item.playable === false) return false;
  const privacy = (item.privacyStatus ?? '').toLowerCase();
  if (privacy === 'private' || privacy === 'privacystatusunspecified') return false;
  const title = (item.title ?? '').trim();
  if (DEAD_TITLE.test(title)) return false;
  return true;
}

export function playlistItemToTrack(item: PlaylistItem): Track {
  return {
    videoId: item.videoId,
    title: item.title.trim() || item.videoId,
    thumbnail: item.thumbnail || thumbnailFor(item.videoId),
  };
}

function safeThumb(url: string | null | undefined, videoId: string): string {
  if (url && /^https:\/\//i.test(url)) return url;
  return thumbnailFor(videoId);
}

/** Keep playlist order. Skip anything already queued, repeated, or unplayable. */
export function takeNewPlaylistItems(page: PlaylistItem[], queued: Set<string>): PlaylistItem[] {
  const added: PlaylistItem[] = [];
  for (const item of page) {
    if (!isPlayablePlaylistItem(item) || queued.has(item.videoId)) continue;
    queued.add(item.videoId);
    added.push({
      videoId: item.videoId,
      title: item.title.trim() || item.videoId,
      thumbnail: safeThumb(item.thumbnail, item.videoId),
    });
  }
  return added;
}

/**
 * Follow nextPageToken / continuation until the list ends.
 * Yields between pages so a long playlist does not freeze the UI.
 */
export async function walkPlaylistPages(
  fetchPage: (pageToken: string | null) => Promise<PlaylistPage>,
  queuedIds: Iterable<string>,
  onBatch: (items: PlaylistItem[]) => void | Promise<void>,
  options?: { signal?: AbortSignal; maxPages?: number },
): Promise<number> {
  const queued = new Set(queuedIds);
  const seenTokens = new Set<string>();
  let token: string | null = null;
  let added = 0;
  const maxPages = options?.maxPages ?? 80;
  for (let page = 0; page < maxPages; page += 1) {
    if (options?.signal?.aborted) break;
    const result = await fetchPage(token);
    const fresh = takeNewPlaylistItems(result.items ?? [], queued);
    if (fresh.length) {
      await onBatch(fresh);
      added += fresh.length;
    }
    const next = result.nextPageToken?.trim() || null;
    if (!next || seenTokens.has(next)) break;
    seenTokens.add(next);
    token = next;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return added;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  const node = asRecord(value);
  if (!node) return '';
  if (typeof node.simpleText === 'string') return node.simpleText;
  if (typeof node.content === 'string') return node.content;
  if (!Array.isArray(node.runs)) return '';
  return node.runs.map((run) => (typeof asRecord(run)?.text === 'string' ? (asRecord(run)?.text as string) : '')).join('');
}

export function parseDataApiPlaylist(data: unknown): PlaylistPage {
  const root = asRecord(data);
  const rawItems = Array.isArray(root?.items) ? root.items : [];
  const items: PlaylistItem[] = [];
  for (const raw of rawItems) {
    const item = asRecord(raw);
    const snippet = asRecord(item?.snippet);
    const status = asRecord(item?.status);
    const resource = asRecord(snippet?.resourceId);
    const content = asRecord(item?.contentDetails);
    const videoId =
      (typeof resource?.videoId === 'string' && resource.videoId) ||
      (typeof content?.videoId === 'string' && content.videoId) ||
      '';
    const title = typeof snippet?.title === 'string' ? snippet.title : videoId;
    const thumbs = asRecord(snippet?.thumbnails);
    const medium = asRecord(thumbs?.medium);
    const high = asRecord(thumbs?.high);
    const fallback = asRecord(thumbs?.default);
    const thumbnail =
      (typeof medium?.url === 'string' && medium.url) ||
      (typeof high?.url === 'string' && high.url) ||
      (typeof fallback?.url === 'string' && fallback.url) ||
      null;
    const privacyStatus = typeof status?.privacyStatus === 'string' ? status.privacyStatus : null;
    if (!isPlayablePlaylistItem({ videoId, title, privacyStatus })) continue;
    items.push({ videoId, title: title.trim() || videoId, thumbnail: safeThumb(thumbnail, videoId) });
  }
  const next = typeof root?.nextPageToken === 'string' && root.nextPageToken.trim() ? root.nextPageToken : null;
  return { items, nextPageToken: next };
}

function findToken(node: unknown, depth = 0): string | null {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findToken(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const command = asRecord(obj.continuationCommand);
  if (typeof command?.token === 'string' && command.token) return command.token;
  for (const value of Object.values(obj)) {
    const found = findToken(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function lockupToItem(lockup: Record<string, unknown>): PlaylistItem | null {
  if (lockup.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const videoId = typeof lockup.contentId === 'string' ? lockup.contentId : '';
  const meta = asRecord(asRecord(lockup.metadata)?.lockupMetadataViewModel);
  const title = textOf(meta?.title) || videoId;
  const sources = asRecord(asRecord(asRecord(lockup.contentImage)?.thumbnailViewModel)?.image)?.sources;
  const list = Array.isArray(sources) ? sources : [];
  const last = asRecord(list[list.length - 1]);
  const thumbnail = typeof last?.url === 'string' ? last.url : null;
  if (!isPlayablePlaylistItem({ videoId, title })) return null;
  return { videoId, title: title.trim() || videoId, thumbnail: safeThumb(thumbnail, videoId) };
}

/**
 * YouTube's browse response. Videos are `lockupViewModel` rows (older responses used
 * `playlistVideoRenderer`). The next-page token sits in the same array as the videos;
 * a continuation next to other shelves (related playlists) is ignored.
 */
export function parseInnertubePlaylist(data: unknown): PlaylistPage {
  const items: PlaylistItem[] = [];
  let nextPageToken: string | null = null;
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      let hasVideos = false;
      let token: string | null = null;
      for (const entry of node) {
        const row = asRecord(entry);
        if (!row) continue;
        const lockup = asRecord(row.lockupViewModel);
        const legacy = asRecord(row.playlistVideoRenderer);
        if (lockup) {
          const item = lockupToItem(lockup);
          if (lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') hasVideos = true;
          if (item) items.push(item);
        } else if (legacy) {
          hasVideos = true;
          const videoId = typeof legacy.videoId === 'string' ? legacy.videoId : '';
          const title = textOf(legacy.title) || videoId;
          const thumbs = asRecord(legacy.thumbnail);
          const thumbList = Array.isArray(thumbs?.thumbnails) ? thumbs.thumbnails : [];
          const lastThumb = asRecord(thumbList[thumbList.length - 1]);
          const thumbnail = typeof lastThumb?.url === 'string' ? lastThumb.url : null;
          const playable = legacy.isPlayable === false ? false : null;
          if (isPlayablePlaylistItem({ videoId, title, playable })) {
            items.push({ videoId, title: title.trim() || videoId, thumbnail: safeThumb(thumbnail, videoId) });
          }
        } else if (row.continuationItemViewModel || row.continuationItemRenderer) {
          token = findToken(row);
        } else {
          visit(row);
        }
      }
      if (hasVideos && token) nextPageToken = token;
      return;
    }
    for (const value of Object.values(node as Record<string, unknown>)) visit(value);
  };
  visit(data);
  return { items, nextPageToken };
}

export function readPlaylistPayload(data: unknown): PlaylistPage | null {
  const root = asRecord(data);
  if (!root || root.ok !== true) return null;
  const items: PlaylistItem[] = [];
  if (Array.isArray(root.items)) {
    for (const raw of root.items) {
      const row = asRecord(raw);
      if (!row || typeof row.videoId !== 'string') continue;
      const title = typeof row.title === 'string' ? row.title : row.videoId;
      const thumbnail = typeof row.thumbnail === 'string' ? row.thumbnail : null;
      const privacyStatus = typeof row.privacyStatus === 'string' ? row.privacyStatus : null;
      const playable = typeof row.playable === 'boolean' ? row.playable : null;
      if (!isPlayablePlaylistItem({ videoId: row.videoId, title, privacyStatus, playable })) continue;
      items.push({ videoId: row.videoId, title: title.trim() || row.videoId, thumbnail: safeThumb(thumbnail, row.videoId) });
    }
  }
  const next = typeof root.nextPageToken === 'string' && root.nextPageToken.trim() ? root.nextPageToken : null;
  return { items, nextPageToken: next };
}

export async function fetchPlaylistPage(playlistId: string, pageToken: string | null, signal?: AbortSignal): Promise<PlaylistPage> {
  const response = await fetch('/api/playlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ list: playlistId, pageToken: pageToken ?? '' }),
    signal,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  const page = readPlaylistPayload(data);
  if (!response.ok || !page) throw new Error('playlist');
  return page;
}
