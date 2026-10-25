import { estimateBpmFromChannel, foldToRange } from './bpm';
import { maxPeak, paintPeaks, PEAK_BUCKETS } from './peaks';

export type CaptureResult = {
  peaks: number[];
  bpm: number | null;
  blob: Blob | null;
  recordStart: number;
  recordEnd: number;
  duration: number;
  warning?: string;
};

type DisplayCapture = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
};

function audioMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function abortError(): DOMException {
  return new DOMException('aborted', 'AbortError');
}

async function estimateBpm(blob: Blob): Promise<number | null> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const seconds = Math.min(48, audio.duration);
    if (seconds < 2) return null;
    const length = Math.max(1, Math.floor(seconds * audio.sampleRate));
    const mono = new Float32Array(length);
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    for (let i = 0; i < length; i += 1) mono[i] = right ? (left[i] + right[i]) * 0.5 : left[i];
    try {
      const { analyze } = await import('web-audio-beat-detector');
      const buffer = context.createBuffer(1, length, audio.sampleRate);
      buffer.copyToChannel(mono, 0);
      const tempo = await analyze(buffer, { minTempo: 80, maxTempo: 170 });
      if (Number.isFinite(tempo) && tempo > 0) return foldToRange(tempo);
    } catch {
      /* library found no beats — fall through */
    }
    return estimateBpmFromChannel(mono, audio.sampleRate);
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

export async function captureDeck(options: {
  player: YT.Player;
  signal: AbortSignal;
  initialPeaks: number[] | null;
  onPeaks: (peaks: number[], duration: number) => void;
}): Promise<CaptureResult> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Este navegador no puede capturar la pestaña.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayCapture);
  if (options.signal.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    throw abortError();
  }
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('La captura no trajo audio. En el diálogo, marca compartir el audio de esta pestaña.');
  }

  const recordStart = safeTime(options.player);
  const audioStream = new MediaStream(audioTracks);
  const mime = audioMime();
  const recorder = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
  });

  const context = new AudioContext();
  const source = context.createMediaStreamSource(audioStream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const timeDomain = new Float32Array(analyser.fftSize);

  let peaks = options.initialPeaks?.length === PEAK_BUCKETS ? options.initialPeaks.slice() : new Array<number>(PEAK_BUCKETS).fill(0);
  let lastTime = recordStart;
  let lastPaint = 0;

  recorder.start(1000);

  let timer = 0;
  let resolveStop: () => void = () => undefined;
  const finish = async (reason?: string) => {
    window.clearInterval(timer);
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    const blob = await stopped;
    const recordEnd = safeTime(options.player);
    const duration = safeDuration(options.player);
    source.disconnect();
    await context.close();
    const bpm = blob.size > 800 ? await estimateBpm(blob) : null;
    const quiet = maxPeak(peaks) < 0.008;
    return {
      peaks,
      bpm,
      blob: blob.size ? blob : null,
      recordStart,
      recordEnd: Math.max(recordEnd, recordStart),
      duration,
      warning: reason ?? (quiet ? 'No llegó audio. Vuelve a analizar y comparte el audio de la pestaña.' : undefined),
    } satisfies CaptureResult;
  };

  timer = window.setInterval(() => {
    if (options.signal.aborted) return;
    analyser.getFloatTimeDomainData(timeDomain);
    let level = 0;
    for (let i = 0; i < timeDomain.length; i += 1) {
      const value = Math.abs(timeDomain[i]);
      if (value > level) level = value;
    }
    const now = safeTime(options.player);
    const duration = safeDuration(options.player);
    if (duration > 0) {
      peaks = paintPeaks(peaks, lastTime, now, duration, level);
      lastTime = now;
      if (performance.now() - lastPaint > 180) {
        lastPaint = performance.now();
        options.onPeaks(peaks.slice(), duration);
      }
    }
    const state = safeState(options.player);
    if (state === 0) {
      window.clearInterval(timer);
      resolveStop();
    }
  }, 80);

  const ended = new Promise<void>((resolve) => {
    resolveStop = resolve;
    const onAbort = () => resolve();
    options.signal.addEventListener('abort', onAbort, { once: true });
    for (const track of stream.getTracks()) track.addEventListener('ended', onAbort, { once: true });
  });

  await ended;
  return finish();
}

function safeTime(player: YT.Player): number {
  try {
    return player.getCurrentTime() || 0;
  } catch {
    return 0;
  }
}

function safeDuration(player: YT.Player): number {
  try {
    return player.getDuration() || 0;
  } catch {
    return 0;
  }
}

function safeState(player: YT.Player): number {
  try {
    return player.getPlayerState();
  } catch {
    return -1;
  }
}
