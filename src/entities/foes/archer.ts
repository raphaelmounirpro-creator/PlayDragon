import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { ARCHER } from '../../config';
import type { Post } from '../../world/castle';
import { Foe, FoeContext } from './foe';

interface SoldierKit {
  body: CylinderGeometry;
  head: SphereGeometry;
  helmet: ConeGeometry;
  stock: BoxGeometry;
  bow: BoxGeometry;
  tabard: MeshStandardMaterial;
  skin: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  wood: MeshStandardMaterial;
}

let kit: SoldierKit | null = null;

function soldierKit(): SoldierKit {
  kit ??= {
    body: new CylinderGeometry(0.9, 1.2, 3.2, 8),
    head: new SphereGeometry(0.7, 10, 8),
    helmet: new ConeGeometry(0.85, 1.1, 8),
    stock: new BoxGeometry(0.4, 0.4, 2.6),
    bow: new BoxGeometry(2.6, 0.2, 0.25),
    tabard: new MeshStandardMaterial({ color: '#5a1a14', roughness: 0.9 }),
    skin: new MeshStandardMaterial({ color: '#9a6a52', roughness: 0.8 }),
    metal: new MeshStandardMaterial({ color: '#8a8a8a', roughness: 0.4, metalness: 0.8 }),
    wood: new MeshStandardMaterial({ color: '#3a2618', roughness: 0.8 }),
  };
  return kit;
}

/** Crossbowman on the castle walls: shoots quarrels at the dragon during the siege. */
export class Archer extends Foe {
  readonly radius = 9;
  readonly score = ARCHER.score;
  private readonly aim = new Group();
  private reload = Math.random() * ARCHER.reloadSpread + 1;
  private active = false;

  constructor(post: Post) {
    super(1);
    const k = soldierKit();
    const figure = new Group();
    figure.scale.setScalar(1.8);
    const body = new Mesh(k.body, k.tabard);
    body.position.y = 1.6;
    const head = new Mesh(k.head, k.skin);
    head.position.y = 3.7;
    const helmet = new Mesh(k.helmet, k.metal);
    helmet.position.y = 4.3;
    this.aim.position.set(0, 2.6, -0.6);
    const bow = new Mesh(k.bow, k.wood);
    bow.position.z = -1.2;
    this.aim.add(new Mesh(k.stock, k.wood), bow);
    figure.add(body, head, helmet, this.aim);
    this.object.add(figure);
    this.position.copy(post.position);
  }

  /** Starts shooting once the siege begins. */
  activate(): void {
    this.active = true;
  }

  update(dt: number, ctx: FoeContext): void {
    const toDragon = ctx.dragon.clone().sub(this.position);
    this.face(toDragon.clone().setY(0));
    this.aim.rotation.x = Math.atan2(toDragon.y, Math.hypot(toDragon.x, toDragon.z)) * 0.8;
    if (!this.active || toDragon.length() > ARCHER.range) return;
    this.reload -= dt * ctx.difficulty.enemyFireRate;
    if (this.reload <= 0) {
      this.reload = ARCHER.reloadMin + Math.random() * ARCHER.reloadSpread;
      ctx.fire('quarrel', this.object.localToWorld(new Vector3(0, 4.7, -3)), ctx.dragon);
      ctx.cue('twang');
    }
  }
}
