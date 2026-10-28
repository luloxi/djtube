import { describe, expect, it } from 'vitest';
import { hasYouTubeScope, playlistTitle, queueLinksFilename, queueLinksText, watchVideosUrls } from './queue-export';

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
