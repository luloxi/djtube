import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient();

export async function signInWithGoogle() {
  const origin = window.location.origin;
  const result = await authClient.signIn.social({
    provider: 'google',
    callbackURL: `${origin}/`,
    errorCallbackURL: `${origin}/?error=oauth`,
  });
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    window.location.assign('/?error=oauth');
  }
}

function oauthRedirect(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as { error?: unknown; url?: unknown; data?: { url?: unknown } | null };
  if (row.error) return null;
  if (typeof row.url === 'string' && row.url) return row.url;
  if (row.data && typeof row.data.url === 'string' && row.data.url) return row.data.url;
  return null;
}

/** Extra YouTube scope, only when saving a playlist. Not part of normal sign-in. */
export async function linkYouTubeScope(): Promise<'redirect' | 'error'> {
  const origin = window.location.origin;
  try {
    const result = await authClient.linkSocial({
      provider: 'google',
      scopes: ['https://www.googleapis.com/auth/youtube'],
      callbackURL: `${origin}/?ytpl=ok`,
      errorCallbackURL: `${origin}/?ytpl=error`,
      disableRedirect: true,
      additionalParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    });
    const url = oauthRedirect(result);
    if (!url) return 'error';
    window.location.assign(url);
    return 'redirect';
  } catch {
    return 'error';
  }
}

export async function signOutAndLeave() {
  try {
    await authClient.signOut();
  } catch {
    /* the next /api/me decides; don't leave them inside the mixer */
  }
  window.location.assign('/');
}
