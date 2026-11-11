import { describe, expect, it } from 'vitest';
import { readSso, signSso } from './lulox-sso';

const SECRET = 's'.repeat(48);
const req = (cookie: string) => new Request('https://dj.lulox.com.ar/api/me', { headers: { cookie } });

describe('lulox_sso', () => {
  it('verifies a signed cookie and rejects forged, expired or unsigned ones', async () => {
    const v = await signSso({ email: 'A@B.com', name: 'A', picture: '' }, SECRET, 60_000);
    expect((await readSso(req(`lulox_sso=${v}`), SECRET))?.email).toBe('a@b.com');
    expect(await readSso(req(`lulox_sso=${v}`), 't'.repeat(48))).toBeNull();
    expect(await readSso(req(`lulox_sso=${v.slice(0, -2)}xx`), SECRET)).toBeNull();
    const old = await signSso({ email: 'a@b.com', name: 'A', picture: '' }, SECRET, 1, Date.now() - 10_000);
    expect(await readSso(req(`lulox_sso=${old}`), SECRET)).toBeNull();
    expect(await readSso(req(`lulox_sso=${v}`), undefined)).toBeNull();
  });
});
