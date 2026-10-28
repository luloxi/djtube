import type { AudioCoverage, DeckId, Highlight } from '../types';
import type { PrepararPane } from '../lib/mode';
import { Highlights } from './Highlights';
import { SyncPage } from './SyncPage';

type Props = {
  pane: PrepararPane;
  highlights: Highlight[];
  coverage: Record<string, AudioCoverage>;
  onHighlights: (next: Highlight[]) => void;
  onPlayHighlight: (highlight: Highlight, deck: DeckId, play: boolean) => void;
  onDownload: (highlight: Highlight) => Promise<void>;
  onStatus: (message: string) => void;
};

export function Preparar(props: Props) {
  const { pane } = props;
  return (
    <div className="preparar">
      <div className={pane === 'sync' ? 'preparar-pane is-open' : 'preparar-pane'} aria-hidden={pane !== 'sync'}>
        <SyncPage embedded />
      </div>
      <div className={pane === 'cuts' ? 'preparar-pane is-open' : 'preparar-pane'} aria-hidden={pane !== 'cuts'}>
        <Highlights
          highlights={props.highlights}
          coverage={props.coverage}
          onChange={props.onHighlights}
          onPlay={props.onPlayHighlight}
          onDownload={props.onDownload}
          onStatus={props.onStatus}
        />
      </div>
    </div>
  );
}
