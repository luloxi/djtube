type CacheWithDefault = CacheStorage & { default?: Cache };

function cacheStore(): Cache | null {
  try {
    const store = caches as CacheWithDefault;
    return store.default ?? null;
  } catch {
    return null;
  }
}

function cacheRequest(id: string): Request {
  return new Request(`https://dj.lulox.com.ar/__ytcache/${encodeURIComponent(id)}`);
}

export async function readCachedJson(id: string): Promise<unknown | null> {
  try {
    const cache = cacheStore();
    if (!cache) return null;
    const hit = await cache.match(cacheRequest(id));
    if (!hit) return null;
    return await hit.json();
  } catch {
    return null;
  }
}

export async function writeCachedJson(id: string, body: unknown, maxAge: number): Promise<void> {
  try {
    const cache = cacheStore();
    if (!cache) return;
    const response = new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${maxAge}`,
      },
    });
    await cache.put(cacheRequest(id), response);
  } catch {
    /* a cache miss next time is safe */
  }
}
