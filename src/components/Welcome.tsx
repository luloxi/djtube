import type { AppMode } from '../lib/mode';
import { Icon } from './icons';

export function Welcome({ onPick }: { onPick: (mode: AppMode) => void }) {
  return (
    <main className="welcome" data-testid="welcome">
      <h1>DJTube</h1>
      <div className="welcome-modes">
        <button type="button" onClick={() => onPick('preparar')} aria-label="Preparar">
          <Icon name="prepare" size={36} />
          <span>Preparar</span>
        </button>
        <button type="button" onClick={() => onPick('dj')} aria-label="DJ">
          <Icon name="decks" size={36} />
          <span>DJ</span>
        </button>
      </div>
    </main>
  );
}
