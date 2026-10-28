import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

type Props = {
  onGo: () => void;
  onStay: () => void;
};

export function PreparModal({ onGo, onStay }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onStay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStay]);

  return createPortal(
    <div className="sheet-overlay">
      <button type="button" className="sheet-backdrop" aria-label="Cerrar" onClick={onStay} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Ir a Preparar" data-testid="prepar-warn">
        <div className="sheet-head">
          <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onStay}>
            <Icon name="x" />
          </button>
        </div>
        <p className="key-help">Ir a Preparar corta la música y la fiesta. ¿Seguro?</p>
        <button type="button" className="choice" data-testid="prepar-go" onClick={onGo}>
          Ir igual
        </button>
        <button type="button" className="choice" data-testid="prepar-stay" onClick={onStay}>
          Cancelar
        </button>
      </div>
    </div>,
    document.body,
  );
}
