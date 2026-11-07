import { CatmullRomCurve3, Group, Material, Mesh, Vector3 } from 'three';
import { createLoft, profile, round, shapeLoft } from './loft';
import { createSpikeGeometry, placeSpike } from './spike';

export interface LimbMaterials {
  skin: Material;
  claw: Material;
}

const DOWN = new Vector3(0, -1, 0);
const clawGeometry = createSpikeGeometry(1.5, 0.75);

function limb(points: Vector3[], thickness: (t: number) => number, material: Material, segments: number, radial: number): Mesh {
  const geometry = createLoft(segments, radial);
  shapeLoft(geometry, new CatmullRomCurve3(points), (t) => round(thickness(t)));
  return new Mesh(geometry, material);
}

/** A toe ending in a claw that hooks downward. */
function toe(foot: Vector3, direction: Vector3, length: number, materials: LimbMaterials): Mesh[] {
  const tip = foot.clone().addScaledVector(direction, length);
  const knuckle = foot.clone().lerp(tip, 0.55).add(new Vector3(0, 0.15, 0));
  const digit = limb([foot, knuckle, tip], profile([[0, 0.36], [1, 0.17]]), materials.skin, 8, 8);
  const claw = new Mesh(clawGeometry, materials.claw);
  placeSpike(claw, tip, direction, DOWN, 0.36, 1.4);
  return [digit, claw];
}

/**
 * Hind leg hanging below the body, as in the painting: heavy thigh, knee, slender shin,
 * and a foot with three spread toes plus a dewclaw. The group pivots at the hip.
 */
export function createHindLeg(side: number, materials: LimbMaterials): Group {
  const leg = new Group();
  leg.position.set(2.4 * side, -1.2, 7.4);
  const hip = new Vector3(0, 0, 0);
  const knee = new Vector3(0.9 * side, -3.4, -1.4);
  const ankle = new Vector3(0.6 * side, -6.6, 1.4);
  const foot = new Vector3(0.35 * side, -8.2, 0.6);
  const thickness = profile([[0, 2.3], [0.18, 1.95], [0.38, 1.15], [0.48, 0.95], [0.75, 0.58], [0.88, 0.5], [1, 0.45]]);
  leg.add(limb([hip, knee, ankle, foot], thickness, materials.skin, 30, 14));
  for (const spread of [-0.45, 0, 0.45]) {
    leg.add(...toe(foot, new Vector3(spread * side, -0.55, -1).normalize(), 1.9, materials));
  }
  leg.add(...toe(foot, new Vector3(0, -0.35, 1).normalize(), 1.1, materials));
  return leg;
}

/** Foreleg folded under the chest, clawed hand pointing forward. */
export function createForeLeg(side: number, materials: LimbMaterials): Group {
  const leg = new Group();
  leg.position.set(2.0 * side, -2.4, -5.2);
  const shoulder = new Vector3(0, 0, 0);
  const elbow = new Vector3(0.7 * side, -2.0, 1.4);
  const wrist = new Vector3(0.4 * side, -2.6, -0.8);
  const hand = new Vector3(0.3 * side, -2.4, -1.8);
  const thickness = profile([[0, 1.3], [0.35, 0.75], [0.7, 0.5], [1, 0.42]]);
  leg.add(limb([shoulder, elbow, wrist, hand], thickness, materials.skin, 20, 12));
  for (const spread of [-0.4, 0, 0.4]) {
    leg.add(...toe(hand, new Vector3(spread * side, -0.3, -1).normalize(), 1.1, materials));
  }
  return leg;
}
