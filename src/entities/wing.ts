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
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../core/noise';
import { addBacklight } from '../fx/backlight';
import { createMembraneTexture, WingBone2D } from '../fx/textures';
import { createSpikeGeometry, placeSpike } from './spike';

/** Rest pose of a right wing (creature facing -Z): arm, finger tips and where the skin meets the body. */
export interface WingShape {
  shoulder: Vector3;
  elbow: Vector3;
  wrist: Vector3;
  /** Finger tips, outermost first. */
  tips: Vector3[];
  trailingRoot: Vector3;
  armRadii: [number, number];
  fingerRadii: number[];
  /** How deep the trailing edge is scalloped between fingers (0 to 1). */
  scallopDepth: number;
  claw: number;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Huge pointed wings, like the reference painting. */
export const DRAGON_WING: WingShape = {
  shoulder: v(2.2, 3.9, -4),
  elbow: v(12, 7, -2),
  wrist: v(22, 9, -6),
  tips: [v(56, 8.5, -3), v(47, 3.5, 10), v(36, 1, 19), v(22, 1, 22)],
  trailingRoot: v(3, 2.4, 10),
  armRadii: [1.05, 0.8],
  fingerRadii: [0.5, 0.42, 0.36, 0.32],
  scallopDepth: 0.38,
  claw: 2.4,
};

const SUBDIVISIONS = 6;
const Y_AXIS = new Vector3(0, 1, 0);
const CLAW_CURL = new Vector3(0, -0.6, 1);
const ELBOW_FOLD = 0.9;
const WRIST_FOLD = 1.1;

type Bone = [Vector3, Vector3, number];

/** Everything derived once from a shape: bones, joints, subdivided membrane, texture mapping. */
interface Rig {
  knuckles: Vector3[];
  bones: Bone[];
  joints: Array<[Vector3, number]>;
  span: number;
  zMin: number;
  zRange: number;
  rest: Float32Array;
  geometry: BufferGeometry;
}

const rigs = new Map<WingShape, Rig>();

function scallop(shape: WingShape, a: Vector3, b: Vector3): Vector3 {
  return a.clone().lerp(b, 0.5).lerp(shape.wrist, shape.scallopDepth);
}

function membraneTriangles(shape: WingShape): Array<[Vector3, Vector3, Vector3, number]> {
  const edge: Vector3[] = [];
  const corners = [...shape.tips, shape.trailingRoot];
  corners.forEach((corner, i) => {
    edge.push(corner);
    if (i < corners.length - 1) edge.push(scallop(shape, corner, corners[i + 1]));
  });
  const triangles: Array<[Vector3, Vector3, Vector3, number]> = [];
  for (let i = 0; i < edge.length - 1; i++) triangles.push([shape.wrist, edge[i], edge[i + 1], 1.2]);
  triangles.push([shape.shoulder, shape.elbow, shape.wrist, 0.4], [shape.shoulder, shape.wrist, shape.trailingRoot, 2.2]);
  return triangles;
}

/** Subdivides each triangle so the wing can bend smoothly, with a billowing sag. */
function subdivide(triangles: Array<[Vector3, Vector3, Vector3, number]>, scale: number): Float32Array {
  const values: number[] = [];
  const n = SUBDIVISIONS;
  const point = (a: Vector3, b: Vector3, c: Vector3, i: number, j: number, sag: number): number[] => {
    const u = i / n;
    const w = j / n;
    const r = 1 - u - w;
    const billow = -sag * scale * 27 * u * w * r;
    return [a.x * r + b.x * u + c.x * w, a.y * r + b.y * u + c.y * w + billow, a.z * r + b.z * u + c.z * w];
  };
  for (const [a, b, c, sag] of triangles) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        values.push(...point(a, b, c, i, j, sag), ...point(a, b, c, i + 1, j, sag), ...point(a, b, c, i, j + 1, sag));
        if (i + j < n - 1) values.push(...point(a, b, c, i + 1, j, sag), ...point(a, b, c, i + 1, j + 1, sag), ...point(a, b, c, i, j + 1, sag));
      }
    }
  }
  return new Float32Array(values);
}

function rigFor(shape: WingShape): Rig {
  let rig = rigs.get(shape);
  if (rig) return rig;
  const knuckles = shape.tips.map((tip) => shape.wrist.clone().lerp(tip, 0.48));
  const bones: Bone[] = [
    [shape.shoulder, shape.elbow, shape.armRadii[0]],
    [shape.elbow, shape.wrist, shape.armRadii[1]],
    ...shape.tips.flatMap((tip, i): Bone[] => [
      [shape.wrist, knuckles[i], shape.fingerRadii[i]],
      [knuckles[i], tip, shape.fingerRadii[i] * 0.72],
    ]),
  ];
  const joints: Array<[Vector3, number]> = [
    [shape.elbow, shape.armRadii[1]],
    [shape.wrist, shape.armRadii[1] * 0.72],
    ...knuckles.map((knuckle, i): [Vector3, number] => [knuckle, shape.fingerRadii[i] * 0.74]),
  ];
  const points = [shape.shoulder, shape.elbow, shape.wrist, shape.trailingRoot, ...shape.tips];
  const span = Math.max(...points.map((p) => p.x));
  const zMin = Math.min(...points.map((p) => p.z)) - 1;
  const zRange = Math.max(...points.map((p) => p.z)) + 1 - zMin;

  const rest = subdivide(membraneTriangles(shape), span / 56);
  const uvs = new Float32Array((rest.length / 3) * 2);
  for (let i = 0; i < rest.length / 3; i++) uvs.set([rest[i * 3] / span, (rest[i * 3 + 2] - zMin) / zRange], i * 2);
  const raw = new BufferGeometry();
  raw.setAttribute('position', new BufferAttribute(rest, 3));
  raw.setAttribute('uv', new BufferAttribute(uvs, 2));
  const geometry = mergeVertices(raw, 1e-3);
  rig = { knuckles, bones, joints, span, zMin, zRange, rest: Float32Array.from(geometry.attributes.position.array), geometry };
  rigs.set(shape, rig);
  return rig;
}

let sharedParts: { bone: BufferGeometry; joint: BufferGeometry; claw: BufferGeometry } | null = null;

/** Bone, joint and claw geometries are the same for every wing (they are scaled per bone). */
function wingParts(): { bone: BufferGeometry; joint: BufferGeometry; claw: BufferGeometry } {
  sharedParts ??= { bone: new CylinderGeometry(0.7, 1, 1, 10), joint: new SphereGeometry(1, 14, 10), claw: createSpikeGeometry(1.2, 0.8) };
  return sharedParts;
}

const membranes = new Map<string, MeshStandardMaterial>();

/** Leather painted from the shape's bones: dark along them, glowing between them against the sun. */
export function createMembraneMaterial(shape: WingShape = DRAGON_WING, tint = '#ffffff'): MeshStandardMaterial {
  const rig = rigFor(shape);
  const key = `${shape.tips.length}:${rig.span}:${tint}`;
  const cached = membranes.get(key);
  if (cached) return cached;
  const bones2D: WingBone2D[] = [
    ...rig.bones.map(([start, end]): WingBone2D => [start.x, start.z, end.x, end.z]),
    [shape.shoulder.x, shape.shoulder.z, shape.trailingRoot.x, shape.trailingRoot.z],
  ];
  const texture = createMembraneTexture(bones2D, (u, w) => [u * rig.span, rig.zMin + w * rig.zRange], rig.span / 56);
  texture.userData.shared = true;
  const material = new MeshStandardMaterial({
    map: texture,
    color: tint,
    emissive: '#ff5c1f',
    emissiveMap: texture,
    emissiveIntensity: 0.3,
    roughness: 0.75,
    metalness: 0.05,
    side: DoubleSide,
  });
  addBacklight(material, { rimColor: new Color(0.5, 0.2, 0.06), rimPower: 6, transmission: new Color(1.4, 1.0, 0.4) });
  membranes.set(key, material);
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
  private readonly rig: Rig;
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly foldedWrist = new Vector3();
  private fold = 0;

  constructor(
    private readonly side: 1 | -1,
    materials: WingMaterials,
    private readonly shape: WingShape = DRAGON_WING,
  ) {
    this.rig = rigFor(shape);
    this.membrane = new Mesh(this.rig.geometry.clone(), materials.membrane);
    this.membrane.frustumCulled = false;
    this.group.add(this.membrane);

    const parts = wingParts();
    for (let i = 0; i < this.rig.bones.length; i++) this.bones.push(this.add(new Mesh(parts.bone, materials.skin)));
    for (let i = 0; i < this.rig.joints.length; i++) this.joints.push(this.add(new Mesh(parts.joint, materials.skin)));
    for (let i = 0; i < shape.tips.length; i++) this.claws.push(this.add(new Mesh(parts.claw, materials.claw)));
    this.thumb = this.add(new Mesh(parts.claw, materials.claw));
    this.update(0, 0);
  }

  /**
   * flap > 0 raises the wing; sweep > 0 swings the tips forward;
   * fold in [0, 1] bends the wing back at the elbow and the wrist, like a bat tucking in.
   */
  update(flap: number, sweep: number, fold = 0): void {
    this.fold = fold;
    this.foldedWrist.copy(this.shape.wrist);
    rotateAboutY(this.foldedWrist, this.shape.elbow, -fold * ELBOW_FOLD);

    const positions = this.membrane.geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      this.a.fromArray(this.rig.rest, i * 3);
      this.pose(this.a, flap, sweep);
      positions.setXYZ(i, this.a.x, this.a.y, this.a.z);
    }
    positions.needsUpdate = true;
    this.membrane.geometry.computeVertexNormals();

    this.rig.bones.forEach(([start, end, radius], i) => {
      this.pose(this.a.copy(start), flap, sweep);
      this.pose(this.b.copy(end), flap, sweep);
      this.placeBetween(this.bones[i], this.a, this.b, radius);
    });
    this.rig.joints.forEach(([position, radius], i) => {
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
    const size = this.shape.claw;
    const wrist = this.pose(this.shape.wrist.clone(), flap, sweep);
    this.shape.tips.forEach((tip, i) => {
      const knuckle = this.pose(this.a.copy(this.rig.knuckles[i]), flap, sweep).clone();
      const end = this.pose(this.b.copy(tip), flap, sweep);
      placeSpike(this.claws[i], end, end.clone().sub(knuckle), CLAW_CURL, size * 0.21, size);
    });
    placeSpike(this.thumb, wrist, this.a.set(0.3 * this.side, 0.45, -1), CLAW_CURL, size * 0.25, size * 1.15);
  }

  private pose(point: Vector3, flap: number, sweep: number): Vector3 {
    const { elbow, wrist, shoulder } = this.shape;
    if (this.fold > 0) {
      const restX = point.x;
      rotateAboutY(point, elbow, -this.fold * ELBOW_FOLD * smoothstep(elbow.x - 2, wrist.x, restX));
      rotateAboutY(point, this.foldedWrist, -this.fold * WRIST_FOLD * smoothstep(wrist.x + 1, this.rig.span * 0.82, restX));
    }
    const reach = smoothstep(shoulder.x + 4, this.rig.span, point.x);
    const lift = flap * (0.55 + 0.45 * reach);
    const dx = point.x - shoulder.x;
    const dy = point.y - shoulder.y;
    point.x = shoulder.x + dx * Math.cos(lift) - dy * Math.sin(lift);
    point.y = shoulder.y + dx * Math.sin(lift) + dy * Math.cos(lift);
    rotateAboutY(point, shoulder, sweep * reach);
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

/** Rotates `point` around the vertical axis through `pivot`; negative angles swing it backward (+Z). */
function rotateAboutY(point: Vector3, pivot: Vector3, angle: number): void {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  point.x = pivot.x + dx * Math.cos(angle) + dz * Math.sin(angle);
  point.z = pivot.z - dx * Math.sin(angle) + dz * Math.cos(angle);
}
