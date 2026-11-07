import { Color, Vector3 } from 'three';
import { GUARDIAN_CHARGE_DAMAGE, GUARDIAN_SCORE } from '../../config';
import type { Effects } from '../../fx/particles';
import { Foe, FoeContext } from './foe';
import { createGargoyleModel, flapGargoyle, GargoyleLook } from './gargoyleModel';

type Mode = 'arrive' | 'hold' | 'windup' | 'charge' | 'return';

const LOOK: GargoyleLook = { skin: '#5d5751', membrane: '#3a3330', eyes: new Color(7, 2.4, 0.4), size: 8.5, ember: 0.25 };
const HOLD_DISTANCE = 230;
const BOULDER_RELOAD = 3.4;
const CHARGE_EVERY = 9;
const WINDUP = 1.1;
const CHARGE_SPEED = 330;
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Mini-boss: a giant stone gargoyle that bars the way before the castle. It throws boulders
 * and, after a visible wind-up, charges at where the dragon was: move aside to dodge.
 */
export class Guardian extends Foe {
  readonly radius = 36;
  readonly score = GUARDIAN_SCORE;
  override readonly bossName = 'Gardien de pierre';
  private readonly model = createGargoyleModel(LOOK);
  private mode: Mode = 'arrive';
  private timer = 0;
  private reload = BOULDER_RELOAD;
  private chargeClock = 0;
  private readonly chargeTarget = new Vector3();
  private chargeHit = false;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.model.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    this.timer += dt;
    flapGargoyle(this.model, Math.sin(ctx.time * (this.mode === 'charge' ? 9 : 3.2)) * 0.7);
    switch (this.mode) {
      case 'arrive':
      case 'return':
        this.glideTo(this.holdPoint(ctx), dt, 1.4);
        if (this.position.distanceTo(this.holdPoint(ctx)) < 40) this.switchTo('hold');
        break;
      case 'hold':
        this.glideTo(this.holdPoint(ctx), dt, 2);
        this.attack(dt, ctx);
        break;
      case 'windup':
        this.position.x += Math.sin(this.timer * 70) * 0.8;
        if (this.timer > WINDUP) {
          this.chargeTarget.copy(ctx.dragon);
          this.chargeHit = false;
          this.switchTo('charge');
        }
        break;
      case 'charge':
        this.charge(dt, ctx);
        break;
    }
    this.face(this.mode === 'charge' ? this.chargeTarget.clone().sub(this.position) : ctx.dragon.clone().sub(this.position));
  }

  override die(effects: Effects): void {
    for (let i = 0; i < 4; i++) {
      effects.explosion(this.position.clone().add(new Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 40)), 3);
    }
  }

  /** In front of the dragon, slightly below it (against the mountains, not lost in the sun), swaying. */
  private holdPoint(ctx: FoeContext): Vector3 {
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    return ctx.dragon
      .clone()
      .addScaledVector(ctx.heading, HOLD_DISTANCE)
      .addScaledVector(right, Math.sin(ctx.time * 0.7) * 90)
      .addScaledVector(WORLD_UP, -20 + Math.sin(ctx.time * 1.1) * 20);
  }

  private attack(dt: number, ctx: FoeContext): void {
    this.reload -= dt * ctx.difficulty.enemyFireRate;
    this.chargeClock += dt * ctx.difficulty.enemyFireRate;
    if (this.reload <= 0) {
      this.reload = BOULDER_RELOAD;
      ctx.fire('boulder', this.object.localToWorld(this.model.mouth.clone()), ctx.dragon);
      ctx.cue('spit');
    }
    if (this.chargeClock > CHARGE_EVERY) {
      this.chargeClock = 0;
      this.switchTo('windup');
      ctx.cue('roar');
    }
  }

  private charge(dt: number, ctx: FoeContext): void {
    const toTarget = this.chargeTarget.clone().sub(this.position);
    const step = CHARGE_SPEED * dt;
    if (toTarget.length() <= step || this.timer > 2) {
      this.switchTo('return');
      return;
    }
    this.position.addScaledVector(toTarget.normalize(), step);
    if (!this.chargeHit && this.position.distanceTo(ctx.dragon) < this.radius + 6) {
      this.chargeHit = true;
      ctx.hurtDragon(GUARDIAN_CHARGE_DAMAGE);
    }
  }

  private glideTo(point: Vector3, dt: number, rate: number): void {
    this.position.lerp(point, 1 - Math.exp(-rate * dt));
  }

  private switchTo(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }
}
