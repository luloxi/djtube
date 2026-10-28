import { describe, expect, it, vi } from 'vitest';
import { addYouTubePlaylistItems, classifyYouTubeError, createYouTubePlaylist, saveQueueToYouTube } from './youtube-playlist';

const TOKEN = 'ya29.test-token-should-not-leak';

describe('YouTube playlist create', () => {
  it('creates a private playlist and inserts in order until quota', async () => {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), body: String(init?.body ?? ''), auth: headers.get('authorization') ?? '' });
      if (String(input).includes('/playlists?')) {
        return Response.json({ id: 'PLcreated123' });
      }
      const body = JSON.parse(String(init?.body)) as { snippet: { resourceId: { videoId: string } } };
      if (body.snippet.resourceId.videoId === 'ccccccccccc') {
        return Response.json({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, { status: 403 });
      }
      return Response.json({ id: 'item' });
    });

    const created = await createYouTubePlaylist(fetchImpl, TOKEN, 'DJTube 2026-10-28 15:04');
    expect(created).toEqual({ ok: true, playlistId: 'PLcreated123', url: 'https://www.youtube.com/playlist?list=PLcreated123' });
    const inserted = await addYouTubePlaylistItems(fetchImpl, TOKEN, 'PLcreated123', ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd']);
    expect(inserted).toEqual({ added: 2, stopped: 'quota' });
    expect(calls.map((call) => JSON.parse(call.body).snippet?.resourceId?.videoId).filter(Boolean)).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
      'ccccccccccc',
    ]);
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({ status: { privacyStatus: 'private' } });
    expect(calls.every((call) => call.auth === `Bearer ${TOKEN}`)).toBe(true);
    const logged = [...error.mock.calls, ...log.mock.calls].flat().map(String).join('\n');
    expect(logged).not.toContain(TOKEN);
    error.mockRestore();
    log.mockRestore();
  });

  it('treats a missing scope as consent and a disabled API as forbidden', () => {
    expect(classifyYouTubeError(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } })).toBe('consent');
    expect(
      classifyYouTubeError(403, {
        error: { status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] },
      }),
    ).toBe('forbidden');
    expect(classifyYouTubeError(401, {})).toBe('auth');
    expect(classifyYouTubeError(400, { error: { message: 'videoNotFound' } })).toBe('skip');
  });

  it('saves through the app API in batches and keeps a partial playlist', async () => {
    const posts: unknown[] = [];
    const fetchImpl = vi.fn(async (_input: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') return Response.json({ ok: true, granted: true });
      const body = JSON.parse(String(init.body));
      posts.push(body);
      if (body.action === 'create') return Response.json({ ok: true, playlistId: 'PLcreated123', url: 'https://www.youtube.com/playlist?list=PLcreated123' });
      if (Array.isArray(body.videoIds) && body.videoIds.includes('v0000000003')) {
        return Response.json({ ok: false, reason: 'quota', added: 1 }, { status: 403 });
      }
      return Response.json({ ok: true, added: body.videoIds.length });
    });
    const progress: string[] = [];
    const result = await saveQueueToYouTube({
      title: 'DJTube 2026-10-28 15:04',
      videoIds: ['v0000000000', 'v0000000001', 'v0000000002', 'v0000000003', 'v0000000004'],
      fetchImpl,
      batchSize: 2,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(posts[0]).toMatchObject({ action: 'create', title: 'DJTube 2026-10-28 15:04' });
    expect(posts.slice(1)).toEqual([
      { action: 'items', playlistId: 'PLcreated123', videoIds: ['v0000000000', 'v0000000001'] },
      { action: 'items', playlistId: 'PLcreated123', videoIds: ['v0000000002', 'v0000000003'] },
    ]);
    expect(result).toMatchObject({ ok: false, reason: 'quota', added: 3, total: 5, playlistId: 'PLcreated123' });
    expect(progress).toEqual(['2/5', '3/5']);
  });
});
