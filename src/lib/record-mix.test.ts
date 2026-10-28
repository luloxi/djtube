import { describe, expect, it } from 'vitest';
import { captureFallback, captureKind } from './record-mix';

describe('record mix', () => {
  it('does not open a second mic when the voice is already live', () => {
    expect(captureKind('mic', true)).toBe('voice');
    expect(captureKind('mic', false)).toBe('mic');
    expect(captureKind('display', true)).toBe('display');
    expect(captureKind('none', true)).toBe('none');
  });

  it('falls back to the live voice when display capture is cancelled', () => {
    expect(captureFallback(true, false)).toBe('voice');
    expect(captureFallback(false, true)).toBe('mic');
    expect(captureFallback(false, false)).toBe('none');
  });
});
