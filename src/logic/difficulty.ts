export type DifficultyId = 'facile' | 'normal' | 'difficile';

/** Multipliers applied to the enemies and to the damage the dragon takes. */
export interface Difficulty {
  id: DifficultyId;
  label: string;
  damageTaken: number;
  enemyCount: number;
  enemyHealth: number;
  enemyFireRate: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'facile', label: 'Facile', damageTaken: 0.6, enemyCount: 0.7, enemyHealth: 0.7, enemyFireRate: 0.7 },
  { id: 'normal', label: 'Normal', damageTaken: 1, enemyCount: 1, enemyHealth: 1, enemyFireRate: 1 },
  { id: 'difficile', label: 'Difficile', damageTaken: 1.4, enemyCount: 1.4, enemyHealth: 1.4, enemyFireRate: 1.35 },
];

export const NORMAL = DIFFICULTIES[1];

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) ?? NORMAL;
}

/** How many enemies of a wave at this difficulty (always at least one). */
export function scaledCount(base: number, difficulty: Difficulty): number {
  return Math.max(1, Math.round(base * difficulty.enemyCount));
}

/** How many hits an enemy takes at this difficulty (always at least one). */
export function scaledHealth(base: number, difficulty: Difficulty): number {
  return Math.max(1, Math.round(base * difficulty.enemyHealth));
}
