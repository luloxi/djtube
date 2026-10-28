import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DeckId, Track } from '../types';
import { DEFAULT_RATES } from '../types';
import { bpmFromTaps } from '../lib/bpm';
import { formatTime } from '../lib/format';
import { noteDeckDrop } from '../lib/library';
import { clamp01, nudgedRate } from '../lib/mixer';
import { prerollFromState, type PrerollPhase } from '../lib/preload';
import { readDiscOn, writeDiscOn } from '../lib/disc';
import { discAngle, jogTarget, jogTransport } from '../lib/jog';
import { loadYouTubeAPI } from '../lib/youtube-api';
import { BeatGrid } from './BeatGrid';
import { Icon } from './icons';
import { Waveform } from './Waveform';

export type DeckHandle = {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  cueTo: (seconds: number) => void;
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
  onRate: (rate: number) => void;
  onBpm: (bpm: number | null) => void;
  onTitle: (videoId: string, title: string) => void;
  onRates: (rates: number[]) => void;
  onDropTrack: (track: Track) => void;
  onSaveHighlight: (start: number, end: number, label: string) => void;
  onStatus: (message: string) => void;
  beatOffset?: number | null;
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
    onRate,
    onBpm,
    onTitle,
    onRates,
    onDropTrack,
    onSaveHighlight,
    onStatus,
    beatOffset = null,
  } = props;

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const created = useRef(false);
  const gainRef = useRef(gain);
  const rateRef = useRef(playbackRate);
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
  const prerollRef = useRef<PrerollPhase>('idle');
  const spinRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const joggingRef = useRef(false);
  const jogRef = useRef<{
    pointerId: number;
    cx: number;
    cy: number;
    lastAngle: number;
    lastAt: number;
    origin: number;
    accum: number;
    wasPlaying: boolean;
    rate: number;
    seekAt: number;
  } | null>(null);
  const [disc, setDisc] = useState(() => {
    try {
      return readDiscOn(window.localStorage, id);
    } catch {
      return true;
    }
  });
  const [jogging, setJogging] = useState(false);

  gainRef.current = gain;
  rateRef.current = playbackRate;
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
    const slot = slotRef.current;
    if (!slot) return;
    const fit = () => {
      const rect = slot.getBoundingClientRect();
      const size = Math.min(slot.clientWidth, slot.clientHeight, rect.width, rect.height);
      if (size > 1) slot.style.setProperty('--disc-size', `${size}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!disc) {
      if (spinRef.current) spinRef.current.style.transform = '';
      return;
    }
    let raf = 0;
    let shown = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!joggingRef.current && spinRef.current) {
        let media = shown;
        let playingNow = false;
        const player = playerRef.current;
        if (player) {
          try {
            media = player.getCurrentTime() || 0;
            playingNow = player.getPlayerState() === 1;
          } catch {
            playingNow = false;
          }
        }
        if (!Number.isFinite(media)) media = shown;
        if (!playingNow) shown = media;
        else if (Math.abs(media - shown) > 0.45) shown = media;
        else {
          const rate = rateRef.current > 0 ? rateRef.current : 1;
          shown += dt * rate;
          shown += (media - shown) * Math.min(1, dt * 4);
        }
        spinRef.current.style.transform = `rotate(${discAngle(shown)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [disc]);

  function endJog(pointerId: number) {
    const jog = jogRef.current;
    if (!jog || jog.pointerId !== pointerId) return;
    jogRef.current = null;
    joggingRef.current = false;
    setJogging(false);
    try {
      playerRef.current?.setPlaybackRate(jog.rate);
      if (jog.wasPlaying) playerRef.current?.playVideo();
      else playerRef.current?.pauseVideo();
    } catch {
      /* player gone */
    }
    onRate(jog.rate);
  }

  function onJogDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!disc || !videoId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let origin = 0;
    try {
      origin = playerRef.current?.getCurrentTime() ?? 0;
    } catch {
      origin = 0;
    }
    jogRef.current = {
      pointerId: event.pointerId,
      cx,
      cy,
      lastAngle: Math.atan2(event.clientY - cy, event.clientX - cx),
      lastAt: performance.now(),
      origin,
      accum: 0,
      wasPlaying: playing,
      rate: rateRef.current,
      seekAt: 0,
    };
    joggingRef.current = true;
    setJogging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onJogMove(event: React.PointerEvent<HTMLDivElement>) {
    const jog = jogRef.current;
    if (!jog || event.pointerId !== jog.pointerId) return;
    const angle = Math.atan2(event.clientY - jog.cy, event.clientX - jog.cx);
    let delta = angle - jog.lastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    const now = performance.now();
    const dt = (now - jog.lastAt) / 1000;
    jog.lastAngle = angle;
    jog.lastAt = now;
    jog.accum += delta;
    let target = jogTarget(jog.origin, (jog.accum * 180) / Math.PI);
    try {
      const length = playerRef.current?.getDuration() ?? 0;
      if (length > 0.4) target = Math.min(target, Math.max(0, length - 0.05));
    } catch {
      target = Math.max(0, target);
    }
    if (spinRef.current) spinRef.current.style.transform = `rotate(${discAngle(target)}deg)`;
    const turnsPerSec = dt > 0.016 ? delta / (Math.PI * 2) / dt : 0;
    const transport = jogTransport(turnsPerSec, ratesRef.current, jog.rate);
    if (now - jog.seekAt < 40) return;
    jog.seekAt = now;
    try {
      const player = playerRef.current;
      if (!player) return;
      if (transport.pause) player.pauseVideo();
      else if (player.getPlayerState() !== 1) player.playVideo();
      if (transport.rate != null) player.setPlaybackRate(transport.rate);
      player.seekTo(target, true);
    } catch {
      /* seek while buffering */
    }
  }

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
    applyGain(gain);
  }, [gain, ready]);

  useEffect(() => {
    if (!ready || joggingRef.current) return;
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
      noteDeckDrop();
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

  function rewind() {
    try {
      const player = playerRef.current;
      player?.pauseVideo();
      player?.seekTo(0, true);
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      className={['deck', over ? 'over' : '', disc ? 'disc-on' : ''].filter(Boolean).join(' ')}
      data-disc={disc ? 'on' : 'off'}
      data-playing={playing ? 'on' : 'off'}
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
        <p className="deck-title" title={title || undefined}>
          {apiError ? 'Error' : title}
        </p>
        {bpm != null ? (
          <span className="bpm" title="BPM" aria-label={`BPM deck ${id}`}>
            {Math.round(bpm * 10) / 10}
          </span>
        ) : null}
        <span className="time" title={`${formatTime(time)} / ${formatTime(duration)}`}>
          {formatTime(time)}
        </span>
        <TipButton
          className="icon-button tone-viz viz-toggle"
          testId={`viz-${id}`}
          label="Visualización"
          tip={disc ? 'Visualización: disco. Tocá para ver el video plano' : 'Visualización: video plano. Tocá para ver el disco'}
          pressed={disc}
          onPress={() =>
            setDisc((on) => {
              const next = !on;
              try {
                writeDiscOn(window.localStorage, id, next);
              } catch {
                /* ignore */
              }
              return next;
            })
          }
        >
          <Icon name="viz" size={16} />
        </TipButton>
      </header>
      <div className="deck-top">
        <div className="video-slot" ref={slotRef}>
          <div
            className={['video-frame', videoId ? '' : 'empty', disc ? 'as-disc' : '', jogging ? 'jogging' : ''].filter(Boolean).join(' ')}
            onPointerDown={onJogDown}
            onPointerMove={onJogMove}
            onPointerUp={(event) => endJog(event.pointerId)}
            onPointerCancel={(event) => endJog(event.pointerId)}
          >
            <div className="disc-rot" ref={spinRef}>
              <div className="yt-mount" ref={mountRef} />
            </div>
            {disc ? <div className="disc-hole" aria-hidden="true" /> : null}
          </div>
        </div>
        <div className="transport" data-testid={`transport-${id.toLowerCase()}`}>
          <button
            type="button"
            className="icon-button play-btn tone-play"
            data-testid={`play-${id}`}
            aria-label={playing ? 'Pausa' : 'Play'}
            title={playing ? 'Pausa' : 'Play'}
            aria-pressed={playing}
            disabled={!videoId}
            onClick={() => (playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo())}
          >
            <Icon name={playing ? 'pause' : 'play'} size={18} />
          </button>
          <button
            type="button"
            className="icon-button tone-back"
            title="Volver al principio"
            aria-label="Volver al principio"
            disabled={!videoId}
            onClick={rewind}
          >
            <Icon name="cue" />
          </button>
          <TapButton disabled={!videoId} onTap={tap} />
          <RateControl rate={playbackRate} rates={rates} disabled={!videoId} onRate={onRate} deck={id} />
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

const TAP_TIP = 'Tocá al ritmo para medir el BPM';

function TapButton({ disabled, onTap }: { disabled: boolean; onTap: () => void }) {
  return (
    <TipButton className="icon-button tone-tap" label="TAP" tip={TAP_TIP} disabled={disabled} onPress={onTap} wrapClass="tap-tip">
      <Icon name="tap" />
    </TipButton>
  );
}

/** Icon button with a tooltip: on hover or focus, and on a long press on touch screens. */
function TipButton({
  className,
  label,
  tip,
  disabled,
  pressed,
  testId,
  wrapClass,
  onPress,
  children,
}: {
  className: string;
  label: string;
  tip: string;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
  wrapClass?: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const tipId = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  const held = useRef(false);
  const touch = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <span className={wrapClass ? `tip ${wrapClass}` : 'tip'}>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-describedby={tipId}
        aria-pressed={pressed}
        data-testid={testId}
        disabled={disabled}
        onPointerEnter={(event) => {
          if (event.pointerType === 'touch') return;
          setOpen(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'touch') return;
          setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(event) => {
          touch.current = event.pointerType === 'touch';
          held.current = false;
          window.clearTimeout(timer.current);
          if (event.pointerType !== 'touch') return;
          timer.current = window.setTimeout(() => {
            held.current = true;
            setOpen(true);
          }, 480);
        }}
        onPointerUp={() => {
          window.clearTimeout(timer.current);
          if (touch.current && held.current) window.setTimeout(() => setOpen(false), 1200);
        }}
        onPointerCancel={() => {
          window.clearTimeout(timer.current);
          held.current = false;
          setOpen(false);
        }}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          onPress();
        }}
      >
        {children}
      </button>
      <span id={tipId} role="tooltip" className={open ? 'tip-pop is-on' : 'tip-pop'}>
        {tip}
      </span>
    </span>
  );
}

function nearestRate(desired: number, rates: number[]): number {
  return rates.reduce((best, rate) => (Math.abs(rate - desired) < Math.abs(best - desired) ? rate : best));
}

function RateControl({
  rate,
  rates,
  disabled,
  onRate,
  deck,
}: {
  rate: number;
  rates: number[];
  disabled: boolean;
  onRate: (rate: number) => void;
  deck: string;
}) {
  const shown = rates.includes(rate) ? rate : nearestRate(rate, rates.length ? rates : [rate]);
  const index = Math.max(0, rates.indexOf(shown));
  const wrapRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; bottom: number } | null>(null);
  const label = `Velocidad ${shown}×`;
  const higher = rates.filter((value) => value > shown + 0.001);
  const lower = rates.filter((value) => value < shown - 0.001);

  function place() {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(window.innerWidth - 40, Math.max(40, rect.left + rect.width / 2));
    setBox({ left, bottom: Math.max(8, window.innerHeight - rect.top + 4) });
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (wrapRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(next: number) {
    onRate(next);
    setOpen(false);
  }

  function toggle() {
    if (disabled) return;
    setOpen((value) => {
      const next = !value;
      if (next) place();
      return next;
    });
  }

  return (
    <div className="rate" ref={wrapRef}>
      <button
        type="button"
        className="icon-button rate-step tone-speed"
        aria-label="Más lento"
        title="Más lento"
        disabled={disabled || !lower.length}
        onClick={() => onRate(nudgedRate(shown, -1, rates))}
      >
        <Icon name="minus" size={16} />
      </button>
      <div
        className="rate-value tone-speed"
        data-testid={`rate-${deck}`}
        role="button"
        tabIndex={disabled ? -1 : 0}
        title="Velocidad"
        aria-label={label}
        aria-disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggle}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
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
      </div>
      {open && !disabled && box
        ? createPortal(
            <ul
              className="rate-picker"
              data-testid={`rate-picker-${deck}`}
              role="listbox"
              aria-label="Velocidades"
              ref={pickerRef}
              style={{ left: box.left, bottom: box.bottom }}
            >
              {[...rates].reverse().map((value) => (
                <li key={value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={Math.abs(value - shown) < 0.001}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      pick(value);
                    }}
                  >
                    {value}×
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
      <button
        type="button"
        className="icon-button rate-step tone-speed"
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


