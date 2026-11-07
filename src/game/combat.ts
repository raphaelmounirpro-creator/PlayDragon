import { Color, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { FIREBALL_COOLDOWN, FIREBALL_SPEED } from '../config';
import type { Foe, Foes } from '../entities/foes/foe';
import { Projectiles } from '../entities/projectiles';
import { Effects, randomDirection } from '../fx/particles';
import type { Castle } from '../world/castle';
import type { Rock } from '../world/obstacles';

const TRIPLE_SPREAD = 0.07;
const METEOR_SPEED = 380;
const METEOR_DAMAGE = 4;
/** Explosions also hurt what is around them. */
const FIREBALL_BLAST = 16;
const METEOR_BLAST = 45;
const SMALL_BLAST = 0.3;
const UP = new Vector3(0, 1, 0);

export interface CombatEvents {
  /** Returns true when the hit destroys the part. */
  onCastleHit(partId: string, damage: number): boolean;
  isPartVulnerable(partId: string): boolean;
  onShieldBlocked(at: Vector3): void;
  onFoeKilled(foe: Foe): void;
  onExplosion(power: number): void;
}

interface Shot {
  damage: number;
  power: number;
  blast: number;
  /** Fireball blasts only hurt fragile foes (bats); meteor blasts hurt every foe. */
  blastHurtsAll: boolean;
}

const FIREBALL: Shot = { damage: 1, power: 1.2, blast: FIREBALL_BLAST, blastHurtsAll: false };
const METEOR: Shot = { damage: METEOR_DAMAGE, power: 3, blast: METEOR_BLAST, blastHurtsAll: true };

/** The dragon's fire: fireballs, meteors, and what they hit. */
export class Combat {
  readonly fireballs: Projectiles;
  readonly meteors: Projectiles;
  private cooldown = 0;

  constructor(
    private readonly effects: Effects,
    private readonly castle: Castle,
    private readonly rocks: Rock[],
    private readonly foes: Foes,
    private readonly ground: (x: number, z: number) => number,
  ) {
    this.fireballs = new Projectiles(new SphereGeometry(2.4, 16, 12), new MeshBasicMaterial({ color: new Color(6, 3, 0.9) }), (p, v) => this.fireTrail(p, v, 1));
    this.meteors = new Projectiles(new SphereGeometry(7, 16, 12), new MeshBasicMaterial({ color: new Color(9, 4, 1.2) }), (p, v) => this.fireTrail(p, v, 3));
  }

  reset(): void {
    this.fireballs.clear();
    this.meteors.clear();
    this.cooldown = 0;
  }

  /** Regular fire breath; `triple` fans three fireballs out instead of one. Returns true when it fired. */
  tryFire(from: Vector3, target: Vector3, dt: number, wantsToFire: boolean, triple: boolean): boolean {
    this.cooldown -= dt;
    if (!wantsToFire || this.cooldown > 0) return false;
    this.cooldown = FIREBALL_COOLDOWN;
    const direction = target.clone().sub(from).normalize();
    for (const angle of triple ? [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD] : [0]) {
      this.fireballs.spawn(from, direction.clone().applyAxisAngle(UP, angle).multiplyScalar(FIREBALL_SPEED), 3);
    }
    this.muzzleFlash(from, direction.multiplyScalar(FIREBALL_SPEED), 12);
    return true;
  }

  launchMeteor(from: Vector3, target: Vector3): void {
    const velocity = target.clone().sub(from).normalize().multiplyScalar(METEOR_SPEED);
    this.meteors.spawn(from, velocity, 4);
    this.muzzleFlash(from, velocity, 40);
  }

  update(dt: number, siege: boolean, events: CombatEvents): void {
    this.fireballs.update(dt);
    this.meteors.update(dt);
    this.resolve(this.fireballs, FIREBALL, siege, events);
    this.resolve(this.meteors, METEOR, siege, events);
  }

  private resolve(projectiles: Projectiles, shot: Shot, siege: boolean, events: CombatEvents): void {
    for (const projectile of [...projectiles.items]) {
      const position = projectile.mesh.position;
      const power = this.strike(position, shot, siege, events);
      if (power === null) continue;
      projectiles.remove(projectile);
      this.blast(position, power, shot, events);
    }
  }

  /**
   * Applies the hit, if any. Returns the size of the explosion to show (small on bats, so a swarm
   * around the dragon's mouth does not flood the screen with fire), or null when nothing was hit.
   */
  private strike(position: Vector3, shot: Shot, siege: boolean, events: CombatEvents): number | null {
    const part = siege ? this.castle.partAt(position) : undefined;
    if (part) {
      if (!events.isPartVulnerable(part.id)) {
        events.onShieldBlocked(position);
        return shot.power * 0.5;
      }
      if (events.onCastleHit(part.id, shot.damage)) this.castle.destroy(part, this.effects);
      else this.castle.hit(part);
      return shot.power;
    }
    const foe = this.foes.at(position, 3);
    if (foe) {
      if (!foe.canBeHurt()) events.onShieldBlocked(position);
      else this.damageFoe(foe, shot.damage, events);
      return foe.fragile ? SMALL_BLAST : shot.power;
    }
    const rock = this.rocks.find((r) => r.mesh.visible && r.mesh.position.distanceTo(position) < r.radius + 4);
    if (rock) {
      rock.hit = true;
      rock.mesh.visible = false;
      return shot.power;
    }
    return position.y < this.ground(position.x, position.z) ? shot.power * 0.7 : null;
  }

  private blast(position: Vector3, power: number, shot: Shot, events: CombatEvents): void {
    this.effects.explosion(position, power);
    events.onExplosion(power);
    for (const foe of this.foes.within(position, shot.blast)) {
      if ((shot.blastHurtsAll || foe.fragile) && foe.canBeHurt()) this.damageFoe(foe, shot.blastHurtsAll ? 2 : 1, events);
    }
  }

  private damageFoe(foe: Foe, damage: number, events: CombatEvents): void {
    if (!foe.hit(damage)) return;
    this.foes.kill(foe, this.effects);
    events.onFoeKilled(foe);
  }

  private muzzleFlash(from: Vector3, velocity: Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      this.effects.fire.emit({
        position: from,
        velocity: velocity.clone().multiplyScalar(0.15).add(randomDirection().multiplyScalar(14)),
        life: 0.35,
        size: 7,
        endSize: 14,
        color: new Color(3, 1.6, 0.5),
        endColor: new Color(0.7, 0.12, 0.02),
      });
    }
  }

  private fireTrail(position: Vector3, velocity: Vector3, scale: number): void {
    this.effects.fire.emit({
      position,
      velocity: velocity.clone().multiplyScalar(-0.05).add(randomDirection().multiplyScalar(6 * scale)),
      life: 0.45,
      size: 9 * scale,
      endSize: 3 * scale,
      color: new Color(3.4, 1.7, 0.55),
      endColor: new Color(0.9, 0.15, 0.02),
    });
    if (Math.random() < 0.3) {
      this.effects.smoke.emit({
        position,
        velocity: randomDirection().multiplyScalar(4),
        life: 1.2,
        size: 6 * scale,
        endSize: 18 * scale,
        color: new Color(0.08, 0.045, 0.035),
        endColor: new Color(0.14, 0.09, 0.07),
      });
    }
  }
}
