import { Group, Matrix4, Vector3 } from 'three';
import type { Effects } from '../../fx/particles';
import type { Difficulty } from '../../logic/difficulty';

export type HostileKind = 'bolt' | 'stone' | 'boulder' | 'quarrel' | 'orb';

/** Sounds an enemy can trigger; the game maps them to audio. */
export type FoeCue = 'shriek' | 'spit' | 'bite' | 'roar' | 'cast' | 'twang' | 'chirp';

/** What an enemy may know about and do to the world each frame. */
export interface FoeContext {
  time: number;
  dragon: Vector3;
  dragonVelocity: Vector3;
  heading: Vector3;
  difficulty: Difficulty;
  effects: Effects;
  fire(kind: HostileKind, from: Vector3, target: Vector3): void;
  hurtDragon(amount: number): void;
  cue(sound: FoeCue): void;
}

const WORLD_UP = new Vector3(0, 1, 0);
const RETREAT_TIME = 3;

/** Base of every enemy: health, death, flight orientation and retreat. */
export abstract class Foe {
  readonly object = new Group();
  abstract readonly radius: number;
  abstract readonly score: number;
  /** Shown in the boss health bar. */
  readonly bossName: string | null = null;
  /** Fragile enemies also die in nearby explosions (bats). */
  readonly fragile: boolean = false;
  readonly maxHealth: number;
  health: number;
  /** Left the scene without being killed. */
  gone = false;
  private retreatTime = -1;
  private readonly orientation = new Matrix4();

  constructor(health: number) {
    this.health = health;
    this.maxHealth = health;
  }

  get alive(): boolean {
    return this.health > 0 && !this.gone;
  }

  get position(): Vector3 {
    return this.object.position;
  }

  abstract update(dt: number, ctx: FoeContext): void;

  /** False while protected (e.g. by a magic shield): hits bounce off. */
  canBeHurt(): boolean {
    return true;
  }

  /** Applies damage; returns true when this hit kills it. */
  hit(damage: number): boolean {
    if (!this.alive || !this.canBeHurt()) return false;
    this.health = Math.max(0, this.health - damage);
    return this.health === 0;
  }

  die(effects: Effects): void {
    effects.explosion(this.position, Math.max(0.8, this.radius / 12));
  }

  /** Flies off the battlefield and disappears a few seconds later. */
  retreat(): void {
    if (this.retreatTime < 0) this.retreatTime = 0;
  }

  /** Call first in `update`: returns true while retreating (the subclass then does nothing else). */
  protected retreating(dt: number): boolean {
    if (this.retreatTime < 0) return false;
    this.retreatTime += dt;
    this.position.y += 160 * dt;
    if (this.retreatTime > RETREAT_TIME) this.gone = true;
    return true;
  }

  /** Points the model's -Z axis along `direction`. */
  protected face(direction: Vector3): void {
    if (direction.lengthSq() < 1e-6) return;
    this.orientation.lookAt(this.position, this.position.clone().add(direction), WORLD_UP);
    this.object.quaternion.setFromRotationMatrix(this.orientation);
  }

  protected isBehind(ctx: FoeContext, margin: number): boolean {
    return this.position.clone().sub(ctx.dragon).dot(ctx.heading) < -margin;
  }
}

/** All living enemies of a level. */
export class Foes {
  readonly group = new Group();
  readonly items: Foe[] = [];

  add(foe: Foe): void {
    this.items.push(foe);
    this.group.add(foe.object);
  }

  update(dt: number, ctx: FoeContext): void {
    for (const foe of [...this.items]) {
      foe.update(dt, ctx);
      if (foe.alive) continue;
      if (foe.health <= 0) foe.die(ctx.effects);
      this.remove(foe);
    }
  }

  /** Kills a foe shot by the dragon. */
  kill(foe: Foe, effects: Effects): void {
    foe.die(effects);
    this.remove(foe);
  }

  remove(foe: Foe): void {
    const index = this.items.indexOf(foe);
    if (index < 0) return;
    this.items.splice(index, 1);
    this.group.remove(foe.object);
  }

  clear(): void {
    for (const foe of [...this.items]) this.remove(foe);
  }

  /** The living foe whose body contains `point`. */
  at(point: Vector3, margin = 0): Foe | undefined {
    return this.items.find((foe) => foe.alive && foe.position.distanceTo(point) < foe.radius + margin);
  }

  within(point: Vector3, radius: number): Foe[] {
    return this.items.filter((foe) => foe.alive && foe.position.distanceTo(point) < radius + foe.radius);
  }

  boss(): Foe | undefined {
    return this.items.find((foe) => foe.alive && foe.bossName);
  }
}
