/**
 * AES-GCM sealing for small secrets stored in D1. The key is derived from a Worker secret
 * (KEY_VAULT_SECRET) that never sits in the database. The owner's address is bound in as
 * additional data, so a ciphertext copied to another user's row does not open.
 * Format: v1.<iv>.<ciphertext>, both base64url.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const text = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(new ArrayBuffer(text.length));
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', enc.encode(`djtube-account-vault-v1:${secret}`));
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export function vaultReady(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= 32;
}

export async function sealSecret(secret: string, plaintext: string, owner: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(secret);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(owner) }, key, enc.encode(plaintext));
  return `v1.${toB64(iv)}.${toB64(new Uint8Array(sealed))}`;
}

export async function openSecret(secret: string, sealed: string, owner: string): Promise<string | null> {
  const [version, ivText, bodyText] = sealed.split('.');
  if (version !== 'v1' || !ivText || !bodyText) return null;
  const iv = fromB64(ivText);
  const body = fromB64(bodyText);
  if (!iv || !body || iv.length !== 12) return null;
  try {
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(owner) }, key, body);
    return dec.decode(plain);
  } catch {
    return null;
  }
}
