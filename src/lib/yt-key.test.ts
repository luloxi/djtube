import { describe, expect, it } from 'vitest';
import { classifyKeyTest, clearOwnKey, keyShapeProblem, normalizeApiKey, testOwnKey, playlistRoute, readOwnKey, searchRoute, writeOwnKey, YT_KEY_STORAGE } from './yt-key';

const KEY = `AIza${'a'.repeat(35)}`;

function memory() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
  };
}

describe('playlist search', () => {
  it('asks the worker for playlists only when playlists are chosen', () => {
    expect(searchRoute('hola', null, 'playlist').url).toBe('/api/search?q=hola&type=playlist');
    expect(searchRoute('hola', null, 'video').url).toBe('/api/search?q=hola');
  });

  it('asks Google for type=playlist with a browser key', () => {
    const route = searchRoute('hola', KEY, 'playlist');
    expect(route.via).toBe('browser');
    expect(new URL(route.url).searchParams.get('type')).toBe('playlist');
  });
});

describe('bring your own YouTube key', () => {
  it('sends search to the worker when this browser has no key', () => {
    const route = searchRoute('  Hola   Mundo ', null);
    expect(route.via).toBe('server');
    expect(route.url).toBe('/api/search?q=hola%20mundo');
    expect(route.url.includes('AIza')).toBe(false);
    expect(route.url.includes('googleapis')).toBe(false);
  });

  it('calls YouTube from the browser when a key is stored, and never via our API', () => {
    const route = searchRoute('hola', KEY);
    expect(route.via).toBe('browser');
    expect(route.url.startsWith('https://www.googleapis.com/youtube/v3/search?')).toBe(true);
    expect(route.url).toContain(`key=${KEY}`);
    expect(route.url.includes('/api/')).toBe(false);

    const page = playlistRoute('PLtestlist01', 'tok', KEY);
    expect(page.via).toBe('browser');
    expect(page.url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems?')).toBe(true);
    expect(page.url).toContain('playlistId=PLtestlist01');
    expect(page.url).toContain(`key=${KEY}`);
    expect(page.url.includes('/api/')).toBe(false);
  });

  it('keeps the key out of the server playlist call', () => {
    const store = memory();
    expect(writeOwnKey(store, `  ${KEY}  `)).toBe(true);
    expect(store.getItem(YT_KEY_STORAGE)).toBe(KEY);
    expect(readOwnKey(store)).toBe(KEY);
    const route = playlistRoute('PLtestlist01', '', null);
    expect(route.via).toBe('server');
    if (route.via !== 'server') throw new Error('route');
    expect(route.url).toBe('/api/playlist');
    expect(route.body).toBe(JSON.stringify({ list: 'PLtestlist01', pageToken: '' }));
    expect((route.body ?? '').includes(KEY)).toBe(false);
    expect(route.url.includes(KEY)).toBe(false);
    clearOwnKey(store);
    expect(readOwnKey(store)).toBeNull();
    expect(searchRoute('hola', readOwnKey(store)).via).toBe('server');
  });

  it('rejects a value that is not a YouTube API key', () => {
    expect(normalizeApiKey('not-a-key')).toBeNull();
    expect(normalizeApiKey('')).toBeNull();
    expect(writeOwnKey(memory(), 'secret-looking')).toBe(false);
    expect(searchRoute('hola', 'secret-looking').via).toBe('server');
  });
});

describe('key test', () => {
  const err = (reason: string, detail?: string) => ({
    error: { errors: [{ reason }], details: detail ? [{ reason: detail }] : [] },
  });

  it('names the cause of the common Google errors', () => {
    expect(classifyKeyTest(200, { items: [] })).toBe('ok');
    expect(classifyKeyTest(400, err('badRequest', 'API_KEY_INVALID'))).toBe('invalid');
    expect(classifyKeyTest(403, err('accessNotConfigured', 'SERVICE_DISABLED'))).toBe('disabled');
    expect(classifyKeyTest(403, err('forbidden', 'API_KEY_HTTP_REFERRER_BLOCKED'))).toBe('referrer');
    expect(classifyKeyTest(403, err('forbidden', 'API_KEY_SERVICE_BLOCKED'))).toBe('blocked');
    expect(classifyKeyTest(403, err('quotaExceeded'))).toBe('quota');
    expect(classifyKeyTest(500, null)).toBe('other');
  });

  it('spots a pasted OAuth client id and malformed keys', () => {
    expect(keyShapeProblem('')).toBeNull();
    expect(keyShapeProblem('1234-abc.apps.googleusercontent.com')).toBe('oauth');
    expect(keyShapeProblem('GOCSPX-abcdef')).toBe('oauth');
    expect(keyShapeProblem('hola')).toBe('shape');
    expect(keyShapeProblem(KEY)).toBeNull();
  });

  it('sends the key only to googleapis.com and reports network failures', async () => {
    const urls: string[] = [];
    const ok = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await testOwnKey(KEY, ok)).toBe('ok');
    expect(urls).toHaveLength(1);
    expect(new URL(urls[0]).hostname).toBe('www.googleapis.com');
    const down = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;
    expect(await testOwnKey(KEY, down)).toBe('network');
    expect(await testOwnKey('nope', ok)).toBe('invalid');
    expect(urls).toHaveLength(1);
  });
});
