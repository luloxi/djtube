export const DISC_MIGRATION_KEY = 'djtube-disc-v2';

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Drop a saved "disc off" from before discs started on. Runs once per browser. */
export function migrateDiscPreference(storage: KeyValueStore | null): void {
  if (!storage) return;
  try {
    if (storage.getItem(DISC_MIGRATION_KEY) === '1') return;
    storage.removeItem('djtube-disc-A');
    storage.removeItem('djtube-disc-B');
    storage.setItem(DISC_MIGRATION_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function readDiscOn(storage: KeyValueStore | null, id: 'A' | 'B'): boolean {
  migrateDiscPreference(storage);
  if (!storage) return true;
  try {
    return storage.getItem(`djtube-disc-${id}`) !== '0';
  } catch {
    return true;
  }
}

export function writeDiscOn(storage: KeyValueStore | null, id: 'A' | 'B', on: boolean): void {
  if (!storage) return;
  try {
    storage.setItem(DISC_MIGRATION_KEY, '1');
    storage.setItem(`djtube-disc-${id}`, on ? '1' : '0');
  } catch {
    /* private mode */
  }
}
