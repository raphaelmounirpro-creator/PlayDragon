import { MathUtils, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { AIM_ASSIST, FIREBALL_SPEED } from '../config';
import type { Foe, Foes } from '../entities/foes/foe';
import type { Castle } from '../world/castle';

/** Where a shot aimed at the empty sky is headed. */
const AIM_DISTANCE = 1400;
const ASSIST_COS = { mouse: Math.cos(MathUtils.degToRad(AIM_ASSIST.mouseDegrees)), pad: Math.cos(MathUtils.degToRad(AIM_ASSIST.padDegrees)) };

export type AssistMode = 'off' | 'mouse' | 'pad';

/** Turns the crosshair into a point in the world; the aim assist nudges it onto a nearby enemy. */
export class Aim {
  private readonly raycaster = new Raycaster();

  constructor(private readonly camera: PerspectiveCamera) {}

  /** `from` is the dragon's mouth: an assisted shot leads a moving enemy by the fireball's travel time. */
  target(pointer: Vector2, from: Vector3, foes: Foes, castle: Castle | null, assist: AssistMode): Vector3 {
    this.raycaster.setFromCamera(pointer, this.camera);
    const helped = assist === 'off' ? undefined : this.closestToCrosshair(foes, ASSIST_COS[assist]);
    if (helped) return helped.position.clone().addScaledVector(helped.velocity, helped.position.distanceTo(from) / FIREBALL_SPEED);
    const hit = castle ? this.raycaster.intersectObject(castle.group, true).find((h) => h.object.visible) : undefined;
    return hit ? hit.point : this.raycaster.ray.at(AIM_DISTANCE, new Vector3());
  }

  private closestToCrosshair(foes: Foes, minCos: number): Foe | undefined {
    const ray = this.raycaster.ray;
    let best: Foe | undefined;
    let bestCos = minCos;
    for (const foe of foes.items) {
      if (!foe.alive || !foe.canBeHurt()) continue;
      const toFoe = foe.position.clone().sub(ray.origin);
      const distance = toFoe.length();
      if (distance > AIM_ASSIST.range) continue;
      const cos = toFoe.divideScalar(distance).dot(ray.direction);
      if (cos > bestCos) {
        bestCos = cos;
        best = foe;
      }
    }
    return best;
  }
}
