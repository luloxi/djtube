import { useEffect, useState } from 'react';
import type { DeckId, Track } from '../types';
import { Icon } from './icons';
import { TrackRow } from './Library';

type Item = Track & { channel?: string };

export function SearchBox({ onLoad }: { onLoad: (track: Track, deck: DeckId) => void }) {
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
    setNote('');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await response.json()) as { ok?: boolean; reason?: string; items?: Item[] };
      if (!data.ok && data.reason === 'missing_key') {
        setMode('nokey');
        setItems([]);
        return;
      }
      if (!data.ok) {
        setNote('Sin respuesta');
        setItems([]);
        return;
      }
      setItems(data.items ?? []);
      setNote(data.items?.length ? '' : 'Nada');
    } catch {
      setNote('Búsqueda falló');
    }
  }

  const placeholder = mode === 'loading' ? '…' : mode === 'nokey' ? 'Sin clave' : mode === 'down' ? 'Sin búsqueda' : 'YouTube';

  return (
    <section className="panel" aria-label="Buscar">
      <h2>Buscar</h2>
      <form className="search-form" onSubmit={search}>
        <input
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar en YouTube"
          data-testid="search-hint"
          disabled={mode !== 'ready'}
          enterKeyHint="search"
        />
        <button type="submit" className="icon-button search-go" disabled={mode !== 'ready'} aria-label="Buscar" title="Buscar">
          <Icon name="search" />
        </button>
      </form>
      {note ? <p className="hint">{note}</p> : null}
      <div className="list">
        {items.map((item) => (
          <TrackRow key={item.videoId} track={item} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}
