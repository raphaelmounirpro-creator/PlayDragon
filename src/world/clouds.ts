import { Color, Group, Sprite, SpriteMaterial, Texture } from 'three';
import { PATH_LENGTH } from '../config';
import { createRandom } from '../core/random';
import { createCloudTexture } from '../fx/textures';
import type { Landscape } from './landscape';

interface CloudLayer {
  count: number;
  minOffset: number;
  maxOffset: number;
  minHeight: number;
  maxHeight: number;
  minSize: number;
  maxSize: number;
  tint: string;
}

const LAYERS: CloudLayer[] = [
  // Sea of clouds pooling in the side valleys, below the dragon
  { count: 240, minOffset: 120, maxOffset: 2400, minHeight: 140, maxHeight: 300, minSize: 280, maxSize: 700, tint: '#ffffff' },
  // Towering cumulus walls along the horizon
  { count: 80, minOffset: 1200, maxOffset: 3200, minHeight: 380, maxHeight: 820, minSize: 900, maxSize: 1600, tint: '#ffe6cc' },
  // Wisps the dragon flies through
  { count: 50, minOffset: 0, maxOffset: 260, minHeight: 330, maxHeight: 470, minSize: 120, maxSize: 260, tint: '#ffd9b8' },
];

/** Sky stays open above the castle hill so the target is always readable. */
const CASTLE_CLEARING = 650;

let sharedTextures: Texture[] | null = null;

/** The cloud paintings are the same in every level (only their tint changes), so they are made once. */
function cloudTextures(): Texture[] {
  if (!sharedTextures) {
    sharedTextures = [11, 23, 37, 51].map(createCloudTexture);
    for (const texture of sharedTextures) texture.userData.shared = true;
  }
  return sharedTextures;
}

function createLayer(layer: CloudLayer, land: Landscape, levelTint: Color, random: () => number): Sprite[] {
  const sprites: Sprite[] = [];
  const castle = land.castlePosition();
  const textures = cloudTextures();
  const tint = new Color(layer.tint).multiply(levelTint);
  for (let i = 0; i < layer.count; i++) {
    const z = 600 - random() * (PATH_LENGTH + 1800);
    const side = random() < 0.5 ? -1 : 1;
    const x = land.riverX(z) + side * (layer.minOffset + random() * (layer.maxOffset - layer.minOffset));
    const y = layer.minHeight + random() * (layer.maxHeight - layer.minHeight);
    const size = layer.minSize + random() * (layer.maxSize - layer.minSize);
    const texture = textures[Math.floor(random() * textures.length)];
    const opacity = 0.75 + random() * 0.25;
    if (Math.hypot(x - castle.x, z - castle.z) < CASTLE_CLEARING + size / 2) continue;

    const material = new SpriteMaterial({ map: texture, color: tint, transparent: true, depthWrite: false, fog: true, opacity });
    const sprite = new Sprite(material);
    sprite.position.set(x, y, z);
    sprite.scale.set(size * 1.6, size, 1);
    sprites.push(sprite);
  }
  return sprites;
}

export function createClouds(land: Landscape, tint: string): Group {
  const group = new Group();
  const random = createRandom(42);
  const levelTint = new Color(tint);
  for (const layer of LAYERS) group.add(...createLayer(layer, land, levelTint, random));
  return group;
}
