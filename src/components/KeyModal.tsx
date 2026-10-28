import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

const CLOUD = 'https://console.cloud.google.com';

type Props = {
  hasKey: boolean;
  onSave: (raw: string) => boolean;
  onClear: () => void;
  onClose: () => void;
};

export function KeyModal({ hasKey, onSave, onClear, onClose }: Props) {
  const [raw, setRaw] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!onSave(raw)) {
      setNote('No parece una clave de YouTube.');
      return;
    }
    setRaw('');
    setNote('');
    onClose();
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
          <p>La clave queda solo en este navegador. No se envía a DJTube ni se anota en ningún log.</p>
          <ol>
            <li>
              Creá un proyecto en <a href={`${CLOUD}/projectcreate`} target="_blank" rel="noopener noreferrer">Google Cloud</a>.
            </li>
            <li>
              Activá <a href={`${CLOUD}/apis/library/youtube.googleapis.com`} target="_blank" rel="noopener noreferrer">YouTube Data API v3</a>.
            </li>
            <li>
              Creá una clave en <a href={`${CLOUD}/apis/credentials`} target="_blank" rel="noopener noreferrer">Credenciales</a>.
            </li>
            <li>
              Restringila a YouTube Data API v3 y al referrer HTTP <code>https://dj.lulox.com.ar/*</code>.
            </li>
            <li>Pegala acá.</li>
          </ol>
          <p>Es gratis. La cuota diaria es tuya: 10.000 unidades. Cada búsqueda cuesta 100.</p>
        </div>
        {hasKey ? <p className="hint">Hay una clave guardada en este navegador.</p> : null}
        <form className="key-form" onSubmit={save}>
          <input
            type="password"
            value={raw}
            onChange={(event) => {
              setRaw(event.target.value);
              setNote('');
            }}
            placeholder="AIza…"
            aria-label="Clave de YouTube Data API"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="yt-key-input"
          />
          <button type="submit" className="icon-button tone-key" aria-label="Guardar clave" title="Guardar clave" disabled={!raw.trim()}>
            <Icon name="check" />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Quitar clave"
            title="Quitar clave"
            disabled={!hasKey}
            onClick={() => {
              onClear();
              setRaw('');
              setNote('');
            }}
          >
            <Icon name="trash" />
          </button>
        </form>
        {note ? <p className="hint">{note}</p> : null}
      </div>
    </div>,
    document.body,
  );
}
