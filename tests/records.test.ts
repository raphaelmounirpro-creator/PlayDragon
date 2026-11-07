import { describe, expect, it } from 'vitest';
import { KeyValueStorage, Records } from '../src/logic/records';
import { DIFFICULTIES, scaledCount, scaledHealth } from '../src/logic/difficulty';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => (data[key] = value) };
}

describe('Records', () => {
  it('starts with only the first level unlocked and no best score', () => {
    const records = new Records(memoryStorage(), 3);
    expect(records.unlockedLevels()).toBe(1);
    expect(records.best(0, 'normal')).toBe(0);
  });

  it('keeps the best score per level and difficulty', () => {
    const records = new Records(memoryStorage(), 3);
    expect(records.submit(0, 'normal', 1200, false)).toBe(true);
    expect(records.submit(0, 'normal', 900, false)).toBe(false);
    expect(records.submit(0, 'facile', 500, false)).toBe(true);
    expect(records.best(0, 'normal')).toBe(1200);
    expect(records.best(0, 'facile')).toBe(500);
  });

  it('unlocks the next level after a victory, never beyond the last one', () => {
    const records = new Records(memoryStorage(), 2);
    records.submit(0, 'normal', 100, false);
    expect(records.unlockedLevels()).toBe(1);
    records.submit(0, 'normal', 100, true);
    expect(records.unlockedLevels()).toBe(2);
    records.submit(1, 'normal', 100, true);
    expect(records.unlockedLevels()).toBe(2);
  });

  it('persists between sessions', () => {
    const storage = memoryStorage();
    new Records(storage, 3).submit(0, 'difficile', 4200, true);
    const reloaded = new Records(storage, 3);
    expect(reloaded.best(0, 'difficile')).toBe(4200);
    expect(reloaded.unlockedLevels()).toBe(2);
  });

  it('survives corrupted or missing storage', () => {
    const corrupted = new Records(memoryStorage({ 'playdragon.records.v1': '{oops' }), 3);
    expect(corrupted.unlockedLevels()).toBe(1);
    const none = new Records(null, 3);
    expect(none.submit(0, 'normal', 10, true)).toBe(true);
  });
});

describe('difficulty scaling', () => {
  it('scales enemy numbers and toughness, keeping at least one', () => {
    const [easy, normal, hard] = DIFFICULTIES;
    expect(scaledCount(10, easy)).toBe(7);
    expect(scaledCount(10, normal)).toBe(10);
    expect(scaledCount(10, hard)).toBe(14);
    expect(scaledHealth(1, easy)).toBe(1);
    expect(scaledHealth(30, hard)).toBe(42);
  });
});
