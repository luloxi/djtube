import { useState } from 'react';
import { signInWithGoogle, signOutAndLeave } from '../lib/auth-client';

type Mode = 'loading' | 'error' | 'unconfigured' | 'anonymous' | 'admin-denied';

function oauthError(): boolean {
  return new URLSearchParams(window.location.search).get('error') === 'oauth';
}

export function AccessGate({ mode, email }: { mode: Mode; email?: string | null }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(oauthError);

  async function enter() {
    setPending(true);
    setFailed(false);
    try {
      await signInWithGoogle();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  const message =
    mode === 'unconfigured'
      ? 'Login en configuración'
      : mode === 'error'
        ? 'No pude comprobar el acceso.'
        : mode === 'admin-denied'
            ? 'Esta página es solo de Luciano.'
            : null;

  return (
    <main className="gate" data-testid="auth-gate">
      <div className="gate-card">
        <h1>DJTube</h1>
        {message ? (
          <p className="gate-message" data-testid="auth-message">
            {message}
          </p>
        ) : null}
        {mode === 'anonymous' ? (
          <>
            <button type="button" className="primary" data-testid="google-sign-in" onClick={() => void enter()} disabled={pending}>
              Entrar con Google
            </button>
            {failed ? <p className="hint">No pude entrar con Google.</p> : null}
          </>
        ) : null}
        {mode === 'error' ? (
          <button type="button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        ) : null}
        {mode === 'admin-denied' ? (
          <>
            {email ? <p className="hint">{email}</p> : null}
            <button type="button" data-testid="auth-sign-out" onClick={() => void signOutAndLeave()}>
              Salir
            </button>
            <a className="text-link" href="/">
              Volver a mezclar
            </a>
          </>
        ) : null}
      </div>
    </main>
  );
}
