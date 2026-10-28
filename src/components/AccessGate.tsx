import { useState } from 'react';
import { holdMessage, type AccessStatus } from '../lib/access';
import { signInWithGoogle, signOutAndLeave } from '../lib/auth-client';
import { PushToggle } from './PushToggle';

type Mode = 'loading' | 'error' | 'unconfigured' | 'anonymous' | 'hold' | 'admin-denied';

function oauthError(): boolean {
  return new URLSearchParams(window.location.search).get('error') === 'oauth';
}

export function AccessGate({ mode, access, email }: { mode: Mode; access?: AccessStatus | string | null; email?: string | null }) {
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
        : mode === 'hold'
          ? holdMessage(access)
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
        {mode === 'hold' ? (
          <>
            {email ? <p className="hint">{email}</p> : null}
            <PushToggle />
            <button type="button" data-testid="auth-sign-out" onClick={() => void signOutAndLeave()}>
              Salir
            </button>
          </>
        ) : null}
        {mode === 'admin-denied' ? (
          <a className="text-link" href="/">
            Volver a mezclar
          </a>
        ) : null}
      </div>
    </main>
  );
}
