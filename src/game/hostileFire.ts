import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  ConeGeometry,
  DodecahedronGeometry,
  Group,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { DRAGON_HITBOX, ENEMY_LEAD, HOSTILE } from '../config';
import type { HostileKind } from '../entities/foes/foe';
import { Projectiles } from '../entities/projectiles';
import { Effects, randomDirection } from '../fx/particles';

interface KindSpec {
  speed: number;
  damage: number;
  radius: number;
  life: number;
  /** How quickly it steers toward the dragon (0 = straight line). */
  homing: number;
  /** How fast it grows (sound waves widen as they travel). */
  growth: number;
  geometry: BufferGeometry;
  material: Material;
  orient: boolean;
  trail: (effects: Effects, position: Vector3) => void;
}

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

const quiet = () => undefined;

function specs(): Record<HostileKind, KindSpec> {
  const stone = new MeshStandardMaterial({ color: '#6a5a4a', roughness: 1, flatShading: true });
  const base = { homing: 0, growth: 0, orient: false };
  return {
    bolt: { ...base, ...HOSTILE.bolt, radius: 2, life: 5, geometry: new SphereGeometry(1.8, 12, 10), material: new MeshBasicMaterial({ color: new Color(1.6, 2.6, 6) }), trail: sparks(new Color(0.8, 1.4, 4), 6, 3) },
    stone: { ...base, ...HOSTILE.stone, radius: 2, life: 5, geometry: new DodecahedronGeometry(1.6), material: stone, trail: dust(3) },
    boulder: { ...base, ...HOSTILE.boulder, radius: 5, life: 6, geometry: new DodecahedronGeometry(4.5), material: stone, trail: dust(8) },
    quarrel: { ...base, ...HOSTILE.quarrel, radius: 1.5, life: 4, orient: true, geometry: new ConeGeometry(0.25, 3.4, 5), material: new MeshStandardMaterial({ color: '#2e2016', emissive: '#ff6a2a', emissiveIntensity: 0.4 }), trail: sparks(new Color(2.4, 0.9, 0.3), 2.5, 2) },
    orb: { ...base, ...HOSTILE.orb, radius: 2, life: 7, geometry: new SphereGeometry(1.7, 12, 10), material: new MeshBasicMaterial({ color: new Color(3, 0.6, 2.2) }), trail: sparks(new Color(1.6, 0.35, 1.1), 7, 4) },
    wave: {
      ...base,
      ...HOSTILE.wave,
      radius: 4,
      life: 4,
      growth: 0.9,
      orient: true,
      geometry: new TorusGeometry(4, 0.5, 8, 32).rotateX(Math.PI / 2),
      material: new MeshBasicMaterial({ color: new Color(1.8, 0.6, 1.6), transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false }),
      trail: quiet,
    },
    flame: { ...base, ...HOSTILE.flame, radius: 2.2, life: 4, geometry: new SphereGeometry(2.2, 12, 10), material: new MeshBasicMaterial({ color: new Color(6, 1.8, 0.5) }), trail: sparks(new Color(3, 0.9, 0.25), 8, 6) },
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

  /** Fires toward where the target is heading (partially: a change of course dodges it). */
  fire(kind: HostileKind, from: Vector3, target: Vector3, targetVelocity: Vector3): void {
    const spec = this.kinds[kind];
    const travel = target.distanceTo(from) / spec.speed;
    const aim = target.clone().addScaledVector(targetVelocity, travel * ENEMY_LEAD);
    this.pools[kind].spawn(from, aim.sub(from).normalize().multiplyScalar(spec.speed), spec.life);
  }

  /** Moves everything; calls `hurt` with the damage of each projectile that reaches the dragon. */
  update(dt: number, dragon: Vector3, ground: (x: number, z: number) => number, hurt: (damage: number) => void): void {
    for (const kind of Object.keys(this.pools) as HostileKind[]) {
      const spec = this.kinds[kind];
      const pool = this.pools[kind];
      for (const item of pool.items) {
        if (spec.homing > 0) item.velocity.lerp(dragon.clone().sub(item.mesh.position).normalize().multiplyScalar(spec.speed), Math.min(1, spec.homing * dt));
        if (spec.growth > 0) item.mesh.scale.setScalar(1 + (spec.life - item.life) * spec.growth);
      }
      pool.update(dt);
      for (const item of [...pool.items]) {
        const position = item.mesh.position;
        if (position.distanceTo(dragon) < DRAGON_HITBOX.projectile + spec.radius * item.mesh.scale.x) {
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

  /** Projectiles closer than `range` and still coming toward the dragon (for the edge warnings). */
  incoming(dragon: Vector3, range: number): Vector3[] {
    const threats: Vector3[] = [];
    for (const pool of Object.values(this.pools)) {
      for (const item of pool.items) {
        const toDragon = dragon.clone().sub(item.mesh.position);
        if (toDragon.length() < range && toDragon.dot(item.velocity) > 0) threats.push(item.mesh.position);
      }
    }
    return threats;
  }

  clear(): void {
    for (const pool of Object.values(this.pools)) pool.clear();
  }
}
