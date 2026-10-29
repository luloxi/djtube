import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { keyShapeProblem, normalizeApiKey, testOwnKey, type KeyTestResult } from '../lib/yt-key';

const CLOUD = 'https://console.cloud.google.com';

type Props = {
  hasKey: boolean;
  savedKey: string | null;
  onSave: (raw: string) => boolean;
  onClear: () => void;
  onClose: () => void;
};

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Step({ n, title, open, onToggle, children }: { n: number; title: string; open: boolean; onToggle: (n: number, button: HTMLButtonElement) => void; children: ReactNode }) {
  return (
    <div className={open ? 'key-step is-open' : 'key-step'} data-testid={`key-step-${n}`}>
      <button type="button" className="key-step-head" id={`key-step-h${n}`} aria-expanded={open} aria-controls={`key-step-p${n}`} onClick={(event) => onToggle(n, event.currentTarget)}>
        <span className="key-n">{n}</span>
        <span>{title}</span>
      </button>
      <div className="key-step-body" id={`key-step-p${n}`} role="region" aria-labelledby={`key-step-h${n}`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

const HINTS: Record<Exclude<KeyTestResult, 'ok'>, string> = {
  invalid: 'Google no reconoce esta clave. Revisá que la copiaste completa (empieza con AIza) y que es una clave de API, no un ID de cliente OAuth.',
  disabled: 'La clave existe, pero falta habilitar YouTube Data API v3 en ese proyecto (paso 3). Si la habilitaste recién, esperá un minuto y probá de nuevo.',
  referrer: 'La clave está limitada a otros sitios web. En Credenciales, abrila y en «Restricciones de la aplicación» agregá este sitio o elegí «Ninguna».',
  blocked: 'La clave está limitada a otras APIs. En Credenciales, abrila y en «Restricciones de la API» marcá YouTube Data API v3.',
  quota: 'Se agotó la cuota de hoy de esta clave. Se renueva a medianoche, hora del Pacífico.',
  network: 'No pude conectar con Google. Revisá tu conexión y probá de nuevo.',
  other: 'Google devolvió un error que no reconozco. Probá de nuevo en un rato.',
};

export function KeyModal({ hasKey, savedKey, onSave, onClear, onClose }: Props) {
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const [openStep, setOpenStep] = useState<number | null>(1);
  const toggleStep = (n: number, button: HTMLButtonElement) => {
    const next = openStep === n ? null : n;
    setOpenStep(next);
    if (next !== null) {
      // Wait for the other steps to fold, then bring this one into view inside the scrolling sheet.
      window.requestAnimationFrame(() => button.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    }
  };

  useEffect(() => {
    alive.current = true;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      alive.current = false;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function problem(): string | null {
    const kind = keyShapeProblem(raw);
    if (kind === 'oauth') return 'Eso es un ID de cliente OAuth. Necesitás una clave de API: empieza con AIza.';
    if (kind === 'shape') return 'No parece una clave de API de YouTube. Tiene que empezar con AIza.';
    return null;
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const bad = problem();
    if (bad || !onSave(raw)) {
      setNote({ ok: false, text: bad ?? 'No parece una clave de API de YouTube.' });
      return;
    }
    setRaw('');
    setNote(null);
    onClose();
  }

  async function probe() {
    const bad = problem();
    if (bad) {
      setNote({ ok: false, text: bad });
      return;
    }
    const key = normalizeApiKey(raw) ?? savedKey;
    if (!key) {
      setNote({ ok: false, text: 'Pegá una clave para probarla.' });
      return;
    }
    setBusy(true);
    setNote(null);
    const result = await testOwnKey(key);
    if (!alive.current) return;
    setBusy(false);
    setNote(result === 'ok' ? { ok: true, text: 'Funciona. La clave es válida y YouTube Data API v3 está activa.' } : { ok: false, text: HINTS[result] });
  }

  return createPortal(
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="sheet key-sheet" role="dialog" aria-modal="true" aria-labelledby="usa-tu-clave" data-testid="yt-key-modal">
        <div className="sheet-head">
          <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <h2 id="usa-tu-clave">Usá tu propia clave</h2>
        <div className="key-help">
          <p className="key-warn" data-testid="key-warn">
            Necesitás una <strong>clave de API</strong> (API key), <strong>NO</strong> un ID de cliente OAuth.
          </p>
          <p>
            Es gratis y no hace falta tarjeta. Con tu clave buscás sin el límite compartido: Google da unas 100 búsquedas por día por proyecto (cada una cuesta 100 de las 10.000 unidades diarias). Se renueva a medianoche, hora del Pacífico.
          </p>
          <div className="key-steps" data-testid="key-steps">
            <Step n={1} title="Entrá a Google Cloud" open={openStep === 1} onToggle={toggleStep}>
              Abrí <Ext href={`${CLOUD}/`}>Google Cloud Console</Ext> e iniciá sesión con tu cuenta de Google (una de Gmail sirve). Si te pide aceptar los términos, aceptalos.
            </Step>
            <Step n={2} title="Creá un proyecto nuevo" open={openStep === 2} onToggle={toggleStep}>
              Arriba, al lado del logo «Google Cloud», tocá el selector de proyectos. En la ventana tocá «Proyecto nuevo» (New project). Poné de nombre <code>DJTube</code> y tocá «Crear» (Create). Cuando termine, abrí otra vez el selector y elegí DJTube: arriba tiene que decir DJTube. También podés ir directo a <Ext href={`${CLOUD}/projectcreate`}>crear proyecto</Ext>.
            </Step>
            <Step n={3} title="Habilitá YouTube Data API v3" open={openStep === 3} onToggle={toggleStep}>
              Abrí <Ext href={`${CLOUD}/apis/library/youtube.googleapis.com`}>YouTube Data API v3</Ext> con DJTube seleccionado y tocá el botón azul «Habilitar» (Enable). Si dice «Administrar», ya estaba habilitada.
            </Step>
            <Step n={4} title="Creá la clave de API" open={openStep === 4} onToggle={toggleStep}>
              Abrí <Ext href={`${CLOUD}/apis/credentials`}>Credenciales</Ext>. Tocá «+ Crear credenciales» (Create credentials) y elegí <strong>«Clave de API»</strong> (API key).
              <span className="key-warn-inline">No elijas «ID de cliente de OAuth». Si te pide configurar la pantalla de consentimiento, elegiste la opción equivocada: cerrala y elegí «Clave de API».</span>
            </Step>
            <Step n={5} title="Restringila a YouTube (recomendado)" open={openStep === 5} onToggle={toggleStep}>
              En el panel que se abre, en «Restricciones de la API» elegí «Restringir clave», abrí la lista, marcá «YouTube Data API v3» y tocá «Aceptar». Google suele exigir este paso para crear la clave. Opcional: en «Restricciones de la aplicación» elegí «Sitios web» y agregá <code>https://{window.location.host}/*</code>. Después tocá «Crear».
            </Step>
            <Step n={6} title="Copiá la clave" open={openStep === 6} onToggle={toggleStep}>
              Aparece un cuadro con un texto largo que empieza con <code>AIza</code>. Tocá el ícono de copiar. Si lo cerraste, entrá a <Ext href={`${CLOUD}/apis/credentials`}>Credenciales</Ext>, tocá el nombre de la clave y «Mostrar clave».
            </Step>
            <Step n={7} title="Pegala acá y guardala" open={openStep === 7} onToggle={toggleStep}>
              Pegá la clave abajo y tocá «Guardar». Si querés comprobar que anda, tocá «Probar» antes.
            </Step>
          </div>
          <p className="key-privacy">La clave queda solo en este navegador. No se envía a DJTube ni se anota en ningún log.</p>
        </div>
        <form className="key-form" onSubmit={save}>
          {hasKey ? <p className="hint key-saved">Hay una clave guardada en este navegador.</p> : null}
          <input
            type="password"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setNote(null);
            }}
            placeholder="Clave API"
            aria-label="Clave de YouTube Data API"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="yt-key-input"
          />
          <div className="key-actions">
            <button type="submit" className="key-btn tone-key" data-testid="yt-key-save" title="Guardar clave" disabled={!raw.trim()}>
              <Icon name="check" size={16} />
              <span>Guardar</span>
            </button>
            <button
              type="button"
              className="key-btn tone-play"
              data-testid="yt-key-test"
              title="Probar la clave con Google"
              disabled={busy || (!raw.trim() && !savedKey)}
              onClick={() => void probe()}
            >
              <Icon name="search" size={16} />
              <span>{busy ? 'Probando…' : 'Probar'}</span>
            </button>
            <button
              type="button"
              className="key-btn tone-danger"
              data-testid="yt-key-clear"
              title="Borrar la clave de este navegador"
              disabled={!hasKey}
              onClick={() => {
                onClear();
                setRaw('');
                setNote(null);
              }}
            >
              <Icon name="trash" size={16} />
              <span>Borrar clave</span>
            </button>
          </div>
          {note ? (
            <p className={note.ok ? 'key-note is-ok' : 'key-note is-bad'} role="status" data-testid="yt-key-result">
              {note.text}
            </p>
          ) : null}
        </form>
      </div>
    </div>,
    document.body,
  );
}
