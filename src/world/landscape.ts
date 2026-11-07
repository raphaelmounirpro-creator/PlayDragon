import { CatmullRomCurve3, Vector3 } from 'three';
import { FLIGHT_ALTITUDE, PATH_LENGTH } from '../config';
import { ridgedNoise, smoothstep } from '../core/noise';
import type { TerrainStyle } from './levels';

const CASTLE_HILL_HEIGHT = 160;
const DESCENT = 140;

/** The shape of one level's land: winding river, mountains, castle hill and the dragon's route. */
export class Landscape {
  private readonly castle: Vector3;

  constructor(private readonly style: TerrainStyle) {
    const z = -PATH_LENGTH;
    this.castle = new Vector3(this.riverX(z) + 40, CASTLE_HILL_HEIGHT, z);
  }

  /** Lateral position of the river (and of the dragon's route) at depth z. */
  riverX(z: number): number {
    const r = this.style.river;
    return r.amplitude1 * Math.sin(z * r.frequency1) + r.amplitude2 * Math.sin(z * r.frequency2 + r.phase);
  }

  castlePosition(): Vector3 {
    return this.castle.clone();
  }

  /** Terrain height: a river valley carved through ridged mountains, with a hill for the castle. */
  terrainHeight(x: number, z: number): number {
    const seed = this.style.seed;
    const distanceToRiver = Math.abs(x - this.riverX(z));
    const mountains =
      ridgedNoise(x * 0.0014 + seed, z * 0.0014 - seed) * this.style.mountainHeight +
      ridgedNoise(x * 0.006 + seed, z * 0.006, 3) * 50;
    const valleyMask = smoothstep(70, 620, distanceToRiver);
    const valleyFloor = 6 + smoothstep(20, 70, distanceToRiver) * 14;
    const height = valleyFloor + (mountains + 30) * valleyMask;

    const distanceToCastle = Math.hypot(x - this.castle.x, z - this.castle.z);
    const hill = (1 - smoothstep(60, 380, distanceToCastle)) * CASTLE_HILL_HEIGHT;
    // Open basin around the castle so the dragon can fly all the way around it.
    const arena = 1 - smoothstep(560, 1000, distanceToCastle);
    const flattened = height + (valleyFloor + 10 - height) * arena;
    return Math.max(flattened, hill);
  }

  /** The smooth curve the dragon follows, high above the river, descending toward the castle. */
  createFlightCurve(): CatmullRomCurve3 {
    const points: Vector3[] = [];
    for (let z = 200; z >= -PATH_LENGTH; z -= 200) {
      const descent = smoothstep(-PATH_LENGTH + 1800, -PATH_LENGTH + 500, z) * DESCENT;
      points.push(new Vector3(this.riverX(z), FLIGHT_ALTITUDE - descent, z));
    }
    return new CatmullRomCurve3(points);
  }
}
