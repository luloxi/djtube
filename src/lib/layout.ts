export type PanelId = 'queue' | 'deckA' | 'deckB' | 'mixer' | 'webcam';

export type PanelBox = { x: number; y: number; w: number; h: number };

export type DeskLayout = Record<PanelId, PanelBox>;

export const LAYOUT_KEY = 'djtube-layout';
export const PANELS: readonly PanelId[] = ['queue', 'deckA', 'deckB', 'mixer', 'webcam'];

const MIN = 14;

export const DEFAULT_LAYOUT: DeskLayout = {
  queue: { x: 0, y: 0, w: 22, h: 100 },
  deckA: { x: 22, y: 0, w: 39, h: 68 },
  deckB: { x: 61, y: 0, w: 39, h: 68 },
  mixer: { x: 22, y: 68, w: 78, h: 32 },
  webcam: { x: 70, y: 6, w: 24, h: 28 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampBox(box: PanelBox): PanelBox {
  const w = clamp(box.w, MIN, 100);
  const h = clamp(box.h, MIN, 100);
  return {
    x: clamp(box.x, 0, 100 - w),
    y: clamp(box.y, 0, 100 - h),
    w,
    h,
  };
}

export function moveBox(box: PanelBox, dx: number, dy: number): PanelBox {
  const safe = clampBox(box);
  return {
    ...safe,
    x: clamp(safe.x + dx, 0, 100 - safe.w),
    y: clamp(safe.y + dy, 0, 100 - safe.h),
  };
}

export function resizeBox(box: PanelBox, dw: number, dh: number): PanelBox {
  const safe = clampBox(box);
  return {
    x: safe.x,
    y: safe.y,
    w: clamp(safe.w + dw, MIN, 100 - safe.x),
    h: clamp(safe.h + dh, MIN, 100 - safe.y),
  };
}

function finiteBox(value: unknown): PanelBox | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const box = { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) };
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  return clampBox(box);
}

export function normalizeLayout(value: unknown): DeskLayout {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const next = { ...DEFAULT_LAYOUT };
  for (const id of PANELS) {
    const box = finiteBox(source[id]);
    if (box) next[id] = box;
  }
  return next;
}

export function readLayout(storage: { getItem(key: string): string | null } | null): DeskLayout {
  if (!storage) return DEFAULT_LAYOUT;
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function storeLayout(storage: { setItem(key: string, value: string): void } | null, layout: DeskLayout): void {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(normalizeLayout(layout)));
  } catch {
    /* private mode */
  }
}
