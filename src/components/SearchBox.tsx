import { useEffect, useRef, useState } from 'react';
import type { DeckId, Track } from '../types';
import { parseYouTubeUrl } from '../lib/youtube';
import { fetchSearch } from '../lib/yt-key';
import { normalizeSearchQuery } from '../lib/quota';
import type { SearchKind } from '../lib/youtube-search';
import { decodeEntities } from '../lib/html-text';
import { Icon } from './icons';
import { TrackRow } from './Library';

type Item = Track & { channel?: string; playlistId?: string };

const LIMIT = 'Llegaste al tope de búsquedas de hoy.';
const QUOTA = 'La clave compartida se quedó sin cupo hoy.';
/** Quiet time after the last keystroke before the search runs by itself. */
export const AUTO_SEARCH_MS = 3000;
export const AUTO_SEARCH_MIN_CHARS = 2;

export function SearchBox({
  ownKey,
  onLoad,
  onYouTube,
  onOpenKey,
  onLimited,
  onAddPlaylist,
}: {
  ownKey: string | null;
  onLoad: (track: Track, deck: DeckId) => void;
  onYouTube: (raw: string) => void;
  onOpenKey: () => void;
  onLimited: (reason: 'limit' | 'quota') => void;
  onAddPlaylist: (playlistId: string, deck: DeckId) => void;
}) {
  const [mode, setMode] = useState<'loading' | 'ready' | 'nokey' | 'down'>('loading');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [kind, setKind] = useState<SearchKind>('video');
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

  const seq = useRef(0);
  const lastKey = useRef('');
  const timer = useRef<number | null>(null);
  const [armed, setArmed] = useState(false);

  function disarm() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setArmed(false);
  }

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  function takeUrl(raw: string) {
    disarm();
    setQuery('');
    setItems([]);
    setNote('');
    setHelp(null);
    lastKey.current = '';
    onYouTube(raw);
  }

  /** Runs one search. The same text and type is never asked twice in a row. Nothing is ever added from here. */
  async function runSearch(raw: string, type: SearchKind) {
    const q = raw.trim();
    disarm();
    if (!q) return;
    const key = `${type}:${normalizeSearchQuery(q)}`;
    if (key === lastKey.current) return;
    if (mode !== 'ready') {
      setNote(mode === 'nokey' ? 'Sin clave' : 'Sin búsqueda');
      setHelp(mode === 'nokey' ? 'quota' : null);
      setItems([]);
      return;
    }
    const mine = ++seq.current;
    lastKey.current = key;
    setNote('');
    setHelp(null);
    const data = await fetchSearch(q, ownKey, type);
    if (mine !== seq.current) return;
    if (!data.ok) lastKey.current = '';
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

  function switchKind(next: SearchKind) {
    if (next === kind) return;
    setKind(next);
    seq.current += 1;
    lastKey.current = '';
    setItems([]);
    setNote('');
    setHelp(null);
    const q = query.trim();
    if (q && !parseYouTubeUrl(q)) void runSearch(q, next);
    else disarm();
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (parseYouTubeUrl(q)) {
      takeUrl(q);
      return;
    }
    void runSearch(q, kind);
  }

  function typed(value: string) {
    setQuery(value);
    disarm();
    const q = value.trim();
    if (q.length < AUTO_SEARCH_MIN_CHARS || parseYouTubeUrl(q) || mode !== 'ready') return;
    if (`${kind}:${normalizeSearchQuery(q)}` === lastKey.current) return;
    setArmed(true);
    timer.current = window.setTimeout(() => void runSearch(value, kind), AUTO_SEARCH_MS);
  }

  const looksLikeUrl = Boolean(parseYouTubeUrl(query));
  const canSearch = mode === 'ready' || looksLikeUrl;
  const helpText = help === 'limit' ? LIMIT : help === 'quota' ? QUOTA : '';

  return (
    <section className="panel" aria-label="Buscar">
      <form className="search-form" onSubmit={submit}>
        <div className="search-field">
          <input
            type="search"
            placeholder="URL o búsqueda"
            value={query}
            onChange={(event) => typed(event.target.value)}
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
          {armed ? <span className="search-timer" key={query} data-testid="search-timer" aria-hidden="true" style={{ animationDuration: `${AUTO_SEARCH_MS}ms` }} /> : null}
        </div>
        <button type="submit" className="icon-button tone-search search-go" disabled={!query.trim() || !canSearch} aria-label="Buscar" title="Buscar" data-testid="search-go">
          <Icon name="search" />
        </button>
        <div className="kind-switch" role="radiogroup" aria-label="Qué buscar" data-kind={kind} title="Videos o playlists">
          <span className="kind-pill" aria-hidden="true" />
          <button type="button" role="radio" aria-checked={kind === 'video'} className="kind-opt" data-testid="kind-video" title="Buscar videos" onClick={() => switchKind('video')}>
            Videos
          </button>
          <button type="button" role="radio" aria-checked={kind === 'playlist'} className="kind-opt" data-testid="kind-playlist" title="Buscar playlists" onClick={() => switchKind('playlist')}>
            Playlists
          </button>
        </div>
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
        {items.map((item) =>
          item.playlistId ? (
            <PlaylistRow key={item.playlistId} item={item} onAdd={onAddPlaylist} />
          ) : (
            <TrackRow key={item.videoId} track={item} onLoad={onLoad} />
          ),
        )}
      </div>
    </section>
  );
}

function PlaylistRow({ item, onAdd }: { item: Item; onAdd: (playlistId: string, deck: DeckId) => void }) {
  const title = decodeEntities(item.title);
  const id = item.playlistId ?? '';
  return (
    <div className="pl-row" data-testid="playlist-row">
      <button type="button" className="track-add track-add-a" aria-label={`Playlist en deck A: ${title}`} title="A: primer tema al deck A, el resto a la cola" data-testid="playlist-a" onClick={() => onAdd(id, 'A')}>
        A
      </button>
      {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="thumb" />}
      <p className="pl-name" title={title}>
        <span>{title}</span>
        {item.channel ? <small>{decodeEntities(item.channel)}</small> : null}
      </p>
      <button type="button" className="track-add track-add-b" aria-label={`Playlist en deck B: ${title}`} title="B: primer tema al deck B, el resto a la cola" data-testid="playlist-b" onClick={() => onAdd(id, 'B')}>
        B
      </button>
    </div>
  );
}
