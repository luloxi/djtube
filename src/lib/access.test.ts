import { describe, expect, it } from 'vitest';
import {
  OWNER_EMAIL,
  GOOGLE_REDIRECT_URI,
  adminActionStatus,
  adminApiDecision,
  adminHttpStatus,
  appApiDecision,
  appApiStatus,
  authIsConfigured,
  canUseApp,
  clientMayAdmin,
  clientMayEnter,
  decideAdminAction,
  holdMessage,
  listPeople,
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

  it('does not let the owner through when login is not configured', () => {
    expect(clientMayEnter({ configured: false, email: OWNER_EMAIL, access: 'approved' })).toBe(false);
    expect(clientMayAdmin({ configured: false, email: OWNER_EMAIL })).toBe(false);
    expect(appApiDecision({ configured: false, email: OWNER_EMAIL, status: 'approved' })).toBe('unconfigured');
    expect(appApiStatus('unconfigured')).toBe(401);
    expect(adminApiDecision({ configured: false, email: OWNER_EMAIL })).toBe('unconfigured');
    expect(adminHttpStatus('unconfigured')).toBe(503);
    expect(screenFor({ loaded: true, failed: false, configured: false, email: OWNER_EMAIL, access: 'approved', path: '/admin' })).toBe('unconfigured');
    expect(screenFor({ loaded: true, failed: false, configured: false, email: null, access: null, path: '/' })).toBe('unconfigured');
  });
});

describe('who can use the app', () => {
  it('always allows the owner email, whatever the stored status is', () => {
    for (const status of ['pending', 'approved', 'revoked', 'blocked', null, 'nope'] as const) {
      expect(canUseApp('  LucianoOlivaBianco@gmail.com ', status)).toBe(true);
    }
  });

  it('allows other people only when the status is approved', () => {
    expect(canUseApp('ana@example.com', 'approved')).toBe(true);
    for (const status of ['pending', 'revoked', 'blocked', null, '', 'approved '] as const) {
      expect(canUseApp('ana@example.com', status)).toBe(false);
    }
    expect(canUseApp('', 'approved')).toBe(false);
    expect(canUseApp(null, 'approved')).toBe(false);
  });

  it('rejects search and oEmbed for everyone who is not approved', () => {
    expect(appApiDecision({ configured: true, email: null, status: null })).toBe('unauthorized');
    expect(appApiDecision({ configured: true, email: 'ana@example.com', status: 'pending' })).toBe('unauthorized');
    expect(appApiDecision({ configured: true, email: 'ana@example.com', status: 'revoked' })).toBe('unauthorized');
    expect(appApiDecision({ configured: true, email: 'ana@example.com', status: 'blocked' })).toBe('unauthorized');
    expect(appApiDecision({ configured: true, email: 'ana@example.com', status: null })).toBe('unauthorized');
    expect(appApiStatus('unauthorized')).toBe(401);
    expect(appApiDecision({ configured: true, email: 'ana@example.com', status: 'approved' })).toBe('ok');
    expect(appApiDecision({ configured: true, email: OWNER_EMAIL, status: 'blocked' })).toBe('ok');
  });
});

describe('screens', () => {
  const base = { loaded: true, failed: false, configured: true, path: '/' };

  it('shows a landing, a hold, or the mixer', () => {
    expect(screenFor({ ...base, loaded: false, email: null, access: null })).toBe('loading');
    expect(screenFor({ ...base, loaded: false, failed: true, email: null, access: null })).toBe('error');
    expect(screenFor({ ...base, email: null, access: null })).toBe('anonymous');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending' })).toBe('hold');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'revoked' })).toBe('hold');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'blocked' })).toBe('hold');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved' })).toBe('app');
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'blocked' })).toBe('app');
  });

  it('keeps /admin on the owner, and does not show it to anyone else', () => {
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'approved', path: '/admin' })).toBe('admin');
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'blocked', path: '/admin/' })).toBe('admin');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved', path: '/admin' })).toBe('admin-denied');
    expect(screenFor({ ...base, email: null, access: null, path: '/admin' })).toBe('anonymous');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending', path: '/admin' })).toBe('hold');
  });

  it('keeps /sync behind the same gate as the mixer', () => {
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved', path: '/sync' })).toBe('app');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'approved', path: '/sync/' })).toBe('app');
    expect(screenFor({ ...base, email: OWNER_EMAIL, access: 'blocked', path: '/sync' })).toBe('app');
    expect(screenFor({ ...base, email: null, access: null, path: '/sync' })).toBe('anonymous');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'pending', path: '/sync' })).toBe('hold');
    expect(screenFor({ ...base, email: 'ana@example.com', access: 'blocked', path: '/sync' })).toBe('hold');
  });

  it('uses the calm copy for people who are waiting or blocked', () => {
    expect(holdMessage('pending')).toBe('Pedí acceso, Luciano te habilita');
    expect(holdMessage('revoked')).toBe('Pedí acceso, Luciano te habilita');
    expect(holdMessage(null)).toBe('Pedí acceso, Luciano te habilita');
    expect(holdMessage('blocked')).toBe('Acceso bloqueado');
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
    expect(canUseApp(owner?.email, 'blocked')).toBe(true);
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
});

describe('google redirect', () => {
  it('is the workers.dev callback and nothing else', () => {
    expect(GOOGLE_REDIRECT_URI).toBe('https://djtube.lucianoolivabianco.workers.dev/api/auth/callback/google');
  });
});
