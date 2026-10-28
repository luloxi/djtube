import { useEffect, useState } from 'react';
import type { DeckId, Track } from '../types';
import { parseYouTubeUrl } from '../lib/youtube';
import { Icon } from './icons';
import { TrackRow } from './Library';

type Item = Track & { channel?: string };

export function SearchBox({ onLoad, onYouTube }: { onLoad: (track: Track, deck: DeckId) => void; onYouTube: (raw: string) => void }) {
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

  function takeUrl(raw: string) {
    setQuery('');
    setItems([]);
    setNote('');
    onYouTube(raw);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (parseYouTubeUrl(q)) {
      takeUrl(q);
      return;
    }
    if (mode !== 'ready') {
      setNote(mode === 'nokey' ? 'Sin clave' : 'Sin búsqueda');
      setItems([]);
      return;
    }
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

  const looksLikeUrl = Boolean(parseYouTubeUrl(query));
  const canSearch = mode === 'ready' || looksLikeUrl;

  return (
    <section className="panel" aria-label="Buscar">
      <h2>Buscar</h2>
      <form className="search-form" onSubmit={search}>
        <input
          type="search"
          placeholder="URL o búsqueda"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text') || event.clipboardData.getData('text/plain');
            if (!parseYouTubeUrl(text)) return;
            event.preventDefault();
            takeUrl(text);
          }}
          aria-label="Buscar en YouTube"
          data-testid="search-hint"
          enterKeyHint="search"
        />
        <button type="submit" className="icon-button search-go" disabled={!query.trim() || !canSearch} aria-label="Buscar" title="Buscar">
          <Icon name="search" />
        </button>
      </form>
      {note ? <p className="hint">{note}</p> : mode === 'nokey' ? <p className="hint">Sin clave</p> : mode === 'down' ? <p className="hint">Sin búsqueda</p> : null}
      <div className="list">
        {items.map((item) => (
          <TrackRow key={item.videoId} track={item} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}
