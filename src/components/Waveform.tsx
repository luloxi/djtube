import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import WaveSurfer from 'wavesurfer.js';

type Props = {
  peaks: number[] | null;
  duration: number;
  time: number;
  color: string;
  progress: string;
  /** Press, drag and release on the wave: the deck scrubs there and keeps the release point. */
  onScrub: (phase: 'start' | 'move' | 'end', seconds: number) => void;
};

/** Pixels a finger must travel sideways on the timeline before it starts scrubbing. */
const TOUCH_SLOP = 10;

export function Waveform({ peaks, duration, time, color, progress, onScrub }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const scrubRef = useRef(onScrub);
  const dragRef = useRef<{ pointerId: number; last: number; started: boolean; x0: number } | null>(null);
  scrubRef.current = onScrub;

  const peaksRef = useRef(peaks);
  peaksRef.current = peaks;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !(duration > 0)) return;
    const initial = peaksRef.current;
    const shown = initial?.length ? initial : placeholder(800);
    let ws: WaveSurfer;
    try {
      ws = WaveSurfer.create({
        container: host,
        height: Math.max(8, host.clientHeight || 48),
        waveColor: color,
        progressColor: progress,
        cursorColor: '#f4efe6',
        cursorWidth: 2,
        barWidth: 2,
        barGap: 1,
        barRadius: 1,
        normalize: Boolean(initial?.length),
        interact: false,
        dragToSeek: false,
        hideScrollbar: true,
        autoScroll: false,
        autoCenter: false,
        backend: 'WebAudio',
        peaks: [shown],
        duration,
      });
    } catch {
      return;
    }
    ws.on('error', () => undefined);
    wsRef.current = ws;
    let fitted = 0;
    const fit = () => {
      const next = Math.floor(host.clientHeight);
      if (next < 8 || next === fitted) return;
      fitted = next;
      ws.setOptions({ height: next });
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    fit();
    return () => {
      observer.disconnect();
      wsRef.current = null;
      ws.destroy();
    };
  }, [duration, color, progress]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !(duration > 0)) return;
    const shown = peaks?.length ? peaks : placeholder(800);
    ws.setOptions({ normalize: Boolean(peaks?.length) });
    ws.load('', [shown], duration).catch(() => undefined);
  }, [peaks, duration]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || !(duration > 0)) return;
    try {
      ws.setTime(Math.min(time, duration));
    } catch {
      /* playhead waits until the waveform is ready */
    }
  }, [time, duration]);

  function secondsAt(event: ReactPointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.min(fraction * duration, Math.max(0, duration - 0.05));
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    // A touch that never turned into a drag was a tap: it must not move the song.
    if (!drag.started) return;
    scrubRef.current('end', event.type === 'pointercancel' ? drag.last : secondsAt(event));
  }

  return (
    <>
      <div className="wave" ref={hostRef} data-testid="waveform" />
      <div
        className="wave-scrub"
        data-testid="wave-scrub"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const seconds = secondsAt(event);
          // Mouse scrubs on press. Touch needs a deliberate sideways drag, so a stray tap can't wreck the mix.
          const deliberate = event.pointerType === 'touch';
          dragRef.current = { pointerId: event.pointerId, last: seconds, started: !deliberate, x0: event.clientX };
          if (!deliberate) scrubRef.current('start', seconds);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          drag.last = secondsAt(event);
          if (!drag.started) {
            if (Math.abs(event.clientX - drag.x0) < TOUCH_SLOP) return;
            drag.started = true;
            scrubRef.current('start', drag.last);
          }
          scrubRef.current('move', drag.last);
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(event) => event.preventDefault()}
      />
    </>
  );
}

function placeholder(count: number): number[] {
  return new Array(count).fill(0.08);
}
