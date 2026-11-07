import { Group, PerspectiveCamera, Scene } from 'three';
import type { Dragon } from '../entities/dragon';
import { Foes } from '../entities/foes/foe';
import type { Effects } from '../fx/particles';
import type { Difficulty } from '../logic/difficulty';
import type { PartDefinition } from '../logic/gameState';
import { disposeObject } from '../render/dispose';
import type { Renderer } from '../render/renderer';
import type { Threat } from '../ui/threats';
import { KEEP_ID } from '../world/castle';
import { LEVELS, type LevelDefinition } from '../world/levels';
import { World } from '../world/world';
import { Combat } from './combat';
import { Director, type DirectorHooks } from './director';
import { FlightController } from './flight';
import { HostileFire } from './hostileFire';

/** How far an enemy, or an incoming projectile, gets an arrow at the edge of the screen. */
const THREAT_RANGE = 1500;
const PROJECTILE_WARNING_RANGE = 450;

/** One level being played: its world, the dragon's route, the enemies and the fire exchanged. */
export class Session {
  readonly level: LevelDefinition;
  readonly world: World;
  readonly flight: FlightController;
  readonly foes = new Foes();
  readonly hostile: HostileFire;
  readonly combat: Combat;
  director!: Director;
  private readonly group = new Group();

  constructor(
    readonly levelIndex: number,
    dragon: Dragon,
    camera: PerspectiveCamera,
    effects: Effects,
  ) {
    this.level = LEVELS[levelIndex];
    this.world = new World(this.level);
    const land = this.world.landscape;
    const castleAt = land.castlePosition();
    this.flight = new FlightController(this.world.curve, land, dragon, camera, castleAt.setY(castleAt.y + 50));
    this.hostile = new HostileFire(effects);
    this.combat = new Combat(effects, this.world.castle, this.world.obstacles.rocks, this.foes, (x, z) => land.terrainHeight(x, z));
    this.group.add(this.foes.group, this.hostile.group, this.combat.fireballs.group, this.combat.meteors.group);
  }

  /** Castle parts for the rules; the keep is shielded when the level has a mage. */
  castleParts(): { parts: PartDefinition[]; shielded: string | null } {
    const parts = this.world.castle.parts.map(({ id, hp }) => ({ id, hp }));
    return { parts, shielded: this.level.castle.mage ? KEEP_ID : null };
  }

  /** Puts everything back in place for a new run (or for the menu background). */
  prepare(difficulty: Difficulty, hooks: DirectorHooks, shieldUp: () => boolean, fireCooldown = 1): void {
    this.flight.reset();
    this.world.obstacles.reset();
    this.world.castle.reset();
    this.combat.reset(fireCooldown);
    this.hostile.clear();
    this.foes.clear();
    this.director = new Director(this.level, difficulty, this.foes, this.world.castle, hooks, shieldUp);
  }

  /** Enemies worth a warning and projectiles closing in, nearest first. */
  threats(): Threat[] {
    const dragon = this.flight.position;
    const threats: Threat[] = [];
    for (const foe of this.foes.items) {
      if (foe.alive && foe.indicator && foe.position.distanceTo(dragon) < THREAT_RANGE) threats.push({ position: foe.position, kind: foe.indicator });
    }
    for (const position of this.hostile.incoming(dragon, PROJECTILE_WARNING_RANGE)) threats.push({ position, kind: 'projectile' });
    return threats.sort((a, b) => a.position.distanceToSquared(dragon) - b.position.distanceToSquared(dragon));
  }

  attach(scene: Scene, renderer: Renderer): void {
    this.world.attach(scene, renderer);
    scene.add(this.group);
  }

  detach(scene: Scene): void {
    this.world.detach(scene);
    scene.remove(this.group);
    disposeObject(this.group);
  }
}
