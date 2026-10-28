import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

type Props = {
  hasVideo: boolean;
  onAll: () => void;
  onOne: () => void;
  onClose: () => void;
};

export function PlaylistAsk({ hasVideo, onAll, onOne, onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Agregar lista" data-testid="playlist-ask">
        <div className="sheet-head">
          <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <button type="button" className="choice" data-testid="playlist-all" onClick={onAll}>
          Agregar toda la lista
        </button>
        {hasVideo ? (
          <button type="button" className="choice" data-testid="playlist-one" onClick={onOne}>
            Solo esta canción
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
