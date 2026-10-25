import { describe, expect, it } from 'vitest';
import { peakIndex } from './peaks';
import { createScanner, planScan, scanCovers, stepScanner, type ScanPlan, type Scanner } from './sync-scan';

function playThrough(plan: ScanPlan, peak = 0.5): Scanner {
  let created = createScanner(plan);
  let scanner = created.scanner;
  let time = created.seekTo ?? 0;
  for (let guard = 0; guard < 8000; guard += 1) {
    const step = stepScanner(scanner, plan, time, peak);
    scanner = step.scanner;
    if (step.done) return scanner;
    if (step.seekTo != null) time = step.seekTo;
    else time += scanner.phase === 'dwell' ? plan.dwell : 0.5;
    if (time > plan.duration) time = plan.duration;
  }
  throw new Error('scan did not finish');
}

describe('sync scan', () => {
  it('plays a short track through and a long one as a covered overview', () => {
    const short = planScan(40);
    expect(short.mode).toBe('full');
    expect(short.bpm).toEqual({ start: 0, end: 40 });
    expect(scanCovers(short)).toBe(true);

    const long = planScan(180);
    expect(long.mode).toBe('sample');
    expect(long.bpm.end - long.bpm.start).toBe(32);
    expect(scanCovers(long)).toBe(true);
    expect(long.strides.length).toBeGreaterThan(4);
  });

  it('paints a full-length waveform while the playhead moves', () => {
    const plan = planScan(30);
    const scanner = playThrough(plan, 0.42);
    expect(scanner.phase).toBe('done');
    expect(scanner.bpmClosed).toBe(true);
    const mid = peakIndex(15, 30);
    expect(scanner.peaks[mid]).toBeGreaterThan(0.4);
    expect(scanner.peaks[0]).toBeGreaterThan(0);
  });

  it('seeks through a long track and paints each stride, not only the dwell', () => {
    const plan = planScan(120);
    expect(plan.mode).toBe('sample');
    const stride = plan.strides.find((span) => span.end - span.start > plan.dwell + 2);
    expect(stride).toBeTruthy();

    let created = createScanner(plan);
    let scanner = created.scanner;
    const seeks = created.seekTo == null ? [] : [created.seekTo];
    let time = created.seekTo ?? 0;
    let closed = 0;
    for (let guard = 0; guard < 8000 && scanner.phase !== 'done'; guard += 1) {
      const step = stepScanner(scanner, plan, time, 0.66);
      scanner = step.scanner;
      if (step.bpmJustClosed) closed += 1;
      if (step.seekTo != null) {
        seeks.push(step.seekTo);
        time = step.seekTo;
      } else time += scanner.phase === 'dwell' ? plan.dwell : 0.5;
      if (time > plan.duration) time = plan.duration;
    }

    expect(closed).toBe(1);
    expect(seeks[0]).toBeCloseTo(plan.bpm.start, 5);
    expect(scanner.phase).toBe('done');
    const early = peakIndex(stride!.start + 0.2, plan.duration);
    const late = peakIndex(stride!.end - 0.4, plan.duration);
    expect(late).toBeGreaterThan(early);
    expect(scanner.peaks[early]).toBeCloseTo(0.66, 5);
    expect(scanner.peaks[late]).toBeCloseTo(0.66, 5);
  });

  it('closes the BPM window once, then seeks to the first uncovered stride', () => {
    const plan = planScan(100);
    let { scanner } = createScanner(plan);
    let time = plan.bpm.start;
    let step = stepScanner(scanner, plan, time, 0.2);
    scanner = step.scanner;
    expect(scanner.phase).toBe('bpm');
    expect(step.bpmJustClosed).toBe(false);
    time = plan.bpm.end;
    step = stepScanner(scanner, plan, time, 0.2);
    expect(step.bpmJustClosed).toBe(true);
    expect(step.seekTo).toBe(plan.strides[0]?.start ?? null);
    expect(step.progress).toBeGreaterThan(0);
    expect(step.progress).toBeLessThan(1);
  });
});
