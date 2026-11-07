import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { BAT } from '../../config';
import { Effects, randomDirection } from '../../fx/particles';
import { Foe, FoeContext } from './foe';

const WORLD_UP = new Vector3(0, 1, 0);
const EMBER = new Color(2.2, 0.8, 0.25);

interface BatKit {
  body: SphereGeometry;
  eye: SphereGeometry;
  wings: [BufferGeometry, BufferGeometry];
  skin: MeshStandardMaterial;
  eyes: MeshBasicMaterial;
}

let kit: BatKit | null = null;

function wing(side: number): BufferGeometry {
  const points = [0, 0, 0, 2.6 * side, 0.5, -0.3, 2.1 * side, -0.2, 0.9, 0, 0, 0, 2.1 * side, -0.2, 0.9, 0.8 * side, -0.1, 0.8];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function batKit(): BatKit {
  kit ??= {
    body: new SphereGeometry(0.5, 8, 6),
    eye: new SphereGeometry(0.09, 6, 4),
    wings: [wing(1), wing(-1)],
    skin: new MeshStandardMaterial({ color: '#160d0d', roughness: 0.9, side: DoubleSide }),
    eyes: new MeshBasicMaterial({ color: new Color(5, 0.5, 0.2) }),
  };
  return kit;
}

/**
 * One bat of a swarm: circles the dragon (often between it and the camera, blocking the view),
 * darts in to bite now and then, and leaves after a while. One flame is enough to kill it.
 */
export class Bat extends Foe {
  readonly radius = 7;
  readonly score = BAT.score;
  override readonly fragile = true;
  private readonly wings: [Mesh, Mesh];
  private angle = Math.random() * Math.PI * 2;
  private readonly orbitRadius = 14 + Math.random() * 26;
  private readonly orbitSpeed = (1.2 + Math.random() * 1.4) * (Math.random() < 0.5 ? -1 : 1);
  private readonly lane = -40 + Math.random() * 70;
  private readonly height = -6 + Math.random() * 22;
  private phase = Math.random() * 10;
  private diveTimer = 1 + Math.random() * 3;
  private diving = false;
  private biteCooldown = 0;
  private age = 0;

  constructor(position: Vector3) {
    super(1);
    const k = batKit();
    const body = new Group();
    body.scale.setScalar(1.6);
    this.wings = [new Mesh(k.wings[0], k.skin), new Mesh(k.wings[1], k.skin)];
    const torso = new Mesh(k.body, k.skin);
    torso.scale.set(1, 0.9, 1.4);
    body.add(torso, ...this.wings);
    for (const side of [-1, 1]) {
      const eye = new Mesh(k.eye, k.eyes);
      eye.position.set(0.2 * side, 0.18, -0.62);
      body.add(eye);
    }
    this.object.add(body);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    if (this.retreating(dt)) return;
    this.age += dt;
    if (this.age > BAT.lifetime) this.retreat();
    this.phase += dt * 30;
    this.angle += this.orbitSpeed * dt;
    this.biteCooldown -= dt;
    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.diving = !this.diving;
      this.diveTimer = this.diving ? 0.9 : 2 + Math.random() * 2.5;
    }

    const target = this.diving ? ctx.dragon.clone() : this.orbitPoint(ctx);
    const previous = this.position.clone();
    this.position.lerp(target, 1 - Math.exp(-(this.diving ? 4 : 2.6) * dt));
    this.position.y += Math.sin(this.phase * 0.3) * 4 * dt;
    this.face(this.position.clone().sub(previous));
    const flap = Math.sin(this.phase) * 1.1;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;

    if (this.diving && this.biteCooldown <= 0 && this.position.distanceTo(ctx.dragon) < BAT.biteRange) {
      ctx.hurtDragon(BAT.bite);
      ctx.cue('chirp');
      this.biteCooldown = BAT.biteCooldown;
      this.diving = false;
    }
  }

  /** A bat bursts into a few sparks, not a full explosion (a swarm dies all at once). */
  override die(effects: Effects): void {
    for (let i = 0; i < 6; i++) {
      effects.fire.emit({ position: this.position, velocity: randomDirection().multiplyScalar(14), life: 0.4, size: 3, endSize: 0.5, color: EMBER });
    }
  }

  /** A point circling the dragon, ahead of it or toward the camera. */
  private orbitPoint(ctx: FoeContext): Vector3 {
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    return ctx.dragon
      .clone()
      .addScaledVector(ctx.heading, this.lane)
      .addScaledVector(right, Math.cos(this.angle) * this.orbitRadius)
      .addScaledVector(WORLD_UP, this.height + Math.sin(this.angle * 2) * 6);
  }
}
