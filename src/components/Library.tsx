import { useState } from 'react';
import type { DeckId, Track } from '../types';
import { Icon } from './icons';

type Props = {
  tracks: Track[];
  busy: boolean;
  onSubmit: (url: string, target: 'queue' | DeckId) => void;
  onLoad: (track: Track, deck: DeckId) => void;
};

export function Library({ tracks, busy, onSubmit, onLoad }: Props) {
  const [url, setUrl] = useState('');

  return (
    <section className="panel" aria-label="Cola">
      <h2>Cola</h2>
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
      <div className="list">
        {tracks.map((track) => (
          <TrackRow key={track.videoId} track={track} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}

export function TrackRow({
  track,
  onLoad,
  onQueue,
}: {
  track: Track;
  onLoad: (track: Track, deck: DeckId) => void;
  onQueue?: (track: Track) => void;
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
      {track.thumbnail ? <img src={track.thumbnail} alt="" /> : <span className="thumb" />}
      <p title={track.title}>{track.title}</p>
      <div className="row">
        {onQueue ? (
          <button type="button" className="icon-button" aria-label={`A la cola: ${track.title}`} title="A la cola" onClick={() => onQueue(track)}>
            <Icon name="plus" />
          </button>
        ) : null}
        <button type="button" className="icon-button letter" aria-label={`Cargar en deck A: ${track.title}`} title="Cargar A" onClick={() => onLoad(track, 'A')}>
          A
        </button>
        <button type="button" className="icon-button letter" aria-label={`Cargar en deck B: ${track.title}`} title="Cargar B" onClick={() => onLoad(track, 'B')}>
          B
        </button>
      </div>
    </div>
  );
}
