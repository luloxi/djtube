import type { DeckModel, SessionState, Track } from '../types';

const DB_NAME = 'djtube';
const DB_VERSION = 4;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['library', 'highlights', 'session']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
      for (const name of ['cues', 'audio', 'analyses']) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
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

export function deckSnapshot(deck: DeckModel): DeckModel {
  return {
    videoId: deck.videoId,
    title: deck.title,
    thumbnail: deck.thumbnail,
    volume: deck.volume,
    cueTime: deck.cueTime,
    playbackRate: deck.playbackRate,
    peaks: null,
  };
}
