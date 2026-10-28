export const DISPLAY_MIME = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
export const AUDIO_MIME = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mpeg'];

export type RecordMode = 'display' | 'mic' | 'none';

export function pickSupportedMime(candidates: readonly string[], isTypeSupported: ((type: string) => boolean) | undefined): string | undefined {
  if (!isTypeSupported) return undefined;
  return candidates.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

export function recorderMime(kind: 'display' | 'mic', isTypeSupported: ((type: string) => boolean) | undefined): string | undefined {
  return pickSupportedMime(kind === 'display' ? DISPLAY_MIME : AUDIO_MIME, isTypeSupported);
}

export function recordFileExt(mime: string | undefined, kind: RecordMode): string {
  if (mime?.includes('mp4')) return kind === 'mic' ? 'm4a' : 'mp4';
  if (mime?.includes('mpeg')) return 'mp3';
  if (kind === 'mic') return 'webm';
  return 'webm';
}

export function detectRecordMode(input: {
  mediaRecorder: boolean;
  displayMedia: boolean;
  userMedia: boolean;
  coarsePointer: boolean;
}): RecordMode {
  if (!input.mediaRecorder) return 'none';
  if (input.displayMedia) return 'display';
  if (input.userMedia && input.coarsePointer) return 'mic';
  return 'none';
}

export function recordUnavailableReason(mode: RecordMode): string | null {
  if (mode === 'none') return 'Sin captura en este navegador';
  return null;
}
