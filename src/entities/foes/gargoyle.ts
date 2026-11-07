import { Color, Vector3 } from 'three';
import { ENEMY_DAMAGE, ENEMY_SCORE } from '../../config';
import { Foe, FoeContext } from './foe';
import { createGargoyleModel, flapGargoyle, GargoyleLook } from './gargoyleModel';

const LOOK: GargoyleLook = { skin: '#2b1a1e', membrane: '#3a1d1a', eyes: new Color(6, 0.6, 0.3), size: 1.7, ember: 0 };
const SPEED = 125;
const TURN_RATE = 1.3;
const WEAVE = 30;
const CONTACT = 14;

/** Dark gargoyle that dives straight at the dragon: dodge it or burn it. */
export class DiverGargoyle extends Foe {
  readonly radius = 13;
  readonly score = ENEMY_SCORE;
  private readonly model = createGargoyleModel(LOOK);
  private readonly velocity = new Vector3();
  private phase = Math.random() * Math.PI * 2;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.model.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    if (this.retreating(dt)) return;
    this.phase += dt * 14;
    const desired = ctx.dragon.clone().sub(this.position).normalize().multiplyScalar(SPEED);
    desired.x += Math.sin(ctx.time * 2 + this.phase * 0.05) * WEAVE;
    desired.y += Math.cos(ctx.time * 1.6 + this.phase * 0.05) * WEAVE * 0.5;
    this.velocity.lerp(desired, Math.min(1, TURN_RATE * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.face(this.velocity);
    flapGargoyle(this.model, Math.sin(this.phase) * 0.9);

    if (this.position.distanceTo(ctx.dragon) < CONTACT) {
      ctx.hurtDragon(ENEMY_DAMAGE);
      this.health = 0;
    } else if (this.isBehind(ctx, 80)) {
      this.gone = true;
    }
  }
}
