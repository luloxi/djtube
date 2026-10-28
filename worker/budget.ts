import { normalizeEmail } from '../src/lib/access';
import { decideBudget, hashSubject, quotaTier, utcDay, type QuotaTier } from '../src/lib/quota';
import { readPerson } from './access-db';
import { readSession, type AuthEnv } from './auth';
import type { D1Database } from './d1';

type BudgetEnv = AuthEnv & { DB?: D1Database };

export type KeyBudget =
  | { action: 'allow'; charge: false; tier: QuotaTier }
  | { action: 'allow'; charge: true; tier: QuotaTier; subject: string; day: string }
  | { action: 'deny'; tier: QuotaTier };

function clientIp(request: Request): string {
  const direct = request.headers.get('cf-connecting-ip')?.trim();
  if (direct) return direct;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'unknown';
}

export async function readUsage(db: D1Database, subject: string, day: string): Promise<number> {
  const row = await db.prepare('SELECT used FROM search_budget WHERE subject = ? AND day = ?').bind(subject, day).first<{ used?: number | string }>();
  const used = Number(row?.used);
  return Number.isFinite(used) && used > 0 ? used : 0;
}

export async function chargeUsage(db: D1Database, subject: string, day: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO search_budget (subject, day, used) VALUES (?, ?, 1)
       ON CONFLICT(subject, day) DO UPDATE SET used = used + 1`,
    )
    .bind(subject, day)
    .run();
}

/** Who is calling, and whether the next server-key request may run. */
export async function keyBudget(request: Request, env: BudgetEnv): Promise<KeyBudget> {
  const session = await readSession(request, env);
  const email = session ? normalizeEmail(session.email) : '';
  let status: string | null = null;
  if (email && env.DB) {
    try {
      status = (await readPerson(env.DB, email))?.status ?? null;
    } catch {
      status = null;
    }
  }
  const tier = quotaTier(email || null, status);
  if (tier === 'unlimited') return { action: 'allow', charge: false, tier };
  if (!env.DB) return { action: 'deny', tier };
  const day = utcDay();
  const salt = env.BETTER_AUTH_SECRET?.trim() || 'djtube-public-quota';
  const subject = email
    ? `user:${await hashSubject('user', email, salt)}`
    : `ip:${await hashSubject('ip', clientIp(request), salt)}`;
  let used = 0;
  try {
    used = await readUsage(env.DB, subject, day);
  } catch {
    return { action: 'deny', tier };
  }
  const decision = decideBudget({ tier, used, cacheHit: false });
  if (!decision.ok) return { action: 'deny', tier };
  return { action: 'allow', charge: true, tier, subject, day };
}

export async function chargeBudget(env: BudgetEnv, budget: KeyBudget): Promise<void> {
  if (budget.action !== 'allow' || !budget.charge || !env.DB) return;
  try {
    await chargeUsage(env.DB, budget.subject, budget.day);
  } catch {
    /* the call already happened; a missed increment must not fail the response */
  }
}
