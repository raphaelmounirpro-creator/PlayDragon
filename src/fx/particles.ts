import {
  AdditiveBlending,
  Blending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Texture,
  Vector3,
} from 'three';

export interface ParticleOptions {
  position: Vector3;
  velocity?: Vector3;
  life: number;
  size: number;
  endSize?: number;
  color: Color;
  endColor?: Color;
  gravity?: number;
  drag?: number;
}

interface Particle {
  position: Vector3;
  velocity: Vector3;
  age: number;
  life: number;
  size: number;
  endSize: number;
  color: Color;
  endColor: Color;
  gravity: number;
  drag: number;
}

const vertexShader = /* glsl */ `
  attribute float size;
  attribute vec4 tint;
  varying vec4 vTint;
  uniform float pixelScale;
  void main() {
    vTint = tint;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * pixelScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D map;
  varying vec4 vTint;
  void main() {
    vec4 texel = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vTint.rgb, vTint.a * texel.a);
  }
`;

/** A fixed-size pool of camera-facing particles drawn in a single call. */
export class ParticleSystem {
  readonly points: Points;
  private readonly particles: Particle[] = [];
  private readonly capacity: number;
  private readonly positions: Float32Array;
  private readonly tints: Float32Array;
  private readonly sizes: Float32Array;
  private readonly material: ShaderMaterial;

  constructor(capacity: number, map: Texture, blending: Blending) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.tints = new Float32Array(capacity * 4);
    this.sizes = new Float32Array(capacity);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('tint', new BufferAttribute(this.tints, 4));
    geometry.setAttribute('size', new BufferAttribute(this.sizes, 1));
    this.material = new ShaderMaterial({
      uniforms: { map: { value: map }, pixelScale: { value: 600 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
  }

  static additive(capacity: number, map: Texture): ParticleSystem {
    return new ParticleSystem(capacity, map, AdditiveBlending);
  }

  static normal(capacity: number, map: Texture): ParticleSystem {
    return new ParticleSystem(capacity, map, NormalBlending);
  }

  setViewportHeight(height: number): void {
    this.material.uniforms.pixelScale.value = height * 0.9;
  }

  emit(options: ParticleOptions): void {
    if (this.particles.length >= this.capacity) this.particles.shift();
    this.particles.push({
      position: options.position.clone(),
      velocity: options.velocity?.clone() ?? new Vector3(),
      age: 0,
      life: options.life,
      size: options.size,
      endSize: options.endSize ?? options.size,
      color: options.color,
      endColor: options.endColor ?? options.color,
      gravity: options.gravity ?? 0,
      drag: options.drag ?? 0,
    });
  }

  clear(): void {
    this.particles.length = 0;
  }

  update(dt: number): void {
    const color = new Color();
    let alive = 0;
    for (const particle of this.particles) {
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      particle.velocity.y -= particle.gravity * dt;
      particle.velocity.multiplyScalar(Math.max(0, 1 - particle.drag * dt));
      particle.position.addScaledVector(particle.velocity, dt);

      const k = particle.age / particle.life;
      color.copy(particle.color).lerp(particle.endColor, k);
      this.positions.set([particle.position.x, particle.position.y, particle.position.z], alive * 3);
      this.tints.set([color.r, color.g, color.b, Math.min(1, k * 8) * (1 - k)], alive * 4);
      this.sizes[alive] = particle.size + (particle.endSize - particle.size) * k;
      this.particles[alive++] = particle;
    }
    this.particles.length = alive;
    const geometry = this.points.geometry;
    geometry.setDrawRange(0, alive);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.tint.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
  }
}

/** Fire + smoke pair with ready-made effects shared by projectiles and the castle. */
export class Effects {
  readonly fire: ParticleSystem;
  readonly smoke: ParticleSystem;

  constructor(glow: Texture) {
    this.fire = ParticleSystem.additive(4000, glow);
    this.smoke = ParticleSystem.normal(1600, glow);
  }

  setViewportHeight(height: number): void {
    this.fire.setViewportHeight(height);
    this.smoke.setViewportHeight(height);
  }

  explosion(position: Vector3, power: number): void {
    for (let i = 0; i < 70 * power; i++) {
      const velocity = randomDirection().multiplyScalar((30 + Math.random() * 90) * power);
      this.fire.emit({
        position,
        velocity,
        life: 0.5 + Math.random() * 0.7,
        size: 14 * power,
        endSize: 34 * power,
        color: new Color(3.2, 1.6, 0.5),
        endColor: new Color(0.8, 0.12, 0.02),
        drag: 2.2,
        gravity: -10,
      });
    }
    for (let i = 0; i < 12 * power; i++) {
      this.smoke.emit({
        position: position.clone().add(randomDirection().multiplyScalar(6 * power)),
        velocity: randomDirection().multiplyScalar(14 * power).add(new Vector3(0, 12, 0)),
        life: 2 + Math.random() * 1.4,
        size: 12 * power,
        endSize: 38 * power,
        color: new Color(0.07, 0.04, 0.03),
        endColor: new Color(0.13, 0.08, 0.06),
        drag: 0.8,
        gravity: -6,
      });
    }
  }

  burning(position: Vector3, intensity: number): void {
    this.fire.emit({
      position: position.clone().add(new Vector3((Math.random() - 0.5) * 14, 0, (Math.random() - 0.5) * 14)),
      velocity: new Vector3((Math.random() - 0.5) * 6, 18 + Math.random() * 20, (Math.random() - 0.5) * 6),
      life: 0.8 + Math.random() * 0.6,
      size: 12 * intensity,
      endSize: 4,
      color: new Color(3, 1.3, 0.35),
      endColor: new Color(0.6, 0.08, 0.02),
    });
    if (Math.random() < 0.25) {
      this.smoke.emit({
        position: position.clone().add(new Vector3(0, 10, 0)),
        velocity: new Vector3((Math.random() - 0.5) * 8, 22, (Math.random() - 0.5) * 8),
        life: 3.5,
        size: 12 * intensity,
        endSize: 40 * intensity,
        color: new Color(0.06, 0.035, 0.03),
        endColor: new Color(0.12, 0.08, 0.06),
        drag: 0.3,
      });
    }
  }

  /** A burst of golden sparks: a ring collected, a healing power. */
  sparkle(position: Vector3): void {
    for (let i = 0; i < 40; i++) {
      this.fire.emit({
        position,
        velocity: randomDirection().multiplyScalar(30 + Math.random() * 30),
        life: 0.8,
        size: 5,
        endSize: 1,
        color: new Color(3, 2.3, 1),
        endColor: new Color(1.2, 0.5, 0.1),
        drag: 2,
      });
    }
  }

  update(dt: number): void {
    this.fire.update(dt);
    this.smoke.update(dt);
  }

  clear(): void {
    this.fire.clear();
    this.smoke.clear();
  }
}

/**
 * Particles per second turned into a count for this frame, so a continuous effect (a jet of
 * flame) looks as dense at 165 FPS as at 60 FPS. Fractions carry over to the next frame.
 */
export class EmissionRate {
  private carry = 0;

  constructor(private readonly perSecond: number) {}

  count(dt: number): number {
    this.carry += dt * this.perSecond;
    const whole = Math.floor(this.carry);
    this.carry -= whole;
    return whole;
  }
}

export function randomDirection(): Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const z = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - z * z);
  return new Vector3(r * Math.cos(theta), z, r * Math.sin(theta));
}
