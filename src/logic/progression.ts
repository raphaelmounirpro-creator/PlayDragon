import { DRAGON_MAX_HP, GOLD, UPGRADES } from '../config';
import type { KeyValueStorage } from './records';

export type UpgradeId = keyof typeof UPGRADES;

export interface UpgradeInfo {
  id: UpgradeId;
  name: string;
  effect: string;
}

export const UPGRADE_INFO: UpgradeInfo[] = [
  { id: 'vitality', name: 'Cœur ardent', effect: `+${UPGRADES.vitality.perRank} points de vie par rang` },
  { id: 'fireRate', name: 'Souffle rapide', effect: `Feu ${Math.round(UPGRADES.fireRate.perRank * 100)} % plus rapide par rang` },
  { id: 'scales', name: 'Écailles d’acier', effect: `${Math.round(UPGRADES.scales.perRank * 100)} % de dégâts en moins par rang` },
  { id: 'mastery', name: 'Maîtrise des pouvoirs', effect: `Pouvoirs ${Math.round(UPGRADES.mastery.perRank * 100)} % moins chers par rang` },
];

/** What the upgrades change for a run. */
export interface Modifiers {
  maxHp: number;
  fireCooldown: number;
  damageTaken: number;
  powerCost: number;
}

interface SavedProgress {
  gold: number;
  ranks: Partial<Record<UpgradeId, number>>;
}

const STORAGE_KEY = 'playdragon.progress.v1';

/** The dragon's treasure: gold earned after each run, spent on permanent upgrades. */
export class Progression {
  private data: SavedProgress;

  constructor(private readonly storage: KeyValueStorage | null) {
    this.data = this.load();
  }

  get gold(): number {
    return this.data.gold;
  }

  rank(id: UpgradeId): number {
    return this.data.ranks[id] ?? 0;
  }

  maxRank(id: UpgradeId): number {
    return UPGRADES[id].costs.length;
  }

  /** Price of the next rank, or null when the upgrade is complete. */
  nextCost(id: UpgradeId): number | null {
    return UPGRADES[id].costs[this.rank(id)] ?? null;
  }

  buy(id: UpgradeId): boolean {
    const cost = this.nextCost(id);
    if (cost === null || cost > this.data.gold) return false;
    this.data.gold -= cost;
    this.data.ranks[id] = this.rank(id) + 1;
    this.save();
    return true;
  }

  /** Adds the gold earned by a finished run (more after a victory) and returns it. */
  reward(score: number, victory: boolean): number {
    const gold = Math.floor(score * GOLD.perPoint * (victory ? GOLD.victoryBonus : 1));
    this.data.gold += gold;
    this.save();
    return gold;
  }

  modifiers(): Modifiers {
    return {
      maxHp: DRAGON_MAX_HP + this.rank('vitality') * UPGRADES.vitality.perRank,
      fireCooldown: 1 - this.rank('fireRate') * UPGRADES.fireRate.perRank,
      damageTaken: 1 - this.rank('scales') * UPGRADES.scales.perRank,
      powerCost: 1 - this.rank('mastery') * UPGRADES.mastery.perRank,
    };
  }

  private load(): SavedProgress {
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '') as Partial<SavedProgress>;
      return { gold: Math.max(0, Number(saved.gold) || 0), ranks: typeof saved.ranks === 'object' && saved.ranks ? saved.ranks : {} };
    } catch {
      return { gold: 0, ranks: {} };
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be full or blocked: progress just won't persist.
    }
  }
}
