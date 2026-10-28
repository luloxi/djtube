import { describe, expect, it } from 'vitest';
import { detectRecordMode, pickSupportedMime, recordFileExt, recorderMime, recordUnavailableReason } from './record';

describe('recording mime and fallback', () => {
  it('picks the first type the recorder actually supports', () => {
    const supported = (type: string) => type === 'audio/mp4' || type === 'video/mp4';
    expect(pickSupportedMime(['video/webm', 'video/mp4'], supported)).toBe('video/mp4');
    expect(recorderMime('mic', supported)).toBe('audio/mp4');
    expect(recorderMime('display', supported)).toBe('video/mp4');
    expect(pickSupportedMime(['video/webm'], () => false)).toBeUndefined();
    expect(pickSupportedMime(['x'], undefined)).toBeUndefined();
  });

  it('names the file from the mime, and maps Android-like support', () => {
    expect(recordFileExt('video/mp4', 'display')).toBe('mp4');
    expect(recordFileExt('audio/mp4', 'mic')).toBe('m4a');
    expect(recordFileExt('audio/webm;codecs=opus', 'mic')).toBe('webm');
    expect(recordFileExt(undefined, 'display')).toBe('webm');
  });

  it('uses display when it exists, mic on coarse pointers, otherwise disabled', () => {
    expect(detectRecordMode({ mediaRecorder: true, displayMedia: true, userMedia: true, coarsePointer: true })).toBe('display');
    expect(detectRecordMode({ mediaRecorder: true, displayMedia: false, userMedia: true, coarsePointer: true })).toBe('mic');
    expect(detectRecordMode({ mediaRecorder: true, displayMedia: false, userMedia: true, coarsePointer: false })).toBe('none');
    expect(detectRecordMode({ mediaRecorder: false, displayMedia: true, userMedia: true, coarsePointer: true })).toBe('none');
    expect(recordUnavailableReason('none')).toBe('Sin captura en este navegador');
    expect(recordUnavailableReason('mic')).toBeNull();
  });
});
