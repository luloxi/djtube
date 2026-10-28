import { b64UrlToBytes } from './webpush';

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

/** A browser push subscription. Does not grant app access. */
export function parsePushSubscription(body: unknown): PushSubscriptionKeys | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  if (typeof row.endpoint !== 'string' || typeof row.p256dh !== 'string' || typeof row.auth !== 'string') return null;
  const endpoint = row.endpoint.trim();
  if (endpoint.length < 12 || endpoint.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const p256dh = b64UrlToBytes(row.p256dh.trim());
  const auth = b64UrlToBytes(row.auth.trim());
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4) return null;
  if (!auth || auth.length !== 16) return null;
  return { endpoint, p256dh: row.p256dh.trim(), auth: row.auth.trim() };
}

export function vapidKeysReady(publicKey: string | undefined, privateKey: string | undefined): boolean {
  const pub = publicKey ? b64UrlToBytes(publicKey.trim()) : null;
  const priv = privateKey ? b64UrlToBytes(privateKey.trim()) : null;
  return Boolean(pub && pub.length === 65 && pub[0] === 4 && priv && priv.length === 32);
}
