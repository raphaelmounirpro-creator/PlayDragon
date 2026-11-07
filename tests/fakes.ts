import { Texture, Vector3 } from 'three';
import type { Foe, FoeContext, FoeCue, HostileKind } from '../src/entities/foes/foe';
import type { Effects } from '../src/fx/particles';
import { NORMAL } from '../src/logic/difficulty';

/**
 * Stand-ins for src/fx/textures (canvas-painted, unavailable under Node). Test files that build
 * enemies replace that module with `vi.mock('../src/fx/textures', () => import('./fakes').then((m) => m.blankTextures))`.
 */
export const blankTextures = {
  createCloudTexture: () => new Texture(),
  createGlowTexture: () => new Texture(),
  createHideTexture: () => new Texture(),
  createStoneTexture: () => new Texture(),
  createMembraneTexture: () => new Texture(),
};

/** Effects that draw nothing. */
export function fakeEffects(): Effects {
  const particles = { emit() {} };
  return { explosion() {}, burning() {}, sparkle() {}, fire: particles, smoke: particles } as unknown as Effects;
}

/** Everything enemies did to the world, in order. */
export interface FoeLog {
  shots: Array<{ kind: HostileKind; from: Vector3; target: Vector3 }>;
  /** Damage dealt to the dragon, with the game time of each hit. */
  hits: Array<{ amount: number; time: number }>;
  cues: FoeCue[];
  summoned: Foe[];
  shakes: number[];
}

/** A dragon hovering still at (0, 400, 0), heading toward -Z; every action is recorded. */
export function fakeContext(overrides: Partial<FoeContext> = {}): { ctx: FoeContext; log: FoeLog } {
  const log: FoeLog = { shots: [], hits: [], cues: [], summoned: [], shakes: [] };
  const ctx: FoeContext = {
    time: 0,
    dragon: new Vector3(0, 400, 0),
    dragonVelocity: new Vector3(),
    heading: new Vector3(0, 0, -1),
    difficulty: NORMAL,
    effects: fakeEffects(),
    fire: (kind, from, target) => log.shots.push({ kind, from: from.clone(), target: target.clone() }),
    hurtDragon: (amount) => log.hits.push({ amount, time: ctx.time }),
    cue: (sound) => log.cues.push(sound),
    summon: (foe) => log.summoned.push(foe),
    shake: (amount) => log.shakes.push(amount),
    ...overrides,
  };
  return { ctx, log };
}

/** Plays `seconds` of game time at 30 frames per second. */
export function advance(seconds: number, update: (dt: number) => void, ctx?: FoeContext): void {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    if (ctx) ctx.time += dt;
    update(dt);
  }
}
