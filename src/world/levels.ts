import { Color, Vector3 } from 'three';

/** Colors of the sky dome; HDR values so the bloom pass makes the sun or moon glow. */
export interface SkyPalette {
  zenith: Color;
  upper: Color;
  horizon: Color;
  below: Color;
  /** Tight glow right around the sun (or moon), then the wider halo. */
  glow: Color;
  halo: Color;
  disc: Color;
  discInner: number;
  discOuter: number;
  cloudShadow: Color;
  cloudLight: Color;
  cloudRim: Color;
  cloudThin: Color;
  /** 0 by day, 1 for a starry night. */
  stars: number;
}

export interface Lighting {
  key: string;
  keyIntensity: number;
  fill: string;
  fillIntensity: number;
  sky: string;
  ground: string;
  ambientIntensity: number;
  exposure: number;
  environment: number;
}

export interface RiverShape {
  amplitude1: number;
  frequency1: number;
  amplitude2: number;
  frequency2: number;
  phase: number;
}

export interface TerrainStyle {
  seed: number;
  mountainHeight: number;
  river: RiverShape;
  meadow: string;
  forest: string;
  rock: string;
  ridge: string;
  peak: string;
}

export interface CastleLayout {
  halfSize: number;
  towerHeight: number;
  /** Extra towers in the middle of the side walls. */
  sideTowers: boolean;
  keepHeight: number;
  towerHp: number;
  keepHp: number;
  archers: number;
  /** A mage shields the keep until every tower has fallen. */
  mage: boolean;
  stone: string;
  roof: string;
}

export type VoyageEventType = 'gargoyles' | 'shooters' | 'bats' | 'wyvern' | 'guardian';

/** Something that happens once the journey reaches `at` (0 = start, 1 = castle). */
export interface VoyageEvent {
  at: number;
  type: VoyageEventType;
  count: number;
}

export interface LevelDefinition {
  name: string;
  tagline: string;
  sunDirection: Vector3;
  sky: SkyPalette;
  fog: { color: string; near: number; far: number };
  lighting: Lighting;
  terrain: TerrainStyle;
  water: { color: string; glow: string };
  cloudTint: string;
  castle: CastleLayout;
  events: VoyageEvent[];
}

const rgb = (r: number, g: number, b: number) => new Color(r, g, b);
const event = (at: number, type: VoyageEventType, count = 1): VoyageEvent => ({ at, type, count });

const SUNSET_VALLEY: LevelDefinition = {
  name: 'La vallée du couchant',
  tagline: 'Au coucher du soleil',
  sunDirection: new Vector3(0.1, 0.07, -1).normalize(),
  sky: {
    zenith: rgb(0.16, 0.07, 0.08),
    upper: rgb(0.55, 0.2, 0.09),
    horizon: rgb(1.15, 0.46, 0.14),
    below: rgb(0.45, 0.16, 0.08),
    glow: rgb(1.53, 0.86, 0.32),
    halo: rgb(0.5, 0.2, 0.05),
    disc: rgb(7, 5, 2.6),
    discInner: 0.9975,
    discOuter: 0.9984,
    cloudShadow: rgb(0.2, 0.07, 0.05),
    cloudLight: rgb(0.75, 0.3, 0.1),
    cloudRim: rgb(1.5, 0.8, 0.3),
    cloudThin: rgb(0.6, 0.25, 0.08),
    stars: 0,
  },
  fog: { color: '#b85a30', near: 500, far: 6500 },
  lighting: {
    key: '#ffb27a',
    keyIntensity: 3.2,
    fill: '#9a7fb0',
    fillIntensity: 0.9,
    sky: '#ffb27a',
    ground: '#3a2030',
    ambientIntensity: 0.9,
    exposure: 0.9,
    environment: 0.55,
  },
  terrain: {
    seed: 0,
    mountainHeight: 540,
    river: { amplitude1: 260, frequency1: 0.0011, amplitude2: 110, frequency2: 0.0029, phase: 1.3 },
    meadow: '#3d4a2a',
    forest: '#24301f',
    rock: '#5a4038',
    ridge: '#8a5a44',
    peak: '#c98e68',
  },
  water: { color: '#ffd29a', glow: '#ff9a4a' },
  cloudTint: '#ffffff',
  castle: { halfSize: 62, towerHeight: 72, sideTowers: false, keepHeight: 96, towerHp: 3, keepHp: 6, archers: 4, mage: false, stone: '#d9c2ae', roof: '#2d2a36' },
  events: [
    event(0.05, 'gargoyles', 3),
    event(0.15, 'bats', 16),
    event(0.26, 'gargoyles', 4),
    event(0.36, 'shooters', 2),
    event(0.48, 'wyvern'),
    event(0.58, 'gargoyles', 5),
    event(0.66, 'bats', 20),
    event(0.74, 'shooters', 3),
    event(0.84, 'guardian'),
  ],
};

const AMBER_PEAKS: LevelDefinition = {
  name: 'Les cimes d’ambre',
  tagline: 'Dans la lumière dorée',
  sunDirection: new Vector3(-0.28, 0.13, -1).normalize(),
  sky: {
    zenith: rgb(0.22, 0.13, 0.1),
    upper: rgb(0.72, 0.38, 0.15),
    horizon: rgb(1.25, 0.68, 0.27),
    below: rgb(0.5, 0.24, 0.1),
    glow: rgb(1.6, 1.1, 0.5),
    halo: rgb(0.55, 0.32, 0.1),
    disc: rgb(8, 6.5, 3.6),
    discInner: 0.9978,
    discOuter: 0.9986,
    cloudShadow: rgb(0.26, 0.12, 0.06),
    cloudLight: rgb(0.85, 0.45, 0.15),
    cloudRim: rgb(1.6, 1.0, 0.4),
    cloudThin: rgb(0.6, 0.35, 0.12),
    stars: 0,
  },
  fog: { color: '#c47e40', near: 500, far: 6500 },
  lighting: {
    key: '#ffc88a',
    keyIntensity: 3.4,
    fill: '#a08aa0',
    fillIntensity: 0.8,
    sky: '#ffc48a',
    ground: '#3a2a20',
    ambientIntensity: 0.95,
    exposure: 0.88,
    environment: 0.6,
  },
  terrain: {
    seed: 37.5,
    mountainHeight: 640,
    river: { amplitude1: 300, frequency1: 0.0009, amplitude2: 140, frequency2: 0.0024, phase: 0.4 },
    meadow: '#4a4a28',
    forest: '#2c3320',
    rock: '#6a4a36',
    ridge: '#9a6a48',
    peak: '#e0b48a',
  },
  water: { color: '#ffe2a8', glow: '#ffb35a' },
  cloudTint: '#fff2dd',
  castle: { halfSize: 74, towerHeight: 80, sideTowers: true, keepHeight: 112, towerHp: 3, keepHp: 7, archers: 6, mage: true, stone: '#cdb594', roof: '#3a2a30' },
  events: [
    event(0.05, 'shooters', 2),
    event(0.13, 'gargoyles', 4),
    event(0.22, 'bats', 22),
    event(0.32, 'wyvern'),
    event(0.42, 'gargoyles', 5),
    event(0.5, 'shooters', 3),
    event(0.6, 'bats', 24),
    event(0.68, 'wyvern'),
    event(0.76, 'gargoyles', 6),
    event(0.84, 'guardian'),
  ],
};

const BLOOD_MOON: LevelDefinition = {
  name: 'Lune de sang',
  tagline: 'La nuit de la lune rouge',
  sunDirection: new Vector3(0.18, 0.16, -1).normalize(),
  sky: {
    zenith: rgb(0.012, 0.008, 0.025),
    upper: rgb(0.05, 0.022, 0.06),
    horizon: rgb(0.36, 0.08, 0.06),
    below: rgb(0.06, 0.02, 0.03),
    glow: rgb(0.8, 0.14, 0.06),
    halo: rgb(0.3, 0.05, 0.03),
    disc: rgb(1.4, 0.22, 0.1),
    discInner: 0.9958,
    discOuter: 0.997,
    cloudShadow: rgb(0.04, 0.02, 0.04),
    cloudLight: rgb(0.25, 0.06, 0.06),
    cloudRim: rgb(1.2, 0.3, 0.15),
    cloudThin: rgb(0.15, 0.04, 0.05),
    stars: 1,
  },
  fog: { color: '#2c1016', near: 300, far: 5200 },
  lighting: {
    key: '#ff6a4a',
    keyIntensity: 1.9,
    fill: '#6a4a7a',
    fillIntensity: 0.55,
    sky: '#7a2a34',
    ground: '#120810',
    ambientIntensity: 0.45,
    exposure: 1.05,
    environment: 0.35,
  },
  terrain: {
    seed: 81.2,
    mountainHeight: 580,
    river: { amplitude1: 220, frequency1: 0.0013, amplitude2: 120, frequency2: 0.0033, phase: 2.2 },
    meadow: '#2a2620',
    forest: '#1a1a16',
    rock: '#3a2a2a',
    ridge: '#4e3434',
    peak: '#7a4a44',
  },
  water: { color: '#ff8a6a', glow: '#ff3a2a' },
  cloudTint: '#7a5a62',
  castle: { halfSize: 82, towerHeight: 88, sideTowers: true, keepHeight: 128, towerHp: 4, keepHp: 8, archers: 8, mage: true, stone: '#7a6660', roof: '#1c1622' },
  events: [
    event(0.04, 'bats', 18),
    event(0.12, 'gargoyles', 5),
    event(0.2, 'wyvern'),
    event(0.3, 'shooters', 3),
    event(0.38, 'bats', 26),
    event(0.48, 'wyvern'),
    event(0.56, 'gargoyles', 6),
    event(0.64, 'shooters', 3),
    event(0.72, 'bats', 28),
    event(0.78, 'wyvern'),
    event(0.85, 'guardian'),
  ],
};

export const LEVELS: LevelDefinition[] = [SUNSET_VALLEY, AMBER_PEAKS, BLOOD_MOON];
