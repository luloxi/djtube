import { describe, expect, it } from 'vitest';
import { cleanAccountKey, cleanPlaylistName, cleanTracks, PLAYLIST_NAME_MAX, PLAYLIST_TRACKS_MAX } from './account-data';

describe('account data validation', () => {
  it('cleans names', () => {
    expect(cleanPlaylistName('  Mi   fiesta ')).toBe('Mi fiesta');
    expect(cleanPlaylistName('')).toBeNull();
    expect(cleanPlaylistName('x'.repeat(PLAYLIST_NAME_MAX + 1))).toBeNull();
    expect(cleanPlaylistName(5)).toBeNull();
  });

  it('keeps well-formed tracks, drops duplicates, rejects the rest', () => {
    expect(cleanTracks([{ videoId: 'jNQXAC9IVRw', title: ' Hola ' }, { videoId: 'jNQXAC9IVRw', title: 'dup' }])).toEqual([{ videoId: 'jNQXAC9IVRw', title: 'Hola' }]);
    expect(cleanTracks([{ videoId: 'short', title: 'x' }])).toBeNull();
    expect(cleanTracks([])).toBeNull();
    expect(cleanTracks('x')).toBeNull();
    expect(cleanTracks(Array.from({ length: PLAYLIST_TRACKS_MAX + 1 }, () => ({ videoId: 'jNQXAC9IVRw', title: 'a' })))).toBeNull();
  });

  it('accepts only API-key-shaped keys', () => {
    expect(cleanAccountKey(' AIzaSyA-1234567890abcdefghijklmnopqrstu ')).toBe('AIzaSyA-1234567890abcdefghijklmnopqrstu');
    expect(cleanAccountKey('123-abc.apps.googleusercontent.com')).toBeNull();
    expect(cleanAccountKey(null)).toBeNull();
  });
});
