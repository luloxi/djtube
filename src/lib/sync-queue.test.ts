import { describe, expect, it } from 'vitest';
import { supportsSilentTabCapture, TAB_CAPTURE } from './sync-capture';
import { parseSyncMessage } from './sync-channel';
import {
  advanceChime,
  collectTracks,
  createChimeClock,
  markAnalyzing,
  markError,
  markProgress,
  markReady,
  mergeAnalysis,
  mergeSyncItems,
  nextQueued,
  outcomeFromCapture,
  overallProgress,
  retrySyncItem,
  type SyncItem,
  type SyncTrack,
} from './sync-queue';

const track = (videoId: string, title = videoId): SyncTrack => ({ videoId, title, thumbnail: null });

function item(partial: Partial<SyncItem> & Pick<SyncItem, 'videoId' | 'status'>): SyncItem {
  return {
    title: partial.videoId,
    thumbnail: null,
    progress: partial.status === 'ready' ? 1 : 0,
    bpm: null,
    error: null,
    ...partial,
  };
}

describe('sync queue', () => {
  const ready = new Map<string, number | null>([['aaaaaaaaaaa', 128]]);

  it('lists the queue and the decks once each', () => {
    const tracks = collectTracks(
      [track('aaaaaaaaaaa', 'Cola'), track('bbbbbbbbbbb', 'Otra'), track('not-an-id', 'no')],
      [track('bbbbbbbbbbb', 'Deck'), track('ccccccccccc', 'Solo B'), null],
    );
    expect(tracks.map((row) => row.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    expect(tracks[0]?.title).toBe('Cola');
    expect(tracks[1]?.title).toBe('Otra');
  });

  it('merges new tracks, keeps an analysis that is running, and does not undo a retry', () => {
    const known = mergeSyncItems([], [track('aaaaaaaaaaa', 'Ya'), track('bbbbbbbbbbb', 'Nueva')], ready);
    expect(known.map((row) => [row.videoId, row.status, row.bpm])).toEqual([
      ['aaaaaaaaaaa', 'ready', 128],
      ['bbbbbbbbbbb', 'queued', null],
    ]);

    const running = markProgress(markAnalyzing(known, 'bbbbbbbbbbb'), 'bbbbbbbbbbb', 0.4);
    const titled = mergeSyncItems(running, [track('bbbbbbbbbbb', 'Con título'), track('aaaaaaaaaaa', 'Ya')], ready);
    expect(titled[0]).toMatchObject({ title: 'Con título', status: 'analyzing', progress: 0.4 });

    const failed = retrySyncItem(markError(titled, 'bbbbbbbbbbb', 'ups'), 'bbbbbbbbbbb');
    const again = mergeSyncItems(failed, [track('bbbbbbbbbbb', 'Con título')], ready);
    expect(again[0]?.status).toBe('queued');
    expect(nextQueued(again)?.videoId).toBe('bbbbbbbbbbb');
  });

  it('reports overall progress from finished rows plus the one being analyzed', () => {
    const items = [
      item({ videoId: 'aaaaaaaaaaa', status: 'ready', bpm: 120 }),
      item({ videoId: 'bbbbbbbbbbb', status: 'analyzing', progress: 0.5 }),
    ];
    expect(overallProgress(items)).toEqual({ ready: 1, total: 2, ratio: 0.75 });
    expect(overallProgress([])).toEqual({ ready: 0, total: 0, ratio: 0 });
  });

  it('chimes when a batch finishes, and only again after new work finishes', () => {
    let clock = createChimeClock();
    const queued = [item({ videoId: 'aaaaaaaaaaa', status: 'queued' }), item({ videoId: 'bbbbbbbbbbb', status: 'queued' })];
    let step = advanceChime(clock, queued);
    clock = step.clock;
    expect(step.chime).toBe(false);

    step = advanceChime(clock, [markReady(queued, 'aaaaaaaaaaa', 100)[0]!, queued[1]!]);
    clock = step.clock;
    expect(step.chime).toBe(false);

    const done = [item({ videoId: 'aaaaaaaaaaa', status: 'ready', bpm: 100 }), item({ videoId: 'bbbbbbbbbbb', status: 'ready', bpm: 110 })];
    step = advanceChime(clock, done);
    clock = step.clock;
    expect(step.chime).toBe(true);

    step = advanceChime(clock, done);
    clock = step.clock;
    expect(step.chime).toBe(false);

    const extra = [...done, item({ videoId: 'ccccccccccc', status: 'queued' })];
    step = advanceChime(clock, extra);
    clock = step.clock;
    expect(step.chime).toBe(false);
    step = advanceChime(clock, [...done, item({ videoId: 'ccccccccccc', status: 'ready', bpm: 99 })]);
    expect(step.chime).toBe(true);
  });

  it('does not chime for a list that was already synced, or while an error remains', () => {
    const already = advanceChime(createChimeClock(), [item({ videoId: 'aaaaaaaaaaa', status: 'ready', bpm: 128 })]);
    expect(already.chime).toBe(false);

    let clock = createChimeClock();
    const open = advanceChime(clock, [item({ videoId: 'aaaaaaaaaaa', status: 'queued' })]);
    clock = open.clock;
    const errored = advanceChime(clock, [item({ videoId: 'aaaaaaaaaaa', status: 'error', error: 'ups' })]);
    expect(errored.chime).toBe(false);
    const recovered = advanceChime(errored.clock, [item({ videoId: 'aaaaaaaaaaa', status: 'ready', bpm: 120 })]);
    expect(recovered.chime).toBe(true);
    expect(advanceChime(createChimeClock(), []).chime).toBe(false);
  });

  it('rejects a quiet capture and keeps an older downloadable clip', () => {
    expect(outcomeFromCapture({ peaks: [0, 0, 0], bpm: 120, duration: 10 }).ok).toBe(false);
    const loud = outcomeFromCapture({ peaks: [0, 0.2, 0], bpm: 99, duration: 20 });
    expect(loud.ok).toBe(true);

    const merged = mergeAnalysis(
      {
        videoId: 'aaaaaaaaaaa',
        peaks: [0.1],
        duration: 30,
        bpm: 100,
        recordStart: 4,
        recordEnd: 20,
        hasAudio: true,
      },
      { videoId: 'aaaaaaaaaaa', peaks: [0.4, 0.5], duration: 80, bpm: 128 },
    );
    expect(merged).toMatchObject({ bpm: 128, duration: 80, hasAudio: true, recordStart: 4, recordEnd: 20, peaks: [0.4, 0.5] });
    expect(mergeAnalysis(null, { videoId: 'aaaaaaaaaaa', peaks: [0.4], duration: 80, bpm: null }).hasAudio).toBe(false);
  });
});

describe('sync messages', () => {
  it('accepts the live messages and drops garbage', () => {
    expect(parseSyncMessage({ type: 'request-tracks' })).toEqual({ type: 'request-tracks' });
    expect(parseSyncMessage({ type: 'chime' })).toEqual({ type: 'chime' });
    expect(parseSyncMessage({ type: 'nope' })).toBeNull();
    expect(parseSyncMessage({ type: 'tracks', tracks: [{ videoId: 'aaaaaaaaaaa', title: ' Hola ', thumbnail: 'http://x' }] })).toEqual({
      type: 'tracks',
      tracks: [{ videoId: 'aaaaaaaaaaa', title: 'Hola', thumbnail: null }],
    });
    const peaks = new Array(16).fill(0.2);
    const analysis = parseSyncMessage({
      type: 'analysis',
      meta: {
        videoId: 'bbbbbbbbbbb',
        peaks,
        duration: 40,
        bpm: 120,
        recordStart: 0,
        recordEnd: 40,
        hasAudio: false,
      },
    });
    expect(analysis?.type).toBe('analysis');
    expect(parseSyncMessage({ type: 'analysis', meta: { videoId: 'bbbbbbbbbbb', peaks: [1], duration: 1, bpm: 1, recordStart: 0, recordEnd: 1, hasAudio: false } })).toBeNull();
  });
});

describe('silent tab capture', () => {
  it('allows Chrome and Edge, and refuses Firefox and Safari', () => {
    expect(supportsSilentTabCapture('Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36')).toBe(true);
    expect(supportsSilentTabCapture('Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0')).toBe(true);
    expect(supportsSilentTabCapture('Mozilla/5.0 Firefox/130.0')).toBe(false);
    expect(supportsSilentTabCapture('Mozilla/5.0 Version/17.0 Safari/605.1.15')).toBe(false);
  });

  it('asks Chrome to keep the captured tab out of the speakers', () => {
    expect(TAB_CAPTURE.audio).toEqual({ suppressLocalAudioPlayback: true });
    expect(TAB_CAPTURE.preferCurrentTab).toBe(true);
    expect(TAB_CAPTURE.selfBrowserSurface).toBe('include');
    expect(TAB_CAPTURE.video).toBe(true);
  });
});
