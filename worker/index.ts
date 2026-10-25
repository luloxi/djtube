interface Env {
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
  YT_API_KEY?: string;
}

type SearchItem = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  channel: string;
};

const VIDEO_ID = /^[\w-]{11}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/search') return search(url, env);
    if (url.pathname === '/api/oembed') return oembed(url);
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    if (url.pathname.startsWith('/api/')) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

async function search(url: URL, env: Env): Promise<Response> {
  if (!env.YT_API_KEY) {
    return Response.json({ ok: false, reason: 'missing_key', items: [] });
  }
  const probe = url.searchParams.get('probe');
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (probe || !q) return Response.json({ ok: true, items: [] });

  const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
  endpoint.searchParams.set('part', 'snippet');
  endpoint.searchParams.set('type', 'video');
  endpoint.searchParams.set('maxResults', '8');
  endpoint.searchParams.set('q', q);
  endpoint.searchParams.set('key', env.YT_API_KEY);

  try {
    const upstream = await fetch(endpoint);
    if (!upstream.ok) {
      return Response.json({ ok: false, reason: 'upstream', items: [] });
    }
    const data = (await upstream.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    };
    const items: SearchItem[] = [];
    for (const item of data.items ?? []) {
      const videoId = item.id?.videoId;
      if (!videoId || !VIDEO_ID.test(videoId)) continue;
      const thumbs = item.snippet?.thumbnails;
      items.push({
        videoId,
        title: item.snippet?.title || videoId,
        channel: item.snippet?.channelTitle || '',
        thumbnail: thumbs?.medium?.url || thumbs?.default?.url || null,
      });
    }
    return Response.json({ ok: true, items });
  } catch {
    return Response.json({ ok: false, reason: 'upstream', items: [] });
  }
}

async function oembed(url: URL): Promise<Response> {
  const id = url.searchParams.get('v') ?? '';
  if (!VIDEO_ID.test(id)) return Response.json({ ok: false });
  try {
    const upstream = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (!upstream.ok) return Response.json({ ok: false });
    const data = (await upstream.json()) as { title?: string; thumbnail_url?: string };
    if (!data.title) return Response.json({ ok: false });
    return Response.json({ ok: true, title: data.title, thumbnail_url: data.thumbnail_url ?? null });
  } catch {
    return Response.json({ ok: false });
  }
}
