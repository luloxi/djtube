import { describe, expect, it } from 'vitest';
import { beatMarks, beatOffsetFromOnsets, easeRateLadder, nextBeatDelay, onsetTimes, planSyncedStart } from './beats';

describe('beat grid', () => {
  it('finds a steady offset and draws downbeats on that pulse', () => {
    const bpm = 120;
    const period = 0.5;
    const onsets = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7];
    const offset = beatOffsetFromOnsets(onsets, bpm);
    expect(offset).toBeCloseTo(0.2, 1);
    const marks = beatMarks(bpm, offset, 2);
    expect(marks[0]?.downbeat).toBe(true);
    expect(marks.filter((mark) => mark.downbeat).length).toBeGreaterThan(0);
    expect(marks.every((mark) => mark.time >= 0 && mark.time < 2)).toBe(true);
    expect(marks[1].time - marks[0].time).toBeCloseTo(period, 2);
    expect(beatMarks(null, 0, 10)).toEqual([]);
    expect(beatMarks(120, null, 10)).toEqual([]);
  });

  it('waits until the leader beat, and can nudge toward a matching rate', () => {
    expect(nextBeatDelay(1.0, 120, 0)).toBe(0);
    expect(nextBeatDelay(1.1, 120, 0)).toBeCloseTo(0.4, 2);
    const plan = planSyncedStart({
      leaderTime: 1.1,
      leaderBpm: 120,
      leaderOffset: 0,
      leaderRate: 1,
      leaderPlaying: true,
      followerBpm: 100,
      available: [1, 1.25, 1.5],
      nudge: true,
    });
    expect(plan?.delayMs).toBe(400);
    expect(plan?.matchRate).toBe(1.25);
    const paused = planSyncedStart({
      leaderTime: 1.1,
      leaderBpm: 120,
      leaderOffset: 0,
      leaderRate: 2,
      leaderPlaying: false,
      followerBpm: 120,
      available: [1, 2],
      nudge: false,
    });
    expect(paused).toEqual({ delayMs: 0, matchRate: null });
    expect(planSyncedStart({ ...pausedInput(), leaderBpm: null })).toBeNull();
  });

  it('eases back through the rates YouTube actually offers', () => {
    expect(easeRateLadder(1.5, 1, [0.5, 1, 1.25, 1.5, 2])).toEqual([1.25, 1]);
    expect(easeRateLadder(0.5, 1, [0.5, 0.75, 1, 1.25])).toEqual([0.75, 1]);
    expect(easeRateLadder(1, 1, [1, 1.25])).toEqual([]);
  });

  it('picks impulses out of a click track', () => {
    const sampleRate = 1000;
    const channel = new Float32Array(sampleRate * 3);
    for (const at of [200, 700, 1200, 1700, 2200, 2700]) channel[at] = 1;
    const times = onsetTimes(channel, sampleRate);
    expect(times.length).toBeGreaterThanOrEqual(4);
    expect(times[0]).toBeGreaterThan(0.1);
    expect(times[0]).toBeLessThan(0.35);
  });
});

function pausedInput() {
  return {
    leaderTime: 0,
    leaderBpm: 120 as number | null,
    leaderOffset: 0,
    leaderRate: 1,
    leaderPlaying: false,
    followerBpm: 120,
    available: [1],
    nudge: false,
  };
}
