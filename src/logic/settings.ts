import type { DifficultyId } from './difficulty';
import type { KeyValueStorage } from './records';

export type ActionId = 'up' | 'down' | 'left' | 'right' | 'faster' | 'slower' | 'fire' | 'power1' | 'power2' | 'power3' | 'power4';
export type Quality = 'haute' | 'moyenne' | 'basse';

/** A physical key (event.code) and what is printed on it. */
export interface KeyBinding {
  code: string;
  label: string;
}

export interface SettingsData {
  musicVolume: number;
  effectsVolume: number;
  muted: boolean;
  quality: Quality;
  aimAssist: boolean;
  padSensitivity: number;
  invertY: boolean;
  difficulty: DifficultyId;
  level: number;
  tutorialDone: boolean;
  keys: Record<ActionId, KeyBinding>;
}

export const ACTIONS: Array<{ id: ActionId; label: string }> = [
  { id: 'up', label: 'Monter' },
  { id: 'down', label: 'Descendre' },
  { id: 'left', label: 'Gauche' },
  { id: 'right', label: 'Droite' },
  { id: 'faster', label: 'Accélérer' },
  { id: 'slower', label: 'Freiner' },
  { id: 'fire', label: 'Cracher le feu' },
  { id: 'power1', label: 'Pouvoir 1' },
  { id: 'power2', label: 'Pouvoir 2' },
  { id: 'power3', label: 'Pouvoir 3' },
  { id: 'power4', label: 'Pouvoir 4' },
];

/**
 * Keys are physical positions (event.code): Z Q S D on an AZERTY keyboard are the same keys as
 * W A S D on a QWERTY one, so the defaults sit under the hand on both. Labels are AZERTY.
 */
export const DEFAULT_KEYS: Record<ActionId, KeyBinding> = {
  up: { code: 'KeyW', label: 'Z' },
  down: { code: 'KeyS', label: 'S' },
  left: { code: 'KeyA', label: 'Q' },
  right: { code: 'KeyD', label: 'D' },
  faster: { code: 'KeyE', label: 'E' },
  slower: { code: 'KeyQ', label: 'A' },
  fire: { code: 'Space', label: 'Espace' },
  power1: { code: 'Digit1', label: '1' },
  power2: { code: 'Digit2', label: '2' },
  power3: { code: 'Digit3', label: '3' },
  power4: { code: 'Digit4', label: '4' },
};

/** The keys of the four powers, in the order of ABILITIES. */
export const POWER_ACTIONS: ActionId[] = ['power1', 'power2', 'power3', 'power4'];

export const DEFAULT_SETTINGS: SettingsData = {
  musicVolume: 0.7,
  effectsVolume: 0.9,
  muted: false,
  quality: 'haute',
  aimAssist: true,
  padSensitivity: 1,
  invertY: false,
  difficulty: 'normal',
  level: 0,
  tutorialDone: false,
  keys: DEFAULT_KEYS,
};

const STORAGE_KEY = 'playdragon.settings.v1';
const QUALITIES: Quality[] = ['haute', 'moyenne', 'basse'];

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** The player's preferences, saved between sessions; anything unreadable falls back to the defaults. */
export class Settings {
  private data: SettingsData;

  constructor(private readonly storage: KeyValueStorage | null) {
    this.data = this.load();
  }

  get values(): Readonly<SettingsData> {
    return this.data;
  }

  update(patch: Partial<Omit<SettingsData, 'keys'>>): void {
    this.data = { ...this.data, ...patch };
    this.save();
  }

  /** Assigns a key to an action; if another action used it, the two actions swap keys. */
  bind(action: ActionId, binding: KeyBinding): void {
    const keys = { ...this.data.keys };
    const previous = keys[action];
    for (const id of Object.keys(keys) as ActionId[]) {
      if (id !== action && keys[id].code === binding.code) keys[id] = previous;
    }
    keys[action] = binding;
    this.data = { ...this.data, keys };
    this.save();
  }

  resetKeys(): void {
    this.data = { ...this.data, keys: { ...DEFAULT_KEYS } };
    this.save();
  }

  private load(): SettingsData {
    let saved: Partial<SettingsData> = {};
    try {
      saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '{}') as Partial<SettingsData>;
    } catch {
      saved = {};
    }
    const d = DEFAULT_SETTINGS;
    const keys = { ...DEFAULT_KEYS };
    for (const id of Object.keys(keys) as ActionId[]) {
      const binding = saved.keys?.[id];
      if (binding && typeof binding.code === 'string' && typeof binding.label === 'string') keys[id] = binding;
    }
    return {
      musicVolume: clamp(saved.musicVolume, 0, 1, d.musicVolume),
      effectsVolume: clamp(saved.effectsVolume, 0, 1, d.effectsVolume),
      muted: saved.muted === true,
      quality: QUALITIES.includes(saved.quality as Quality) ? (saved.quality as Quality) : d.quality,
      aimAssist: saved.aimAssist !== false,
      padSensitivity: clamp(saved.padSensitivity, 0.4, 2.5, d.padSensitivity),
      invertY: saved.invertY === true,
      difficulty: typeof saved.difficulty === 'string' ? (saved.difficulty as DifficultyId) : d.difficulty,
      level: Math.round(clamp(saved.level, 0, 99, d.level)),
      tutorialDone: saved.tutorialDone === true,
      keys,
    };
  }

  private save(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage may be full or blocked: preferences just won't persist.
    }
  }
}
