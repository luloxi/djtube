import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { resizeDecks, resizeMixer, resizeQueue, type Bounds, type DeskLayout } from '../lib/layout';

export function SplitBars({
  layout,
  onLayout,
}: {
  layout: DeskLayout;
  onLayout: (layout: DeskLayout, persist: boolean) => void;
}) {
  const drag = useRef<{ kind: 'queue' | 'decks' | 'mixer'; x: number; y: number; layout: DeskLayout; bounds: Bounds; last: DeskLayout } | null>(null);

  function boundsFor(target: HTMLElement): Bounds | null {
    const surface = target.closest('.workspace')?.getBoundingClientRect();
    if (!surface || surface.width <= 0 || surface.height <= 0) return null;
    return { width: surface.width, height: surface.height };
  }

  function down(event: ReactPointerEvent<HTMLButtonElement>, kind: 'queue' | 'decks' | 'mixer') {
    const bounds = boundsFor(event.currentTarget);
    if (!bounds) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, x: event.clientX, y: event.clientY, layout, bounds, last: layout };
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { bounds } = current;
    let next = current.layout;
    if (current.kind === 'queue') {
      const queue = (event.clientX - (event.currentTarget.closest('.workspace')?.getBoundingClientRect().left ?? 0)) / bounds.width;
      next = resizeQueue(current.layout, queue, bounds);
    } else if (current.kind === 'decks') {
      const surface = event.currentTarget.closest('.workspace')?.getBoundingClientRect();
      if (!surface) return;
      const local = (event.clientX - surface.left) / surface.width;
      const rest = 1 - current.layout.queue;
      next = resizeDecks(current.layout, rest <= 0 ? current.layout.decks : (local - current.layout.queue) / rest, bounds);
    } else {
      const surface = event.currentTarget.closest('.workspace')?.getBoundingClientRect();
      if (!surface) return;
      next = resizeMixer(current.layout, (surface.bottom - event.clientY) / bounds.height, bounds);
    }
    current.last = next;
    onLayout(next, false);
  }

  function up() {
    const current = drag.current;
    drag.current = null;
    if (current) onLayout(current.last, true);
  }

  function nudge(kind: 'queue' | 'decks' | 'mixer', delta: number, target: HTMLElement) {
    const bounds = boundsFor(target);
    if (!bounds) return;
    const next =
      kind === 'queue'
        ? resizeQueue(layout, layout.queue + delta, bounds)
        : kind === 'decks'
          ? resizeDecks(layout, layout.decks + delta, bounds)
          : resizeMixer(layout, layout.mixer + delta, bounds);
    onLayout(next, true);
  }

  function onKey(event: React.KeyboardEvent<HTMLButtonElement>, kind: 'queue' | 'decks' | 'mixer') {
    const horizontal = kind !== 'mixer';
    const grow = horizontal ? event.key === 'ArrowRight' : event.key === 'ArrowUp';
    const shrink = horizontal ? event.key === 'ArrowLeft' : event.key === 'ArrowDown';
    if (!grow && !shrink) return;
    event.preventDefault();
    nudge(kind, (grow ? 1 : -1) * 0.02, event.currentTarget);
  }

  return (
    <>
      <button
        type="button"
        className="split-bar split-queue"
        aria-label="Ancho de la cola"
        title="Ancho de la cola"
        onPointerDown={(event) => down(event, 'queue')}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={(event) => onKey(event, 'queue')}
      />
      <button
        type="button"
        className="split-bar split-decks"
        aria-label="Ancho de los decks"
        title="Ancho de los decks"
        onPointerDown={(event) => down(event, 'decks')}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={(event) => onKey(event, 'decks')}
      />
      <button
        type="button"
        className="split-bar split-mixer"
        aria-label="Alto del mixer"
        title="Alto del mixer"
        onPointerDown={(event) => down(event, 'mixer')}
        onPointerMove={move}
        onPointerUp={up}
        onKeyDown={(event) => onKey(event, 'mixer')}
      />
    </>
  );
}
