import { forwardRef, useEffect, useId, useLayoutEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DeckId, Track } from '../types';
import { DEFAULT_RATES } from '../types';
import { formatTime } from '../lib/format';
import { noteDeckDrop } from '../lib/library';
import { clamp01, nudgedRate } from '../lib/mixer';
import { prerollFromState, type PrerollPhase } from '../lib/preload';
import { readDiscOn, writeDiscOn } from '../lib/disc';
import { discAngle, jogTarget, jogTransport } from '../lib/jog';
import { loadYouTubeAPI } from '../lib/youtube-api';
import { Icon } from './icons';
import { Waveform } from './Waveform';
import { decodeEntities } from '../lib/html-text';

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
  peaks: number[] | null;
  onRate: (rate: number) => void;
  onTitle: (videoId: string, title: string) => void;
  onDropTrack: (track: Track) => void;
  onStatus: (message: string) => void;
};

/** How long the position may stand still before each automatic retry (backoff). */
const WATCH_LIMITS = [4000, 6000, 9000, 13000];

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
    peaks,
    onRate,
    onTitle,
    onDropTrack,
    onStatus,
  } = props;

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const created = useRef(false);
  const gainRef = useRef(gain);
  const rateRef = useRef(playbackRate);
  const ratesRef = useRef<number[]>(DEFAULT_RATES);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rates, setRates] = useState<number[]>(DEFAULT_RATES);
  const [over, setOver] = useState(false);
  const [apiError, setApiError] = useState(false);
  const prerollRef = useRef<PrerollPhase>('idle');
  const readyRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const wantPlayRef = useRef(false);
  const videoIdRef = useRef(videoId);
  const loadedIdRef = useRef<string | null>(null);
  const lastTimeRef = useRef(0);
  const errorRef = useRef(false);
  const recoveringUntilRef = useRef(0);
  const reapplyRateRef = useRef(false);
  const resumeRef = useRef<{ time: number; play: boolean } | null>(null);
  const watchRef = useRef({ lastT: -1, stuck: 0, tries: 0, good: 0, force: false });
  const [gen, setGen] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
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
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<{ wasPlaying: boolean; seekAt: number; muted: boolean; idle: number | null } | null>(null);

  videoIdRef.current = videoId;
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
    loadedIdRef.current = nextId;
    lastTimeRef.current = 0;
    errorRef.current = false;
    wantPlayRef.current = false;
    watchRef.current = { lastT: -1, stuck: 0, tries: 0, good: 0, force: false };
    setReconnecting(false);
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

  /** The player object is gone or its iframe left the page (remount, tab discard): nothing to call on it. */
  const playerDead = (player: YT.Player | null): boolean => {
    if (!player) return true;
    try {
      player.getPlayerState();
      const frame = (player as unknown as { getIframe?: () => HTMLIFrameElement | null }).getIframe?.();
      return Boolean(frame && !frame.isConnected);
    } catch {
      return true;
    }
  };

  /** Reload the same video at the last known position and play it. If the player itself is dead, build a new one. */
  const reconnect = () => {
    const id = videoIdRef.current;
    if (!id) return;
    wantPlayRef.current = true;
    errorRef.current = false;
    recoveringUntilRef.current = Date.now() + 4000;
    watchRef.current.stuck = 0;
    watchRef.current.lastT = -1;
    const at = lastTimeRef.current;
    const player = playerRef.current;
    if (playerDead(player)) {
      resumeRef.current = { time: at, play: true };
      readyRef.current = false;
      setReady(false);
      setGen((value) => value + 1);
      return;
    }
    prerollRef.current = 'done';
    try {
      applyGain(gainRef.current);
      player?.loadVideoById({ videoId: id, startSeconds: at });
      loadedIdRef.current = id;
      reapplyRateRef.current = true;
    } catch {
      /* the watchdog tries again */
    }
  };

  const stalledNow = () => errorRef.current || watchRef.current.stuck >= 2000;

  // One press always means "play now". While the player is not ready (API or iframe still loading) the intent
  // is kept and applied on ready. While the muted preroll of a freshly loaded track is running, the preroll is
  // cancelled so its pause at the end can't undo the press. A stalled, errored or dead player is reloaded at the
  // last position instead of being asked to play again.
  const requestPlay = () => {
    wantPlayRef.current = true;
    const player = playerRef.current;
    if (!player || !readyRef.current) {
      pendingPlayRef.current = true;
      setPlaying(true);
      return;
    }
    pendingPlayRef.current = false;
    let state = -2;
    try {
      state = player.getPlayerState();
    } catch {
      /* dead player */
    }
    if (prerollRef.current !== 'armed' && (playerDead(player) || stalledNow() || (state === -1 && loadedIdRef.current))) {
      watchRef.current.tries = 0;
      reconnect();
      return;
    }
    if (prerollRef.current === 'armed') {
      prerollRef.current = 'done';
      applyGain(gainRef.current);
    }
    try {
      player.playVideo();
    } catch {
      /* ignore */
    }
  };

  const requestPause = () => {
    wantPlayRef.current = false;
    pendingPlayRef.current = false;
    errorRef.current = false;
    watchRef.current.stuck = 0;
    setReconnecting(false);
    const player = playerRef.current;
    if (!player || !readyRef.current) {
      setPlaying(false);
      return;
    }
    if (prerollRef.current === 'armed') {
      prerollRef.current = 'done';
      applyGain(gainRef.current);
    }
    try {
      player.pauseVideo();
    } catch {
      /* ignore */
    }
  };

  // Toggle from what the player really does, not from the last React render.
  const requestToggle = () => {
    const player = playerRef.current;
    if (!player || !readyRef.current) {
      if (pendingPlayRef.current) requestPause();
      else requestPlay();
      return;
    }
    if (prerollRef.current === 'armed' || stalledNow() || playerDead(player)) {
      requestPlay();
      return;
    }
    let state = -1;
    try {
      state = player.getPlayerState();
    } catch {
      /* ignore */
    }
    if (state === 1 || (state === 3 && wantPlayRef.current)) requestPause();
    else requestPlay();
  };

  /** While the deck is meant to be playing: if the position stops moving, retry with backoff, keeping the place. */
  const watchTick = (dt: number) => {
    const w = watchRef.current;
    if (!videoIdRef.current || !readyRef.current) return;
    if (joggingRef.current || scrubRef.current || prerollRef.current === 'armed' || !wantPlayRef.current) {
      w.stuck = 0;
      w.lastT = -1;
      if (!wantPlayRef.current && !errorRef.current) w.tries = 0;
      setReconnecting((on) => (on ? false : on));
      return;
    }
    const player = playerRef.current;
    let state = -2;
    let t = 0;
    try {
      if (!player || playerDead(player)) throw new Error('dead');
      state = player.getPlayerState();
      t = player.getCurrentTime() || 0;
    } catch {
      state = -2;
    }
    if (state === -2) {
      if (w.tries >= WATCH_LIMITS.length) return giveUp();
      w.tries += 1;
      setReconnecting(true);
      reconnect();
      return;
    }
    const moving = state === 1 && w.lastT >= 0 && Math.abs(t - w.lastT) > 0.04;
    w.lastT = t;
    if (moving) {
      w.stuck = 0;
      w.good += dt;
      if (w.good > 8000) w.tries = 0;
      lastTimeRef.current = t;
      setReconnecting((on) => (on ? false : on));
      return;
    }
    if (state === 0) return;
    w.good = 0;
    if (state === 3 && t > 0.3) lastTimeRef.current = t;
    w.stuck += dt;
    if (w.stuck >= 1500) setReconnecting((on) => (on ? on : true));
    const limit = WATCH_LIMITS[Math.min(w.tries, WATCH_LIMITS.length - 1)];
    if (w.force || w.stuck >= limit) {
      w.force = false;
      if (w.tries >= WATCH_LIMITS.length) return giveUp();
      w.tries += 1;
      reconnect();
    }
  };

  const giveUp = () => {
    wantPlayRef.current = false;
    errorRef.current = true; // the next press reloads instead of asking a stuck player to play
    watchRef.current.stuck = 0;
    setReconnecting(false);
    setPlaying(false);
    onStatus('No se pudo reconectar');
  };

  const watchRefFn = useRef(watchTick);
  watchRefFn.current = watchTick;

  useImperativeHandle(ref, () => ({
    play() {
      requestPlay();
    },
    pause() {
      requestPause();
    },
    toggle() {
      requestToggle();
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
              readyRef.current = true;
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
              const currentId = videoIdRef.current;
              const resume = resumeRef.current;
              resumeRef.current = null;
              if (currentId) {
                try {
                  loadedIdRef.current = currentId;
                  if (resume) {
                    prerollRef.current = 'done';
                    if (resume.play) {
                      event.target.loadVideoById({ videoId: currentId, startSeconds: resume.time });
                      reapplyRateRef.current = true;
                    } else {
                      event.target.cueVideoById({ videoId: currentId, startSeconds: resume.time });
                    }
                  } else {
                    event.target.cueVideoById(currentId);
                  }
                } catch {
                  /* ignore */
                }
              }
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false;
                try {
                  event.target.playVideo();
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
              if (event.data === 1) {
                wantPlayRef.current = true;
                errorRef.current = false;
                if (reapplyRateRef.current) {
                  reapplyRateRef.current = false;
                  try {
                    event.target.setPlaybackRate(rateRef.current);
                  } catch {
                    /* ignore */
                  }
                }
              } else if ((event.data === 2 && Date.now() > recoveringUntilRef.current) || event.data === 0) {
                wantPlayRef.current = false;
              }
              setPlaying(event.data === 1);
              try {
                const data = event.target.getVideoData();
                if (data?.video_id && data.title) onTitle(data.video_id, data.title);
              } catch {
                /* ignore */
              }
            },
            onError: (event) => {
              // 100, 101 and 150: the video itself can't be played here. Anything else is worth another try.
              if (event.data === 100 || event.data === 101 || event.data === 150) {
                wantPlayRef.current = false;
                setReconnecting(false);
                onStatus('Video bloqueado');
                return;
              }
              errorRef.current = true;
              if (wantPlayRef.current) watchRef.current.force = true;
            },
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
      readyRef.current = false;
      pendingPlayRef.current = false;
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
  }, [videoId ? 'on' : 'off', gen]);

  useEffect(() => {
    if (!videoId || !ready) return;
    try {
      const current = playerRef.current?.getVideoData()?.video_id;
      if (current === videoId || loadedIdRef.current === videoId) return;
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
    let last = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(2000, now - last);
      last = now;
      watchRefFn.current(dt);
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

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

  /** Scrub from the wave. A playing deck is audible while the pointer moves (short bursts at each seek)
   * and goes silent when the pointer rests, so it never loops one spot. A paused deck seeks silently. */
  function onScrub(phase: 'start' | 'move' | 'end', seconds: number) {
    const player = playerRef.current;
    const state = scrubRef.current;
    const seek = (final: boolean) => {
      try {
        player?.seekTo(seconds, true);
        if (final && state?.wasPlaying) player?.playVideo();
      } catch {
        /* seek while buffering */
      }
    };
    const arm = (current: NonNullable<typeof state>) => {
      if (current.idle != null) window.clearTimeout(current.idle);
      if (!current.wasPlaying) return;
      current.idle = window.setTimeout(() => {
        current.idle = null;
        current.muted = true;
        try {
          player?.mute();
        } catch {
          /* ignore */
        }
      }, 180);
    };
    if (phase === 'start') {
      let wasPlaying = false;
      try {
        wasPlaying = player?.getPlayerState() === 1;
      } catch {
        wasPlaying = false;
      }
      const current = { wasPlaying, seekAt: performance.now(), muted: false, idle: null as number | null };
      scrubRef.current = current;
      setScrub(seconds);
      seek(false);
      arm(current);
      return;
    }
    if (!state) return;
    if (phase === 'move') {
      setScrub(seconds);
      const now = performance.now();
      if (state.muted) {
        state.muted = false;
        applyGain(gainRef.current);
      }
      arm(state);
      if (now - state.seekAt < 90) return;
      state.seekAt = now;
      seek(false);
      return;
    }
    if (state.idle != null) window.clearTimeout(state.idle);
    scrubRef.current = null;
    seek(true);
    applyGain(gainRef.current);
    setTime(seconds);
    setScrub(null);
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

  const waveColor = id === 'A' ? '#7f9e97' : '#c9844a';
  const waveProgress = id === 'A' ? '#d5ebe4' : '#f0d3b4';

  function rewind() {
    wantPlayRef.current = false;
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
        <p className="deck-title" title={title ? decodeEntities(title) : undefined}>
          {apiError ? 'Error' : decodeEntities(title)}
        </p>
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
            className={reconnecting ? 'icon-button play-btn tone-play is-reconnecting' : 'icon-button play-btn tone-play'}
            data-testid={`play-${id}`}
            aria-label={reconnecting ? 'Reconectando' : playing ? 'Pausa' : 'Play'}
            title={reconnecting ? 'Reconectando…' : playing ? 'Pausa' : 'Play'}
            aria-pressed={playing}
            aria-busy={reconnecting}
            disabled={!videoId}
            onClick={requestToggle}
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
          <RateControl rate={playbackRate} rates={rates} disabled={!videoId} onRate={onRate} deck={id} />
        </div>
      </div>
      <div className="wave-wrap">
        {duration > 0 ? (
          <Waveform
            peaks={peaks}
            duration={duration}
            time={scrub ?? time}
            color={waveColor}
            progress={waveProgress}
            onScrub={onScrub}
          />
        ) : (
          <div className="wave wave-empty" />
        )}
      </div>
    </article>
  );
});

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
  const label = `Velocidad ${shown}×`;
  const higher = rates.filter((value) => value > shown + 0.001);
  const lower = rates.filter((value) => value < shown - 0.001);

  // All speeds show at once in a compact grid, kept inside the viewport: above the button when it fits, below otherwise.
  useLayoutEffect(() => {
    const picker = pickerRef.current;
    const anchor = wrapRef.current?.getBoundingClientRect();
    if (!open || !picker || !anchor) return;
    const { width, height } = picker.getBoundingClientRect();
    const edge = 8;
    const left = Math.min(window.innerWidth - width - edge, Math.max(edge, anchor.left + anchor.width / 2 - width / 2));
    let top = anchor.top - height - 6;
    if (top < edge) top = Math.min(anchor.bottom + 6, window.innerHeight - height - edge);
    picker.style.left = `${Math.max(edge, left)}px`;
    picker.style.top = `${Math.max(edge, top)}px`;
    picker.style.visibility = 'visible';
  }, [open, rates.length]);

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
    const shut = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', shut);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', shut);
    };
  }, [open]);

  function pick(next: number) {
    onRate(next);
    setOpen(false);
  }

  function toggle() {
    if (disabled) return;
    setOpen((value) => !value);
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
      {open && !disabled
        ? createPortal(
            <ul
              className="rate-picker"
              data-testid={`rate-picker-${deck}`}
              role="listbox"
              aria-label="Velocidades"
              ref={pickerRef}
              style={{ left: 0, top: 0, visibility: 'hidden', gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, rates.length))}, minmax(0, 1fr))` }}
            >
              {rates.map((value) => (
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


