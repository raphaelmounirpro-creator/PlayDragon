import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../src/logic/records';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, Settings } from '../src/logic/settings';
import { TutorialScript, TutorialSignals } from '../src/logic/tutorial';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const data = { ...initial };
  return { getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}

describe('Settings', () => {
  it('starts from the defaults and remembers changes', () => {
    const storage = memoryStorage();
    const settings = new Settings(storage);
    expect(settings.values).toEqual(DEFAULT_SETTINGS);
    settings.update({ musicVolume: 0.2, difficulty: 'difficile', muted: true, level: 2 });
    const reloaded = new Settings(storage);
    expect(reloaded.values.musicVolume).toBe(0.2);
    expect(reloaded.values.difficulty).toBe('difficile');
    expect(reloaded.values.muted).toBe(true);
    expect(reloaded.values.level).toBe(2);
  });

  it('swaps keys when a key already used by another action is assigned', () => {
    const settings = new Settings(memoryStorage());
    settings.bind('up', { code: 'KeyS', label: 'S' });
    expect(settings.values.keys.up.code).toBe('KeyS');
    expect(settings.values.keys.down).toEqual(DEFAULT_KEYS.up);
    settings.resetKeys();
    expect(settings.values.keys).toEqual(DEFAULT_KEYS);
  });

  it('ignores corrupted or out-of-range saved values', () => {
    const storage = memoryStorage({ 'playdragon.settings.v1': JSON.stringify({ musicVolume: 7, quality: 'ultra', padSensitivity: 'fast', keys: { up: 42 } }) });
    const settings = new Settings(storage);
    expect(settings.values.musicVolume).toBe(1);
    expect(settings.values.quality).toBe('haute');
    expect(settings.values.padSensitivity).toBe(1);
    expect(settings.values.keys.up).toEqual(DEFAULT_KEYS.up);
    expect(new Settings(memoryStorage({ 'playdragon.settings.v1': '{oops' })).values).toEqual(DEFAULT_SETTINGS);
  });
});

const quiet: TutorialSignals = { steering: false, throttle: false, fired: false, ringCollected: false, powerUsed: false, score: 0, siege: false };

describe('TutorialScript', () => {
  it('shows the first hint until the player has steered long enough', () => {
    const script = new TutorialScript();
    expect(script.update(0.1, quiet)).toBe('steer');
    for (let i = 0; i < 10; i++) script.update(0.1, { ...quiet, steering: true });
    expect(script.update(0.1, quiet)).toBe('fire');
  });

  it('moves on when a hint times out', () => {
    const script = new TutorialScript();
    script.update(9.5, quiet);
    expect(script.update(0.1, quiet)).toBe('fire');
  });

  it('waits for the right moment before showing a hint', () => {
    const script = new TutorialScript();
    for (const step of ['steer', 'fire', 'rings', 'speed']) {
      expect(script.update(0.1, quiet)).toBe(step);
      script.update(10, quiet);
    }
    expect(script.update(0.1, quiet)).toBeNull();
    expect(script.update(0.1, { ...quiet, score: 300 })).toBe('powers');
    script.update(0.1, { ...quiet, score: 300, powerUsed: true });
    expect(script.update(0.1, quiet)).toBeNull();
    expect(script.update(0.1, { ...quiet, siege: true })).toBe('siege');
    script.update(10, { ...quiet, siege: true });
    expect(script.finished()).toBe(true);
  });
});
