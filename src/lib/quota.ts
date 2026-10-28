/** Shared YouTube Data API budget. Cached answers do not count. */

import { isOwnerEmail, normalizeEmail } from './access';

/** Anonymous browsers, keyed by a hash of the IP. Not the raw address. */
export const ANON_DAILY_SEARCHES = 20;
/** Signed-in accounts that Luciano has not marked as unlimited. */
export const USER_DAILY_SEARCHES = 50;
/** Search responses, keyed by the normalized query. */
export const SEARCH_CACHE_SECONDS = 24 * 60 * 60;
/** Playlist pages, keyed by id plus page token. */
export const PLAYLIST_CACHE_SECONDS = 6 * 60 * 60;

export type QuotaTier = 'anonymous' | 'signed-in' | 'unlimited';

export function quotaTier(email: string | null | undefined, status: string | null | undefined): QuotaTier {
  if (isOwnerEmail(email)) return 'unlimited';
  if (!normalizeEmail(email)) return 'anonymous';
  if (status === 'approved') return 'unlimited';
  return 'signed-in';
}

/** Null means the tier is not counted. */
export function dailyLimit(tier: QuotaTier): number | null {
  if (tier === 'unlimited') return null;
  if (tier === 'signed-in') return USER_DAILY_SEARCHES;
  return ANON_DAILY_SEARCHES;
}

export type BudgetDecision = { ok: true; charge: boolean } | { ok: false; reason: 'limit' };

/**
 * A cache hit is free. Unlimited accounts are free. Everyone else pays one
 * unit only when this call is about to use the server key.
 */
export function decideBudget(input: { tier: QuotaTier; used: number; cacheHit: boolean }): BudgetDecision {
  if (input.cacheHit) return { ok: true, charge: false };
  if (input.tier === 'unlimited') return { ok: true, charge: false };
  const limit = dailyLimit(input.tier) ?? 0;
  const used = Number.isFinite(input.used) && input.used > 0 ? Math.floor(input.used) : 0;
  if (used >= limit) return { ok: false, reason: 'limit' };
  return { ok: true, charge: true };
}

/** Trim, lowercase, and collapse spaces so "Hola" and "hola" share one cache entry. */
export function normalizeSearchQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export async function hashSubject(kind: 'ip' | 'user', value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}\n${kind}\n${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function errorReasons(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return [];
  const reasons: string[] = [];
  const errors = (error as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (item && typeof item === 'object' && typeof (item as { reason?: unknown }).reason === 'string') {
        reasons.push((item as { reason: string }).reason);
      }
    }
  }
  const status = (error as { status?: unknown }).status;
  if (typeof status === 'string') reasons.push(status);
  return reasons;
}

const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'RESOURCE_EXHAUSTED']);
const KEY_REASONS = new Set(['keyInvalid', 'badRequest', 'ipRefererBlocked', 'apiKeyInvalid', 'accessNotConfigured', 'forbidden']);

/** Classify a YouTube Data API error without logging the body. */
export function youtubeFailure(status: number, body: unknown): 'quota' | 'invalid' | 'upstream' | null {
  if (status < 400) return null;
  const reasons = errorReasons(body);
  if (reasons.some((reason) => QUOTA_REASONS.has(reason)) || status === 429) return 'quota';
  if (reasons.some((reason) => KEY_REASONS.has(reason)) || status === 400) return 'invalid';
  return 'upstream';
}
