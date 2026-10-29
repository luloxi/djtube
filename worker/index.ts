import {
  adminActionStatus,
  adminApiDecision,
  adminHttpStatus,
  decideAdminAction,
  decideUnlimitedRequest,
  hasUnlimitedSearch,
  isOwnerEmail,
  listPeople,
  pendingCount,
  mutationOriginAllowed,
  normalizeEmail,
  parseAdminAction,
} from '../src/lib/access';
import { normalizeSearchQuery, SEARCH_CACHE_SECONDS, youtubeFailure } from '../src/lib/quota';
import { parsePushSubscription, vapidKeysReady } from '../src/lib/push-sub';
import { parseSearchItems } from '../src/lib/youtube-search';
import { handleAccount } from './account';
import { listAll, publicPerson, readPerson, recordVisit, setStatus } from './access-db';
import { authConfig, getAuth, readSession } from './auth';
import { chargeBudget, keyBudget } from './budget';
import type { D1Database } from './d1';
import { notifyAccessRequest, notifyApproved } from './notify';
import { deleteSubscription, saveSubscription } from './push-db';
import { rateLimited, type RateEnv } from './ratelimit';
import { readCachedJson, writeCachedJson } from './yt-cache';
import { handlePlaylist, handleYouTubePlaylist } from './youtube';

interface Env extends RateEnv {
  KEY_VAULT_SECRET?: string;
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
  YT_API_KEY?: string;
  DB?: D1Database;
}

const VIDEO_ID = /^[\w-]{11}$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/health') {
      const blocked = await rateLimited(request, url.pathname, env);
      if (blocked) return blocked;
    }
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) return handleAuth(request, env);
    if (url.pathname === '/api/me') return handleMe(request, env);
    if (url.pathname === '/api/access/request') return handleUnlimitedRequest(request, env);
    if (url.pathname === '/api/admin/people') return handleAdmin(request, env);
    if (url.pathname === '/api/push/key' || url.pathname === '/api/push/subscribe') return handlePush(request, env);
    if (url.pathname.startsWith('/api/account/')) return handleAccount(request, env);
    if (url.pathname === '/api/search') return search(request, url, env);
    if (url.pathname === '/api/playlist') return handlePlaylist(request, env);
    if (url.pathname === '/api/youtube/playlist') return handleYouTubePlaylist(request, env);
    if (url.pathname === '/api/oembed') return oembed(url);
    if (url.pathname.startsWith('/api/')) return json({ ok: false, reason: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const auth = getAuth(env);
  if (!auth) return json({ error: 'Auth is not configured' }, 503);
  return auth.handler(request);
}

async function handleMe(request: Request, env: Env): Promise<Response> {
  const configured = authConfig(env);
  if (!configured) return json({ configured: false, user: null, access: null, allowed: true, unlimited: false, owner: false });
  const session = await readSession(request, env);
  if (!session) return json({ configured: true, user: null, access: null, allowed: true, unlimited: false, owner: false });
  let access: string | null = null;
  if (env.DB) {
    try {
      const person = await recordVisit(
        env.DB,
        {
          email: session.email,
          name: session.name,
          avatar: session.image,
          sessionId: session.sessionId,
        },
        undefined,
        { create: false },
      );
      access = person?.status ?? null;
    } catch {
      try {
        access = (await readPerson(env.DB, session.email))?.status ?? null;
      } catch {
        access = null;
      }
    }
  }
  const email = normalizeEmail(session.email);
  return json({
    configured: true,
    user: { email, name: session.name, image: session.image },
    access,
    allowed: true,
    unlimited: hasUnlimitedSearch(email, access),
    owner: isOwnerEmail(email),
  });
}

async function handleUnlimitedRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  if (!mutationOriginAllowed(request.headers.get('origin'), new URL(request.url).origin)) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }
  const session = await readSession(request, env);
  if (!session || !env.DB) return json({ ok: false, reason: 'unauthorized' }, 401);
  let existing: Awaited<ReturnType<typeof readPerson>> = null;
  try {
    existing = await readPerson(env.DB, session.email);
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
  const decision = decideUnlimitedRequest({
    email: session.email,
    status: existing?.status ?? null,
    exists: Boolean(existing),
  });
  if (!decision.ok) return json({ ok: false, reason: decision.reason }, decision.reason === 'blocked' ? 403 : 401);
  try {
    if (!existing && decision.create) {
      const created = await recordVisit(env.DB, {
        email: session.email,
        name: session.name,
        avatar: session.image,
        sessionId: session.sessionId,
      });
      if (decision.notify && created) await notifyAccessRequest(env, created);
      return json({ ok: true, access: created?.status ?? decision.status, unlimited: decision.unlimited });
    }
    if (existing && existing.status !== decision.status) {
      const updated = await setStatus(env.DB, existing.email, decision.status);
      if (decision.notify && updated) await notifyAccessRequest(env, updated);
      return json({ ok: true, access: updated?.status ?? decision.status, unlimited: decision.unlimited });
    }
    return json({ ok: true, access: existing?.status ?? decision.status, unlimited: decision.unlimited });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
}

async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const configured = authConfig(env);
  const session = configured ? await readSession(request, env) : null;
  const gate = adminApiDecision({ configured, email: session?.email });
  if (gate !== 'ok') return json({ ok: false, reason: gate === 'forbidden' ? 'forbidden' : 'unauthorized' }, adminHttpStatus(gate));
  if (!env.DB) return json({ ok: false, reason: 'unauthorized' }, 401);

  if (request.method === 'GET') {
    const q = (new URL(request.url).searchParams.get('q') ?? '').slice(0, 120);
    try {
      const all = await listAll(env.DB);
      const people = listPeople(all, q).map(publicPerson);
      return json({ ok: true, people, pendingCount: pendingCount(all) });
    } catch {
      return json({ ok: false, reason: 'error' }, 500);
    }
  }

  if (request.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);
  if (!mutationOriginAllowed(request.headers.get('origin'), new URL(request.url).origin)) {
    return json({ ok: false, reason: 'forbidden' }, 403);
  }
  const parsed = parseAdminAction(await request.json().catch(() => null));
  if (!parsed) return json({ ok: false, reason: 'unknown_action' }, adminActionStatus('unknown_action'));

  let before: Awaited<ReturnType<typeof readPerson>> = null;
  try {
    before = await readPerson(env.DB, parsed.email);
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
  const decision = decideAdminAction({
    actorEmail: session?.email,
    targetEmail: parsed.email,
    action: parsed.action,
    targetExists: Boolean(before),
  });
  if (!decision.ok) return json({ ok: false, reason: decision.reason }, adminActionStatus(decision.reason));
  try {
    const updated = await setStatus(env.DB, parsed.email, decision.status);
    if (!updated) return json({ ok: false, reason: 'not_found' }, 404);
    if (decision.status === 'approved' && before?.status !== 'approved') {
      await notifyApproved(env, updated.email);
    }
    return json({ ok: true, person: publicPerson(updated) });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
}

async function handlePush(request: Request, env: Env): Promise<Response> {
  const session = authConfig(env) ? await readSession(request, env) : null;
  if (!session) return json({ ok: false, reason: 'unauthorized' }, 401);
  const email = normalizeEmail(session.email);
  if (!email) return json({ ok: false, reason: 'unauthorized' }, 401);
  const url = new URL(request.url);
  if (url.pathname === '/api/push/key') {
    if (request.method !== 'GET') return json({ ok: false, reason: 'method' }, 405);
    if (!vapidKeysReady(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)) return json({ ok: false, reason: 'unconfigured' }, 503);
    return json({ ok: true, publicKey: env.VAPID_PUBLIC_KEY!.trim() });
  }
  if (!env.DB) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (!mutationOriginAllowed(request.headers.get('origin'), url.origin)) return json({ ok: false, reason: 'forbidden' }, 403);
  if (request.method === 'DELETE') {
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint.trim() : '';
    if (!endpoint.startsWith('https://') || endpoint.length > 2000) return json({ ok: false, reason: 'invalid' }, 400);
    try {
      await deleteSubscription(env.DB, email, endpoint);
      return json({ ok: true });
    } catch {
      return json({ ok: false, reason: 'error' }, 500);
    }
  }
  if (request.method !== 'PUT') return json({ ok: false, reason: 'method' }, 405);
  const parsed = parsePushSubscription(await request.json().catch(() => null));
  if (!parsed) return json({ ok: false, reason: 'invalid' }, 400);
  try {
    await saveSubscription(env.DB, email, parsed);
    return json({ ok: true });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
}

async function search(request: Request, url: URL, env: Env): Promise<Response> {
  if (url.searchParams.get('probe')) {
    return json(env.YT_API_KEY ? { ok: true, items: [] } : { ok: false, reason: 'missing_key', items: [] });
  }
  const q = normalizeSearchQuery(url.searchParams.get('q') ?? '');
  if (!q) return json({ ok: true, items: [] });

  const kind = url.searchParams.get('type') === 'playlist' ? 'playlist' : 'video';
  const cacheId = kind === 'playlist' ? `search:playlist:${q}` : `search:${q}`;
  const cached = await readCachedJson(cacheId);
  if (cached && typeof cached === 'object' && (cached as { ok?: boolean }).ok === true) return json(cached);

  if (!env.YT_API_KEY) return json({ ok: false, reason: 'missing_key', items: [] });
  const budget = await keyBudget(request, env);
  if (budget.action === 'deny') return json({ ok: false, reason: 'limit', items: [] }, 429);

  const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
  endpoint.searchParams.set('part', 'snippet');
  endpoint.searchParams.set('type', kind);
  endpoint.searchParams.set('maxResults', '8');
  endpoint.searchParams.set('q', q);
  endpoint.searchParams.set('key', env.YT_API_KEY);

  try {
    const upstream = await fetch(endpoint);
    const data = await upstream.json().catch(() => null);
    await chargeBudget(env, budget);
    const failure = youtubeFailure(upstream.status, data);
    if (failure === 'quota') return json({ ok: false, reason: 'quota', items: [] }, 429);
    if (!upstream.ok || failure) return json({ ok: false, reason: 'upstream', items: [] });
    const body = { ok: true, items: parseSearchItems(data, kind) };
    await writeCachedJson(cacheId, body, SEARCH_CACHE_SECONDS);
    return json(body);
  } catch {
    await chargeBudget(env, budget);
    return json({ ok: false, reason: 'upstream', items: [] });
  }
}

async function oembed(url: URL): Promise<Response> {
  const id = url.searchParams.get('v') ?? '';
  if (!VIDEO_ID.test(id)) return json({ ok: false });
  try {
    const upstream = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
    );
    if (!upstream.ok) return json({ ok: false });
    const data = (await upstream.json()) as { title?: string; thumbnail_url?: string };
    if (!data.title) return json({ ok: false });
    return json({ ok: true, title: data.title, thumbnail_url: data.thumbnail_url ?? null });
  } catch {
    return json({ ok: false });
  }
}
