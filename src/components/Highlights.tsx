import { useRef, useState } from 'react';
import type { Highlight } from '../types';
import { formatTime } from '../lib/format';
import { exportHighlights, importHighlights, renameHighlight, searchHighlights } from '../lib/highlights';
import { downloadBlob } from '../lib/download';
import { Icon } from './icons';
import { decodeEntities } from '../lib/html-text';

type Props = {
  highlights: Highlight[];
  onChange: (next: Highlight[]) => void;
  onStatus: (message: string) => void;
  onEdit?: (highlight: Highlight) => void;
};

export function Highlights({ highlights, onChange, onStatus, onEdit }: Props) {
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const visible = searchHighlights(highlights, query);

  function onImport(file: File) {
    file
      .text()
      .then((text) => {
        try {
          onChange(importHighlights(highlights, text));
          onStatus('Importado');
        } catch {
          onStatus('JSON inválido');
        }
      })
      .catch(() => onStatus('No se leyó'));
  }

  return (
    <section className="panel" aria-label="Cortes">
      <h2>Cortes</h2>
      <input type="search" placeholder="Buscar" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar cortes" />
      <div className="row">
        <button
          type="button"
          className="icon-button"
          title="Exportar"
          aria-label="Exportar"
          onClick={() => downloadBlob(new Blob([exportHighlights(highlights)], { type: 'application/json' }), 'djtube-highlights.json')}
          disabled={highlights.length === 0}
        >
          <Icon name="download" />
        </button>
        <button type="button" className="icon-button" title="Importar" aria-label="Importar" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onImport(file);
          }}
        />
      </div>
      <div className="list">
        {visible.map((highlight) => (
            <article key={highlight.id} className="highlight">
              <p>
                {renaming?.id === highlight.id ? (
                  <input
                    className="cut-rename"
                    type="text"
                    aria-label="Nombre del corte"
                    autoFocus
                    maxLength={80}
                    value={renaming.value}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenaming({ id: highlight.id, value: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        onChange(renameHighlight(highlights, highlight.id, renaming.value));
                        setRenaming(null);
                      } else if (event.key === 'Escape') {
                        event.stopPropagation();
                        setRenaming(null);
                      }
                    }}
                    onBlur={() => {
                      onChange(renameHighlight(highlights, highlight.id, renaming.value));
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <strong>{highlight.label}</strong>
                )}
                <span>
                  {decodeEntities(highlight.title)} · {formatTime(highlight.start)}–{formatTime(highlight.end)}
                </span>
              </p>
              <div className="row">
                {onEdit ? (
                  <button type="button" className="icon-button tone-cut" title="Editar corte" aria-label="Editar corte" onClick={() => onEdit(highlight)}>
                    <Icon name="cuts" size={15} />
                  </button>
                ) : null}
                <button type="button" className="icon-button tone-key" title="Renombrar" aria-label="Renombrar" onMouseDown={(event) => event.preventDefault()} onClick={() => setRenaming({ id: highlight.id, value: highlight.label })}>
                  <Icon name="edit" size={15} />
                </button>
                <button type="button" className="icon-button" title="Borrar" aria-label="Borrar" onClick={() => onChange(highlights.filter((item) => item.id !== highlight.id))}>
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
      </div>
    </section>
  );
}
