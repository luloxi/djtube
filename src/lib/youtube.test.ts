import { describe, expect, it } from 'vitest';
import { parseYouTubeUrl, uniqueIds } from './youtube';

describe('YouTube URLs', () => {
  it('reads videos, shorts, and playlists', () => {
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw')).toEqual({ videoId: 'jNQXAC9IVRw' });
    expect(parseYouTubeUrl('https://youtu.be/jNQXAC9IVRw')).toEqual({ videoId: 'jNQXAC9IVRw' });
    expect(parseYouTubeUrl('https://www.youtube.com/shorts/jNQXAC9IVRw')).toEqual({ videoId: 'jNQXAC9IVRw' });
    expect(parseYouTubeUrl('https://www.youtube.com/playlist?list=PLabc1234567890')).toEqual({
      playlistId: 'PLabc1234567890',
    });
    expect(parseYouTubeUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLabc1234567890')).toEqual({
      videoId: 'jNQXAC9IVRw',
      playlistId: 'PLabc1234567890',
    });
    expect(parseYouTubeUrl('https://music.youtube.com/watch?v=jNQXAC9IVRw&list=PLabc1234567890')).toEqual({
      videoId: 'jNQXAC9IVRw',
      playlistId: 'PLabc1234567890',
    });
    expect(parseYouTubeUrl('https://music.youtube.com/playlist?list=OLAK5uy_abc1234567')).toEqual({
      playlistId: 'OLAK5uy_abc1234567',
    });
    expect(parseYouTubeUrl('https://youtu.be/jNQXAC9IVRw?list=RDmix1234567890')).toEqual({
      videoId: 'jNQXAC9IVRw',
      playlistId: 'RDmix1234567890',
    });
    expect(parseYouTubeUrl('https://m.youtube.com/playlist?list=PLabc1234567890')).toEqual({
      playlistId: 'PLabc1234567890',
    });
    expect(parseYouTubeUrl('not a url')).toBeNull();
  });

  it('dedupes playlist ids', () => {
    expect(uniqueIds(['jNQXAC9IVRw', 'jNQXAC9IVRw', 'bad', 'abcdefghijk'])).toEqual([
      'jNQXAC9IVRw',
      'abcdefghijk',
    ]);
  });
});
