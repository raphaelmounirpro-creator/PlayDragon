import {
  BufferAttribute,
  Camera,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';
import { DRAGON_HITBOX, SIEGE_DISTANCE } from '../config';
import { smoothstep, valueNoise } from '../core/noise';
import { createRandom } from '../core/random';
import { addBacklight } from '../fx/backlight';
import { frameAt } from './pathFrame';

export interface Ring {
  mesh: Mesh;
  material: MeshStandardMaterial;
}

export interface Rock {
  mesh: Object3D;
  radius: number;
}

/** What the dragon met along the route this frame. */
export interface Passage {
  rings: Ring[];
  rocks: Rock[];
}

const RING_RADIUS = 24;
const RING_SPACING = 340;
const ROCK_SPACING = 520;
const ROCK_VARIANTS = 4;
/** Rings fade out when the camera passes close by, instead of filling the screen. */
const RING_FADE_NEAR = 35;
const RING_FADE_FAR = 130;
/**
 * A ring sliding toward the edge of the screen is being passed, not aimed at: within `within`
 * units it fades as it goes from `from` to `to` (screen half-width = 1).
 */
const RING_EDGE_FADE = { from: 0.35, to: 0.8, within: 330 };
const onScreen = new Vector3();
/** How far behind the dragon a missed ring or rock disappears. */
const BEHIND_MARGIN = 10;
const toPoint = new Vector3();

function isBehind(point: Vector3, position: Vector3, forward: Vector3): boolean {
  return toPoint.subVectors(point, position).dot(forward) < -BEHIND_MARGIN;
}

function noise3(p: Vector3): number {
  return (valueNoise(p.x * 1.7 + p.z, p.y * 1.7 - p.z * 0.6) + valueNoise(p.y * 2.3 + 5.1, p.z * 2.3 + p.x * 0.4)) / 2;
}

/**
 * A floating crag: a flat mossy top over layered rock that tapers into a ridged, hanging point.
 * Fine facets and small cracks keep the flat shading from looking like a cut gem.
 */
function createRockGeometry(seed: number): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(1, 8);
  const positions = geometry.attributes.position as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  const moss = new Color('#4d5a2c');
  const stone = new Color('#5b4136');
  const ochre = new Color('#7a5440');
  const shadow = new Color('#2a1e1a');
  const color = new Color();
  const offset = new Vector3(seed * 13.1, seed * 7.7, seed * 3.3);
  const p = new Vector3();
  const sample = new Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const lumps = noise3(sample.copy(p).multiplyScalar(2.2).add(offset));
    const cracks = noise3(sample.copy(p).multiplyScalar(7).add(offset)) - 0.5;
    p.multiplyScalar(0.8 + 0.35 * lumps + 0.16 * cracks);
    if (p.y > 0.3) p.y = 0.3 + (p.y - 0.3) * 0.25;
    if (p.y < 0) {
      const taper = 1 - -p.y * 0.45;
      // Noise stretched along y draws vertical ridges down the hanging rock.
      const ridges = 1 + 0.3 * (noise3(sample.set(p.x * 6, p.y * 0.8, p.z * 6).add(offset)) - 0.5);
      p.y *= 1.9;
      p.x *= taper * ridges;
      p.z *= taper * ridges;
    }
    positions.setXYZ(i, p.x, p.y, p.z);
    const strata = smoothstep(0.45, 0.6, valueNoise(p.y * 11 + seed, (p.x + p.z) * 0.7));
    color.copy(shadow).lerp(stone, smoothstep(-1.4, 0.1, p.y)).lerp(ochre, strata * 0.45).lerp(moss, smoothstep(0.22, 0.32, p.y));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Golden rings to fly through and floating crags to avoid along the route. */
export class Obstacles {
  readonly group = new Group();
  readonly rings: Ring[] = [];
  readonly rocks: Rock[] = [];

  constructor(curve: CatmullRomCurve3) {
    const random = createRandom(2024);
    const lastDistance = curve.getLength() - SIEGE_DISTANCE - 200;
    this.placeRings(curve, lastDistance, random);
    this.placeRocks(curve, lastDistance, random);
  }

  reset(): void {
    for (const { mesh } of [...this.rings, ...this.rocks]) mesh.visible = true;
  }

  update(time: number, camera: Camera): void {
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.mesh.rotation.z = time * 0.8;
      const distance = ring.mesh.position.distanceTo(camera.position);
      onScreen.copy(ring.mesh.position).project(camera);
      const atEdge = smoothstep(RING_EDGE_FADE.from, RING_EDGE_FADE.to, Math.max(Math.abs(onScreen.x), Math.abs(onScreen.y)));
      const close = 1 - smoothstep(RING_FADE_FAR, RING_EDGE_FADE.within, distance);
      ring.material.opacity = smoothstep(RING_FADE_NEAR, RING_FADE_FAR, distance) * (1 - atEdge * close);
    }
  }

  /**
   * Rings the dragon flew through and rocks it crashed into this frame. Whatever it has passed
   * disappears, so the camera following behind never flies through a ring or a rock.
   */
  pass(position: Vector3, forward: Vector3): Passage {
    const passage: Passage = { rings: [], rocks: [] };
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      const through = ring.mesh.position.distanceTo(position) < RING_RADIUS;
      if (through) passage.rings.push(ring);
      if (through || isBehind(ring.mesh.position, position, forward)) ring.mesh.visible = false;
    }
    for (const rock of this.rocks) {
      if (!rock.mesh.visible) continue;
      const crash = rock.mesh.position.distanceTo(position) < rock.radius + DRAGON_HITBOX.rock;
      if (crash) passage.rocks.push(rock);
      if (crash || isBehind(rock.mesh.position, position, forward)) rock.mesh.visible = false;
    }
    return passage;
  }

  private placeRings(curve: CatmullRomCurve3, lastDistance: number, random: () => number): void {
    const geometry = new TorusGeometry(RING_RADIUS, 2, 12, 64);
    for (let d = 400; d < lastDistance; d += RING_SPACING) {
      const material = new MeshStandardMaterial({ color: '#ffcf6a', emissive: '#ffb347', emissiveIntensity: 2.6, metalness: 0.6, roughness: 0.3, transparent: true });
      const mesh = new Mesh(geometry, material);
      this.place(mesh, curve, d, (random() - 0.5) * 160, (random() - 0.5) * 80);
      this.rings.push({ mesh, material });
      this.group.add(mesh);
    }
  }

  private placeRocks(curve: CatmullRomCurve3, lastDistance: number, random: () => number): void {
    const variants = Array.from({ length: ROCK_VARIANTS }, (_, i) => createRockGeometry(i + 1));
    const stone = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    addBacklight(stone, { rimColor: new Color(1.0, 0.45, 0.15), rimPower: 3 });
    const pine = new MeshStandardMaterial({ color: '#1f2a18', roughness: 1, flatShading: true });
    const tree = new ConeGeometry(0.07, 0.32, 6);
    for (let d = 700; d < lastDistance; d += ROCK_SPACING) {
      const radius = 14 + random() * 14;
      const crag = new Group();
      crag.add(new Mesh(variants[Math.floor(random() * ROCK_VARIANTS)], stone));
      for (let i = 0; i < 3; i++) {
        const pineTree = new Mesh(tree, pine);
        pineTree.position.set((random() - 0.5) * 0.9, 0.46, (random() - 0.5) * 0.9);
        crag.add(pineTree);
      }
      crag.scale.setScalar(radius);
      this.place(crag, curve, d, (random() - 0.5) * 200, (random() - 0.5) * 100);
      crag.rotation.set(0, random() * Math.PI * 2, 0);
      this.rocks.push({ mesh: crag, radius: radius * 1.2 });
      this.group.add(crag);
    }
  }

  private place(object: Object3D, curve: CatmullRomCurve3, distance: number, x: number, y: number): void {
    const frame = frameAt(curve, distance);
    object.position.copy(frame.point).addScaledVector(frame.right, x).addScaledVector(frame.up, y);
    object.lookAt(object.position.clone().add(frame.tangent));
  }
}
