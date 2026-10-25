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
  if (!bpmA || !bpmB) {
    return <p className="hint sync">Abre el Sincronizador, marca TAP o escribe el BPM de los dos decks.</p>;
  }
  if (Math.abs(bpmA - bpmB) < 0.6) {
    return <p className="hint sync">Los tempos ya coinciden.</p>;
  }
  const forB = syncPlaybackRate(bpmB, bpmA);
  const forA = syncPlaybackRate(bpmA, bpmB);
  return (
    <div className="sync">
      <RateLine deck="B" desired={forB} available={ratesB.length ? ratesB : DEFAULT_RATES} onApply={onApply} />
      <RateLine deck="A" desired={forA} available={ratesA.length ? ratesA : DEFAULT_RATES} onApply={onApply} />
    </div>
  );
}

function RateLine({
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
  const same = Math.abs(snapped - desired) < 0.02;
  return (
    <p>
      <span>
        {deck} ×{desired.toFixed(3)}
        {same ? '' : ` · el player usará ×${snapped}`}
      </span>
      <button type="button" onClick={() => onApply(deck, snapped)}>
        Aplicar en {deck}
      </button>
    </p>
  );
}
