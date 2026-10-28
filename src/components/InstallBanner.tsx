import { useEffect, useState } from 'react';

const HIDE_KEY = 'djtube-install-hide';

type PromptEvent = Event & { prompt: () => Promise<void> };

function isIos(): boolean {
  const ua = navigator.userAgent;
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOs;
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as { standalone?: boolean }).standalone);
}

export function InstallBanner() {
  const [deferred, setDeferred] = useState<PromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(HIDE_KEY) === '1' || isStandalone()) return;
    const iosDevice = isIos();
    setIos(iosDevice);
    if (iosDevice) {
      setOpen(true);
      return;
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as PromptEvent);
      setOpen(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!open) return null;

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
    } catch {
      /* ignored */
    }
    setDeferred(null);
    setOpen(false);
  }

  return (
    <div className="install" role="dialog" aria-label="Instalar">
      <p>{ios ? 'Compartir → Añadir a inicio' : 'Instalar app'}</p>
      <div className="row">
        {ios ? null : (
          <button type="button" className="primary" onClick={() => void install()} disabled={!deferred}>
            Instalar
          </button>
        )}
        <button type="button" onClick={() => setOpen(false)}>
          Cerrar
        </button>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(HIDE_KEY, '1');
            setOpen(false);
          }}
        >
          No mostrar más
        </button>
      </div>
    </div>
  );
}
