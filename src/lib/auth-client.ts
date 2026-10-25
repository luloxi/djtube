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

export async function signOutAndLeave() {
  try {
    await authClient.signOut();
  } catch {
    /* the next /api/me decides; don't leave them inside the mixer */
  }
  window.location.assign('/');
}
