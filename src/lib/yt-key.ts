import { normalizeSearchQuery, youtubeFailure } from './quota';
import { parseDataApiPlaylist, type PlaylistPage } from './playlist';
import { parseSearchItems, type SearchHit, type SearchKind } from './youtube-search';

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
export function searchRoute(query: string, ownKey: string | null, kind: SearchKind = 'video'): DataRoute {
  const q = normalizeSearchQuery(query);
  const key = normalizeApiKey(ownKey ?? '');
  if (key) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', kind);
    url.searchParams.set('maxResults', '8');
    url.searchParams.set('q', q);
    url.searchParams.set('key', key);
    return { via: 'browser', url: url.toString() };
  }
  return { via: 'server', url: `/api/search?q=${encodeURIComponent(q)}${kind === 'playlist' ? '&type=playlist' : ''}`, method: 'GET' };
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
export async function fetchSearch(query: string, ownKey: string | null, kind: SearchKind = 'video', signal?: AbortSignal): Promise<SearchOutcome> {
  const route = searchRoute(query, ownKey, kind);
  try {
    const response = await fetch(route.url, { signal, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (route.via === 'browser') {
      const failure = youtubeFailure(response.status, data);
      if (failure) return { ok: false, reason: failure === 'invalid' ? 'invalid' : failure, items: [] };
      return { ok: true, items: parseSearchItems(data, kind) };
    }
    const row = data && typeof data === 'object' ? (data as { ok?: boolean; reason?: string; items?: unknown }) : null;
    if (!row?.ok) return { ok: false, reason: row?.reason || 'upstream', items: [] };
    return { ok: true, items: parseSearchItems({ items: row.items }, kind) };
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

/** What went wrong when a key was tried. "ok" means YouTube answered normally. */
export type KeyTestResult = 'ok' | 'invalid' | 'disabled' | 'referrer' | 'blocked' | 'quota' | 'network' | 'other';

/** A pasted OAuth client ID is the common wrong turn: say so before spending a call. */
export function keyShapeProblem(raw: string): 'oauth' | 'shape' | null {
  const text = raw.trim();
  if (!text) return null;
  if (/\.apps\.googleusercontent\.com/i.test(text) || /^GOCSPX-/.test(text)) return 'oauth';
  return KEY_SHAPE.test(text) ? null : 'shape';
}

function errorDetailReasons(body: unknown): string[] {
  const error = body && typeof body === 'object' ? (body as { error?: unknown }).error : null;
  if (!error || typeof error !== 'object') return [];
  const out: string[] = [];
  const errors = (error as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      const reason = item && typeof item === 'object' ? (item as { reason?: unknown }).reason : null;
      if (typeof reason === 'string') out.push(reason);
    }
  }
  const details = (error as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const item of details) {
      const reason = item && typeof item === 'object' ? (item as { reason?: unknown }).reason : null;
      if (typeof reason === 'string') out.push(reason);
    }
  }
  return out;
}

/** Map a Google error answer to one friendly cause. Never looks at or returns the key. */
export function classifyKeyTest(status: number, body: unknown): KeyTestResult {
  if (status >= 200 && status < 300) return 'ok';
  const reasons = errorDetailReasons(body);
  const has = (...names: string[]) => reasons.some((reason) => names.includes(reason));
  if (has('API_KEY_HTTP_REFERRER_BLOCKED', 'ipRefererBlocked')) return 'referrer';
  if (has('API_KEY_SERVICE_BLOCKED', 'API_KEY_API_BLOCKED')) return 'blocked';
  if (has('SERVICE_DISABLED', 'accessNotConfigured')) return 'disabled';
  if (has('quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'RESOURCE_EXHAUSTED') || status === 429) return 'quota';
  if (has('API_KEY_INVALID', 'keyInvalid') || status === 400) return 'invalid';
  return 'other';
}

/**
 * One cheap call (videos.list costs 1 unit) straight from this browser to Google.
 * The key goes only to googleapis.com, never to DJTube.
 */
export async function testOwnKey(raw: string, doFetch: typeof fetch = fetch): Promise<KeyTestResult> {
  const key = normalizeApiKey(raw);
  if (!key) return 'invalid';
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'id');
  url.searchParams.set('id', 'dQw4w9WgXcQ');
  url.searchParams.set('key', key);
  try {
    const response = await doFetch(url.toString());
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return classifyKeyTest(response.status, body);
  } catch {
    return 'network';
  }
}
