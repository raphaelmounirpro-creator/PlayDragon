import { describe, expect, it } from 'vitest';
import { DRAGON_MAX_HP, PART_SCORE, RING_SCORE } from '../src/config';
import { DIFFICULTIES, difficultyById } from '../src/logic/difficulty';
import { GameState } from '../src/logic/gameState';

function siegeWithParts(shielded: string | null = null): GameState {
  const state = new GameState();
  state.setCastle([{ id: 'tower', hp: 2 }, { id: 'keep', hp: 3 }], shielded);
  state.start();
  state.beginSiege();
  return state;
}

describe('GameState', () => {
  it('starts a voyage with full health and no score', () => {
    const state = new GameState();
    state.start();
    expect(state.phase).toBe('voyage');
    expect(state.dragonHp).toBe(DRAGON_MAX_HP);
    expect(state.score).toBe(0);
  });

  it('adds score for rings and for enemies shot down, only during a game', () => {
    const state = new GameState();
    state.addKill(150);
    expect(state.score).toBe(0);
    state.start();
    state.collectRing();
    state.addKill(150);
    expect(state.score).toBe(RING_SCORE + 150);
  });

  it('ends in defeat when the dragon runs out of health', () => {
    const state = new GameState();
    state.start();
    state.damageDragon(DRAGON_MAX_HP + 50);
    expect(state.dragonHp).toBe(0);
    expect(state.phase).toBe('defeat');
  });

  it('scales the damage taken with the difficulty', () => {
    const easy = new GameState();
    easy.start(difficultyById('facile'));
    easy.damageDragon(10);
    const hard = new GameState();
    hard.start(difficultyById('difficile'));
    hard.damageDragon(10);
    expect(DRAGON_MAX_HP - easy.dragonHp).toBeCloseTo(6);
    expect(DRAGON_MAX_HP - hard.dragonHp).toBeCloseTo(14);
  });

  it('heals without exceeding maximum health', () => {
    const state = new GameState();
    state.start();
    state.damageDragon(30);
    state.heal(20);
    expect(state.dragonHp).toBe(DRAGON_MAX_HP - 10);
    state.heal(100);
    expect(state.dragonHp).toBe(DRAGON_MAX_HP);
  });

  it('ignores castle damage outside the siege', () => {
    const state = new GameState();
    state.setCastle([{ id: 'tower', hp: 1 }]);
    state.start();
    expect(state.damagePart('tower')).toBe(false);
    expect(state.castleIntegrity()).toBe(1);
  });

  it('destroys a part when its health reaches zero', () => {
    const state = siegeWithParts();
    expect(state.damagePart('tower')).toBe(false);
    expect(state.damagePart('tower')).toBe(true);
    expect(state.isPartStanding('tower')).toBe(false);
    expect(state.score).toBe(PART_SCORE);
    expect(state.castleIntegrity()).toBeCloseTo(3 / 5);
  });

  it('wins when every castle part is destroyed', () => {
    const state = siegeWithParts();
    state.damagePart('tower', 2);
    state.damagePart('keep', 3);
    expect(state.phase).toBe('victory');
    expect(state.castleIntegrity()).toBe(0);
  });

  it('keeps the mage-shielded keep invulnerable until every tower has fallen', () => {
    const state = siegeWithParts('keep');
    expect(state.isShieldUp()).toBe(true);
    expect(state.damagePart('keep', 3)).toBe(false);
    expect(state.isPartStanding('keep')).toBe(true);
    state.damagePart('tower', 2);
    expect(state.isShieldUp()).toBe(false);
    expect(state.damagePart('keep', 3)).toBe(true);
    expect(state.phase).toBe('victory');
  });

  it('restores the castle on restart', () => {
    const state = siegeWithParts();
    state.damagePart('tower', 2);
    state.start();
    expect(state.castleIntegrity()).toBe(1);
    expect(state.isPartStanding('tower')).toBe(true);
  });

  it('offers three difficulties, the default being normal', () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(['facile', 'normal', 'difficile']);
    expect(difficultyById('inconnue').id).toBe('normal');
  });
});
