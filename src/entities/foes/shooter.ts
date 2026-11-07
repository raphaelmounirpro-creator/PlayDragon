import { Color, Vector3 } from 'three';
import { SHOOTER } from '../../config';
import { Foe, FoeContext } from './foe';
import { GargoyleLook, GargoyleModel } from './gargoyleModel';

const LOOK: GargoyleLook = { skin: '#4d4a40', membrane: '#8a7a5a', eyes: new Color(5, 3, 0.6), size: 2, ember: 0 };
const WORLD_UP = new Vector3(0, 1, 0);

/** Stone gargoyle that keeps its distance in front of the dragon and spits stones at it. */
export class ShooterGargoyle extends Foe {
  readonly radius = 14;
  readonly score = SHOOTER.score;
  override readonly indicator = 'enemy';
  private readonly model = new GargoyleModel(LOOK);
  private readonly side = Math.random() < 0.5 ? -1 : 1;
  private readonly phase = Math.random() * Math.PI * 2;
  private reload = 1.5 + Math.random() * SHOOTER.reloadSpread;
  private age = 0;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.model.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    if (this.retreating(dt)) return;
    this.age += dt;
    if (this.age > SHOOTER.stay) this.retreat();

    const right = new Vector3().crossVectors(ctx.heading, WORLD_UP).normalize();
    const t = ctx.time + this.phase;
    const target = ctx.dragon
      .clone()
      .addScaledVector(ctx.heading, SHOOTER.distanceAhead)
      .addScaledVector(right, this.side * 70 + Math.sin(t * 0.8) * 50)
      .addScaledVector(WORLD_UP, 30 + Math.sin(t * 1.3) * 20);
    this.position.lerp(target, 1 - Math.exp(-1.6 * dt));
    this.face(ctx.dragon.clone().sub(this.position));
    this.model.pose(Math.sin(t * 7) * 0.5 + 0.15);

    this.reload -= dt * ctx.difficulty.enemyFireRate;
    if (this.reload <= 0) {
      this.reload = SHOOTER.reloadMin + Math.random() * SHOOTER.reloadSpread;
      this.object.updateMatrixWorld();
      ctx.fire('stone', this.object.localToWorld(this.model.mouth.clone()), ctx.dragon);
      ctx.cue('spit');
    }
  }
}
