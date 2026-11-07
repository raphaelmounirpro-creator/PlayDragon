/** Minimal key-value storage (window.localStorage in the game, a map in tests). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SavedRecords {
  unlocked: number;
  best: Record<string, number>;
}

const STORAGE_KEY = 'playdragon.records.v1';

/** Best scores per level and difficulty, and how many levels are unlocked; saved between sessions. */
export class Records {
  private data: SavedRecords;

  constructor(
    private readonly storage: KeyValueStorage | null,
    private readonly levelCount: number,
  ) {
    this.data = this.load();
  }

  best(level: number, difficulty: string): number {
    return this.data.best[`${level}:${difficulty}`] ?? 0;
  }

  /** Number of levels the player may choose (at least the first one). */
  unlockedLevels(): number {
    return Math.min(this.levelCount, Math.max(1, this.data.unlocked));
  }

  /** Records a finished run; a victory unlocks the next level. Returns true for a new best score. */
  submit(level: number, difficulty: string, score: number, victory: boolean): boolean {
    const key = `${level}:${difficulty}`;
    const isBest = score > (this.data.best[key] ?? 0);
    if (isBest) this.data.best[key] = score;
    if (victory) this.data.unlocked = Math.max(this.unlockedLevels(), Math.min(this.levelCount, level + 2));
    this.save();
    return isBest;
  }

  private load(): SavedRecords {
    try {
      const parsed = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '') as Partial<SavedRecords>;
      return { unlocked: Number(parsed.unlocked) || 1, best: typeof parsed.best === 'object' && parsed.best ? parsed.best : {} };
    } catch {
      return { unlocked: 1, best: {} };
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be full or blocked: records just won't persist.
    }
  }
}

/** The browser storage, or null when it is unavailable (private mode, blocked site data). */
export function browserStorage(): KeyValueStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
