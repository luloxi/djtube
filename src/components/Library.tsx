import { useState } from 'react';
import type { DeckId, Track } from '../types';
import { Icon } from './icons';

type Props = {
  tracks: Track[];
  busy: boolean;
  titleDeck?: DeckId | null;
  compact?: boolean;
  onSubmit: (url: string, target: 'queue' | DeckId) => void;
  onLoad: (track: Track, deck: DeckId) => void;
  onClear?: () => void;
};

export function Library({ tracks, busy, titleDeck = null, compact = false, onSubmit, onLoad, onClear }: Props) {
  const [url, setUrl] = useState('');

  return (
    <section className="panel" aria-label="Cola">
      <div className="panel-head">
        <h2>Cola</h2>
        {onClear ? (
          <button
            type="button"
            className="icon-button"
            disabled={busy || tracks.length === 0}
            aria-label="Vaciar cola"
            title="Vaciar cola"
            onClick={onClear}
          >
            <Icon name="trash" />
          </button>
        ) : null}
      </div>
      {compact ? null : (
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(url, 'queue');
          setUrl('');
        }}
      >
        <input
          data-testid="library-url"
          type="url"
          inputMode="url"
          placeholder="URL"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="URL de YouTube"
        />
        <div className="row">
          <button type="submit" className="icon-button" disabled={busy} aria-label="A la cola" title="A la cola">
            <Icon name="plus" />
          </button>
          <button
            type="button"
            className="icon-button letter"
            data-testid="load-deck-a"
            disabled={busy}
            aria-label="Cargar A"
            title="Cargar A"
            onClick={() => {
              onSubmit(url, 'A');
              setUrl('');
            }}
          >
            A
          </button>
          <button
            type="button"
            className="icon-button letter"
            data-testid="load-deck-b"
            disabled={busy}
            aria-label="Cargar B"
            title="Cargar B"
            onClick={() => {
              onSubmit(url, 'B');
              setUrl('');
            }}
          >
            B
          </button>
        </div>
      </form>
      )}
      <div className="list">
        {tracks.map((track) => (
          <TrackRow key={track.videoId} track={track} titleDeck={titleDeck} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}

export function TrackRow({
  track,
  onLoad,
  titleDeck = null,
}: {
  track: Track;
  onLoad: (track: Track, deck: DeckId) => void;
  titleDeck?: DeckId | null;
}) {
  return (
    <div
      className="track"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-djtube', JSON.stringify(track));
        event.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <button type="button" className="track-add track-add-a" aria-label={`Cargar en deck A: ${track.title}`} title="A" onClick={() => onLoad(track, 'A')}>
        A
      </button>
      {track.thumbnail ? <img src={track.thumbnail} alt="" /> : <span className="thumb" />}
      {titleDeck ? (
        <button type="button" className="track-name" title={track.title} onClick={() => onLoad(track, titleDeck)}>
          {track.title}
        </button>
      ) : (
        <p className="track-name" title={track.title}>
          {track.title}
        </p>
      )}
      <button type="button" className="track-add track-add-b" aria-label={`Cargar en deck B: ${track.title}`} title="B" onClick={() => onLoad(track, 'B')}>
        B
      </button>
    </div>
  );
}
