import { BufferAttribute, ConeGeometry, Matrix4, Object3D, Vector3 } from 'three';

/**
 * A blade that curls backward and is flattened sideways: dorsal spikes, claws, frills.
 * Base at the origin, tip at +Y (length 1), curling toward +Z. The curl is scaled by the
 * spike's width when placed, so slender claws need a larger `curl` than stocky spikes.
 */
export function createSpikeGeometry(curl: number, flatten: number): ConeGeometry {
  const geometry = new ConeGeometry(0.5, 1, 8, 6);
  geometry.translate(0, 0.5, 0);
  const positions = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    positions.setX(i, positions.getX(i) * flatten);
    positions.setZ(i, positions.getZ(i) + curl * y * y);
  }
  geometry.computeVertexNormals();
  return geometry;
}

const basisX = new Vector3();
const basisY = new Vector3();
const basisZ = new Vector3();

/**
 * Matrix placing a spike at `position`, pointing along `direction`, curling toward `curlToward`,
 * `width` thick and `length` long.
 */
export function spikeMatrix(
  target: Matrix4,
  position: Vector3,
  direction: Vector3,
  curlToward: Vector3,
  width: number,
  length: number,
): Matrix4 {
  basisY.copy(direction).normalize();
  basisZ.copy(curlToward).addScaledVector(basisY, -curlToward.dot(basisY)).normalize();
  basisX.crossVectors(basisY, basisZ);
  target.makeBasis(basisX.multiplyScalar(width), basisY.multiplyScalar(length), basisZ.multiplyScalar(width));
  return target.setPosition(position);
}

/** Same placement for a single mesh. */
export function placeSpike(
  object: Object3D,
  position: Vector3,
  direction: Vector3,
  curlToward: Vector3,
  width: number,
  length: number,
): void {
  object.matrixAutoUpdate = false;
  spikeMatrix(object.matrix, position, direction, curlToward, width, length);
}
