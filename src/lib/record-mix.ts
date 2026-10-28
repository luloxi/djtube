import type { RecordMode } from './record';

export type CaptureKind = 'display' | 'mic' | 'voice' | 'none';

/** What to open when a take starts. A live voice mic is not opened a second time. */
export function captureKind(mode: RecordMode, voiceLive: boolean): CaptureKind {
  if (mode === 'none') return 'none';
  if (mode === 'display') return 'display';
  return voiceLive ? 'voice' : 'mic';
}

/** Display capture was cancelled. Use the voice mic if it is already live. */
export function captureFallback(voiceLive: boolean, canMic: boolean): CaptureKind {
  if (voiceLive) return 'voice';
  return canMic ? 'mic' : 'none';
}

/** Mix the processed voice into whatever is being recorded, without stopping the mic when the take ends. */
export function mixForRecorder(
  base: MediaStream | null,
  voice: MediaStream | null,
  ctx: AudioContext,
): { stream: MediaStream; release: () => void; attachVoice: (next: MediaStream | null) => void } {
  const video = base?.getVideoTracks() ?? [];
  const baseAudio = base?.getAudioTracks() ?? [];
  const dest = ctx.createMediaStreamDestination();
  const nodes: AudioNode[] = [];
  let voiceSource: MediaStreamAudioSourceNode | null = null;
  if (baseAudio.length) {
    const src = ctx.createMediaStreamSource(new MediaStream(baseAudio));
    src.connect(dest);
    nodes.push(src);
  }
  function attachVoice(next: MediaStream | null) {
    if (voiceSource) {
      try {
        voiceSource.disconnect();
      } catch {
        /* already released */
      }
      voiceSource = null;
    }
    const tracks = next?.getAudioTracks().filter((track) => track.readyState === 'live') ?? [];
    if (!tracks.length) return;
    voiceSource = ctx.createMediaStreamSource(new MediaStream(tracks));
    voiceSource.connect(dest);
  }
  attachVoice(voice);
  return {
    stream: new MediaStream([...video, ...dest.stream.getAudioTracks()]),
    attachVoice,
    release() {
      if (voiceSource) {
        try {
          voiceSource.disconnect();
        } catch {
          /* already released */
        }
        voiceSource = null;
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          /* already released */
        }
      }
    },
  };
}
