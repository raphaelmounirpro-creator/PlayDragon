import { Color, MeshBasicMaterial, SphereGeometry, Vector3 } from 'three';
import { FIREBALL_BLAST, FIREBALL_COOLDOWN, FIREBALL_SPEED, FLAME_JET, METEOR, TRIPLE_SPREAD } from '../config';
import type { Foe, Foes } from '../entities/foes/foe';
import { Projectiles } from '../entities/projectiles';
import { Effects, EmissionRate, randomDirection } from '../fx/particles';
import type { Castle } from '../world/castle';
import type { Rock } from '../world/obstacles';

/** Explosion size on a bat: a swarm around the mouth must not flood the screen with fire. */
const SMALL_BLAST = 0.3;
const JET_FLAMES_PER_SECOND = 160;
const JET_COLOR = new Color(2.4, 1.05, 0.3);
const JET_END = new Color(0.9, 0.12, 0.02);
const UP = new Vector3(0, 1, 0);

export interface CombatEvents {
  /** Returns true when the hit destroys the part. */
  onCastleHit(partId: string, damage: number): boolean;
  isPartVulnerable(partId: string): boolean;
  onShieldBlocked(at: Vector3): void;
  /** Every hit on an enemy (for the hit marker); `killed` when it was the last one. */
  onFoeHit(foe: Foe, killed: boolean): void;
  onExplosion(power: number, at: Vector3): void;
}

interface Shot {
  damage: number;
  power: number;
  blast: number;
  blastDamage: number;
  /** Fireball blasts only hurt fragile foes (bats); meteor blasts hurt every foe. */
  blastHurtsAll: boolean;
}

const FIREBALL_SHOT: Shot = { damage: 1, power: 1.2, blast: FIREBALL_BLAST, blastDamage: 1, blastHurtsAll: false };
const METEOR_SHOT: Shot = { damage: METEOR.damage, power: 3, blast: METEOR.blast, blastDamage: METEOR.blastDamage, blastHurtsAll: true };

/** The dragon's fire: fireballs, meteors, and what they hit. */
export class Combat {
  readonly fireballs: Projectiles;
  readonly meteors: Projectiles;
  private cooldown = 0;
  private cooldownFactor = 1;
  private jetClock = 0;
  private readonly jetFlames = new EmissionRate(JET_FLAMES_PER_SECOND);

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

  /** Starts a run; `cooldownFactor` below 1 fires faster (upgrade). */
  reset(cooldownFactor = 1): void {
    this.fireballs.clear();
    this.meteors.clear();
    this.cooldown = 0;
    this.cooldownFactor = cooldownFactor;
  }

  /** Regular fire breath; `triple` fans three fireballs out instead of one. Returns true when it fired. */
  tryFire(from: Vector3, target: Vector3, dt: number, wantsToFire: boolean, triple: boolean): boolean {
    this.cooldown -= dt;
    if (!wantsToFire || this.cooldown > 0) return false;
    this.cooldown = FIREBALL_COOLDOWN * this.cooldownFactor;
    const direction = target.clone().sub(from).normalize();
    for (const angle of triple ? [-TRIPLE_SPREAD, 0, TRIPLE_SPREAD] : [0]) {
      this.fireballs.spawn(from, direction.clone().applyAxisAngle(UP, angle).multiplyScalar(FIREBALL_SPEED), 3);
    }
    this.muzzleFlash(from, direction.multiplyScalar(FIREBALL_SPEED), 12);
    return true;
  }

  /**
   * A short jet of flame pours from the jaws while firing. It looks like real fire breath and
   * burns fragile enemies (bat swarms) in a short cone in front of the mouth.
   */
  breathe(from: Vector3, target: Vector3, dt: number, events: CombatEvents): void {
    const direction = target.clone().sub(from).normalize();
    for (let i = this.jetFlames.count(dt); i > 0; i--) {
      this.effects.fire.emit({
        position: from,
        velocity: direction.clone().multiplyScalar(220 + Math.random() * 60).add(randomDirection().multiplyScalar(26)),
        life: 0.22 + Math.random() * 0.12,
        size: 5,
        endSize: 20,
        color: JET_COLOR,
        endColor: JET_END,
        drag: 1.5,
      });
    }
    this.jetClock -= dt;
    if (this.jetClock > 0) return;
    this.jetClock = FLAME_JET.tick;
    for (const foe of this.foes.within(from, FLAME_JET.range)) {
      const toFoe = foe.position.clone().sub(from).normalize();
      if (foe.fragile && toFoe.dot(direction) > FLAME_JET.cosAngle) this.damageFoe(foe, 1, events);
    }
  }

  launchMeteor(from: Vector3, target: Vector3): void {
    const velocity = target.clone().sub(from).normalize().multiplyScalar(METEOR.speed);
    this.meteors.spawn(from, velocity, 4);
    this.muzzleFlash(from, velocity, 40);
  }

  update(dt: number, siege: boolean, events: CombatEvents): void {
    this.fireballs.update(dt);
    this.meteors.update(dt);
    this.resolve(this.fireballs, FIREBALL_SHOT, siege, events);
    this.resolve(this.meteors, METEOR_SHOT, siege, events);
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
   * Applies the hit, if any. Returns the size of the explosion to show, or null when nothing was hit.
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
      rock.mesh.visible = false;
      return shot.power;
    }
    return position.y < this.ground(position.x, position.z) ? shot.power * 0.7 : null;
  }

  private blast(position: Vector3, power: number, shot: Shot, events: CombatEvents): void {
    this.effects.explosion(position, power);
    events.onExplosion(power, position);
    for (const foe of this.foes.within(position, shot.blast)) {
      if ((shot.blastHurtsAll || foe.fragile) && foe.canBeHurt()) this.damageFoe(foe, shot.blastDamage, events);
    }
  }

  private damageFoe(foe: Foe, damage: number, events: CombatEvents): void {
    const killed = foe.hit(damage);
    events.onFoeHit(foe, killed);
    if (killed) this.foes.kill(foe, this.effects);
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
