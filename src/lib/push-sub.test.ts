import { describe, expect, it } from 'vitest';
import { bytesToB64Url } from './webpush';
import { parsePushSubscription, vapidKeysReady } from './push-sub';

function keys() {
  const p256dh = new Uint8Array(65);
  p256dh[0] = 4;
  p256dh[1] = 9;
  const auth = new Uint8Array(16);
  auth[0] = 3;
  return { p256dh: bytesToB64Url(p256dh), auth: bytesToB64Url(auth) };
}

describe('push subscription', () => {
  it('accepts an https endpoint and rejects everything else', () => {
    const good = keys();
    expect(parsePushSubscription({ endpoint: 'https://push.example/a', ...good })?.endpoint).toBe('https://push.example/a');
    expect(parsePushSubscription({ endpoint: 'http://push.example/a', ...good })).toBeNull();
    expect(parsePushSubscription({ endpoint: 'https://push.example/a', p256dh: good.p256dh, auth: 'aa' })).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
  });

  it('requires a 65-byte public key and a 32-byte private key', () => {
    const pub = new Uint8Array(65);
    pub[0] = 4;
    const priv = new Uint8Array(32);
    priv[0] = 1;
    expect(vapidKeysReady(bytesToB64Url(pub), bytesToB64Url(priv))).toBe(true);
    expect(vapidKeysReady(bytesToB64Url(pub), bytesToB64Url(new Uint8Array(16)))).toBe(false);
    expect(vapidKeysReady(undefined, undefined)).toBe(false);
  });
});