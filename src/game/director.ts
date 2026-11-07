import { Vector3 } from 'three';
import { Archer } from '../entities/foes/archer';
import { Bat } from '../entities/foes/bat';
import type { Foe, FoeContext, FoeCue, Foes } from '../entities/foes/foe';
import { DiverGargoyle } from '../entities/foes/gargoyle';
import { Guardian } from '../entities/foes/guardian';
import { Mage } from '../entities/foes/mage';
import { ShooterGargoyle } from '../entities/foes/shooter';
import { Wyvern } from '../entities/foes/wyvern';
import { Difficulty, scaledCount, scaledHealth } from '../logic/difficulty';
import { KEEP_ID, type Castle } from '../world/castle';
import type { LevelDefinition, VoyageEvent } from '../world/levels';
import type { PathFrame } from '../world/pathFrame';

const WORLD_UP = new Vector3(0, 1, 0);
const TOWER_RELOAD_MIN = 3.5;
const TOWER_RELOAD_MAX = 7;

export interface DirectorHooks {
  announce(text: string): void;
  cue(sound: FoeCue): void;
  frameAhead(distance: number): PathFrame;
}

function scatter(center: Vector3, radius: number): Vector3 {
  return center.clone().add(new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5), (Math.random() - 0.5) * 2).multiplyScalar(radius));
}

/** Stages one run of a level: the scripted waves on the way, the guardian, the castle's defenders. */
export class Director {
  private nextEvent = 0;
  private guardian: Guardian | null = null;
  private readonly defenders: Array<Archer | Mage> = [];
  private mage: Mage | null = null;
  private readonly towerReload = new Map<string, number>();

  constructor(
    private readonly level: LevelDefinition,
    private readonly difficulty: Difficulty,
    private readonly foes: Foes,
    private readonly castle: Castle,
    private readonly hooks: DirectorHooks,
    shieldUp: () => boolean,
  ) {
    for (const post of castle.archerPosts(level.castle.archers)) this.addDefender(new Archer(post));
    if (level.castle.mage) {
      this.mage = new Mage(castle.magePost(), castle.keepDome(), shieldUp);
      this.addDefender(this.mage);
    }
  }

  /** The stone guardian bars the way: the journey waits until it falls. */
  routeBlocked(): boolean {
    return this.guardian !== null && this.guardian.alive;
  }

  /** Starts every event the journey has reached. */
  updateVoyage(journey: number, ctx: FoeContext): void {
    const events = this.level.events;
    while (this.nextEvent < events.length && journey >= events[this.nextEvent].at) {
      this.spawn(events[this.nextEvent], ctx);
      this.nextEvent++;
    }
  }

  /** Voyage enemies give up; archers and mage take their posts. */
  beginSiege(): void {
    for (const foe of this.foes.items) if (!this.defenders.some((defender) => defender === foe)) foe.retreat();
    for (const defender of this.defenders) defender.activate();
    if (this.mage) this.hooks.announce('Un mage protège le donjon : abats d’abord les tours !');
  }

  /** Standing towers shoot bolts; the mage dies with the keep. */
  updateSiege(dt: number, ctx: FoeContext): void {
    for (const part of this.castle.standingParts()) {
      const reload = (this.towerReload.get(part.id) ?? Math.random() * TOWER_RELOAD_MAX) - dt * this.difficulty.enemyFireRate;
      if (reload > 0) {
        this.towerReload.set(part.id, reload);
        continue;
      }
      this.towerReload.set(part.id, TOWER_RELOAD_MIN + Math.random() * (TOWER_RELOAD_MAX - TOWER_RELOAD_MIN));
      ctx.fire('bolt', part.top, ctx.dragon);
    }
    if (this.mage?.alive && !this.castle.isStanding(KEEP_ID)) this.mage.health = 0;
  }

  /** The castle has fallen: the defenders fall with it. */
  collapse(): void {
    for (const defender of this.defenders) if (defender.alive) defender.health = 0;
  }

  private addDefender(defender: Archer | Mage): void {
    this.defenders.push(defender);
    this.foes.add(defender);
  }

  private spawn(event: VoyageEvent, ctx: FoeContext): void {
    const count = scaledCount(event.count, this.difficulty);
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    switch (event.type) {
      case 'gargoyles': {
        const frame = this.hooks.frameAhead(850);
        this.repeat(count, () => new DiverGargoyle(scatter(frame.point, 130), scaledHealth(1, this.difficulty)));
        break;
      }
      case 'shooters': {
        const frame = this.hooks.frameAhead(900);
        this.repeat(count, (i) => new ShooterGargoyle(frame.point.clone().addScaledVector(right, (i % 2 ? 1 : -1) * 220).addScaledVector(WORLD_UP, 80), scaledHealth(2, this.difficulty)));
        this.hooks.announce('Des gargouilles cracheuses !');
        break;
      }
      case 'bats': {
        const center = this.hooks.frameAhead(380).point.addScaledVector(WORLD_UP, 20);
        this.repeat(count, () => new Bat(scatter(center, 60)));
        this.hooks.announce('Un essaim de chauves-souris !');
        this.hooks.cue('chirp');
        break;
      }
      case 'wyvern': {
        const start = ctx.dragon.clone().addScaledVector(ctx.heading, -260).addScaledVector(right, (Math.random() < 0.5 ? -1 : 1) * 90).addScaledVector(WORLD_UP, 40);
        this.repeat(1, () => new Wyvern(start, scaledHealth(3, this.difficulty)));
        this.hooks.announce('Une wyverne te poursuit !');
        this.hooks.cue('shriek');
        break;
      }
      case 'guardian': {
        this.guardian = new Guardian(this.hooks.frameAhead(900).point.addScaledVector(WORLD_UP, 140), scaledHealth(30, this.difficulty));
        this.foes.add(this.guardian);
        this.hooks.announce('Le Gardien de pierre te barre la route !');
        this.hooks.cue('roar');
        break;
      }
    }
  }

  private repeat(count: number, create: (index: number) => Foe): void {
    for (let i = 0; i < count; i++) this.foes.add(create(i));
  }
}
