import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AccessGate } from './components/AccessGate';
import { AdminPanel } from './components/AdminPanel';
import { SyncPage } from './components/SyncPage';
import { isAccessStatus, isOwnerEmail, normalizeEmail, normalizePath, screenFor } from './lib/access';
import { signOutAndLeave } from './lib/auth-client';
import './styles.css';

type Me = {
  configured: boolean;
  email: string | null;
  access: string | null;
};

function parseMe(data: unknown): Me | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.configured !== 'boolean') return null;
  const user = row.user;
  const email =
    user && typeof user === 'object' && typeof (user as { email?: unknown }).email === 'string'
      ? normalizeEmail((user as { email: string }).email)
      : null;
  const access = isAccessStatus(row.access) ? row.access : null;
  return { configured: row.configured, email: email || null, access };
}

function Root() {
  const [state, setState] = useState<{ loaded: boolean; failed: boolean; me: Me | null }>({
    loaded: false,
    failed: false,
    me: null,
  });

  useEffect(() => {
    let cancel = false;
    fetch('/api/me', { cache: 'no-store' })
      .then(async (response) => {
        const data = parseMe(await response.json().catch(() => null));
        if (cancel) return;
        if (!response.ok || !data) setState({ loaded: false, failed: true, me: null });
        else setState({ loaded: true, failed: false, me: data });
      })
      .catch(() => {
        if (!cancel) setState({ loaded: false, failed: true, me: null });
      });
    return () => {
      cancel = true;
    };
  }, []);

  const me = state.me;
  const screen = screenFor({
    loaded: state.loaded,
    failed: state.failed,
    configured: me?.configured ?? false,
    email: me?.email,
    access: me?.access,
    path: window.location.pathname,
  });

  if (screen === 'admin') return <AdminPanel />;
  if (screen === 'app' && normalizePath(window.location.pathname) === '/sync') {
    return <SyncPage onSignOut={() => void signOutAndLeave()} />;
  }
  if (screen === 'app') return <App owner={isOwnerEmail(me?.email)} onSignOut={() => void signOutAndLeave()} />;
  return <AccessGate mode={screen} access={me?.access} email={me?.email} />;
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Root />);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
