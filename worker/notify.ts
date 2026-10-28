import { CANONICAL_ORIGIN, CUSTOM_ORIGIN, isOwnerEmail, OWNER_EMAIL } from '../src/lib/access';
import { vapidKeysReady } from '../src/lib/push-sub';
import { b64UrlToBytes, bytesToB64Url, encryptPush, pushBody, rawBuffer, vapidJwt } from '../src/lib/webpush';
import type { D1Database } from './d1';
import { deleteEndpoint, listSubscriptions } from './push-db';

/** Resend `from` when APPROVAL_FROM is unset. lulox.com.ar is a verified Resend domain. */
export const DEFAULT_APPROVAL_FROM = 'DJTube <no-responder@lulox.com.ar>';
const RESEND_EMAILS = 'https://api.resend.com/emails';
const VAPID_SUBJECT = 'mailto:lucianoolivabianco@gmail.com';

export type NotifyEnv = {
  DB?: D1Database;
  /** Worker secret. Never log it. */
  RESEND_API_KEY?: string;
  /** Full Resend `from` value. Falls back to DEFAULT_APPROVAL_FROM. */
  APPROVAL_FROM?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

/** Full From string: env APPROVAL_FROM, or `DJTube <no-responder@lulox.com.ar>`. */
export function approvalFrom(env: NotifyEnv): string {
  const raw = env.APPROVAL_FROM?.replace(/[\r\n]/g, '').trim();
  return raw || DEFAULT_APPROVAL_FROM;
}

export async function notifyAccessRequest(env: NotifyEnv, person: { email: string; status: string }): Promise<void> {
  if (isOwnerEmail(person.email) || person.status !== 'pending') return;
  await sendPush(env, OWNER_EMAIL, 'DJTube', `${person.email} pidió uso sin límite`, '/');
}

/**
 * Tell Resend the account was approved. Failures are logged and never thrown:
 * the approval is already stored. The log line is a fixed string or a status
 * code — never the key, the body, or the request.
 */
export async function sendApprovalMail(env: NotifyEnv, email: string): Promise<void> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) {
    console.error('[approval] mail not configured');
    return;
  }
  const link = CANONICAL_ORIGIN;
  const from = approvalFrom(env);
  try {
    const response = await fetch(RESEND_EMAILS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Uso sin límite',
        text: `Ya tenés búsquedas sin límite.\n${link}\n${CUSTOM_ORIGIN}\n`,
        html: `<p>Ya tenés búsquedas sin límite.</p><p><a href="${link}">DJTube</a></p><p><a href="${CUSTOM_ORIGIN}">${CUSTOM_ORIGIN}</a></p>`,
      }),
    });
    if (!response.ok) console.error(`[approval] resend ${response.status}`);
    try {
      await response.body?.cancel();
    } catch {
      /* body unused; do not log it */
    }
  } catch {
    console.error('[approval] send failed');
  }
}

export async function notifyApproved(env: NotifyEnv, email: string): Promise<void> {
  await sendApprovalMail(env, email);
  try {
    await sendPush(env, email, 'DJTube', 'Ya tenés búsquedas sin límite', '/');
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
