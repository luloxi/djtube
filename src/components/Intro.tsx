import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export const INTRO_KEY = 'djtube-intro';

export function introSeen(storage: { getItem(key: string): string | null } | null): boolean {
  try {
    return storage?.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: { setItem(key: string, value: string): void } | null): void {
  try {
    storage?.setItem(INTRO_KEY, '1');
  } catch {
    /* private mode: it shows again next visit */
  }
}

export function Intro({ onKey, onClose }: { onKey: () => void; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  return createPortal(
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="sheet intro-sheet" role="dialog" aria-modal="true" aria-labelledby="intro-title" data-testid="intro">
        <img className="intro-logo" src="/djtube.svg?v=2" alt="" width={120} height={120} draggable={false} />
        <h2 id="intro-title">DJTube</h2>
        <p>Conseguí tu propia clave de YouTube y buscá sin tope.</p>
        <div className="intro-actions">
          <button type="button" className="tone-key intro-key" data-testid="intro-key" onClick={onKey}>
            <Icon name="key" />
            <span>Conseguir clave</span>
          </button>
          <button type="button" data-testid="intro-close" onClick={onClose}>
            Ahora no
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
