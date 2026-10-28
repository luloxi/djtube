import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { moveBox, resizeBox, type PanelBox } from '../lib/layout';

export function FreeSlot({
  active,
  box,
  onBox,
  children,
}: {
  active: boolean;
  box: PanelBox;
  onBox: (box: PanelBox, persist: boolean) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ kind: 'move' | 'resize'; x: number; y: number; box: PanelBox; w: number; h: number; last: PanelBox } | null>(null);

  if (!active) return <>{children}</>;

  function down(event: ReactPointerEvent<HTMLButtonElement>, kind: 'move' | 'resize') {
    const surface = event.currentTarget.closest('.workspace')?.getBoundingClientRect();
    if (!surface || surface.width <= 0 || surface.height <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, x: event.clientX, y: event.clientY, box, w: surface.width, h: surface.height, last: box };
  }

  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = ((event.clientX - current.x) / current.w) * 100;
    const dy = ((event.clientY - current.y) / current.h) * 100;
    const next = current.kind === 'move' ? moveBox(current.box, dx, dy) : resizeBox(current.box, dx, dy);
    current.last = next;
    onBox(next, false);
  }

  function up() {
    const current = drag.current;
    drag.current = null;
    if (current) onBox(current.last, true);
  }

  return (
    <div className="slot" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}>
      <button
        type="button"
        className="slot-move"
        aria-label="Mover"
        title="Mover"
        onPointerDown={(event) => down(event, 'move')}
        onPointerMove={move}
        onPointerUp={up}
      />
      <div className="slot-body">{children}</div>
      <button
        type="button"
        className="slot-resize"
        aria-label="Tamaño"
        title="Tamaño"
        onPointerDown={(event) => down(event, 'resize')}
        onPointerMove={move}
        onPointerUp={up}
      />
    </div>
  );
}
