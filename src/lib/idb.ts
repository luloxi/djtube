import type { AnalysisMeta, AudioCoverage, DeckModel, Highlight, SessionState, Track } from '../types';

const DB_NAME = 'djtube';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['library', 'highlights', 'analyses', 'audio', 'session']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(store: string, mode: IDBTransactionMode, run: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = run(tx.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadLibrary(): Promise<Track[]> {
  try {
    const value = await withStore<Track[] | undefined>('library', 'readonly', (store) => store.get('tracks'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveLibrary(tracks: Track[]): Promise<void> {
  try {
    await withStore('library', 'readwrite', (store) => store.put(tracks, 'tracks'));
  } catch {
    /* private mode or quota — keep the in-memory queue */
  }
}

export async function loadHighlights(): Promise<Highlight[]> {
  try {
    const value = await withStore<Highlight[] | undefined>('highlights', 'readonly', (store) => store.get('all'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveHighlights(highlights: Highlight[]): Promise<void> {
  try {
    await withStore('highlights', 'readwrite', (store) => store.put(highlights, 'all'));
  } catch {
    /* keep memory */
  }
}

export async function loadSession(): Promise<SessionState | null> {
  try {
    const value = await withStore<SessionState | undefined>('session', 'readonly', (store) => store.get('current'));
    if (!value || typeof value.x !== 'number' || !value.decks) return null;
    return value;
  } catch {
    return null;
  }
}

export async function saveSession(session: SessionState): Promise<void> {
  try {
    await withStore('session', 'readwrite', (store) => store.put(session, 'current'));
  } catch {
    /* keep memory */
  }
}

export async function loadAnalysis(videoId: string): Promise<AnalysisMeta | null> {
  try {
    const value = await withStore<AnalysisMeta | undefined>('analyses', 'readonly', (store) => store.get(videoId));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function saveAnalysis(meta: AnalysisMeta): Promise<void> {
  await withStore('analyses', 'readwrite', (store) => store.put(meta, meta.videoId));
}

export async function saveAudio(videoId: string, blob: Blob): Promise<void> {
  await withStore('audio', 'readwrite', (store) => store.put(blob, videoId));
}

export async function loadAudio(videoId: string): Promise<Blob | null> {
  try {
    const value = await withStore<Blob | undefined>('audio', 'readonly', (store) => store.get(videoId));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function loadAnalyzedBpm(): Promise<Map<string, number | null>> {
  try {
    const rows = await withStore<AnalysisMeta[]>('analyses', 'readonly', (store) => store.getAll());
    const map = new Map<string, number | null>();
    for (const row of rows ?? []) {
      if (!row?.videoId || !Array.isArray(row.peaks) || !row.peaks.length) continue;
      map.set(row.videoId, typeof row.bpm === 'number' && Number.isFinite(row.bpm) ? row.bpm : null);
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function loadCoverages(): Promise<Record<string, AudioCoverage>> {
  try {
    const rows = await withStore<AnalysisMeta[]>('analyses', 'readonly', (store) => store.getAll());
    const map: Record<string, AudioCoverage> = {};
    for (const row of rows ?? []) {
      if (!row?.videoId) continue;
      map[row.videoId] = { recordStart: row.recordStart, recordEnd: row.recordEnd, hasAudio: row.hasAudio };
    }
    return map;
  } catch {
    return {};
  }
}

export function deckSnapshot(deck: DeckModel): DeckModel {
  return {
    videoId: deck.videoId,
    title: deck.title,
    thumbnail: deck.thumbnail,
    volume: deck.volume,
    cueTime: deck.cueTime,
    playbackRate: deck.playbackRate,
    bpm: deck.bpm,
    peaks: null,
  };
}
