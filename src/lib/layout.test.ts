import { describe, expect, it } from 'vitest';
import {
  clampLayout,
  clampWebcam,
  DEFAULT_LAYOUT,
  layoutChanged,
  moveWebcam,
  normalizeLayout,
  readLayout,
  resizeDecks,
  resizeMixer,
  resizeQueue,
  resizeWebcam,
} from './layout';

const desk = { width: 1440, height: 900 };

describe('desk layout', () => {
  it('keeps the webcam inside the desk and under its max size', () => {
    expect(clampWebcam({ x: -10, y: 90, w: 80, h: 40 })).toEqual({ x: 0, y: 60, w: 42, h: 40 });
    expect(clampWebcam({ x: 10, y: 10, w: 4, h: 4 }).w).toBe(12);
    expect(moveWebcam({ x: 2, y: 2, w: 20, h: 20 }, -10, 0).x).toBe(0);
    expect(resizeWebcam({ x: 70, y: 60, w: 24, h: 28 }, 40, 40)).toEqual({ x: 70, y: 60, w: 30, h: 40 });
  });

  it('clamps saved fractions that are larger than the desk', () => {
    const next = clampLayout({ queue: 1.4, decks: 0.9, mixer: 2, webcam: { x: 90, y: 90, w: 40, h: 40 } }, desk);
    expect(next.queue).toBeLessThan(1);
    expect(next.queue * desk.width).toBeLessThanOrEqual(desk.width - 400);
    expect(next.decks).toBeGreaterThan(0);
    expect(next.decks).toBeLessThan(1);
    expect(next.mixer).toBeLessThan(1);
    expect(next.mixer * desk.height).toBeLessThanOrEqual(desk.height - 280);
    expect(next.webcam.x + next.webcam.w).toBeLessThanOrEqual(100);
    expect(next.webcam.y + next.webcam.h).toBeLessThanOrEqual(100);
    expect(next.webcam.w).toBeLessThanOrEqual(42);
  });

  it('gives a resized queue’s space to the decks and refuses to overflow', () => {
    const grown = resizeQueue(DEFAULT_LAYOUT, 0.95, desk);
    expect(grown.queue).toBeGreaterThan(DEFAULT_LAYOUT.queue);
    expect(grown.queue).toBeLessThan(0.95);
    expect(grown.decks).toBeCloseTo(DEFAULT_LAYOUT.decks);
    const edge = resizeQueue(DEFAULT_LAYOUT, 5, { width: 800, height: 500 });
    expect(edge.queue * 800).toBeCloseTo(400);
    expect(edge.mixer * 500).toBeLessThanOrEqual(500);
  });

  it('resizes the deck split and the mixer without leaving a gap', () => {
    const decks = resizeDecks(DEFAULT_LAYOUT, 0.8, desk);
    expect(decks.decks).toBeCloseTo(0.8, 2);
    expect(decks.queue).toBeCloseTo(DEFAULT_LAYOUT.queue);
    const mixer = resizeMixer(DEFAULT_LAYOUT, 0.05, desk);
    expect(mixer.mixer * desk.height).toBeGreaterThanOrEqual(112);
    const tall = resizeMixer(DEFAULT_LAYOUT, 0.95, desk);
    expect(tall.mixer * desk.height).toBeLessThanOrEqual(desk.height - 280);
  });

  it('reads the old floating boxes, clamps them, and ignores junk', () => {
    expect(normalizeLayout(null)).toEqual(clampLayout(DEFAULT_LAYOUT, { width: 1440, height: 900 }));
    const legacy = normalizeLayout({
      queue: { x: -20, y: 0, w: 80, h: 140 },
      deckA: { x: 10, y: 0, w: 70, h: 80 },
      deckB: { x: 80, y: 0, w: 70, h: 80 },
      mixer: { x: 0, y: 40, w: 200, h: 90 },
      webcam: { x: 80, y: 80, w: 50, h: 50 },
    });
    expect(legacy.queue).toBeLessThan(0.8);
    expect(legacy.decks).toBeCloseTo(0.5);
    expect(legacy.mixer).toBeLessThan(0.9);
    expect(legacy.webcam.w).toBeLessThanOrEqual(42);
    expect(readLayout({ getItem: () => '{' })).toEqual(clampLayout(DEFAULT_LAYOUT, { width: 1440, height: 900 }));
    expect(layoutChanged(DEFAULT_LAYOUT, { ...DEFAULT_LAYOUT, queue: 0.4 })).toBe(true);
  });
});
