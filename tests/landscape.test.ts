import { describe, expect, it } from 'vitest';
import { FLIGHT_ALTITUDE, PATH_LENGTH } from '../src/config';
import { Landscape } from '../src/world/landscape';
import { LEVELS } from '../src/world/levels';

describe.each(LEVELS.map((level) => [level.name, new Landscape(level.terrain)] as const))('landscape « %s »', (_name, land) => {
  it('keeps the river valley low', () => {
    for (let z = 0; z > -PATH_LENGTH + 600; z -= 250) {
      expect(land.terrainHeight(land.riverX(z), z)).toBeLessThan(30);
    }
  });

  it('keeps the dragon route above the terrain, even at the edges of the steering box', () => {
    const curve = land.createFlightCurve();
    for (let i = 0; i <= 100; i++) {
      const p = curve.getPointAt(i / 100);
      for (const offset of [-130, 0, 130]) {
        expect(p.y - land.terrainHeight(p.x + offset, p.z)).toBeGreaterThan(40);
      }
    }
    expect(curve.getPointAt(0.5).y).toBeCloseTo(FLIGHT_ALTITUDE);
  });

  it('places the castle on a hill at the end of the path', () => {
    const castle = land.castlePosition();
    expect(castle.z).toBe(-PATH_LENGTH);
    expect(land.terrainHeight(castle.x, castle.z)).toBeGreaterThanOrEqual(castle.y - 1);
  });

  it('keeps an open basin around the castle so the dragon can circle it', () => {
    const castle = land.castlePosition();
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
      for (const radius of [320, 400, 480, 560]) {
        const x = castle.x + Math.cos(angle) * radius;
        const z = castle.z + Math.sin(angle) * radius;
        expect(land.terrainHeight(x, z)).toBeLessThan(castle.y);
      }
    }
  });
});

describe('levels', () => {
  it('end every journey with its boss, after the other events', () => {
    for (const level of LEVELS) {
      const ats = level.events.map((e) => e.at);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(level.events[level.events.length - 1].type).toBe('boss');
    }
  });
});
