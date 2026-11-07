import { CanvasTexture, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import { smoothstep, valueNoise } from '../core/noise';
import { createRandom } from '../core/random';

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  return [canvas, context];
}

function toTexture(canvas: HTMLCanvasElement, srgb = true): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  if (srgb) texture.colorSpace = SRGBColorSpace;
  return texture;
}

function fbm(x: number, y: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 5; i++) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / 0.97;
}

/** Billowing cumulus silhouette with a flat base, as a density map in [0, 1]. */
function cloudDensity(size: number, seed: number): Float32Array {
  const density = new Float32Array(size * size);
  const offsetX = seed * 17.31;
  const offsetY = seed * 5.77;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const dx = (u - 0.5) / 0.46;
      const dy = (v - 0.62) / 0.36;
      const shape = 1 - Math.sqrt(dx * dx + dy * dy);
      const billow = fbm(u * 6 + offsetX, v * 6 + offsetY);
      const flatBase = 1 - smoothstep(0.7, 0.86, v);
      density[y * size + x] = smoothstep(0.02, 0.3, shape + (billow - 0.5) * 0.95) * flatBase;
    }
  }
  return density;
}

/**
 * Painterly cumulus backlit by a low sun: dark umber body,
 * molten gold where light grazes the upper crests.
 */
export function createCloudTexture(seed: number): Texture {
  const size = 256;
  const [canvas, context] = createCanvas(size, size);
  const density = cloudDensity(size, seed);
  const image = context.createImageData(size, size);
  const sample = (x: number, y: number) => (y < 0 ? 0 : density[y * size + x]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = density[y * size + x];
      const occlusion = (sample(x, y - 5) + sample(x, y - 11) + sample(x, y - 20)) / 3;
      const light = 1 - occlusion;
      const rim = Math.pow(light, 2.5) * (0.4 + 0.6 * (1 - d));
      const index = (y * size + x) * 4;
      image.data[index] = Math.min(255, 62 + 120 * light + 190 * rim);
      image.data[index + 1] = Math.min(255, 26 + 52 * light + 150 * rim);
      image.data[index + 2] = Math.min(255, 22 + 22 * light + 90 * rim);
      image.data[index + 3] = 255 * d;
    }
  }
  context.putImageData(image, 0, 0);
  return toTexture(canvas);
}

/** Soft round glow used by fire, sparks, smoke and the sun haze. */
export function createGlowTexture(): Texture {
  const size = 128;
  const [canvas, context] = createCanvas(size, size);
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return toTexture(canvas);
}

/** Overlapping dark scales, used as bump and color detail on the dragon's hide. */
const HIDE_WIDTH = 512; // around the body (u)
const HIDE_LENGTH = 256; // along the body (v), repeated
const SCALE_SIZE = 16;
const BELLY_START = 0.62; // the underside of a loft sits around u = 0.75
const BELLY_END = 0.88;

/** One overlapping scale whose rounded free edge points toward the tail (+y). */
function drawScale(context: CanvasRenderingContext2D, x: number, y: number): void {
  const half = SCALE_SIZE * 0.62;
  const gradient = context.createRadialGradient(x, y + 2, 1, x, y + 4, half * 1.3);
  gradient.addColorStop(0, '#5f4636');
  gradient.addColorStop(0.65, '#33241c');
  gradient.addColorStop(1, '#1b130f');
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(x - half, y);
  context.quadraticCurveTo(x - half, y + SCALE_SIZE * 1.05, x, y + SCALE_SIZE * 1.1);
  context.quadraticCurveTo(x + half, y + SCALE_SIZE * 1.05, x + half, y);
  context.closePath();
  context.fill();
}

/** Broad ventral plates running across the belly. */
function drawBellyPlates(context: CanvasRenderingContext2D): void {
  const left = BELLY_START * HIDE_WIDTH;
  const right = BELLY_END * HIDE_WIDTH;
  for (let y = 0; y < HIDE_LENGTH; y += SCALE_SIZE) {
    const gradient = context.createLinearGradient(0, y, 0, y + SCALE_SIZE);
    gradient.addColorStop(0, '#6b5341');
    gradient.addColorStop(0.75, '#3a2b20');
    gradient.addColorStop(1, '#140e0a');
    context.fillStyle = gradient;
    context.fillRect(left, y, right - left, SCALE_SIZE - 1);
  }
  // Soft transition between plates and flank scales.
  for (const [from, to] of [[left - 14, left + 10], [right + 14, right - 10]]) {
    const fade = context.createLinearGradient(from, 0, to, 0);
    fade.addColorStop(0, 'rgba(18,12,9,0)');
    fade.addColorStop(0.5, 'rgba(18,12,9,0.75)');
    fade.addColorStop(1, 'rgba(18,12,9,0)');
    context.fillStyle = fade;
    context.fillRect(Math.min(from, to), 0, Math.abs(to - from), HIDE_LENGTH);
  }
}

/**
 * Dragon hide wrapped around a loft: overlapping scales on the back and flanks,
 * ventral plates along the belly, a darker stripe along the dorsal crest. Tiles seamlessly.
 */
export function createHideTexture(): Texture {
  const [canvas, context] = createCanvas(HIDE_WIDTH, HIDE_LENGTH);
  context.fillStyle = '#1d1410';
  context.fillRect(0, 0, HIDE_WIDTH, HIDE_LENGTH);
  // Rows nearer the head are drawn last so their free edges overlap the next row.
  for (let row = HIDE_LENGTH / SCALE_SIZE; row >= -1; row--) {
    const offset = (row & 1) * SCALE_SIZE * 0.5;
    for (let x = -SCALE_SIZE; x <= HIDE_WIDTH + SCALE_SIZE; x += SCALE_SIZE) drawScale(context, x + offset, row * SCALE_SIZE);
  }
  drawBellyPlates(context);
  const crest = context.createLinearGradient(0.25 * HIDE_WIDTH - 14, 0, 0.25 * HIDE_WIDTH + 14, 0);
  crest.addColorStop(0, 'rgba(8,5,4,0)');
  crest.addColorStop(0.5, 'rgba(8,5,4,0.55)');
  crest.addColorStop(1, 'rgba(8,5,4,0)');
  context.fillStyle = crest;
  context.fillRect(0.25 * HIDE_WIDTH - 14, 0, 28, HIDE_LENGTH);

  const texture = toTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Weathered ashlar masonry for the castle. */
export function createStoneTexture(): Texture {
  const size = 256;
  const [canvas, context] = createCanvas(size, size);
  const random = createRandom(3);
  context.fillStyle = '#4a3a33';
  context.fillRect(0, 0, size, size);
  const rowHeight = 21;
  for (let row = 0; row * rowHeight < size; row++) {
    let x = row % 2 === 0 ? 0 : -18;
    while (x < size) {
      const width = 30 + random() * 26;
      const shade = 120 + Math.floor(random() * 50);
      context.fillStyle = `rgb(${shade},${Math.floor(shade * 0.84)},${Math.floor(shade * 0.72)})`;
      context.fillRect(x + 1.5, row * rowHeight + 1.5, width - 3, rowHeight - 3);
      x += width;
    }
  }
  const texture = toTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** A bone of the wing in its rest pose, seen from above: [x1, z1, x2, z2]. */
export type WingBone2D = [number, number, number, number];

function distanceToSegment(x: number, z: number, [x1, z1, x2, z2]: WingBone2D): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const k = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - x1 - dx * k, z - z1 - dz * k);
}

/**
 * Leathery wing membrane painted from the wing's own bones: thick and dark along the
 * fingers, thinner and warmer in the middle of each panel (where the sun shines through),
 * with dark veins and glints of ember light. `toRest` maps texture (u, v) to rest (x, z).
 */
export function createMembraneTexture(bones: WingBone2D[], toRest: (u: number, v: number) => [number, number]): Texture {
  const size = 512;
  const [canvas, context] = createCanvas(size, size);
  const random = createRandom(7);
  const image = context.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // CanvasTexture is flipped: the top canvas row is v = 1.
      const [x, z] = toRest(px / size, 1 - py / size);
      let distance = Infinity;
      for (const bone of bones) distance = Math.min(distance, distanceToSegment(x, z, bone));
      const panel = smoothstep(0.6, 6, distance) * (0.85 + 0.15 * valueNoise(x * 0.4, z * 0.4));
      const index = (py * size + px) * 4;
      image.data[index] = 24 + 136 * panel;
      image.data[index + 1] = 12 + 88 * panel;
      image.data[index + 2] = 9 + 36 * panel;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  context.strokeStyle = 'rgba(12,6,4,0.55)';
  for (let i = 0; i < 45; i++) {
    let x = random() * size;
    let y = random() * size;
    context.lineWidth = 0.6 + random() * 1.8;
    context.beginPath();
    context.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (random() - 0.5) * 40;
      y += (random() - 0.3) * 40;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const alpha = 0.15 + random() * 0.5;
    context.fillStyle = `rgba(255,${140 + Math.floor(random() * 80)},70,${alpha})`;
    context.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
  return toTexture(canvas);
}
