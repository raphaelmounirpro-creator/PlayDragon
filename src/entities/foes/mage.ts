import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { MAGE_SCORE } from '../../config';
import type { Effects } from '../../fx/particles';
import { randomDirection } from '../../fx/particles';
import type { Post } from '../../world/castle';
import { Foe, FoeContext } from './foe';

const CAST_EVERY = 5;
const ARCANE = new Color(1.6, 0.35, 1.1);

const domeShader = {
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vLocal;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = -viewPosition.xyz;
      vLocal = position;
      gl_Position = projectionMatrix * viewPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float time;
    uniform float strength;
    varying vec3 vNormal;
    varying vec3 vView;
    varying vec3 vLocal;
    void main() {
      float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
      float runes = 0.5 + 0.5 * sin(vLocal.y * 9.0 - time * 3.0) * sin(atan(vLocal.z, vLocal.x) * 12.0 + time);
      gl_FragColor = vec4(color * (edge * 1.3 + runes * edge * 0.3 + 0.03) * strength, 1.0);
    }
  `,
};

/**
 * Mage on top of the keep: raises a magic dome over the keep while any tower still stands,
 * and casts homing orbs at the dragon. Once the dome breaks, the mage can be burned.
 */
export class Mage extends Foe {
  readonly radius = 8;
  readonly score = MAGE_SCORE;
  private readonly dome: Mesh;
  private readonly domeMaterial: ShaderMaterial;
  private readonly orb: Mesh;
  private readonly figure = new Group();
  private reload = CAST_EVERY;
  private active = false;
  private domeUp = true;

  constructor(
    post: Post,
    dome: { center: Vector3; radius: number; height: number },
    private readonly shieldUp: () => boolean,
  ) {
    super(3);

    this.figure.scale.setScalar(2);
    const robe = new Mesh(new ConeGeometry(1.4, 4.2, 10), new MeshStandardMaterial({ color: '#2a1030', roughness: 0.9 }));
    robe.position.y = 2.1;
    const hood = new Mesh(new SphereGeometry(0.75, 10, 8), new MeshStandardMaterial({ color: '#1c0a20', roughness: 0.9 }));
    hood.position.y = 4.5;
    const staff = new Mesh(new CylinderGeometry(0.09, 0.09, 5.4, 6), new MeshStandardMaterial({ color: '#3a2618' }));
    staff.position.set(1.2, 2.8, -0.3);
    this.orb = new Mesh(new SphereGeometry(0.42, 12, 10), new MeshBasicMaterial({ color: ARCANE }));
    this.orb.position.set(1.2, 5.7, -0.3);
    this.figure.add(robe, hood, staff, this.orb);
    this.object.add(this.figure);
    this.position.copy(post.position);

    this.domeMaterial = new ShaderMaterial({
      ...domeShader,
      uniforms: { color: { value: ARCANE }, time: { value: 0 }, strength: { value: 1 } },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.dome = new Mesh(new SphereGeometry(1, 40, 24), this.domeMaterial);
    this.dome.scale.set(dome.radius, dome.height, dome.radius);
    // Only the figure turns toward the dragon; the dome stays centered on the keep.
    this.dome.position.copy(dome.center).sub(post.position);
    this.object.add(this.dome);
  }

  activate(): void {
    this.active = true;
  }

  override canBeHurt(): boolean {
    return !this.shieldUp();
  }

  update(dt: number, ctx: FoeContext): void {
    this.domeMaterial.uniforms.time.value = ctx.time;
    this.orb.scale.setScalar(1 + Math.sin(ctx.time * 5) * 0.2);
    this.updateDome(ctx.effects);
    const toDragon = ctx.dragon.clone().sub(this.position);
    this.figure.rotation.y = Math.atan2(-toDragon.x, -toDragon.z);
    if (!this.active) return;
    this.reload -= dt * ctx.difficulty.enemyFireRate;
    if (this.reload <= 0) {
      this.reload = CAST_EVERY;
      ctx.fire('orb', this.orb.getWorldPosition(new Vector3()), ctx.dragon);
      ctx.cue('cast');
    }
  }

  /** Burst of arcane sparks when a fireball hits the dome. */
  static ripple(effects: Effects, at: Vector3): void {
    for (let i = 0; i < 24; i++) {
      effects.fire.emit({ position: at, velocity: randomDirection().multiplyScalar(30), life: 0.5, size: 6, endSize: 1, color: ARCANE, drag: 3 });
    }
  }

  private updateDome(effects: Effects): void {
    if (!this.domeUp || this.shieldUp()) return;
    this.domeUp = false;
    this.dome.visible = false;
    const center = this.dome.getWorldPosition(new Vector3());
    for (let i = 0; i < 80; i++) {
      const point = center.clone().add(randomDirection().multiply(this.dome.scale));
      effects.fire.emit({ position: point, velocity: randomDirection().multiplyScalar(20), life: 1.2, size: 9, endSize: 1, color: ARCANE, drag: 1 });
    }
  }
}
