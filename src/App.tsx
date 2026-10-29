import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DeckId, DeckModel, Track } from './types';
import { emptyDeck } from './types';
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
import { SearchBox } from './components/SearchBox';
import { Transition } from './components/Transition';
import { usePanelSwipe } from './lib/use-panel-swipe';
import { mergeImported } from './lib/queue-export';
import { Intro, introSeen, markIntroSeen } from './components/Intro';
import { adminAlert, parseAdminSeen, type AdminSeen } from './lib/access';
import { deckSnapshot, loadLibrary, loadSession, saveLibrary, saveSession } from './lib/idb';
import { removeQueuedTrack, restoreTrack } from './lib/library';
import { clamp01, effectiveGain, transitionGain } from './lib/mixer';
import { fetchPlaylistPage, playlistItemToTrack, takeNewPlaylistItems, walkPlaylistPages, type PlaylistItem } from './lib/playlist';
import { enrichTracks, parseYouTubeUrl, trackFromId, uniqueIds, type ParsedYouTube } from './lib/youtube';
import { readPlaylistIds } from './lib/youtube-api';
import { accountKey } from './lib/account-client';
import { PlaylistsModal } from './components/PlaylistsModal';
import { clearOwnKey, dropAccountKeyCache, markAccountKey, normalizeApiKey, readOwnKey, writeOwnKey } from './lib/yt-key';

function deskBounds(): Bounds {
  if (typeof window === 'undefined') return { width: 1440, height: 900 };
  return { width: window.innerWidth, height: Math.max(1, window.innerHeight - 44) };
}

const ADMIN_SEEN_KEY = 'djtube-admin-seen';

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
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistAsk, setPlaylistAsk] = useState<ParsedYouTube | null>(null);
  const [booted, setBooted] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string; undo?: () => void } | null>(null);
  const [tab, setTab] = useState<SideTab | null>(null);
  const [leftPane, setLeftPane] = useState<SideTab>('queue');
  const [adminOpen, setAdminOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [adminNew, setAdminNew] = useState(false);
  const adminMark = useRef<AdminSeen | null>(null);
  const adminOpenRef = useRef(false);
  const [intro, setIntro] = useState(() => !introSeen(window.localStorage));
  const [accessState, setAccessState] = useState<string | null>(access);
  const [requesting, setRequesting] = useState(false);
  const [ownKey, setOwnKey] = useState<string | null>(() => readOwnKey(window.localStorage));
  const [keyOpen, setKeyOpen] = useState(false);
  const [playlistsOpen, setPlaylistsOpen] = useState(false);
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
  const shellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLElement>(null);
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

  function closeIntro() {
    markIntroSeen(window.localStorage);
    setIntro(false);
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
    const key = normalizeApiKey(raw);
    if (email && key) {
      void accountKey.put(key).then((result) => {
        if (result.ok) {
          markAccountKey(window.localStorage, true);
          setStatus('Clave guardada en tu cuenta');
        } else {
          setStatus('No se pudo guardar en tu cuenta. Quedó en este dispositivo');
        }
      });
    }
    return true;
  }

  function removeOwnKey() {
    clearOwnKey(window.localStorage);
    markAccountKey(window.localStorage, false);
    setOwnKey(null);
    if (email) {
      void accountKey.remove().then((result) => {
        setStatus(result.ok ? 'Clave borrada de tu cuenta y de este dispositivo' : 'No se pudo borrar de tu cuenta');
      });
    }
  }

  // Signed in: the key kept in the account comes along to this device.
  useEffect(() => {
    if (!email) return;
    let cancel = false;
    void accountKey.get().then((result) => {
      if (cancel || !result.ok || !result.key) return;
      if (writeOwnKey(window.localStorage, result.key)) {
        markAccountKey(window.localStorage, true);
        setOwnKey(readOwnKey(window.localStorage));
      }
    });
    return () => {
      cancel = true;
    };
  }, [email]);

  function signOut() {
    if (dropAccountKeyCache(window.localStorage)) setOwnKey(null);
    onSignOut?.();
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
    Promise.all([loadSession(), loadLibrary()]).then(([session, storedLibrary]) => {
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

  adminOpenRef.current = adminOpen;

  function markAdminSeen() {
    if (!adminMark.current) return;
    try {
      window.localStorage.setItem(ADMIN_SEEN_KEY, JSON.stringify(adminMark.current));
    } catch {
      /* private mode: the glow comes back on reload */
    }
  }

  useEffect(() => {
    if (!owner) return;
    let cancel = false;
    const tick = () => {
      fetch('/api/admin/people', { cache: 'no-store' })
        .then(async (response) => {
          const data = (await response.json().catch(() => null)) as { pendingCount?: unknown; people?: unknown };
          if (cancel || !response.ok || typeof data?.pendingCount !== 'number') return;
          setPending(data.pendingCount);
          const rows = Array.isArray(data.people) ? data.people : [];
          const people = rows.flatMap((row) => {
            const item = row as { email?: unknown; firstSeen?: unknown; owner?: unknown };
            return typeof item?.email === 'string' && typeof item.firstSeen === 'string'
              ? [{ email: item.email, firstSeen: item.firstSeen, owner: item.owner === true }]
              : [];
          });
          let seen: AdminSeen | null = null;
          try {
            seen = parseAdminSeen(window.localStorage.getItem(ADMIN_SEEN_KEY));
          } catch {
            /* private mode: no marker */
          }
          const result = adminAlert(people, data.pendingCount, seen);
          adminMark.current = result.mark;
          const watching = adminOpenRef.current;
          if (!seen || watching) markAdminSeen();
          setAdminNew(result.alert && !watching);
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
      // Inside a popup the keys belong to the popup. Space on a focused button or link activates that control.
      if (target?.closest?.('[role="dialog"]')) return;
      if (event.code === 'Space' && target?.closest?.('button, a, summary, [role="radio"], [role="menuitem"]')) return;
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

  async function addWholePlaylist(playlistId: string, deck?: DeckId) {
    const gen = ++playlistGen.current;
    setPlaylistLoading(true);
    setStatus('Agregando…');
    showQueue();
    const queued = new Set(libraryRef.current.map((item) => item.videoId));
    let added = 0;
    let deckLoaded = false;
    // A or B always puts the playlist's first track on that deck, even when it is already in the queue.
    const loadFirst = (item: PlaylistItem | undefined) => {
      if (!deck || deckLoaded || !item) return;
      deckLoaded = true;
      void loadInto(deck, playlistItemToTrack(item));
    };
    const take = (items: PlaylistItem[]) => {
      if (gen !== playlistGen.current || !items.length) return;
      added += items.length;
      appendTracks(items);
    };
    try {
      added = await walkPlaylistPages(
        async (token) => {
          const page = await fetchPlaylistPage(playlistId, token, undefined, ownKey);
          if (token === null && gen === playlistGen.current) loadFirst(takeNewPlaylistItems(page.items ?? [], new Set<string>())[0]);
          return page;
        },
        queued,
        take,
      );
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
          loadFirst(fresh[0]);
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
    setStatus(added ? `${added} temas agregados` : 'Ya estaban en la cola');
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

  function importQueue(items: Array<{ videoId: string; title: string }>) {
    const result = mergeImported(libraryRef.current, items);
    setLibrary(result.tracks);
    setStatus(result.added ? `${result.added} temas agregados` : 'Ya estaban en la cola');
    const bare = items.filter((item) => item.title === item.videoId && result.tracks.some((track) => track.videoId === item.videoId));
    if (bare.length) void enrichTracks(bare.map((item) => item.videoId), rename);
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

  const curve = transitionGain(x);
  const shownA = effectiveGain(curve.a, decks.A.volume);
  const shownB = effectiveGain(curve.b, decks.B.volume);

  const leftOpen = tab === 'queue' || tab === 'search';

  usePanelSwipe({
    enabled: !desktop,
    shell: shellRef,
    panel: panelRef,
    stage: stageRef,
    open: tab,
    onBegin: (side) => setLeftPane(side),
    onSettle: (side, isOpen) => {
      setLeftPane(side);
      setTab(isOpen ? side : null);
    },
  });

  return (
    <div className="shell" data-testid="app" ref={shellRef}>
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
        <aside ref={panelRef} className={leftOpen ? 'side side-left is-open' : 'side side-left'} aria-label="Cola y búsqueda">
          <div className={leftPane === 'queue' ? 'pane pane-queue is-open' : 'pane pane-queue'}>
            <Library
              tracks={library}
              loading={playlistLoading}
              onLoad={(track, id) => void loadInto(id, track)}
              keepIds={[decks.A.videoId, decks.B.videoId]}
              onRemove={removeQueued}
              onImport={importQueue}
              onClear={() => {
                setLibrary([]);
                setStatus('Cola vacía');
              }}
              onStatus={setStatus}
              signedIn={Boolean(email)}
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
              onAddPlaylist={(id, deck) => void addWholePlaylist(id, deck)}
            />
          </div>
        </aside>
        <main ref={stageRef} className="stage">
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
                onStatus={setStatus}
              />
            ))}
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
      <Header
        onStatus={setStatus}
        owner={owner}
        email={email}
        access={accessState}
        configured={configured}
        requesting={requesting}
        onSignIn={onSignIn}
        onSignOut={signOut}
        onOpenPlaylists={() => setPlaylistsOpen(true)}
        onRequestUnlimited={() => void requestUnlimited()}
        tab={desktop ? leftPane : tab}
        pending={pending}
        desktop={desktop}
        webcamOn={webcamOn}
        onWebcam={toggleWebcam}
        onResetLayout={desktop ? resetLayout : undefined}
        adminNew={adminNew}
        onAdmin={() => {
          markAdminSeen();
          setAdminNew(false);
          setAdminOpen(true);
        }}
        onOpenKey={() => {
          setLimitNote('');
          setKeyOpen(true);
        }}
        onTab={(next) => {
          setLeftPane(next);
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
      {intro ? (
        <Intro
          onKey={() => {
            closeIntro();
            setLimitNote('');
            setKeyOpen(true);
          }}
          onClose={closeIntro}
        />
      ) : null}
      {playlistsOpen ? <PlaylistsModal onAdd={importQueue} onStatus={setStatus} onClose={() => setPlaylistsOpen(false)} /> : null}
      {keyOpen ? <KeyModal signedIn={Boolean(email)} hasKey={Boolean(ownKey)} savedKey={ownKey} onSave={saveOwnKey} onClear={removeOwnKey} onClose={() => setKeyOpen(false)} /> : null}
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
