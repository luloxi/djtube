import { DEFAULT_RATES } from '../types';
import { nearestPlaybackRate, syncPlaybackRate } from '../lib/mixer';

type Props = {
  bpmA: number | null;
  bpmB: number | null;
  ratesA: number[];
  ratesB: number[];
  onApply: (deck: 'A' | 'B', rate: number) => void;
};

export function SyncNote({ bpmA, bpmB, ratesA, ratesB, onApply }: Props) {
  if (!bpmA || !bpmB || Math.abs(bpmA - bpmB) < 0.6) return null;
  const forB = syncPlaybackRate(bpmB, bpmA);
  const forA = syncPlaybackRate(bpmA, bpmB);
  return (
    <div className="sync-actions">
      <RateButton deck="A" desired={forA} available={ratesA.length ? ratesA : DEFAULT_RATES} onApply={onApply} />
      <RateButton deck="B" desired={forB} available={ratesB.length ? ratesB : DEFAULT_RATES} onApply={onApply} />
    </div>
  );
}

function RateButton({
  deck,
  desired,
  available,
  onApply,
}: {
  deck: 'A' | 'B';
  desired: number | null;
  available: number[];
  onApply: (deck: 'A' | 'B', rate: number) => void;
}) {
  if (desired == null) return null;
  const snapped = nearestPlaybackRate(desired, available);
  const label = `Igualar ${deck} ×${snapped}`;
  return (
    <button type="button" title={label} aria-label={label} onClick={() => onApply(deck, snapped)}>
      {deck}×{snapped}
    </button>
  );
}
