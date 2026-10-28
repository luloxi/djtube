import { describe, expect, it } from 'vitest';
import { parseMode, readStoredMode, storeMode, MODE_KEY } from './mode';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe('app mode', () => {
  it('accepts only the two modes', () => {
    expect(parseMode('preparar')).toBe('preparar');
    expect(parseMode('dj')).toBe('dj');
    expect(parseMode('both')).toBeNull();
    expect(parseMode(null)).toBeNull();
  });

  it('remembers the last mode and ignores a broken store', () => {
    const store = memory();
    expect(readStoredMode(store)).toBeNull();
    storeMode(store, 'preparar');
    expect(store.data.get(MODE_KEY)).toBe('preparar');
    expect(readStoredMode(store)).toBe('preparar');
    storeMode(store, 'dj');
    expect(readStoredMode(store)).toBe('dj');
    expect(readStoredMode({ getItem: () => { throw new Error('nope'); } })).toBeNull();
    expect(() => storeMode({ setItem: () => { throw new Error('nope'); } }, 'dj')).not.toThrow();
  });
});
