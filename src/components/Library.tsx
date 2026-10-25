import { useState } from 'react';
import type { DeckId, Track } from '../types';

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
          placeholder="URL de video o playlist"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="URL de YouTube"
        />
        <div className="row">
          <button type="submit" disabled={busy}>
            A la cola
          </button>
          <button
            type="button"
            data-testid="load-deck-a"
            disabled={busy}
            onClick={() => {
              onSubmit(url, 'A');
              setUrl('');
            }}
          >
            Cargar A
          </button>
          <button
            type="button"
            data-testid="load-deck-b"
            disabled={busy}
            onClick={() => {
              onSubmit(url, 'B');
              setUrl('');
            }}
          >
            Cargar B
          </button>
        </div>
      </form>
      <div className="list">
        {tracks.length === 0 ? <p className="hint">La cola está vacía.</p> : null}
        {tracks.map((track) => (
          <TrackRow key={track.videoId} track={track} onLoad={onLoad} />
        ))}
      </div>
    </section>
  );
}

export function TrackRow({ track, onLoad }: { track: Track; onLoad: (track: Track, deck: DeckId) => void }) {
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
        <button type="button" aria-label={`Cargar en deck A: ${track.title}`} onClick={() => onLoad(track, 'A')}>
          A
        </button>
        <button type="button" aria-label={`Cargar en deck B: ${track.title}`} onClick={() => onLoad(track, 'B')}>
          B
        </button>
      </div>
    </div>
  );
}
