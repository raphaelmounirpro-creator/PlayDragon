import { MathUtils, Vector3 } from 'three';
import { WYVERN } from '../../config';
import { Dragon } from '../dragon';
import { Foe, FoeContext } from './foe';

type Mode = 'stalk' | 'overtake' | 'hover' | 'swoop';

const LOOK = { scale: 0.42, skin: '#7a2e20' };
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Rival wyvern: sneaks up from behind to bite, overtakes the dragon, hovers ahead
 * (the moment to burn it), then swoops back behind to try again.
 */
export class Wyvern extends Foe {
  readonly radius = 12;
  readonly score = WYVERN.score;
  override readonly indicator = 'enemy';
  private readonly body = new Dragon(LOOK);
  private readonly steering = new Vector3();
  private mode: Mode = 'stalk';
  private timer = 0;
  private readonly side = Math.random() < 0.5 ? -1 : 1;
  private turn = 0;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.body.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    if (this.retreating(dt)) return;
    this.timer += dt;
    const target = this.target(ctx);
    const speed = ctx.dragonVelocity.length() + WYVERN.speed[this.mode];
    const desired = target.clone().sub(this.position).normalize().multiplyScalar(speed);
    const previous = this.steering.clone();
    this.steering.lerp(desired, Math.min(1, 2.5 * dt));
    this.position.addScaledVector(this.steering, dt);

    const right = new Vector3().crossVectors(this.steering, WORLD_UP).normalize();
    this.turn = MathUtils.damp(this.turn, MathUtils.clamp(this.steering.clone().sub(previous).dot(right) / (dt * 120 + 1e-6), -1, 1), 4, dt);
    this.face(this.mode === 'hover' ? ctx.dragon.clone().sub(this.position) : this.steering);
    this.object.rotateZ(-this.turn * 0.6);
    this.body.update(dt, ctx.time, { turn: this.turn, climb: MathUtils.clamp(this.steering.y / 80, -1, 1), effort: this.mode === 'stalk' ? 0.3 : 1 });
    this.advance(ctx, target);
  }

  private target(ctx: FoeContext): Vector3 {
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    const t = ctx.time;
    switch (this.mode) {
      case 'stalk':
        return ctx.dragon.clone().addScaledVector(ctx.heading, -12).addScaledVector(WORLD_UP, 3);
      case 'overtake':
        return ctx.dragon.clone().addScaledVector(ctx.heading, 170).addScaledVector(WORLD_UP, 30);
      case 'hover':
        return ctx.dragon
          .clone()
          .addScaledVector(ctx.heading, 120)
          .addScaledVector(right, Math.sin(t * 1.3) * 70)
          .addScaledVector(WORLD_UP, 20 + Math.sin(t * 2) * 15);
      case 'swoop':
        return ctx.dragon.clone().addScaledVector(ctx.heading, -90).addScaledVector(right, 40 * this.side);
    }
  }

  private advance(ctx: FoeContext, target: Vector3): void {
    const ahead = this.position.clone().sub(ctx.dragon).dot(ctx.heading);
    if (this.mode === 'stalk' && this.position.distanceTo(ctx.dragon) < WYVERN.biteRange) {
      ctx.hurtDragon(WYVERN.bite);
      ctx.cue('bite');
      this.body.openJaw();
      this.switchTo('overtake');
    } else if (this.mode === 'overtake' && this.position.distanceTo(target) < 30) {
      this.switchTo('hover');
      ctx.cue('shriek');
    } else if (this.mode === 'hover' && this.timer > WYVERN.hoverTime) {
      this.switchTo('swoop');
    } else if (this.mode === 'swoop' && ahead < -60) {
      this.switchTo('stalk');
    }
  }

  private switchTo(mode: Mode): void {
    this.mode = mode;
    this.timer = 0;
  }
}
