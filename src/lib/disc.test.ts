import { describe, expect, it } from 'vitest';
import { DISC_MIGRATION_KEY, migrateDiscPreference, readDiscOn, writeDiscOn } from './disc';

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
}

describe('disc preference', () => {
  it('turns the disc on and forgets an old off flag once', () => {
    const store = memory({ 'djtube-disc-A': '0', 'djtube-disc-B': '0' });
    expect(readDiscOn(store, 'A')).toBe(true);
    expect(readDiscOn(store, 'B')).toBe(true);
    expect(store.data[DISC_MIGRATION_KEY]).toBe('1');
    expect(store.data['djtube-disc-A']).toBeUndefined();
    expect(readDiscOn(store, 'A')).toBe(true);
  });

  it('keeps an off choice made after the migration', () => {
    const store = memory({ 'djtube-disc-A': '0', [DISC_MIGRATION_KEY]: '1' });
    expect(readDiscOn(store, 'A')).toBe(false);
    expect(readDiscOn(store, 'B')).toBe(true);
    writeDiscOn(store, 'B', false);
    expect(readDiscOn(store, 'B')).toBe(false);
    migrateDiscPreference(store);
    expect(store.data['djtube-disc-B']).toBe('0');
  });

  it('defaults on when storage is missing', () => {
    expect(readDiscOn(null, 'A')).toBe(true);
    writeDiscOn(null, 'A', false);
  });
});
