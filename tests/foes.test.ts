import { Material, Mesh, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAT, GARGOYLE, GUARDIAN, QUEEN, RIVAL, SHOOTER } from '../src/config';
import { Bat } from '../src/entities/foes/bat';
import { Foes, type Foe } from '../src/entities/foes/foe';
import { DiverGargoyle } from '../src/entities/foes/gargoyle';
import { Guardian } from '../src/entities/foes/guardian';
import { Queen } from '../src/entities/foes/queen';
import { Rival } from '../src/entities/foes/rival';
import { ShooterGargoyle } from '../src/entities/foes/shooter';
import { difficultyById } from '../src/logic/difficulty';
import { advance, fakeContext } from './fakes';

vi.mock('../src/fx/textures', () => import('./fakes').then((m) => m.blankTextures));

/** `distance` units ahead of the dragon of `fakeContext`, where the bosses hold their ground. */
const ahead = (distance: number, up = 0) => new Vector3(0, 400 + up, -distance);
const amounts = (hits: Array<{ amount: number }>) => hits.map((hit) => hit.amount);
const shotsOf = (shots: Array<{ kind: string }>, kind: string) => shots.filter((shot) => shot.kind === kind).length;

// Enemies draw lots for their timings and weaving: a fixed draw makes every run the same.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DiverGargoyle', () => {
  it('dives at the dragon', () => {
    const { ctx } = fakeContext();
    const gargoyle = new DiverGargoyle(ahead(300), 1);
    advance(1, (dt) => gargoyle.update(dt, ctx), ctx);
    expect(gargoyle.position.distanceTo(ctx.dragon)).toBeLessThan(260);
  });

  it('hurts the dragon on contact and dies doing it', () => {
    const { ctx, log } = fakeContext();
    const gargoyle = new DiverGargoyle(ahead(5), 1);
    gargoyle.update(1 / 30, ctx);
    expect(amounts(log.hits)).toEqual([GARGOYLE.contactDamage]);
    expect(gargoyle.alive).toBe(false);
  });

  it('gives up once the dragon has flown past it', () => {
    const { ctx, log } = fakeContext();
    const gargoyle = new DiverGargoyle(ahead(-200), 1);
    gargoyle.update(1 / 30, ctx);
    expect(gargoyle.gone).toBe(true);
    expect(log.hits).toEqual([]);
  });
});

describe('ShooterGargoyle', () => {
  it('keeps ahead of the dragon and spits stones at it', () => {
    const { ctx, log } = fakeContext();
    const shooter = new ShooterGargoyle(ahead(900, 80), 2);
    advance(8, (dt) => shooter.update(dt, ctx), ctx);
    expect(shooter.position.clone().sub(ctx.dragon).dot(ctx.heading)).toBeGreaterThan(SHOOTER.distanceAhead / 2);
    expect(log.shots.length).toBeGreaterThan(0);
    expect(log.shots.every((shot) => shot.kind === 'stone' && shot.target.equals(ctx.dragon))).toBe(true);
    expect(log.cues).toContain('spit');
  });

  it('fires more often in Difficile than in Facile', () => {
    const shots = (difficulty: string) => {
      const { ctx, log } = fakeContext({ difficulty: difficultyById(difficulty) });
      const shooter = new ShooterGargoyle(ahead(SHOOTER.distanceAhead), 2);
      advance(12, (dt) => shooter.update(dt, ctx), ctx);
      return log.shots.length;
    };
    expect(shots('difficile')).toBeGreaterThan(shots('facile'));
  });

  it('flies away when its time is up', () => {
    const { ctx } = fakeContext();
    const shooter = new ShooterGargoyle(ahead(SHOOTER.distanceAhead), 2);
    advance(SHOOTER.stay + 4, (dt) => shooter.update(dt, ctx), ctx);
    expect(shooter.gone).toBe(true);
  });
});

describe('Bat', () => {
  it('bites when it dives on the dragon, then waits before biting again', () => {
    const { ctx, log } = fakeContext();
    const bat = new Bat(ahead(30));
    advance(12, (dt) => bat.update(dt, ctx), ctx);
    expect(log.hits.length).toBeGreaterThan(0);
    expect(amounts(log.hits).every((amount) => amount === BAT.bite)).toBe(true);
    const gaps = log.hits.slice(1).map((hit, i) => hit.time - log.hits[i].time);
    expect(gaps.every((gap) => gap >= BAT.biteCooldown)).toBe(true);
    expect(log.cues).toContain('chirp');
  });

  it('is fragile, and leaves after a while', () => {
    const { ctx } = fakeContext();
    const bat = new Bat(ahead(30));
    expect(bat.fragile).toBe(true);
    advance(BAT.lifetime + 4, (dt) => bat.update(dt, ctx), ctx);
    expect(bat.gone).toBe(true);
  });
});

describe('Guardian', () => {
  it('throws boulders, then roars, shakes the camera and charges the dragon', () => {
    const { ctx, log } = fakeContext();
    const guardian = new Guardian(ahead(GUARDIAN.holdDistance, -20), GUARDIAN.health);
    advance(GUARDIAN.chargeEvery + GUARDIAN.windup + 2, (dt) => guardian.update(dt, ctx), ctx);
    expect(shotsOf(log.shots, 'boulder')).toBeGreaterThanOrEqual(2);
    expect(log.cues).toContain('roar');
    expect(log.shakes.length).toBeGreaterThan(0);
    expect(amounts(log.hits)).toEqual([GUARDIAN.chargeDamage]);
  });
});

describe('Queen', () => {
  it('screeches sound waves and calls bat swarms to her aid', () => {
    const { ctx, log } = fakeContext();
    const queen = new Queen(ahead(QUEEN.holdDistance, -10), QUEEN.health);
    advance(8, (dt) => queen.update(dt, ctx), ctx);
    expect(shotsOf(log.shots, 'wave')).toBeGreaterThanOrEqual(3);
    expect(log.summoned).toHaveLength(QUEEN.summonCount);
    expect(log.summoned.every((foe) => foe instanceof Bat)).toBe(true);
  });

  it('dives on the dragon after a warning', () => {
    const { ctx, log } = fakeContext();
    const queen = new Queen(ahead(QUEEN.holdDistance, -10), QUEEN.health);
    advance(QUEEN.diveEvery + QUEEN.windup + 2, (dt) => queen.update(dt, ctx), ctx);
    expect(log.shakes.length).toBeGreaterThan(0);
    expect(amounts(log.hits)).toEqual([QUEEN.diveDamage]);
  });
});

describe('Rival', () => {
  it('fires volleys, sweeps its breath across the path, then swoops past the dragon', () => {
    const { ctx, log } = fakeContext();
    const rival = new Rival(ahead(RIVAL.holdDistance), RIVAL.health);
    advance(RIVAL.volleyEvery + 0.1, (dt) => rival.update(dt, ctx), ctx);
    const volley = shotsOf(log.shots, 'flame');
    expect(volley).toBeGreaterThanOrEqual(3);
    advance(RIVAL.breathEvery - RIVAL.volleyEvery + RIVAL.breathWindup + RIVAL.breathTime, (dt) => rival.update(dt, ctx), ctx);
    expect(log.cues).toContain('roar');
    expect(shotsOf(log.shots, 'flame')).toBeGreaterThan(volley + 5);
    advance(8, (dt) => rival.update(dt, ctx), ctx);
    expect(amounts(log.hits)).toContain(RIVAL.swoopDamage);
  });
});

describe('every boss', () => {
  it('has its name for the health bar and a boss warning arrow', () => {
    const bosses: Foe[] = [new Guardian(ahead(200), 1), new Queen(ahead(200), 1), new Rival(ahead(200), 1)];
    expect(new Set(bosses.map((boss) => boss.bossName)).size).toBe(3);
    expect(bosses.every((boss) => boss.indicator === 'boss')).toBe(true);
  });
});

describe('hit flash', () => {
  it('turns the enemy white-hot for a blink, then gives it back its materials', () => {
    const guardian = new Guardian(ahead(200), 10);
    const materials = () => {
      const list: Array<Material | Material[]> = [];
      guardian.object.traverse((child) => {
        if ((child as Mesh).isMesh) list.push((child as Mesh).material);
      });
      return list;
    };
    const original = materials();
    guardian.hit(1);
    guardian.tickFlash(1 / 60);
    const flashed = materials();
    expect(new Set(flashed).size).toBe(1);
    expect(original).not.toContain(flashed[0]);
    guardian.tickFlash(0.2);
    guardian.tickFlash(1 / 60);
    expect(materials().every((material, i) => material === original[i])).toBe(true);
  });
});

describe('Foes', () => {
  it('finds the enemy at a point, those around a blast, and the boss', () => {
    const foes = new Foes();
    const gargoyle = new DiverGargoyle(new Vector3(0, 0, 0), 1);
    const guardian = new Guardian(new Vector3(500, 0, 0), 10);
    foes.add(gargoyle);
    foes.add(guardian);
    expect(foes.at(new Vector3(5, 0, 0))).toBe(gargoyle);
    expect(foes.at(new Vector3(100, 0, 0))).toBeUndefined();
    expect(foes.within(new Vector3(450, 0, 0), 20)).toEqual([guardian]);
    expect(foes.boss()).toBe(guardian);
  });

  it('removes the dead and measures how fast the living fly', () => {
    const { ctx } = fakeContext();
    const foes = new Foes();
    const gargoyle = new DiverGargoyle(ahead(300), 1);
    const guardian = new Guardian(ahead(GUARDIAN.holdDistance), 10);
    foes.add(gargoyle);
    foes.add(guardian);
    guardian.health = 0;
    advance(0.5, (dt) => foes.update(dt, ctx), ctx);
    expect(foes.items).toEqual([gargoyle]);
    expect(foes.boss()).toBeUndefined();
    expect(gargoyle.velocity.length()).toBeGreaterThan(0);
  });
});
