import { CatmullRomCurve3, MathUtils, Matrix4, PerspectiveCamera, Vector2, Vector3 } from 'three';
import { BOOST_FACTOR, BRAKE_FACTOR, FLIGHT_SPEED, SIEGE_DISTANCE, STEER_LIMIT_X, STEER_LIMIT_Y, STEER_SPEED } from '../config';
import { Dragon } from '../entities/dragon';
import { frameAt, PathFrame } from '../world/pathFrame';
import type { Landscape } from '../world/landscape';

export type FlightMode = 'menu' | 'voyage' | 'siege' | 'end';

const MIN_GROUND_CLEARANCE = 30;
const CAMERA_GROUND_CLEARANCE = 15;
const ORBIT_SPEED = 140;
const ORBIT_MIN_RADIUS = 320;
const ORBIT_MAX_RADIUS = 480;
const ORBIT_MIN_HEIGHT = -20;
const ORBIT_MAX_HEIGHT = 220;
const MAX_PITCH = 0.65;
const MAX_BANK = 0.7;
const STEER_RESPONSE = 2.8;
const VERTICAL_SPEED = STEER_SPEED * 0.7;
const BASE_FOV = 58;
const WORLD_UP = new Vector3(0, 1, 0);
const MENU_ORBIT_ANGLE = 2.45; // radians from the dragon's heading: behind and to its right
const MENU_DISTANCE = 52;
const MENU_HEIGHT = 9;
const MENU_FRAMING = 16;
const BOOST_FOV = 12;
/** Camera shake: how far (units) the camera jolts at full trauma, and how fast trauma fades. */
const SHAKE_DISTANCE = 5;
const SHAKE_DECAY = 1.6;
const PITCH_SPEED_SCALE = 90;

interface Orbit {
  angle: number;
  radius: number;
  height: number;
}

/** Moves the dragon along the valley route and keeps the camera framing it like a painting. */
export class FlightController {
  readonly position = new Vector3();
  readonly forward = new Vector3(0, 0, -1);
  private distance = 0;
  private readonly offset = new Vector2();
  /** The dragon's velocity in the world, in units/s (enemies lead their shots with it). */
  readonly velocity = new Vector3();
  /** Lateral (x) and vertical (y) speed of the dragon relative to its route, in units/s. */
  private readonly steering = new Vector2();
  private readonly previousPosition = new Vector3();
  private orbit: Orbit | null = null;
  private previousY = 0;
  /** Current speed relative to cruise speed (BRAKE_FACTOR to BOOST_FACTOR). */
  speedFactor = 1;
  /** While true the dragon stops advancing along the route (a boss bars the way); it can still steer. */
  hold = false;
  private trauma = 0;
  private bank = 0;
  private pitch = 0;
  private time = 0;
  private readonly siegeStart: number;
  private readonly orientation = new Matrix4();

  constructor(
    private readonly curve: CatmullRomCurve3,
    private readonly land: Landscape,
    private readonly dragon: Dragon,
    private readonly camera: PerspectiveCamera,
    private readonly castleTarget: Vector3,
  ) {
    this.siegeStart = curve.getLength() - SIEGE_DISTANCE;
  }

  reset(): void {
    this.distance = 0;
    this.offset.set(0, 0);
    this.steering.set(0, 0);
    this.velocity.set(0, 0, 0);
    this.orbit = null;
    this.speedFactor = 1;
    this.trauma = 0;
    this.previousY = this.curve.getPointAt(0).y;
    this.bank = 0;
    this.pitch = 0;
  }

  /** Fraction of the journey toward the castle, from 0 to 1. */
  journey(): number {
    return this.distance / this.siegeStart;
  }

  /** The route `ahead` units in front of the dragon (used to spawn enemies). */
  frameAhead(ahead: number): PathFrame {
    return frameAt(this.curve, this.distance + ahead);
  }

  reachedCastle(): boolean {
    return this.distance >= this.siegeStart;
  }

  /** `throttle`: -1 brakes, 0 cruises, 1 accelerates. */
  update(dt: number, steerX: number, steerY: number, throttle: number, mode: FlightMode): void {
    this.time += dt;
    this.previousPosition.copy(this.position);
    const speedTarget = throttle > 0 ? BOOST_FACTOR : throttle < 0 ? BRAKE_FACTOR : 1;
    this.speedFactor = MathUtils.damp(this.speedFactor, speedTarget, 3, dt);
    const atCastle = mode === 'siege' || (mode === 'end' && this.reachedCastle());

    // Inertia: input sets a target velocity that the dragon reaches progressively.
    const lateralSpeed = atCastle ? ORBIT_SPEED * this.speedFactor : STEER_SPEED;
    this.steering.x = MathUtils.damp(this.steering.x, steerX * lateralSpeed, STEER_RESPONSE, dt);
    this.steering.y = MathUtils.damp(this.steering.y, steerY * VERTICAL_SPEED, STEER_RESPONSE, dt);

    if (atCastle) {
      this.circleCastle(dt);
    } else {
      this.followRiver(dt, mode);
    }
    // Gentle wandering so the dragon never looks rail-mounted.
    this.position.y += Math.sin(this.time * 0.9) * 2.5;
    this.position.y = Math.max(this.position.y, this.land.terrainHeight(this.position.x, this.position.z) + MIN_GROUND_CLEARANCE);
    if (dt > 0) this.velocity.subVectors(this.position, this.previousPosition).divideScalar(dt);

    // Nose follows the actual climb or dive: body tilts down when descending, up when climbing.
    const verticalSpeed = dt > 0 ? (this.position.y - this.previousY) / dt : 0;
    this.previousY = this.position.y;
    const pitchTarget = MathUtils.clamp(verticalSpeed / PITCH_SPEED_SCALE, -MAX_PITCH, MAX_PITCH);
    const turn = MathUtils.clamp(this.steering.x / STEER_SPEED, -1, 1);
    this.bank = MathUtils.damp(this.bank, -turn * MAX_BANK, 4, dt);
    this.pitch = MathUtils.damp(this.pitch, pitchTarget, 5, dt);
    this.orientDragon();
    this.dragon.update(dt, this.time, {
      turn,
      climb: MathUtils.clamp(verticalSpeed / VERTICAL_SPEED, -1, 1),
      effort: Math.max(0, (this.speedFactor - 1) / (BOOST_FACTOR - 1)),
    });
    this.updateCamera(dt, mode);
  }

  private followRiver(dt: number, mode: FlightMode): void {
    if (mode === 'voyage' && !this.hold) {
      this.distance = Math.min(this.siegeStart, this.distance + FLIGHT_SPEED * this.speedFactor * dt);
      this.offset.x = this.moveWithin(this.offset.x, 'x', dt, STEER_LIMIT_X);
      this.offset.y = this.moveWithin(this.offset.y, 'y', dt, STEER_LIMIT_Y);
    }
    const frame = frameAt(this.curve, this.distance);
    this.position.copy(frame.point).addScaledVector(frame.right, this.offset.x).addScaledVector(frame.up, this.offset.y);
    // The nose points where the dragon is actually going, not just along the river.
    const sideways = this.steering.x / (FLIGHT_SPEED * this.speedFactor);
    this.forward.copy(frame.tangent).addScaledVector(frame.right, sideways * 0.6).normalize();
  }

  /** Siege: left/right orbit around the castle while facing it, up/down change altitude. */
  private circleCastle(dt: number): void {
    const center = this.castleTarget;
    if (!this.orbit) {
      this.orbit = {
        angle: Math.atan2(this.position.z - center.z, this.position.x - center.x),
        radius: MathUtils.clamp(Math.hypot(this.position.x - center.x, this.position.z - center.z), ORBIT_MIN_RADIUS, ORBIT_MAX_RADIUS),
        height: this.position.y,
      };
    }
    const orbit = this.orbit;
    // Moving toward the dragon's right (facing the castle) decreases the angle.
    orbit.angle -= (this.steering.x * dt) / orbit.radius;
    orbit.height = this.moveWithin(orbit.height - center.y, 'y', dt, ORBIT_MAX_HEIGHT, ORBIT_MIN_HEIGHT) + center.y;
    this.position.set(center.x + Math.cos(orbit.angle) * orbit.radius, orbit.height, center.z + Math.sin(orbit.angle) * orbit.radius);
    this.forward.copy(center).sub(this.position).setY(0).normalize();
  }

  /** Advances one axis by the current velocity, stopping (and killing that velocity) at the limits. */
  private moveWithin(value: number, axis: 'x' | 'y', dt: number, max: number, min = -max): number {
    const next = value + this.steering[axis] * dt;
    if (next > max || next < min) this.steering[axis] = 0;
    return MathUtils.clamp(next, min, max);
  }

  private orientDragon(): void {
    const root = this.dragon.root;
    root.position.copy(this.position);
    // Matrix4.lookAt aims +Z away from the target; the model faces -Z, so look toward the point ahead.
    const ahead = this.position.clone().add(this.forward);
    this.orientation.lookAt(this.position, ahead, new Vector3(0, 1, 0));
    root.quaternion.setFromRotationMatrix(this.orientation);
    root.rotateZ(this.bank);
    root.rotateX(this.pitch);
  }

  private updateCamera(dt: number, mode: FlightMode): void {
    const target = new Vector3();
    const lookAt = new Vector3();
    if (mode === 'menu') {
      // Slow showcase orbit behind and to the right, the dragon framed right of the title.
      const angle = MENU_ORBIT_ANGLE + Math.sin(this.time * 0.08) * 0.45;
      const side = new Vector3().crossVectors(this.forward, WORLD_UP).normalize();
      target
        .copy(this.position)
        .addScaledVector(this.forward, Math.cos(angle) * MENU_DISTANCE)
        .addScaledVector(side, Math.sin(angle) * MENU_DISTANCE)
        .addScaledVector(WORLD_UP, MENU_HEIGHT);
      const screenRight = this.position.clone().sub(target).cross(WORLD_UP).normalize();
      lookAt.copy(this.position).addScaledVector(screenRight, -MENU_FRAMING).addScaledVector(WORLD_UP, 3);
    } else {
      // Three-quarter rear view, slightly above: the dragon is silhouetted against the sun.
      const side = new Vector3().crossVectors(this.forward, new Vector3(0, 1, 0)).normalize();
      const siegeView = mode !== 'voyage';
      const height = siegeView ? 46 : 22;
      target.copy(this.position).addScaledVector(this.forward, siegeView ? -70 : -60).addScaledVector(side, 16).add(new Vector3(0, height, 0));
      lookAt.copy(this.position).addScaledVector(this.forward, 110).add(new Vector3(0, 6, 0));
      if (siegeView) lookAt.lerp(this.castleTarget, 0.45);
    }
    target.y = Math.max(target.y, this.land.terrainHeight(target.x, target.z) + CAMERA_GROUND_CLEARANCE);
    const smoothing = 1 - Math.exp(-4 * dt);
    this.camera.position.lerp(target, dt === 0 ? 1 : smoothing);
    // Wider field of view at high speed sells the acceleration.
    this.camera.fov = BASE_FOV + (this.speedFactor - 1) * BOOST_FOV;
    this.applyShake(dt);
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(lookAt);
  }

  /** Jolts the camera (0 to 1, adds up): impacts, explosions, a boss charging past. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Trauma squared gives a punchy start and a soft end. */
  private applyShake(dt: number): void {
    this.trauma = Math.max(0, this.trauma - SHAKE_DECAY * dt);
    const jolt = this.trauma * this.trauma * SHAKE_DISTANCE;
    if (jolt > 0) this.camera.position.add(new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(jolt * 2));
  }
}
