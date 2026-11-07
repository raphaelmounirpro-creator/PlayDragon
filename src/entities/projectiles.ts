import { BufferGeometry, Group, Material, Mesh, Vector3 } from 'three';

export interface Projectile {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
}

const FORWARD = new Vector3(0, 1, 0);

/** A pool of projectiles of one kind (fireballs, stones, quarrels…) that leave a trail. */
export class Projectiles {
  readonly group = new Group();
  readonly items: Projectile[] = [];

  /** `orient` aligns the mesh's +Y axis with the flight direction (arrows, quarrels). */
  constructor(
    private readonly geometry: BufferGeometry,
    private readonly material: Material,
    private readonly trail: (position: Vector3, velocity: Vector3) => void,
    private readonly orient = false,
  ) {}

  spawn(position: Vector3, velocity: Vector3, life: number): Projectile {
    const mesh = new Mesh(this.geometry, this.material);
    mesh.position.copy(position);
    this.group.add(mesh);
    const projectile = { mesh, velocity: velocity.clone(), life };
    this.items.push(projectile);
    return projectile;
  }

  update(dt: number): void {
    for (const item of [...this.items]) {
      item.life -= dt;
      if (item.life <= 0) {
        this.remove(item);
        continue;
      }
      item.mesh.position.addScaledVector(item.velocity, dt);
      if (this.orient) item.mesh.quaternion.setFromUnitVectors(FORWARD, item.velocity.clone().normalize());
      else item.mesh.rotation.x += dt * 4;
      this.trail(item.mesh.position, item.velocity);
    }
  }

  remove(item: Projectile): void {
    this.group.remove(item.mesh);
    this.items.splice(this.items.indexOf(item), 1);
  }

  clear(): void {
    for (const item of [...this.items]) this.remove(item);
  }
}
