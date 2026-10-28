export type PanelBox = { x: number; y: number; w: number; h: number };

/** Fractions of the desk. `decks` is deck A's share of the pair, not of the whole width. */
export type DeskLayout = {
  queue: number;
  decks: number;
  mixer: number;
  webcam: PanelBox;
};

export const LAYOUT_KEY = 'djtube-layout';

export type Bounds = { width: number; height: number };

const MIN_QUEUE = 168;
const MIN_DECK = 200;
const MIN_MIXER = 112;
const MIN_DECK_ROW = 280;

const WEBCAM_MIN = 12;
const WEBCAM_MAX_W = 42;
const WEBCAM_MAX_H = 48;

export const DEFAULT_LAYOUT: DeskLayout = {
  queue: 0.22,
  decks: 0.5,
  mixer: 0.32,
  webcam: { x: 70, y: 6, w: 24, h: 28 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function clampWebcam(box: PanelBox): PanelBox {
  const w = clamp(box.w, WEBCAM_MIN, WEBCAM_MAX_W);
  const h = clamp(box.h, WEBCAM_MIN, WEBCAM_MAX_H);
  return {
    x: clamp(box.x, 0, 100 - w),
    y: clamp(box.y, 0, 100 - h),
    w,
    h,
  };
}

export function moveWebcam(box: PanelBox, dx: number, dy: number): PanelBox {
  const safe = clampWebcam(box);
  return clampWebcam({ ...safe, x: safe.x + dx, y: safe.y + dy });
}

export function resizeWebcam(box: PanelBox, dw: number, dh: number): PanelBox {
  const safe = clampWebcam(box);
  return {
    x: safe.x,
    y: safe.y,
    w: clamp(safe.w + dw, WEBCAM_MIN, Math.min(WEBCAM_MAX_W, 100 - safe.x)),
    h: clamp(safe.h + dh, WEBCAM_MIN, Math.min(WEBCAM_MAX_H, 100 - safe.y)),
  };
}

function axisMins(total: number, parts: number[]): number[] {
  const sum = parts.reduce((acc, part) => acc + part, 0);
  if (sum <= total || sum <= 0) return parts;
  const scale = total / sum;
  return parts.map((part) => part * scale);
}

/** Keep every region inside the desk, in pixels, including after the window changes size. */
export function clampLayout(layout: DeskLayout, bounds: Bounds): DeskLayout {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const [qMin, dMin] = axisMins(width, [MIN_QUEUE, MIN_DECK * 2]);
  const deckMin = dMin / 2;
  const [mMin, rowMin] = axisMins(height, [MIN_MIXER, MIN_DECK_ROW]);

  const queuePx = clamp(layout.queue * width, qMin, Math.max(qMin, width - deckMin * 2));
  const mixerPx = clamp(layout.mixer * height, mMin, Math.max(mMin, height - rowMin));
  const decks = clamp(layout.decks, deckMin / Math.max(1, width - queuePx), 1 - deckMin / Math.max(1, width - queuePx));

  return {
    queue: queuePx / width,
    decks,
    mixer: mixerPx / height,
    webcam: clampWebcam(layout.webcam),
  };
}

export function resizeQueue(layout: DeskLayout, queue: number, bounds: Bounds): DeskLayout {
  return clampLayout({ ...layout, queue }, bounds);
}

export function resizeDecks(layout: DeskLayout, decks: number, bounds: Bounds): DeskLayout {
  return clampLayout({ ...layout, decks }, bounds);
}

export function resizeMixer(layout: DeskLayout, mixer: number, bounds: Bounds): DeskLayout {
  return clampLayout({ ...layout, mixer }, bounds);
}

function boxOf(value: unknown): PanelBox | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const box = { x: Number(raw.x), y: Number(raw.y), w: Number(raw.w), h: Number(raw.h) };
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  return box;
}

function legacyLayout(source: Record<string, unknown>): DeskLayout | null {
  const queue = boxOf(source.queue);
  const deckA = boxOf(source.deckA);
  const deckB = boxOf(source.deckB);
  const mixer = boxOf(source.mixer);
  if (!queue && !deckA && !mixer) return null;
  const pair = (deckA?.w ?? 0) + (deckB?.w ?? 0);
  return {
    queue: queue ? queue.w / 100 : DEFAULT_LAYOUT.queue,
    decks: pair > 0 && deckA ? deckA.w / pair : DEFAULT_LAYOUT.decks,
    mixer: mixer ? mixer.h / 100 : DEFAULT_LAYOUT.mixer,
    webcam: boxOf(source.webcam) ?? DEFAULT_LAYOUT.webcam,
  };
}

export function normalizeLayout(value: unknown, bounds: Bounds = { width: 1440, height: 900 }): DeskLayout {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const directQueue = finite(source.queue);
  const directDecks = finite(source.decks);
  const directMixer = finite(source.mixer);
  const modern = directQueue != null && directDecks != null && directMixer != null;
  const base = modern
    ? {
        queue: directQueue,
        decks: directDecks,
        mixer: directMixer,
        webcam: boxOf(source.webcam) ?? DEFAULT_LAYOUT.webcam,
      }
    : (legacyLayout(source) ?? { ...DEFAULT_LAYOUT });
  return clampLayout(base, bounds);
}

export function readLayout(
  storage: { getItem(key: string): string | null } | null,
  bounds?: Bounds,
): DeskLayout {
  if (!storage) return clampLayout(DEFAULT_LAYOUT, bounds ?? { width: 1440, height: 900 });
  try {
    const raw = storage.getItem(LAYOUT_KEY);
    if (!raw) return clampLayout(DEFAULT_LAYOUT, bounds ?? { width: 1440, height: 900 });
    return normalizeLayout(JSON.parse(raw), bounds);
  } catch {
    return clampLayout(DEFAULT_LAYOUT, bounds ?? { width: 1440, height: 900 });
  }
}

export function storeLayout(
  storage: { setItem(key: string, value: string): void } | null,
  layout: DeskLayout,
  bounds?: Bounds,
): void {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_KEY, JSON.stringify(bounds ? clampLayout(layout, bounds) : normalizeLayout(layout)));
  } catch {
    /* private mode */
  }
}

export function layoutChanged(a: DeskLayout, b: DeskLayout): boolean {
  const close = (left: number, right: number) => Math.abs(left - right) > 0.0005;
  return (
    close(a.queue, b.queue) ||
    close(a.decks, b.decks) ||
    close(a.mixer, b.mixer) ||
    close(a.webcam.x, b.webcam.x) ||
    close(a.webcam.y, b.webcam.y) ||
    close(a.webcam.w, b.webcam.w) ||
    close(a.webcam.h, b.webcam.h)
  );
}
