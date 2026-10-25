import { paintPeaks, PEAK_BUCKETS } from './peaks';

export const SCAN_DEFAULTS = {
  /** Continuous media seconds used for BPM. Played at the deck's fastest rate. */
  bpmSpan: 32,
  /** Width of each waveform sample, in media seconds. */
  stride: 12,
  /** Media seconds listened inside each stride. The peak is painted across the whole stride. */
  dwell: 1,
  /** At or under this length the track is played through, which is already a full overview at 2×. */
  fullLimit: 48,
};

export type Span = { start: number; end: number };

export type ScanPlan = {
  mode: 'full' | 'sample';
  duration: number;
  bpm: Span;
  strides: Span[];
  dwell: number;
};

export function planScan(duration: number, options?: Partial<typeof SCAN_DEFAULTS>): ScanPlan {
  const cfg = { ...SCAN_DEFAULTS, ...options };
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const dwell = cfg.dwell > 0 ? cfg.dwell : SCAN_DEFAULTS.dwell;
  if (!(total > cfg.fullLimit)) {
    return { mode: 'full', duration: total, bpm: { start: 0, end: total }, strides: [], dwell };
  }
  const span = Math.min(cfg.bpmSpan, total);
  const lead = Math.min(12, Math.max(0, total * 0.05));
  const bpmStart = Math.min(lead, Math.max(0, total - span));
  const bpmEnd = Math.min(total, bpmStart + span);
  const strides: Span[] = [];
  const step = cfg.stride > 0 ? cfg.stride : SCAN_DEFAULTS.stride;
  for (let start = 0; start < total - 0.05; start += step) {
    const end = Math.min(total, start + step);
    const overlap = Math.max(0, Math.min(end, bpmEnd) - Math.max(start, bpmStart));
    if (end - start - overlap < 0.35) continue;
    strides.push({ start, end });
  }
  return {
    mode: strides.length ? 'sample' : 'full',
    duration: total,
    bpm: { start: bpmStart, end: bpmEnd },
    strides,
    dwell,
  };
}

/** True when the BPM window and the strides together cover the track. */
export function scanCovers(plan: ScanPlan, samples = 800): boolean {
  if (!(plan.duration > 0)) return true;
  const step = plan.duration / samples;
  for (let i = 0; i < samples; i += 1) {
    const time = Math.min(plan.duration - 1e-6, i * step);
    const inBpm = time >= plan.bpm.start && time < plan.bpm.end;
    const inStride = plan.strides.some((span) => time >= span.start && time < span.end);
    if (!inBpm && !inStride) return false;
  }
  return true;
}

export type ScanPhase = 'seek-bpm' | 'bpm' | 'seek-stride' | 'dwell' | 'done';

export type Scanner = {
  phase: ScanPhase;
  strideIndex: number;
  origin: number;
  lastPaint: number;
  level: number;
  peaks: number[];
  bpmClosed: boolean;
};

export type ScanStep = {
  scanner: Scanner;
  seekTo: number | null;
  bpmJustClosed: boolean;
  progress: number;
  done: boolean;
};

export function createScanner(plan: ScanPlan): { scanner: Scanner; seekTo: number | null } {
  const peaks = new Array<number>(PEAK_BUCKETS).fill(0);
  if (plan.bpm.start > 0.2) {
    return {
      scanner: {
        phase: 'seek-bpm',
        strideIndex: 0,
        origin: plan.bpm.start,
        lastPaint: plan.bpm.start,
        level: 0,
        peaks,
        bpmClosed: false,
      },
      seekTo: plan.bpm.start,
    };
  }
  return {
    scanner: {
      phase: 'bpm',
      strideIndex: 0,
      origin: 0,
      lastPaint: 0,
      level: 0,
      peaks,
      bpmClosed: false,
    },
    seekTo: null,
  };
}

export function scanProgress(scanner: Scanner, plan: ScanPlan, time: number): number {
  if (scanner.phase === 'done') return 1;
  if (!(plan.duration > 0)) return 0;
  if (plan.mode === 'full') return Math.min(1, Math.max(0, time / plan.duration));
  const pieces = 1 + plan.strides.length;
  let done = 0;
  if (scanner.phase === 'seek-bpm') done = 0;
  else if (scanner.phase === 'bpm') {
    const span = Math.max(0.001, plan.bpm.end - plan.bpm.start);
    done = Math.min(1, Math.max(0, (time - plan.bpm.start) / span));
  } else {
    done = 1 + scanner.strideIndex;
    if (scanner.phase === 'dwell') {
      const dwell = Math.max(0.001, plan.dwell);
      done += Math.min(0.999, Math.max(0, (time - scanner.origin) / dwell));
    }
  }
  return Math.min(1, done / pieces);
}

function pack(scanner: Scanner, plan: ScanPlan, time: number, seekTo: number | null, bpmJustClosed: boolean): ScanStep {
  const done = scanner.phase === 'done';
  return {
    scanner,
    seekTo,
    bpmJustClosed,
    progress: done ? 1 : scanProgress(scanner, plan, time),
    done,
  };
}

function landed(time: number, target: number): boolean {
  return time >= target - 0.15 && time <= target + 1.25;
}

export function stepScanner(scanner: Scanner, plan: ScanPlan, time: number, peak: number): ScanStep {
  const heard = Number.isFinite(peak) ? Math.max(0, peak) : 0;
  if (scanner.phase === 'done') return pack(scanner, plan, time, null, false);

  if (scanner.phase === 'seek-bpm') {
    if (!landed(time, plan.bpm.start) && time < plan.bpm.start) return pack(scanner, plan, time, null, false);
    return pack({ ...scanner, phase: 'bpm', origin: time, lastPaint: time, level: heard }, plan, time, null, false);
  }

  if (scanner.phase === 'bpm') {
    const backward = time + 0.35 < scanner.lastPaint;
    const forwardJump = time - scanner.lastPaint > 3;
    let peaks = scanner.peaks;
    if (!backward && !forwardJump && plan.duration > 0) {
      peaks = paintPeaks(scanner.peaks, scanner.lastPaint, time, plan.duration, Math.max(scanner.level, heard));
    }
    const level = Math.max(backward ? 0 : scanner.level, heard);
    const reached = plan.bpm.end <= plan.bpm.start + 0.05 ? time > 0 : time >= plan.bpm.end - 0.08;
    if (!reached) return pack({ ...scanner, peaks, level, lastPaint: time }, plan, time, null, false);
    const closing = !scanner.bpmClosed;
    if (plan.mode === 'full' || plan.strides.length === 0) {
      return pack({ ...scanner, peaks, level, lastPaint: time, phase: 'done', bpmClosed: true }, plan, time, null, closing);
    }
    const target = plan.strides[0].start;
    return pack(
      { ...scanner, peaks, level: 0, lastPaint: time, phase: 'seek-stride', strideIndex: 0, origin: target, bpmClosed: true },
      plan,
      time,
      target,
      closing,
    );
  }

  if (scanner.phase === 'seek-stride') {
    const stride = plan.strides[scanner.strideIndex];
    if (!stride) return pack({ ...scanner, phase: 'done' }, plan, time, null, false);
    if (!landed(time, stride.start) && time < stride.start) return pack(scanner, plan, time, null, false);
    return pack({ ...scanner, phase: 'dwell', origin: time, level: heard, lastPaint: time }, plan, time, null, false);
  }

  const stride = plan.strides[scanner.strideIndex];
  if (!stride) return pack({ ...scanner, phase: 'done' }, plan, time, null, false);
  const level = Math.max(scanner.level, heard);
  const dwellDone = time >= scanner.origin + plan.dwell || time >= stride.end - 0.02;
  if (!dwellDone) return pack({ ...scanner, level, lastPaint: time }, plan, time, null, false);
  const peaks = plan.duration > 0 ? paintPeaks(scanner.peaks, stride.start, Math.max(stride.start, stride.end - 0.001), plan.duration, level) : scanner.peaks;
  const strideIndex = scanner.strideIndex + 1;
  const following = plan.strides[strideIndex];
  if (!following) return pack({ ...scanner, peaks, level, phase: 'done', strideIndex, lastPaint: time }, plan, time, null, false);
  return pack(
    { ...scanner, peaks, level: 0, phase: 'seek-stride', strideIndex, origin: following.start, lastPaint: time },
    plan,
    time,
    following.start,
    false,
  );
}
