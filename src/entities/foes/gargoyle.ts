import { Color, Vector3 } from 'three';
import { GARGOYLE } from '../../config';
import { Foe, FoeContext } from './foe';
import { GargoyleLook, GargoyleModel } from './gargoyleModel';

const LOOK: GargoyleLook = { skin: '#2b1a1e', membrane: '#7a5050', eyes: new Color(6, 0.6, 0.3), size: 1.7, ember: 0 };

/** Dark gargoyle that dives straight at the dragon: dodge it or burn it. */
export class DiverGargoyle extends Foe {
  readonly radius = 13;
  readonly score = GARGOYLE.score;
  override readonly indicator = 'enemy';
  private readonly model = new GargoyleModel(LOOK);
  private readonly heading = new Vector3();
  private phase = Math.random() * Math.PI * 2;

  constructor(position: Vector3, health: number) {
    super(health);
    this.object.add(this.model.root);
    this.position.copy(position);
  }

  update(dt: number, ctx: FoeContext): void {
    if (this.retreating(dt)) return;
    this.phase += dt * 12;
    const desired = ctx.dragon.clone().sub(this.position).normalize().multiplyScalar(GARGOYLE.speed);
    desired.x += Math.sin(ctx.time * 2 + this.phase * 0.05) * GARGOYLE.weave;
    desired.y += Math.cos(ctx.time * 1.6 + this.phase * 0.05) * GARGOYLE.weave * 0.5;
    this.heading.lerp(desired, Math.min(1, GARGOYLE.turnRate * dt));
    this.position.addScaledVector(this.heading, dt);
    this.face(this.heading);
    this.model.pose(Math.sin(this.phase) * 0.7 + 0.1);

    if (this.position.distanceTo(ctx.dragon) < GARGOYLE.contactRange) {
      ctx.hurtDragon(GARGOYLE.contactDamage);
      this.health = 0;
    } else if (this.isBehind(ctx, 80)) {
      this.gone = true;
    }
  }
}
