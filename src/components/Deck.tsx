import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DeckId, Track } from '../types';
import { DEFAULT_RATES } from '../types';
import { bpmFromTaps } from '../lib/bpm';
import { CUE_SLOTS, clearCue, emptyCues, setCue, type HotCues } from '../lib/cues';
import { formatTime } from '../lib/format';
import { loadCues, saveCues } from '../lib/idb';
import { clamp01, nudgedRate } from '../lib/mixer';
import { prerollFromState, type PrerollPhase } from '../lib/preload';
import { loadYouTubeAPI } from '../lib/youtube-api';
import { BeatGrid } from './BeatGrid';
import { Icon } from './icons';
import { Waveform } from './Waveform';

export type DeckHandle = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  cueTo: (seconds: number) => void;
  markCue: () => void;
  cueVideo: (videoId: string) => void;
  seekWhenReady: (seconds: number, videoId: string) => Promise<boolean>;
  setGain: (gain: number) => void;
  setRate: (rate: number) => void;
  getPlayer: () => YT.Player | null;
  getTime: () => number;
  getDuration: () => number;
};

type Props = {
  id: DeckId;
  videoId: string | null;
  title: string;
  gain: number;
  playbackRate: number;
  bpm: number | null;
  peaks: number[] | null;
  cueTime: number;
  onRate: (rate: number) => void;
  onBpm: (bpm: number | null) => void;
  onCueTime: (seconds: number) => void;
  onTitle: (videoId: string, title: string) => void;
  onRates: (rates: number[]) => void;
  onDropTrack: (track: Track) => void;
  onSaveHighlight: (start: number, end: number, label: string) => void;
  onStatus: (message: string) => void;
  onOpenList?: () => void;
  onAnalyze?: () => void;
  beatOffset?: number | null;
  onStartSynced?: () => void;
  syncReady?: boolean;
};

const playerVars = () => ({
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  rel: 0,
  modestbranding: 1,
  playsinline: 1,
  iv_load_policy: 3,
  origin: window.location.origin,
});

export const Deck = forwardRef<DeckHandle, Props>(function Deck(props, ref) {
  const {
    id,
    videoId,
    title,
    gain,
    playbackRate,
    bpm,
    peaks,
    cueTime,
    onRate,
    onBpm,
    onCueTime,
    onTitle,
    onRates,
    onDropTrack,
    onSaveHighlight,
    onStatus,
    onOpenList,
    onAnalyze,
    beatOffset = null,
    onStartSynced,
    syncReady = false,
  } = props;

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const created = useRef(false);
  const gainRef = useRef(gain);
  const rateRef = useRef(playbackRate);
  const cueRef = useRef(cueTime);
  const nudgeSaved = useRef<number | null>(null);
  const ratesRef = useRef<number[]>(DEFAULT_RATES);
  const taps = useRef<number[]>([]);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rates, setRates] = useState<number[]>(DEFAULT_RATES);
  const [over, setOver] = useState(false);
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);
  const [label, setLabel] = useState('Corte');
  const [clearToken, setClearToken] = useState(0);
  const [apiError, setApiError] = useState(false);
  const [cues, setCues] = useState<HotCues>(emptyCues);
  const prerollRef = useRef<PrerollPhase>('idle');
  const longPressRef = useRef<number>(0);

  gainRef.current = gain;
  rateRef.current = playbackRate;
  cueRef.current = cueTime;
  ratesRef.current = rates;

  const applyGain = (value: number) => {
    const player = playerRef.current;
    if (!player) return;
    const vol = Math.round(clamp01(value) * 100);
    try {
      player.setVolume(vol);
      if (vol === 0) player.mute();
      else player.unMute();
    } catch {
      /* player not ready */
    }
  };

  const startPreroll = (player: YT.Player, nextId: string) => {
    prerollRef.current = 'armed';
    try {
      player.mute();
      player.loadVideoById({ videoId: nextId, startSeconds: 0 });
    } catch {
      try {
        player.cueVideoById(nextId);
      } catch {
        prerollRef.current = 'idle';
      }
    }
  };

  const finishPreroll = (player: YT.Player) => {
    try {
      player.pauseVideo();
      player.seekTo(0, true);
    } catch {
      /* ignore */
    }
    applyGain(gainRef.current);
    setPlaying(false);
  };

  useImperativeHandle(ref, () => ({
    play() {
      try {
        playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    },
    pause() {
      try {
        playerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
    },
    toggle() {
      try {
        const state = playerRef.current?.getPlayerState();
        if (state === 1) playerRef.current?.pauseVideo();
        else playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    },
    cueTo(seconds: number) {
      const player = playerRef.current;
      if (!player) return;
      try {
        player.pauseVideo();
        const length = player.getDuration();
        if (length > 0) player.seekTo(Math.min(seconds, length), true);
      } catch {
        /* ignore */
      }
    },
    markCue() {
      try {
        onCueTime(playerRef.current?.getCurrentTime() ?? 0);
      } catch {
        onCueTime(0);
      }
    },
    cueVideo(nextId: string) {
      const player = playerRef.current;
      if (!player) return;
      try {
        if (player.getVideoData()?.video_id === nextId) return;
        startPreroll(player, nextId);
      } catch {
        /* ignore */
      }
    },
    async seekWhenReady(seconds: number, nextId: string) {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const player = playerRef.current;
        try {
          const data = player?.getVideoData();
          const length = player?.getDuration() ?? 0;
          if (player && data?.video_id === nextId && length > 0.4) {
            player.seekTo(Math.min(seconds, Math.max(0, length - 0.05)), true);
            return true;
          }
        } catch {
          /* not ready */
        }
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
      return false;
    },
    setGain(value: number) {
      applyGain(value);
    },
    setRate(next: number) {
      try {
        playerRef.current?.setPlaybackRate(next);
      } catch {
        /* ignore */
      }
    },
    getPlayer() {
      return playerRef.current;
    },
    getTime() {
      try {
        return playerRef.current?.getCurrentTime() ?? 0;
      } catch {
        return 0;
      }
    },
    getDuration() {
      try {
        return playerRef.current?.getDuration() ?? 0;
      } catch {
        return 0;
      }
    },
  }));

  useEffect(() => {
    if (!videoId) return;
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
          playerVars: playerVars(),
          events: {
            onReady: (event) => {
              if (dead) return;
              playerRef.current = event.target;
              setReady(true);
              const iframe = mount.querySelector('iframe');
              if (iframe) {
                iframe.style.position = 'absolute';
                iframe.style.inset = '0';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
              }
              try {
                const available = event.target.getAvailablePlaybackRates();
                if (available?.length) {
                  setRates(available);
                  onRates(available);
                }
              } catch {
                /* default rates stay */
              }
              applyGain(gainRef.current);
              try {
                event.target.setPlaybackRate(rateRef.current);
              } catch {
                /* ignore */
              }
              if (videoId) {
                try {
                  event.target.cueVideoById(videoId);
                } catch {
                  /* ignore */
                }
              }
            },
            onStateChange: (event) => {
              const preroll = prerollFromState(prerollRef.current, event.data);
              prerollRef.current = preroll.phase;
              if (preroll.finish) {
                finishPreroll(event.target);
                return;
              }
              if (prerollRef.current === 'armed') return;
              setPlaying(event.data === 1);
              try {
                const data = event.target.getVideoData();
                if (data?.video_id && data.title) onTitle(data.video_id, data.title);
              } catch {
                /* ignore */
              }
            },
            onError: () => onStatus('Video bloqueado'),
          },
        });
        playerRef.current = player;
      })
      .catch(() => {
        if (!dead) setApiError(true);
      });
    return () => {
      dead = true;
      created.current = false;
      setReady(false);
      try {
        playerRef.current?.destroy();
      } catch {
        /* ignore */
      }
      playerRef.current = null;
      mount.replaceChildren();
    };
    // The player is created once per mounted video frame. videoId changes are cued below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId ? 'on' : 'off']);

  useEffect(() => {
    if (!videoId || !ready) return;
    try {
      const current = playerRef.current?.getVideoData()?.video_id;
      if (current === videoId) return;
      const player = playerRef.current;
      if (player) startPreroll(player, videoId);
    } catch {
      /* ignore */
    }
  }, [videoId, ready]);

  useEffect(() => {
    if (!videoId) {
      setCues(emptyCues());
      return;
    }
    let cancel = false;
    void loadCues(videoId).then((next) => {
      if (!cancel) setCues(next);
    });
    return () => {
      cancel = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (nudgeSaved.current != null) return;
    applyGain(gain);
  }, [gain, ready]);

  useEffect(() => {
    if (!ready || nudgeSaved.current != null) return;
    try {
      playerRef.current?.setPlaybackRate(playbackRate);
    } catch {
      /* ignore */
    }
  }, [playbackRate, ready]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const nextTime = player.getCurrentTime() || 0;
        const nextDuration = player.getDuration() || 0;
        setTime(nextTime);
        if (nextDuration > 0) {
          setDuration((previous) => (Math.abs(previous - nextDuration) > 0.4 ? nextDuration : previous));
        }
        setPlaying(player.getPlayerState() === 1);
      } catch {
        /* not ready */
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  function nudge(direction: -1 | 1, active: boolean) {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (active) {
        if (nudgeSaved.current == null) nudgeSaved.current = player.getPlaybackRate?.() ?? playbackRate;
        player.setPlaybackRate(nudgedRate(nudgeSaved.current, direction, ratesRef.current));
      } else if (nudgeSaved.current != null) {
        player.setPlaybackRate(nudgeSaved.current);
        nudgeSaved.current = null;
        onRate(player.getPlaybackRate());
      }
    } catch {
      nudgeSaved.current = null;
    }
  }

  function tap() {
    const now = performance.now();
    const last = taps.current[taps.current.length - 1];
    if (last != null && now - last > 2000) taps.current = [];
    taps.current.push(now);
    const next = bpmFromTaps(taps.current);
    if (next) onBpm(next);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setOver(false);
    const raw = event.dataTransfer.getData('application/x-djtube');
    if (!raw) return;
    try {
      onDropTrack(JSON.parse(raw) as Track);
    } catch {
      onStatus('No se soltó');
    }
  }

  function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || !videoId) return;
    const name = label.trim();
    if (!name) return;
    onSaveHighlight(draft.start, draft.end, name);
    setDraft(null);
    setLabel('Corte');
    setClearToken((value) => value + 1);
  }

  const waveColor = id === 'A' ? '#7f9e97' : '#c9844a';
  const waveProgress = id === 'A' ? '#d5ebe4' : '#f0d3b4';

  const cueLabel = `Cue ${formatTime(cueTime)}`;

  return (
    <article
      className={over ? 'deck over' : 'deck'}
      data-testid={`deck-${id.toLowerCase()}`}
      data-deck={id}
      data-video-id={videoId ?? ''}
      aria-label={`Deck ${id}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="deck-head">
        <strong>{id}</strong>
        {onOpenList ? (
          <button type="button" className="icon-button" aria-label={`Cola ${id}`} title="Cola" onClick={onOpenList}>
            <Icon name="queue" />
          </button>
        ) : null}
        <p className="deck-title" title={title || undefined}>
          {apiError ? 'Error' : title}
        </p>
        <label className="bpm">
          <input
            inputMode="decimal"
            value={bpm ?? ''}
            placeholder="BPM"
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                onBpm(null);
                return;
              }
              const value = Number(raw);
              if (Number.isFinite(value) && value > 0 && value < 400) onBpm(value);
            }}
            aria-label={`BPM deck ${id}`}
          />
        </label>
        <span className="time" title={`${formatTime(time)} / ${formatTime(duration)}`}>
          {formatTime(time)}
        </span>
      </header>
      <div className="deck-top">
        {videoId ? <div className="video-frame" ref={mountRef} /> : <div className="video-frame empty" />}
        <div className="transport">
          <button
            type="button"
            className="icon-button play-btn"
            aria-label={playing ? 'Pausa' : 'Play'}
            title={playing ? 'Pausa' : 'Play'}
            aria-pressed={playing}
            disabled={!videoId}
            onClick={() => (playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())}
          >
            <Icon name={playing ? 'pause' : 'play'} size={28} />
          </button>
          <button
            type="button"
            className="icon-button"
            title={cueLabel}
            aria-label={cueLabel}
            disabled={!videoId}
            onClick={() => {
              try {
                playerRef.current?.pauseVideo();
                const length = playerRef.current?.getDuration() ?? 0;
                if (length > 0) playerRef.current?.seekTo(Math.min(cueRef.current, length), true);
              } catch {
                /* ignore */
              }
            }}
          >
            <Icon name="cue" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Marcar"
            aria-label="Marcar"
            disabled={!videoId}
            onClick={() => {
              try {
                onCueTime(playerRef.current?.getCurrentTime() ?? 0);
              } catch {
                onCueTime(0);
              }
            }}
          >
            <Icon name="mark" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Nudge −"
            aria-label="Nudge −"
            disabled={!videoId}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              nudge(-1, true);
            }}
            onPointerUp={() => nudge(-1, false)}
            onPointerCancel={() => nudge(-1, false)}
          >
            <Icon name="nudge-left" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Nudge +"
            aria-label="Nudge +"
            disabled={!videoId}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              nudge(1, true);
            }}
            onPointerUp={() => nudge(1, false)}
            onPointerCancel={() => nudge(1, false)}
          >
            <Icon name="nudge-right" />
          </button>
          <button type="button" className="icon-button" title="TAP" aria-label="TAP" disabled={!videoId} onClick={tap}>
            <Icon name="tap" />
          </button>
          <RateDrag rate={playbackRate} rates={rates} disabled={!videoId} onRate={onRate} />
          <button
            type="button"
            className="icon-button"
            title="Analizar"
            aria-label="Analizar"
            disabled={!videoId}
            onClick={() => (onAnalyze ? onAnalyze() : window.open('/sync', '_blank', 'noopener'))}
          >
            <Icon name="analyze" />
          </button>
          {onStartSynced ? (
            <button
              type="button"
              className="icon-button"
              title="Entrar en beat"
              aria-label="Entrar en beat"
              disabled={!videoId || !syncReady}
              onClick={onStartSynced}
            >
              <Icon name="beat" />
            </button>
          ) : null}
        </div>
        <div className="cues" aria-label={`Cues ${id}`}>
          {Array.from({ length: CUE_SLOTS }, (_, index) => {
            const time = cues[index];
            const set = time != null;
            const label = set ? `Cue ${index + 1} ${formatTime(time)}` : `Cue ${index + 1}`;
            return (
              <button
                key={index}
                type="button"
                className={set ? 'cue-pad is-set' : 'cue-pad'}
                disabled={!videoId}
                title={label}
                aria-label={label}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!videoId || !set) return;
                  const next = clearCue(cues, index);
                  setCues(next);
                  void saveCues(videoId, next);
                }}
                onPointerDown={(event) => {
                  if (!videoId || event.button === 2) return;
                  window.clearTimeout(longPressRef.current);
                  longPressRef.current = window.setTimeout(() => {
                    longPressRef.current = 0;
                    if (!set) return;
                    const next = clearCue(cues, index);
                    setCues(next);
                    void saveCues(videoId, next);
                  }, 520);
                }}
                onPointerUp={() => window.clearTimeout(longPressRef.current)}
                onPointerLeave={() => window.clearTimeout(longPressRef.current)}
                onClick={() => {
                  if (!videoId || longPressRef.current === 0) return;
                  window.clearTimeout(longPressRef.current);
                  if (set) {
                    try {
                      playerRef.current?.seekTo(time, true);
                    } catch {
                      /* ignore */
                    }
                    return;
                  }
                  try {
                    const now = playerRef.current?.getCurrentTime() ?? 0;
                    const next = setCue(cues, index, now);
                    setCues(next);
                    void saveCues(videoId, next);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                {set ? formatTime(time) : index + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="wave-wrap">
        {duration > 0 ? (
          <Waveform
            peaks={peaks}
            duration={duration}
            time={time}
            color={waveColor}
            progress={waveProgress}
            clearToken={clearToken}
            onSeek={(seconds) => {
              try {
                playerRef.current?.seekTo(seconds, true);
              } catch {
                /* ignore */
              }
            }}
            onSelect={(start, end) => setDraft({ start, end })}
          />
        ) : (
          <div className="wave wave-empty" />
        )}
        <BeatGrid bpm={bpm} offset={beatOffset ?? null} duration={duration} />
      </div>
      {draft ? (
        <form className="draft" onSubmit={saveDraft}>
          <span>
            {formatTime(draft.start)}–{formatTime(draft.end)}
          </span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Nombre del corte" maxLength={80} />
          <button type="submit" className="icon-button primary" title="Guardar" aria-label="Guardar">
            <Icon name="check" />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Cancelar"
            aria-label="Cancelar"
            onClick={() => {
              setDraft(null);
              setClearToken((value) => value + 1);
            }}
          >
            <Icon name="x" />
          </button>
        </form>
      ) : null}
    </article>
  );
});

function nearestRate(desired: number, rates: number[]): number {
  return rates.reduce((best, rate) => (Math.abs(rate - desired) < Math.abs(best - desired) ? rate : best));
}

function RateDrag({ rate, rates, disabled, onRate }: { rate: number; rates: number[]; disabled: boolean; onRate: (rate: number) => void }) {
  const shown = rates.includes(rate) ? rate : nearestRate(rate, rates.length ? rates : [rate]);
  const index = Math.max(0, rates.indexOf(shown));
  const drag = useRef<{ x: number; index: number; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const label = `Velocidad ${shown}×`;
  const higher = rates.filter((value) => value > shown + 0.001);
  const lower = rates.filter((value) => value < shown - 0.001);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !wrapRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  function pick(next: number) {
    onRate(next);
    setOpen(false);
  }

  return (
    <div className="rate" ref={wrapRef}>
      <button
        type="button"
        className="icon-button rate-step"
        aria-label="Más lento"
        title="Más lento"
        disabled={disabled || !lower.length}
        onClick={() => onRate(nudgedRate(shown, -1, rates))}
      >
        <Icon name="minus" size={16} />
      </button>
      <div
        className="rate-drag"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        title="Velocidad"
        aria-label={label}
        aria-valuemin={rates[0] ?? shown}
        aria-valuemax={rates[rates.length - 1] ?? shown}
        aria-valuenow={shown}
        aria-disabled={disabled}
        aria-expanded={open}
        onPointerDown={(event) => {
          if (disabled || !rates.length) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, index, moved: false };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !rates.length || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          if (Math.abs(event.clientX - start.x) > 6) start.moved = true;
          const delta = Math.round((event.clientX - start.x) / 22);
          const next = rates[Math.min(rates.length - 1, Math.max(0, start.index + delta))];
          if (next != null && start.moved) onRate(next);
        }}
        onPointerUp={() => {
          const start = drag.current;
          drag.current = null;
          if (!start?.moved && !disabled) setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((value) => !value);
            return;
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          const delta = event.key === 'ArrowRight' ? 1 : -1;
          const next = rates[index + delta];
          if (next != null) onRate(next);
        }}
      >
        {shown}×
        {open && !disabled ? (
          <>
            {higher.length ? (
              <ul className="rate-picker rate-higher">
                {higher
                  .slice()
                  .reverse()
                  .map((value) => (
                    <li key={value}>
                      <button type="button" onClick={() => pick(value)}>
                        {value}×
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
            {lower.length ? (
              <ul className="rate-picker rate-lower">
                {lower
                  .slice()
                  .reverse()
                  .map((value) => (
                    <li key={value}>
                      <button type="button" onClick={() => pick(value)}>
                        {value}×
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </div>
      <button
        type="button"
        className="icon-button rate-step"
        aria-label="Más rápido"
        title="Más rápido"
        disabled={disabled || !higher.length}
        onClick={() => onRate(nudgedRate(shown, 1, rates))}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}


