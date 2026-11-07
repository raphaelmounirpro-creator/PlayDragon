import { describe, expect, it } from 'vitest';
import { DRAGON_MAX_HP, UPGRADES } from '../src/config';
import { Abilities, definition } from '../src/logic/abilities';
import { GameState } from '../src/logic/gameState';
import { Progression } from '../src/logic/progression';
import type { KeyValueStorage } from '../src/logic/records';

function memoryStorage(): KeyValueStorage {
  const data: Record<string, string> = {};
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

describe('Progression', () => {
  it('rewards gold after a run, more after a victory', () => {
    const progression = new Progression(memoryStorage());
    expect(progression.reward(1000, false)).toBe(100);
    expect(progression.reward(1000, true)).toBe(150);
    expect(progression.gold).toBe(250);
  });

  it('buys ranks in order and refuses when gold is short or the upgrade is complete', () => {
    const progression = new Progression(memoryStorage());
    expect(progression.buy('vitality')).toBe(false);
    progression.reward(100000, false);
    for (const cost of UPGRADES.vitality.costs) {
      expect(progression.nextCost('vitality')).toBe(cost);
      expect(progression.buy('vitality')).toBe(true);
    }
    expect(progression.nextCost('vitality')).toBeNull();
    expect(progression.buy('vitality')).toBe(false);
    expect(progression.rank('vitality')).toBe(3);
  });

  it('turns ranks into run modifiers', () => {
    const progression = new Progression(memoryStorage());
    progression.reward(100000, false);
    progression.buy('vitality');
    progression.buy('scales');
    progression.buy('fireRate');
    progression.buy('mastery');
    const modifiers = progression.modifiers();
    expect(modifiers.maxHp).toBe(DRAGON_MAX_HP + UPGRADES.vitality.perRank);
    expect(modifiers.damageTaken).toBeCloseTo(1 - UPGRADES.scales.perRank);
    expect(modifiers.fireCooldown).toBeCloseTo(1 - UPGRADES.fireRate.perRank);
    expect(modifiers.powerCost).toBeCloseTo(1 - UPGRADES.mastery.perRank);
  });

  it('keeps the treasure between sessions', () => {
    const storage = memoryStorage();
    const first = new Progression(storage);
    first.reward(5000, false);
    first.buy('scales');
    const second = new Progression(storage);
    expect(second.rank('scales')).toBe(1);
    expect(second.gold).toBe(500 - UPGRADES.scales.costs[0]);
  });
});

describe('upgrades in a run', () => {
  it('raise the maximum health and soften the hits', () => {
    const state = new GameState();
    state.start(undefined, { maxHp: 140, damageTaken: 0.5 });
    expect(state.dragonHp).toBe(140);
    state.damageDragon(20);
    expect(state.dragonHp).toBe(130);
    state.heal(100);
    expect(state.dragonHp).toBe(140);
  });

  it('make powers cheaper', () => {
    const state = new GameState();
    state.start();
    state.score = 1000;
    const abilities = new Abilities();
    abilities.reset(0.5);
    expect(abilities.cost('meteor')).toBe(Math.round(definition('meteor').cost * 0.5));
    abilities.activate('meteor', state);
    expect(state.score).toBe(1000 - abilities.cost('meteor'));
  });
});
