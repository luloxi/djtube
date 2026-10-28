import { hasUnlimitedSearch, normalizeEmail } from '../src/lib/access';
import { readPerson } from './access-db';
import { readSession, type AuthEnv } from './auth';

/** Workers Rate Limiting binding (free). Counts are per Cloudflare location and approximate. */
export type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

export type RateEnv = AuthEnv & {
  /** 60 requests / 10 s per IP across /api/* (except title look-ups). */
  API_LIMIT?: RateLimiter;
  /** 12 requests / 10 s per IP on routes that spend the YouTube quota. */
  HEAVY_LIMIT?: RateLimiter;
  /** 150 requests / 10 s per IP on title look-ups, which a big paste fires in bursts. */
  OEMBED_LIMIT?: RateLimiter;
  /** 5 session look-ups / 10 s per IP, so a flood of fake cookies cannot turn into database reads. */
  EXEMPT_LIMIT?: RateLimiter;
};

const HEAVY = new Set(['/api/search', '/api/playlist', '/api/youtube/playlist']);

export function tooManyRequests(): Response {
  return Response.json(
    { ok: false, reason: 'rate_limited', items: [] },
    { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '10' } },
  );
}

async function allowed(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

/** The owner and anyone marked "Sin límite" in admin are never cut off. Only runs after a limit is hit. */
async function isExempt(request: Request, env: RateEnv, ip: string): Promise<boolean> {
  if (!env.DB || !request.headers.get('cookie')) return false;
  if (!(await allowed(env.EXEMPT_LIMIT, `x:${ip}`))) return false;
  const session = await readSession(request, env);
  if (!session) return false;
  const email = normalizeEmail(session.email);
  let status: string | null = null;
  try {
    status = (await readPerson(env.DB, email))?.status ?? null;
  } catch {
    status = null;
  }
  return hasUnlimitedSearch(email, status);
}

/** Returns a 429 to send, or null to let the request through. Cheap: one local counter, no database. */
export async function rateLimited(request: Request, pathname: string, env: RateEnv): Promise<Response | null> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const heavy = HEAVY.has(pathname);
  const general = pathname === '/api/oembed' ? env.OEMBED_LIMIT : env.API_LIMIT;
  const ok = (await allowed(general, `a:${ip}`)) && (!heavy || (await allowed(env.HEAVY_LIMIT, `h:${ip}`)));
  if (ok) return null;
  if (await isExempt(request, env, ip)) return null;
  return tooManyRequests();
}
