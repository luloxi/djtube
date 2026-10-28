export type AppMode = 'preparar' | 'dj';

export const MODE_KEY = 'djtube-mode';

export function parseMode(value: string | null | undefined): AppMode | null {
  return value === 'preparar' || value === 'dj' ? value : null;
}

export function readStoredMode(storage: { getItem(key: string): string | null } | null): AppMode | null {
  if (!storage) return null;
  try {
    return parseMode(storage.getItem(MODE_KEY));
  } catch {
    return null;
  }
}

export function storeMode(storage: { setItem(key: string, value: string): void } | null, mode: AppMode): void {
  if (!storage) return;
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    /* private mode */
  }
}
