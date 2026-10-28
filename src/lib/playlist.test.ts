import { describe, expect, it } from 'vitest';
import {
  parseDataApiPlaylist,
  parseInnertubePlaylist,
  takeNewPlaylistItems,
  walkPlaylistPages,
  type PlaylistItem,
  type PlaylistPage,
} from './playlist';

function vid(n: number): string {
  return `v${String(n).padStart(10, '0')}`;
}

function item(n: number, title = `Tema ${n}`): PlaylistItem {
  return { videoId: vid(n), title, thumbnail: null };
}

describe('playlist pagination', () => {
  it('walks several pages past 50, in order, skipping dupes and private videos', async () => {
    const page1: PlaylistItem[] = Array.from({ length: 51 }, (_, n) => item(n));
    const page2: PlaylistItem[] = [
      ...Array.from({ length: 11 }, (_, n) => item(40 + n)),
      { videoId: vid(100), title: 'Private video', thumbnail: null },
      ...Array.from({ length: 9 }, (_, n) => item(51 + n)),
    ];
    const page3: PlaylistItem[] = Array.from({ length: 10 }, (_, n) => item(60 + n));
    const pages: Record<string, PlaylistPage> = {
      '': { items: page1, nextPageToken: 'page-2' },
      'page-2': { items: page2, nextPageToken: 'page-3' },
      'page-3': { items: page3, nextPageToken: null },
    };
    const seen: string[] = [];
    const calls: Array<string | null> = [];
    const added = await walkPlaylistPages(
      async (token) => {
        calls.push(token);
        const page = pages[token ?? ''];
        if (!page) throw new Error('missing page');
        return page;
      },
      [vid(3)],
      (batch) => {
        seen.push(...batch.map((row) => row.videoId));
      },
    );

    expect(calls).toEqual([null, 'page-2', 'page-3']);
    expect(page1.length + page2.length + page3.length).toBeGreaterThan(50);
    expect(added).toBe(51 - 1 + 9 + 10);
    expect(seen).not.toContain(vid(3));
    expect(seen).not.toContain(vid(100));
    expect(seen.slice(0, 3)).toEqual([vid(0), vid(1), vid(2)]);
    expect(seen[3]).toBe(vid(4));
    expect(seen.at(-1)).toBe(vid(69));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('stops when a continuation token repeats', async () => {
    let n = 0;
    const added = await walkPlaylistPages(
      async () => {
        n += 1;
        return { items: [item(n)], nextPageToken: 'again' };
      },
      [],
      () => undefined,
      { maxPages: 10 },
    );
    expect(added).toBe(2);
  });
});

describe('playlist payloads', () => {
  it('reads a Data API page and the nextPageToken', () => {
    const page = parseDataApiPlaylist({
      nextPageToken: 'CAUQAA',
      items: [
        {
          snippet: {
            title: 'Uno',
            resourceId: { videoId: 'abcdefghijk' },
            thumbnails: { medium: { url: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' } },
          },
          status: { privacyStatus: 'public' },
        },
        {
          snippet: { title: 'Private video', resourceId: { videoId: 'zzzzzzzzzzz' } },
          status: { privacyStatus: 'private' },
        },
        {
          snippet: { title: 'Deleted video', resourceId: { videoId: 'yyyyyyyyyyy' } },
          status: { privacyStatus: 'public' },
        },
      ],
    });
    expect(page.nextPageToken).toBe('CAUQAA');
    expect(page.items.map((row) => row.videoId)).toEqual(['abcdefghijk']);
    expect(page.items[0]?.title).toBe('Uno');
  });

  it('reads an innertube page and its continuation', () => {
    const first = parseInnertubePlaylist({
      contents: {
        twoColumnBrowseResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [
                            {
                              playlistVideoListRenderer: {
                                contents: [
                                  {
                                    playlistVideoRenderer: {
                                      videoId: 'abcdefghijk',
                                      title: { simpleText: 'Uno' },
                                      isPlayable: true,
                                      thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' }] },
                                    },
                                  },
                                  {
                                    playlistVideoRenderer: {
                                      videoId: 'zzzzzzzzzzz',
                                      title: { simpleText: 'Gone' },
                                      isPlayable: false,
                                    },
                                  },
                                  {
                                    continuationItemRenderer: {
                                      continuationEndpoint: { continuationCommand: { token: 'NEXT' } },
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(first.nextPageToken).toBe('NEXT');
    expect(first.items.map((row) => row.title)).toEqual(['Uno']);

    const second = parseInnertubePlaylist({
      onResponseReceivedActions: [
        {
          appendContinuationItemsAction: {
            continuationItems: [
              { playlistVideoRenderer: { videoId: 'bbbbbbbbbbb', title: { runs: [{ text: 'Dos' }] } } },
            ],
          },
        },
      ],
    });
    expect(second.items).toEqual([
      { videoId: 'bbbbbbbbbbb', title: 'Dos', thumbnail: 'https://i.ytimg.com/vi/bbbbbbbbbbb/mqdefault.jpg' },
    ]);
    expect(second.nextPageToken).toBeNull();
  });

  it('does not re-add ids passed in as already queued', () => {
    const queued = new Set(['abcdefghijk']);
    expect(takeNewPlaylistItems([{ videoId: 'abcdefghijk', title: 'Uno', thumbnail: null }], queued)).toEqual([]);
  });

  it('reads the lockup rows YouTube serves now and picks the list continuation, not the shelf one', () => {
    const lockup = (id: string, title: string, type = 'LOCKUP_CONTENT_TYPE_VIDEO') => ({
      lockupViewModel: {
        contentId: id,
        contentType: type,
        contentImage: { thumbnailViewModel: { image: { sources: [{ url: 'https://i.ytimg.com/vi/x/a.jpg' }, { url: 'https://i.ytimg.com/vi/x/b.jpg' }] } } },
        metadata: { lockupMetadataViewModel: { title: { content: title } } },
      },
    });
    const more = (token: string) => ({
      continuationItemViewModel: { continuationCommand: { innertubeCommand: { continuationCommand: { token } } } },
    });
    const first = parseInnertubePlaylist({
      contents: {
        sectionListRenderer: {
          contents: [
            { itemSectionRenderer: { contents: [lockup('abcdefghijk', 'Uno'), lockup('bbbbbbbbbbb', 'Private video'), more('LIST-TOKEN')] } },
            more('SHELF-TOKEN'),
          ],
        },
      },
    });
    expect(first.items.map((row) => [row.videoId, row.title, row.thumbnail])).toEqual([['abcdefghijk', 'Uno', 'https://i.ytimg.com/vi/x/b.jpg']]);
    expect(first.nextPageToken).toBe('LIST-TOKEN');

    const last = parseInnertubePlaylist({
      onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [lockup('ccccccccccc', 'Tres')] } }],
    });
    expect(last.items.map((row) => row.title)).toEqual(['Tres']);
    expect(last.nextPageToken).toBeNull();

    const shelf = parseInnertubePlaylist({
      onResponseReceivedActions: [
        { appendContinuationItemsAction: { continuationItems: [lockup('ddddddddddd', 'Lista', 'LOCKUP_CONTENT_TYPE_PLAYLIST'), more('X')] } },
      ],
    });
    expect(shelf.items).toEqual([]);
    expect(shelf.nextPageToken).toBeNull();
  });
});
