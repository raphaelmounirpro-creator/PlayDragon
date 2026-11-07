import {
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { Effects } from '../fx/particles';
import { createStoneTexture } from '../fx/textures';
import type { Landscape } from './landscape';
import type { CastleLayout } from './levels';

export const KEEP_ID = 'donjon';

export interface CastlePart {
  id: string;
  hp: number;
  group: Group;
  bounds: Box3;
  top: Vector3;
  shake: number;
  baseX: number;
}

/** Where a defender stands (world space) and which way is outside. */
export interface Post {
  position: Vector3;
  outward: Vector3;
}

interface Debris {
  mesh: Mesh;
  velocity: Vector3;
  spin: Vector3;
  resting: boolean;
}

interface TowerSpec {
  id: string;
  x: number;
  z: number;
  radius: number;
  height: number;
  hp: number;
}

const WALL_HEIGHT = 38;
const GATE_HALF_WIDTH = 17;
const KEEP_Z = -12;

/** Corner, gate and (optional) side towers of a square fortress, front facing +Z. */
function towerSpecs(layout: CastleLayout): TowerSpec[] {
  const h = layout.halfSize;
  const t = layout.towerHeight;
  const hp = layout.towerHp;
  const specs: TowerSpec[] = [
    { id: 'tour-nord-ouest', x: -h, z: -h, radius: 13, height: t, hp },
    { id: 'tour-nord-est', x: h, z: -h, radius: 13, height: t, hp },
    { id: 'tour-sud-ouest', x: -h, z: h, radius: 13, height: t * 0.92, hp },
    { id: 'tour-sud-est', x: h, z: h, radius: 13, height: t * 0.92, hp },
    { id: 'porte-ouest', x: -GATE_HALF_WIDTH, z: h + 2, radius: 9, height: t * 0.75, hp: Math.max(1, hp - 1) },
    { id: 'porte-est', x: GATE_HALF_WIDTH, z: h + 2, radius: 9, height: t * 0.75, hp: Math.max(1, hp - 1) },
  ];
  if (layout.sideTowers) {
    specs.push({ id: 'tour-ouest', x: -h, z: 0, radius: 11, height: t * 0.85, hp }, { id: 'tour-est', x: h, z: 0, radius: 11, height: t * 0.85, hp });
  }
  return specs;
}

/** Wall segments along the perimeter, leaving the gate open between the gate towers. */
function wallSegments(layout: CastleLayout): Array<[number, number, number, number]> {
  const h = layout.halfSize;
  const ring: Array<[number, number]> = [[GATE_HALF_WIDTH, h + 2], [h, h]];
  if (layout.sideTowers) ring.push([h, 0]);
  ring.push([h, -h], [-h, -h]);
  if (layout.sideTowers) ring.push([-h, 0]);
  ring.push([-h, h], [-GATE_HALF_WIDTH, h + 2]);
  const segments: Array<[number, number, number, number]> = [];
  for (let i = 0; i < ring.length - 1; i++) segments.push([...ring[i], ...ring[i + 1]]);
  return segments;
}

/** The fortress waiting at the end of the valley; each tower and the keep can be destroyed. */
export class Castle {
  readonly group = new Group();
  readonly parts: CastlePart[] = [];
  private readonly walls = new Group();
  private readonly debris: Debris[] = [];
  private readonly ruins: Vector3[] = [];
  private readonly segments: Array<[number, number, number, number]>;
  private readonly keepTop: number;
  private readonly stone: MeshStandardMaterial;
  private readonly roof: MeshStandardMaterial;
  private readonly windowLight = new MeshStandardMaterial({ color: '#000000', emissive: new Color('#ffb050'), emissiveIntensity: 5 });
  private readonly banner = new MeshStandardMaterial({ color: '#6e1414', roughness: 0.8, side: DoubleSide });

  constructor(
    position: Vector3,
    private readonly land: Landscape,
    private readonly layout: CastleLayout,
  ) {
    const texture = createStoneTexture();
    texture.repeat.set(4, 3);
    this.stone = new MeshStandardMaterial({ map: texture, color: layout.stone, roughness: 0.92, metalness: 0 });
    this.roof = new MeshStandardMaterial({ color: layout.roof, roughness: 0.6, metalness: 0.2 });
    this.group.position.copy(position);
    this.keepTop = layout.keepHeight - 8;
    this.segments = wallSegments(layout);

    for (const spec of towerSpecs(layout)) this.addPart(spec.id, spec.hp, this.createTower(spec));
    this.addPart(KEEP_ID, layout.keepHp, this.createKeep());
    this.createWalls();
    this.group.add(this.walls);
    this.group.updateMatrixWorld(true);
    for (const part of this.parts) this.measure(part);
  }

  reset(): void {
    for (const part of this.parts) {
      part.group.visible = true;
      part.shake = 0;
    }
    this.walls.visible = true;
    for (const piece of this.debris) this.group.remove(piece.mesh);
    this.debris.length = 0;
    this.ruins.length = 0;
  }

  partAt(point: Vector3): CastlePart | undefined {
    return this.parts.find((part) => part.group.visible && part.bounds.containsPoint(point));
  }

  standingParts(): CastlePart[] {
    return this.parts.filter((part) => part.group.visible);
  }

  isStanding(id: string): boolean {
    return this.parts.some((part) => part.id === id && part.group.visible);
  }

  /** Posts on the walkways for the crossbowmen, front walls first (they face the dragon's arrival). */
  archerPosts(count: number): Post[] {
    const posts: Post[] = [];
    const sorted = [...this.segments].sort((a, b) => b[1] + b[3] - (a[1] + a[3]));
    for (const fractions of [[0.5], [0.25, 0.75]]) {
      for (const [x1, z1, x2, z2] of sorted) {
        for (const f of fractions) {
          const local = new Vector3(x1 + (x2 - x1) * f, WALL_HEIGHT, z1 + (z2 - z1) * f);
          const outward = local.clone().setY(0).normalize();
          posts.push({ position: local.addScaledVector(outward, 2).add(this.group.position), outward });
        }
      }
    }
    return posts.slice(0, count);
  }

  /** The mage stands on top of the keep, facing the gate. */
  magePost(): Post {
    return { position: new Vector3(0, this.keepTop, KEEP_Z + 16).add(this.group.position), outward: new Vector3(0, 0, 1) };
  }

  /** Center and radii (horizontal, vertical) of the magic dome around the keep. */
  keepDome(): { center: Vector3; radius: number; height: number } {
    const height = (this.keepTop + 70) / 2;
    return { center: new Vector3(0, height - 6, KEEP_Z).add(this.group.position), radius: 44, height };
  }

  hit(part: CastlePart): void {
    part.shake = 0.4;
  }

  destroy(part: CastlePart, effects: Effects): void {
    part.group.visible = false;
    const center = part.bounds.getCenter(new Vector3());
    effects.explosion(center, 2.4);
    effects.explosion(part.top, 1.6);
    this.scatterDebris(part.bounds, 26);
    this.ruins.push(new Vector3(center.x, part.bounds.min.y + 8, center.z));
  }

  /** Final collapse once every part has fallen: the curtain walls crumble too. */
  collapseWalls(effects: Effects): void {
    if (!this.walls.visible) return;
    this.walls.visible = false;
    const bounds = new Box3().setFromObject(this.walls);
    this.scatterDebris(bounds, 60);
    for (let i = 0; i < 6; i++) {
      const point = new Vector3(
        bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
        bounds.min.y + 20,
        bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z),
      );
      effects.explosion(point, 1.8);
      this.ruins.push(point);
    }
  }

  update(dt: number, time: number, effects: Effects): void {
    for (const part of this.parts) {
      part.shake = Math.max(0, part.shake - dt);
      part.group.position.x = part.baseX + Math.sin(time * 60) * part.shake * 2;
    }
    for (const ruin of this.ruins) if (Math.random() < 0.6) effects.burning(ruin, 1.4);
    this.updateDebris(dt);
  }

  private addPart(id: string, hp: number, group: Group): void {
    this.group.add(group);
    this.parts.push({ id, hp, group, bounds: new Box3(), top: new Vector3(), shake: 0, baseX: group.position.x });
  }

  private measure(part: CastlePart): void {
    part.bounds.setFromObject(part.group).expandByScalar(6);
    const center = part.bounds.getCenter(new Vector3());
    part.top.set(center.x, part.bounds.max.y - 10, center.z);
  }

  private createTower(spec: TowerSpec): Group {
    const tower = new Group();
    tower.position.set(spec.x, 0, spec.z);
    const base = this.groundOffset(spec.x, spec.z);
    const shaft = new Mesh(new CylinderGeometry(spec.radius, spec.radius * 1.12, spec.height + base, 20), this.stone);
    shaft.position.y = (spec.height - base) / 2;
    const corbel = new Mesh(new CylinderGeometry(spec.radius * 1.2, spec.radius, 5, 20), this.stone);
    corbel.position.y = spec.height + 2.5;
    const roof = new Mesh(new ConeGeometry(spec.radius * 1.35, spec.height * 0.55, 20), this.roof);
    roof.position.y = spec.height + 5 + spec.height * 0.275;
    tower.add(shaft, corbel, roof, this.createBanner(spec.height + 5 + spec.height * 0.55));
    for (let i = 0; i < 3; i++) {
      const window = new Mesh(new BoxGeometry(2, 4.5, 1), this.windowLight);
      const angle = Math.PI / 2 + (i - 1) * 0.9;
      window.position.set(Math.cos(angle) * spec.radius, spec.height * (0.45 + i * 0.17), Math.sin(angle) * spec.radius);
      window.lookAt(window.position.x * 2, window.position.y, window.position.z * 2);
      tower.add(window);
    }
    return tower;
  }

  private createKeep(): Group {
    const keep = new Group();
    keep.position.set(0, 0, KEEP_Z);
    const height = this.layout.keepHeight;
    const body = new Mesh(new BoxGeometry(46, height, 42), this.stone);
    body.position.y = height / 2 - 8;
    const turret = new Mesh(new CylinderGeometry(11, 11, 34, 18), this.stone);
    turret.position.set(0, this.keepTop + 16, 0);
    const roof = new Mesh(new ConeGeometry(15, 46, 18), this.roof);
    roof.position.set(0, this.keepTop + 56, 0);
    keep.add(body, turret, roof, this.createBanner(this.keepTop + 79));
    this.addCrenellations(keep, 46, 42, this.keepTop);
    for (let floor = 0; floor < 3; floor++) {
      for (const x of [-12, 0, 12]) {
        const window = new Mesh(new BoxGeometry(3, 6, 1), this.windowLight);
        window.position.set(x, height * 0.35 + floor * height * 0.19, 21.2);
        keep.add(window);
      }
    }
    return keep;
  }

  private createWalls(): void {
    for (const [x1, z1, x2, z2] of this.segments) {
      const length = Math.hypot(x2 - x1, z2 - z1);
      const wall = new Group();
      wall.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
      wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      const base = this.groundOffset(wall.position.x, wall.position.z);
      const body = new Mesh(new BoxGeometry(length, WALL_HEIGHT + base, 8), this.stone);
      body.position.y = (WALL_HEIGHT - base) / 2;
      wall.add(body);
      this.addCrenellations(wall, length, 8, WALL_HEIGHT);
      this.walls.add(wall);
    }
    const gate = new Mesh(new BoxGeometry(GATE_HALF_WIDTH * 2 - 14, 26, 2), new MeshStandardMaterial({ color: '#2a1a12', roughness: 1 }));
    gate.position.set(0, 13, this.layout.halfSize + 4);
    this.walls.add(gate);
  }

  private addCrenellations(parent: Object3D, width: number, depth: number, y: number): void {
    const merlons = Math.floor(width / 6);
    const mesh = new InstancedMesh(new BoxGeometry(3.2, 4.5, depth + 0.6), this.stone, merlons);
    const dummy = new Object3D();
    for (let i = 0; i < merlons; i++) {
      dummy.position.set(-width / 2 + 3 + i * 6, y + 2.2, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    parent.add(mesh);
  }

  private createBanner(y: number): Group {
    const banner = new Group();
    const pole = new Mesh(new CylinderGeometry(0.4, 0.4, 14, 6), this.roof);
    pole.position.y = y + 7;
    const cloth = new Mesh(new BoxGeometry(9, 5, 0.2), this.banner);
    cloth.position.set(4.6, y + 11.5, 0);
    banner.add(pole, cloth);
    return banner;
  }

  /** How far the ground drops below the castle base at a local position (so towers reach the hillside). */
  private groundOffset(x: number, z: number): number {
    const world = this.group.position;
    return Math.max(0, world.y - this.land.terrainHeight(world.x + x, world.z + z)) + 6;
  }

  private scatterDebris(bounds: Box3, count: number): void {
    const center = bounds.getCenter(new Vector3());
    for (let i = 0; i < count; i++) {
      const size = 3 + Math.random() * 6;
      const mesh = new Mesh(new BoxGeometry(size, size * 0.7, size * 0.9), this.stone);
      mesh.position
        .set(
          bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x),
          bounds.min.y + Math.random() * (bounds.max.y - bounds.min.y),
          bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z),
        )
        .sub(this.group.position);
      const outward = mesh.position.clone().add(this.group.position).sub(center).setY(0).normalize();
      const velocity = outward.multiplyScalar(20 + Math.random() * 50).setY(10 + Math.random() * 40);
      const spin = new Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.debris.push({ mesh, velocity, spin, resting: false });
      this.group.add(mesh);
    }
  }

  private updateDebris(dt: number): void {
    const world = new Vector3();
    for (const piece of this.debris) {
      if (piece.resting) continue;
      piece.velocity.y -= 90 * dt;
      piece.mesh.position.addScaledVector(piece.velocity, dt);
      piece.mesh.rotation.x += piece.spin.x * dt;
      piece.mesh.rotation.y += piece.spin.y * dt;
      piece.mesh.rotation.z += piece.spin.z * dt;
      world.copy(piece.mesh.position).add(this.group.position);
      const ground = this.land.terrainHeight(world.x, world.z) - this.group.position.y + 2;
      if (piece.mesh.position.y <= ground) {
        piece.mesh.position.y = ground;
        piece.resting = true;
      }
    }
  }
}
