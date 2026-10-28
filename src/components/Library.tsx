import { useRef, useState } from 'react';
import type { DeckId, Track } from '../types';
import { consumeDeckDrop, swipeCommit, trackIsLoaded } from '../lib/library';
import { Icon } from './icons';

type Props = {
  tracks: Track[];
  busy: boolean;
  titleDeck?: DeckId | null;
  compact?: boolean;
  keepIds?: Array<string | null | undefined>;
  onSubmit: (url: string, target: 'queue' | DeckId) => void;
  onLoad: (track: Track, deck: DeckId) => void;
  onRemove?: (track: Track) => void;
  onClear?: () => void;
};

export function Library({ tracks, busy, titleDeck = null, compact = false, keepIds = [], onSubmit, onLoad, onRemove, onClear }: Props) {
  const [url, setUrl] = useState('');

  return (
    <section className="panel" aria-label="Cola">
      <div className="panel-head">
        <h2>Cola</h2>
        {onClear ? (
          <button
            type="button"
            className="icon-button"
            disabled={busy || tracks.length === 0}
            aria-label="Vaciar cola"
            title="Vaciar cola"
            onClick={onClear}
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
      {compact ? null : (
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(url, 'queue');
          setUrl('');
        }}
      >
        <input
          data-testid="library-url"
          type="url"
          inputMode="url"
          placeholder="URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="URL de YouTube"
        />
        <div className="row">
          <button type="submit" className="icon-button" disabled={busy} aria-label="A la cola" title="A la cola">
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="icon-button letter"
            data-testid="load-deck-a"
            disabled={busy}
            aria-label="Cargar A"
            title="Cargar A"
            onClick={() => {
              onSubmit(url, 'A');
              setUrl('');
            }}
          >
            A
          </button>
          <button
            type="button"
            className="icon-button letter"
            data-testid="load-deck-b"
            disabled={busy}
            aria-label="Cargar B"
            title="Cargar B"
            onClick={() => {
              onSubmit(url, 'B');
              setUrl('');
            }}
          >
            B
          </button>
        </div>
      </form>
      )}
      <div className="list">
        {tracks.map((track) => (
          <TrackRow
            key={track.videoId}
            track={track}
            titleDeck={titleDeck}
            locked={trackIsLoaded(track.videoId, keepIds)}
            onLoad={onLoad}
            onRemove={onRemove}
          />
        ))}
      </div>
    </section>
  );
}

export function TrackRow({
  track,
  onLoad,
  onRemove,
  locked = false,
  titleDeck = null,
}: {
  track: Track;
  onLoad: (track: Track, deck: DeckId) => void;
  onRemove?: (track: Track) => void;
  locked?: boolean;
  titleDeck?: DeckId | null;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const point = useRef<{ id: number; x: number; y: number; kind: string; mode: 'undecided' | 'swipe' | 'ignore'; dx: number } | null>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);
  const suppressClick = useRef(false);
  const leaving = useRef(false);

  function shift(px: number, animate: boolean) {
    const el = rowRef.current;
    if (!el) return;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = px === 0 ? '' : `translateX(${px}px)`;
    if (px === 0) el.style.opacity = '';
  }

  function slideOut(dx: number) {
    if (!onRemove || leaving.current) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reduce) {
      onRemove(track);
      return;
    }
    leaving.current = true;
    const el = rowRef.current;
    const width = el?.getBoundingClientRect().width ?? 240;
    const target = (dx < 0 ? -1 : 1) * (width + 32);
    if (!el) {
      onRemove(track);
      return;
    }
    el.style.transition = 'none';
    const current = el.style.transform;
    el.style.transform = current || 'translateX(0)';
    requestAnimationFrame(() => {
      el.style.transition = '';
      el.style.opacity = '0';
      el.style.transform = `translateX(${target}px)`;
      window.setTimeout(() => onRemove(track), 190);
    });
  }

  function settle(dx: number) {
    if (swipeCommit(dx, locked) === 'remove') slideOut(dx);
    else shift(0, true);
  }

  return (
    <div
      ref={rowRef}
      className="track"
      draggable
      onDragStart={(event) => {
        const start = point.current;
        const kind = start?.kind ?? 'mouse';
        if (kind !== 'mouse' || start?.mode === 'swipe' || leaving.current) {
          event.preventDefault();
          return;
        }
        consumeDeckDrop();
        drag.current = { x: event.clientX, dx: 0 };
        event.dataTransfer.setData('application/x-djtube', JSON.stringify(track));
        event.dataTransfer.effectAllowed = 'copy';
        const blank = document.createElement('canvas');
        blank.width = 1;
        blank.height = 1;
        event.dataTransfer.setDragImage(blank, 0, 0);
      }}
      onDrag={(event) => {
        if (!drag.current || (event.clientX === 0 && event.clientY === 0)) return;
        drag.current.dx = event.clientX - drag.current.x;
        shift(drag.current.dx, false);
      }}
      onDragEnd={(event) => {
        const current = drag.current;
        drag.current = null;
        if (!current) return;
        const dx = event.clientX === 0 && event.clientY === 0 ? current.dx : event.clientX - current.x;
        if (Math.abs(dx) > 8) suppressClick.current = true;
        if (consumeDeckDrop()) {
          shift(0, true);
          return;
        }
        settle(dx);
      }}
      onPointerDown={(event) => {
        if (leaving.current) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        point.current = { id: event.pointerId, x: event.clientX, y: event.clientY, kind: event.pointerType, mode: 'undecided', dx: 0 };
      }}
      onPointerMove={(event) => {
        const start = point.current;
        if (!start || event.pointerId !== start.id || leaving.current || start.mode === 'ignore') return;
        if (start.kind === 'mouse') return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (start.mode === 'undecided') {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dx) <= Math.abs(dy)) {
            start.mode = 'ignore';
            return;
          }
          start.mode = 'swipe';
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        start.dx = dx;
        shift(dx, false);
      }}
      onPointerUp={(event) => {
        const start = point.current;
        if (!start || event.pointerId !== start.id) return;
        point.current = null;
        if (start.kind === 'mouse' || start.mode !== 'swipe') return;
        settle(start.dx);
      }}
      onPointerCancel={(event) => {
        const start = point.current;
        if (!start || event.pointerId !== start.id) return;
        point.current = null;
        if (start.mode === 'swipe') shift(0, true);
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <button type="button" className="track-add track-add-a" aria-label={`Cargar en deck A: ${track.title}`} title="A" onClick={() => onLoad(track, 'A')}>
        A
      </button>
      {track.thumbnail ? <img src={track.thumbnail} alt="" /> : <span className="thumb" />}
      {titleDeck ? (
        <button type="button" className="track-name" title={track.title} onClick={() => onLoad(track, titleDeck)}>
          {track.title}
        </button>
      ) : (
        <p className="track-name" title={track.title}>
          {track.title}
        </p>
      )}
      <button type="button" className="track-add track-add-b" aria-label={`Cargar en deck B: ${track.title}`} title="B" onClick={() => onLoad(track, 'B')}>
        B
      </button>
    </div>
  );
}
