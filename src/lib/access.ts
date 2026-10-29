/** Who may mix, and who may change that. The worker enforces the same functions. */

export const OWNER_EMAIL = 'lucianoolivabianco@gmail.com';

export const CANONICAL_ORIGIN = 'https://djtube.lucianoolivabianco.workers.dev';
export const CUSTOM_ORIGIN = 'https://dj.lulox.com.ar';
export const AUTH_BASE_PATH = '/api/auth';
/** Exact hosts Better Auth may use. No wildcards. */
export const AUTH_HOSTS = [
  'djtube.lucianoolivabianco.workers.dev',
  'dj.lulox.com.ar',
  'localhost',
  'localhost:5173',
  'localhost:8787',
] as const;
/** Exact Google OAuth redirects. Register these two and no others. */
export const GOOGLE_REDIRECT_URIS = [
  `${CANONICAL_ORIGIN}${AUTH_BASE_PATH}/callback/google`,
  `${CUSTOM_ORIGIN}${AUTH_BASE_PATH}/callback/google`,
] as const;
export const GOOGLE_REDIRECT_URI = GOOGLE_REDIRECT_URIS[0];

export const ACCESS_STATUSES = ['pending', 'approved', 'revoked', 'blocked'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];
export type AccessAction = 'approve' | 'revoke' | 'block';

export type AccessPerson = {
  email: string;
  name: string | null;
  avatar: string | null;
  status: AccessStatus;
  firstSeen: string;
  lastSeen: string;
  visitCount: number;
  lastSessionId: string | null;
};

export type AuthConfig = {
  database: boolean;
  secret?: string | null;
  googleClientId?: string | null;
  googleClientSecret?: string | null;
};

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email) === OWNER_EMAIL;
}

export function isAccessStatus(value: unknown): value is AccessStatus {
  return typeof value === 'string' && (ACCESS_STATUSES as readonly string[]).includes(value);
}

function filled(value: string | null | undefined, min = 1): boolean {
  return typeof value === 'string' && value.trim().length >= min;
}

/**
 * Fail closed. Google credentials, a long auth secret, and the D1 binding
 * all have to be present. The owner is not an exception.
 */
export function authIsConfigured(config: AuthConfig): boolean {
  return Boolean(config.database) && filled(config.secret, 32) && filled(config.googleClientId) && filled(config.googleClientSecret);
}

/**
 * The mixer is public. `approved` is no longer the door: it means this
 * signed-in account may search with the shared key and no daily cap.
 * The owner is always in that set.
 */
export function hasUnlimitedSearch(email: string | null | undefined, status: AccessStatus | string | null | undefined): boolean {
  if (isOwnerEmail(email)) return true;
  if (!normalizeEmail(email)) return false;
  return status === 'approved';
}

export function initialStatusFor(email: string): AccessStatus {
  return isOwnerEmail(email) ? 'approved' : 'pending';
}

/** Anyone can open the mixer, including when Google login is not configured. */
export function clientMayEnter(): boolean {
  return true;
}

export function clientMayAdmin(input: { configured: boolean; email: string | null | undefined }): boolean {
  if (!input.configured) return false;
  return isOwnerEmail(input.email);
}

export type Screen = 'loading' | 'error' | 'unconfigured' | 'anonymous' | 'admin-denied' | 'admin' | 'app';

export function normalizePath(path: string): string {
  const bare = path.trim().split('?')[0]?.split('#')[0] ?? '';
  const collapsed = bare.replace(/\/+$/, '');
  return collapsed || '/';
}

/**
 * The mixer is public. `/admin` still belongs to the owner.
 * `loaded` / `failed` only matter there: a slow `/api/me` must not hide the decks.
 */
export function screenFor(input: {
  loaded: boolean;
  failed: boolean;
  configured: boolean;
  email: string | null | undefined;
  access: AccessStatus | string | null | undefined;
  path: string;
}): Screen {
  if (normalizePath(input.path) !== '/admin') return 'app';
  if (!input.loaded) return input.failed ? 'error' : 'loading';
  if (!input.configured) return 'unconfigured';
  const email = normalizeEmail(input.email);
  if (!email) return 'anonymous';
  return isOwnerEmail(email) ? 'admin' : 'admin-denied';
}

export type UnlimitedRequest =
  | { ok: true; status: AccessStatus; notify: boolean; unlimited: boolean; create: boolean }
  | { ok: false; reason: 'unauthorized' | 'blocked' };

/** A signed-in person asks to be on the unlimited-search list. Login alone does not. */
export function decideUnlimitedRequest(input: {
  email: string | null | undefined;
  status: AccessStatus | string | null | undefined;
  exists: boolean;
}): UnlimitedRequest {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, reason: 'unauthorized' };
  if (isOwnerEmail(email)) return { ok: true, status: 'approved', notify: false, unlimited: true, create: false };
  if (input.status === 'blocked') return { ok: false, reason: 'blocked' };
  if (input.status === 'approved') return { ok: true, status: 'approved', notify: false, unlimited: true, create: false };
  if (input.exists && input.status === 'pending') return { ok: true, status: 'pending', notify: false, unlimited: false, create: false };
  return { ok: true, status: 'pending', notify: true, unlimited: false, create: !input.exists };
}

export type AdminDecision = 'ok' | 'unconfigured' | 'unauthorized' | 'forbidden';

export function adminApiDecision(input: { configured: boolean; email: string | null | undefined }): AdminDecision {
  if (!input.configured) return 'unconfigured';
  if (!normalizeEmail(input.email)) return 'unauthorized';
  if (!isOwnerEmail(input.email)) return 'forbidden';
  return 'ok';
}

export function adminHttpStatus(decision: AdminDecision): 200 | 401 | 403 | 503 {
  if (decision === 'ok') return 200;
  if (decision === 'unconfigured') return 503;
  if (decision === 'unauthorized') return 401;
  return 403;
}

export type AdminActionReason = 'unauthorized' | 'forbidden' | 'owner_locked' | 'unknown_action' | 'not_found';

export type ActionResult = { ok: true; status: AccessStatus } | { ok: false; reason: AdminActionReason };

export function statusForAction(action: AccessAction): AccessStatus {
  if (action === 'approve') return 'approved';
  if (action === 'revoke') return 'revoked';
  return 'blocked';
}

export function decideAdminAction(input: {
  actorEmail: string | null | undefined;
  targetEmail: string | null | undefined;
  action: string;
  targetExists: boolean;
}): ActionResult {
  const gate = adminApiDecision({ configured: true, email: input.actorEmail });
  if (gate === 'unauthorized') return { ok: false, reason: 'unauthorized' };
  if (gate !== 'ok') return { ok: false, reason: 'forbidden' };
  if (input.action !== 'approve' && input.action !== 'revoke' && input.action !== 'block') {
    return { ok: false, reason: 'unknown_action' };
  }
  if (!normalizeEmail(input.targetEmail) || !input.targetExists) return { ok: false, reason: 'not_found' };
  if (isOwnerEmail(input.targetEmail) && input.action !== 'approve') return { ok: false, reason: 'owner_locked' };
  return { ok: true, status: statusForAction(input.action) };
}

export function adminActionStatus(reason: AdminActionReason): 400 | 401 | 403 | 404 {
  if (reason === 'unauthorized') return 401;
  if (reason === 'not_found') return 404;
  if (reason === 'unknown_action') return 400;
  return 403;
}

export function parseAdminAction(body: unknown): { email: string; action: string } | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  if (typeof row.email !== 'string' || typeof row.action !== 'string') return null;
  const email = row.email.trim().slice(0, 320);
  const action = row.action.trim();
  if (!email || !action) return null;
  return { email, action };
}

export function mutationOriginAllowed(originHeader: string | null, requestOrigin: string): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(requestOrigin).origin;
  } catch {
    return false;
  }
}

function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export type TouchInput = {
  email: string;
  name: string | null;
  avatar: string | null;
  sessionId: string | null;
  now: string;
};

/**
 * First sighting is pending (owner row is stored approved, but access does not
 * depend on that). A later visit keeps status. Visit count bumps only when the
 * session id changes, so a refresh is not a new visit.
 */
export function touchVisit(existing: AccessPerson | null, input: TouchInput): AccessPerson | null {
  const email = normalizeEmail(input.email);
  if (!email) return existing;
  const name = cleanText(input.name);
  const avatar = cleanText(input.avatar);
  if (!existing) {
    return {
      email,
      name,
      avatar,
      status: initialStatusFor(email),
      firstSeen: input.now,
      lastSeen: input.now,
      visitCount: 1,
      lastSessionId: input.sessionId,
    };
  }
  const bump = Boolean(input.sessionId) && input.sessionId !== existing.lastSessionId;
  return {
    ...existing,
    email,
    name: name ?? existing.name,
    avatar: avatar ?? existing.avatar,
    lastSeen: input.now,
    visitCount: bump ? existing.visitCount + 1 : existing.visitCount,
    lastSessionId: input.sessionId ?? existing.lastSessionId,
  };
}

export function sortByLastSeen<T extends { lastSeen: string; email: string }>(people: T[]): T[] {
  return [...people].sort((a, b) => {
    if (a.lastSeen !== b.lastSeen) return a.lastSeen < b.lastSeen ? 1 : -1;
    return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
  });
}

export function matchesSearch(person: AccessPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return person.email.includes(q) || (person.name ?? '').toLowerCase().includes(q);
}

export function listPeople(people: AccessPerson[], query: string): AccessPerson[] {
  return sortByLastSeen(people.filter((person) => matchesSearch(person, query)));
}

export function pendingCount(people: Array<{ status: string }>): number {
  return people.reduce((count, person) => (person.status === 'pending' ? count + 1 : count), 0);
}

export type AdminSeen = { at: string; pending: number };

/**
 * Whether the owner should be alerted: someone joined after the last time the admin panel was
 * opened, or more people are waiting than back then. `mark` is what to store when it is opened.
 */
export function adminAlert(
  people: Array<{ email: string; firstSeen: string; owner?: boolean }>,
  pending: number,
  seen: AdminSeen | null,
): { alert: boolean; mark: AdminSeen } {
  const others = people.filter((person) => !person.owner && !isOwnerEmail(person.email) && person.firstSeen);
  const latest = others.reduce((max, person) => (person.firstSeen > max ? person.firstSeen : max), '');
  const mark: AdminSeen = { at: latest, pending };
  if (!seen) return { alert: false, mark };
  return { alert: latest > seen.at || pending > seen.pending, mark };
}

export function parseAdminSeen(raw: string | null): AdminSeen | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AdminSeen>;
    if (typeof value.at !== 'string' || typeof value.pending !== 'number') return null;
    return { at: value.at, pending: value.pending };
  } catch {
    return null;
  }
}
