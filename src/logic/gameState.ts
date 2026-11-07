import { DRAGON_MAX_HP, PART_SCORE, RING_SCORE } from '../config';
import { Difficulty, NORMAL } from './difficulty';

export type Phase = 'menu' | 'voyage' | 'siege' | 'victory' | 'defeat';

export interface PartDefinition {
  id: string;
  hp: number;
}

/** Pure game rules: phases, health, score and castle damage. No rendering here. */
export class GameState {
  phase: Phase = 'menu';
  dragonHp = DRAGON_MAX_HP;
  score = 0;
  elapsed = 0;
  difficulty: Difficulty = NORMAL;
  private readonly partHp = new Map<string, number>();
  private readonly partMaxHp = new Map<string, number>();
  private shieldedPart: string | null = null;

  /** Declares the castle of the level; `shieldedPart` stays invulnerable while any other part stands. */
  setCastle(parts: PartDefinition[], shieldedPart: string | null = null): void {
    this.partMaxHp.clear();
    this.partHp.clear();
    for (const part of parts) {
      this.partMaxHp.set(part.id, part.hp);
      this.partHp.set(part.id, part.hp);
    }
    this.shieldedPart = shieldedPart;
  }

  start(difficulty: Difficulty = NORMAL): void {
    this.phase = 'voyage';
    this.difficulty = difficulty;
    this.dragonHp = DRAGON_MAX_HP;
    this.score = 0;
    this.elapsed = 0;
    for (const [id, max] of this.partMaxHp) this.partHp.set(id, max);
  }

  backToMenu(): void {
    this.phase = 'menu';
  }

  tick(dt: number): void {
    if (this.isPlaying()) this.elapsed += dt;
  }

  isPlaying(): boolean {
    return this.phase === 'voyage' || this.phase === 'siege';
  }

  beginSiege(): void {
    if (this.phase === 'voyage') this.phase = 'siege';
  }

  collectRing(): void {
    this.score += RING_SCORE;
  }

  addKill(points: number): void {
    if (this.isPlaying()) this.score += points;
  }

  /** Damage is scaled by the difficulty. */
  damageDragon(amount: number): void {
    if (!this.isPlaying()) return;
    this.dragonHp = Math.max(0, this.dragonHp - amount * this.difficulty.damageTaken);
    if (this.dragonHp === 0) this.phase = 'defeat';
  }

  heal(amount: number): void {
    if (this.isPlaying()) this.dragonHp = Math.min(DRAGON_MAX_HP, this.dragonHp + amount);
  }

  /** False for the shielded part while another part still stands. */
  isPartVulnerable(id: string): boolean {
    if (id !== this.shieldedPart) return true;
    return ![...this.partHp].some(([other, hp]) => other !== id && hp > 0);
  }

  /** True while the shielded part is protected (and still standing). */
  isShieldUp(): boolean {
    return this.shieldedPart !== null && this.isPartStanding(this.shieldedPart) && !this.isPartVulnerable(this.shieldedPart);
  }

  /** Returns true when this hit destroys the part. */
  damagePart(id: string, amount = 1): boolean {
    const hp = this.partHp.get(id);
    if (hp === undefined || hp <= 0 || this.phase !== 'siege' || !this.isPartVulnerable(id)) return false;
    const remaining = Math.max(0, hp - amount);
    this.partHp.set(id, remaining);
    if (remaining > 0) return false;
    this.score += PART_SCORE;
    if (this.castleIntegrity() === 0) this.phase = 'victory';
    return true;
  }

  isPartStanding(id: string): boolean {
    return (this.partHp.get(id) ?? 0) > 0;
  }

  /** Remaining castle health between 0 and 1. */
  castleIntegrity(): number {
    let current = 0;
    let max = 0;
    for (const [id, hpMax] of this.partMaxHp) {
      max += hpMax;
      current += this.partHp.get(id) ?? 0;
    }
    return max === 0 ? 1 : current / max;
  }
}
