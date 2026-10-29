import { mutationOriginAllowed, normalizeEmail } from '../src/lib/access';
import {
  ACCOUNT_BODY_MAX,
  PLAYLISTS_PER_USER,
  cleanAccountKey,
  cleanPlaylistName,
  cleanTracks,
} from '../src/lib/account-data';
import {
  countPlaylists,
  createPlaylist,
  deleteKeyCipher,
  deletePlaylist,
  listPlaylists,
  readKeyCipher,
  readPlaylist,
  renamePlaylist,
  writeKeyCipher,
} from './account-db';
import { authConfig, readSession, type AuthEnv } from './auth';
import { openSecret, sealSecret, vaultReady } from './secret-box';

export type AccountEnv = AuthEnv & { KEY_VAULT_SECRET?: string };

const PLAYLIST_ID = /^[0-9a-f-]{36}$/;

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

async function readBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > ACCOUNT_BODY_MAX) return undefined;
  const text = await request.text().catch(() => '');
  if (text.length > ACCOUNT_BODY_MAX) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * /api/account/key and /api/account/playlists[/:id]. Signed-in only. Everything is scoped to the
 * session's own address, never to anything the request names. Nothing here logs a body or a key.
 */
export async function handleAccount(request: Request, env: AccountEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!authConfig(env) || !env.DB) return reply({ ok: false, reason: 'unauthorized' }, 401);
  const session = await readSession(request, env);
  const email = session ? normalizeEmail(session.email) : '';
  if (!email) return reply({ ok: false, reason: 'unauthorized' }, 401);
  const db = env.DB;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (request.method === 'GET') {
    if (fetchSite && fetchSite !== 'same-origin') return reply({ ok: false, reason: 'forbidden' }, 403);
  } else if (!mutationOriginAllowed(request.headers.get('origin'), url.origin)) {
    return reply({ ok: false, reason: 'forbidden' }, 403);
  }

  try {
    if (url.pathname === '/api/account/key') return await handleKey(request, env, db, email);
    if (url.pathname === '/api/account/playlists') return await handlePlaylists(request, db, email);
    const match = /^\/api\/account\/playlists\/([^/]+)$/.exec(url.pathname);
    if (match) {
      if (!PLAYLIST_ID.test(match[1])) return reply({ ok: false, reason: 'not_found' }, 404);
      return await handlePlaylist(request, db, email, match[1]);
    }
    return reply({ ok: false, reason: 'not_found' }, 404);
  } catch {
    return reply({ ok: false, reason: 'error' }, 500);
  }
}

async function handleKey(request: Request, env: AccountEnv, db: NonNullable<AccountEnv['DB']>, email: string): Promise<Response> {
  if (!vaultReady(env.KEY_VAULT_SECRET)) return reply({ ok: false, reason: 'unconfigured' }, 503);
  const secret = env.KEY_VAULT_SECRET;
  if (request.method === 'GET') {
    const cipher = await readKeyCipher(db, email);
    if (!cipher) return reply({ ok: true, key: null });
    const key = await openSecret(secret, cipher, email);
    if (!key) return reply({ ok: false, reason: 'error' }, 500);
    return reply({ ok: true, key });
  }
  if (request.method === 'PUT') {
    const body = (await readBody(request)) as { key?: unknown } | null | undefined;
    if (body === undefined) return reply({ ok: false, reason: 'too_large' }, 413);
    const key = cleanAccountKey(body?.key);
    if (!key) return reply({ ok: false, reason: 'invalid' }, 400);
    await writeKeyCipher(db, email, await sealSecret(secret, key, email));
    return reply({ ok: true });
  }
  if (request.method === 'DELETE') {
    await deleteKeyCipher(db, email);
    return reply({ ok: true });
  }
  return reply({ ok: false, reason: 'method' }, 405);
}

async function handlePlaylists(request: Request, db: NonNullable<AccountEnv['DB']>, email: string): Promise<Response> {
  if (request.method === 'GET') return reply({ ok: true, playlists: await listPlaylists(db, email) });
  if (request.method !== 'POST') return reply({ ok: false, reason: 'method' }, 405);
  const body = (await readBody(request)) as { name?: unknown; tracks?: unknown } | null | undefined;
  if (body === undefined) return reply({ ok: false, reason: 'too_large' }, 413);
  const name = cleanPlaylistName(body?.name);
  const tracks = cleanTracks(body?.tracks);
  if (!name || !tracks) return reply({ ok: false, reason: 'invalid' }, 400);
  if ((await countPlaylists(db, email)) >= PLAYLISTS_PER_USER) return reply({ ok: false, reason: 'limit' }, 409);
  return reply({ ok: true, playlist: await createPlaylist(db, email, name, tracks) }, 201);
}

async function handlePlaylist(request: Request, db: NonNullable<AccountEnv['DB']>, email: string, id: string): Promise<Response> {
  if (request.method === 'GET') {
    const found = await readPlaylist(db, email, id);
    if (!found) return reply({ ok: false, reason: 'not_found' }, 404);
    return reply({ ok: true, playlist: found.summary, tracks: found.tracks });
  }
  if (request.method === 'PATCH') {
    const body = (await readBody(request)) as { name?: unknown } | null | undefined;
    if (body === undefined) return reply({ ok: false, reason: 'too_large' }, 413);
    const name = cleanPlaylistName(body?.name);
    if (!name) return reply({ ok: false, reason: 'invalid' }, 400);
    if (!(await renamePlaylist(db, email, id, name))) return reply({ ok: false, reason: 'not_found' }, 404);
    return reply({ ok: true });
  }
  if (request.method === 'DELETE') {
    if (!(await deletePlaylist(db, email, id))) return reply({ ok: false, reason: 'not_found' }, 404);
    return reply({ ok: true });
  }
  return reply({ ok: false, reason: 'method' }, 405);
}
