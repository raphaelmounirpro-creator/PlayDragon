import { Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Archer } from '../src/entities/foes/archer';
import { Foes, type Foe } from '../src/entities/foes/foe';
import { Guardian } from '../src/entities/foes/guardian';
import { Mage } from '../src/entities/foes/mage';
import { Queen } from '../src/entities/foes/queen';
import { Rival } from '../src/entities/foes/rival';
import { Director, type DirectorCastle } from '../src/game/director';
import { type Difficulty, difficultyById, NORMAL, scaledCount } from '../src/logic/difficulty';
import type { CastlePart } from '../src/world/castle';
import { LEVELS, type LevelDefinition, type VoyageEvent } from '../src/world/levels';
import { advance, fakeContext } from './fakes';

vi.mock('../src/fx/textures', () => import('./fakes').then((m) => m.blankTextures));

const CASTLE_Z = -6000;
const BOSS_CLASS = { guardian: Guardian, queen: Queen, rival: Rival };

/** A castle with every defender post, its keep standing unless told otherwise. */
function fakeCastle(towers: CastlePart[] = [], keepStanding = () => true): DirectorCastle {
  const post = (x: number, y: number) => ({ position: new Vector3(x, y, CASTLE_Z), outward: new Vector3(0, 0, 1) });
  return {
    archerPosts: (count) => Array.from({ length: count }, (_, i) => post(i * 20, 120)),
    magePost: () => post(0, 200),
    keepDome: () => ({ center: new Vector3(0, 150, CASTLE_Z), radius: 40, height: 60 }),
    standingParts: () => towers,
    isStanding: keepStanding,
  };
}

function setup(level: LevelDefinition, difficulty: Difficulty = NORMAL, castle = fakeCastle()) {
  const foes = new Foes();
  const announcements: string[] = [];
  const hooks = {
    announce: (text: string) => announcements.push(text),
    cue: () => {},
    frameAhead: (distance: number) => ({ point: new Vector3(0, 400, -distance), tangent: new Vector3(0, 0, -1), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0) }),
  };
  const director = new Director(level, difficulty, foes, castle, hooks, () => true);
  return { director, foes, announcements, defenders: foes.items.length };
}

/** A wyvern and a boss always come alone; other waves grow with the difficulty. */
function waveSize(event: VoyageEvent, difficulty: Difficulty): number {
  return event.type === 'wyvern' || event.type === 'boss' ? 1 : scaledCount(event.count, difficulty);
}

const isDefender = (foe: Foe) => foe instanceof Archer || foe instanceof Mage;

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('Director', () => {
  it.each(LEVELS.map((level) => [level.name, level] as const))('%s: each wave arrives once, when the journey reaches it', (_, level) => {
    const { director, foes, defenders } = setup(level);
    const { ctx } = fakeContext();
    director.updateVoyage(level.events[0].at - 0.01, ctx);
    expect(foes.items).toHaveLength(defenders);
    for (const event of level.events) {
      director.updateVoyage(event.at, ctx);
      director.updateVoyage(event.at, ctx);
      const reached = level.events.filter((e) => e.at <= event.at);
      expect(foes.items.length - defenders).toBe(reached.reduce((sum, e) => sum + waveSize(e, NORMAL), 0));
    }
  });

  it('sends bigger waves in Difficile and smaller ones in Facile', () => {
    const spawned = (difficulty: Difficulty) => {
      const { director, foes, defenders } = setup(LEVELS[0], difficulty);
      director.updateVoyage(1, fakeContext().ctx);
      return foes.items.length - defenders;
    };
    expect(spawned(difficultyById('facile'))).toBeLessThan(spawned(NORMAL));
    expect(spawned(NORMAL)).toBeLessThan(spawned(difficultyById('difficile')));
  });

  it('ends each level with its own boss, who bars the route until it falls', () => {
    expect(new Set(LEVELS.map((level) => level.boss)).size).toBe(LEVELS.length);
    for (const level of LEVELS) {
      const { director, foes } = setup(level);
      director.updateVoyage(1, fakeContext().ctx);
      const boss = foes.boss();
      expect(boss).toBeInstanceOf(BOSS_CLASS[level.boss]);
      expect(director.routeBlocked()).toBe(true);
      boss!.health = 0;
      expect(director.routeBlocked()).toBe(false);
    }
  });

  it('posts the archers from the start, but they only shoot once the siege begins', () => {
    const level = LEVELS[0];
    const { director, foes } = setup(level);
    expect(foes.items.filter((foe) => foe instanceof Archer)).toHaveLength(level.castle.archers);
    const { ctx, log } = fakeContext({ dragon: new Vector3(0, 300, CASTLE_Z + 400) });
    advance(6, (dt) => foes.update(dt, ctx), ctx);
    expect(log.shots).toEqual([]);
    director.beginSiege();
    advance(6, (dt) => foes.update(dt, ctx), ctx);
    expect(log.shots.some((shot) => shot.kind === 'quarrel')).toBe(true);
  });

  it('at the siege, the enemies of the journey fly away and the mage is announced', () => {
    const level = LEVELS.find((l) => l.castle.mage)!;
    const { director, foes, announcements } = setup(level);
    const { ctx } = fakeContext();
    director.updateVoyage(0.3, ctx);
    const travellers = foes.items.filter((foe) => !isDefender(foe));
    expect(travellers.length).toBeGreaterThan(0);
    director.beginSiege();
    expect(announcements.some((text) => text.startsWith('Un mage protège le donjon'))).toBe(true);
    advance(4, (dt) => foes.update(dt, ctx), ctx);
    expect(foes.items.some((foe) => travellers.includes(foe))).toBe(false);
    expect(foes.items.every(isDefender)).toBe(true);
  });

  it('standing towers shoot bolts at the dragon, and the mage falls with the keep', () => {
    const tower = { id: 'tour', top: new Vector3(40, 150, CASTLE_Z) } as CastlePart;
    let keepStanding = true;
    const level = LEVELS.find((l) => l.castle.mage)!;
    const { director, foes } = setup(level, NORMAL, fakeCastle([tower], () => keepStanding));
    const { ctx, log } = fakeContext();
    advance(10, (dt) => director.updateSiege(dt, ctx), ctx);
    const bolts = log.shots.filter((shot) => shot.kind === 'bolt');
    expect(bolts.length).toBeGreaterThan(0);
    expect(bolts.every((shot) => shot.from.equals(tower.top) && shot.target.equals(ctx.dragon))).toBe(true);
    const mage = foes.items.find((foe) => foe instanceof Mage)!;
    expect(mage.alive).toBe(true);
    keepStanding = false;
    director.updateSiege(1 / 30, ctx);
    expect(mage.alive).toBe(false);
  });

  it('takes every defender down with the castle', () => {
    const { director, foes } = setup(LEVELS[2]);
    director.collapse();
    expect(foes.items.length).toBeGreaterThan(0);
    expect(foes.items.every((foe) => !foe.alive)).toBe(true);
  });
});
