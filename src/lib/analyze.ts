import { beatOffsetFromOnsets, onsetTimes } from './beats';
import { correctBpmForRate, estimateBpmFromChannel, tempoSearchRange } from './bpm';

export type TempoRead = { bpm: number | null; beatOffset: number | null };

/**
 * Tempo of a capture, corrected for the playback rate the player was using.
 * `beatOffset` is track-seconds from the start of this blob (already × rate).
 */
export async function estimateTempoFromBlob(blob: Blob, playbackRate = 1): Promise<TempoRead> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    const seconds = Math.min(48, audio.duration);
    if (seconds < 2) return { bpm: null, beatOffset: null };
    const length = Math.max(1, Math.floor(seconds * audio.sampleRate));
    const mono = new Float32Array(length);
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    for (let i = 0; i < length; i += 1) mono[i] = right ? (left[i] + right[i]) * 0.5 : left[i];
    const rate = playbackRate > 0 ? playbackRate : 1;
    const onsets = onsetTimes(mono, audio.sampleRate).map((time) => time * rate);
    let heard: number | null = null;
    try {
      const { analyze } = await import('web-audio-beat-detector');
      const buffer = context.createBuffer(1, length, audio.sampleRate);
      buffer.copyToChannel(mono, 0);
      const range = tempoSearchRange(rate);
      const tempo = await analyze(buffer, range);
      if (Number.isFinite(tempo) && tempo > 0) heard = tempo;
    } catch {
      /* library found no beats — fall through */
    }
    if (heard == null) heard = estimateBpmFromChannel(mono, audio.sampleRate, { fold: false });
    const bpm = correctBpmForRate(heard, rate);
    return { bpm, beatOffset: bpm == null ? null : beatOffsetFromOnsets(onsets, bpm) };
  } catch {
    return { bpm: null, beatOffset: null };
  } finally {
    await context.close();
  }
}

/** Heard tempo, corrected for the playback rate the player was actually using. */
export async function estimateBpmFromBlob(blob: Blob, playbackRate = 1): Promise<number | null> {
  return (await estimateTempoFromBlob(blob, playbackRate)).bpm;
}
