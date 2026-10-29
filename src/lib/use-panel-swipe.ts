import { useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { claimsHorizontal, progress, pose, settleOpen, startIntent, type PanelSide, type SwipeIntent } from './panel-swipe';

type Options = {
  enabled: boolean;
  shell: RefObject<HTMLElement>;
  panel: RefObject<HTMLElement>;
  stage: RefObject<HTMLElement>;
  /** Which panel is open right now (null: both closed). */
  open: PanelSide | null;
  /** The finger took over: make sure that panel's pane is mounted. */
  onBegin: (side: PanelSide) => void;
  /** The finger lifted: the panel ended up open or closed. */
  onSettle: (side: PanelSide, open: boolean) => void;
};

const OWNS_DRAGS = '.wave-scrub, .mixer, .video-frame, .rate-picker, input, textarea, select, [role="slider"]';
const NO_BODY_START = '.track, .pl-row, input, textarea, select, [role="slider"]';
const SETTLE_MS = 200;

type Gesture = {
  intent: SwipeIntent;
  x0: number;
  y0: number;
  x: number;
  claimed: boolean;
  width: number;
  reduced: boolean;
  frame: number;
  samples: { t: number; p: number }[];
};

/**
 * Swipe Cola in from the left edge and Buscar in from the right, like turning a cube. Only transform and
 * opacity are written, from one requestAnimationFrame per frame, and only while a finger is down. At rest
 * nothing runs and nothing is promoted to its own layer. Taps on the dock buttons keep working untouched.
 */
export function usePanelSwipe(options: Options) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    const shell = options.shell.current;
    if (!options.enabled || !shell) return;
    let g: Gesture | null = null;
    let busy = false;

    const layers = () => {
      const { panel, stage } = latest.current;
      return { panel: panel.current, stage: stage.current };
    };

    const paint = (p: number) => {
      if (!g) return;
      const { panel, stage } = layers();
      const next = pose(g.intent.side, p, g.width, g.reduced);
      if (panel) {
        panel.style.transform = next.panel;
        panel.style.opacity = String(next.panelOpacity);
      }
      if (stage) stage.style.transform = next.stage;
    };

    const current = () => (g ? progress(g.intent, g.x - g.x0, g.width) : 0);

    const frame = () => {
      if (!g) return;
      g.frame = 0;
      const p = current();
      g.samples.push({ t: performance.now(), p });
      if (g.samples.length > 6) g.samples.shift();
      paint(p);
    };

    const prepare = (on: boolean) => {
      const { panel, stage } = layers();
      for (const el of [panel, stage]) {
        if (!el) continue;
        el.style.willChange = on ? 'transform, opacity' : '';
        el.style.transition = '';
        if (!on) {
          el.style.transform = '';
          el.style.opacity = '';
        }
      }
      if (panel) {
        panel.style.visibility = on ? 'visible' : '';
        panel.style.transformOrigin = on ? 'center' : '';
      }
    };

    const finish = (open: boolean, side: PanelSide) => {
      flushSync(() => latest.current.onSettle(side, open));
      prepare(false);
      busy = false;
    };

    const end = (cancelled: boolean) => {
      const gesture = g;
      g = null;
      if (!gesture || !gesture.claimed) return;
      if (gesture.frame) cancelAnimationFrame(gesture.frame);
      const p = progress(gesture.intent, gesture.x - gesture.x0, gesture.width);
      const first = gesture.samples[0];
      const now = performance.now();
      const rate = !cancelled && first && now - first.t > 8 ? (p - first.p) / (now - first.t) : 0;
      const open = settleOpen(p, rate);
      const side = gesture.intent.side;
      busy = true;
      if (gesture.reduced) {
        finish(open, side);
        return;
      }
      const { panel, stage } = layers();
      const target = pose(side, open ? 1 : 0, gesture.width, false);
      for (const el of [panel, stage]) if (el) el.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SETTLE_MS}ms ease-out`;
      if (panel) {
        panel.style.transform = target.panel;
        panel.style.opacity = String(target.panelOpacity);
      }
      if (stage) stage.style.transform = target.stage;
      window.setTimeout(() => finish(open, side), SETTLE_MS + 30);
    };

    const onStart = (event: TouchEvent) => {
      g = null;
      if (busy || event.touches.length !== 1) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
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
      g = {
        intent,
        x0: touch.clientX,
        y0: touch.clientY,
        x: touch.clientX,
        claimed: false,
        width: window.innerWidth,
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        frame: 0,
        samples: [],
      };
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
          const side = g.intent.side;
          if (g.intent.action === 'open') flushSync(() => latest.current.onBegin(side));
          prepare(true);
          g.samples = [{ t: performance.now(), p: progress(g.intent, dx, g.width) }];
        } else if (Math.abs(dy) > 12 || Math.abs(dx) > 12) {
          g = null; // vertical scroll, or sideways the wrong way: not ours
        }
        if (!g?.claimed) return;
      }
      if (!g.frame) g.frame = requestAnimationFrame(frame);
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
      if (g?.claimed) prepare(false);
      g = null;
    };
  }, [options.enabled, options.shell]);
}
