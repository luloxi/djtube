import { beatMarks } from '../lib/beats';

export function BeatGrid({ bpm, offset, duration }: { bpm: number | null; offset: number | null; duration: number }) {
  const marks = beatMarks(bpm, offset, duration);
  if (!marks.length || !(duration > 0)) return null;
  return (
    <svg className="beat-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {marks.map((mark) => {
        const x = (mark.time / duration) * 100;
        return <line key={mark.time.toFixed(4)} x1={x} x2={x} y1={0} y2={100} className={mark.downbeat ? 'beat-down' : 'beat-line'} />;
      })}
    </svg>
  );
}
