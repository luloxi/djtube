import { describe, expect, it } from 'vitest';
import { b64UrlToBytes, bytesToB64Url, encryptPush, publicJwk, rawBuffer, vapidJwt } from './webpush';

const subtle = () => globalThis.crypto.subtle;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await subtle().importKey('raw', rawBuffer(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', cryptoKey, rawBuffer(data)));
}

/** RFC 5869, one block. Independent of the sender's HKDF helper. */
async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const block = await hmac(prk, new Uint8Array([...info, 1]));
  return block.slice(0, length);
}

describe('web push', () => {
  it('round-trips aes128gcm against an independent HKDF', async () => {
    const ua = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const uaPublic = new Uint8Array(await subtle().exportKey('raw', ua.publicKey));
    const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const asKeys = await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const plain = new TextEncoder().encode('hola');
    const body = await encryptPush({ plaintext: plain, uaPublic, auth, salt, asKeys });
    expect(body[20]).toBe(65);
    expect(new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(16)).toBe(4096);
    const asPublic = body.slice(21, 86);
    const cipher = body.slice(86);
    const asKey = await subtle().importKey('raw', rawBuffer(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
    const info = new Uint8Array(14 + 65 + 65);
    info.set(new TextEncoder().encode('WebPush: info\0'), 0);
    info.set(uaPublic, 14);
    info.set(asPublic, 79);
    const ikm = await hkdf(shared, auth, info, 32);
    const cek = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(ikm, salt, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);
    const aes = await subtle().importKey('raw', rawBuffer(cek), 'AES-GCM', false, ['decrypt']);
    const padded = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: rawBuffer(nonce) }, aes, rawBuffer(cipher)));
    expect(padded[padded.length - 1]).toBe(2);
    expect(new TextDecoder().decode(padded.subarray(0, -1))).toBe('hola');
  });

  it('signs a VAPID token the public key can verify', async () => {
    const pair = await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await subtle().exportKey('jwk', pair.privateKey);
    const x = b64UrlToBytes(jwk.x ?? '');
    const y = b64UrlToBytes(jwk.y ?? '');
    if (!x || !y || !jwk.d) throw new Error('jwk');
    const publicKey = new Uint8Array(65);
    publicKey[0] = 4;
    publicKey.set(x, 1);
    publicKey.set(y, 33);
    const token = await vapidJwt({
      audience: 'https://fcm.googleapis.com',
      subject: 'mailto:lucianoolivabianco@gmail.com',
      privateKey: jwk.d,
      publicKey,
      expiresAt: 1_800_000_000,
    });
    const [header, payload, signature] = token.split('.');
    expect(header).toBeTruthy();
    expect(payload).toBeTruthy();
    const sig = b64UrlToBytes(signature ?? '');
    expect(sig?.length).toBe(64);
    const ok = await subtle().verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      rawBuffer(sig!),
      rawBuffer(new TextEncoder().encode(`${header}.${payload}`)),
    );
    expect(ok).toBe(true);
    expect(publicJwk(publicKey, jwk.d).x).toBe(jwk.x);
    expect(bytesToB64Url(publicKey).length).toBeGreaterThan(80);
  });
});
