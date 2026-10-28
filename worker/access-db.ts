import { isAccessStatus, isOwnerEmail, normalizeEmail, touchVisit, type AccessPerson, type AccessStatus } from '../src/lib/access';
import type { D1Database } from './d1';

type Row = {
  email: string;
  name: string | null;
  avatar: string | null;
  status: string;
  first_seen: string;
  last_seen: string;
  visit_count: number | string;
  last_session_id: string | null;
};

function toPerson(row: Row): AccessPerson {
  return {
    email: normalizeEmail(row.email),
    name: row.name,
    avatar: row.avatar,
    status: isAccessStatus(row.status) ? row.status : 'pending',
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    visitCount: Number(row.visit_count) || 0,
    lastSessionId: row.last_session_id,
  };
}

const SELECT_ONE = 'SELECT email, name, avatar, status, first_seen, last_seen, visit_count, last_session_id FROM access_grant WHERE email = ?';

export async function readPerson(db: D1Database, email: string): Promise<AccessPerson | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  const row = await db.prepare(SELECT_ONE).bind(key).first<Row>();
  return row ? toPerson(row) : null;
}

async function insertPerson(db: D1Database, person: AccessPerson): Promise<void> {
  await db
    .prepare(
      `INSERT INTO access_grant (email, name, avatar, status, first_seen, last_seen, visit_count, last_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(person.email, person.name, person.avatar, person.status, person.firstSeen, person.lastSeen, person.visitCount, person.lastSessionId)
    .run();
}

async function updatePerson(db: D1Database, person: AccessPerson): Promise<void> {
  await db
    .prepare('UPDATE access_grant SET name = ?, avatar = ?, last_seen = ?, visit_count = ?, last_session_id = ? WHERE email = ?')
    .bind(person.name, person.avatar, person.lastSeen, person.visitCount, person.lastSessionId, person.email)
    .run();
}

export async function recordVisit(
  db: D1Database,
  input: { email: string; name: string | null; avatar: string | null; sessionId: string | null },
  onCreated?: (person: AccessPerson) => Promise<void>,
): Promise<AccessPerson | null> {
  const now = new Date().toISOString();
  const touch = { ...input, now };
  const existing = await readPerson(db, input.email);
  const next = touchVisit(existing, touch);
  if (!next) return null;
  if (!existing) {
    try {
      await insertPerson(db, next);
      if (onCreated && !isOwnerEmail(next.email) && next.status === 'pending') {
        try {
          await onCreated(next);
        } catch {
          /* the visit is stored even if the alert fails */
        }
      }
      return next;
    } catch {
      const again = await readPerson(db, input.email);
      if (!again) return null;
      const merged = touchVisit(again, touch);
      if (!merged) return again;
      await updatePerson(db, merged);
      return merged;
    }
  }
  await updatePerson(db, next);
  return next;
}

export async function recordVisitForUserId(
  db: D1Database,
  userId: string,
  sessionId: string | null,
  onCreated?: (person: AccessPerson) => Promise<void>,
): Promise<void> {
  const user = await db.prepare('SELECT email, name, image FROM "user" WHERE id = ?').bind(userId).first<{ email?: string | null; name?: string | null; image?: string | null }>();
  if (!user?.email) return;
  await recordVisit(db, { email: user.email, name: user.name ?? null, avatar: user.image ?? null, sessionId }, onCreated);
}

export async function listAll(db: D1Database): Promise<AccessPerson[]> {
  const result = await db
    .prepare('SELECT email, name, avatar, status, first_seen, last_seen, visit_count, last_session_id FROM access_grant')
    .all<Row>();
  return (result.results ?? []).map(toPerson);
}

export async function setStatus(db: D1Database, email: string, status: AccessStatus): Promise<AccessPerson | null> {
  const existing = await readPerson(db, email);
  if (!existing) return null;
  await db.prepare('UPDATE access_grant SET status = ? WHERE email = ?').bind(status, existing.email).run();
  return { ...existing, status };
}

export function publicPerson(person: AccessPerson) {
  return {
    email: person.email,
    name: person.name,
    avatar: person.avatar,
    status: person.status,
    firstSeen: person.firstSeen,
    lastSeen: person.lastSeen,
    visitCount: person.visitCount,
    owner: isOwnerEmail(person.email),
  };
}
