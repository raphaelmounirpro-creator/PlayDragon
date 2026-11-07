import { Color, Vector3 } from 'three';
import { QUEEN } from '../../config';
import { Effects, randomDirection } from '../../fx/particles';
import { Bat } from './bat';
import { Foe, FoeContext } from './foe';
import { GargoyleLook, GargoyleModel } from './gargoyleModel';

type Mode = 'arrive' | 'hold' | 'windup' | 'dive' | 'return';

const LOOK: GargoyleLook = { skin: '#2a1830', membrane: '#9a5a8a', eyes: new Color(6, 1, 2.6), size: 6.5, ember: 0.05, ears: true };
const SCREECH_SPREAD = [-0.25, 0, 0.25];
const WORLD_UP = new Vector3(0, 1, 0);

/**
 * Boss of the second level: a giant bat queen. She screeches rings of sound, calls swarms of bats,
 * and after a shrill warning dives at the dragon.
 */
export class Queen extends Foe {
  readonly radius = 30;
  readonly score = QUEEN.score;
  override readonly bossName = 'La Reine des nuées';
  override readonly indicator = 'boss';
  private readonly model = new GargoyleModel(LOOK);
  private mode: Mode = 'arrive';
  private timer = 0;
  private screech = QUEEN.screechEvery;
  private summon = QUEEN.summonEvery * 0.5;
  private dive = QUEEN.diveEvery;
  private readonly diveTarget = new Vector3();
  private diveHit = false;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.model.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    this.timer += dt;
    const diving = this.mode === 'dive';
    this.model.pose(diving ? 0.25 : Math.sin(ctx.time * 4.5) * 0.65 + 0.1, diving ? 0.8 : 0);
    switch (this.mode) {
      case 'arrive':
      case 'return':
        this.glideTo(this.holdPoint(ctx), dt, 1.5);
        if (this.position.distanceTo(this.holdPoint(ctx)) < 40) this.switchTo('hold');
        break;
      case 'hold':
        this.glideTo(this.holdPoint(ctx), dt, 2.2);
        this.attack(dt, ctx);
        break;
      case 'windup':
        this.position.y += Math.sin(this.timer * 40) * 0.6;
        if (this.timer > QUEEN.windup) {
          this.diveTarget.copy(ctx.dragon);
          this.diveHit = false;
          this.switchTo('dive');
        }
        break;
      case 'dive':
        this.diveAt(dt, ctx);
        break;
    }
    this.face(diving ? this.diveTarget.clone().sub(this.position) : ctx.dragon.clone().sub(this.position));
  }

  override die(effects: Effects): void {
    for (let i = 0; i < 4; i++) effects.explosion(this.position.clone().add(randomDirection().multiplyScalar(25)), 2.6);
  }

  private holdPoint(ctx: FoeContext): Vector3 {
    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    return ctx.dragon
      .clone()
      .addScaledVector(ctx.heading, QUEEN.holdDistance)
      .addScaledVector(right, Math.sin(ctx.time * 0.55) * 120)
      .addScaledVector(WORLD_UP, -10 + Math.sin(ctx.time * 0.9) * 30);
  }

  private attack(dt: number, ctx: FoeContext): void {
    const rate = dt * ctx.difficulty.enemyFireRate;
    this.screech -= rate;
    this.summon -= rate;
    this.dive -= rate;
    if (this.screech <= 0) {
      this.screech = QUEEN.screechEvery;
      this.object.updateMatrixWorld();
      const mouth = this.object.localToWorld(this.model.mouth.clone());
      const toward = ctx.dragon.clone().sub(mouth);
      for (const angle of SCREECH_SPREAD) ctx.fire('wave', mouth, mouth.clone().add(toward.clone().applyAxisAngle(WORLD_UP, angle)));
      ctx.cue('shriek');
    }
    if (this.summon <= 0) {
      this.summon = QUEEN.summonEvery;
      for (let i = 0; i < QUEEN.summonCount; i++) ctx.summon(new Bat(this.position.clone().add(randomDirection().multiplyScalar(30))));
      ctx.cue('chirp');
    }
    if (this.dive <= 0) {
      this.dive = QUEEN.diveEvery;
      this.switchTo('windup');
      ctx.cue('shriek');
      ctx.shake(0.25);
    }
  }

  private diveAt(dt: number, ctx: FoeContext): void {
    const toTarget = this.diveTarget.clone().sub(this.position);
    const step = QUEEN.diveSpeed * dt;
    if (toTarget.length() <= step || this.timer > 2) {
      this.switchTo('return');
      return;
    }
    this.position.addScaledVector(toTarget.normalize(), step);
    if (!this.diveHit && this.position.distanceTo(ctx.dragon) < this.radius + 6) {
      this.diveHit = true;
      ctx.hurtDragon(QUEEN.diveDamage);
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
