import { describe, expect, it } from 'vitest';
import {
  OWNER_EMAIL,
  AUTH_HOSTS,
  GOOGLE_REDIRECT_URIS,
  adminActionStatus,
  adminApiDecision,
  adminHttpStatus,
  authIsConfigured,
  clientMayAdmin,
  clientMayEnter,
  decideAdminAction,
  decideUnlimitedRequest,
  hasUnlimitedSearch,
  listPeople,
  pendingCount,
  mutationOriginAllowed,
  parseAdminAction,
  screenFor,
  touchVisit,
  type AccessPerson,
} from './access';

const secret = 'x'.repeat(32);
const configured = { database: true, secret, googleClientId: 'google-client', googleClientSecret: 'google-secret' };

function person(partial: Partial<AccessPerson> & Pick<AccessPerson, 'email' | 'status' | 'lastSeen'>): AccessPerson {
  return {
    name: null,
    avatar: null,
    firstSeen: partial.lastSeen,
    visitCount: 1,
    lastSessionId: 's1',
    ...partial,
  };
}

describe('auth configuration fails closed', () => {
  it('requires the database, a 32+ secret, and both Google credentials', () => {
    expect(authIsConfigured(configured)).toBe(true);
    expect(authIsConfigured({ ...configured, database: false })).toBe(false);
    expect(authIsConfigured({ ...configured, secret: 'short' })).toBe(false);
    expect(authIsConfigured({ ...configured, secret: '   ' })).toBe(false);
    expect(authIsConfigured({ ...configured, googleClientId: '' })).toBe(false);
    expect(authIsConfigured({ ...configured, googleClientId: '  ' })).toBe(false);
    expect(authIsConfigured({ ...configured, googleClientSecret: null })).toBe(false);
    expect(authIsConfigured({ database: true })).toBe(false);
  });

  it('does not let a missing login config open /admin, but the mixer stays open', () => {
    expect(clientMayEnter()).toBe(true);
    expect(clientMayAdmin({ configured: false, email: OWNER_EMAIL })).toBe(false);
    expect(adminApiDecision({ configured: false, email: OWNER_EMAIL })).toBe('unconfigured');
    expect(adminHttpStatus('unconfigured')).toBe(503);
    expect(screenFor({ loaded: true, failed: false, configured: false, email: OWNER_EMAIL, access: 'approved', path: '/admin' })).toBe('unconfigured');
    expect(screenFor({ loaded: true, failed: false, configured: false, email: null, access: null, path: '/' })).toBe('app');
  });
});

describe('unlimited search', () => {
  it('always includes the owner, and other people only when approved', () => {
    for (const status of ['pending', 'approved', 'revoked', 'blocked', null, 'nope'] as const) {
      expect(hasUnlimitedSearch('  LucianoOlivaBianco@gmail.com ', status)).toBe(true);
    }
    expect(hasUnlimitedSearch('ana@example.com', 'approved')).toBe(true);
    for (const status of ['pending', 'revoked', 'blocked', null, '', 'approved '] as const) {
      expect(hasUnlimitedSearch('ana@example.com', status)).toBe(false);
    }
    expect(hasUnlimitedSearch('', 'approved')).toBe(false);
    expect(hasUnlimitedSearch(null, 'approved')).toBe(false);
  });

  it('opens a request only from a button, and does not ask twice', () => {
    expect(decideUnlimitedRequest({ email: null, status: null, exists: false })).toEqual({ ok: false, reason: 'unauthorized' });
    expect(decideUnlimitedRequest({ email: OWNER_EMAIL, status: null, exists: false })).toEqual({
      ok: true,
      status: 'approved',
      notify: false,
      unlimited: true,
      create: false,
    });
    expect(decideUnlimitedRequest({ email: 'ana@example.com', status: null, exists: false })).toEqual({
      ok: true,
      status: 'pending',
      notify: true,
      unlimited: false,
      create: true,
    });
    expect(decideUnlimitedRequest({ email: 'ana@example.com', status: 'revoked', exists: true })).toMatchObject({ notify: true, status: 'pending', create: false });
    expect(decideUnlimitedRequest({ email: 'ana@example.com', status: 'pending', exists: true })).toMatchObject({ notify: false, unlimited: false });
    expect(decideUnlimitedRequest({ email: 'ana@example.com', status: 'approved', exists: true })).toMatchObject({ notify: false, unlimited: true });
    expect(decideUnlimitedRequest({ email: 'ana@example.com', status: 'blocked', exists: true })).toEqual({ ok: false, reason: 'blocked' });
  });
});

describe('screens', () => {
  const base = { loaded: true, failed: false, configured: true, path: '/' };

  it('opens the mixer for everyone, signed in or not', () => {
    expect(screenFor({ ...base, loaded: false, email: null, access: null })).toBe('app');
    expect(screenFor({ ...base, loaded: false, failed: true, email: null, access: null })).toBe('app');
    expect(screenFor({ ...base, email: null, access: null })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending' })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'revoked' })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'blocked' })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved' })).toBe('app');
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'blocked' })).toBe('app');
  });

  it('keeps /admin on the owner, and does not show it to anyone else', () => {
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'approved', path: '/admin' })).toBe('admin');
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'blocked', path: '/admin/' })).toBe('admin');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved', path: '/admin' })).toBe('admin-denied');
    expect(screenFor({ ...base, email: null, access: null, path: '/admin' })).toBe('anonymous');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending', path: '/admin' })).toBe('admin-denied');
    expect(screenFor({ ...base, loaded: false, email: null, access: null, path: '/admin' })).toBe('loading');
    expect(screenFor({ ...base, loaded: false, failed: true, email: null, access: null, path: '/admin' })).toBe('error');
  });

  it('does not keep a separate sync gate', () => {
    expect(screenFor({ ...base, email: null, access: null, path: '/sync' })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending', path: '/sync/' })).toBe('app');
  });
});

describe('admin actions', () => {
  it('only the owner can approve, revoke, or block, and the owner cannot be locked out', () => {
    expect(decideAdminAction({ actorEmail: null, targetEmail: 'ana@example.com', action: 'approve', targetExists: true })).toEqual({
      ok: false,
      reason: 'unauthorized',
    });
    expect(decideAdminAction({ actorEmail: 'ana@example.com', targetEmail: 'ana@example.com', action: 'approve', targetExists: true })).toEqual({
      ok: false,
      reason: 'forbidden',
    });
    expect(adminApiDecision({ configured: true, email: 'ana@example.com' })).toBe('forbidden');
    expect(adminHttpStatus('forbidden')).toBe(403);
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: 'ana@example.com', action: 'approve', targetExists: true })).toEqual({
      ok: true,
      status: 'approved',
    });
    expect(decideAdminAction({ actorEmail: ` ${OWNER_EMAIL.toUpperCase()} `, targetEmail: 'ana@example.com', action: 'revoke', targetExists: true })).toEqual({
      ok: true,
      status: 'revoked',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: 'ana@example.com', action: 'block', targetExists: true })).toEqual({
      ok: true,
      status: 'blocked',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: OWNER_EMAIL, action: 'revoke', targetExists: true })).toEqual({
      ok: false,
      reason: 'owner_locked',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: OWNER_EMAIL, action: 'block', targetExists: true })).toEqual({
      ok: false,
      reason: 'owner_locked',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: OWNER_EMAIL, action: 'approve', targetExists: true })).toEqual({
      ok: true,
      status: 'approved',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: 'missing@example.com', action: 'approve', targetExists: false })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(decideAdminAction({ actorEmail: OWNER_EMAIL, targetEmail: 'ana@example.com', action: 'delete', targetExists: true })).toEqual({
      ok: false,
      reason: 'unknown_action',
    });
    expect(adminActionStatus('unauthorized')).toBe(401);
    expect(adminActionStatus('forbidden')).toBe(403);
    expect(adminActionStatus('owner_locked')).toBe(403);
    expect(adminActionStatus('not_found')).toBe(404);
    expect(adminActionStatus('unknown_action')).toBe(400);
  });

  it('parses the admin body and checks the origin', () => {
    expect(parseAdminAction({ email: ' Ana@Example.com ', action: 'approve' })).toEqual({ email: 'Ana@Example.com', action: 'approve' });
    expect(parseAdminAction(null)).toBeNull();
    expect(parseAdminAction({ email: '', action: 'approve' })).toBeNull();
    expect(parseAdminAction({ email: 'a@b.c' })).toBeNull();
    const origin = 'https://djtube.lucianoolivabianco.workers.dev';
    expect(mutationOriginAllowed(origin, `${origin}/api/admin/people`)).toBe(true);
    expect(mutationOriginAllowed('https://evil.example', origin)).toBe(false);
    expect(mutationOriginAllowed(null, origin)).toBe(false);
    expect(mutationOriginAllowed('not a url', origin)).toBe(false);
  });
});

describe('visit record', () => {
  const now = '2026-10-25T18:00:00.000Z';
  const later = '2026-10-25T19:00:00.000Z';

  it('stores a new person as pending, and the owner row as approved, with one visit', () => {
    const guest = touchVisit(null, { email: ' Ana@Example.com ', name: ' Ana ', avatar: ' https://img/a ', sessionId: 's1', now });
    expect(guest).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana',
      avatar: 'https://img/a',
      status: 'pending',
      firstSeen: now,
      lastSeen: now,
      visitCount: 1,
      lastSessionId: 's1',
    });
    const owner = touchVisit(null, { email: OWNER_EMAIL, name: 'Luciano', avatar: null, sessionId: 'own', now });
    expect(owner?.status).toBe('approved');
    expect(hasUnlimitedSearch(owner?.email, 'blocked')).toBe(true);
  });

  it('bumps the visit only when the session changes and never rewrites status', () => {
    const existing = person({
      email: 'ana@example.com',
      name: 'Ana',
      status: 'approved',
      firstSeen: '2026-10-01T00:00:00.000Z',
      lastSeen: now,
      visitCount: 2,
      lastSessionId: 's1',
    });
    const refresh = touchVisit(existing, { email: 'ana@example.com', name: null, avatar: null, sessionId: 's1', now: later });
    expect(refresh).toMatchObject({ status: 'approved', visitCount: 2, lastSeen: later, firstSeen: existing.firstSeen, name: 'Ana' });
    const next = touchVisit(existing, { email: 'ana@example.com', name: 'Ana B', avatar: null, sessionId: 's2', now: later });
    expect(next).toMatchObject({ status: 'approved', visitCount: 3, lastSessionId: 's2', name: 'Ana B' });
    const blocked = person({ email: 'ana@example.com', status: 'blocked', lastSeen: now, lastSessionId: 's1' });
    expect(touchVisit(blocked, { email: 'ana@example.com', name: 'Ana', avatar: null, sessionId: 's9', now: later })?.status).toBe('blocked');
    const noSession = touchVisit(existing, { email: 'ana@example.com', name: 'Ana', avatar: null, sessionId: null, now: later });
    expect(noSession?.visitCount).toBe(2);
    expect(noSession?.lastSessionId).toBe('s1');
  });

  it('lists people by last seen and filters name or email', () => {
    const people = [
      person({ email: 'ana@example.com', name: 'Ana', status: 'pending', lastSeen: '2026-10-20T00:00:00.000Z' }),
      person({ email: 'bobo@example.com', name: 'Bobo', status: 'approved', lastSeen: '2026-10-24T00:00:00.000Z' }),
      person({ email: OWNER_EMAIL, name: 'Luciano', status: 'approved', lastSeen: '2026-10-22T00:00:00.000Z' }),
    ];
    expect(listPeople(people, '').map((item) => item.email)).toEqual([
      'bobo@example.com',
      OWNER_EMAIL,
      'ana@example.com',
    ]);
    expect(listPeople(people, 'LUCI').map((item) => item.email)).toEqual([OWNER_EMAIL]);
    expect(listPeople(people, 'ana@').map((item) => item.email)).toEqual(['ana@example.com']);
    expect(listPeople(people, 'nope')).toEqual([]);
  });

  it('counts pending access requests', () => {
    const people = [
      person({ email: 'ana@example.com', status: 'pending', lastSeen: now }),
      person({ email: 'bobo@example.com', status: 'approved', lastSeen: now }),
      person({ email: 'cara@example.com', status: 'pending', lastSeen: now }),
      person({ email: 'dina@example.com', status: 'blocked', lastSeen: now }),
    ];
    expect(pendingCount(people)).toBe(2);
    expect(pendingCount([])).toBe(0);
  });
});

describe('google redirect', () => {
  it('is exactly the workers.dev and custom-domain callbacks', () => {
    expect([...GOOGLE_REDIRECT_URIS]).toEqual([
      'https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google',
      'https://dj.lulox.com.ar/api/auth/callback/google',
    ]);
    expect(GOOGLE_REDIRECT_URIS).toHaveLength(2);
    expect(AUTH_HOSTS.some((host) => host.includes('*'))).toBe(false);
    expect([...AUTH_HOSTS]).toEqual([
      'djtube.lucianoolivabianco.workers.dev',
      'dj.lulox.com.ar',
      'localhost',
      'localhost:5173',
      'localhost:8787',
    ]);
  });
});
