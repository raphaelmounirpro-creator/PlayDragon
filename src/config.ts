// Every gameplay value lives here, so balancing the game means editing this file only.
// Damage values are before the difficulty multiplier (see logic/difficulty.ts).

// Route and flight
export const PATH_LENGTH = 6400;
export const FLIGHT_SPEED = 95;
export const BOOST_FACTOR = 1.9;
export const BRAKE_FACTOR = 0.4;
export const FLIGHT_ALTITUDE = 430;
export const SIEGE_DISTANCE = 400;
export const STEER_LIMIT_X = 130;
export const STEER_LIMIT_Y = 70;
export const STEER_SPEED = 120;

// Dragon
export const DRAGON_MAX_HP = 100;
/** Seconds of invulnerability after being hit. */
export const INVULNERABILITY = 1;
export const HEAL_AMOUNT = 40;
/** How close a projectile or a rock must come to hurt the dragon. */
export const DRAGON_HITBOX = { projectile: 9, rock: 6 };
export const FIREBALL_SPEED = 520;
export const FIREBALL_COOLDOWN = 0.35;
/** A fireball's explosion also burns fragile enemies (bats) within this radius. */
export const FIREBALL_BLAST = 16;
/** "Triple feu": angle in radians between the three fireballs. */
export const TRIPLE_SPREAD = 0.07;
/** "Météore": slower and heavier, its blast hurts every enemy around. */
export const METEOR = { speed: 380, damage: 4, blast: 45, blastDamage: 2 };
/** The breath that comes with every shot burns fragile enemies (bats) in a short cone. */
export const FLAME_JET = { range: 85, cosAngle: 0.93, tick: 0.25 };
/** Aim assist: half-angle of the cone (wider with a controller) and how far it looks. */
export const AIM_ASSIST = { mouseDegrees: 3.5, padDegrees: 7, range: 1500 };

// Score and obstacles
export const RING_SCORE = 100;
export const PART_SCORE = 500;
export const ROCK_DAMAGE = 20;

/** How much enemies anticipate the dragon's movement (1 = perfect): changing course dodges. */
export const ENEMY_LEAD = 0.6;

// Enemies of the journey
export const GARGOYLE = { health: 1, score: 150, contactDamage: 10, contactRange: 14, speed: 125, turnRate: 1.3, weave: 30 };
export const SHOOTER = { health: 2, score: 200, distanceAhead: 240, stay: 14, reloadMin: 2.6, reloadSpread: 1.4 };
export const BAT = { score: 25, bite: 3, biteRange: 8, biteCooldown: 2.5, lifetime: 16 };
export const WYVERN = { health: 3, score: 300, bite: 12, biteRange: 13, hoverTime: 4.5, speed: { stalk: 60, overtake: 170, hover: 110, swoop: 190 } };

// Castle defenders
export const ARCHER = { score: 100, range: 1100, reloadMin: 2.8, reloadSpread: 1.8 };
export const MAGE = { health: 3, score: 400, castEvery: 5.5 };
export const TOWER = { reloadMin: 4, reloadMax: 8 };

// Bosses at the end of each journey
export const GUARDIAN = { health: 26, score: 2000, holdDistance: 230, boulderReload: 3.8, chargeEvery: 10, windup: 1.3, chargeSpeed: 330, chargeDamage: 20 };
export const QUEEN = { health: 28, score: 2500, holdDistance: 220, screechEvery: 4.2, summonEvery: 12, summonCount: 6, diveEvery: 11, windup: 1.2, diveSpeed: 300, diveDamage: 18 };
export const RIVAL = { health: 34, score: 3000, holdDistance: 210, volleyEvery: 3.2, breathEvery: 10, breathWindup: 1, breathTime: 1.6, swoopEvery: 14, swoopDamage: 18 };

// What the enemies throw at the dragon
export const HOSTILE = {
  bolt: { speed: 240, damage: 8 },
  stone: { speed: 200, damage: 8 },
  boulder: { speed: 150, damage: 15 },
  quarrel: { speed: 330, damage: 6 },
  orb: { speed: 120, damage: 10, homing: 1.6 },
  wave: { speed: 150, damage: 10 },
  flame: { speed: 260, damage: 9 },
};

// Gold earned after each run, spent on permanent upgrades
export const GOLD = { perPoint: 0.1, victoryBonus: 1.5 };

/** Permanent upgrades: effect per rank and price of each rank, in gold. */
export const UPGRADES = {
  vitality: { perRank: 20, costs: [200, 450, 800] },
  fireRate: { perRank: 0.12, costs: [200, 450, 800] },
  scales: { perRank: 0.1, costs: [250, 550, 950] },
  mastery: { perRank: 0.15, costs: [200, 450, 800] },
};
