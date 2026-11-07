import { BufferAttribute, Color, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { PATH_LENGTH } from '../config';
import { smoothstep, valueNoise } from '../core/noise';
import type { Landscape } from './landscape';
import type { TerrainStyle } from './levels';

const WIDTH = 7000;
const DEPTH = PATH_LENGTH + 2600;
const CENTER_Z = -PATH_LENGTH / 2 + 300;

/** Mountains and valley as one large displaced plane with painted vertex colors. */
export function createTerrain(land: Landscape, style: TerrainStyle): Mesh {
  const meadow = new Color(style.meadow);
  const forest = new Color(style.forest);
  const rock = new Color(style.rock);
  const ridge = new Color(style.ridge);
  const peak = new Color(style.peak);
  const colorAt = (x: number, z: number, height: number, slope: number): Color => {
    const color = meadow.clone().lerp(forest, smoothstep(0.3, 0.7, valueNoise(x * 0.02, z * 0.02)));
    color.lerp(rock, smoothstep(40, 160, height) * 0.8 + slope * 0.5);
    color.lerp(ridge, smoothstep(220, 420, height));
    color.lerp(peak, smoothstep(480, 640, height) * 0.7);
    return color;
  };

  const geometry = new PlaneGeometry(WIDTH, DEPTH, 420, 820);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, CENTER_Z);
  const positions = geometry.attributes.position as BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    const x = positions.getX(i) + land.riverX(z) * 0.5;
    positions.setX(i, x);
    positions.setY(i, land.terrainHeight(x, z));
  }
  geometry.computeVertexNormals();

  const normals = geometry.attributes.normal as BufferAttribute;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const color = colorAt(positions.getX(i), positions.getZ(i), positions.getY(i), 1 - normals.getY(i));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
}
