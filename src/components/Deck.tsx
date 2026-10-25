import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { DeckId, Track } from '../types';
import { DEFAULT_RATES } from '../types';
import { formatTime } from '../lib/format';
import { bpmFromTaps } from '../lib/bpm';
import { clamp01, nudgedRate } from '../lib/mixer';
import { loadYouTubeAPI } from '../lib/youtube-api';
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
  volume: number;
  gain: number;
  playbackRate: number;
  bpm: number | null;
  peaks: number[] | null;
  cueTime: number;
  analyzing: boolean;
  onVolume: (volume: number) => void;
  onRate: (rate: number) => void;
  onBpm: (bpm: number | null) => void;
  onCueTime: (seconds: number) => void;
  onTitle: (videoId: string, title: string) => void;
  onRates: (rates: number[]) => void;
  onDropTrack: (track: Track) => void;
  onAnalyze: () => void;
  onStopAnalyze: () => void;
  onSaveHighlight: (start: number, end: number, label: string) => void;
  onStatus: (message: string) => void;
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
    volume,
    gain,
    playbackRate,
    bpm,
    peaks,
    cueTime,
    analyzing,
    onVolume,
    onRate,
    onBpm,
    onCueTime,
    onTitle,
    onRates,
    onDropTrack,
    onAnalyze,
    onStopAnalyze,
    onSaveHighlight,
    onStatus,
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
        player.cueVideoById(nextId);
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
              setPlaying(event.data === 1);
              try {
                const data = event.target.getVideoData();
                if (data?.video_id && data.title) onTitle(data.video_id, data.title);
              } catch {
                /* ignore */
              }
            },
            onError: () => onStatus('YouTube no deja reproducir este video aquí.'),
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
      playerRef.current?.cueVideoById(videoId);
    } catch {
      /* ignore */
    }
  }, [videoId, ready]);

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
      onStatus('No pude soltar ese tema.');
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

  return (
    <article
      className={over ? 'deck over' : 'deck'}
      data-testid={`deck-${id.toLowerCase()}`}
      data-video-id={videoId ?? ''}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="deck-head">
        <strong>Deck {id}</strong>
        <span className="time">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </header>
      {videoId ? (
        <div className="video-frame" ref={mountRef} />
      ) : (
        <div className="video-frame empty">Suelta un tema aquí</div>
      )}
      <p className="deck-title" title={title || undefined}>
        {apiError ? 'No se pudo cargar el reproductor.' : title || (videoId ? videoId : 'Sin tema')}
      </p>
      <div className="transport">
        <button type="button" onClick={() => (playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())} disabled={!videoId}>
          {playing ? 'Pausa' : 'Play'}
        </button>
        <button
          type="button"
          title={`Cue ${formatTime(cueTime)}`}
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
          Cue
        </button>
        <button
          type="button"
          disabled={!videoId}
          onClick={() => {
            try {
              onCueTime(playerRef.current?.getCurrentTime() ?? 0);
            } catch {
              onCueTime(0);
            }
          }}
        >
          Marcar
        </button>
        <button
          type="button"
          disabled={!videoId}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            nudge(-1, true);
          }}
          onPointerUp={() => nudge(-1, false)}
          onPointerCancel={() => nudge(-1, false)}
        >
          Nudge −
        </button>
        <button
          type="button"
          disabled={!videoId}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            nudge(1, true);
          }}
          onPointerUp={() => nudge(1, false)}
          onPointerCancel={() => nudge(1, false)}
        >
          Nudge +
        </button>
        <label className="rate">
          Velocidad
          <select
            value={String(rates.includes(playbackRate) ? playbackRate : nearestRate(playbackRate, rates))}
            disabled={!videoId}
            onChange={(event) => onRate(Number(event.target.value))}
          >
            {rates.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="vol">
        <span>Vol {Math.round(volume * 100)}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(event) => onVolume(Number(event.target.value) / 100)}
          aria-label={`Volumen deck ${id}`}
        />
      </label>
      <div className="bpm-row">
        <label>
          BPM
          <input
            inputMode="decimal"
            value={bpm ?? ''}
            placeholder="—"
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
        <button type="button" onClick={tap} disabled={!videoId}>
          TAP
        </button>
        {analyzing ? (
          <button type="button" onClick={onStopAnalyze}>
            Detener
          </button>
        ) : (
          <button type="button" onClick={onAnalyze} disabled={!videoId}>
            Analizar
          </button>
        )}
      </div>
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
        <div className="wave wave-empty">{videoId ? 'Leyendo duración…' : 'La onda aparece con el video'}</div>
      )}
      {draft ? (
        <form className="draft" onSubmit={saveDraft}>
          <span>
            {formatTime(draft.start)}–{formatTime(draft.end)}
          </span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} aria-label="Nombre del corte" maxLength={80} />
          <button type="submit" className="primary">
            Guardar
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setClearToken((value) => value + 1);
            }}
          >
            Cancelar
          </button>
        </form>
      ) : null}
    </article>
  );
});

function nearestRate(desired: number, rates: number[]): number {
  return rates.reduce((best, rate) => (Math.abs(rate - desired) < Math.abs(best - desired) ? rate : best));
}
