import {
  adminActionStatus,
  adminApiDecision,
  adminHttpStatus,
  appApiDecision,
  appApiStatus,
  canUseApp,
  decideAdminAction,
  isOwnerEmail,
  listPeople,
  pendingCount,
  mutationOriginAllowed,
  normalizeEmail,
  parseAdminAction,
} from '../src/lib/access';
import { parseAnalysisPut } from '../src/lib/analysis';
import { listAll, publicPerson, readPerson, recordVisit, setStatus } from './access-db';
import { listAnalysis, readAnalysis, upsertAnalysis } from './analysis-db';
import { authConfig, getAuth, readSession, type AuthEnv } from './auth';
import type { D1Database } from './d1';

interface Env extends AuthEnv {
  ASSETS: { fetch(input: Request | URL | string): Promise<Response> };
  YT_API_KEY?: string;
  DB?: D1Database;
}

type SearchItem = {
  videoId: string;
  title: string;
  thumbnail: string | null;
  channel: string;
};

const VIDEO_ID = /^[\w-]{11}$/;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname === '/api/auth' || url.pathname.startsWith('/api/auth/')) return handleAuth(request, env);
    if (url.pathname === '/api/me') return handleMe(request, env);
    if (url.pathname === '/api/admin/people') return handleAdmin(request, env);
    if (url.pathname === '/api/analysis') {
      const denied = await requireApp(request, env);
      if (denied) return denied;
      const session = await readSession(request, env);
      if (!session) return json({ ok: false, reason: 'unauthorized' }, 401);
      return handleAnalysis(request, env, normalizeEmail(session.email));
    }
    if (url.pathname === '/api/search') {
      const denied = await requireApp(request, env);
      if (denied) return denied;
      return search(url, env);
    }
    if (url.pathname === '/api/oembed') {
      const denied = await requireApp(request, env);
      if (denied) return denied;
      return oembed(url);
    }
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
  if (!configured) return json({ configured: false, user: null, access: null, allowed: false, owner: false });
  const session = await readSession(request, env);
  if (!session) return json({ configured: true, user: null, access: null, allowed: false, owner: false });
  let access: string | null = null;
  if (env.DB) {
    try {
      const person = await recordVisit(env.DB, {
        email: session.email,
        name: session.name,
        avatar: session.image,
        sessionId: session.sessionId,
      });
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
    allowed: canUseApp(email, access),
    owner: isOwnerEmail(email),
  });
}

async function requireApp(request: Request, env: Env): Promise<Response | null> {
  const configured = authConfig(env);
  if (!configured) return json({ ok: false, reason: 'unauthorized' }, appApiStatus('unconfigured'));
  const session = await readSession(request, env);
  let status: string | null = null;
  if (session && env.DB) {
    try {
      status = (await readPerson(env.DB, session.email))?.status ?? null;
    } catch {
      status = null;
    }
  }
  const decision = appApiDecision({ configured: true, email: session?.email, status });
  if (decision !== 'ok') return json({ ok: false, reason: 'unauthorized' }, appApiStatus(decision));
  return null;
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

  let exists = false;
  try {
    exists = Boolean(await readPerson(env.DB, parsed.email));
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
  const decision = decideAdminAction({
    actorEmail: session?.email,
    targetEmail: parsed.email,
    action: parsed.action,
    targetExists: exists,
  });
  if (!decision.ok) return json({ ok: false, reason: decision.reason }, adminActionStatus(decision.reason));
  try {
    const updated = await setStatus(env.DB, parsed.email, decision.status);
    if (!updated) return json({ ok: false, reason: 'not_found' }, 404);
    return json({ ok: true, person: publicPerson(updated) });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
}

async function handleAnalysis(request: Request, env: Env, email: string): Promise<Response> {
  if (!env.DB || !email) return json({ ok: false, reason: 'unauthorized' }, 401);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const videoId = url.searchParams.get('videoId') ?? '';
    try {
      if (!videoId) return json({ ok: true, items: await listAnalysis(env.DB, email) });
      if (!/^[\w-]{11}$/.test(videoId)) return json({ ok: false, reason: 'invalid' }, 400);
      const analysis = await readAnalysis(env.DB, email, videoId);
      if (!analysis) return json({ ok: false, reason: 'not_found' }, 404);
      return json({ ok: true, analysis });
    } catch {
      return json({ ok: false, reason: 'error' }, 500);
    }
  }
  if (request.method !== 'PUT') return json({ ok: false, reason: 'method' }, 405);
  if (!mutationOriginAllowed(request.headers.get('origin'), url.origin)) return json({ ok: false, reason: 'forbidden' }, 403);
  const parsed = parseAnalysisPut(await request.json().catch(() => null));
  if (!parsed) return json({ ok: false, reason: 'invalid' }, 400);
  try {
    const analysis = await upsertAnalysis(env.DB, email, parsed);
    return json({ ok: true, analysis });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
}

async function search(url: URL, env: Env): Promise<Response> {
  if (!env.YT_API_KEY) {
    return json({ ok: false, reason: 'missing_key', items: [] });
  }
  const probe = url.searchParams.get('probe');
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (probe || !q) return json({ ok: true, items: [] });

  const endpoint = new URL('https://www.googleapis.com/youtube/v3/search');
  endpoint.searchParams.set('part', 'snippet');
  endpoint.searchParams.set('type', 'video');
  endpoint.searchParams.set('maxResults', '8');
  endpoint.searchParams.set('q', q);
  endpoint.searchParams.set('key', env.YT_API_KEY);

  try {
    const upstream = await fetch(endpoint);
    if (!upstream.ok) {
      return json({ ok: false, reason: 'upstream', items: [] });
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
    return json({ ok: true, items });
  } catch {
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
