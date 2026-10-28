import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { Highlight, Track } from '../types';
import { MIN_CUT, ROW_SECONDS, defaultCutName, nearHandle, orderRange, placeOf, rowCount, rowSpans, timeAt } from '../lib/cut';
import { decodeEntities } from '../lib/html-text';
import { loadYouTubeAPI } from '../lib/youtube-api';
import { Icon } from './icons';

const ROW_H = 56;
const GAP = 4;
const STRIDE = ROW_H + GAP;
const HANDLE_PX = 20;
const EDGE_PX = 56;

export type CutDraft = { id?: string; start: number; end: number; label: string };

type Range = { start: number; end: number };
type Drag = {
  pointerId: number;
  mode: 'new' | 'start' | 'end';
  anchor: number;
  fixed: number;
  moved: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
};

export function fmtPrecise(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function fmtWhole(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

export function CutEditor({
  track,
  initial,
  cuts,
  onSave,
  onClose,
}: {
  track: Track;
  initial?: CutDraft;
  cuts: Highlight[];
  onSave: (cut: CutDraft) => void;
  onClose: () => void;
}) {
  const [duration, setDuration] = useState(0);
  const [range, setRange] = useState<Range | null>(initial ? { start: initial.start, end: initial.end } : null);
  const [head, setHead] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [name, setName] = useState(initial?.label ?? '');
  const playerRef = useRef<YT.Player | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef(0);
  const rangeRef = useRef(range);
  const previewRef = useRef(false);
  const durationRef = useRef(0);
  rangeRef.current = range;
  previewRef.current = previewing;
  durationRef.current = duration;

  const rows = rowCount(duration);
  const title = decodeEntities(track.title);
  const others = useMemo(() => cuts.filter((cut) => cut.videoId === track.videoId && cut.id !== initial?.id), [cuts, track.videoId, initial?.id]);

  useEffect(() => {
    let dead = false;
    let timer = 0;
    loadYouTubeAPI()
      .then(() => {
        const host = hostRef.current;
        if (dead || !host) return;
        const mount = document.createElement('div');
        host.appendChild(mount);
        const player = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId: track.videoId,
          playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: window.location.origin },
          events: {
            onReady: (event) => {
              if (dead) return;
              playerRef.current = event.target;
              timer = window.setInterval(() => {
                const p = playerRef.current;
                if (!p) return;
                try {
                  const total = p.getDuration();
                  if (total > 0 && total !== durationRef.current) setDuration(total);
                  const now = p.getCurrentTime();
                  setHead(now);
                  const r = rangeRef.current;
                  if (previewRef.current && r && now >= r.end) {
                    p.pauseVideo();
                    setPreviewing(false);
                    setHead(r.end);
                  }
                } catch {
                  /* the player is still settling */
                }
              }, 60);
            },
            onStateChange: (event) => {
              if (event.data === 2 || event.data === 0) setPreviewing(false);
            },
          },
        });
        playerRef.current = player;
      })
      .catch(() => undefined);
    return () => {
      dead = true;
      window.clearInterval(timer);
      cancelAnimationFrame(frameRef.current);
      try {
        playerRef.current?.destroy();
      } catch {
        /* already gone */
      }
      playerRef.current = null;
    };
  }, [track.videoId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bring the existing selection into view when editing a saved cut.
  useEffect(() => {
    if (!initial || !(duration > 0)) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, placeOf(initial.start).row * STRIDE - STRIDE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration > 0]);

  function pointTime(clientX: number, clientY: number): number {
    const lines = linesRef.current;
    if (!lines) return 0;
    const rect = lines.getBoundingClientRect();
    const row = Math.floor((clientY - rect.top) / STRIDE);
    const frac = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    return timeAt(row, frac, durationRef.current, rowCount(durationRef.current));
  }

  function apply(drag: Drag) {
    const t = pointTime(drag.x, drag.y);
    if (drag.mode === 'new') {
      if (!drag.moved) {
        if (Math.hypot(drag.x - drag.x0, drag.y - drag.y0) < 4) return;
        drag.moved = true;
      }
      setRange(orderRange(drag.anchor, t));
    } else {
      drag.moved = true;
      setRange(orderRange(drag.fixed, t));
    }
  }

  function tick() {
    const drag = dragRef.current;
    const scroller = scrollRef.current;
    if (!drag || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    let speed = 0;
    if (drag.y < rect.top + EDGE_PX) speed = -Math.min(1, (rect.top + EDGE_PX - drag.y) / EDGE_PX) * 16;
    else if (drag.y > rect.bottom - EDGE_PX) speed = Math.min(1, (drag.y - (rect.bottom - EDGE_PX)) / EDGE_PX) * 16;
    if (speed !== 0) {
      scroller.scrollTop += speed;
      apply(drag);
    }
    frameRef.current = requestAnimationFrame(tick);
  }

  function onDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!(duration > 0)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const lines = linesRef.current;
    const pps = lines && lines.clientWidth > 0 ? lines.clientWidth / ROW_SECONDS : 40;
    const t = pointTime(event.clientX, event.clientY);
    const grab = nearHandle(t, rangeRef.current, HANDLE_PX / pps);
    const current = rangeRef.current;
    dragRef.current = {
      pointerId: event.pointerId,
      mode: grab ?? 'new',
      anchor: t,
      fixed: grab && current ? (grab === 'start' ? current.end : current.start) : t,
      moved: false,
      x0: event.clientX,
      y0: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(tick);
  }

  function onMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply(drag);
  }

  function onUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    cancelAnimationFrame(frameRef.current);
    if (event.type === 'pointercancel') return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply(drag);
    if (drag.mode === 'new' && !drag.moved) {
      const t = pointTime(event.clientX, event.clientY);
      try {
        playerRef.current?.seekTo(t, true);
        setHead(t);
      } catch {
        /* player not ready */
      }
      return;
    }
    setRange((prev) => (prev && prev.end - prev.start < MIN_CUT ? null : prev));
  }

  function togglePreview() {
    const p = playerRef.current;
    const r = range;
    if (!p || !r) return;
    try {
      if (previewing) {
        p.pauseVideo();
        setPreviewing(false);
        return;
      }
      p.seekTo(r.start, true);
      p.playVideo();
      setPreviewing(true);
    } catch {
      setPreviewing(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!range) return;
    const label = name.trim() || defaultCutName(title || track.videoId, range.start);
    onSave({ id: initial?.id, start: range.start, end: range.end, label });
    setPreviewing(false);
    try {
      playerRef.current?.pauseVideo();
    } catch {
      /* ignore */
    }
    if (initial) {
      onClose();
      return;
    }
    setRange(null);
    setName('');
  }

  const spans = useMemo(() => {
    const byRow = new Map<number, Array<{ from: number; to: number; first: boolean; last: boolean }>>();
    if (range) {
      const list = rowSpans(range.start, range.end);
      list.forEach((span, index) => {
        byRow.set(span.row, [{ from: span.from, to: span.to, first: index === 0, last: index === list.length - 1 }]);
      });
    }
    return byRow;
  }, [range]);

  const bands = useMemo(() => {
    const byRow = new Map<number, Array<{ id: string; from: number; to: number; label: string; show: boolean }>>();
    for (const cut of others) {
      rowSpans(cut.start, cut.end).forEach((span, index) => {
        const list = byRow.get(span.row) ?? [];
        list.push({ id: cut.id, from: span.from, to: span.to, label: cut.label, show: index === 0 });
        byRow.set(span.row, list);
      });
    }
    return byRow;
  }, [others]);

  const headPlace = placeOf(head);
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;

  return (
    <div className="cut-editor" role="dialog" aria-label="Cortar" data-testid="cut-editor">
      <div className="cut-head">
        <button type="button" className="icon-button" aria-label="Cerrar" title="Cerrar" onClick={onClose}>
          <Icon name="x" />
        </button>
        <p className="cut-title" title={title}>
          {title}
        </p>
        <div className="cut-video" ref={hostRef} aria-hidden="true" />
      </div>
      <form className="cut-bar" onSubmit={submit}>
        <button
          type="button"
          className="icon-button tone-play"
          aria-label={previewing ? 'Pausar' : 'Escuchar selección'}
          title={previewing ? 'Pausar' : 'Escuchar selección'}
          disabled={!range}
          onClick={togglePreview}
          data-testid="cut-preview"
        >
          <Icon name={previewing ? 'pause' : 'play'} />
        </button>
        <span className="cut-time" data-testid="cut-time">
          {range ? `${fmtPrecise(range.start)} – ${fmtPrecise(range.end)} · ${(range.end - range.start).toFixed(1)}s` : '—'}
        </span>
        <input
          type="text"
          className="cut-name"
          placeholder="Nombre"
          aria-label="Nombre del corte"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          data-testid="cut-name"
        />
        <button type="submit" className="icon-button tone-cut" aria-label="Guardar corte" title="Guardar corte" disabled={!range} data-testid="cut-save">
          <Icon name="check" />
        </button>
      </form>
      <div className="cut-rows" ref={scrollRef} data-testid="cut-rows">
        {rows > 0 ? (
          <div className="cut-body">
            <div className="cut-gutter">
              {Array.from({ length: rows }, (_, i) => (
                <span key={i} style={{ height: ROW_H }}>
                  {fmtWhole(i * ROW_SECONDS)}
                </span>
              ))}
            </div>
            <div
              className="cut-lines"
              ref={linesRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onContextMenu={(event) => event.preventDefault()}
            >
              {Array.from({ length: rows }, (_, i) => {
                const mine = spans.get(i);
                const end = (i + 1) * ROW_SECONDS;
                return (
                  <div key={i} className="cut-row" style={{ height: ROW_H }} data-row={i}>
                    <span className="cut-mid">{fmtWhole(i * ROW_SECONDS + ROW_SECONDS / 2)}</span>
                    {end > duration ? <i className="cut-void" style={{ left: pct((duration - i * ROW_SECONDS) / ROW_SECONDS) }} /> : null}
                    {(bands.get(i) ?? []).map((band) => (
                      <i key={band.id} className="cut-band" style={{ left: pct(band.from), width: pct(band.to - band.from) }}>
                        {band.show ? <b>{band.label}</b> : null}
                      </i>
                    ))}
                    {mine?.map((span) => (
                      <i key="sel" className="cut-sel" data-testid="cut-sel" style={{ left: pct(span.from), width: pct(span.to - span.from) }}>
                        {span.first ? <u className="cut-handle is-start" /> : null}
                        {span.last ? <u className="cut-handle is-end" /> : null}
                      </i>
                    ))}
                    {headPlace.row === i ? <i className="cut-head-line" style={{ left: pct(headPlace.frac) }} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="cut-loading" aria-busy="true" />
        )}
      </div>
    </div>
  );
}
