import type { DeckId, Highlight } from '../types';
import { Highlights } from './Highlights';

type Props = {
  highlights: Highlight[];
  onHighlights: (next: Highlight[]) => void;
  onPlayHighlight: (highlight: Highlight, deck: DeckId, play: boolean) => void;
  onStatus: (message: string) => void;
};

export function Preparar(props: Props) {
  return (
    <div className="preparar">
      <Highlights highlights={props.highlights} onChange={props.onHighlights} onPlay={props.onPlayHighlight} onStatus={props.onStatus} />
    </div>
  );
}
