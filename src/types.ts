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
  peaks: number[] | null;
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
    peaks: null,
  };
}
