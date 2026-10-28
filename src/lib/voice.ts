/** Semitones → playback ratio. Clamped to an octave either way. */
export function pitchRatio(semitones: number): number {
  const clamped = Math.max(-12, Math.min(12, Math.round(semitones)));
  return 2 ** (clamped / 12);
}

/** Exponential decay used by the generated reverb impulse. */
export function impulseEnvelope(index: number, length: number, decay: number): number {
  if (!(length > 1) || !(decay > 0)) return 0;
  const t = Math.min(1, Math.max(0, index / (length - 1)));
  return (1 - t) ** decay;
}

export function makeImpulse(ctx: AudioContext, seconds = 1.6, decay = 2.4): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * impulseEnvelope(i, length, decay);
  }
  return buffer;
}

export type VoiceSession = {
  stream: MediaStream;
  context: AudioContext;
  setSemitones: (semitones: number) => void;
  setVolume: (value: number) => void;
  setReverb: (amount: number) => void;
  stop: () => void;
};

export async function startVoice(): Promise<VoiceSession> {
  const context = new AudioContext();
  await context.resume();
  await context.audioWorklet.addModule('/pitch-worklet.js');
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    video: false,
  });
  const source = context.createMediaStreamSource(mic);
  const pitch = new AudioWorkletNode(context, 'djtube-pitch');
  const dry = context.createGain();
  const wet = context.createGain();
  const volume = context.createGain();
  const convolver = context.createConvolver();
  convolver.buffer = makeImpulse(context);
  dry.gain.value = 1;
  wet.gain.value = 0;
  volume.gain.value = 0.8;
  const dest = context.createMediaStreamDestination();
  source.connect(pitch);
  pitch.connect(dry);
  pitch.connect(convolver);
  convolver.connect(wet);
  dry.connect(volume);
  wet.connect(volume);
  volume.connect(dest);
  volume.connect(context.destination);
  const setSemitones = (semitones: number) => {
    pitch.port.postMessage({ ratio: pitchRatio(semitones) });
  };
  setSemitones(0);
  return {
    stream: dest.stream,
    context,
    setSemitones,
    setVolume(value: number) {
      volume.gain.value = Math.min(1, Math.max(0, value));
    },
    setReverb(amount: number) {
      const wetAmount = Math.min(1, Math.max(0, amount));
      wet.gain.value = wetAmount;
      dry.gain.value = 1 - wetAmount * 0.65;
    },
    stop() {
      mic.getTracks().forEach((track) => track.stop());
      try {
        source.disconnect();
        pitch.disconnect();
        volume.disconnect();
      } catch {
        /* already stopped */
      }
      void context.close();
    },
  };
}
