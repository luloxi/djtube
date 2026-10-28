import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DeckId, DeckModel, Highlight, Track } from './types';
import { emptyDeck } from './types';
import { readStoredMode, storeMode, type AppMode } from './lib/mode';
import { clampLayout, layoutChanged, readLayout, storeLayout, type Bounds, type DeskLayout, type PanelBox } from './lib/layout';
import { AdminPanel } from './components/AdminPanel';
import { Deck, type DeckHandle } from './components/Deck';
import { FreeSlot } from './components/FreeSlot';
import { SplitBars } from './components/SplitBars';
import { Icon } from './components/icons';
import { WebcamTile } from './components/WebcamTile';
import { Header, type SideTab } from './components/Header';
import { InstallBanner } from './components/InstallBanner';
import { KeyModal } from './components/KeyModal';
import { Library } from './components/Library';
import { PlaylistAsk } from './components/PlaylistAsk';
import { Preparar } from './components/Preparar';
import { SearchBox } from './components/SearchBox';
import { Transition } from './components/Transition';
import { Welcome } from './components/Welcome';
import { addHighlight } from './lib/highlights';
import { deckSnapshot, loadHighlights, loadLibrary, loadSession, saveHighlights, saveLibrary, saveSession } from './lib/idb';
import { clearQueue, removeQueuedTrack, restoreTrack } from './lib/library';
import { clamp01, effectiveGain, transitionGain } from './lib/mixer';
import { fetchPlaylistPage, playlistItemToTrack, takeNewPlaylistItems, walkPlaylistPages, type PlaylistItem } from './lib/playlist';
import { enrichTracks, parseYouTubeUrl, trackFromId, uniqueIds, type ParsedYouTube } from './lib/youtube';
import { readPlaylistIds } from './lib/youtube-api';
import { readOwnKey, writeOwnKey, clearOwnKey } from './lib/yt-key';

function deskBounds(): Bounds {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: Math.max(1, window.innerHeight - 44) };
}

export function App({
  owner = false,
  email = null,
  access = null,
  configured = true,
  onSignIn,
  onSignOut,
}: {
  owner?: boolean;
  email?: string | null;
  access?: string | null;
  configured?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
} = {}) {
  const [x, setX] = useState(0.5);
  const [seconds, setSeconds] = useState(3);
  const [decks, setDecks] = useState<Record<DeckId, DeckModel>>({ A: emptyDeck(), B: emptyDeck() });
  const [library, setLibrary] = useState<Track[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistAsk, setPlaylistAsk] = useState<ParsedYouTube | null>(null);
  const [booted, setBooted] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; undo?: () => void } | null>(null);
  const [tab, setTab] = useState<SideTab | null>(null);
  const [leftPane, setLeftPane] = useState<'queue' | 'search'>('queue');
  const [adminOpen, setAdminOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [mode, setMode] = useState<AppMode | null>(() => readStoredMode(window.localStorage));
  const [accessState, setAccessState] = useState<string | null>(access);
  const [requesting, setRequesting] = useState(false);
  const [ownKey, setOwnKey] = useState<string | null>(() => readOwnKey(window.localStorage));
  const [keyOpen, setKeyOpen] = useState(false);
  const [limitNote, setLimitNote] = useState('');
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches);
  const [layout, setLayout] = useState<DeskLayout>(() => {
    const bounds = deskBounds();
    const next = readLayout(window.localStorage, bounds);
    storeLayout(window.localStorage, next, bounds);
    return next;
  });
  const [webcamOn, setWebcamOn] = useState(() => {
    try {
      return window.localStorage.getItem('djtube-webcam') === '1';
    } catch {
      return false;
    }
  });
  const workspaceRef = useRef<HTMLDivElement>(null);
  const playlistGen = useRef(0);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    const apply = () => setDesktop(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem('djtube-chrome');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const el = workspaceRef.current;
    if (!desktop || !el) return;
    const fit = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      setLayout((prev) => {
        const next = clampLayout(prev, rect);
        if (!layoutChanged(prev, next)) return prev;
        storeLayout(window.localStorage, next, rect);
        return next;
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [desktop]);

  function deskNow(): Bounds {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (rect && rect.width > 8 && rect.height > 8) return rect;
    return deskBounds();
  }

  function commitLayout(next: DeskLayout, persist: boolean) {
    setLayout(next);
    if (persist) storeLayout(window.localStorage, next, deskNow());
  }

  function placeWebcam(box: PanelBox, persist: boolean) {
    setLayout((prev) => {
      const next = { ...prev, webcam: box };
      if (persist) storeLayout(window.localStorage, next, deskNow());
      return next;
    });
  }

  function resetLayout() {
    const next = clampLayout({ queue: 0.22, decks: 0.5, mixer: 0.32, webcam: { x: 70, y: 6, w: 24, h: 28 } }, deskNow());
    commitLayout(next, true);
  }

  function toggleWebcam() {
    setWebcamOn((on) => {
      const next = !on;
      try {
        window.localStorage.setItem('djtube-webcam', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function anyPlaying(): boolean {
    return (['A', 'B'] as DeckId[]).some((id) => {
      try {
        return handleFor(id)?.getPlayer()?.getPlayerState() === 1;
      } catch {
        return false;
      }
    });
  }

  function chooseMode(next: AppMode) {
    setMode(next);
    storeMode(window.localStorage, next);
  }

  function setStatus(text: string) {
    if (!text) return;
    setToast({ id: Date.now(), text });
  }

  function explainLimit(reason: 'limit' | 'quota') {
    setLimitNote(reason === 'quota' ? 'La clave compartida se quedó sin cupo hoy.' : 'Llegaste al tope de búsquedas de hoy.');
  }

  async function requestUnlimited() {
    if (requesting) return;
    setRequesting(true);
    try {
      const response = await fetch('/api/access/request', { method: 'POST' });
      const data = (await response.json().catch(() => null)) as { access?: string; unlimited?: boolean; reason?: string } | null;
      if (typeof data?.access === 'string') setAccessState(data.access);
      if (!response.ok || !data) {
        setStatus(data?.reason === 'blocked' ? 'Bloqueado' : 'No se pudo pedir');
        return;
      }
      if (data.reason === 'blocked' || data.access === 'blocked') setStatus('Bloqueado');
      else if (data.unlimited) setStatus('Sin límite');
      else setStatus('Pedido enviado');
    } catch {
      setStatus('No se pudo pedir');
    } finally {
      setRequesting(false);
    }
  }

  function saveOwnKey(raw: string): boolean {
    const ok = writeOwnKey(window.localStorage, raw);
    if (!ok) return false;
    setOwnKey(readOwnKey(window.localStorage));
    setLimitNote('');
    return true;
  }

  function removeOwnKey() {
    clearOwnKey(window.localStorage);
    setOwnKey(null);
  }

  const xRef = useRef(0.5);
  const glideRef = useRef<number | null>(null);
  const decksRef = useRef(decks);
  const libraryRef = useRef(library);
  const deckA = useRef<DeckHandle>(null);
  const deckB = useRef<DeckHandle>(null);
  decksRef.current = decks;
  libraryRef.current = library;

  const handleFor = (id: DeckId) => (id === 'A' ? deckA.current : deckB.current);

  function setPosition(next: number, fromUser = false) {
    const value = clamp01(next);
    xRef.current = value;
    setX(value);
    if (fromUser && glideRef.current != null) {
      cancelAnimationFrame(glideRef.current);
      glideRef.current = null;
    }
  }

  function glide() {
    const target = xRef.current <= 0.5 ? 1 : 0;
    const from = xRef.current;
    const start = performance.now();
    const ms = Math.max(0.3, seconds) * 1000;
    if (glideRef.current != null) cancelAnimationFrame(glideRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setPosition(from + (target - from) * t);
      if (t < 1) glideRef.current = requestAnimationFrame(step);
      else glideRef.current = null;
    };
    glideRef.current = requestAnimationFrame(step);
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([loadSession(), loadLibrary(), loadHighlights()]).then(([session, storedLibrary, storedHighlights]) => {
      if (cancel) return;
      if (session) {
        const position = clamp01(session.x);
        xRef.current = position;
        setX(position);
        setDecks({
          A: { ...emptyDeck(), ...session.decks.A, peaks: null },
          B: { ...emptyDeck(), ...session.decks.B, peaks: null },
        });
      }
      setLibrary(storedLibrary);
      setHighlights(storedHighlights);
      setBooted(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!booted) return;
    const timer = window.setTimeout(() => {
      void saveSession({ x: xRef.current, decks: { A: deckSnapshot(decks.A), B: deckSnapshot(decks.B) } });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [booted, x, decks]);

  useEffect(() => {
    if (!booted) return;
    void saveLibrary(library);
  }, [booted, library]);

  useEffect(() => {
    if (!booted) return;
    void saveHighlights(highlights);
  }, [booted, highlights]);

  useEffect(() => {
    setAccessState(access ?? null);
  }, [access]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 4200 : 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!adminOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAdminOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [adminOpen]);

  useEffect(() => {
    if (!owner) return;
    let cancel = false;
    const tick = () => {
      fetch('/api/admin/people', { cache: 'no-store' })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as { pendingCount?: unknown };
          if (cancel || !response.ok || typeof data?.pendingCount !== 'number') return;
          setPending(data.pendingCount);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 20000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, [owner, adminOpen]);

  useEffect(() => {
    function playing(id: DeckId): boolean {
      try {
        return handleFor(id)?.getPlayer()?.getPlayerState() === 1;
      } catch {
        return false;
      }
    }
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat) return;
        if (playing('A') || playing('B')) {
          deckA.current?.pause();
          deckB.current?.pause();
        } else {
          deckA.current?.play();
          deckB.current?.play();
        }
      } else if ((event.key === 'q' || event.key === 'Q') && !event.repeat) {
        deckA.current?.toggle();
      } else if ((event.key === 'w' || event.key === 'W') && !event.repeat) {
        deckB.current?.toggle();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const step = event.shiftKey ? 0.08 : 0.02;
        const delta = event.key === 'ArrowLeft' ? -step : step;
        const value = clamp01(xRef.current + delta);
        xRef.current = value;
        setX(value);
        if (glideRef.current != null) {
          cancelAnimationFrame(glideRef.current);
          glideRef.current = null;
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function remember(track: Track) {
    setLibrary((prev) => (prev.some((item) => item.videoId === track.videoId) ? prev : [track, ...prev]));
  }

  function rename(videoId: string, title: string, thumbnail?: string | null) {
    setLibrary((prev) => prev.map((item) => (item.videoId === videoId ? { ...item, title, thumbnail: thumbnail ?? item.thumbnail } : item)));
    setDecks((prev) => ({
      A: prev.A.videoId === videoId ? { ...prev.A, title, thumbnail: thumbnail ?? prev.A.thumbnail } : prev.A,
      B: prev.B.videoId === videoId ? { ...prev.B, title, thumbnail: thumbnail ?? prev.B.thumbnail } : prev.B,
    }));
  }

  async function loadInto(id: DeckId, track: Track, at?: { seconds: number; play: boolean }) {
    remember(track);
    setDecks((prev) => {
      const same = prev[id].videoId === track.videoId;
      return {
        ...prev,
        [id]: {
          ...prev[id],
          videoId: track.videoId,
          title: track.title !== track.videoId ? track.title : prev[id].title || track.title,
          thumbnail: track.thumbnail,
          peaks: null,
          cueTime: same ? prev[id].cueTime : 0,
        },
      };
    });
    const handle = handleFor(id);
    handle?.cueVideo(track.videoId);
    if (at) {
      const ready = await handle?.seekWhenReady(at.seconds, track.videoId);
      if (at.play) handle?.play();
      else handle?.pause();
      if (at.play) await handle?.seekWhenReady(at.seconds, track.videoId);
      if (!ready) setStatus('Salto tardó');
      else setStatus(at.play ? `Play ${id}` : `Cue ${id}`);
      return;
    }
    setStatus(`Deck ${id}`);
  }

  function showQueue() {
    setLeftPane('queue');
    setTab('queue');
  }

  function appendTracks(items: PlaylistItem[]) {
    const tracks = items.map(playlistItemToTrack);
    if (!tracks.length) return;
    setLibrary((prev) => {
      const known = new Set(prev.map((item) => item.videoId));
      const fresh = tracks.filter((item) => !known.has(item.videoId));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }

  function addVideoToQueue(videoId: string) {
    remember(trackFromId(videoId));
    void enrichTracks([videoId], rename);
    setStatus('En cola');
    showQueue();
  }

  async function addWholePlaylist(playlistId: string) {
    const gen = ++playlistGen.current;
    setPlaylistLoading(true);
    setStatus('Agregando…');
    showQueue();
    const queued = new Set(libraryRef.current.map((item) => item.videoId));
    let added = 0;
    const take = (items: PlaylistItem[]) => {
      if (gen !== playlistGen.current || !items.length) return;
      added += items.length;
      appendTracks(items);
    };
    try {
      added = await walkPlaylistPages((token) => fetchPlaylistPage(playlistId, token, undefined, ownKey), queued, take);
    } catch (error) {
      if (gen !== playlistGen.current) return;
      const reason = error instanceof Error ? error.message : '';
      if (reason === 'limit' || reason === 'quota') {
        setPlaylistLoading(false);
        explainLimit(reason);
        if (added > 0) setStatus(`${added} temas agregados`);
        return;
      }
      if (added === 0) {
        try {
          const ids = uniqueIds(await readPlaylistIds(playlistId));
          const fresh = takeNewPlaylistItems(
            ids.map((id) => ({ videoId: id, title: id, thumbnail: null })),
            queued,
          );
          take(fresh);
          void enrichTracks(
            fresh.map((item) => item.videoId),
            rename,
          );
        } catch {
          if (gen === playlistGen.current) {
            setPlaylistLoading(false);
            setStatus('Playlist no leída');
          }
          return;
        }
      }
    }
    if (gen !== playlistGen.current) return;
    setPlaylistLoading(false);
    setStatus(`${added} temas agregados`);
  }

  function onYouTube(raw: string) {
    const parsed = parseYouTubeUrl(raw);
    if (!parsed) {
      setStatus('Enlace inválido');
      return;
    }
    if (parsed.playlistId) {
      setPlaylistAsk(parsed);
      return;
    }
    if (parsed.videoId) addVideoToQueue(parsed.videoId);
  }

  function removeQueued(track: Track) {
    const keep = [decksRef.current.A.videoId, decksRef.current.B.videoId];
    const result = removeQueuedTrack(libraryRef.current, track.videoId, keep);
    if (!result.removed) return;
    const removed = result.removed;
    setLibrary(result.tracks);
    setToast({
      id: Date.now(),
      text: 'deshacer',
      undo: () => {
        setLibrary((current) => restoreTrack(current, removed.track, removed.index));
        setToast(null);
      },
    });
  }

  function saveHighlight(id: DeckId, start: number, end: number, label: string) {
    const deck = decksRef.current[id];
    if (!deck.videoId) return;
    const highlight: Highlight = {
      id: crypto.randomUUID(),
      videoId: deck.videoId,
      title: deck.title || deck.videoId,
      start,
      end,
      label,
      peaks: [],
    };
    setHighlights((prev) => addHighlight(prev, highlight));
    setStatus('Guardado');
  }

  const curve = transitionGain(x);
  const shownA = effectiveGain(curve.a, decks.A.volume);
  const shownB = effectiveGain(curve.b, decks.B.volume);

  const leftOpen = mode === 'dj' && (tab === 'queue' || tab === 'search');

  if (!mode) {
    return (
      <div className="shell" data-testid="app">
        <Welcome onPick={chooseMode} />
      </div>
    );
  }

  function selectLeft(next: 'queue' | 'search') {
    setLeftPane(next);
    setTab(next);
  }

  return (
    <div className="shell" data-mode={mode} data-testid="app">
      {mode === 'preparar' ? (
        <Preparar
          highlights={highlights}
          onHighlights={setHighlights}
          onPlayHighlight={(highlight, id, play) => void loadInto(id, trackFromId(highlight.videoId, highlight.title), { seconds: highlight.start, play })}
          onStatus={setStatus}
        />
      ) : null}
      {mode === 'dj' ? (
      <div
        ref={workspaceRef}
        className={desktop ? 'workspace is-split' : leftOpen ? 'workspace list-open' : 'workspace'}
        style={
          desktop
            ? ({
                '--split-queue': layout.queue,
                '--split-decks': layout.decks,
                '--split-mixer': layout.mixer,
              } as CSSProperties)
            : undefined
        }
      >
        <aside className={leftOpen ? 'side side-left is-open' : 'side side-left'} aria-label="Cola y búsqueda">
          <div className="side-tabs">
            <button type="button" className="icon-button" aria-pressed={leftPane === 'queue'} aria-label="Cola" title="Cola" onClick={() => selectLeft('queue')}>
              <Icon name="queue" />
            </button>
            <button type="button" className="icon-button" aria-pressed={leftPane === 'search'} aria-label="Buscar" title="Buscar" onClick={() => selectLeft('search')}>
              <Icon name="search" />
            </button>
          </div>
          <div className={leftPane === 'queue' ? 'pane pane-queue is-open' : 'pane pane-queue'}>
            <Library
              tracks={library}
              loading={playlistLoading}
              onLoad={(track, id) => void loadInto(id, track)}
              keepIds={[decks.A.videoId, decks.B.videoId]}
              onRemove={removeQueued}
              onClear={() => setLibrary((prev) => clearQueue(prev, [decks.A.videoId, decks.B.videoId]))}
            />
          </div>
          <div className={leftPane === 'search' ? 'pane pane-search is-open' : 'pane pane-search'}>
            <SearchBox
              ownKey={ownKey}
              onLoad={(track, id) => void loadInto(id, track)}
              onYouTube={onYouTube}
              onOpenKey={() => {
                setLimitNote('');
                setKeyOpen(true);
              }}
              onLimited={explainLimit}
            />
          </div>
        </aside>
        <main className="stage">
          <div className="decks">
            {(['A', 'B'] as const).map((id) => (
              <Deck
                key={id}
                ref={id === 'A' ? deckA : deckB}
                id={id}
                videoId={decks[id].videoId}
                title={decks[id].title}
                gain={id === 'A' ? shownA : shownB}
                playbackRate={decks[id].playbackRate}
                peaks={decks[id].peaks}
                onRate={(playbackRate) => setDecks((prev) => ({ ...prev, [id]: { ...prev[id], playbackRate } }))}
                onTitle={rename}
                onDropTrack={(track) => void loadInto(id, track)}
                onSaveHighlight={(start, end, label) => saveHighlight(id, start, end, label)}
                onStatus={setStatus}
              />
            ))}
          </div>
          <div className="queue-strip" aria-label="Cola">
            <Library
              tracks={library}
              loading={playlistLoading}
              compact
              onLoad={(track, id) => void loadInto(id, track)}
              keepIds={[decks.A.videoId, decks.B.videoId]}
              onRemove={removeQueued}
              onClear={() => setLibrary((prev) => clearQueue(prev, [decks.A.videoId, decks.B.videoId]))}
            />
          </div>
          <Transition
            x={x}
            gainA={shownA}
            gainB={shownB}
            volumeA={decks.A.volume}
            volumeB={decks.B.volume}
            seconds={seconds}
            onSeconds={setSeconds}
            onVolumeA={(volume) => setDecks((prev) => ({ ...prev, A: { ...prev.A, volume } }))}
            onVolumeB={(volume) => setDecks((prev) => ({ ...prev, B: { ...prev.B, volume } }))}
            onX={setPosition}
            onGlide={glide}
          />
        </main>
        {desktop && webcamOn ? (
          <FreeSlot active box={layout.webcam} onBox={placeWebcam}>
            <WebcamTile onStatus={setStatus} />
          </FreeSlot>
        ) : null}
        {desktop ? <SplitBars layout={layout} onLayout={commitLayout} /> : null}
      </div>
      ) : null}
      <Header
        onStatus={setStatus}
        owner={owner}
        email={email}
        access={accessState}
        configured={configured}
        requesting={requesting}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
        onRequestUnlimited={() => void requestUnlimited()}
        tab={tab}
        pending={pending}
        mode={mode}
        onMode={chooseMode}
        isPlaying={anyPlaying}
        desktop={desktop}
        webcamOn={webcamOn}
        onWebcam={toggleWebcam}
        onResetLayout={desktop ? resetLayout : undefined}
        onAdmin={() => setAdminOpen(true)}
        onOpenKey={() => {
          setLimitNote('');
          setKeyOpen(true);
        }}
        onTab={(next) => {
          if (next === 'queue' || next === 'search') setLeftPane(next);
          setTab((current) => (current === next ? null : next));
        }}
      />
      {playlistAsk ? (
        <PlaylistAsk
          hasVideo={Boolean(playlistAsk.videoId)}
          onClose={() => setPlaylistAsk(null)}
          onAll={() => {
            const id = playlistAsk.playlistId;
            setPlaylistAsk(null);
            if (id) void addWholePlaylist(id);
          }}
          onOne={() => {
            const id = playlistAsk.videoId;
            setPlaylistAsk(null);
            if (id) addVideoToQueue(id);
          }}
        />
      ) : null}
      {adminOpen ? (
        <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Admin">
          <button type="button" className="admin-backdrop" aria-label="Cerrar" onClick={() => setAdminOpen(false)} />
          <AdminPanel onClose={() => setAdminOpen(false)} />
        </div>
      ) : null}
      <InstallBanner />
      {keyOpen ? <KeyModal hasKey={Boolean(ownKey)} onSave={saveOwnKey} onClear={removeOwnKey} onClose={() => setKeyOpen(false)} /> : null}
      {limitNote ? (
        <div className="limit-note" role="status" data-testid="limit-note">
          <p>{limitNote}</p>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setLimitNote('');
              setKeyOpen(true);
            }}
          >
            Usá tu propia clave
          </button>
          <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={() => setLimitNote('')}>
            <Icon name="x" />
          </button>
        </div>
      ) : null}
      {toast?.undo ? (
        <button type="button" className="toast toast-undo" data-testid="undo-toast" onClick={toast.undo}>
          deshacer
        </button>
      ) : toast ? (
        <div className="toast" role="status" data-testid="sync-toast">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
