import { mutationOriginAllowed } from '../src/lib/access';
import { parseDataApiPlaylist, parseInnertubePlaylist, type PlaylistPage } from '../src/lib/playlist';
import { hasYouTubeScope, youtubePlaylistUrl } from '../src/lib/queue-export';
import { addYouTubePlaylistItems, createYouTubePlaylist, type YoutubeFailure } from '../src/lib/youtube-playlist';
import { getAuth, type AuthEnv } from './auth';

const PLAYLIST_ID = /^[\w-]{2,128}$/;
const VIDEO_ID = /^[\w-]{11}$/;
const INNERTUBE_VERSION = '2.20251021.01.00';

type TokenEnv = AuthEnv & { YT_API_KEY?: string };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function clipToken(value: string): string | null {
  const token = value.trim();
  if (!token) return null;
  if (token.length > 8000) return null;
  return token;
}

async function fetchDataApiPage(playlistId: string, pageToken: string, key: string): Promise<PlaylistPage | null> {
  const endpoint = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  endpoint.searchParams.set('part', 'snippet,status');
  endpoint.searchParams.set('maxResults', '50');
  endpoint.searchParams.set('playlistId', playlistId);
  if (pageToken) endpoint.searchParams.set('pageToken', pageToken);
  endpoint.searchParams.set('key', key);
  const response = await fetch(endpoint);
  if (response.status === 404) return { items: [], nextPageToken: null };
  if (!response.ok) return null;
  return parseDataApiPlaylist(await response.json().catch(() => null));
}

function innertubeContext() {
  return {
    client: {
      clientName: 'WEB',
      clientVersion: INNERTUBE_VERSION,
      hl: 'es',
      gl: 'AR',
    },
  };
}

async function fetchInnertubePage(playlistId: string, pageToken: string): Promise<PlaylistPage> {
  const body = pageToken
    ? { context: innertubeContext(), continuation: pageToken }
    : { context: innertubeContext(), browseId: playlistId.startsWith('VL') ? playlistId : `VL${playlistId}` };
  const response = await fetch('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('playlist-upstream');
  return parseInnertubePlaylist(await response.json().catch(() => null));
}

export async function handlePlaylist(request: Request, env: TokenEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  if (!mutationOriginAllowed(request.headers.get('origin'), new URL(request.url).origin)) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }
  const body = (await request.json().catch(() => null)) as { list?: unknown; pageToken?: unknown } | null;
  const list = typeof body?.list === 'string' ? body.list.trim() : '';
  if (!PLAYLIST_ID.test(list)) return json({ ok: false, reason: 'invalid' }, 400);
  const pageToken = typeof body?.pageToken === 'string' ? body.pageToken.trim() : '';
  if (pageToken.length > 8000) return json({ ok: false, reason: 'invalid' }, 400);

  if (env.YT_API_KEY) {
    try {
      const page = await fetchDataApiPage(list, pageToken, env.YT_API_KEY);
      if (page) {
        return json({ ok: true, items: page.items, nextPageToken: clipToken(page.nextPageToken ?? '') });
      }
    } catch {
      /* The key stays on the server. Fall through to continuation. */
    }
  }
  try {
    const page = await fetchInnertubePage(list, pageToken);
    return json({ ok: true, items: page.items, nextPageToken: clipToken(page.nextPageToken ?? '') });
  } catch {
    return json({ ok: false, reason: 'upstream' }, 502);
  }
}

type GoogleAccount = { id: string; providerId: string; scopes?: string[] };

async function googleToken(request: Request, env: TokenEnv): Promise<{ token: string } | { error: 'auth' | 'consent' }> {
  const auth = getAuth(env);
  if (!auth) return { error: 'auth' };
  const api = auth.api as typeof auth.api & {
    listUserAccounts: (args: { headers: Headers }) => Promise<GoogleAccount[]>;
    getAccessToken: (args: { headers: Headers; body: { accountId: string } }) => Promise<{ accessToken?: string; scopes?: string[] }>;
  };
  let accounts: GoogleAccount[] = [];
  try {
    accounts = await api.listUserAccounts({ headers: request.headers });
  } catch {
    return { error: 'auth' };
  }
  const google = accounts.find((account) => account.providerId === 'google');
  if (!google?.id) return { error: 'auth' };
  if (!hasYouTubeScope(google.scopes)) return { error: 'consent' };
  try {
    const token = await api.getAccessToken({ headers: request.headers, body: { accountId: google.id } });
    if (!token?.accessToken) return { error: 'auth' };
    if (token.scopes && !hasYouTubeScope(token.scopes)) return { error: 'consent' };
    return { token: token.accessToken };
  } catch {
    return { error: 'auth' };
  }
}

function failure(reason: YoutubeFailure | 'auth' | 'consent', status = 403): Response {
  const code = reason === 'quota' ? 429 : reason === 'auth' ? 401 : status;
  return json({ ok: false, reason, added: 0 }, code);
}

export async function handleYouTubePlaylist(request: Request, env: TokenEnv): Promise<Response> {
  if (request.method === 'GET') {
    const token = await googleToken(request, env);
    if ('error' in token) return json({ ok: true, granted: false });
    return json({ ok: true, granted: true });
  }
  if (request.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  if (!mutationOriginAllowed(request.headers.get('origin'), new URL(request.url).origin)) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }
  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    title?: unknown;
    playlistId?: unknown;
    videoIds?: unknown;
  } | null;
  const token = await googleToken(request, env);
  if ('error' in token) return failure(token.error, token.error === 'auth' ? 401 : 403);

  if (body?.action === 'create') {
    const title = typeof body.title === 'string' ? body.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 150) : '';
    if (!title) return json({ ok: false, reason: 'invalid' }, 400);
    try {
      const created = await createYouTubePlaylist(fetch, token.token, title);
      if (!created.ok) return json({ ok: false, reason: created.reason }, created.reason === 'quota' ? 429 : 403);
      return json({ ok: true, playlistId: created.playlistId, url: created.url });
    } catch {
      return json({ ok: false, reason: 'upstream' }, 502);
    }
  }

  if (body?.action === 'items') {
    const playlistId = typeof body.playlistId === 'string' ? body.playlistId.trim() : '';
    if (!/^[\w-]{8,80}$/.test(playlistId)) return json({ ok: false, reason: 'invalid' }, 400);
    const videoIds = Array.isArray(body.videoIds) ? body.videoIds.filter((id): id is string => typeof id === 'string' && VIDEO_ID.test(id)).slice(0, 8) : [];
    if (!videoIds.length) return json({ ok: false, reason: 'invalid' }, 400);
    try {
      const inserted = await addYouTubePlaylistItems(fetch, token.token, playlistId, videoIds);
      if (inserted.stopped) {
        return json(
          {
            ok: false,
            reason: inserted.stopped,
            added: inserted.added,
            playlistId,
            url: youtubePlaylistUrl(playlistId),
          },
          inserted.stopped === 'quota' ? 429 : 403,
        );
      }
      return json({ ok: true, added: inserted.added, playlistId, url: youtubePlaylistUrl(playlistId) });
    } catch {
      return json({ ok: false, reason: 'upstream', added: 0, playlistId, url: youtubePlaylistUrl(playlistId) }, 502);
    }
  }

  return json({ ok: false, reason: 'invalid' }, 400);
}
