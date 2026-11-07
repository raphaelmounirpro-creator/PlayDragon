import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { addBacklight } from '../../fx/backlight';
import { createSpikeGeometry, placeSpike } from '../spike';

/** How a gargoyle looks: dark imp, mossy stone shooter or the giant guardian. */
export interface GargoyleLook {
  skin: string;
  membrane: string;
  eyes: Color;
  size: number;
  /** Molten glow in the skin (the guardian's cracks). */
  ember: number;
}

export interface GargoyleModel {
  root: Group;
  wings: [Group, Group];
  /** Where it spits stones from (model space). */
  mouth: Vector3;
}

const SUNSET_RIM = new Color(1.0, 0.45, 0.15);

/** Bat wing: arm to a clawed tip, three fingers and a scalloped trailing edge. */
function wingGeometry(side: number): BufferGeometry {
  const p = [
    [0, 0, 0],
    [5, 2.2, -0.8],
    [10.5, 1.6, 0.6],
    [8, -0.4, 3.2],
    [6, 0.7, 2.4],
    [4, -0.6, 4.2],
    [2.2, 0.2, 2.8],
    [0.5, -0.4, 2.2],
  ].map(([x, y, z]) => [x * side, y, z]);
  const triangles = [[1, 2, 3], [1, 3, 4], [1, 4, 5], [1, 5, 6], [0, 1, 6], [0, 6, 7]];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(triangles.flat().flatMap((i) => p[i]), 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface Kit {
  body: SphereGeometry;
  head: SphereGeometry;
  snout: ConeGeometry;
  tail: ConeGeometry;
  leg: ConeGeometry;
  arm: CylinderGeometry;
  horn: BufferGeometry;
  eye: SphereGeometry;
  wings: [BufferGeometry, BufferGeometry];
}

let kit: Kit | null = null;

/** Geometries are shared by every gargoyle. */
function sharedKit(): Kit {
  kit ??= {
    body: new SphereGeometry(1, 16, 12),
    head: new SphereGeometry(1, 14, 10),
    snout: new ConeGeometry(0.55, 1.6, 8),
    tail: new ConeGeometry(0.55, 5, 8),
    leg: new ConeGeometry(0.35, 2.2, 6),
    arm: new CylinderGeometry(0.16, 0.24, 1, 6),
    horn: createSpikeGeometry(1.2, 0.8),
    eye: new SphereGeometry(0.22, 8, 6),
    wings: [wingGeometry(1), wingGeometry(-1)],
  };
  return kit;
}

const materials = new Map<string, { skin: Material; membrane: Material; eyes: Material }>();

function lookMaterials(look: GargoyleLook): { skin: Material; membrane: Material; eyes: Material } {
  const key = `${look.skin}|${look.membrane}|${look.eyes.getHexString()}|${look.ember}`;
  let set = materials.get(key);
  if (!set) {
    const skin = new MeshStandardMaterial({ color: look.skin, roughness: 0.8, metalness: 0.1, emissive: '#ff5a1a', emissiveIntensity: look.ember });
    addBacklight(skin, { rimColor: SUNSET_RIM, rimPower: 4 });
    const membrane = new MeshStandardMaterial({ color: look.membrane, roughness: 0.8, side: DoubleSide, emissive: '#ff4a1a', emissiveIntensity: 0.2 });
    addBacklight(membrane, { rimColor: SUNSET_RIM, rimPower: 5, transmission: new Color(1.2, 0.5, 0.15) });
    set = { skin, membrane, eyes: new MeshBasicMaterial({ color: look.eyes }) };
    materials.set(key, set);
  }
  return set;
}

function part(geometry: BufferGeometry, material: Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/** A hunched winged gargoyle facing -Z: horned head, glowing eyes, clawed legs and a tail. */
export function createGargoyleModel(look: GargoyleLook): GargoyleModel {
  const k = sharedKit();
  const m = lookMaterials(look);
  const root = new Group();
  const body = new Group();
  body.scale.setScalar(look.size);
  root.add(body);

  const snout = part(k.snout, m.skin, 0, 0.9, -3.9);
  snout.rotation.x = -Math.PI / 2;
  const tail = part(k.tail, m.skin, 0, -0.2, 3.6);
  tail.rotation.x = Math.PI / 2 + 0.25;
  body.add(part(k.body, m.skin, 0, 0, 0, 1.5, 1.3, 2.3), part(k.head, m.skin, 0, 1.2, -2.6, 1.0, 0.9, 1.3), snout, tail);
  for (const side of [-1, 1]) {
    const leg = part(k.leg, m.skin, 0.8 * side, -1.6, 0.8);
    leg.rotation.x = Math.PI + 0.3;
    const horn = new Mesh(k.horn, m.skin);
    placeSpike(horn, new Vector3(0.55 * side, 1.9, -2.4), new Vector3(0.35 * side, 0.7, 1), new Vector3(0, -1, 0.4), 0.4, 1.8);
    body.add(leg, horn, part(k.eye, m.eyes, 0.45 * side, 1.45, -3.45));
  }

  const wings: [Group, Group] = [new Group(), new Group()];
  wings.forEach((wing, i) => {
    const side = i === 0 ? 1 : -1;
    wing.position.set(1.2 * side, 0.8, -0.4);
    const arm = part(k.arm, m.skin, 2.5 * side, 1.1, -0.4);
    arm.scale.set(1, 5.6, 1);
    arm.rotation.set(0, 0, (-Math.PI / 2 + 0.42) * side);
    wing.add(new Mesh(k.wings[i], m.membrane), arm);
    body.add(wing);
  });
  return { root, wings, mouth: new Vector3(0, 0.9 * look.size, -4.6 * look.size) };
}

/** Raises (positive) or lowers both wings. */
export function flapGargoyle(model: GargoyleModel, angle: number): void {
  model.wings[0].rotation.z = angle;
  model.wings[1].rotation.z = -angle;
}
