import type { Highlight } from '../types';

const VIDEO_ID = /^[\w-]{11}$/;

export function addHighlight(list: Highlight[], highlight: Highlight): Highlight[] {
  return [highlight, ...list.filter((item) => item.id !== highlight.id)];
}

export function removeHighlight(list: Highlight[], id: string): Highlight[] {
  return list.filter((item) => item.id !== id);
}

export function renameHighlight(list: Highlight[], id: string, label: string): Highlight[] {
  const next = label.trim();
  if (!next) return list;
  return list.map((item) => (item.id === id ? { ...item, label: next } : item));
}

export function searchHighlights(list: Highlight[], query: string): Highlight[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((item) =>
    item.label.toLowerCase().includes(needle) ||
    item.title.toLowerCase().includes(needle) ||
    item.videoId.toLowerCase().includes(needle),
  );
}

export function exportHighlights(list: Highlight[]): string {
  return JSON.stringify({ version: 1, highlights: list }, null, 2);
}

function asHighlight(value: unknown): Highlight {
  if (!value || typeof value !== 'object') throw new Error('invalid');
  const row = value as Partial<Highlight>;
  if (typeof row.id !== 'string' || !row.id) throw new Error('invalid');
  if (typeof row.videoId !== 'string' || !VIDEO_ID.test(row.videoId)) throw new Error('invalid');
  if (typeof row.title !== 'string') throw new Error('invalid');
  if (typeof row.label !== 'string' || !row.label.trim()) throw new Error('invalid');
  if (typeof row.start !== 'number' || typeof row.end !== 'number') throw new Error('invalid');
  if (!Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end <= row.start || row.start < 0) {
    throw new Error('invalid');
  }
  if (!Array.isArray(row.peaks) || row.peaks.length > 4000 || row.peaks.some((peak) => typeof peak !== 'number' || !Number.isFinite(peak))) {
    throw new Error('invalid');
  }
  return {
    id: row.id,
    videoId: row.videoId,
    title: row.title,
    start: row.start,
    end: row.end,
    label: row.label.trim(),
    peaks: row.peaks,
  };
}

export function importHighlights(current: Highlight[], json: string): Highlight[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('invalid');
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { highlights?: unknown }).highlights)
      ? (parsed as { highlights: unknown[] }).highlights
      : null;
  if (!rows) throw new Error('invalid');
  const incoming = rows.map(asHighlight);
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, item);
  return [...byId.values()];
}
