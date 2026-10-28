import { describe, expect, it } from 'vitest';
import { prerollFromState } from './preload';

describe('muted preroll', () => {
  it('finishes when the muted play reaches PLAYING', () => {
    expect(prerollFromState('idle', 1)).toEqual({ phase: 'idle', finish: false });
    expect(prerollFromState('armed', 3)).toEqual({ phase: 'armed', finish: false });
    expect(prerollFromState('armed', 1)).toEqual({ phase: 'done', finish: true });
    expect(prerollFromState('done', 1)).toEqual({ phase: 'done', finish: false });
  });
});
