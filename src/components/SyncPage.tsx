import { useEffect, useRef, useState } from 'react';
import { loadAnalyzedBpm, loadAnalysis, loadLibrary, loadSession, saveAnalysis } from '../lib/idb';
import { openSyncChannel, parseSyncMessage } from '../lib/sync-channel';
import { supportsSilentTabCapture, TAB_CAPTURE } from '../lib/sync-capture';
import {
  collectTracks,
  markAnalyzing,
  markError,
  markProgress,
  markReady,
  mergeAnalysis,
  mergeSyncItems,
  nextQueued,
  outcomeFromCapture,
  overallProgress,
  advanceChime,
  createChimeClock,
  retrySyncItem,
  type SyncItem,
  type SyncTrack,
} from '../lib/sync-queue';
import { analyzeVideo, createTickHub } from '../lib/sync-run';
import { loadYouTubeAPI } from '../lib/youtube-api';

function formatBpm(bpm: number): string {
  const rounded = Math.round(bpm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function stateLabel(item: SyncItem): string {
  if (item.status === 'queued') return 'En cola';
  if (item.status === 'analyzing') return `Analizando ${Math.round(item.progress * 100)}%`;
  if (item.status === 'ready') return item.bpm ? `Listo · ${formatBpm(item.bpm)} BPM` : 'Listo · sin BPM';
  return 'Error';
}

function requeueAnalyzing(items: SyncItem[]): SyncItem[] {
  return items.map((item) => (item.status === 'analyzing' ? { ...item, status: 'queued', progress: 0, error: null } : item));
}

export function SyncPage({ onSignOut, embedded = false }: { onSignOut?: () => void; embedded?: boolean }) {
  const [items, setItems] = useState<SyncItem[]>([]);
  const [armed, setArmed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [note, setNote] = useState('Empezar comparte esta pestaña, con audio, una sola vez.');
  const [playerReady, setPlayerReady] = useState(false);

  const itemsRef = useRef(items);
  const readyRef = useRef(new Map<string, number | null>());
  const chimeRef = useRef(createChimeClock());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const playerReadyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const ticksRef = useRef(createTickHub());
  const graphRef = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReason = useRef<string>('stop');
  const pausedRef = useRef(false);
  const armedRef = useRef(false);
  const aliveRef = useRef(true);
  const pumpingRef = useRef(false);
  const resumeRef = useRef<(() => void) | null>(null);
  const playerErrorRef = useRef<string | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const created = useRef(false);

  itemsRef.current = items;

  function commit(next: SyncItem[]) {
    itemsRef.current = next;
    setItems(next);
    const result = advanceChime(chimeRef.current, next);
    chimeRef.current = result.clock;
    if (result.chime) channelRef.current?.postMessage({ type: 'chime' });
  }

  function ingest(tracks: SyncTrack[]) {
    commit(mergeSyncItems(itemsRef.current, tracks, readyRef.current));
    if (armedRef.current && !pausedRef.current) void pump();
  }

  async function reloadFromDb() {
    const [library, session, analyzed] = await Promise.all([loadLibrary(), loadSession(), loadAnalyzedBpm()]);
    if (!aliveRef.current) return;
    readyRef.current = analyzed;
    const decks: Array<SyncTrack | null> = [null, null];
    if (session) {
      (['A', 'B'] as const).forEach((id, index) => {
        const deck = session.decks[id];
        decks[index] = deck?.videoId ? { videoId: deck.videoId, title: deck.title || deck.videoId, thumbnail: deck.thumbnail } : null;
      });
    }
    ingest(collectTracks(library, decks));
  }

  async function pump() {
    if (pumpingRef.current || !armedRef.current || !aliveRef.current) return;
    const player = playerRef.current;
    const stream = streamRef.current;
    if (!player || !stream || !playerReadyRef.current) return;
    pumpingRef.current = true;
    try {
      while (aliveRef.current && armedRef.current) {
        if (pausedRef.current) {
          await new Promise<void>((resolve) => {
            resumeRef.current = resolve;
          });
          continue;
        }
        const item = nextQueued(itemsRef.current);
        if (!item) break;
        commit(markAnalyzing(itemsRef.current, item.videoId));
        const controller = new AbortController();
        abortRef.current = controller;
        abortReason.current = 'stop';
        playerErrorRef.current = null;
        try {
          const result = await analyzeVideo(item.videoId, {
            player,
            stream,
            ticks: ticksRef.current,
            signal: controller.signal,
            isPaused: () => pausedRef.current,
            getError: () => playerErrorRef.current,
            onProgress: (progress) => {
              if (!aliveRef.current) return;
              commit(markProgress(itemsRef.current, item.videoId, progress));
            },
          });
          if (!aliveRef.current) break;
          const decision = outcomeFromCapture(result);
          if (!decision.ok) {
            commit(markError(itemsRef.current, item.videoId, decision.error));
            continue;
          }
          const previous = await loadAnalysis(item.videoId);
          const meta = mergeAnalysis(previous, {
            videoId: item.videoId,
            peaks: decision.peaks,
            duration: decision.duration,
            bpm: decision.bpm,
          });
          await saveAnalysis(meta);
          readyRef.current.set(item.videoId, meta.bpm);
          channelRef.current?.postMessage({ type: 'analysis', meta });
          commit(markReady(itemsRef.current, item.videoId, meta.bpm));
        } catch (error) {
          if (!aliveRef.current) break;
          const aborted = error instanceof DOMException && error.name === 'AbortError';
          if (aborted && abortReason.current === 'share') {
            commit(requeueAnalyzing(itemsRef.current));
            break;
          }
          if (aborted) break;
          const message = error instanceof Error && error.message ? error.message : 'No pude analizar este tema.';
          commit(markError(itemsRef.current, item.videoId, message));
        }
      }
    } finally {
      pumpingRef.current = false;
    }
  }

  useEffect(() => {
    aliveRef.current = true;
    const channel = openSyncChannel();
    channelRef.current = channel;
    let hydrated = false;
    let pending: SyncTrack[] | null = null;
    if (channel) {
      channel.onmessage = (event) => {
        const message = parseSyncMessage(event.data);
        if (message?.type !== 'tracks') return;
        if (!hydrated) {
          pending = message.tracks;
          return;
        }
        ingest(message.tracks);
      };
    }
    void (async () => {
      await reloadFromDb();
      if (!aliveRef.current) return;
      hydrated = true;
      if (pending) ingest(pending);
      pending = null;
      channel?.postMessage({ type: 'request-tracks' });
    })();
    const onFocus = () => {
      if (hydrated) void reloadFromDb();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      abortReason.current = 'stop';
      abortRef.current?.abort();
      resumeRef.current?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      graphRef.current?.stop();
      channel?.close();
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
    };
    // The channel and the library load belong to the lifetime of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || created.current) return;
    created.current = true;
    let dead = false;
    const host = document.createElement('div');
    mount.appendChild(host);
    loadYouTubeAPI()
      .then(() => {
        if (dead) return;
        const player = new YT.Player(host, {
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (dead) return;
              playerRef.current = event.target;
              playerReadyRef.current = true;
              setPlayerReady(true);
              const iframe = mount.querySelector('iframe');
              if (iframe) iframe.setAttribute('allow', 'autoplay; encrypted-media');
              if (armedRef.current) void pump();
            },
            onError: () => {
              playerErrorRef.current = 'YouTube no deja reproducir este video.';
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!dead) setNote('No se pudo cargar el reproductor de YouTube.');
      });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const progress = overallProgress(items);
    document.title = progress.total ? `Sincronizador · ${progress.ready}/${progress.total}` : 'Sincronizador';
    return () => {
      document.title = 'DJTube';
    };
  }, [items]);

  async function empezar() {
    if (armedRef.current) return;
    if (!supportsSilentTabCapture(navigator.userAgent)) {
      setNote('Hace falta Chrome o Edge. Firefox y Safari no silencian el audio de la captura, y el análisis sonaría por los altavoces.');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setNote('Este navegador no puede capturar la pestaña.');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(TAB_CAPTURE);
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const audio = stream.getAudioTracks();
      if (!audio.length) {
        stream.getTracks().forEach((track) => track.stop());
        setNote('La captura no trajo audio. En el diálogo, comparte el audio de esta pestaña.');
        return;
      }
      const ctx = new AudioContext();
      await ctx.resume();
      await ctx.audioWorklet.addModule('/peak-worklet.js');
      const source = ctx.createMediaStreamSource(new MediaStream(audio));
      const node = new AudioWorkletNode(ctx, 'djtube-peak');
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(node);
      node.connect(gain);
      gain.connect(ctx.destination);
      node.port.onmessage = (event: MessageEvent<{ peak?: number; samples?: number }>) => {
        const peak = typeof event.data?.peak === 'number' ? event.data.peak : 0;
        ticksRef.current.emit({ peak, samples: typeof event.data?.samples === 'number' ? event.data.samples : 0 });
      };
      graphRef.current?.stop();
      graphRef.current = {
        ctx,
        stop: () => {
          try {
            source.disconnect();
            node.disconnect();
            void ctx.close();
          } catch {
            /* closing */
          }
        },
      };
      stream.getTracks().forEach((track) => {
        track.addEventListener('ended', () => {
          if (!armedRef.current) return;
          armedRef.current = false;
          setArmed(false);
          abortReason.current = 'share';
          abortRef.current?.abort();
          resumeRef.current?.();
          resumeRef.current = null;
          setNote('Se dejó de compartir. Pulsa Empezar para seguir.');
        });
      });
      streamRef.current = stream;
      armedRef.current = true;
      setArmed(true);
      setNote('Analizando en esta pestaña. El audio no sale por los altavoces. Puedes volver al mixer.');
      void pump();
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      graphRef.current?.stop();
      graphRef.current = null;
      if (!aliveRef.current) return;
      const cancelled = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');
      setNote(cancelled || !(error instanceof Error) || !error.message ? 'No se compartió la pestaña.' : error.message);
    }
  }

  function pause() {
    pausedRef.current = true;
    setPaused(true);
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
  }

  function resume() {
    pausedRef.current = false;
    setPaused(false);
    try {
      playerRef.current?.playVideo();
    } catch {
      /* ignore */
    }
    const resume = resumeRef.current;
    resumeRef.current = null;
    resume?.();
    void pump();
  }

  function retry(videoId: string) {
    commit(retrySyncItem(itemsRef.current, videoId));
    if (armedRef.current) void pump();
  }

  const progress = overallProgress(items);
  const chromium = supportsSilentTabCapture(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  return (
    <main className={embedded ? 'sync-page embedded' : 'sync-page'} data-testid="sync-page">
      {embedded ? null : (
        <header className="top">
          <div>
            <h1>Sincronizador</h1>
          </div>
          <div className="top-actions">
            <a className="text-link" href="/">
              Mixer
            </a>
            {onSignOut ? (
              <button type="button" onClick={onSignOut}>
                Salir
              </button>
            ) : null}
          </div>
        </header>
      )}
      <p className="hint">Chrome o Edge. Audio de esta pestaña, sin altavoces.</p>
      <p className="status" role="status">
        {note}
      </p>
      <div className="row sync-controls">
        <button type="button" className="primary" onClick={() => void empezar()} disabled={armed || !chromium}>
          Empezar
        </button>
        {armed ? (
          <button type="button" onClick={paused ? resume : pause}>
            {paused ? 'Seguir' : 'Pausar'}
          </button>
        ) : null}
        <span className="sync-count">{progress.total ? `${progress.ready} de ${progress.total}` : 'Nada en la cola'}</span>
      </div>
      <div
        className="bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.ratio * 100)}
        aria-label="Progreso de la cola"
      >
        <span style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
      </div>
      {playerReady ? null : <p className="hint">Cargando…</p>}
      <ol className="sync-list">
        {items.length === 0 ? <li className="hint">Cola vacía</li> : null}
        {items.map((item) => (
          <li key={item.videoId} className="sync-row" data-state={item.status}>
            <p title={item.title}>{item.title}</p>
            <span className="sync-state">{stateLabel(item)}</span>
            {item.status === 'analyzing' ? (
              <span className="bar thin" aria-hidden="true">
                <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </span>
            ) : null}
            {item.status === 'error' ? (
              <span className="sync-error">
                {item.error}
                <button type="button" onClick={() => retry(item.videoId)}>
                  Reintentar
                </button>
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="sync-player" ref={mountRef} aria-hidden="true" />
    </main>
  );
}
