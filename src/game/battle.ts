import { PerspectiveCamera, Vector3 } from 'three';
import type { Sound } from '../audio/sound';
import { HEAL_AMOUNT, INVULNERABILITY, ROCK_DAMAGE } from '../config';
import type { Input } from '../core/input';
import type { Dragon } from '../entities/dragon';
import type { FoeContext } from '../entities/foes/foe';
import { Mage } from '../entities/foes/mage';
import type { Effects } from '../fx/particles';
import { type Abilities, type AbilityId, definition } from '../logic/abilities';
import type { GameState } from '../logic/gameState';
import type { Settings } from '../logic/settings';
import { orbitControls } from '../ui/controlHints';
import type { Hud } from '../ui/hud';
import { Aim } from './aim';
import type { CombatEvents } from './combat';
import type { Session } from './session';
import type { TutorialCoach } from './tutorialCoach';

/** What the battle reads and acts on. */
export interface BattleParts {
  state: GameState;
  abilities: Abilities;
  dragon: Dragon;
  effects: Effects;
  sound: Sound;
  hud: Hud;
  input: Input;
  settings: Settings;
  coach: TutorialCoach;
  camera: PerspectiveCamera;
  /** The run is won or lost. */
  finished(victory: boolean): void;
}

/**
 * The fight during a run: rings and rocks along the route, the enemies, the dragon's fire and
 * powers, the damage it takes. The rules are GameState's; this wires them to sound, HUD and camera.
 */
export class Battle {
  private readonly aim: Aim;
  private readonly events: CombatEvents;
  private session!: Session;
  private invulnerable = 0;

  constructor(private readonly parts: BattleParts) {
    this.aim = new Aim(parts.camera);
    this.events = this.createCombatEvents();
  }

  /** A new run in this level. */
  begin(session: Session): void {
    this.session = session;
    this.invulnerable = 0;
  }

  update(dt: number, time: number): void {
    const { state } = this.parts;
    const { foes, hostile, world, director } = this.session;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    const ctx = this.foeContext(time);
    if (state.phase === 'voyage') this.updateVoyage(ctx);
    foes.update(dt, ctx);
    hostile.update(dt, ctx.dragon, (x, z) => world.landscape.terrainHeight(x, z), (damage) => this.hurtDragon(damage));
    if (state.isPlaying()) this.updateFire(dt);
    if (state.phase === 'siege') director.updateSiege(dt, ctx);
  }

  useAbility(id: AbilityId): void {
    const { abilities, state, coach, hud, sound, effects, dragon } = this.parts;
    if (!abilities.activate(id, state)) return;
    coach.note('powerUsed');
    hud.announce(definition(id).name);
    sound.power();
    if (id === 'heal') {
      state.heal(HEAL_AMOUNT);
      effects.sparkle(this.session.flight.position);
    }
    if (id === 'meteor') {
      const mouth = dragon.mouthPosition(new Vector3());
      this.session.combat.launchMeteor(mouth, this.aimFrom(mouth));
      sound.meteor();
    }
  }

  private foeContext(time: number): FoeContext {
    const { flight, hostile, foes } = this.session;
    return {
      time,
      dragon: flight.position,
      dragonVelocity: flight.velocity,
      heading: flight.forward,
      difficulty: this.parts.state.difficulty,
      effects: this.parts.effects,
      fire: (kind, from, target) => hostile.fire(kind, from, target, flight.velocity),
      hurtDragon: (amount) => this.hurtDragon(amount),
      cue: (name) => this.parts.sound.cue(name),
      summon: (foe) => foes.add(foe),
      shake: (amount) => flight.shake(amount),
    };
  }

  private updateVoyage(ctx: FoeContext): void {
    const { state, effects, sound, coach, hud, settings, input } = this.parts;
    const { flight, world, director } = this.session;
    const passage = world.obstacles.pass(flight.position, flight.forward);
    for (const ring of passage.rings) {
      state.collectRing();
      effects.sparkle(ring.mesh.position);
      sound.ring();
      coach.note('ringCollected');
    }
    for (const rock of passage.rocks) {
      effects.explosion(rock.mesh.position, 1.2);
      sound.explosion(1.2);
      this.hurtDragon(ROCK_DAMAGE);
    }
    director.updateVoyage(flight.journey(), ctx);
    if (flight.reachedCastle()) {
      state.beginSiege();
      director.beginSiege();
      hud.showSiege(orbitControls(settings.values.keys, input.usingGamepad));
    }
  }

  private updateFire(dt: number): void {
    const { state, abilities, dragon, input, sound, coach, effects, hud } = this.parts;
    const { combat, world, director, flight } = this.session;
    const mouth = dragon.mouthPosition(new Vector3());
    const target = this.aimFrom(mouth);
    const firing = input.isFiring();
    if (firing) combat.breathe(mouth, target, dt, this.events);
    if (combat.tryFire(mouth, target, dt, firing, abilities.isActive('triple'))) {
      dragon.openJaw();
      sound.fireBreath();
      coach.note('fired');
    }
    combat.update(dt, state.phase === 'siege', this.events);
    if (state.phase === 'victory') {
      world.castle.collapseWalls(effects);
      director.collapse();
      flight.shake(0.6);
      hud.announce('Le château s’effondre !');
      this.parts.finished(true);
    }
  }

  /** Where a shot from `from` goes: the crosshair, nudged onto a nearby enemy by the aim assist. */
  private aimFrom(from: Vector3): Vector3 {
    const { settings, input, state } = this.parts;
    const assist = !settings.values.aimAssist ? 'off' : input.usingGamepad ? 'pad' : 'mouse';
    const castle = state.phase === 'siege' ? this.session.world.castle : null;
    return this.aim.target(input.pointer, from, this.session.foes, castle, assist);
  }

  /** What follows a hit of the dragon's fire: the rules, the hit marker, the sound, the camera shake. */
  private createCombatEvents(): CombatEvents {
    const { state, hud, sound, effects, camera } = this.parts;
    return {
      onCastleHit: (partId, damage) => {
        const destroyed = state.damagePart(partId, damage);
        hud.hitMarker(destroyed);
        if (destroyed) this.session.flight.shake(0.3);
        return destroyed;
      },
      isPartVulnerable: (partId) => state.isPartVulnerable(partId),
      onShieldBlocked: (at) => {
        Mage.ripple(effects, at);
        sound.shieldBlocked();
      },
      onFoeHit: (foe, killed) => {
        hud.hitMarker(killed);
        if (!killed) return;
        state.addKill(foe.score);
        if (foe.bossName) hud.announce(`${foe.bossName} est vaincu !`);
      },
      onExplosion: (power, at) => {
        sound.explosion(power);
        // Close and big blasts shake the camera, far ones barely.
        this.session.flight.shake(Math.min(0.5, (power * 40) / Math.max(40, at.distanceTo(camera.position))));
      },
    };
  }

  private hurtDragon(amount: number): void {
    const { state, abilities, hud, sound, effects } = this.parts;
    if (!state.isPlaying() || this.invulnerable > 0 || abilities.isActive('shield')) return;
    this.invulnerable = INVULNERABILITY;
    state.damageDragon(amount);
    hud.flashDamage();
    sound.hurt();
    this.session.flight.shake(0.35);
    if (state.phase === 'defeat') {
      effects.explosion(this.session.flight.position, 1.5);
      this.parts.finished(false);
    }
  }
}
