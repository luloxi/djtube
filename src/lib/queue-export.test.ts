import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_BYTES, hasYouTubeScope, mergeImported, parseQueueText, playlistTitle, queueLinksFilename, queueLinksText, watchVideosUrls } from './queue-export';

describe('queue export', () => {
  it('writes title, link, and a blank line for every track', () => {
    expect(
      queueLinksText([
        { title: 'Uno', videoId: 'abcdefghijk' },
        { title: 'Dos\nline', videoId: 'zzzzzzzzzzz' },
      ]),
    ).toBe('Uno\nhttps://www.youtube.com/watch?v=abcdefghijk\n\nDos line\nhttps://www.youtube.com/watch?v=zzzzzzzzzzz\n\n');
    expect(queueLinksFilename(new Date(2026, 9, 28, 15, 4))).toBe('djtube-cola-2026-10-28.txt');
    expect(playlistTitle(new Date(2026, 9, 28, 15, 4))).toBe('DJTube 2026-10-28 15:04');
  });

  it('chunks watch_videos links at 50 ids', () => {
    const ids = Array.from({ length: 51 }, (_, n) => `v${String(n).padStart(10, '0')}`);
    const urls = watchVideosUrls(ids);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(`https://www.youtube.com/watch_videos?video_ids=${ids.slice(0, 50).join(',')}`);
    expect(urls[1]).toBe(`https://www.youtube.com/watch_videos?video_ids=${ids[50]}`);
    expect(hasYouTubeScope(['email', 'https://www.googleapis.com/auth/youtube'])).toBe(true);
    expect(hasYouTubeScope(['openid email profile'])).toBe(false);
  });
});

describe('import', () => {
  const sample = queueLinksText([
    { videoId: 'aaaaaaaaaaa', title: 'Uno' },
    { videoId: 'bbbbbbbbbbb', title: 'Dos' },
  ]);

  it('round-trips what the download writes', () => {
    expect(parseQueueText(sample)).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'Uno' },
      { videoId: 'bbbbbbbbbbb', title: 'Dos' },
    ]);
  });

  it('takes bare links, skips repeats and junk, and handles CRLF', () => {
    const text = 'hola\r\nhttps://youtu.be/aaaaaaaaaaa\r\nhttps://youtu.be/aaaaaaaaaaa\r\nhttps://example.com/x\r\n\r\nhttps://www.youtube.com/watch?v=ccccccccccc\r\n';
    expect(parseQueueText(text)).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'hola' },
      { videoId: 'ccccccccccc', title: 'ccccccccccc' },
    ]);
  });

  it('rejects files with no video and oversized ones', () => {
    expect(parseQueueText('nada que ver\nhttps://example.com')).toBeNull();
    expect(parseQueueText('')).toBeNull();
    expect(parseQueueText('x'.repeat(IMPORT_MAX_BYTES + 1))).toBeNull();
  });

  it('merges only new tracks after the queue', () => {
    const current = [{ videoId: 'aaaaaaaaaaa', title: 'Uno', thumbnail: null }];
    const merged = mergeImported(current, [
      { videoId: 'aaaaaaaaaaa', title: 'Uno' },
      { videoId: 'bbbbbbbbbbb', title: 'Dos' },
    ]);
    expect(merged.added).toBe(1);
    expect(merged.tracks.map((t) => t.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb']);
    expect(mergeImported(current, [{ videoId: 'aaaaaaaaaaa', title: 'x' }]).tracks).toBe(current);
  });
});
