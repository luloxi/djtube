/** Pure rules for opening and closing the Cola / Buscar panels with a horizontal swipe on touch screens. */

export type PanelSide = 'queue' | 'search';
export type SwipeAction = 'open' | 'close';
export type SwipeIntent = { side: PanelSide; action: SwipeAction };

/** Width of the screen-edge strip where an opening swipe may start. */
export const EDGE_PX = 24;
/** A flick faster than this (progress per millisecond) decides the outcome regardless of distance. */
export const FLICK = 0.0012;

/** Cola waits on the left of the decks, Buscar on the right. -1: it enters from the left. */
export function entersFrom(side: PanelSide): -1 | 1 {
  return side === 'queue' ? -1 : 1;
}

export function startIntent(input: {
  x: number;
  width: number;
  open: PanelSide | null;
  /** The finger landed on something that owns horizontal drags (waveform, mixer, jog, inputs). */
  blocked: boolean;
  /** Closing may also start in the middle of a panel, away from rows that swipe to remove. */
  inPanelBody: boolean;
}): SwipeIntent | null {
  const { x, width, open, blocked, inPanelBody } = input;
  if (width <= 0) return null;
  const left = x <= EDGE_PX;
  const right = x >= width - EDGE_PX;
  if (open === null) {
    if (blocked) return null;
    if (left) return { side: 'queue', action: 'open' };
    if (right) return { side: 'search', action: 'open' };
    return null;
  }
  // Closing swipes go back the way the panel came: Cola leaves to the left, Buscar to the right.
  if (open === 'queue' && (inPanelBody || right)) return { side: 'queue', action: 'close' };
  if (open === 'search' && (inPanelBody || left)) return { side: 'search', action: 'close' };
  return null;
}

/** Finger travel that moves a panel fully in or out. */
export function travel(width: number): number {
  return Math.max(120, width * 0.85);
}

/** Sign the finger must move in: +1 right, -1 left. */
export function wantedSign(intent: SwipeIntent): -1 | 1 {
  const toward = entersFrom(intent.side) === -1 ? 1 : -1; // opening Cola: finger goes right
  return intent.action === 'open' ? toward : (-toward as -1 | 1);
}

/** True once the finger has clearly gone sideways in the right direction, not up or down. */
export function claimsHorizontal(dx: number, dy: number, intent: SwipeIntent): boolean {
  if (Math.abs(dx) < 8) return false;
  if (Math.abs(dx) < Math.abs(dy) * 1.4) return false;
  return Math.sign(dx) === wantedSign(intent);
}

/** 0 closed … 1 open for the current finger offset. */
export function progress(intent: SwipeIntent, dx: number, width: number): number {
  const along = (dx * wantedSign(intent)) / travel(width);
  const moved = Math.min(1, Math.max(0, along));
  return intent.action === 'open' ? moved : 1 - moved;
}

/** Whether the panel ends up open once the finger lifts. `rate` is progress per ms (positive = opening). */
export function settleOpen(p: number, rate: number): boolean {
  if (rate > FLICK) return true;
  if (rate < -FLICK) return false;
  return p >= 0.5;
}

export type Pose = { panel: string; stage: string; panelOpacity: number };

/**
 * Cube-like turn: the panel swings in from its side while the decks swing away the other way.
 * Only transform and opacity change, so it stays on the compositor. With reduced motion it is a plain slide.
 */
export function pose(side: PanelSide, p: number, width: number, reduced: boolean): Pose {
  const dir = entersFrom(side);
  const q = Math.min(1, Math.max(0, p));
  const panelX = dir * (1 - q) * width;
  const stageX = -dir * q * width * 0.5;
  if (reduced) {
    return { panel: `translate3d(${panelX}px,0,0)`, stage: `translate3d(${stageX}px,0,0)`, panelOpacity: 0.3 + 0.7 * q };
  }
  const panelAngle = dir * (1 - q) * 60;
  const stageAngle = -dir * q * 45;
  return {
    panel: `perspective(1100px) translate3d(${panelX}px,0,0) rotateY(${panelAngle}deg)`,
    stage: `perspective(1100px) translate3d(${stageX}px,0,0) rotateY(${stageAngle}deg)`,
    panelOpacity: 0.3 + 0.7 * q,
  };
}
