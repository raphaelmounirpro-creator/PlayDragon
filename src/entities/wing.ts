import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../core/noise';
import { addBacklight } from '../fx/backlight';
import { createMembraneTexture, WingBone2D } from '../fx/textures';
import { createSpikeGeometry, placeSpike } from './spike';

const SUBDIVISIONS = 6;
const Y_AXIS = new Vector3(0, 1, 0);

// Rest pose of the right wing, dragon facing -Z. Huge, pointed wings like the reference painting.
const SHOULDER = new Vector3(2.2, 3.9, -4);
const ELBOW = new Vector3(12, 7, -2);
const WRIST = new Vector3(22, 9, -6);
const TIPS = [new Vector3(56, 8.5, -3), new Vector3(47, 3.5, 10), new Vector3(36, 1, 19), new Vector3(22, 1, 22)];
const KNUCKLES = TIPS.map((tip) => WRIST.clone().lerp(tip, 0.48));
const TRAILING_ROOT = new Vector3(3, 2.4, 10);
const SPAN = TIPS[0].x;
const SCALLOP_DEPTH = 0.38;
const FINGER_RADII = [0.5, 0.42, 0.36, 0.32];

/** Every bone as [start, end, radius at start]; each finger has two phalanges. */
const BONES: Array<[Vector3, Vector3, number]> = [
  [SHOULDER, ELBOW, 1.05],
  [ELBOW, WRIST, 0.8],
  ...TIPS.flatMap((tip, i): Array<[Vector3, Vector3, number]> => [
    [WRIST, KNUCKLES[i], FINGER_RADII[i]],
    [KNUCKLES[i], tip, FINGER_RADII[i] * 0.72],
  ]),
];

/** Rounded joints hiding the seams between bones: [position, radius]. */
const JOINTS: Array<[Vector3, number]> = [
  [ELBOW, 0.8],
  [WRIST, 0.58],
  ...KNUCKLES.map((knuckle, i): [Vector3, number] => [knuckle, FINGER_RADII[i] * 0.74]),
];

const ELBOW_FOLD = 0.9;
const WRIST_FOLD = 1.1;
const CLAW_CURL = new Vector3(0, -0.6, 1);

/** Rotates `point` around the vertical axis through `pivot`; negative angles swing it backward (+Z). */
function rotateAboutY(point: Vector3, pivot: Vector3, angle: number): void {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  point.x = pivot.x + dx * Math.cos(angle) + dz * Math.sin(angle);
  point.z = pivot.z - dx * Math.sin(angle) + dz * Math.cos(angle);
}

/** Scalloped trailing edge: midpoints pulled toward the wrist, like stretched leather. */
function scallop(a: Vector3, b: Vector3): Vector3 {
  return a.clone().lerp(b, 0.5).lerp(WRIST, SCALLOP_DEPTH);
}

function membraneTriangles(): Array<[Vector3, Vector3, Vector3, number]> {
  const edge = [TIPS[0], scallop(TIPS[0], TIPS[1]), TIPS[1], scallop(TIPS[1], TIPS[2]), TIPS[2], scallop(TIPS[2], TIPS[3]), TIPS[3], scallop(TIPS[3], TRAILING_ROOT), TRAILING_ROOT];
  const triangles: Array<[Vector3, Vector3, Vector3, number]> = [];
  for (let i = 0; i < edge.length - 1; i++) triangles.push([WRIST, edge[i], edge[i + 1], 1.2]);
  triangles.push([SHOULDER, ELBOW, WRIST, 0.4], [SHOULDER, WRIST, TRAILING_ROOT, 2.2]);
  return triangles;
}

/** Subdivides each triangle so the wing can bend smoothly, with a billowing sag. */
function buildRestVertices(): Float32Array {
  const values: number[] = [];
  const n = SUBDIVISIONS;
  const point = (a: Vector3, b: Vector3, c: Vector3, i: number, j: number, sag: number): number[] => {
    const u = i / n;
    const v = j / n;
    const w = 1 - u - v;
    const billow = -sag * 27 * u * v * w;
    return [a.x * w + b.x * u + c.x * v, a.y * w + b.y * u + c.y * v + billow, a.z * w + b.z * u + c.z * v];
  };
  for (const [a, b, c, sag] of membraneTriangles()) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        values.push(...point(a, b, c, i, j, sag), ...point(a, b, c, i + 1, j, sag), ...point(a, b, c, i, j + 1, sag));
        if (i + j < n - 1) {
          values.push(...point(a, b, c, i + 1, j, sag), ...point(a, b, c, i + 1, j + 1, sag), ...point(a, b, c, i, j + 1, sag));
        }
      }
    }
  }
  return new Float32Array(values);
}

/** Texture coordinates are the rest position seen from above. */
const toUv = (x: number, z: number): [number, number] => [x / SPAN, (z + 8) / 30];
const fromUv = (u: number, v: number): [number, number] => [u * SPAN, v * 30 - 8];

/** Indexed membrane: shared vertices give smooth normals instead of a faceted look. */
function buildMembraneGeometry(): BufferGeometry {
  const rest = buildRestVertices();
  const uvs = new Float32Array((rest.length / 3) * 2);
  for (let i = 0; i < rest.length / 3; i++) uvs.set(toUv(rest[i * 3], rest[i * 3 + 2]), i * 2);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(rest, 3));
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  return mergeVertices(geometry, 1e-3);
}

let sharedMembrane: Texture | null = null;

/** Painted once from the bone layout, then reused by every dragon (player and wyverns). */
function membraneTexture(): Texture {
  if (!sharedMembrane) {
    const bones2D: WingBone2D[] = [
      ...BONES.map(([start, end]): WingBone2D => [start.x, start.z, end.x, end.z]),
      [SHOULDER.x, SHOULDER.z, TRAILING_ROOT.x, TRAILING_ROOT.z],
    ];
    sharedMembrane = createMembraneTexture(bones2D, fromUv);
    sharedMembrane.userData.shared = true;
  }
  return sharedMembrane;
}

/** Leather shared by both wings, darker along the bones and glowing between them against the sun. */
export function createMembraneMaterial(): MeshStandardMaterial {
  const texture = membraneTexture();
  const material = new MeshStandardMaterial({
    map: texture,
    emissive: '#ff5c1f',
    emissiveMap: texture,
    emissiveIntensity: 0.3,
    roughness: 0.75,
    metalness: 0.05,
    side: DoubleSide,
  });
  addBacklight(material, { rimColor: new Color(0.5, 0.2, 0.06), rimPower: 6, transmission: new Color(1.4, 1.0, 0.4) });
  return material;
}

export interface WingMaterials {
  membrane: Material;
  skin: Material;
  claw: Material;
}

/** One bat-like wing: jointed bones, clawed fingers and a membrane, posed every frame. */
export class Wing {
  readonly group = new Group();
  private readonly membrane: Mesh;
  private readonly bones: Mesh[] = [];
  private readonly joints: Mesh[] = [];
  private readonly claws: Mesh[] = [];
  private readonly thumb: Mesh;
  private readonly side: number;
  private readonly rest: Float32Array;
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly foldedWrist = new Vector3();
  private fold = 0;

  constructor(side: 1 | -1, materials: WingMaterials) {
    this.side = side;
    const geometry = buildMembraneGeometry();
    this.rest = Float32Array.from(geometry.attributes.position.array);
    this.membrane = new Mesh(geometry, materials.membrane);
    this.membrane.frustumCulled = false;
    this.group.add(this.membrane);

    const boneGeometry = new CylinderGeometry(0.7, 1, 1, 10);
    for (let i = 0; i < BONES.length; i++) this.bones.push(this.add(new Mesh(boneGeometry, materials.skin)));
    const jointGeometry = new SphereGeometry(1, 14, 10);
    for (let i = 0; i < JOINTS.length; i++) this.joints.push(this.add(new Mesh(jointGeometry, materials.skin)));
    const clawGeometry = createSpikeGeometry(1.2, 0.8);
    for (let i = 0; i < TIPS.length; i++) this.claws.push(this.add(new Mesh(clawGeometry, materials.claw)));
    this.thumb = this.add(new Mesh(clawGeometry, materials.claw));
    this.update(0, 0);
  }

  /**
   * flap > 0 raises the wing; sweep > 0 swings the tips forward;
   * fold in [0, 1] bends the wing back at the elbow and the wrist, like a bat tucking in.
   */
  update(flap: number, sweep: number, fold = 0): void {
    this.fold = fold;
    this.foldedWrist.copy(WRIST);
    rotateAboutY(this.foldedWrist, ELBOW, -fold * ELBOW_FOLD);

    const positions = this.membrane.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      this.a.fromArray(this.rest, i * 3);
      this.pose(this.a, flap, sweep);
      positions.setXYZ(i, this.a.x, this.a.y, this.a.z);
    }
    positions.needsUpdate = true;
    this.membrane.geometry.computeVertexNormals();

    BONES.forEach(([start, end, radius], i) => {
      this.pose(this.a.copy(start), flap, sweep);
      this.pose(this.b.copy(end), flap, sweep);
      this.placeBetween(this.bones[i], this.a, this.b, radius);
    });
    JOINTS.forEach(([position, radius], i) => {
      this.pose(this.joints[i].position.copy(position), flap, sweep);
      this.joints[i].scale.setScalar(radius);
    });
    this.placeClaws(flap, sweep);
  }

  private add(mesh: Mesh): Mesh {
    this.group.add(mesh);
    return mesh;
  }

  /** A hooked claw prolongs each finger; the thumb claw points forward from the wrist. */
  private placeClaws(flap: number, sweep: number): void {
    const wrist = this.pose(new Vector3().copy(WRIST), flap, sweep);
    TIPS.forEach((tip, i) => {
      const knuckle = this.pose(this.a.copy(KNUCKLES[i]), flap, sweep).clone();
      const end = this.pose(this.b.copy(tip), flap, sweep);
      placeSpike(this.claws[i], end, end.clone().sub(knuckle), CLAW_CURL, 0.5, 2.4);
    });
    placeSpike(this.thumb, wrist, this.a.set(0.3 * this.side, 0.45, -1), CLAW_CURL, 0.6, 2.8);
  }

  private pose(point: Vector3, flap: number, sweep: number): Vector3 {
    if (this.fold > 0) {
      const restX = point.x;
      rotateAboutY(point, ELBOW, -this.fold * ELBOW_FOLD * smoothstep(10, 22, restX));
      rotateAboutY(point, this.foldedWrist, -this.fold * WRIST_FOLD * smoothstep(23, 46, restX));
    }
    const reach = smoothstep(6, SPAN, point.x);
    const lift = flap * (0.55 + 0.45 * reach);
    const dx = point.x - SHOULDER.x;
    const dy = point.y - SHOULDER.y;
    point.x = SHOULDER.x + dx * Math.cos(lift) - dy * Math.sin(lift);
    point.y = SHOULDER.y + dx * Math.sin(lift) + dy * Math.cos(lift);

    rotateAboutY(point, SHOULDER, sweep * reach);
    point.x *= this.side;
    return point;
  }

  private placeBetween(mesh: Mesh, start: Vector3, end: Vector3, radius: number): void {
    const direction = end.clone().sub(start);
    const length = direction.length();
    mesh.position.copy(start).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
    mesh.scale.set(radius, length, radius);
  }
}
