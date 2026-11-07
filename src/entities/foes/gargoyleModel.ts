import { BufferGeometry, CatmullRomCurve3, Color, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { addBacklight } from '../../fx/backlight';
import { createLoft, profile, round, Section, shapeLoft } from '../loft';
import { createSpikeGeometry, placeSpike } from '../spike';
import { createMembraneMaterial, Wing, WingShape } from '../wing';

/** How a gargoyle looks: dark imp, mossy stone spitter, giant stone guardian or bat queen. */
export interface GargoyleLook {
  skin: string;
  membrane: string;
  eyes: Color;
  size: number;
  /** Molten glow in the skin (the guardian's cracks). */
  ember: number;
  /** Large pointed ears instead of horns (the bat queen). */
  ears?: boolean;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/** Bat-like wing with three fingers, scaled to a gargoyle (model units, before `size`). */
const GARGOYLE_WING: WingShape = {
  shoulder: v(0.8, 1.0, -0.6),
  elbow: v(3.2, 2.0, 0),
  wrist: v(5.6, 2.6, -0.9),
  tips: [v(11.5, 2.2, 0.4), v(9.2, 0.6, 2.8), v(6.4, 0.1, 4)],
  trailingRoot: v(0.8, 0.2, 2.6),
  armRadii: [0.3, 0.24],
  fingerRadii: [0.16, 0.13, 0.11],
  scallopDepth: 0.42,
  claw: 0.9,
};

const SUNSET_RIM = new Color(1.0, 0.45, 0.15);
const DOWN = v(0, -1, 0);
const BACK = v(0, 0, 1);

interface LookMaterials {
  skin: MeshStandardMaterial;
  membrane: Material;
  claw: Material;
  eyes: Material;
}

const materialCache = new Map<string, LookMaterials>();
const bodyCache = new Map<string, Array<[BufferGeometry, keyof LookMaterials]>>();

function lookKey(look: GargoyleLook): string {
  return `${look.skin}|${look.membrane}|${look.eyes.getHexString()}|${look.ember}|${look.ears ?? false}`;
}

function materialsFor(look: GargoyleLook): LookMaterials {
  const key = lookKey(look);
  let set = materialCache.get(key);
  if (!set) {
    const skin = new MeshStandardMaterial({ color: look.skin, roughness: 0.8, metalness: 0.1, emissive: '#ff5a1a', emissiveIntensity: look.ember });
    addBacklight(skin, { rimColor: SUNSET_RIM, rimPower: 4 });
    const claw = new MeshStandardMaterial({ color: '#1a1412', roughness: 0.4, metalness: 0.2 });
    addBacklight(claw, { rimColor: SUNSET_RIM, rimPower: 4 });
    set = { skin, membrane: createMembraneMaterial(GARGOYLE_WING, look.membrane), claw, eyes: new MeshBasicMaterial({ color: look.eyes }) };
    materialCache.set(key, set);
  }
  return set;
}

function loft(points: Vector3[], sectionAt: (t: number) => Section, segments = 20, radial = 12): BufferGeometry {
  const geometry = createLoft(segments, radial);
  shapeLoft(geometry, new CatmullRomCurve3(points), sectionAt);
  return geometry;
}

/** A spike geometry already placed in model space (horns, ears, claws, dorsal spines). */
function spike(position: Vector3, direction: Vector3, curl: Vector3, width: number, length: number, flatten = 0.8): BufferGeometry {
  const holder = new Mesh(createSpikeGeometry(1.0, flatten));
  placeSpike(holder, position, direction, curl, width, length);
  return holder.geometry.clone().applyMatrix4(holder.matrix);
}

/** Static parts of the body (shared by every gargoyle with the same look). */
function bodyParts(look: GargoyleLook): Array<[BufferGeometry, keyof LookMaterials]> {
  const key = lookKey(look);
  const cached = bodyCache.get(key);
  if (cached) return cached;
  const torsoWidth = profile([[0, 0.5], [0.12, 0.75], [0.28, 1.15], [0.42, 1.0], [0.55, 0.6], [0.75, 0.3], [1, 0.05]]);
  const torsoHeight = profile([[0, 0.55], [0.12, 0.85], [0.28, 1.3], [0.42, 1.05], [0.55, 0.6], [0.75, 0.3], [1, 0.05]]);
  const skullWidth = profile([[0, 0.7], [0.4, 0.75], [1, 0.22]]);
  const skullHeight = profile([[0, 0.65], [0.4, 0.6], [1, 0.2]]);
  const parts: Array<[BufferGeometry, keyof LookMaterials]> = [
    [loft([v(0, 1.4, -2.6), v(0, 0.9, -1.4), v(0, 0.5, 0.2), v(0, 0.3, 1.8), v(0, -0.1, 3.4), v(0, 0.2, 5), v(0, 0.6, 6.4)], (t) => ({ width: torsoWidth(t), height: torsoHeight(t), ridge: 0.12 }), 40, 16), 'skin'],
    [loft([v(0, 1.5, -2.1), v(0, 1.62, -3.2), v(0, 1.3, -4.5)], (t) => ({ width: skullWidth(t), height: skullHeight(t), bottom: 0.6, ridge: 0.15 })), 'skin'],
    [loft([v(0, 1.1, -2.4), v(0, 0.95, -3.4), v(0, 1.05, -4.3)], (t) => ({ width: 0.5 - t * 0.32, height: 0.28 - t * 0.12, top: 0.4 })), 'skin'],
  ];
  for (const side of [-1, 1]) {
    if (look.ears) parts.push([spike(v(0.45 * side, 1.9, -2.5), v(0.7 * side, 1, 0.3), BACK, 0.7, 2, 0.3), 'skin']);
    else parts.push([spike(v(0.4 * side, 1.95, -2.6), v(0.3 * side, 0.8, 1), v(0, -1, 0.4), 0.35, 1.6), 'claw']);
    const eye = new SphereGeometry(0.13, 10, 8).translate(0.34 * side, 1.72, -3.55);
    parts.push([eye, 'eyes']);
    const hip = v(0.55 * side, -0.2, 1.4);
    const knee = v(0.75 * side, -1.4, 0.9);
    const foot = v(0.6 * side, -2.3, 1.5);
    parts.push([loft([hip, knee, foot], (t) => round(0.38 - t * 0.22), 10, 8), 'skin']);
    for (const spread of [-0.35, 0, 0.35]) {
      parts.push([spike(foot, v(spread * side, -0.6, -1), DOWN, 0.16, 0.7, 0.75), 'claw']);
    }
  }
  for (let i = 0; i < 5; i++) {
    const z = -1.6 + i * 1.3;
    parts.push([spike(v(0, 1.2 - i * 0.18, z), v(0, 1, 0.9), BACK, 0.22 - i * 0.02, 0.8 - i * 0.08, 0.45), 'claw']);
  }
  bodyCache.set(key, parts);
  return parts;
}

/** A hunched winged gargoyle facing -Z: sculpted body, horned head, glowing eyes, articulated wings. */
export class GargoyleModel {
  readonly root = new Group();
  /** Where it spits from (model space, already scaled). */
  readonly mouth: Vector3;
  private readonly wings: [Wing, Wing];

  constructor(look: GargoyleLook) {
    const materials = materialsFor(look);
    const body = new Group();
    for (const [geometry, material] of bodyParts(look)) body.add(new Mesh(geometry, materials[material]));
    const wingMaterials = { membrane: materials.membrane, skin: materials.skin, claw: materials.claw };
    this.wings = [new Wing(1, wingMaterials, GARGOYLE_WING), new Wing(-1, wingMaterials, GARGOYLE_WING)];
    body.add(this.wings[0].group, this.wings[1].group);
    body.scale.setScalar(look.size);
    this.root.add(body);
    this.mouth = v(0, 1.05, -4.6).multiplyScalar(look.size);
  }

  /** flap > 0 raises the wings; fold tucks them back (diving). */
  pose(flap: number, fold = 0): void {
    const sweep = -flap * 0.12;
    this.wings[0].update(flap, sweep, fold);
    this.wings[1].update(flap, sweep, fold);
  }
}
