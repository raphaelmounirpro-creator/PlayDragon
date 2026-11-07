import {
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
} from 'three';
import { BOLT_DAMAGE, DRAGON_MAX_HP, ENEMY_DAMAGE, FOG_COLOR, ROCK_DAMAGE, SUN_DIRECTION } from '../config';
import { Input } from '../core/input';
import { Dragon } from '../entities/dragon';
import { Enemies } from '../entities/enemies';
import { Shield } from '../entities/shield';
import { ABILITIES, Abilities, AbilityId, definition } from '../logic/abilities';
import { Effects, randomDirection } from '../fx/particles';
import { sunInView } from '../fx/backlight';
import { createGlowTexture } from '../fx/textures';
import { GameState } from '../logic/gameState';
import { Renderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { Castle } from '../world/castle';
import { createClouds } from '../world/clouds';
import { castlePosition, createFlightCurve } from '../world/flightPath';
import { Obstacles } from '../world/obstacles';
import { createRiver } from '../world/river';
import { Sky } from '../world/sky';
import { createTerrain } from '../world/terrain';
import { createVillages } from '../world/village';
import { Combat } from './combat';
import { FlightController, FlightMode } from './flight';

const INVULNERABILITY = 1;
const HEAL_AMOUNT = 40;
const ENEMY_CONTACT_RADIUS = 14;
const WAVE_DISTANCE = 850;
const WAVE_INTERVAL_MIN = 5;
const WAVE_INTERVAL_MAX = 8;
const LAST_WAVE_JOURNEY = 0.9;
const END_SCREEN_DELAY = 3;
const AIM_DISTANCE = 1400;

/** Wires the world, the dragon, the rules and the HUD together and runs the frame loop. */
export class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, 1, 12000);
  private readonly renderer: Renderer;
  private readonly clock = new Clock();
  private readonly input: Input;
  private readonly hud = new Hud();
  private readonly state = new GameState();
  private readonly sky = new Sky();
  private readonly dragon = new Dragon();
  private readonly castle: Castle;
  private readonly obstacles: Obstacles;
  private readonly effects = new Effects(createGlowTexture());
  private readonly combat: Combat;
  private readonly flight: FlightController;
  private readonly raycaster = new Raycaster();
  private readonly abilities = new Abilities();
  private readonly shield = new Shield();
  private readonly enemies = new Enemies();
  private waveTimer = 0;
  private invulnerable = 0;
  private endTimer = 0;
  private paused = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, this.scene, this.camera);
    this.input = new Input(this.renderer.webgl.domElement);
    this.scene.fog = new Fog(FOG_COLOR, 500, 6500);
    this.scene.background = new Color(FOG_COLOR);
    this.scene.environment = this.renderer.createEnvironment();
    this.scene.environmentIntensity = 0.55;

    const curve = createFlightCurve();
    const castleAt = castlePosition();
    this.castle = new Castle(castleAt);
    this.obstacles = new Obstacles(curve);
    this.combat = new Combat(this.effects, this.castle, this.obstacles.rocks, this.enemies);
    this.flight = new FlightController(curve, this.dragon, this.camera, castleAt.clone().setY(castleAt.y + 50));
    for (const part of this.castle.parts) this.state.registerPart(part.id, part.hp);

    this.addLights();
    this.scene.add(
      this.sky.mesh,
      createTerrain(),
      createRiver(),
      createClouds(),
      createVillages(),
      this.castle.group,
      this.obstacles.group,
      this.enemies.group,
      this.dragon.root,
      this.combat.fireballs.group,
      this.combat.meteors.group,
      this.combat.bolts.group,
      this.shield.mesh,
      this.effects.smoke.points,
      this.effects.fire.points,
    );

    this.hud.onStart(() => this.start());
    this.hud.createAbilityBar((id) => this.useAbility(id));
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.flight.update(0, 0, 0, 0, 'menu');
  }

  run(): void {
    this.renderer.webgl.setAnimationLoop(() => this.frame());
  }

  private addLights(): void {
    const sun = new DirectionalLight('#ffb27a', 3.2);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(1000);
    const fill = new DirectionalLight('#9a7fb0', 0.9);
    fill.position.set(-300, 400, 800);
    const ambient = new HemisphereLight('#ffb27a', '#3a2030', 0.9);
    this.scene.add(sun, sun.target, fill, ambient);
  }

  private start(): void {
    this.state.start();
    this.flight.reset();
    this.obstacles.reset();
    this.castle.reset();
    this.combat.reset();
    this.enemies.clear();
    this.waveTimer = WAVE_INTERVAL_MIN;
    this.abilities.reset();
    this.effects.clear();
    this.invulnerable = 0;
    this.endTimer = 0;
    this.hud.showGame();
    this.hud.announce('Suis la rivière jusqu’au château');
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.input.consume('Escape') && this.state.isPlaying()) {
      this.paused = !this.paused;
      this.hud.setPaused(this.paused);
    }
    if (!this.paused) this.step(dt);
    this.renderer.render();
  }

  private step(dt: number): void {
    const time = this.clock.elapsedTime;
    this.state.tick(dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);

    const mode = this.flightMode();
    const steering = this.state.isPlaying();
    this.flight.update(
      dt,
      steering ? this.input.horizontal() : 0,
      steering ? this.input.vertical() : 0,
      steering ? this.input.throttle() : 0,
      mode,
    );

    this.abilities.update(dt);
    sunInView.value.copy(SUN_DIRECTION).transformDirection(this.camera.matrixWorldInverse);
    const hotkey = this.input.consumeAbilityKey();
    if (hotkey >= 0) this.useAbility(ABILITIES[hotkey].id);
    this.shield.update(this.flight.position, this.abilities.isActive('shield'), time);

    if (this.state.phase === 'voyage') this.updateVoyage();
    if (this.state.isPlaying()) {
      this.updateEnemies(dt, time);
      this.updateCombat(dt);
    }
    this.updateEnding(dt);

    this.sky.update(this.camera.position, time);
    this.obstacles.update(time);
    this.castle.update(dt, time, this.effects);
    this.effects.update(dt);
    this.hud.moveCrosshair(this.input.pointer.x, this.input.pointer.y);
    this.hud.update(dt, {
      dragonHp: this.state.dragonHp / DRAGON_MAX_HP,
      castleIntegrity: this.state.castleIntegrity(),
      score: this.state.score,
      journey: this.flight.journey(),
      speed: this.flight.speedFactor,
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

  private flightMode(): FlightMode {
    const phase = this.state.phase;
    if (phase === 'menu' || phase === 'voyage' || phase === 'siege') return phase;
    return 'end';
  }

  private updateVoyage(): void {
    const position = this.flight.position;
    for (const ring of this.obstacles.rings) {
      if (!ring.mesh.visible) continue;
      if (this.obstacles.isInsideRing(ring, position)) {
        ring.collected = true;
        ring.mesh.visible = false;
        this.state.collectRing();
        this.sparkle(ring.mesh.position);
      } else if (this.isBehindDragon(ring.mesh.position)) {
        ring.mesh.visible = false;
      }
    }
    for (const rock of this.obstacles.rocks) {
      if (!rock.mesh.visible) continue;
      if (rock.mesh.position.distanceTo(position) < rock.radius + 6) {
        rock.hit = true;
        rock.mesh.visible = false;
        this.effects.explosion(rock.mesh.position, 1.2);
        this.hurtDragon(ROCK_DAMAGE);
      } else if (this.isBehindDragon(rock.mesh.position)) {
        rock.mesh.visible = false;
      }
    }
    if (this.flight.reachedCastle()) {
      this.state.beginSiege();
      this.hud.showSiege();
    }
  }

  /** Waves of gargoyles come at the dragon during the journey; contact hurts, fire kills them. */
  private updateEnemies(dt: number, time: number): void {
    this.waveTimer -= dt;
    if (this.state.phase === 'voyage' && this.waveTimer <= 0 && this.flight.journey() < LAST_WAVE_JOURNEY) {
      this.spawnWave();
      this.waveTimer = WAVE_INTERVAL_MIN + Math.random() * (WAVE_INTERVAL_MAX - WAVE_INTERVAL_MIN);
    }
    this.enemies.update(dt, time, this.flight.position);
    for (const enemy of [...this.enemies.items]) {
      const position = enemy.group.position;
      if (position.distanceTo(this.flight.position) < ENEMY_CONTACT_RADIUS) {
        this.effects.explosion(position, 0.9);
        this.enemies.remove(enemy);
        this.hurtDragon(ENEMY_DAMAGE);
      } else if (this.isBehindDragon(position, 80)) {
        this.enemies.remove(enemy);
      }
    }
  }

  /** Bigger waves as the castle gets closer. */
  private spawnWave(): void {
    const frame = this.flight.frameAhead(WAVE_DISTANCE);
    const count = 3 + Math.floor(this.flight.journey() * 3 + Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const position = frame.point
        .clone()
        .addScaledVector(frame.right, (Math.random() - 0.5) * 260)
        .addScaledVector(frame.up, (Math.random() - 0.5) * 110);
      this.enemies.spawn(position);
    }
  }

  private useAbility(id: AbilityId): void {
    if (!this.abilities.activate(id, this.state)) return;
    const ability = definition(id);
    this.hud.announce(ability.name);
    if (id === 'heal') {
      this.state.heal(HEAL_AMOUNT);
      this.sparkle(this.flight.position);
    }
    if (id === 'meteor') this.combat.launchMeteor(this.dragon.mouthPosition(new Vector3()), this.aimPoint());
  }

  private updateCombat(dt: number): void {
    const mouth = this.dragon.mouthPosition(new Vector3());
    if (this.combat.tryFire(mouth, this.aimPoint(), dt, this.input.isFiring(), this.abilities.isActive('triple'))) {
      this.dragon.openJaw();
    }
    this.combat.update(dt, this.flight.position, this.state.phase === 'siege', {
      onCastleHit: (partId, damage) => this.state.damagePart(partId, damage),
      onDragonHit: () => this.hurtDragon(BOLT_DAMAGE),
      onEnemyKilled: () => this.state.killEnemy(),
    });
    if (this.state.phase === 'victory') {
      this.castle.collapseWalls(this.effects);
      this.hud.announce('Le château s’effondre !');
    }
  }

  private updateEnding(dt: number): void {
    if (this.state.phase !== 'victory' && this.state.phase !== 'defeat') return;
    if (this.endTimer < 0) return;
    this.endTimer += dt;
    if (this.endTimer >= END_SCREEN_DELAY) {
      this.hud.showEnd(this.state.phase === 'victory', this.state.score, this.state.elapsed);
      this.endTimer = -1;
    }
  }

  private aimPoint(): Vector3 {
    this.raycaster.setFromCamera(this.input.pointer, this.camera);
    if (this.state.phase === 'siege') {
      const hit = this.raycaster.intersectObject(this.castle.group, true).find((h) => h.object.visible);
      if (hit) return hit.point;
    }
    return this.raycaster.ray.at(AIM_DISTANCE, new Vector3());
  }

  /** Missed rings and rocks vanish once passed, so the camera never flies through them. */
  private isBehindDragon(point: Vector3, margin = 10): boolean {
    return point.clone().sub(this.flight.position).dot(this.flight.forward) < -margin;
  }

  private hurtDragon(amount: number): void {
    if (this.invulnerable > 0 || this.abilities.isActive('shield')) return;
    this.invulnerable = INVULNERABILITY;
    this.state.damageDragon(amount);
    this.hud.flashDamage();
    if (this.state.phase === 'defeat') this.effects.explosion(this.flight.position, 1.5);
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
