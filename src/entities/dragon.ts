import {
  CatmullRomCurve3,
  Color,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from 'three';
import { smoothstep } from '../core/noise';
import { addBacklight } from '../fx/backlight';
import { createHideTexture } from '../fx/textures';
import { createHead, MOUTH } from './dragonHead';
import { createForeLeg, createHindLeg } from './dragonLimbs';
import { createLoft, profile, Section, shapeLoft } from './loft';
import { createSpikeGeometry, spikeMatrix } from './spike';
import { createMembraneMaterial, Wing } from './wing';

/** Size and skin tint: the player's dragon, or a smaller rival wyvern. */
export interface DragonLook {
  scale: number;
  skin: string;
}

const PLAYER_LOOK: DragonLook = { scale: 0.6, skin: '#716564' };
const SPIKE_COUNT = 38;
const HEAD_SCALE = 1.25;
const ARMOR_ROWS = 24;
const ARMOR_COLUMNS = 7;
const WORLD_UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);

// Long S-shaped neck carrying the head high, as in the reference painting. Index 0 is the head end.
const SPINE_REST = [
  [0, 14, -23], [0, 11.8, -19.5], [0, 8, -15.5], [0, 4.5, -10], [0, 1.6, -4.5], [0, 0.8, 1.5],
  [0, 0.8, 8], [1, 1.2, 16], [3, 2, 24], [6, 2.6, 32], [10, 2, 40], [13, 0, 48], [14, -4, 57],
].map(([x, y, z]) => new Vector3(x, y, z));
const FIRST_TAIL_POINT = 7;

// Slender neck, deep chest under the wing roots, narrower waist, strong hips, whip-like tail.
const bodyWidth = profile([[0, 1.2], [0.12, 1.55], [0.22, 2.5], [0.3, 3.9], [0.36, 3.7], [0.41, 3.1], [0.47, 3.2], [0.56, 2.0], [0.74, 1.0], [0.92, 0.4], [1, 0.1]]);
const bodyHeight = profile([[0, 1.35], [0.12, 1.75], [0.22, 3.0], [0.3, 4.4], [0.36, 4.1], [0.41, 3.3], [0.47, 3.1], [0.56, 2.1], [0.74, 1.05], [0.92, 0.42], [1, 0.1]]);
const bodyRidge = profile([[0, 0.06], [0.3, 0.1], [0.6, 0.12], [1, 0.16]]);
const bodyKeel = profile([[0, 0], [0.22, 0.04], [0.3, 0.16], [0.37, 0.06], [0.46, 0], [1, 0]]);
const spikeSize = profile([[0, 1.6], [0.15, 2.2], [0.32, 2.4], [0.5, 1.7], [0.8, 0.95], [0.95, 0.6], [1, 0.25]]);

function bodySection(t: number): Section {
  return { width: bodyWidth(t), height: bodyHeight(t), ridge: bodyRidge(t), keel: bodyKeel(t) };
}

/** Golden edge light of the low sun on the dragon's silhouette. */
const SUNSET_RIM = new Color(1.1, 0.5, 0.16);

let sharedHide: Texture | null = null;

/** The scale painting is the same for every dragon (player or wyvern), so it is made once. */
function hideTexture(): Texture {
  if (!sharedHide) {
    sharedHide = createHideTexture();
    sharedHide.repeat.set(1, 7);
    sharedHide.userData.shared = true;
  }
  return sharedHide;
}

function hideMaterial(tint: string): MeshStandardMaterial {
  const hide = hideTexture();
  const material = new MeshStandardMaterial({ map: hide, color: tint, bumpMap: hide, bumpScale: 0.5, roughness: 0.62, metalness: 0.12 });
  addBacklight(material, { rimColor: SUNSET_RIM, rimPower: 5 });
  return material;
}

function hornMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ color: '#241a15', roughness: 0.35, metalness: 0.25 });
  addBacklight(material, { rimColor: SUNSET_RIM, rimPower: 4 });
  return material;
}

/** Muscle masses that blend into the body where the wings and the hind legs attach. */
function createMuscles(skin: MeshStandardMaterial): Mesh[] {
  const geometry = new SphereGeometry(1, 20, 14);
  const masses: Array<[number, number, number, number, number, number]> = [
    [2.6, 2.6, -4.5, 1.3, 1.2, 2.6],
    [2.5, 0, 7.4, 1.25, 1.7, 2.8],
  ];
  return masses.flatMap(([x, y, z, sx, sy, sz]) =>
    [-1, 1].map((side) => {
      const mass = new Mesh(geometry, skin);
      mass.position.set(x * side, y, z);
      mass.scale.set(sx, sy, sz);
      return mass;
    }),
  );
}

/** How the dragon is moving, used to articulate its body. All values are roughly in [-1, 1]. */
export interface DragonMotion {
  /** Lateral speed: > 0 when moving to its right. */
  turn: number;
  /** Vertical speed: > 0 when climbing, < 0 when diving. */
  climb: number;
  /** Extra effort (boost), 0 to 1. */
  effort: number;
}

const STILL: DragonMotion = { turn: 0, climb: 0, effort: 0 };
const JAW_OPEN_TIME = 0.28;

/** The dragon: sculpted body, horned head, jointed limbs, spiked spine and membrane wings. */
export class Dragon {
  readonly root = new Group();
  private readonly model = new Group();
  private readonly body: Mesh;
  private readonly spikes: InstancedMesh;
  private readonly armor: InstancedMesh;
  private readonly head: Group;
  private readonly jaw: Group;
  private readonly hindLegs: Group[];
  private readonly tailBlade: Mesh;
  private readonly tailSpikes: Mesh[];
  private readonly wings: Wing[];
  private readonly spine = SPINE_REST.map((p) => p.clone());
  private readonly curve = new CatmullRomCurve3(this.spine);
  private flapPhase = 0;
  private neckTurn = 0;
  private neckClimb = 0;
  private tailTurn = 0;
  private tailClimb = 0;
  private fold = 0;
  private glide = 0;
  private jawTimer = 0;
  private wingbeat = 0;

  constructor(look: DragonLook = PLAYER_LOOK) {
    const skin = hideMaterial(look.skin);
    const horn = hornMaterial();
    this.body = new Mesh(createLoft(160, 28), skin);
    this.body.frustumCulled = false;
    this.spikes = new InstancedMesh(createSpikeGeometry(0.6, 0.45), horn, SPIKE_COUNT);
    this.spikes.frustumCulled = false;
    this.armor = new InstancedMesh(new SphereGeometry(1, 6, 4), skin, ARMOR_ROWS * ARMOR_COLUMNS);
    this.armor.frustumCulled = false;
    const { head, jaw } = createHead({ skin, horn });
    this.head = head;
    this.jaw = jaw;
    this.head.scale.setScalar(HEAD_SCALE);
    const limbMaterials = { skin, claw: horn };
    this.hindLegs = [createHindLeg(1, limbMaterials), createHindLeg(-1, limbMaterials)];
    const foreLegs = [createForeLeg(1, limbMaterials), createForeLeg(-1, limbMaterials)];
    const bladeGeometry = createSpikeGeometry(0, 0.22);
    this.tailBlade = new Mesh(bladeGeometry, horn);
    this.tailSpikes = [new Mesh(bladeGeometry, horn), new Mesh(bladeGeometry, horn)];
    const wingMaterials = { membrane: createMembraneMaterial(), skin, claw: horn };
    this.wings = [new Wing(1, wingMaterials), new Wing(-1, wingMaterials)];

    this.model.add(
      this.body,
      this.spikes,
      this.armor,
      this.head,
      this.tailBlade,
      ...this.tailSpikes,
      ...createMuscles(skin),
      ...this.hindLegs,
      ...foreLegs,
      ...this.wings.map((w) => w.group),
    );
    this.model.scale.setScalar(look.scale);
    this.root.add(this.model);
    this.update(0, 0, STILL);
  }

  update(dt: number, time: number, motion: DragonMotion): void {
    // The neck reacts first, the tail follows with a delay: the body flows through turns.
    this.neckTurn = MathUtils.damp(this.neckTurn, motion.turn, 6, dt);
    this.neckClimb = MathUtils.damp(this.neckClimb, motion.climb, 6, dt);
    this.tailTurn = MathUtils.damp(this.tailTurn, motion.turn, 1.8, dt);
    this.tailClimb = MathUtils.damp(this.tailClimb, motion.climb, 1.8, dt);

    this.animateWings(dt, time, motion);
    this.bendSpine(time);
    shapeLoft(this.body.geometry, this.curve, bodySection);
    this.placeSpikes();
    this.placeArmor();
    this.placeHead();
    this.placeTail();
    this.swingLegs();

    this.jawTimer = Math.max(0, this.jawTimer - dt);
    this.jaw.rotation.x = MathUtils.damp(this.jaw.rotation.x, this.jawTimer > 0 ? -0.5 : 0, 14, dt);
  }

  /** Opens the jaw briefly, as the dragon breathes fire. */
  openJaw(): void {
    this.jawTimer = JAW_OPEN_TIME;
  }

  mouthPosition(target: Vector3): Vector3 {
    return this.head.localToWorld(target.copy(MOUTH));
  }

  /** Strength (0 to 1) of a wing downstroke that started since the last call, or 0. */
  consumeWingbeat(): number {
    const strength = this.wingbeat;
    this.wingbeat = 0;
    return strength;
  }

  /**
   * Flapping alternates with glides while cruising; climbing or boosting means strong fast beats,
   * diving folds the wings back.
   */
  private animateWings(dt: number, time: number, motion: DragonMotion): void {
    const climbing = Math.max(0, motion.climb);
    const diving = Math.max(0, -motion.climb);
    const glideWave = smoothstep(0.55, 0.85, Math.sin(time * 0.45) * 0.5 + 0.5);
    this.glide = MathUtils.damp(this.glide, glideWave * (1 - motion.effort) * (1 - climbing), 2, dt);
    this.fold = MathUtils.damp(this.fold, Math.min(0.85, diving * 1.3), 4, dt);

    const beat = (1 - this.glide * 0.85) * (1 - this.fold * 0.8);
    const previousBeat = Math.floor((this.flapPhase - Math.PI / 2) / (Math.PI * 2));
    this.flapPhase += dt * (3.2 + motion.effort * 2.6 + climbing * 2.2) * (1 - this.glide * 0.6);
    if (Math.floor((this.flapPhase - Math.PI / 2) / (Math.PI * 2)) !== previousBeat) this.wingbeat = beat;
    const flap = Math.sin(this.flapPhase) * 0.72 * beat + 0.16 + this.glide * 0.24 - this.fold * 0.2;
    const sweep = Math.cos(this.flapPhase) * 0.16 * beat;
    // The wing on the inside of the turn dips a little more.
    this.wings[0].update(flap - this.neckTurn * 0.12, sweep, this.fold);
    this.wings[1].update(flap + this.neckTurn * 0.12, sweep, this.fold);
    this.model.position.y = -Math.sin(this.flapPhase) * 0.9 * beat;
  }

  private bendSpine(time: number): void {
    for (let i = 0; i < FIRST_TAIL_POINT - 2; i++) {
      const weight = (FIRST_TAIL_POINT - 2 - i) / (FIRST_TAIL_POINT - 2);
      this.spine[i].x = this.neckTurn * 5 * weight * weight;
      this.spine[i].y = SPINE_REST[i].y + this.neckClimb * 2.2 * weight + Math.sin(time * 1.1) * 0.35 * weight;
    }
    const tailPoints = this.spine.length - FIRST_TAIL_POINT;
    for (let i = FIRST_TAIL_POINT; i < this.spine.length; i++) {
      const weight = (i - FIRST_TAIL_POINT + 1) / tailPoints;
      const sway = Math.sin(time * 1.7 - i * 0.6) * 3.2 * weight * (1 - Math.min(1, Math.abs(this.tailTurn)) * 0.6);
      this.spine[i].x = SPINE_REST[i].x + sway - this.tailTurn * 10 * Math.pow(weight, 1.4);
      this.spine[i].y = SPINE_REST[i].y + Math.sin(this.flapPhase - i * 0.5) * 0.9 * weight - this.tailClimb * 5 * weight;
    }
  }

  /** Spine frame at `t`: position on the curve, tangent toward the tail, side and up. */
  private frame(t: number): { point: Vector3; tangent: Vector3; side: Vector3; up: Vector3 } {
    const point = this.curve.getPoint(t);
    const tangent = this.curve.getTangent(t).normalize();
    const side = new Vector3().crossVectors(tangent, WORLD_UP).normalize();
    const up = new Vector3().crossVectors(side, tangent).normalize();
    return { point, tangent, side, up };
  }

  /** Curved blades along the dorsal crest, sweeping back toward the tail. */
  private placeSpikes(): void {
    const matrix = new Matrix4();
    for (let i = 0; i < SPIKE_COUNT; i++) {
      const t = 0.02 + (i / (SPIKE_COUNT - 1)) * 0.95;
      const { point, tangent, up } = this.frame(t);
      const crest = bodyHeight(t) * (1 + bodyRidge(t)) * 0.92;
      const size = spikeSize(t);
      const direction = up.clone().addScaledVector(tangent, 0.8);
      this.spikes.setMatrixAt(i, spikeMatrix(matrix, point.addScaledVector(up, crest), direction, tangent, size * 0.9, size * 1.6));
    }
    this.spikes.instanceMatrix.needsUpdate = true;
  }

  private placeHead(): void {
    this.head.position.copy(this.spine[0]);
    this.head.quaternion.setFromUnitVectors(FORWARD, this.curve.getTangent(0).negate().normalize());
  }

  /** Overlapping raised scutes follow the neck, shoulders and tail as the spine bends. */
  private placeArmor(): void {
    const matrix = new Matrix4();
    for (let row = 0; row < ARMOR_ROWS; row++) {
      const t = 0.04 + row / (ARMOR_ROWS - 1) * 0.8;
      const { point, tangent, side, up } = this.frame(t);
      const width = bodyWidth(t);
      const height = bodyHeight(t);
      for (let column = 0; column < ARMOR_COLUMNS; column++) {
        const angle = ((column + (row % 2) * 0.35) / (ARMOR_COLUMNS - 1) - 0.5) * 2.6;
        const outward = up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle));
        const across = new Vector3().crossVectors(outward, tangent).normalize();
        matrix.makeBasis(across, outward, tangent);
        matrix.scale(new Vector3(width * 0.28, 0.15 * Math.min(1, width), 0.9 * Math.min(1.4, width)));
        matrix.setPosition(point.clone().addScaledVector(side, Math.sin(angle) * width).addScaledVector(up, Math.cos(angle) * height * (1 + bodyRidge(t) * Math.cos(angle))));
        this.armor.setMatrixAt(row * ARMOR_COLUMNS + column, matrix);
      }
    }
    this.armor.instanceMatrix.needsUpdate = true;
  }

  /** Spade-shaped blade at the tip and a pair of side spikes, like the painting's spiky tail. */
  private placeTail(): void {
    const end = this.frame(1);
    this.tailBlade.matrixAutoUpdate = false;
    spikeMatrix(this.tailBlade.matrix, end.point, end.tangent, end.up, 0.9, 4.8);
    const near = this.frame(0.94);
    this.tailSpikes.forEach((spike, i) => {
      const outward = near.side.clone().multiplyScalar(i === 0 ? 1 : -1);
      spike.matrixAutoUpdate = false;
      spikeMatrix(spike.matrix, near.point, outward.addScaledVector(near.tangent, 1.2), near.up, 0.65, 1.8);
    });
  }

  /** Hind legs tuck back when diving and dangle slightly with each wingbeat. */
  private swingLegs(): void {
    const swing = -this.fold * 0.7 + Math.sin(this.flapPhase - 0.8) * 0.06;
    for (const leg of this.hindLegs) leg.rotation.x = swing;
  }
}
