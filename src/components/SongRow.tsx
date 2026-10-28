import type { Track } from '../types';
import { decodeEntities } from '../lib/html-text';
import { Icon } from './icons';

/** A song in Preparar: one tap opens the cut editor. */
export function SongRow({ track, onPick }: { track: Track; onPick: (track: Track) => void }) {
  const title = decodeEntities(track.title);
  return (
    <button type="button" className="song-row" aria-label={`Cortar: ${title}`} title="Cortar" onClick={() => onPick(track)}>
      {track.thumbnail ? <img src={track.thumbnail} alt="" /> : <span className="thumb" />}
      <span className="song-name">{title}</span>
      <span className="song-cut tone-cut" aria-hidden="true">
        <Icon name="cuts" />
      </span>
    </button>
  );
}
