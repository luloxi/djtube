import { useEffect, useState } from 'react';
import type { DeckId, Track } from '../types';
import { TrackRow } from './Library';

type Item = Track & { channel?: string };

export function SearchBox({ onLoad, onQueue }: { onLoad: (track: Track, deck: DeckId) => void; onQueue: (track: Track) => void }) {
  const [mode, setMode] = useState<'loading' | 'ready' | 'nokey' | 'down'>('loading');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    let cancel = false;
    fetch('/api/search?probe=1')
      .then(async (response) => {
        const data = (await response.json()) as { ok?: boolean; reason?: string };
        if (cancel) return;
        if (data.ok) setMode('ready');
        else if (data.reason === 'missing_key') setMode('nokey');
        else setMode('down');
      })
      .catch(() => {
        if (!cancel) setMode('down');
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setNote('Buscando…');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { ok?: boolean; reason?: string; items?: Item[] };
      if (!data.ok && data.reason === 'missing_key') {
        setMode('nokey');
        setItems([]);
        setNote('');
        return;
      }
      if (!data.ok) {
        setNote('YouTube no respondió. Pegar un enlace sigue funcionando.');
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
      setNote(data.items?.length ? '' : 'Sin resultados.');
    } catch {
      setNote('No pude buscar. Pegar un enlace sigue funcionando.');
    }
  }

  return (
    <section className="panel" aria-label="Buscar">
      <h2>Buscar</h2>
      {mode === 'nokey' ? (
        <p className="hint" data-testid="search-hint">
          La búsqueda se activa cuando el worker tiene el secreto YT_API_KEY. Mientras, pega un enlace.
        </p>
      ) : (
        <form className="stack" onSubmit={search}>
          <input
            type="search"
            placeholder={mode === 'loading' ? 'Comprobando búsqueda…' : 'Buscar en YouTube'}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar en YouTube"
            disabled={mode !== 'ready'}
          />
          <button type="submit" disabled={mode !== 'ready'}>
            Buscar
          </button>
        </form>
      )}
      {mode === 'down' ? <p className="hint">No pude comprobar la búsqueda. Pegar un enlace sigue funcionando.</p> : null}
      {note ? <p className="hint">{note}</p> : null}
      <div className="list">
        {items.map((item) => (
          <div key={item.videoId} className="search-hit">
            <TrackRow track={item} onLoad={onLoad} />
            <button type="button" onClick={() => onQueue(item)}>
              Cola
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
