import { BoxGeometry, ConeGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { createRandom } from '../core/random';
import type { Landscape } from './landscape';

const VILLAGE_CENTERS = [-900, -2600, -4300, -5700];
const HOUSES_PER_VILLAGE = 40;

/** Small riverside villages whose lit windows sparkle in the dusk. */
export function createVillages(land: Landscape): Group {
  const total = VILLAGE_CENTERS.length * HOUSES_PER_VILLAGE;
  const walls = new InstancedMesh(
    new BoxGeometry(6, 5, 8),
    new MeshStandardMaterial({ color: '#8a6a52', emissive: '#ff8a3a', emissiveIntensity: 0.18, roughness: 0.9 }),
    total,
  );
  const roofs = new InstancedMesh(
    new ConeGeometry(5.6, 4.5, 4),
    new MeshStandardMaterial({ color: '#3b2622', roughness: 0.9 }),
    total,
  );
  const lights = new InstancedMesh(
    new BoxGeometry(1.4, 1.4, 0.4),
    new MeshStandardMaterial({ color: '#000000', emissive: '#ffb050', emissiveIntensity: 4 }),
    total,
  );

  const random = createRandom(99);
  const dummy = new Object3D();
  let index = 0;
  for (const centerZ of VILLAGE_CENTERS) {
    for (let i = 0; i < HOUSES_PER_VILLAGE; i++, index++) {
      const z = centerZ + (random() - 0.5) * 260;
      const side = random() < 0.5 ? -1 : 1;
      const x = land.riverX(z) + side * (34 + random() * 60);
      const y = land.terrainHeight(x, z);
      const rotation = random() * Math.PI;

      dummy.position.set(x, y + 2.5, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      walls.setMatrixAt(index, dummy.matrix);

      dummy.position.y = y + 7.2;
      dummy.rotation.y = rotation + Math.PI / 4;
      dummy.updateMatrix();
      roofs.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x + Math.sin(rotation) * 4.1, y + 2.6, z + Math.cos(rotation) * 4.1);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();
      lights.setMatrixAt(index, dummy.matrix);
    }
  }
  const group = new Group();
  group.add(walls, roofs, lights);
  return group;
}
