import { Color, MathUtils, Vector3 } from 'three';
import { RIVAL } from '../../config';
import { Effects, EmissionRate, randomDirection } from '../../fx/particles';
import { Dragon } from '../dragon';
import { Foe, FoeContext } from './foe';

type Mode = 'arrive' | 'hold' | 'windup' | 'breath' | 'swoop' | 'return';

const LOOK = { scale: 0.8, skin: '#5a1410' };
const VOLLEY_SPREAD = [-0.12, 0, 0.12];
const BREATH_SWEEP = 0.35;
const BREATH_SHOT_EVERY = 0.12;
const BREATH_FLAMES_PER_SECOND = 170;
const WORLD_UP = new Vector3(0, 1, 0);
const FLAME = new Color(2.5, 0.85, 0.24);
const FLAME_END = new Color(0.8, 0.08, 0.02);

/**
 * Final boss: Ignar, a rival dragon bigger than the player's. It hovers ahead firing volleys of
 * flame, rears up to breathe a sweeping jet of fire, and swoops past to strike.
 */
export class Rival extends Foe {
  readonly radius = 26;
  readonly score = RIVAL.score;
  override readonly bossName = 'Ignar, le dragon rival';
  override readonly indicator = 'boss';
  private readonly body = new Dragon(LOOK);
  private mode: Mode = 'arrive';
  private timer = 0;
  private volley = RIVAL.volleyEvery;
  private breath = RIVAL.breathEvery;
  private swoop = RIVAL.swoopEvery;
  private shotClock = 0;
  private side = 1;
  private swoopHit = false;
  private readonly swoopTarget = new Vector3();
  private readonly mouth = new Vector3();
  private turn = 0;
  private readonly breathFlames = new EmissionRate(BREATH_FLAMES_PER_SECOND);

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.body.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    this.timer += dt;
    const previous = this.position.clone();
    switch (this.mode) {
      case 'arrive':
      case 'return':
        this.glideTo(this.holdPoint(ctx), dt, 1.5);
        if (this.position.distanceTo(this.holdPoint(ctx)) < 40) this.switchTo('hold');
        break;
      case 'hold':
        this.glideTo(this.holdPoint(ctx), dt, 2);
        this.attack(dt, ctx);
        break;
      case 'windup':
        this.glideTo(this.holdPoint(ctx).addScaledVector(WORLD_UP, 25), dt, 2);
        if (this.timer > RIVAL.breathWindup) this.switchTo('breath');
        break;
      case 'breath':
        this.glideTo(this.holdPoint(ctx), dt, 2);
        this.breathe(dt, ctx);
        break;
      case 'swoop':
        this.swoopPast(dt, ctx);
        break;
    }
    this.animate(dt, ctx, previous);
  }

  override die(effects: Effects): void {
    for (let i = 0; i < 5; i++) effects.explosion(this.position.clone().add(randomDirection().multiplyScalar(22)), 2.8);
  }

  private holdPoint(ctx: FoeContext): Vector3 {
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    return ctx.dragon
      .clone()
      .addScaledVector(ctx.heading, RIVAL.holdDistance)
      .addScaledVector(right, Math.sin(ctx.time * 0.6) * 100)
      .addScaledVector(WORLD_UP, Math.sin(ctx.time * 0.8) * 25);
  }

  private attack(dt: number, ctx: FoeContext): void {
    const rate = dt * ctx.difficulty.enemyFireRate;
    this.volley -= rate;
    this.breath -= rate;
    this.swoop -= rate;
    if (this.volley <= 0) {
      this.volley = RIVAL.volleyEvery;
      const mouth = this.mouthPosition();
      const toward = ctx.dragon.clone().sub(mouth);
      for (const angle of VOLLEY_SPREAD) ctx.fire('flame', mouth, mouth.clone().add(toward.clone().applyAxisAngle(WORLD_UP, angle)));
      this.body.openJaw();
      ctx.cue('spit');
    } else if (this.breath <= 0) {
      this.breath = RIVAL.breathEvery;
      this.side = Math.random() < 0.5 ? -1 : 1;
      this.switchTo('windup');
      ctx.cue('roar');
      ctx.shake(0.3);
    } else if (this.swoop <= 0) {
      this.swoop = RIVAL.swoopEvery;
      const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
      this.swoopTarget.copy(ctx.dragon).addScaledVector(right, 25 * (Math.random() < 0.5 ? -1 : 1)).addScaledVector(ctx.heading, -120);
      this.swoopHit = false;
      this.switchTo('swoop');
      ctx.cue('roar');
    }
  }

  /** A jet of fire sweeping across the dragon's path: move against the sweep to dodge it. */
  private breathe(dt: number, ctx: FoeContext): void {
    const progress = this.timer / RIVAL.breathTime;
    if (progress >= 1) {
      this.switchTo('hold');
      return;
    }
    const mouth = this.mouthPosition();
    const direction = ctx.dragon.clone().sub(mouth).normalize().applyAxisAngle(WORLD_UP, (progress * 2 - 1) * BREATH_SWEEP * this.side);
    for (let i = this.breathFlames.count(dt); i > 0; i--) {
      ctx.effects.fire.emit({
        position: mouth,
        velocity: direction.clone().multiplyScalar(240).add(randomDirection().multiplyScalar(30)),
        life: 0.5,
        size: 10,
        endSize: 34,
        color: FLAME,
        endColor: FLAME_END,
        drag: 0.6,
      });
    }
    this.body.openJaw();
    this.shotClock -= dt;
    if (this.shotClock <= 0) {
      this.shotClock = BREATH_SHOT_EVERY;
      ctx.fire('flame', mouth, mouth.clone().addScaledVector(direction, 300));
    }
  }

  private swoopPast(dt: number, ctx: FoeContext): void {
    const toTarget = this.swoopTarget.clone().sub(this.position);
    const step = 300 * dt;
    if (toTarget.length() <= step || this.timer > 3) {
      this.switchTo('return');
      return;
    }
    this.position.addScaledVector(toTarget.normalize(), step);
    if (!this.swoopHit && this.position.distanceTo(ctx.dragon) < this.radius + 6) {
      this.swoopHit = true;
      ctx.hurtDragon(RIVAL.swoopDamage);
      ctx.shake(0.4);
    }
  }

  private animate(dt: number, ctx: FoeContext, previous: Vector3): void {
    const velocity = this.position.clone().sub(previous).divideScalar(Math.max(dt, 1e-3));
    const facing = this.mode === 'swoop' ? velocity : ctx.dragon.clone().sub(this.position);
    this.face(facing);
    const right = new Vector3().crossVectors(facing, WORLD_UP).normalize();
    this.turn = MathUtils.damp(this.turn, MathUtils.clamp(velocity.dot(right) / 120, -1, 1), 4, dt);
    this.object.rotateZ(-this.turn * 0.5);
    const climb = this.mode === 'windup' ? 0.8 : MathUtils.clamp(velocity.y / 90, -1, 1);
    this.body.update(dt, ctx.time, { turn: this.turn, climb, effort: this.mode === 'swoop' ? 1 : 0.3 });
  }

  private mouthPosition(): Vector3 {
    this.object.updateMatrixWorld(true);
    return this.body.mouthPosition(this.mouth).clone();
  }

  private glideTo(point: Vector3, dt: number, rate: number): void {
    this.position.lerp(point, 1 - Math.exp(-rate * dt));
  }

  private switchTo(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }
}
