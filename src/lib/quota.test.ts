import { describe, expect, it } from 'vitest';
import { OWNER_EMAIL } from './access';
import {
  ANON_DAILY_SEARCHES,
  PLAYLIST_CACHE_SECONDS,
  SEARCH_CACHE_SECONDS,
  USER_DAILY_SEARCHES,
  decideBudget,
  hashSubject,
  normalizeSearchQuery,
  quotaTier,
  youtubeFailure,
} from './quota';

describe('search budget', () => {
  it('counts anonymous calls up to the daily limit', () => {
    expect(ANON_DAILY_SEARCHES).toBe(20);
    expect(quotaTier(null, null)).toBe('anonymous');
    expect(quotaTier('  ', null)).toBe('anonymous');
    expect(decideBudget({ tier: 'anonymous', used: 0, cacheHit: false })).toEqual({ ok: true, charge: true });
    expect(decideBudget({ tier: 'anonymous', used: 19, cacheHit: false })).toEqual({ ok: true, charge: true });
    expect(decideBudget({ tier: 'anonymous', used: 20, cacheHit: false })).toEqual({ ok: false, reason: 'limit' });
  });

  it('gives signed-in accounts a higher limit', () => {
    expect(USER_DAILY_SEARCHES).toBe(50);
    expect(quotaTier('ana@example.com', 'pending')).toBe('signed-in');
    expect(quotaTier('ana@example.com', null)).toBe('signed-in');
    expect(quotaTier('ana@example.com', 'revoked')).toBe('signed-in');
    expect(decideBudget({ tier: 'signed-in', used: 49, cacheHit: false })).toEqual({ ok: true, charge: true });
    expect(decideBudget({ tier: 'signed-in', used: 50, cacheHit: false })).toEqual({ ok: false, reason: 'limit' });
  });

  it('does not count approved accounts or the owner', () => {
    expect(quotaTier('ana@example.com', 'approved')).toBe('unlimited');
    expect(quotaTier(OWNER_EMAIL, 'blocked')).toBe('unlimited');
    expect(quotaTier(` ${OWNER_EMAIL.toUpperCase()} `, 'pending')).toBe('unlimited');
    expect(decideBudget({ tier: 'unlimited', used: 1000, cacheHit: false })).toEqual({ ok: true, charge: false });
  });

  it('does not count a cache hit, even when the daily limit is already spent', () => {
    expect(SEARCH_CACHE_SECONDS).toBe(24 * 60 * 60);
    expect(PLAYLIST_CACHE_SECONDS).toBe(6 * 60 * 60);
    expect(decideBudget({ tier: 'anonymous', used: 20, cacheHit: true })).toEqual({ ok: true, charge: false });
    expect(decideBudget({ tier: 'signed-in', used: 50, cacheHit: true })).toEqual({ ok: true, charge: false });
    expect(decideBudget({ tier: 'unlimited', used: 0, cacheHit: true })).toEqual({ ok: true, charge: false });
  });

  it('normalizes a query and hashes an IP without keeping the address', async () => {
    expect(normalizeSearchQuery('  Hola   MUNDO  ')).toBe('hola mundo');
    const ip = '203.0.113.8';
    const hash = await hashSubject('ip', ip, 'salt');
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(ip);
    expect(await hashSubject('ip', ip, 'salt')).toBe(hash);
    expect(await hashSubject('ip', ip, 'other')).not.toBe(hash);
    expect(await hashSubject('user', 'ana@example.com', 'salt')).not.toBe(hash);
  });

  it('tells a quota error from a rejected key', () => {
    expect(youtubeFailure(403, { error: { errors: [{ reason: 'quotaExceeded' }] } })).toBe('quota');
    expect(youtubeFailure(403, { error: { errors: [{ reason: 'ipRefererBlocked' }] } })).toBe('invalid');
    expect(youtubeFailure(400, { error: { errors: [{ reason: 'keyInvalid' }] } })).toBe('invalid');
    expect(youtubeFailure(500, {})).toBe('upstream');
    expect(youtubeFailure(200, {})).toBeNull();
  });
});
