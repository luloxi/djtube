import type { AppMode } from '../lib/mode';
import { Icon } from './icons';

export function Welcome({ onPick }: { onPick: (mode: AppMode) => void }) {
  return (
    <main className="welcome" data-testid="welcome">
      <img className="welcome-logo" src="/djtube.svg?v=2" alt="DJTube" width={112} height={112} draggable={false} />
      <h1>DJTube</h1>
      <div className="welcome-modes">
        <button type="button" className="tone-prepare" onClick={() => onPick('preparar')} aria-label="Preparar">
          <Icon name="prepare" size={36} />
          <span>Preparar</span>
        </button>
        <button type="button" className="tone-decks" onClick={() => onPick('dj')} aria-label="DJ">
          <Icon name="decks" size={36} />
          <span>DJ</span>
        </button>
      </div>
    </main>
  );
}
