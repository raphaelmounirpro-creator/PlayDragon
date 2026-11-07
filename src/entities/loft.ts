import { BufferAttribute, BufferGeometry, Curve, Vector3 } from 'three';

/**
 * Cross-section of a lofted shape: an ellipse that can be flattened on top or underneath,
 * with an optional sharp crest on top (dorsal ridge) and a rounded bulge underneath (keel).
 */
export interface Section {
  width: number;
  height: number;
  /** Scale of the upper half (< 1 flattens the top, e.g. a lower jaw). */
  top?: number;
  /** Scale of the lower half (< 1 flattens the underside, e.g. a skull). */
  bottom?: number;
  /** Crest along the top, as a fraction of the height. */
  ridge?: number;
  /** Bulge along the underside, as a fraction of the height. */
  keel?: number;
}

export function round(radius: number): Section {
  return { width: radius, height: radius };
}

const HALF_PI = Math.PI / 2;
const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_FORWARD = new Vector3(0, 0, -1);

/** Empty lofted surface (rings of vertices along a curve), shaped later by `shapeLoft`. */
export function createLoft(segments: number, radialSegments: number): BufferGeometry {
  const ring = radialSegments + 1;
  const vertexCount = (segments + 1) * ring;
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(vertexCount * 3), 3));

  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  for (let s = 0; s <= segments; s++) {
    for (let r = 0; r <= radialSegments; r++) {
      uvs.set([r / radialSegments, s / segments], (s * ring + r) * 2);
      if (s < segments && r < radialSegments) {
        const a = s * ring + r;
        indices.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
      }
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.userData = { segments, radialSegments };
  return geometry;
}

const point = new Vector3();
const tangent = new Vector3();
const previousTangent = new Vector3();
const side = new Vector3();
const up = new Vector3();
const axis = new Vector3();

/**
 * Sweeps the cross-sections along `curve`. Frames are parallel-transported from the first ring,
 * so the sections never twist, even where the curve turns vertical (legs) or bends (tail).
 */
export function shapeLoft(geometry: BufferGeometry, curve: Curve<Vector3>, sectionAt: (t: number) => Section): void {
  const positions = geometry.attributes.position as BufferAttribute;
  const { segments, radialSegments } = geometry.userData as { segments: number; radialSegments: number };

  for (let s = 0; s <= segments; s++) {
    const t = s / segments;
    curve.getPoint(t, point);
    curve.getTangent(t, tangent).normalize();
    if (s === 0) {
      side.crossVectors(tangent, Math.abs(tangent.y) > 0.9 ? WORLD_FORWARD : WORLD_UP).normalize();
      up.crossVectors(side, tangent).normalize();
    } else {
      transportFrame();
    }
    previousTangent.copy(tangent);
    writeRing(positions, s * (radialSegments + 1), radialSegments, sectionAt(t));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/** Rotates the frame by the turn between the previous and the current tangent. */
function transportFrame(): void {
  axis.crossVectors(previousTangent, tangent);
  const sine = axis.length();
  if (sine < 1e-6) return;
  axis.divideScalar(sine);
  const angle = Math.atan2(sine, previousTangent.dot(tangent));
  side.applyAxisAngle(axis, angle);
  up.applyAxisAngle(axis, angle);
}

function writeRing(positions: BufferAttribute, start: number, radialSegments: number, section: Section): void {
  const ridge = section.ridge ?? 0;
  const keel = section.keel ?? 0;
  for (let r = 0; r <= radialSegments; r++) {
    const angle = (r / radialSegments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const crest = ridge * Math.exp(-((angle - HALF_PI) ** 2) / 0.05);
    const belly = keel * Math.exp(-((angle - 3 * HALF_PI) ** 2) / 0.4);
    const x = cos * section.width;
    const y = sin * section.height * (sin >= 0 ? section.top ?? 1 : section.bottom ?? 1) + (crest - belly) * section.height;
    positions.setXYZ(
      start + r,
      point.x + side.x * x + up.x * y,
      point.y + side.y * x + up.y * y,
      point.z + side.z * x + up.z * y,
    );
  }
}

/** Smooth profile through [t, value] keys (eased between keys), used for sizes along a loft. */
export function profile(keys: Array<[number, number]>): (t: number) => number {
  return (t: number) => {
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = (t - t0) / (t1 - t0);
        return v0 + (v1 - v0) * k * k * (3 - 2 * k);
      }
    }
    return keys[keys.length - 1][1];
  };
}
