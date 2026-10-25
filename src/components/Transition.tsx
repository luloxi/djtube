import { useRef } from 'react';
import { formatPercent } from '../lib/mixer';

type Props = {
  x: number;
  gainA: number;
  gainB: number;
  seconds: number;
  onSeconds: (seconds: number) => void;
  onX: (x: number, fromUser: boolean) => void;
  onGlide: () => void;
};

export function Transition({ x, gainA, gainB, seconds, onSeconds, onX, onGlide }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = (clientX - rect.left) / rect.width;
    onX(Math.min(1, Math.max(0, next)), true);
  }

  return (
    <section className="fader" aria-label="Transición">
      <div className="fader-readout">
        <strong data-testid="gain-a" data-value={formatPercent(gainA)}>
          A {formatPercent(gainA)}%
        </strong>
        <span className="fader-caption">ambos al centro</span>
        <strong data-testid="gain-b" data-value={formatPercent(gainB)}>
          B {formatPercent(gainB)}%
        </strong>
      </div>
      <div
        className="fader-track"
        data-testid="crossfader"
        data-x={x.toFixed(3)}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(x * 100)}
        aria-label="Transición entre A y B"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          seekFromPointer(event.clientX);
        }}
      >
        <span className="fader-center" />
        <span className="fader-thumb" style={{ left: `${x * 100}%` }} />
      </div>
      <div className="glide">
        <button type="button" onClick={onGlide}>
          Auto
        </button>
        <label>
          <input
            data-testid="glide-seconds"
            type="number"
            min={1}
            max={60}
            value={seconds}
            onChange={(event) => onSeconds(Math.min(60, Math.max(1, Number(event.target.value) || 1)))}
          />
          s hacia el otro lado
        </label>
      </div>
    </section>
  );
}
