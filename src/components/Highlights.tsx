import { useRef, useState } from 'react';
import type { DeckId, Highlight } from '../types';
import { formatTime } from '../lib/format';
import { exportHighlights, importHighlights, searchHighlights } from '../lib/highlights';
import { downloadBlob } from '../lib/download';
import { Icon } from './icons';

type Props = {
  highlights: Highlight[];
  onChange: (next: Highlight[]) => void;
  onPlay: (highlight: Highlight, deck: DeckId, play: boolean) => void;
  onStatus: (message: string) => void;
};

export function Highlights({ highlights, onChange, onPlay, onStatus }: Props) {
  const [query, setQuery] = useState('');
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
                <strong>{highlight.label}</strong>
                <span>
                  {highlight.title} · {formatTime(highlight.start)}–{formatTime(highlight.end)}
                </span>
              </p>
              <div className="row">
                <DeckHit icon="play" deck="A" label="Play A" onClick={() => onPlay(highlight, 'A', true)} />
                <DeckHit icon="cue" deck="A" label="Cue A" onClick={() => onPlay(highlight, 'A', false)} />
                <DeckHit icon="play" deck="B" label="Play B" onClick={() => onPlay(highlight, 'B', true)} />
                <DeckHit icon="cue" deck="B" label="Cue B" onClick={() => onPlay(highlight, 'B', false)} />
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

function DeckHit({ icon, deck, label, onClick }: { icon: 'play' | 'cue'; deck: 'A' | 'B'; label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-button letter" title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} size={15} />
      <span>{deck}</span>
    </button>
  );
}
