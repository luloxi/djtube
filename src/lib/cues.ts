export const CUE_SLOTS = 4;

export type HotCues = [number | null, number | null, number | null, number | null];

export function emptyCues(): HotCues {
  return [null, null, null, null];
}

export function parseHotCues(value: unknown): HotCues {
  const next = emptyCues();
  if (!Array.isArray(value)) return next;
  for (let i = 0; i < CUE_SLOTS; i += 1) {
    const time = value[i];
    if (typeof time === 'number' && Number.isFinite(time) && time >= 0) next[i] = time;
  }
  return next;
}

export function setCue(cues: HotCues, index: number, time: number): HotCues {
  if (index < 0 || index >= CUE_SLOTS || !Number.isFinite(time) || time < 0) return cues;
  const next = [...cues] as HotCues;
  next[index] = time;
  return next;
}

export function clearCue(cues: HotCues, index: number): HotCues {
  if (index < 0 || index >= CUE_SLOTS) return cues;
  const next = [...cues] as HotCues;
  next[index] = null;
  return next;
}
