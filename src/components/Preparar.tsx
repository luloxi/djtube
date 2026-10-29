import { useMemo, useState } from 'react';
import type { Highlight, Track } from '../types';
import { addHighlight } from '../lib/highlights';
import { decodeEntities } from '../lib/html-text';
import { parseYouTubeUrl, trackFromId } from '../lib/youtube';
import { CutEditor, type CutDraft } from './CutEditor';
import { Highlights } from './Highlights';
import { Icon } from './icons';
import { SearchBox } from './SearchBox';
import { SongRow } from './SongRow';

type Props = {
  highlights: Highlight[];
  onHighlights: (next: Highlight[]) => void;
  onStatus: (message: string) => void;
  library: Track[];
  ownKey: string | null;
  onYouTube: (raw: string) => void;
  onRemember: (track: Track) => void;
  onOpenKey: () => void;
  onLimited: (reason: 'limit' | 'quota') => void;
};

type Open = { videoId: string; title: string; initial?: CutDraft };

export function Preparar(props: Props) {
  const { highlights, onHighlights, library, onStatus } = props;
  const [view, setView] = useState<'songs' | 'cuts'>('songs');
  const [open, setOpen] = useState<Open | null>(null);

  const track = useMemo<Track | null>(() => {
    if (!open) return null;
    return library.find((item) => item.videoId === open.videoId) ?? { ...trackFromId(open.videoId, open.title) };
  }, [open, library]);

  function pick(song: Track) {
    props.onRemember(song);
    setOpen({ videoId: song.videoId, title: song.title });
  }

  function fromUrl(raw: string) {
    const parsed = parseYouTubeUrl(raw);
    if (parsed?.videoId && !parsed.playlistId) {
      pick(trackFromId(parsed.videoId));
      return;
    }
    props.onYouTube(raw);
  }

  function save(draft: CutDraft) {
    if (!open || !track) return;
    const cut: Highlight = {
      id: draft.id ?? crypto.randomUUID(),
      videoId: open.videoId,
      title: decodeEntities(track.title) || open.videoId,
      start: draft.start,
      end: draft.end,
      label: draft.label,
      peaks: [],
    };
    onHighlights(addHighlight(highlights, cut));
    onStatus('Guardado');
  }

  return (
    <div className="preparar">
      <div className="preparar-tabs side-tabs">
        <button type="button" className="icon-button tone-queue" aria-pressed={view === 'songs'} aria-label="Canciones" title="Canciones" onClick={() => setView('songs')}>
          <Icon name="queue" />
        </button>
        <button type="button" className="icon-button tone-cut" aria-pressed={view === 'cuts'} aria-label="Cortes" title="Cortes" onClick={() => setView('cuts')}>
          <Icon name="cuts" />
        </button>
      </div>
      <div className="preparar-grid">
        <div className={view === 'songs' ? 'preparar-pane is-open' : 'preparar-pane'} data-testid="songs-pane">
          <SearchBox ownKey={props.ownKey} onPick={pick} onLoad={() => undefined} onYouTube={fromUrl} onOpenKey={props.onOpenKey} onLimited={props.onLimited} />
          {library.length ? (
            <section className="panel" aria-label="Cola">
              <h2>Cola</h2>
              <div className="list">
                {library.map((song) => (
                  <SongRow key={song.videoId} track={song} onPick={pick} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className={view === 'cuts' ? 'preparar-pane is-open' : 'preparar-pane'} data-testid="cuts-pane">
          <Highlights
            highlights={highlights}
            onChange={onHighlights}
            onStatus={onStatus}
            onEdit={(cut) =>
              setOpen({ videoId: cut.videoId, title: cut.title, initial: { id: cut.id, start: cut.start, end: cut.end, label: cut.label } })
            }
          />
        </div>
      </div>
      {open && track ? (
        <CutEditor key={`${open.videoId}:${open.initial?.id ?? 'new'}`} track={track} initial={open.initial} cuts={highlights} onSave={save} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
