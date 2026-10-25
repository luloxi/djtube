import { useRef, type ReactNode } from 'react';
import { clamp01, formatPercent } from '../lib/mixer';
import { Icon } from './icons';

type Props = {
  x: number;
  gainA: number;
  gainB: number;
  volumeA: number;
  volumeB: number;
  seconds: number;
  onSeconds: (seconds: number) => void;
  onVolumeA: (volume: number) => void;
  onVolumeB: (volume: number) => void;
  onX: (x: number, fromUser: boolean) => void;
  onGlide: () => void;
  children?: ReactNode;
};

export function Transition({ x, gainA, gainB, volumeA, volumeB, seconds, onSeconds, onVolumeA, onVolumeB, onX, onGlide, children }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const glideDrag = useRef<{ y: number; value: number } | null>(null);

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const next = (clientX - rect.left) / rect.width;
    onX(Math.min(1, Math.max(0, next)), true);
  }

  return (
    <section className="mixer" aria-label="Mezcla">
      <VFader label="Volumen A" deck="A" value={volumeA} onChange={onVolumeA} />
      <div className="xfade">
        <div className="xfade-meta">
          <strong data-testid="gain-a" data-value={formatPercent(gainA)}>
            A {formatPercent(gainA)}
          </strong>
          <button type="button" className="icon-button" onClick={onGlide} title="Auto" aria-label="Auto">
            <Icon name="auto" />
          </button>
          <div
            className="glide-sec"
            data-testid="glide-seconds"
            data-value={seconds}
            role="slider"
            tabIndex={0}
            title="Segundos"
            aria-label="Segundos"
            aria-valuemin={1}
            aria-valuemax={60}
            aria-valuenow={seconds}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              glideDrag.current = { y: event.clientY, value: seconds };
            }}
            onPointerMove={(event) => {
              const drag = glideDrag.current;
              if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const delta = Math.round((drag.y - event.clientY) / 10);
              onSeconds(Math.min(60, Math.max(1, drag.value + delta)));
            }}
            onPointerUp={() => {
              glideDrag.current = null;
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
              event.preventDefault();
              event.stopPropagation();
              const delta = event.key === 'ArrowUp' ? 1 : -1;
              onSeconds(Math.min(60, Math.max(1, seconds + delta)));
            }}
          >
            {seconds}s
          </div>
          {children}
          <strong data-testid="gain-b" data-value={formatPercent(gainB)}>
            B {formatPercent(gainB)}
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
      </div>
      <VFader label="Volumen B" deck="B" value={volumeB} onChange={onVolumeB} />
    </section>
  );
}

function VFader({ label, deck, value, onChange }: { label: string; deck: 'A' | 'B'; value: number; onChange: (volume: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function setFromY(clientY: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const top = rect.top + 18;
    const bottom = rect.bottom - 18;
    const span = Math.max(1, bottom - top);
    onChange(clamp01(1 - (clientY - top) / span));
  }

  return (
    <div
      className={`vfader vfader-${deck.toLowerCase()}`}
      ref={ref}
      role="slider"
      tabIndex={0}
      title={label}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromY(event.clientY);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        setFromY(event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === 'ArrowUp' ? 0.02 : -0.02;
        onChange(clamp01(value + delta));
      }}
    >
      <span className="vfader-tag">{deck}</span>
      <span className="vfader-rail">
        <span className="vfader-fill" style={{ height: `${value * 100}%` }} />
        <span className="vfader-thumb" style={{ bottom: `${value * 100}%` }} />
      </span>
      <span className="vfader-read">{Math.round(value * 100)}</span>
    </div>
  );
}
