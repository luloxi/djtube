import { describe, expect, it } from 'vitest';
import { beatMarks, nextBeatDelay, planSyncedStart } from './beats';

describe('beat grid', () => {
  it('draws downbeats on a manual offset', () => {
    const bpm = 120;
    const period = 0.5;
    const offset = 0.2;
    const marks = beatMarks(bpm, offset, 2);
    expect(marks[0]?.downbeat).toBe(true);
    expect(marks.filter((mark) => mark.downbeat).length).toBeGreaterThan(0);
    expect(marks.every((mark) => mark.time >= 0 && mark.time < 2)).toBe(true);
    expect(marks[1].time - marks[0].time).toBeCloseTo(period, 2);
    expect(beatMarks(null, 0, 10)).toEqual([]);
    expect(beatMarks(120, null, 10)).toEqual([]);
  });

  it('waits until the leader beat', () => {
    expect(nextBeatDelay(1.0, 120, 0)).toBe(0);
    expect(nextBeatDelay(1.1, 120, 0)).toBeCloseTo(0.4, 2);
    const plan = planSyncedStart({
      leaderTime: 1.1,
      leaderBpm: 120,
      leaderOffset: 0,
      leaderRate: 1,
      leaderPlaying: true,
    });
    expect(plan).toEqual({ delayMs: 400 });
    const paused = planSyncedStart({
      leaderTime: 1.1,
      leaderBpm: 120,
      leaderOffset: 0,
      leaderRate: 2,
      leaderPlaying: false,
    });
    expect(paused).toEqual({ delayMs: 0 });
    expect(planSyncedStart({ ...pausedInput(), leaderBpm: null })).toBeNull();
  });

});

function pausedInput() {
  return {
    leaderTime: 0,
    leaderBpm: 120 as number | null,
    leaderOffset: 0,
    leaderRate: 1,
    leaderPlaying: false,
  };
}
