import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { BOLT_DAMAGE, BOULDER_DAMAGE, ORB_DAMAGE, QUARREL_DAMAGE, STONE_DAMAGE } from '../config';
import { Projectiles } from '../entities/projectiles';
import type { HostileKind } from '../entities/foes/foe';
import { Effects, randomDirection } from '../fx/particles';

interface KindSpec {
  speed: number;
  damage: number;
  radius: number;
  life: number;
  /** How quickly it steers toward the dragon (0 = straight line). */
  homing: number;
  geometry: BufferGeometry;
  material: Material;
  orient: boolean;
  trail: (effects: Effects, position: Vector3) => void;
}

const DRAGON_HIT_RADIUS = 9;

function sparks(color: Color, size: number, spread: number) {
  return (effects: Effects, position: Vector3) =>
    effects.fire.emit({ position, velocity: randomDirection().multiplyScalar(spread), life: 0.35, size, endSize: size * 0.3, color });
}

function dust(size: number) {
  return (effects: Effects, position: Vector3) => {
    if (Math.random() < 0.5) {
      effects.smoke.emit({ position, velocity: randomDirection().multiplyScalar(4), life: 1, size, endSize: size * 3, color: new Color(0.12, 0.09, 0.07), endColor: new Color(0.2, 0.16, 0.13) });
    }
  };
}

function specs(): Record<HostileKind, KindSpec> {
  const stone = new MeshStandardMaterial({ color: '#6a5a4a', roughness: 1, flatShading: true });
  return {
    bolt: { speed: 240, damage: BOLT_DAMAGE, radius: 2, life: 5, homing: 0, geometry: new SphereGeometry(1.8, 12, 10), material: new MeshBasicMaterial({ color: new Color(1.6, 2.6, 6) }), orient: false, trail: sparks(new Color(0.8, 1.4, 4), 6, 3) },
    stone: { speed: 200, damage: STONE_DAMAGE, radius: 2, life: 5, homing: 0, geometry: new DodecahedronGeometry(1.6), material: stone, orient: false, trail: dust(3) },
    boulder: { speed: 150, damage: BOULDER_DAMAGE, radius: 5, life: 6, homing: 0, geometry: new DodecahedronGeometry(4.5), material: stone, orient: false, trail: dust(8) },
    quarrel: { speed: 330, damage: QUARREL_DAMAGE, radius: 1.5, life: 4, homing: 0, geometry: new ConeGeometry(0.25, 3.4, 5), material: new MeshStandardMaterial({ color: '#2e2016', emissive: '#ff6a2a', emissiveIntensity: 0.4 }), orient: true, trail: sparks(new Color(2.4, 0.9, 0.3), 2.5, 2) },
    orb: { speed: 120, damage: ORB_DAMAGE, radius: 2, life: 7, homing: 1.6, geometry: new SphereGeometry(1.7, 12, 10), material: new MeshBasicMaterial({ color: new Color(3, 0.6, 2.2) }), orient: false, trail: sparks(new Color(1.6, 0.35, 1.1), 7, 4) },
  };
}

/** Everything the enemies throw at the dragon, and what happens when it lands. */
export class HostileFire {
  readonly group = new Group();
  private readonly kinds: Record<HostileKind, KindSpec>;
  private readonly pools: Record<HostileKind, Projectiles>;

  constructor(private readonly effects: Effects) {
    this.kinds = specs();
    const entries = (Object.keys(this.kinds) as HostileKind[]).map((kind) => {
      const spec = this.kinds[kind];
      const pool = new Projectiles(spec.geometry, spec.material, (position) => spec.trail(effects, position), spec.orient);
      this.group.add(pool.group);
      return [kind, pool] as const;
    });
    this.pools = Object.fromEntries(entries) as Record<HostileKind, Projectiles>;
  }

  /** Fires at where the target will be, leading a moving target. */
  fire(kind: HostileKind, from: Vector3, target: Vector3, targetVelocity: Vector3): void {
    const spec = this.kinds[kind];
    const travel = target.distanceTo(from) / spec.speed;
    const aim = target.clone().addScaledVector(targetVelocity, travel * 0.85);
    this.pools[kind].spawn(from, aim.sub(from).normalize().multiplyScalar(spec.speed), spec.life);
  }

  /** Moves everything; calls `hurt` with the damage of each projectile that reaches the dragon. */
  update(dt: number, dragon: Vector3, ground: (x: number, z: number) => number, hurt: (damage: number) => void): void {
    for (const kind of Object.keys(this.pools) as HostileKind[]) {
      const spec = this.kinds[kind];
      const pool = this.pools[kind];
      if (spec.homing > 0) {
        for (const item of pool.items) {
          const toward = dragon.clone().sub(item.mesh.position).normalize().multiplyScalar(spec.speed);
          item.velocity.lerp(toward, Math.min(1, spec.homing * dt));
        }
      }
      pool.update(dt);
      for (const item of [...pool.items]) {
        const position = item.mesh.position;
        if (position.distanceTo(dragon) < DRAGON_HIT_RADIUS + spec.radius) {
          hurt(spec.damage);
          this.effects.explosion(position, 0.7);
          pool.remove(item);
        } else if (position.y < ground(position.x, position.z)) {
          this.effects.explosion(position, kind === 'boulder' ? 1.4 : 0.5);
          pool.remove(item);
        }
      }
    }
  }

  clear(): void {
    for (const pool of Object.values(this.pools)) pool.clear();
  }
}
