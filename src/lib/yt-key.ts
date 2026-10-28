import { normalizeSearchQuery, youtubeFailure } from './quota';
import { parseDataApiPlaylist, type PlaylistPage } from './playlist';
import { parseSearchItems, type SearchHit } from './youtube-search';

/** This browser only. The value is never sent to the DJTube worker. */
export const YT_KEY_STORAGE = 'djtube-yt-key';

const KEY_SHAPE = /^AIza[\w-]{20,80}$/;

export function normalizeApiKey(raw: string): string | null {
  const key = raw.trim();
  if (!KEY_SHAPE.test(key)) return null;
  return key;
}

export function readOwnKey(storage: { getItem(key: string): string | null } | null): string | null {
  if (!storage) return null;
  try {
    return normalizeApiKey(storage.getItem(YT_KEY_STORAGE) ?? '');
  } catch {
    return null;
  }
}

export function writeOwnKey(storage: { setItem(key: string, value: string): void } | null, raw: string): boolean {
  const key = normalizeApiKey(raw);
  if (!storage || !key) return false;
  try {
    storage.setItem(YT_KEY_STORAGE, key);
    return true;
  } catch {
    return false;
  }
}

export function clearOwnKey(storage: { removeItem(key: string): void } | null): void {
  if (!storage) return;
  try {
    storage.removeItem(YT_KEY_STORAGE);
  } catch {
    /* private mode */
  }
}

export type DataRoute =
  | { via: 'browser'; url: string }
  | { via: 'server'; url: string; method: 'GET' | 'POST'; body?: string };

/** With a browser key, search goes straight to Google. Otherwise the worker. */
export function searchRoute(query: string, ownKey: string | null): DataRoute {
  const q = normalizeSearchQuery(query);
  const key = normalizeApiKey(ownKey ?? '');
  if (key) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('maxResults', '8');
    url.searchParams.set('q', q);
    url.searchParams.set('key', key);
    return { via: 'browser', url: url.toString() };
  }
  return { via: 'server', url: `/api/search?q=${encodeURIComponent(q)}`, method: 'GET' };
}

export function playlistRoute(playlistId: string, pageToken: string, ownKey: string | null): DataRoute {
  const key = normalizeApiKey(ownKey ?? '');
  if (key) {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,status');
    url.searchParams.set('maxResults', '50');
    url.searchParams.set('playlistId', playlistId);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    url.searchParams.set('key', key);
    return { via: 'browser', url: url.toString() };
  }
  return {
    via: 'server',
    url: '/api/playlist',
    method: 'POST',
    body: JSON.stringify({ list: playlistId, pageToken }),
  };
}

export type SearchOutcome = { ok: true; items: SearchHit[] } | { ok: false; reason: string; items: [] };

/** Fetches search. Does not log the URL, because a browser key lives in it. */
export async function fetchSearch(query: string, ownKey: string | null, signal?: AbortSignal): Promise<SearchOutcome> {
  const route = searchRoute(query, ownKey);
  try {
    const response = await fetch(route.url, { signal, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (route.via === 'browser') {
      const failure = youtubeFailure(response.status, data);
      if (failure) return { ok: false, reason: failure === 'invalid' ? 'invalid' : failure, items: [] };
      return { ok: true, items: parseSearchItems(data) };
    }
    const row = data && typeof data === 'object' ? (data as { ok?: boolean; reason?: string; items?: unknown }) : null;
    if (!row?.ok) return { ok: false, reason: row?.reason || 'upstream', items: [] };
    return { ok: true, items: parseSearchItems({ items: row.items }) };
  } catch {
    return { ok: false, reason: 'upstream', items: [] };
  }
}

export async function fetchOwnPlaylistPage(playlistId: string, pageToken: string, ownKey: string, signal?: AbortSignal): Promise<PlaylistPage> {
  const route = playlistRoute(playlistId, pageToken, ownKey);
  if (route.via !== 'browser') throw new Error('playlist');
  const response = await fetch(route.url, { signal });
  const data = await response.json().catch(() => null);
  const failure = youtubeFailure(response.status, data);
  if (failure === 'quota') throw new Error('quota');
  if (failure === 'invalid') throw new Error('invalid');
  if (!response.ok) throw new Error('playlist');
  return parseDataApiPlaylist(data);
}
