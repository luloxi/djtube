/** RFC 8291 aes128gcm + VAPID ES256. Used by the worker and by unit tests. */

const subtle = () => globalThis.crypto.subtle;

export function bytesToB64Url(bytes: Uint8Array): string {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function b64UrlToBytes(value: string): Uint8Array | null {
  if (!value || /[^A-Za-z0-9_-]/.test(value)) return null;
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  try {
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** A standalone ArrayBuffer. WebCrypto rejects a view over SharedArrayBuffer. */
export function rawBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await subtle().importKey('raw', rawBuffer(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: rawBuffer(salt), info: rawBuffer(info) }, key, length * 8);
  return new Uint8Array(bits);
}

export function publicJwk(publicKey: Uint8Array, privateKey: string): JsonWebKey {
  const x = bytesToB64Url(publicKey.slice(1, 33));
  const y = bytesToB64Url(publicKey.slice(33, 65));
  return { kty: 'EC', crv: 'P-256', x, y, d: privateKey };
}

export async function vapidJwt(input: {
  audience: string;
  subject: string;
  privateKey: string;
  publicKey: Uint8Array;
  expiresAt: number;
}): Promise<string> {
  const header = bytesToB64Url(utf8('{"typ":"JWT","alg":"ES256"}'));
  const payload = bytesToB64Url(utf8(JSON.stringify({ aud: input.audience, exp: input.expiresAt, sub: input.subject })));
  const signing = await subtle().importKey('jwk', publicJwk(input.publicKey, input.privateKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, signing, rawBuffer(utf8(`${header}.${payload}`))));
  return `${header}.${payload}.${bytesToB64Url(signature)}`;
}

async function contentKeys(input: {
  ecdhSecret: Uint8Array;
  auth: Uint8Array;
  salt: Uint8Array;
  uaPublic: Uint8Array;
  asPublic: Uint8Array;
}): Promise<{ cek: Uint8Array; nonce: Uint8Array }> {
  const ikm = await hkdf(input.ecdhSecret, input.auth, concat(utf8('WebPush: info\0'), input.uaPublic, input.asPublic), 32);
  const cek = await hkdf(ikm, input.salt, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, input.salt, utf8('Content-Encoding: nonce\0'), 12);
  return { cek, nonce };
}

/** One aes128gcm record. `rs` stays above plaintext + delimiter + tag. */
export async function encryptPush(input: {
  plaintext: Uint8Array;
  uaPublic: Uint8Array;
  auth: Uint8Array;
  salt?: Uint8Array;
  asKeys?: CryptoKeyPair;
}): Promise<Uint8Array> {
  const asKeys = input.asKeys ?? (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await subtle().exportKey('raw', asKeys.publicKey));
  const uaKey = await subtle().importKey('raw', rawBuffer(input.uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const salt = input.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await contentKeys({ ecdhSecret, auth: input.auth, salt, uaPublic: input.uaPublic, asPublic });
  const padded = new Uint8Array(input.plaintext.length + 1);
  padded.set(input.plaintext);
  padded[padded.length - 1] = 2;
  const aes = await subtle().importKey('raw', rawBuffer(cek), 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: rawBuffer(nonce) }, aes, rawBuffer(padded)));
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

export function pushBody(title: string, body: string, url: string): Uint8Array {
  return utf8(JSON.stringify({ title: title.slice(0, 80), body: body.slice(0, 180), url: url.slice(0, 300) }));
}
