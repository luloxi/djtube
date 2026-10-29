import { useEffect, useState } from 'react';
import type { DeckId, Track } from '../types';
import { parseYouTubeUrl } from '../lib/youtube';
import { fetchSearch } from '../lib/yt-key';
import { Icon } from './icons';
import { TrackRow } from './Library';

type Item = Track & { channel?: string };

const LIMIT = 'Llegaste al tope de búsquedas de hoy.';
const QUOTA = 'La clave compartida se quedó sin cupo hoy.';

export function SearchBox({
  ownKey,
  onLoad,
  onYouTube,
  onOpenKey,
  onLimited,
}: {
  ownKey: string | null;
  onLoad: (track: Track, deck: DeckId) => void;
  onYouTube: (raw: string) => void;
  onOpenKey: () => void;
  onLimited: (reason: 'limit' | 'quota') => void;
}) {
  const [mode, setMode] = useState<'loading' | 'ready' | 'nokey' | 'down'>('loading');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState('');
  const [help, setHelp] = useState<'limit' | 'quota' | null>(null);

  useEffect(() => {
    if (ownKey) {
      setMode('ready');
      return;
    }
    let cancel = false;
    setMode('loading');
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
  }, [ownKey]);

  function takeUrl(raw: string) {
    setQuery('');
    setItems([]);
    setNote('');
    setHelp(null);
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
      setHelp(mode === 'nokey' ? 'quota' : null);
      setItems([]);
      return;
    }
    setNote('');
    setHelp(null);
    const data = await fetchSearch(q, ownKey);
    if (!data.ok && (data.reason === 'limit' || data.reason === 'quota')) {
      setHelp(data.reason);
      setItems([]);
      onLimited(data.reason);
      return;
    }
    if (!data.ok && data.reason === 'missing_key') {
      setMode('nokey');
      setHelp('quota');
      setItems([]);
      return;
    }
    if (!data.ok && data.reason === 'invalid') {
      setNote('Clave rechazada');
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
  }

  const looksLikeUrl = Boolean(parseYouTubeUrl(query));
  const canSearch = mode === 'ready' || looksLikeUrl;
  const helpText = help === 'limit' ? LIMIT : help === 'quota' ? QUOTA : '';

  return (
    <section className="panel" aria-label="Buscar">
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
        <button type="submit" className="icon-button tone-search search-go" disabled={!query.trim() || !canSearch} aria-label="Buscar" title="Buscar">
          <Icon name="search" />
        </button>
      </form>
      {helpText ? (
        <p className="hint" data-testid="search-limit">
          {helpText}{' '}
          <button type="button" className="text-link" onClick={onOpenKey}>
            Usá tu propia clave
          </button>
        </p>
      ) : note ? (
        <p className="hint">{note}</p>
      ) : mode === 'nokey' ? (
        <p className="hint">
          Sin clave{' '}
          <button type="button" className="text-link" onClick={onOpenKey}>
            Usá tu propia clave
          </button>
        </p>
      ) : mode === 'down' ? (
        <p className="hint">Sin búsqueda</p>
      ) : null}
      <div className="list">
        {items.map((item) => (
          <TrackRow key={item.videoId} track={item} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}
