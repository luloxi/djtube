import { describe, expect, it } from 'vitest';
import { openSecret, sealSecret, vaultReady } from './secret-box';

const SECRET = 'a'.repeat(44);
const KEY = 'AIzaSyA-1234567890abcdefghijklmnopqrstu';

describe('secret box', () => {
  it('round-trips and never stores the plaintext', async () => {
    const sealed = await sealSecret(SECRET, KEY, 'a@x.com');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('AIza');
    expect(await openSecret(SECRET, sealed, 'a@x.com')).toBe(KEY);
  });

  it('uses a fresh iv every time', async () => {
    expect(await sealSecret(SECRET, KEY, 'a@x.com')).not.toBe(await sealSecret(SECRET, KEY, 'a@x.com'));
  });

  it('does not open for another owner, another secret, or a tampered value', async () => {
    const sealed = await sealSecret(SECRET, KEY, 'a@x.com');
    expect(await openSecret(SECRET, sealed, 'b@x.com')).toBeNull();
    expect(await openSecret('b'.repeat(44), sealed, 'a@x.com')).toBeNull();
    expect(await openSecret(SECRET, sealed.slice(0, -2) + 'AA', 'a@x.com')).toBeNull();
    expect(await openSecret(SECRET, 'garbage', 'a@x.com')).toBeNull();
  });

  it('refuses a missing or short vault secret', () => {
    expect(vaultReady(undefined)).toBe(false);
    expect(vaultReady('short')).toBe(false);
    expect(vaultReady(SECRET)).toBe(true);
  });
});
