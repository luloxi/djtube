import { estimateTempoFromBlob } from './analyze';
import { highestPlaybackRate } from './bpm';
import { createScanner, planScan, stepScanner, type Scanner } from './sync-scan';

export type AudioTick = { peak: number; samples: number };

export type TickHub = {
  emit: (tick: AudioTick) => void;
  set: (listener: ((tick: AudioTick) => void) | null) => void;
};

export function createTickHub(): TickHub {
  let listener: ((tick: AudioTick) => void) | null = null;
  return {
    emit(tick) {
      listener?.(tick);
    },
    set(next) {
      listener = next;
    },
  };
}

export type AnalyzeEnv = {
  player: YT.Player;
  stream: MediaStream;
  ticks: TickHub;
  signal: AbortSignal;
  isPaused: () => boolean;
  getError: () => string | null;
  onProgress: (progress: number) => void;
};

export type AnalyzeResult = {
  peaks: number[];
  bpm: number | null;
  beatOffset: number | null;
  duration: number;
  playbackRate: number;
};

function abortError(): DOMException {
  return new DOMException('Detenido.', 'AbortError');
}

function fail(message: string): Error {
  return new Error(message);
}

function readNumber(read: () => number): number {
  try {
    const value = read();
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function playerTime(player: YT.Player): number {
  return readNumber(() => player.getCurrentTime());
}

function playerDuration(player: YT.Player): number {
  return readNumber(() => player.getDuration());
}

function playerState(player: YT.Player): number {
  return readNumber(() => player.getPlayerState());
}

function playerRate(player: YT.Player): number {
  return readNumber(() => player.getPlaybackRate());
}

function playerRates(player: YT.Player): number[] {
  try {
    const rates = player.getAvailablePlaybackRates();
    return Array.isArray(rates) ? rates : [];
  } catch {
    return [];
  }
}

function applyRate(player: YT.Player, rate: number) {
  try {
    player.setPlaybackRate(rate);
  } catch {
    /* the player may still be buffering */
  }
}

function audioMime(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function openRecorder(stream: MediaStream): { stop: () => Promise<Blob | null> } {
  const audio = new MediaStream(stream.getAudioTracks());
  if (!audio.getAudioTracks().length || typeof MediaRecorder === 'undefined') {
    return { stop: async () => null };
  }
  let recorder: MediaRecorder;
  try {
    const mime = audioMime();
    recorder = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
  } catch {
    return { stop: async () => null };
  }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) : null);
    recorder.onerror = () => resolve(null);
  });
  try {
    recorder.start();
  } catch {
    return { stop: async () => null };
  }
  return {
    stop: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        return Promise.resolve(null);
      }
      return stopped;
    },
  };
}

/**
 * Wait until `accept` using worklet ticks, not timers.
 * Background tabs throttle setTimeout; the capture stream keeps this clock running.
 */
function untilTick(
  env: AnalyzeEnv,
  accept: () => boolean,
  maxTicks: number,
  message: string,
): Promise<void> {
  if (env.signal.aborted) return Promise.reject(abortError());
  const blocked = env.getError();
  if (blocked) return Promise.reject(fail(blocked));
  if (accept()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let count = 0;
    const finish = (error?: Error) => {
      env.signal.removeEventListener('abort', onAbort);
      env.ticks.set(null);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(abortError());
    env.signal.addEventListener('abort', onAbort);
    env.ticks.set(() => {
      if (env.signal.aborted) return;
      if (env.isPaused()) return;
      const playerError = env.getError();
      if (playerError) {
        finish(fail(playerError));
        return;
      }
      count += 1;
      if (accept()) finish();
      else if (count >= maxTicks) finish(fail(message));
    });
  });
}

async function preparePlayback(env: AnalyzeEnv, videoId: string): Promise<{ duration: number; rate: number }> {
  const { player } = env;
  try {
    player.loadVideoById(videoId);
    player.unMute();
    player.setVolume(100);
    player.playVideo();
  } catch {
    throw fail('No pude cargar el video.');
  }
  await untilTick(env, () => playerDuration(player) > 0.5, 500, 'No pude leer la duración.');
  await untilTick(
    env,
    () => {
      const state = playerState(player);
      return state === 1 || playerTime(player) > 0.2;
    },
    500,
    'El video no arrancó.',
  );
  const desired = highestPlaybackRate(playerRates(player));
  applyRate(player, desired);
  await untilTick(env, () => playerState(player) === 1, 200, 'El video no arrancó.');
  applyRate(player, desired);
  const observed = playerRate(player);
  return { duration: playerDuration(player), rate: observed > 0 ? observed : desired };
}

function listenScan(
  env: AnalyzeEnv,
  duration: number,
  desiredRate: number,
): Promise<{ peaks: number[]; playbackRate: number; tempo: { bpm: number | null; beatOffset: number | null } }> {
  const plan = planScan(duration);
  const created = createScanner(plan);
  let scanner: Scanner = created.scanner;
  if (created.seekTo != null) {
    try {
      env.player.seekTo(created.seekTo, true);
    } catch {
      /* the next ticks will notice if it never lands */
    }
    applyRate(env.player, desiredRate);
  }

  let recording = false;
  let recorder: { stop: () => Promise<Blob | null> } | null = null;
  let observedRate = desiredRate;
  let recordMedia = 0;
  let tempoPromise: Promise<{ bpm: number | null; beatOffset: number | null }> = Promise.resolve({ bpm: null, beatOffset: null });
  let stalled = 0;
  let lastTime = playerTime(env.player);
  let nudges = 0;
  let uiTicks = 0;
  let ticksSeen = 0;
  let sawPlayback = playerState(env.player) === 1;

  const peaks = new Promise<number[]>((resolve, reject) => {
    const finish = (error?: Error) => {
      env.signal.removeEventListener('abort', onAbort);
      env.ticks.set(null);
      if (error) reject(error);
      else resolve(scanner.peaks.slice());
    };
    const onAbort = () => finish(abortError());
    env.signal.addEventListener('abort', onAbort);

    const closeRecorder = () => {
      if (!recorder) return;
      const pending = recorder.stop();
      recorder = null;
      recording = false;
      const rate = observedRate > 0 ? observedRate : desiredRate;
      const anchor = recordMedia;
      tempoPromise = pending
        .then((blob) => (blob && blob.size > 800 ? estimateTempoFromBlob(blob, rate) : { bpm: null, beatOffset: null }))
        .then((read) => ({
          bpm: read.bpm,
          beatOffset: read.beatOffset == null ? null : Math.round((anchor + read.beatOffset) * 1000) / 1000,
        }))
        .catch(() => ({ bpm: null, beatOffset: null }));
    };

    env.ticks.set((tick) => {
      if (env.signal.aborted) return;
      if (env.isPaused()) return;
      const playerError = env.getError();
      if (playerError) {
        closeRecorder();
        finish(fail(playerError));
        return;
      }
      const time = playerTime(env.player);
      const state = playerState(env.player);
      ticksSeen += 1;
      if (state === 1 || time > 0.2) sawPlayback = true;
      if (Math.abs(time - lastTime) < 0.05) stalled += 1;
      else {
        stalled = 0;
        lastTime = time;
      }
      if (stalled > 280) {
        if (nudges < 2 && state !== 0) {
          nudges += 1;
          stalled = 0;
          try {
            env.player.playVideo();
          } catch {
            /* ignore */
          }
          applyRate(env.player, desiredRate);
          return;
        }
        closeRecorder();
        finish(fail('La reproducción se detuvo.'));
        return;
      }
      if (state === 2) {
        try {
          env.player.playVideo();
        } catch {
          /* ignore */
        }
      }

      const step = stepScanner(scanner, plan, time, tick.peak);
      scanner = step.scanner;
      if (scanner.phase === 'bpm') {
        const current = playerRate(env.player);
        if (current > 0) observedRate = current;
        if (!(current > 0) || Math.abs(current - desiredRate) > 0.05) applyRate(env.player, desiredRate);
        if (!recording) {
          recording = true;
          recordMedia = playerTime(env.player);
          recorder = openRecorder(env.stream);
        }
      }
      if (step.bpmJustClosed) closeRecorder();
      if (step.seekTo != null) {
        try {
          env.player.seekTo(step.seekTo, true);
        } catch {
          /* stall detection covers a seek that never lands */
        }
        applyRate(env.player, desiredRate);
      }
      uiTicks += 1;
      if (uiTicks >= 8 || step.done || step.bpmJustClosed) {
        uiTicks = 0;
        env.onProgress(step.progress);
      }
      const ended = ticksSeen > 8 && sawPlayback && state === 0 && (plan.mode === 'full' || scanner.bpmClosed);
      if (step.done || ended) {
        if (recording) closeRecorder();
        if (!step.done) scanner = { ...scanner, phase: 'done', bpmClosed: true };
        env.onProgress(1);
        finish();
      }
    });
  });

  return peaks.then(async (value) => {
    const tempo = await tempoPromise;
    return { peaks: value, playbackRate: observedRate > 0 ? observedRate : desiredRate, tempo };
  });
}

export async function analyzeVideo(videoId: string, env: AnalyzeEnv): Promise<AnalyzeResult> {
  const prepared = await preparePlayback(env, videoId);
  const scan = await listenScan(env, prepared.duration, prepared.rate);
  const tempo = await scan.tempo;
  return {
    peaks: scan.peaks,
    bpm: tempo.bpm,
    beatOffset: tempo.beatOffset,
    duration: prepared.duration,
    playbackRate: scan.playbackRate,
  };
}
