import { Clock, Color, PerspectiveCamera, Raycaster, Scene, Vector3 } from 'three';
import type { Mood } from '../audio/music';
import { Sound } from '../audio/sound';
import { BOOST_FACTOR, DRAGON_MAX_HP, ROCK_DAMAGE } from '../config';
import { Input } from '../core/input';
import { Dragon } from '../entities/dragon';
import type { Foe, FoeContext } from '../entities/foes/foe';
import { Mage } from '../entities/foes/mage';
import { Shield } from '../entities/shield';
import { sunInView } from '../fx/backlight';
import { Effects, randomDirection } from '../fx/particles';
import { createGlowTexture } from '../fx/textures';
import { ABILITIES, Abilities, AbilityId, definition } from '../logic/abilities';
import { DIFFICULTIES, Difficulty, NORMAL } from '../logic/difficulty';
import { GameState } from '../logic/gameState';
import { browserStorage, Records } from '../logic/records';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { Menu, RunResult } from '../ui/menu';
import { LEVELS } from '../world/levels';
import type { FlightMode } from './flight';
import { Session } from './session';

const INVULNERABILITY = 1;
const HEAL_AMOUNT = 40;
const END_SCREEN_DELAY = 3;
const AIM_DISTANCE = 1400;

/** Wires the levels, the dragon, the rules, the sound and the interface together, and runs the loop. */
export class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, 1, 12000);
  private readonly renderer: Renderer;
  private readonly clock = new Clock();
  private readonly input: Input;
  private readonly hud = new Hud();
  private readonly menu: Menu;
  private readonly sound = new Sound();
  private readonly records = new Records(browserStorage(), LEVELS.length);
  private readonly state = new GameState();
  private readonly dragon = new Dragon();
  private readonly effects = new Effects(createGlowTexture());
  private readonly abilities = new Abilities();
  private readonly shield = new Shield();
  private readonly raycaster = new Raycaster();
  private readonly dragonVelocity = new Vector3();
  private readonly lastPosition = new Vector3();
  private session!: Session;
  private difficulty: Difficulty = NORMAL;
  private result: RunResult | null = null;
  private invulnerable = 0;
  private endTimer = 0;
  private paused = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, this.scene, this.camera);
    this.input = new Input(this.renderer.webgl.domElement);
    this.scene.add(this.dragon.root, this.shield.mesh, this.effects.smoke.points, this.effects.fire.points);
    this.menu = new Menu(LEVELS, DIFFICULTIES, {
      chooseLevel: (index) => {
        this.loadLevel(index);
        this.showMenu();
      },
      chooseDifficulty: (difficulty) => {
        this.difficulty = difficulty;
        this.showMenu();
      },
      start: () => this.start(),
      next: () => {
        this.loadLevel(this.session.levelIndex + 1);
        this.start();
      },
      backToMenu: () => this.backToMenu(),
    });
    this.hud.createAbilityBar((id) => this.useAbility(id));
    this.hud.setMuted(false);
    // Browsers only start audio after a gesture: the first click or key press turns the music on.
    for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => this.sound.unlock());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.loadLevel(0);
    this.showMenu();
  }

  run(): void {
    this.renderer.webgl.setAnimationLoop(() => this.frame());
  }

  /** Builds a level's world (the menu shows it in the background). */
  private loadLevel(index: number): void {
    if (this.session?.levelIndex === index) return;
    this.session?.detach(this.scene);
    this.session = new Session(index, this.dragon, this.camera, this.effects);
    this.session.attach(this.scene, this.renderer);
    this.prepareSession();
    this.session.flight.update(0, 0, 0, 0, 'menu');
  }

  private prepareSession(): void {
    const { parts, shielded } = this.session.castleParts();
    this.state.setCastle(parts, shielded);
    const hooks = {
      announce: (text: string) => this.hud.announce(text),
      cue: this.sound.cue.bind(this.sound),
      frameAhead: (distance: number) => this.session.flight.frameAhead(distance),
    };
    this.session.prepare(this.difficulty, hooks, () => this.state.isShieldUp());
  }

  private showMenu(): void {
    const level = this.session.levelIndex;
    this.menu.showMenu({ level, unlocked: this.records.unlockedLevels(), difficulty: this.difficulty, best: this.records.best(level, this.difficulty.id) });
  }

  private start(): void {
    this.sound.unlock();
    this.prepareSession();
    this.state.start(this.difficulty);
    this.abilities.reset();
    this.effects.clear();
    this.invulnerable = 0;
    this.endTimer = 0;
    this.result = null;
    this.paused = false;
    this.lastPosition.copy(this.session.flight.position);
    this.menu.hide();
    this.hud.show();
    this.hud.announce(this.session.level.name);
  }

  private backToMenu(): void {
    this.state.backToMenu();
    this.hud.hide();
    this.prepareSession();
    this.effects.clear();
    this.showMenu();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.input.update(dt);
    if (this.input.consumeMute()) this.hud.setMuted(this.sound.toggleMute());
    if (this.menu.isOpen() && this.input.consumeConfirm()) {
      this.sound.unlock();
      this.menu.confirm();
    }
    if (this.input.consumePause() && this.state.isPlaying()) {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
    }
    if (!this.paused) this.step(dt);
    this.renderer.render();
  }

  private step(dt: number): void {
    const time = this.clock.elapsedTime;
    const { flight, world, director } = this.session;
    this.state.tick(dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    const steering = this.state.isPlaying();
    flight.hold = director.routeBlocked();
    flight.update(dt, steering ? this.input.horizontal() : 0, steering ? this.input.vertical() : 0, steering ? this.input.throttle() : 0, this.flightMode());
    if (dt > 0) this.dragonVelocity.copy(flight.position).sub(this.lastPosition).divideScalar(dt);
    this.lastPosition.copy(flight.position);
    sunInView.value.copy(this.session.level.sunDirection).transformDirection(this.camera.matrixWorldInverse);

    this.abilities.update(dt);
    const hotkey = this.input.consumeAbilityKey();
    if (hotkey >= 0) this.useAbility(ABILITIES[hotkey].id);
    this.shield.update(flight.position, this.abilities.isActive('shield'), time);

    if (this.state.phase !== 'menu') this.updateBattle(dt, this.foeContext(time));
    this.updateEnding(dt);

    world.sky.update(this.camera.position, time);
    world.obstacles.update(time);
    world.castle.update(dt, time, this.effects);
    this.effects.update(dt);
    this.updateAudio();
    this.updateHud(dt);
  }

  private flightMode(): FlightMode {
    const phase = this.state.phase;
    if (phase === 'menu' || phase === 'voyage' || phase === 'siege') return phase;
    return 'end';
  }

  private foeContext(time: number): FoeContext {
    const session = this.session;
    return {
      time,
      dragon: session.flight.position,
      dragonVelocity: this.dragonVelocity,
      heading: session.flight.forward,
      difficulty: this.state.difficulty,
      effects: this.effects,
      fire: (kind, from, target) => session.hostile.fire(kind, from, target, this.dragonVelocity),
      hurtDragon: (amount) => this.hurtDragon(amount),
      cue: (name) => this.sound.cue(name),
    };
  }

  private updateBattle(dt: number, ctx: FoeContext): void {
    const { foes, hostile, world, director } = this.session;
    if (this.state.phase === 'voyage') this.updateVoyage(ctx);
    foes.update(dt, ctx);
    hostile.update(dt, ctx.dragon, (x, z) => world.landscape.terrainHeight(x, z), (damage) => this.hurtDragon(damage));
    if (this.state.isPlaying()) this.updateFire(dt);
    if (this.state.phase === 'siege') director.updateSiege(dt, ctx);
  }

  private updateVoyage(ctx: FoeContext): void {
    const { flight, world, director } = this.session;
    for (const ring of world.obstacles.rings) {
      if (!ring.mesh.visible) continue;
      if (world.obstacles.isInsideRing(ring, flight.position)) {
        ring.collected = true;
        ring.mesh.visible = false;
        this.state.collectRing();
        this.sparkle(ring.mesh.position);
        this.sound.ring();
      } else if (this.isBehindDragon(ring.mesh.position)) {
        ring.mesh.visible = false;
      }
    }
    for (const rock of world.obstacles.rocks) {
      if (!rock.mesh.visible) continue;
      if (rock.mesh.position.distanceTo(flight.position) < rock.radius + 6) {
        rock.hit = true;
        rock.mesh.visible = false;
        this.effects.explosion(rock.mesh.position, 1.2);
        this.sound.explosion(1.2);
        this.hurtDragon(ROCK_DAMAGE);
      } else if (this.isBehindDragon(rock.mesh.position)) {
        rock.mesh.visible = false;
      }
    }
    director.updateVoyage(flight.journey(), ctx);
    if (flight.reachedCastle()) {
      this.state.beginSiege();
      director.beginSiege();
      this.hud.showSiege();
    }
  }

  private updateFire(dt: number): void {
    const { combat, world, director } = this.session;
    const mouth = this.dragon.mouthPosition(new Vector3());
    if (combat.tryFire(mouth, this.aimPoint(), dt, this.input.isFiring(), this.abilities.isActive('triple'))) {
      this.dragon.openJaw();
      this.sound.fireBreath();
    }
    combat.update(dt, this.state.phase === 'siege', {
      onCastleHit: (partId, damage) => this.state.damagePart(partId, damage),
      isPartVulnerable: (partId) => this.state.isPartVulnerable(partId),
      onShieldBlocked: (at) => {
        Mage.ripple(this.effects, at);
        this.sound.shieldBlocked();
      },
      onFoeKilled: (foe) => this.onFoeKilled(foe),
      onExplosion: (power) => this.sound.explosion(power),
    });
    if (this.state.phase === 'victory') {
      world.castle.collapseWalls(this.effects);
      director.collapse();
      this.hud.announce('Le château s’effondre !');
      this.finishRun(true);
    }
  }

  private onFoeKilled(foe: Foe): void {
    this.state.addKill(foe.score);
    if (foe.bossName) this.hud.announce(`${foe.bossName} est vaincu !`);
  }

  private useAbility(id: AbilityId): void {
    if (!this.abilities.activate(id, this.state)) return;
    this.hud.announce(definition(id).name);
    this.sound.power();
    if (id === 'heal') {
      this.state.heal(HEAL_AMOUNT);
      this.sparkle(this.session.flight.position);
    }
    if (id === 'meteor') {
      this.session.combat.launchMeteor(this.dragon.mouthPosition(new Vector3()), this.aimPoint());
      this.sound.meteor();
    }
  }

  private hurtDragon(amount: number): void {
    if (!this.state.isPlaying() || this.invulnerable > 0 || this.abilities.isActive('shield')) return;
    this.invulnerable = INVULNERABILITY;
    this.state.damageDragon(amount);
    this.hud.flashDamage();
    this.sound.hurt();
    if (this.state.phase === 'defeat') {
      this.effects.explosion(this.session.flight.position, 1.5);
      this.finishRun(false);
    }
  }

  /** Saves the score (and unlocks the next level after a victory). */
  private finishRun(victory: boolean): void {
    const level = this.session.levelIndex;
    const newBest = this.records.submit(level, this.difficulty.id, this.state.score, victory);
    this.result = {
      victory,
      score: this.state.score,
      seconds: this.state.elapsed,
      best: this.records.best(level, this.difficulty.id),
      newBest,
      hasNext: victory && level + 1 < LEVELS.length,
    };
    if (victory) this.sound.victory();
    else this.sound.defeat();
  }

  private updateEnding(dt: number): void {
    if (!this.result || this.endTimer < 0) return;
    this.endTimer += dt;
    if (this.endTimer < END_SCREEN_DELAY) return;
    this.endTimer = -1;
    this.hud.hide();
    this.menu.showEnd(this.result);
  }

  private mood(): Mood {
    switch (this.state.phase) {
      case 'menu':
        return 'calm';
      case 'voyage':
        return this.session.foes.boss() ? 'battle' : 'calm';
      case 'siege':
        return 'battle';
      default:
        return 'off';
    }
  }

  private updateAudio(): void {
    const wingbeat = this.dragon.consumeWingbeat();
    if (wingbeat > 0) this.sound.wingbeat(wingbeat);
    this.sound.setMood(this.mood());
    this.sound.update(Math.min(1, this.session.flight.speedFactor / BOOST_FACTOR));
  }

  private updateHud(dt: number): void {
    const boss = this.session.foes.boss();
    this.hud.moveCrosshair(this.input.pointer.x, this.input.pointer.y);
    this.hud.update(dt, {
      dragonHp: this.state.dragonHp / DRAGON_MAX_HP,
      castleIntegrity: this.state.castleIntegrity(),
      keepShielded: this.state.phase === 'siege' && this.state.isShieldUp(),
      score: this.state.score,
      journey: this.session.flight.journey(),
      speed: this.session.flight.speedFactor,
      boss: boss ? { name: boss.bossName ?? '', health: boss.health / boss.maxHealth } : null,
    });
    this.hud.updateAbilities(
      ABILITIES.map((ability) => ({
        id: ability.id,
        ready: this.abilities.canActivate(ability.id, this.state),
        active: this.abilities.isActive(ability.id),
        cooldownRatio: this.abilities.cooldownRatio(ability.id),
      })),
    );
  }

  private aimPoint(): Vector3 {
    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    if (this.state.phase === 'siege') {
      const hit = this.raycaster.intersectObject(this.session.world.castle.group, true).find((h) => h.object.visible);
      if (hit) return hit.point;
    }
    return this.raycaster.ray.at(AIM_DISTANCE, new Vector3());
  }

  /** Missed rings and rocks vanish once passed, so the camera never flies through them. */
  private isBehindDragon(point: Vector3, margin = 10): boolean {
    const flight = this.session.flight;
    return point.clone().sub(flight.position).dot(flight.forward) < -margin;
  }

  private sparkle(position: Vector3): void {
    for (let i = 0; i < 40; i++) {
      this.effects.fire.emit({
        position,
        velocity: randomDirection().multiplyScalar(30 + Math.random() * 30),
        life: 0.8,
        size: 5,
        endSize: 1,
        color: new Color(3, 2.3, 1),
        endColor: new Color(1.2, 0.5, 0.1),
        drag: 2,
      });
    }
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.effects.setViewportHeight(window.innerHeight);
  }
}
