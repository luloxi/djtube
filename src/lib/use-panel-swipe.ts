import { useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { claimsHorizontal, progress, pose, settleOpen, startIntent, type PanelSide, type SwipeIntent } from './panel-swipe';

type Options = {
  enabled: boolean;
  shell: RefObject<HTMLElement>;
  panel: RefObject<HTMLElement>;
  stage: RefObject<HTMLElement>;
  /** Which panel is open right now, as the app state says (null: both closed). */
  open: PanelSide | null;
  /** Mount this panel's pane inside the overlay. */
  showPane: (side: PanelSide) => void;
  /** The open / closed state the nav buttons light up from. */
  setOpen: (side: PanelSide | null) => void;
};

export type PanelControls = {
  /** Nav button: open this panel, or close it if it is the open one. */
  toggle: (side: PanelSide) => void;
  /** Open this panel unless it already is. */
  show: (side: PanelSide) => void;
};

const OWNS_DRAGS = '.wave-scrub, .mixer, .video-frame, .rate-picker, input, textarea, select, [role="slider"]';
const NO_BODY_START = '.track, .pl-row, input, textarea, select, [role="slider"]';
/** Full open or close from rest. Shorter distances take proportionally less, never under MIN_MS. */
const FULL_MS = 290;
const MIN_MS = 120;
const REDUCED_MS = 160;
/** The panel on its way out when another one is asked for. */
const LEAVE_FACTOR = 0.6;

type Gesture = {
  intent: SwipeIntent;
  x0: number;
  y0: number;
  x: number;
  claimed: boolean;
  width: number;
  frame: number;
  samples: { t: number; p: number }[];
};

type Tween = { from: number; to: number; t0: number; ms: number; done: () => void };

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cola comes in from the left and Buscar from the right, turning like faces of a cube. The same motion plays
 * when a finger drags it (swipe from the edge) and when a nav button is pressed. Only transform and opacity are
 * written, from one requestAnimationFrame per frame, and only while something moves: at rest nothing runs and
 * nothing is promoted to its own layer. Because the progress `p` is known every frame, an interruption (a second
 * tap, a touch) simply carries on from where the panel is, so nothing can be left half open.
 *
 * App state flips at the START of a motion (the button lights or goes dark at once). While a panel is still
 * leaving, inline `visibility: visible` keeps it on screen; the inline styles are removed when the motion ends.
 */
export function usePanelSwipe(options: Options): PanelControls {
  const latest = useRef(options);
  latest.current = options;
  const api = useRef<(PanelControls & { attach: () => () => void }) | null>(null);
  if (!api.current) api.current = createController(latest);
  const controller = api.current;

  useEffect(() => {
    if (!options.enabled || !options.shell.current) return;
    return controller.attach();
  }, [options.enabled, options.shell, controller]);

  return controller;
}

function createController(latest: { current: Options }) {
  /** The panel whose pose is being driven by inline styles right now, if any. */
  let side: PanelSide | null = null;
  let p = 0;
  let raf = 0;
  let tween: Tween | null = null;

  const layers = () => ({ panel: latest.current.panel.current, stage: latest.current.stage.current });

  function paint(s: PanelSide, q: number) {
    const { panel, stage } = layers();
    const next = pose(s, q, window.innerWidth, reducedMotion());
    if (panel) {
      panel.style.transform = next.panel;
      panel.style.opacity = String(next.panelOpacity);
    }
    if (stage) stage.style.transform = next.stage;
  }

  function begin(s: PanelSide, q: number) {
    const { panel, stage } = layers();
    for (const el of [panel, stage]) if (el) el.style.willChange = 'transform, opacity';
    if (panel) panel.style.visibility = 'visible';
    side = s;
    p = q;
    paint(s, q);
  }

  function clear() {
    const { panel, stage } = layers();
    for (const el of [panel, stage]) {
      if (!el) continue;
      el.style.willChange = '';
      el.style.transform = '';
      el.style.opacity = '';
    }
    if (panel) panel.style.visibility = '';
    side = null;
    p = 0;
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    tween = null;
  }

  /** Drop any motion and show the state the app says is current. */
  function settle() {
    stop();
    clear();
    const open = latest.current.open;
    if (open) flushSync(() => latest.current.showPane(open));
  }

  function step(now: number) {
    raf = 0;
    if (!tween || side === null) return;
    const t = Math.min(1, Math.max(0, (now - tween.t0) / tween.ms));
    const eased = 1 - Math.pow(1 - t, 3);
    p = tween.from + (tween.to - tween.from) * eased;
    paint(side, p);
    if (t < 1) {
      raf = requestAnimationFrame(step);
      return;
    }
    const done = tween.done;
    tween = null;
    done();
  }

  function run(s: PanelSide, to: number, scale: number, done: () => void) {
    stop();
    const ms = reducedMotion() ? REDUCED_MS : Math.max(MIN_MS, FULL_MS * Math.abs(to - p)) * scale;
    side = s;
    tween = { from: p, to, t0: performance.now(), ms, done };
    raf = requestAnimationFrame(step);
  }

  /** Where the panel is drawn right now: mid-motion, or at rest as the app state says. */
  function current(prev: PanelSide | null): { s: PanelSide; q: number } | null {
    if (side !== null) return { s: side, q: p };
    return prev ? { s: prev, q: 1 } : null;
  }

  function go(want: PanelSide | null) {
    const prev = latest.current.open;
    if (prev === want && side === null) return;
    const cur = current(prev);
    stop();
    flushSync(() => latest.current.setOpen(want));
    if (want === null) {
      if (!cur) return;
      begin(cur.s, cur.q);
      run(cur.s, 0, 1, settle);
      return;
    }
    if (cur && cur.s === want) {
      begin(want, cur.q);
      run(want, 1, 1, settle);
      return;
    }
    const enter = () => {
      flushSync(() => latest.current.showPane(want));
      begin(want, 0);
      run(want, 1, 1, settle);
    };
    if (cur && cur.q > 0.02) {
      // One panel leaves, then the other comes in. Never two motions at once.
      begin(cur.s, cur.q);
      run(cur.s, 0, LEAVE_FACTOR, enter);
    } else {
      clear();
      enter();
    }
  }

  const controls: PanelControls = {
    toggle: (target) => go(latest.current.open === target ? null : target),
    show: (target) => go(target),
  };

  function attach() {
    const shell = latest.current.shell.current;
    if (!shell) return () => undefined;
    let g: Gesture | null = null;

    const onStart = (event: TouchEvent) => {
      g = null;
      if (event.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (side !== null) settle(); // a touch while a button motion runs: land it, then treat the touch normally
      const touch = event.touches[0];
      const target = event.target instanceof Element ? event.target : null;
      const inPanel = !!target?.closest('.side-left');
      const intent = startIntent({
        x: touch.clientX,
        width: window.innerWidth,
        open: latest.current.open,
        blocked: !!target?.closest(OWNS_DRAGS),
        inPanelBody: inPanel && !target?.closest(NO_BODY_START),
      });
      if (!intent) return;
      g = { intent, x0: touch.clientX, y0: touch.clientY, x: touch.clientX, claimed: false, width: window.innerWidth, frame: 0, samples: [] };
    };

    const frame = () => {
      if (!g) return;
      g.frame = 0;
      const q = progress(g.intent, g.x - g.x0, g.width);
      g.samples.push({ t: performance.now(), p: q });
      if (g.samples.length > 6) g.samples.shift();
      p = q;
      paint(g.intent.side, q);
    };

    const onMove = (event: TouchEvent) => {
      if (!g) return;
      const touch = event.touches[0];
      if (!touch) return;
      g.x = touch.clientX;
      const dx = touch.clientX - g.x0;
      const dy = touch.clientY - g.y0;
      if (!g.claimed) {
        if (claimsHorizontal(dx, dy, g.intent)) {
          g.claimed = true;
          const s = g.intent.side;
          if (g.intent.action === 'open') flushSync(() => latest.current.showPane(s));
          begin(s, progress(g.intent, dx, g.width));
          g.samples = [{ t: performance.now(), p }];
        } else if (Math.abs(dy) > 12 || Math.abs(dx) > 12) {
          g = null; // vertical scroll, or sideways the wrong way: not ours
        }
        if (!g?.claimed) return;
      }
      if (!g.frame) g.frame = requestAnimationFrame(frame);
    };

    const end = (cancelled: boolean) => {
      const gesture = g;
      g = null;
      if (!gesture || !gesture.claimed) return;
      if (gesture.frame) cancelAnimationFrame(gesture.frame);
      const q = progress(gesture.intent, gesture.x - gesture.x0, gesture.width);
      const first = gesture.samples[0];
      const now = performance.now();
      const rate = !cancelled && first && now - first.t > 8 ? (q - first.p) / (now - first.t) : 0;
      const open = settleOpen(q, rate);
      const s = gesture.intent.side;
      p = q;
      flushSync(() => latest.current.setOpen(open ? s : null));
      run(s, open ? 1 : 0, 1, settle);
    };

    const onEnd = () => end(false);
    const onCancel = () => end(true);
    shell.addEventListener('touchstart', onStart, { passive: true });
    shell.addEventListener('touchmove', onMove, { passive: true });
    shell.addEventListener('touchend', onEnd, { passive: true });
    shell.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      shell.removeEventListener('touchstart', onStart);
      shell.removeEventListener('touchmove', onMove);
      shell.removeEventListener('touchend', onEnd);
      shell.removeEventListener('touchcancel', onCancel);
      stop();
      clear();
      g = null;
    };
  }

  return { ...controls, attach };
}
