import { describe, expect, it } from 'vitest';
import { parseSearchItems } from './youtube-search';

describe('search results', () => {
  it('reads videos', () => {
    const hits = parseSearchItems({ items: [{ id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'A &amp; B', channelTitle: 'C' } }] });
    expect(hits).toEqual([{ videoId: 'aaaaaaaaaaa', title: 'A & B', channel: 'C', thumbnail: null }]);
  });

  it('reads playlists and drops the ones without a valid id', () => {
    const hits = parseSearchItems(
      {
        items: [
          { id: { kind: 'youtube#playlist', playlistId: 'PLabc123' }, snippet: { title: 'Mix', channelTitle: 'DJ', thumbnails: { medium: { url: 'https://i.ytimg.com/x.jpg' } } } },
          { id: { videoId: 'aaaaaaaaaaa' }, snippet: { title: 'nope' } },
          { id: { playlistId: 'bad id!' }, snippet: { title: 'nope' } },
        ],
      },
      'playlist',
    );
    expect(hits).toEqual([{ videoId: '', playlistId: 'PLabc123', title: 'Mix', channel: 'DJ', thumbnail: 'https://i.ytimg.com/x.jpg' }]);
  });

  it('survives garbage', () => {
    expect(parseSearchItems(null, 'playlist')).toEqual([]);
    expect(parseSearchItems({ items: [null, 3] }, 'playlist')).toEqual([]);
  });
});
