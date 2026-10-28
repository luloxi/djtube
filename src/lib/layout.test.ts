import { describe, expect, it } from 'vitest';
import { clampBox, DEFAULT_LAYOUT, moveBox, normalizeLayout, readLayout, resizeBox } from './layout';

describe('desk layout', () => {
  it('keeps a panel inside the surface', () => {
    expect(clampBox({ x: -10, y: 90, w: 80, h: 40 })).toEqual({ x: 0, y: 60, w: 80, h: 40 });
    expect(clampBox({ x: 10, y: 10, w: 4, h: 4 }).w).toBe(14);
    expect(moveBox({ x: 2, y: 2, w: 20, h: 20 }, -10, 0).x).toBe(0);
    expect(resizeBox({ x: 80, y: 80, w: 20, h: 20 }, 40, 10)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });

  it('fills missing panels from the default and ignores junk', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    const next = normalizeLayout({ deckA: { x: 10, y: 10, w: 30, h: 30 }, nope: { x: 1 } });
    expect(next.deckA).toEqual({ x: 10, y: 10, w: 30, h: 30 });
    expect(next.queue).toEqual(DEFAULT_LAYOUT.queue);
    const storage = { getItem: () => '{', };
    expect(readLayout(storage)).toEqual(DEFAULT_LAYOUT);
  });
});
