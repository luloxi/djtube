import { describe, expect, it } from 'vitest';
import { claimsHorizontal, EDGE_PX, pose, progress, settleOpen, startIntent } from './panel-swipe';

const W = 390;
const base = { width: W, open: null, blocked: false, inPanelBody: false } as const;

describe('panel swipe', () => {
  it('opens from the edges only, and not over controls that own horizontal drags', () => {
    expect(startIntent({ ...base, x: 5 })).toEqual({ side: 'queue', action: 'open' });
    expect(startIntent({ ...base, x: W - 5 })).toEqual({ side: 'search', action: 'open' });
    expect(startIntent({ ...base, x: W / 2 })).toBeNull();
    expect(startIntent({ ...base, x: EDGE_PX + 1 })).toBeNull();
    expect(startIntent({ ...base, x: 5, blocked: true })).toBeNull();
  });

  it('closes back the way the panel came, from the body or the far edge', () => {
    expect(startIntent({ ...base, open: 'queue', x: 200, inPanelBody: true })).toEqual({ side: 'queue', action: 'close' });
    expect(startIntent({ ...base, open: 'queue', x: 200 })).toBeNull();
    expect(startIntent({ ...base, open: 'queue', x: W - 3 })).toEqual({ side: 'queue', action: 'close' });
    expect(startIntent({ ...base, open: 'search', x: 3 })).toEqual({ side: 'search', action: 'close' });
    expect(startIntent({ ...base, open: 'search', x: 200, inPanelBody: true })).toEqual({ side: 'search', action: 'close' });
  });

  it('claims only clear sideways moves in the right direction', () => {
    const openQueue = { side: 'queue', action: 'open' } as const;
    expect(claimsHorizontal(20, 4, openQueue)).toBe(true);
    expect(claimsHorizontal(-20, 4, openQueue)).toBe(false);
    expect(claimsHorizontal(20, 30, openQueue)).toBe(false);
    expect(claimsHorizontal(5, 0, openQueue)).toBe(false);
    expect(claimsHorizontal(-20, 2, { side: 'search', action: 'open' })).toBe(true);
    expect(claimsHorizontal(-20, 2, { side: 'queue', action: 'close' })).toBe(true);
    expect(claimsHorizontal(20, 2, { side: 'search', action: 'close' })).toBe(true);
  });

  it('maps finger travel to progress', () => {
    const openQueue = { side: 'queue', action: 'open' } as const;
    expect(progress(openQueue, 0, W)).toBe(0);
    expect(progress(openQueue, 1000, W)).toBe(1);
    expect(progress(openQueue, -50, W)).toBe(0);
    const closeQueue = { side: 'queue', action: 'close' } as const;
    expect(progress(closeQueue, 0, W)).toBe(1);
    expect(progress(closeQueue, -1000, W)).toBe(0);
    expect(progress({ side: 'search', action: 'open' }, -1000, W)).toBe(1);
  });

  it('settles by distance or flick', () => {
    expect(settleOpen(0.6, 0)).toBe(true);
    expect(settleOpen(0.4, 0)).toBe(false);
    expect(settleOpen(0.2, 0.003)).toBe(true);
    expect(settleOpen(0.8, -0.003)).toBe(false);
  });

  it('only uses transform and opacity, and drops the rotation for reduced motion', () => {
    const turn = pose('queue', 0.5, W, false);
    expect(turn.panel).toContain('rotateY');
    expect(turn.stage).toContain('rotateY');
    const flat = pose('search', 0.5, W, true);
    expect(flat.panel).not.toContain('rotateY');
    expect(pose('queue', 1, W, false).panel).toContain('translate3d(0px');
  });
});
