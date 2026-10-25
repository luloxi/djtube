import { useRef, useState } from 'react';
import type { AudioCoverage, DeckId, Highlight } from '../types';
import { formatTime } from '../lib/format';
import { exportHighlights, importHighlights, regionHasAudio, searchHighlights } from '../lib/highlights';
import { downloadBlob } from '../lib/download';

type Props = {
  highlights: Highlight[];
  coverage: Record<string, AudioCoverage>;
  onChange: (next: Highlight[]) => void;
  onPlay: (highlight: Highlight, deck: DeckId, play: boolean) => void;
  onDownload: (highlight: Highlight) => Promise<void>;
  onStatus: (message: string) => void;
};

const NO_AUDIO = 'No hay audio de esta zona. Analiza el deck cubriendo este tramo.';

export function Highlights({ highlights, coverage, onChange, onPlay, onDownload, onStatus }: Props) {
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const visible = searchHighlights(highlights, query);

  function onImport(file: File) {
    file.text().then((text) => {
      try {
        onChange(importHighlights(highlights, text));
        onStatus('Highlights importados.');
      } catch {
        onStatus('Ese JSON no es una biblioteca de highlights.');
      }
    }).catch(() => onStatus('No pude leer el archivo.'));
  }

  return (
    <section className="panel" aria-label="Highlights">
      <h2>Highlights</h2>
      <input
        type="search"
        placeholder="Buscar cortes"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar highlights"
      />
      <div className="row">
        <button
          type="button"
          onClick={() => downloadBlob(new Blob([exportHighlights(highlights)], { type: 'application/json' }), 'djtube-highlights.json')}
          disabled={highlights.length === 0}
        >
          Exportar
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Importar
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
        {visible.length === 0 ? <p className="hint">Arrastra sobre la onda para guardar un corte.</p> : null}
        {visible.map((highlight) => {
          const canAudio = regionHasAudio(coverage[highlight.videoId], highlight.start, highlight.end);
          return (
            <article key={highlight.id} className="highlight">
              <p>
                <strong>{highlight.label}</strong>
                <span>
                  {highlight.title} · {formatTime(highlight.start)}–{formatTime(highlight.end)}
                </span>
              </p>
              <div className="row">
                <button type="button" onClick={() => onPlay(highlight, 'A', true)}>
                  Play A
                </button>
                <button type="button" onClick={() => onPlay(highlight, 'A', false)}>
                  Cue A
                </button>
                <button type="button" onClick={() => onPlay(highlight, 'B', true)}>
                  Play B
                </button>
                <button type="button" onClick={() => onPlay(highlight, 'B', false)}>
                  Cue B
                </button>
                <span className="tip" title={canAudio ? 'Descargar el corte en .webm' : NO_AUDIO}>
                  <button type="button" disabled={!canAudio} onClick={() => void onDownload(highlight)}>
                    Audio
                  </button>
                </span>
                <button type="button" onClick={() => onChange(highlights.filter((item) => item.id !== highlight.id))}>
                  Borrar
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
