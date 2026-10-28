import { useEffect, useRef, useState } from 'react';
import type { AppMode } from '../lib/mode';
import { Icon } from './icons';
import { PushToggle } from './PushToggle';
import { VoiceControl, type VoiceMix } from './VoiceControl';

export type SideTab = 'queue' | 'search' | 'highlights';

const CONTACT_URL = 'https://lulox.com.ar/contacto';
const REPO_URL = 'https://github.com/luloxi/djtube';

export function Header({
  onStatus,
  owner = false,
  email = null,
  access = null,
  configured = true,
  requesting = false,
  onSignIn,
  onSignOut,
  onRequestUnlimited,
  tab,
  onTab,
  onAdmin,
  pending = 0,
  mode,
  onMode,
  desktop = false,
  webcamOn = false,
  onWebcam,
  onResetLayout,
  onOpenKey,
}: {
  onStatus: (message: string) => void;
  owner?: boolean;
  email?: string | null;
  access?: string | null;
  configured?: boolean;
  requesting?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onRequestUnlimited?: () => void;
  tab: SideTab | null;
  onTab: (tab: SideTab) => void;
  onAdmin?: () => void;
  pending?: number;
  mode: AppMode;
  onMode: (mode: AppMode) => void;
  desktop?: boolean;
  webcamOn?: boolean;
  onWebcam?: () => void;
  onResetLayout?: () => void;
  onOpenKey: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const voiceMix = useRef<VoiceMix>({ stream: null, ctx: null });
  const accountRef = useRef<HTMLDivElement>(null);
  const unlimited = access === 'approved' || owner;
  const askLabel = access === 'pending' ? 'Pedido enviado' : access === 'blocked' ? 'Bloqueado' : 'Uso sin límite';

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !accountRef.current?.contains(event.target)) setMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  return (
    <nav className="dock" aria-label="Navegación">
      <div className="dock-modes">
        <button type="button" className="icon-button" aria-pressed={mode === 'preparar'} aria-label="Preparar" title="Preparar" onClick={() => onMode('preparar')}>
          <Icon name="prepare" />
        </button>
        <button type="button" className="icon-button" aria-pressed={mode === 'dj'} aria-label="DJ" title="DJ" onClick={() => onMode('dj')}>
          <Icon name="decks" />
        </button>
      </div>
      {mode === 'dj' ? (
        <div className="dock-main">
          <button type="button" className="icon-button dock-hit" aria-pressed={tab === 'queue'} aria-label="Cola" title="Cola" onClick={() => onTab('queue')}>
            <Icon name="queue" size={22} />
          </button>
          <button type="button" className="icon-button dock-hit search" aria-pressed={tab === 'search'} aria-label="Buscar" title="Buscar" onClick={() => onTab('search')}>
            <Icon name="search" size={22} />
          </button>
        </div>
      ) : null}
      <span className="dock-gap" />
      {mode === 'dj' ? <VoiceControl mix={voiceMix} onStatus={onStatus} /> : null}
      {desktop && mode === 'dj' && onWebcam ? (
        <button type="button" className="icon-button" aria-pressed={webcamOn} aria-label="Cámara" title="Cámara" onClick={onWebcam}>
          <Icon name="camera" />
        </button>
      ) : null}
      <button type="button" className="icon-button tone-key" data-testid="yt-key-open" aria-label="Usá tu propia clave" title="Usá tu propia clave" onClick={onOpenKey}>
        <Icon name="key" />
      </button>
      {email ? <PushToggle onStatus={onStatus} /> : null}
      {owner ? (
        <button type="button" className="icon-button admin-hit" title="Uso sin límite" aria-label="Uso sin límite" onClick={onAdmin}>
          <Icon name="admin" />
          {pending > 0 ? <span className="badge">{pending > 99 ? '99+' : pending}</span> : null}
        </button>
      ) : null}
      <div className="account" ref={accountRef}>
        <button type="button" className="icon-button" aria-label="Cuenta" title="Cuenta" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((open) => !open)}>
          <Icon name="user" />
        </button>
        {menu ? (
          <div className="account-menu" role="menu">
            {!email && onSignIn ? (
              <button type="button" role="menuitem" aria-label="Entrar" title="Entrar" disabled={!configured} onClick={onSignIn}>
                <Icon name="user" />
                <span>{configured ? 'Entrar' : 'Login en configuración'}</span>
              </button>
            ) : null}
            {email && !unlimited && onRequestUnlimited ? (
              <button
                type="button"
                role="menuitem"
                aria-label={askLabel}
                title={askLabel}
                disabled={requesting || access === 'pending' || access === 'blocked'}
                onClick={onRequestUnlimited}
              >
                <Icon name="key" />
                <span>{askLabel}</span>
              </button>
            ) : null}
            <a role="menuitem" href={CONTACT_URL} target="_blank" rel="noopener noreferrer" aria-label="Contacto" title="Contacto">
              <Icon name="mail" />
              <span>Contacto</span>
            </a>
            <a role="menuitem" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Código" title="Código">
              <Icon name="code" />
              <span>Código</span>
            </a>
            {onResetLayout ? (
              <button type="button" role="menuitem" aria-label="Restablecer" title="Restablecer" onClick={onResetLayout}>
                <Icon name="reset" />
                <span>Restablecer</span>
              </button>
            ) : null}
            {onSignOut ? (
              <button type="button" role="menuitem" aria-label="Salir" title="Salir" onClick={onSignOut}>
                <Icon name="sign-out" />
                <span>Salir</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
