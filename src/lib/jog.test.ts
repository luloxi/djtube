import { describe, expect, it } from 'vitest';
import { SECONDS_PER_REV, discAngle, jogTarget, jogTransport } from './jog';

describe('disc jog', () => {
  it('turns with the playhead and seeks by the same angle', () => {
    expect(discAngle(0)).toBe(0);
    expect(discAngle(SECONDS_PER_REV)).toBeCloseTo(360, 4);
    expect(jogTarget(10, 180)).toBeCloseTo(10 + SECONDS_PER_REV / 2, 4);
    expect(jogTarget(0.2, -360)).toBe(0);
  });

  it('speeds up going forward and pauses going backward', () => {
    const rates = [0.25, 0.5, 1, 1.25, 1.5, 2];
    expect(jogTransport(0, rates, 1)).toEqual({ rate: 1, pause: false });
    expect(jogTransport(1.2, rates, 1).pause).toBe(false);
    expect(jogTransport(1.2, rates, 1).rate).toBeGreaterThan(1);
    expect(jogTransport(-0.8, rates, 1)).toEqual({ rate: null, pause: true });
  });
});
