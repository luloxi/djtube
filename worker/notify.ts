import { CANONICAL_ORIGIN, isOwnerEmail, OWNER_EMAIL } from '../src/lib/access';
import { vapidKeysReady } from '../src/lib/push-sub';
import { b64UrlToBytes, bytesToB64Url, encryptPush, pushBody, rawBuffer, vapidJwt } from '../src/lib/webpush';
import type { D1Database } from './d1';
import { deleteEndpoint, listSubscriptions } from './push-db';

export const APPROVAL_FROM = 'djtube@lulox.com.ar';
const VAPID_SUBJECT = 'mailto:lucianoolivabianco@gmail.com';

export type OutboundEmail = {
  send(message: { to: string; from: { email: string; name?: string }; subject: string; text: string; html?: string }): Promise<unknown>;
};

export type NotifyEnv = {
  DB?: D1Database;
  EMAIL?: OutboundEmail;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

export async function notifyAccessRequest(env: NotifyEnv, person: { email: string; status: string }): Promise<void> {
  if (isOwnerEmail(person.email) || person.status !== 'pending') return;
  await sendPush(env, OWNER_EMAIL, 'DJTube', `${person.email} pidió acceso`, '/');
}

export async function notifyApproved(env: NotifyEnv, email: string): Promise<void> {
  const link = CANONICAL_ORIGIN;
  try {
    if (env.EMAIL) {
      await env.EMAIL.send({
        to: email,
        from: { email: APPROVAL_FROM, name: 'DJTube' },
        subject: 'Acceso',
        text: `Ya podés entrar.\n${link}\n`,
        html: `<p>Ya podés entrar.</p><p><a href="${link}">DJTube</a></p>`,
      });
    }
  } catch {
    /* approval already stored */
  }
  try {
    await sendPush(env, email, 'DJTube', 'Ya podés entrar', '/');
  } catch {
    /* approval already stored */
  }
}

async function sendPush(env: NotifyEnv, email: string, title: string, body: string, url: string): Promise<void> {
  if (!env.DB || !vapidKeysReady(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)) return;
  const publicKey = b64UrlToBytes(env.VAPID_PUBLIC_KEY!.trim());
  const privateKey = env.VAPID_PRIVATE_KEY!.trim();
  if (!publicKey) return;
  const subs = await listSubscriptions(env.DB, email);
  const plaintext = pushBody(title, body, url);
  await Promise.all(
    subs.map(async (sub) => {
      const uaPublic = b64UrlToBytes(sub.p256dh);
      const auth = b64UrlToBytes(sub.auth);
      if (!uaPublic || !auth) return;
      try {
        const payload = await encryptPush({ plaintext, uaPublic, auth });
        const audience = new URL(sub.endpoint).origin;
        const token = await vapidJwt({
          audience,
          subject: VAPID_SUBJECT,
          privateKey,
          publicKey,
          expiresAt: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        });
        const response = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'content-encoding': 'aes128gcm',
            ttl: '86400',
            authorization: `vapid t=${token}, k=${bytesToB64Url(publicKey)}`,
          },
          body: rawBuffer(payload),
        });
        if (response.status === 404 || response.status === 410) await deleteEndpoint(env.DB!, sub.endpoint);
      } catch {
        /* one bad device does not block the others */
      }
    }),
  );
}
