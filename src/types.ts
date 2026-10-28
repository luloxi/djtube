export type DeckId = 'A' | 'B';

export type Track = {
  videoId: string;
  title: string;
  thumbnail: string | null;
};

export type DeckModel = {
  videoId: string | null;
  title: string;
  thumbnail: string | null;
  volume: number;
  cueTime: number;
  playbackRate: number;
  bpm: number | null;
  /** Seconds of the downbeat the user lined up. Not read from audio. */
  beatOffset: number | null;
  peaks: number[] | null;
};

export type Highlight = {
  id: string;
  videoId: string;
  title: string;
  start: number;
  end: number;
  label: string;
  peaks: number[];
};

export type SessionState = {
  x: number;
  decks: Record<DeckId, DeckModel>;
};

export const DEFAULT_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function emptyDeck(): DeckModel {
  return {
    videoId: null,
    title: '',
    thumbnail: null,
    volume: 1,
    cueTime: 0,
    playbackRate: 1,
    bpm: null,
    beatOffset: null,
    peaks: null,
  };
}
