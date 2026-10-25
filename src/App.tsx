import { useEffect, useRef, useState } from 'react';
import type { AnalysisMeta, AudioCoverage, DeckId, DeckModel, Highlight, Track } from './types';
import { DEFAULT_RATES, emptyDeck } from './types';
import { Deck, type DeckHandle } from './components/Deck';
import { Header } from './components/Header';
import { Highlights } from './components/Highlights';
import { Library } from './components/Library';
import { SearchBox } from './components/SearchBox';
import { SyncNote } from './components/SyncNote';
import { Transition } from './components/Transition';
import { sliceBlobToWebm } from './lib/clip';
import { playChime } from './lib/chime';
import { downloadBlob } from './lib/download';
import { addHighlight, regionHasAudio } from './lib/highlights';
import { deckSnapshot, loadAnalysis, loadAudio, loadCoverages, loadHighlights, loadLibrary, loadSession, saveHighlights, saveLibrary, saveSession } from './lib/idb';
import { clamp01, effectiveGain, transitionGain } from './lib/mixer';
import { slicePeaks } from './lib/peaks';
import { openSyncChannel, parseSyncMessage } from './lib/sync-channel';
import { collectTracks } from './lib/sync-queue';
import { enrichTracks, parseYouTubeUrl, trackFromId, uniqueIds } from './lib/youtube';
import { readPlaylistIds } from './lib/youtube-api';

export function App({ owner = false, onSignOut }: { owner?: boolean; onSignOut?: () => void } = {}) {
  const [x, setX] = useState(0.5);
  const [seconds, setSeconds] = useState(8);
  const [decks, setDecks] = useState<Record<DeckId, DeckModel>>({ A: emptyDeck(), B: emptyDeck() });
  const [library, setLibrary] = useState<Track[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [coverage, setCoverage] = useState<Record<string, AudioCoverage>>({});
  const [rates, setRates] = useState<Record<DeckId, number[]>>({ A: DEFAULT_RATES, B: DEFAULT_RATES });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Pega un enlace o busca. El fader manda.');
  const [booted, setBooted] = useState(false);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const xRef = useRef(0.5);
  const glideRef = useRef<number | null>(null);
  const decksRef = useRef(decks);
  const libraryRef = useRef(library);
  const deckA = useRef<DeckHandle>(null);
  const deckB = useRef<DeckHandle>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
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
    Promise.all([loadSession(), loadLibrary(), loadHighlights(), loadCoverages()]).then(([session, storedLibrary, storedHighlights, storedCoverage]) => {
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
      setCoverage(storedCoverage);
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
    const videoId = decks.A.videoId;
    if (!booted || !videoId) return;
    let cancel = false;
    void loadAnalysis(videoId).then((meta) => {
      if (cancel || !meta) return;
      setDecks((prev) => {
        if (prev.A.videoId !== videoId) return prev;
        return { ...prev, A: { ...prev.A, peaks: prev.A.peaks?.length ? prev.A.peaks : meta.peaks, bpm: prev.A.bpm ?? meta.bpm } };
      });
      setCoverage((prev) => ({ ...prev, [videoId]: { recordStart: meta.recordStart, recordEnd: meta.recordEnd, hasAudio: meta.hasAudio } }));
    });
    return () => {
      cancel = true;
    };
  }, [booted, decks.A.videoId]);

  useEffect(() => {
    const videoId = decks.B.videoId;
    if (!booted || !videoId) return;
    let cancel = false;
    void loadAnalysis(videoId).then((meta) => {
      if (cancel || !meta) return;
      setDecks((prev) => {
        if (prev.B.videoId !== videoId) return prev;
        return { ...prev, B: { ...prev.B, peaks: prev.B.peaks?.length ? prev.B.peaks : meta.peaks, bpm: prev.B.bpm ?? meta.bpm } };
      });
      setCoverage((prev) => ({ ...prev, [videoId]: { recordStart: meta.recordStart, recordEnd: meta.recordEnd, hasAudio: meta.hasAudio } }));
    });
    return () => {
      cancel = true;
    };
  }, [booted, decks.B.videoId]);

  useEffect(() => {
    const unlock = () => {
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;
      void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function tracksNow() {
    const current = decksRef.current;
    return collectTracks(libraryRef.current, [
      current.A.videoId ? { videoId: current.A.videoId, title: current.A.title, thumbnail: current.A.thumbnail } : null,
      current.B.videoId ? { videoId: current.B.videoId, title: current.B.title, thumbnail: current.B.thumbnail } : null,
    ]);
  }

  function paintAnalysis(meta: AnalysisMeta, mode: 'fresh' | 'fill') {
    setCoverage((prev) => ({
      ...prev,
      [meta.videoId]: { recordStart: meta.recordStart, recordEnd: meta.recordEnd, hasAudio: meta.hasAudio },
    }));
    setDecks((prev) => {
      let next = prev;
      for (const id of ['A', 'B'] as const) {
        if (next[id].videoId !== meta.videoId) continue;
        const peaks = mode === 'fresh' ? (meta.peaks.length ? meta.peaks : next[id].peaks) : next[id].peaks?.length ? next[id].peaks : meta.peaks;
        const bpm = mode === 'fresh' ? (meta.bpm ?? next[id].bpm) : (next[id].bpm ?? meta.bpm);
        next = { ...next, [id]: { ...next[id], peaks, bpm } };
      }
      return next;
    });
  }

  useEffect(() => {
    const channel = openSyncChannel();
    channelRef.current = channel;
    if (!channel) return;
    channel.onmessage = (event) => {
      const message = parseSyncMessage(event.data);
      if (!message) return;
      if (message.type === 'request-tracks') {
        channel.postMessage({ type: 'tracks', tracks: tracksNow() });
        return;
      }
      if (message.type === 'analysis') {
        paintAnalysis(message.meta, 'fresh');
        return;
      }
      if (message.type === 'chime') {
        setToast({ id: Date.now(), text: 'Cola sincronizada.' });
        const ctx = audioRef.current ?? new AudioContext();
        audioRef.current = ctx;
        void ctx.resume().then(() => playChime(ctx)).catch(() => undefined);
      }
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
    // tracksNow and paintAnalysis read refs and setState, both stable for this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!booted) return;
    channelRef.current?.postMessage({ type: 'tracks', tracks: tracksNow() });
  }, [booted, library, decks.A.videoId, decks.A.title, decks.A.thumbnail, decks.B.videoId, decks.B.title, decks.B.thumbnail]);

  useEffect(() => {
    const fill = () => {
      for (const id of ['A', 'B'] as const) {
        const videoId = decksRef.current[id].videoId;
        if (!videoId) continue;
        void loadAnalysis(videoId).then((meta) => {
          if (meta) paintAnalysis(meta, 'fill');
        });
      }
    };
    window.addEventListener('focus', fill);
    return () => window.removeEventListener('focus', fill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setDecks((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        videoId: track.videoId,
        title: track.title !== track.videoId ? track.title : prev[id].title || track.title,
        thumbnail: track.thumbnail,
        peaks: prev[id].videoId === track.videoId ? prev[id].peaks : null,
        bpm: prev[id].videoId === track.videoId ? prev[id].bpm : null,
        cueTime: prev[id].videoId === track.videoId ? prev[id].cueTime : 0,
      },
    }));
    const handle = handleFor(id);
    handle?.cueVideo(track.videoId);
    if (at) {
      const ready = await handle?.seekWhenReady(at.seconds, track.videoId);
      if (at.play) handle?.play();
      else handle?.pause();
      if (at.play) await handle?.seekWhenReady(at.seconds, track.videoId);
      if (!ready) setStatus('El tema está en el deck, pero el salto al corte tardó demasiado.');
      else setStatus(at.play ? `Highlight en ${id}.` : `Cue del highlight en ${id}.`);
      return;
    }
    setStatus(`Cargado en el deck ${id}.`);
  }

  async function ingest(raw: string, target: 'queue' | DeckId) {
    const parsed = parseYouTubeUrl(raw);
    if (!parsed) {
      setStatus('Ese enlace no parece de YouTube.');
      return;
    }
    if (parsed.playlistId) {
      setBusy(true);
      setStatus('Leyendo la playlist…');
      try {
        const ids = uniqueIds(await readPlaylistIds(parsed.playlistId)).slice(0, 50);
        const tracks = ids.map((id) => trackFromId(id));
        setLibrary((prev) => {
          const known = new Set(prev.map((item) => item.videoId));
          return [...tracks.filter((item) => !known.has(item.videoId)), ...prev];
        });
        void enrichTracks(ids, rename);
        const first = parsed.videoId ? trackFromId(parsed.videoId) : tracks[0];
        if (target !== 'queue' && first) await loadInto(target, first);
        setStatus(ids.length ? `Playlist: ${Math.min(ids.length, 50)} temas en la cola.` : 'Esa playlist no devolvió temas.');
      } catch {
        setStatus('No pude leer esa playlist. Prueba con el enlace de un video.');
        if (parsed.videoId && target !== 'queue') await loadInto(target, trackFromId(parsed.videoId));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!parsed.videoId) return;
    const track = trackFromId(parsed.videoId);
    if (target === 'queue') {
      remember(track);
      setStatus('Tema en la cola.');
    } else {
      await loadInto(target, track);
    }
    void enrichTracks([parsed.videoId], rename);
  }

  function saveHighlight(id: DeckId, start: number, end: number, label: string) {
    const deck = decksRef.current[id];
    if (!deck.videoId) return;
    const duration = handleFor(id)?.getDuration() ?? 0;
    const highlight: Highlight = {
      id: crypto.randomUUID(),
      videoId: deck.videoId,
      title: deck.title || deck.videoId,
      start,
      end,
      label,
      peaks: slicePeaks(deck.peaks ?? [], duration || end, start, end),
    };
    setHighlights((prev) => addHighlight(prev, highlight));
    setStatus(`Corte «${label}» guardado.`);
  }

  async function downloadHighlight(highlight: Highlight) {
    const cover = coverage[highlight.videoId];
    if (!regionHasAudio(cover, highlight.start, highlight.end)) return;
    const blob = await loadAudio(highlight.videoId);
    if (!blob) {
      setStatus('El audio de ese tema no está en este navegador.');
      return;
    }
    try {
      const clip = await sliceBlobToWebm(blob, cover.recordStart, highlight.start, highlight.end);
      downloadBlob(clip, `${highlight.label.replace(/[^\w\-]+/g, '_')}.webm`);
    } catch {
      setStatus('No pude cortar el audio.');
    }
  }

  const curve = transitionGain(x);
  const shownA = effectiveGain(curve.a, decks.A.volume);
  const shownB = effectiveGain(curve.b, decks.B.volume);

  return (
    <div className="app" data-testid="app">
      <Header onStatus={setStatus} owner={owner} onSignOut={onSignOut} />
      <p className="status" data-testid="status" role="status">
        {status}
      </p>
      <div className="decks">
        {(['A', 'B'] as const).map((id) => (
          <Deck
            key={id}
            ref={id === 'A' ? deckA : deckB}
            id={id}
            videoId={decks[id].videoId}
            title={decks[id].title}
            volume={decks[id].volume}
            gain={id === 'A' ? shownA : shownB}
            playbackRate={decks[id].playbackRate}
            bpm={decks[id].bpm}
            peaks={decks[id].peaks}
            cueTime={decks[id].cueTime}
            onVolume={(volume) => setDecks((prev) => ({ ...prev, [id]: { ...prev[id], volume } }))}
            onRate={(playbackRate) => setDecks((prev) => ({ ...prev, [id]: { ...prev[id], playbackRate } }))}
            onBpm={(bpm) => setDecks((prev) => ({ ...prev, [id]: { ...prev[id], bpm } }))}
            onCueTime={(cueTime) => setDecks((prev) => ({ ...prev, [id]: { ...prev[id], cueTime } }))}
            onTitle={rename}
            onRates={(next) => setRates((prev) => ({ ...prev, [id]: next }))}
            onDropTrack={(track) => void loadInto(id, track)}
            onSaveHighlight={(start, end, label) => saveHighlight(id, start, end, label)}
            onStatus={setStatus}
          />
        ))}
      </div>
      <Transition x={x} gainA={shownA} gainB={shownB} seconds={seconds} onSeconds={setSeconds} onX={setPosition} onGlide={glide} />
      <SyncNote
        bpmA={decks.A.bpm}
        bpmB={decks.B.bpm}
        ratesA={rates.A}
        ratesB={rates.B}
        onApply={(id, rate) => {
          setDecks((prev) => ({ ...prev, [id]: { ...prev[id], playbackRate: rate } }));
          handleFor(id)?.setRate(rate);
          setStatus(`Velocidad del deck ${id}: ×${rate}.`);
        }}
      />
      <div className="panels">
        <Library tracks={library} busy={busy} onSubmit={(url, target) => void ingest(url, target)} onLoad={(track, id) => void loadInto(id, track)} />
        <SearchBox onLoad={(track, id) => void loadInto(id, track)} onQueue={remember} />
        <Highlights
          highlights={highlights}
          coverage={coverage}
          onChange={setHighlights}
          onPlay={(highlight, id, play) => void loadInto(id, trackFromId(highlight.videoId, highlight.title), { seconds: highlight.start, play })}
          onDownload={downloadHighlight}
          onStatus={setStatus}
        />
      </div>
      <footer className="keys">espacio ambos · Q / W cada deck · ← → fader · shift salta más</footer>
      {toast ? (
        <div className="toast" role="status" data-testid="sync-toast">
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}
