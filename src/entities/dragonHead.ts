import { CatmullRomCurve3, Color, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, Vector3 } from 'three';
import { createLoft, profile, round, Section, shapeLoft } from './loft';
import { createSpikeGeometry, placeSpike } from './spike';

export interface HeadMaterials {
  skin: Material;
  horn: Material;
}

const BACK = new Vector3(0, 0, 1);
const DOWN = new Vector3(0, -1, 0);

function curve(points: number[][]): CatmullRomCurve3 {
  return new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
}

function loftMesh(path: CatmullRomCurve3, sectionAt: (t: number) => Section, material: Material, segments = 24, radial = 16): Mesh {
  const geometry = createLoft(segments, radial);
  shapeLoft(geometry, path, sectionAt);
  return new Mesh(geometry, material);
}

/** Wedge-shaped skull: broad at the brow, flat underneath, tapering to a blunt snout. */
function createSkull(skin: Material): Mesh {
  const width = profile([[0, 1.35], [0.2, 1.7], [0.42, 1.35], [0.7, 0.95], [0.92, 0.68], [1, 0.2]]);
  const height = profile([[0, 1.45], [0.2, 1.45], [0.42, 1.15], [0.7, 0.85], [0.92, 0.62], [1, 0.22]]);
  const ridge = profile([[0, 0.05], [0.2, 0.18], [0.45, 0.1], [1, 0.02]]);
  const path = curve([[0, 0.7, 1.4], [0, 0.85, -0.5], [0, 0.6, -2.6], [0, 0.25, -4.8], [0, 0, -6.3]]);
  return loftMesh(path, (t) => ({ width: width(t), height: height(t), bottom: 0.55, ridge: ridge(t) }), skin, 32, 20);
}

/** Lower jaw, hinged under the skull, with a row of teeth along each side. */
function createJaw(materials: HeadMaterials, teeth: Material): Group {
  const jaw = new Group();
  jaw.position.set(0, 0.45, 0.6);
  const width = profile([[0, 1.25], [0.35, 1.1], [0.75, 0.78], [1, 0.2]]);
  const height = profile([[0, 0.75], [0.35, 0.62], [0.75, 0.5], [1, 0.18]]);
  const path = curve([[0, 0, 0], [0, -0.6, -2.3], [0, -0.7, -4.4], [0, -0.5, -6]]);
  jaw.add(loftMesh(path, (t) => ({ width: width(t), height: height(t), top: 0.35 }), materials.skin, 24, 16));

  const toothGeometry = createSpikeGeometry(0.4, 0.9);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = 0.3 + i * 0.11;
      const base = path.getPoint(t).add(new Vector3(side * width(t) * 0.78, height(t) * 0.3, 0));
      const tooth = new Mesh(toothGeometry, teeth);
      placeSpike(tooth, base, new Vector3(0, 1, 0), BACK, 0.22, 0.55 + (i === 4 ? 0.35 : 0));
      jaw.add(tooth);
    }
  }
  const glow = new Mesh(new SphereGeometry(0.45, 10, 8), new MeshBasicMaterial({ color: new Color(4, 1.4, 0.3) }));
  glow.position.set(0, -0.3, -2.4);
  jaw.add(glow);
  return jaw;
}

function createHorns(horn: Material): Mesh[] {
  const horns: Mesh[] = [];
  const great = profile([[0, 0.62], [0.5, 0.33], [1, 0.03]]);
  const small = profile([[0, 0.34], [1, 0.03]]);
  for (const side of [-1, 1]) {
    horns.push(
      loftMesh(curve([[0.8 * side, 1.9, 0.7], [1.75 * side, 3.1, 2.3], [2.4 * side, 3.95, 4.7], [2.2 * side, 4.1, 7.7]]), (t) => round(great(t)), horn, 24, 10),
      loftMesh(curve([[1.3 * side, 0.9, 1], [2.5 * side, 1.2, 2.4], [3.3 * side, 1.3, 3.7]]), (t) => round(small(t)), horn, 14, 8),
    );
  }
  return horns;
}

/** Eyes, nostrils, brow spikes and the spiky frill along the jaw line. */
function createDetails(horn: Material): Mesh[] {
  const details: Mesh[] = [];
  const eyeMaterial = new MeshBasicMaterial({ color: new Color(6, 2.6, 0.5) });
  const nostrilMaterial = new MeshBasicMaterial({ color: '#050302' });
  const frillGeometry = createSpikeGeometry(0.9, 0.35);
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(1, 12, 8), eyeMaterial);
    eye.position.set(1.5 * side, 1.15, -0.9);
    eye.scale.set(0.2, 0.13, 0.36);
    eye.rotation.y = -0.35 * side;
    const nostril = new Mesh(new SphereGeometry(1, 8, 6), nostrilMaterial);
    nostril.position.set(0.3 * side, 0.55, -6);
    nostril.scale.set(0.13, 0.09, 0.2);
    details.push(eye, nostril);

    const brow = new Mesh(frillGeometry, horn);
    placeSpike(brow, new Vector3(1.2 * side, 1.6, -0.5), new Vector3(0.4 * side, 0.4, 1), DOWN, 0.5, 1.6);
    details.push(brow);
    for (const [z, length] of [[0.4, 1.7], [1.4, 2.2], [2.4, 1.6]]) {
      const frill = new Mesh(frillGeometry, horn);
      placeSpike(frill, new Vector3(1.3 * side, -0.2, z), new Vector3(0.6 * side, -0.25, 1), DOWN, 0.55, length);
      details.push(frill);
    }
  }
  return details;
}

/** The head, facing -Z, with its jaw returned separately so it can open to breathe fire. */
export function createHead(materials: HeadMaterials): { head: Group; jaw: Group } {
  const head = new Group();
  const teeth = new MeshStandardMaterial({ color: '#d6c4a2', roughness: 0.45 });
  const jaw = createJaw(materials, teeth);
  head.add(createSkull(materials.skin), jaw, ...createHorns(materials.horn), ...createDetails(materials.horn));
  return { head, jaw };
}

/** Where fire comes out, in head space. */
export const MOUTH = new Vector3(0, -0.3, -6.6);
