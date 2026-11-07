import { describe, expect, it } from 'vitest';
import { EmissionRate } from '../src/fx/particles';

describe('EmissionRate', () => {
  it('emits as many flames per second at 30, 60 or 165 frames per second', () => {
    for (const fps of [30, 60, 165]) {
      const rate = new EmissionRate(160);
      let total = 0;
      for (let frame = 0; frame < fps * 2; frame++) total += rate.count(1 / fps);
      expect(total).toBeGreaterThanOrEqual(319);
      expect(total).toBeLessThanOrEqual(320);
    }
  });
});
