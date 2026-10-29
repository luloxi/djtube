import { parseSavedTracks, type PlaylistSummary, type SavedTrack } from '../src/lib/account-data';
import type { D1Database } from './d1';

/** Every query below filters by the owner's email, taken from the session and nowhere else. */

export async function readKeyCipher(db: D1Database, email: string): Promise<string | null> {
  const row = await db.prepare('SELECT yt_key_enc FROM account_key WHERE email = ?').bind(email).first<{ yt_key_enc: string }>();
  return row?.yt_key_enc ?? null;
}

export async function writeKeyCipher(db: D1Database, email: string, cipher: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO account_key (email, yt_key_enc, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET yt_key_enc = excluded.yt_key_enc, updated_at = excluded.updated_at`,
    )
    .bind(email, cipher, new Date().toISOString())
    .run();
}

export async function deleteKeyCipher(db: D1Database, email: string): Promise<void> {
  await db.prepare('DELETE FROM account_key WHERE email = ?').bind(email).run();
}

type SummaryRow = { id: string; name: string; track_count: number; updated_at: string };

export async function listPlaylists(db: D1Database, email: string): Promise<PlaylistSummary[]> {
  const result = await db
    .prepare('SELECT id, name, track_count, updated_at FROM saved_playlist WHERE email = ? ORDER BY updated_at DESC LIMIT 100')
    .bind(email)
    .all<SummaryRow>();
  return (result.results ?? []).map((row) => ({ id: row.id, name: row.name, count: row.track_count, updatedAt: row.updated_at }));
}

export async function countPlaylists(db: D1Database, email: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM saved_playlist WHERE email = ?').bind(email).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function createPlaylist(db: D1Database, email: string, name: string, tracks: SavedTrack[]): Promise<PlaylistSummary> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare('INSERT INTO saved_playlist (id, email, name, tracks, track_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, email, name, JSON.stringify(tracks), tracks.length, now, now)
    .run();
  return { id, name, count: tracks.length, updatedAt: now };
}

export async function readPlaylist(db: D1Database, email: string, id: string): Promise<{ summary: PlaylistSummary; tracks: SavedTrack[] } | null> {
  const row = await db
    .prepare('SELECT id, name, tracks, track_count, updated_at FROM saved_playlist WHERE id = ? AND email = ?')
    .bind(id, email)
    .first<SummaryRow & { tracks: string }>();
  if (!row) return null;
  return {
    summary: { id: row.id, name: row.name, count: row.track_count, updatedAt: row.updated_at },
    tracks: parseSavedTracks(row.tracks),
  };
}

export async function renamePlaylist(db: D1Database, email: string, id: string, name: string): Promise<boolean> {
  const exists = await db.prepare('SELECT id FROM saved_playlist WHERE id = ? AND email = ?').bind(id, email).first();
  if (!exists) return false;
  await db.prepare('UPDATE saved_playlist SET name = ?, updated_at = ? WHERE id = ? AND email = ?').bind(name, new Date().toISOString(), id, email).run();
  return true;
}

export async function deletePlaylist(db: D1Database, email: string, id: string): Promise<boolean> {
  const exists = await db.prepare('SELECT id FROM saved_playlist WHERE id = ? AND email = ?').bind(id, email).first();
  if (!exists) return false;
  await db.prepare('DELETE FROM saved_playlist WHERE id = ? AND email = ?').bind(id, email).run();
  return true;
}
