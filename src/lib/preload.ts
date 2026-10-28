/** YouTube PlayerState.PLAYING */
export const YT_PLAYING = 1;

export type PrerollPhase = 'idle' | 'armed' | 'done';

/** Muted preroll: play until PLAYING, then pause at 0 so the start is already buffered. */
export function prerollFromState(phase: PrerollPhase, ytState: number): { phase: PrerollPhase; finish: boolean } {
  if (phase === 'armed' && ytState === YT_PLAYING) return { phase: 'done', finish: true };
  return { phase, finish: false };
}
