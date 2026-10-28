import { b64UrlToBytes, rawBuffer } from './webpush';

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'off';

function keyBytes(publicKey: string): Uint8Array | null {
  const bytes = b64UrlToBytes(publicKey);
  if (!bytes || bytes.length !== 65 || bytes[0] !== 4) return null;
  return bytes;
}

export async function pushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  return Boolean(current);
}

export async function subscribePush(): Promise<PushResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const keyResponse = await fetch('/api/push/key', { cache: 'no-store' });
  if (!keyResponse.ok) return 'off';
  const data = (await keyResponse.json().catch(() => null)) as { publicKey?: unknown } | null;
  const publicKey = typeof data?.publicKey === 'string' ? keyBytes(data.publicKey) : null;
  if (!publicKey) return 'off';
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: rawBuffer(publicKey) });
  const json = subscription.toJSON();
  const response = await fetch('/api/push/subscribe', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth }),
  });
  if (!response.ok) {
    await subscription.unsubscribe().catch(() => undefined);
    return 'off';
  }
  return 'ok';
}

export async function unsubscribePush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const current = await reg.pushManager.getSubscription();
  if (!current) return;
  const endpoint = current.endpoint;
  await current.unsubscribe().catch(() => undefined);
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
}
