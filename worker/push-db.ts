import type { PushSubscriptionKeys } from '../src/lib/push-sub';
import type { D1Database } from './d1';

export type StoredPush = PushSubscriptionKeys & { email: string };

type Row = { endpoint: string; email: string; p256dh: string; auth: string };

export async function saveSubscription(db: D1Database, email: string, sub: PushSubscriptionKeys): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_subscription (endpoint, email, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(sub.endpoint, email, sub.p256dh, sub.auth, new Date().toISOString())
    .run();
}

export async function deleteSubscription(db: D1Database, email: string, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscription WHERE endpoint = ? AND email = ?').bind(endpoint, email).run();
}

export async function listSubscriptions(db: D1Database, email: string): Promise<StoredPush[]> {
  const result = await db.prepare('SELECT endpoint, email, p256dh, auth FROM push_subscription WHERE email = ?').bind(email).all<Row>();
  return (result.results ?? []).map((row) => ({ endpoint: row.endpoint, email: row.email, p256dh: row.p256dh, auth: row.auth }));
}

export async function deleteEndpoint(db: D1Database, endpoint: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscription WHERE endpoint = ?').bind(endpoint).run();
}
