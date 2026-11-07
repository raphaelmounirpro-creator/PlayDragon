export type AbilityId = 'triple' | 'shield' | 'heal' | 'meteor';

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  cost: number;
  /** Seconds the effect lasts (0 = instant). */
  duration: number;
  cooldown: number;
}

export const ABILITIES: AbilityDefinition[] = [
  { id: 'triple', name: 'Triple feu', cost: 300, duration: 8, cooldown: 12 },
  { id: 'shield', name: 'Bouclier', cost: 400, duration: 6, cooldown: 15 },
  { id: 'heal', name: 'Soin', cost: 300, duration: 0, cooldown: 10 },
  { id: 'meteor', name: 'Météore', cost: 600, duration: 0, cooldown: 8 },
];

/** Something points can be spent from (the game state). */
export interface Wallet {
  score: number;
  isPlaying(): boolean;
}

/** Where one power stands, as its button shows it. */
export interface AbilityStatus {
  id: AbilityId;
  ready: boolean;
  active: boolean;
  /** Fraction of the cooldown still to wait, from 1 (just used) to 0 (ready). */
  cooldownRatio: number;
}

/** Special powers bought with points: cost, duration and cooldown rules. No rendering here. */
export class Abilities {
  private readonly remaining = new Map<AbilityId, number>();
  private readonly cooldowns = new Map<AbilityId, number>();
  private costFactor = 1;

  /** Starts a run; `costFactor` below 1 makes every power cheaper (upgrade). */
  reset(costFactor = 1): void {
    this.remaining.clear();
    this.cooldowns.clear();
    this.costFactor = costFactor;
  }

  cost(id: AbilityId): number {
    return Math.round(definition(id).cost * this.costFactor);
  }

  canActivate(id: AbilityId, wallet: Wallet): boolean {
    return wallet.isPlaying() && this.cooldown(id) === 0 && wallet.score >= this.cost(id);
  }

  /** Spends the points and starts the ability; returns false when not allowed. */
  activate(id: AbilityId, wallet: Wallet): boolean {
    if (!this.canActivate(id, wallet)) return false;
    const ability = definition(id);
    wallet.score -= this.cost(id);
    this.cooldowns.set(id, ability.cooldown);
    if (ability.duration > 0) this.remaining.set(id, ability.duration);
    return true;
  }

  isActive(id: AbilityId): boolean {
    return (this.remaining.get(id) ?? 0) > 0;
  }

  cooldown(id: AbilityId): number {
    return this.cooldowns.get(id) ?? 0;
  }

  cooldownRatio(id: AbilityId): number {
    return this.cooldown(id) / definition(id).cooldown;
  }

  statuses(wallet: Wallet): AbilityStatus[] {
    return ABILITIES.map(({ id }) => ({ id, ready: this.canActivate(id, wallet), active: this.isActive(id), cooldownRatio: this.cooldownRatio(id) }));
  }

  update(dt: number): void {
    for (const map of [this.remaining, this.cooldowns]) {
      for (const [id, seconds] of map) map.set(id, Math.max(0, seconds - dt));
    }
  }
}

export function definition(id: AbilityId): AbilityDefinition {
  const found = ABILITIES.find((ability) => ability.id === id);
  if (!found) throw new Error(`Unknown ability ${id}`);
  return found;
}
