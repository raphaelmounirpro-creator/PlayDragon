import { Clock, PerspectiveCamera, Scene } from 'three';
import { Sound } from '../audio/sound';
import { BOOST_FACTOR } from '../config';
import { Input } from '../core/input';
import { Dragon } from '../entities/dragon';
import { Shield } from '../entities/shield';
import { sunInView } from '../fx/backlight';
import { Effects } from '../fx/particles';
import { createGlowTexture } from '../fx/textures';
import { ABILITIES, Abilities } from '../logic/abilities';
import { DIFFICULTIES, type Difficulty, difficultyById } from '../logic/difficulty';
import { GameState } from '../logic/gameState';
import { Progression } from '../logic/progression';
import { browserStorage, Records } from '../logic/records';
import { Settings } from '../logic/settings';
import { Renderer } from '../render/renderer';
import { powerKey } from '../ui/controlHints';
import { element } from '../ui/dom';
import { Hud } from '../ui/hud';
import type { MenuChoices, RunResult } from '../ui/menu';
import { Screens } from '../ui/screens';
import { ThreatIndicators } from '../ui/threats';
import { LEVELS } from '../world/levels';
import { AudioDirector } from './audioDirector';
import { Battle } from './battle';
import type { FlightMode } from './flight';
import { Intro } from './intro';
import { RunOutcome } from './runOutcome';
import { Session } from './session';
import { TutorialCoach } from './tutorialCoach';

/** Runs the game: the screens, the levels, the runs from intro to end screen, and the frame loop. */
export class Game {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(58, window.innerWidth / window.innerHeight, 1, 12000);
  private readonly renderer: Renderer;
  private readonly clock = new Clock();
  private readonly input: Input;
  private readonly storage = browserStorage();
  private readonly settings = new Settings(this.storage);
  private readonly records = new Records(this.storage, LEVELS.length);
  private readonly progression = new Progression(this.storage);
  private readonly hud = new Hud();
  private readonly threats = new ThreatIndicators(this.hud.threatLayer);
  private readonly screens: Screens;
  private readonly sound = new Sound();
  private readonly audio = new AudioDirector(this.sound);
  private readonly outcome = new RunOutcome(this.records, this.progression, this.sound);
  private readonly intro = new Intro(this.camera, element('fade'), element('intro-card'));
  private readonly coach: TutorialCoach;
  private readonly battle: Battle;
  private readonly state = new GameState();
  private readonly dragon = new Dragon();
  private readonly effects = new Effects(createGlowTexture());
  private readonly abilities = new Abilities();
  private readonly shield = new Shield();
  private session!: Session;
  private difficulty: Difficulty;
  private paused = false;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container, this.scene, this.camera);
    this.input = new Input(this.renderer.webgl.domElement);
    this.coach = new TutorialCoach(this.settings, this.input);
    this.battle = new Battle({
      state: this.state,
      abilities: this.abilities,
      dragon: this.dragon,
      effects: this.effects,
      sound: this.sound,
      hud: this.hud,
      input: this.input,
      settings: this.settings,
      coach: this.coach,
      camera: this.camera,
      finished: (victory) => this.finishRun(victory),
    });
    this.difficulty = difficultyById(this.settings.values.difficulty);
    this.screens = new Screens(LEVELS, DIFFICULTIES, this.settings, this.progression, {
      chooseLevel: (index) => this.chooseLevel(index),
      chooseDifficulty: (difficulty) => this.chooseDifficulty(difficulty),
      start: () => this.start(),
      next: () => {
        this.loadLevel(this.session.levelIndex + 1);
        this.start();
      },
      backToMenu: () => this.backToMenu(),
      resume: () => this.setPaused(false),
      settingsChanged: () => this.applySettings(),
      captureKey: (onKey, onCancel) => this.input.captureNextKey(onKey, onCancel),
      menuChoices: () => this.menuChoices(),
    });
    this.scene.add(this.dragon.root, this.shield.mesh, this.effects.smoke.points, this.effects.fire.points);
    this.hud.createAbilityBar((id) => this.battle.useAbility(id));
    // Browsers only start audio after a gesture: the first click or key press turns the music on.
    for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => this.sound.unlock());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.applySettings();
    this.loadLevel(Math.min(this.settings.values.level, this.records.unlockedLevels() - 1));
    this.screens.showMenu();
  }

  run(): void {
    this.renderer.webgl.setAnimationLoop(() => this.frame());
  }

  private applySettings(): void {
    const s = this.settings.values;
    this.input.setBindings(s.keys);
    this.input.padSensitivity = s.padSensitivity;
    this.input.invertY = s.invertY;
    this.sound.setVolumes(s.musicVolume, s.effectsVolume);
    this.sound.setMuted(s.muted);
    this.hud.setMuted(s.muted);
    this.renderer.setQuality(s.quality);
  }

  /** Builds a level's world (the menu shows it in the background). The choice is remembered. */
  private loadLevel(index: number): void {
    this.settings.update({ level: index });
    if (this.session?.levelIndex === index) return;
    this.session?.detach(this.scene);
    this.session = new Session(index, this.dragon, this.camera, this.effects);
    this.session.attach(this.scene, this.renderer);
    this.prepareSession();
    this.session.flight.update(0, 0, 0, 0, 'menu');
  }

  private prepareSession(fireCooldown = 1): void {
    const { parts, shielded } = this.session.castleParts();
    this.state.setCastle(parts, shielded);
    const hooks = {
      announce: (text: string) => this.hud.announce(text),
      cue: this.sound.cue.bind(this.sound),
      frameAhead: (distance: number) => this.session.flight.frameAhead(distance),
    };
    this.session.prepare(this.difficulty, hooks, () => this.state.isShieldUp(), fireCooldown);
  }

  private chooseLevel(index: number): void {
    this.loadLevel(index);
    this.screens.showMenu();
  }

  private chooseDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.settings.update({ difficulty: difficulty.id });
    this.screens.showMenu();
  }

  private menuChoices(): MenuChoices {
    const level = this.session.levelIndex;
    const best = this.records.best(level, this.difficulty.id);
    return { level, unlocked: this.records.unlockedLevels(), difficulty: this.difficulty, best, gold: this.progression.gold };
  }

  /** A new run: upgrades applied, then the intro flies over the castle before the dragon sets off. */
  private start(): void {
    this.sound.unlock();
    const upgrades = this.progression.modifiers();
    this.prepareSession(upgrades.fireCooldown);
    this.state.start(this.difficulty, upgrades);
    this.abilities.reset(upgrades.powerCost);
    this.battle.begin(this.session);
    this.effects.clear();
    this.outcome.reset();
    this.coach.begin();
    this.setPaused(false);
    this.screens.hideMenu();
    this.hud.hide();
    const { level, levelIndex, world } = this.session;
    this.intro.start(world.landscape.castlePosition(), `Niveau ${levelIndex + 1} · ${level.name}`, level.tagline);
  }

  private backToMenu(): void {
    this.intro.cancel();
    this.state.backToMenu();
    this.setPaused(false);
    this.hud.hide();
    this.prepareSession();
    this.effects.clear();
    this.screens.showMenu();
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.screens.setPaused(paused);
  }

  /** Saves the score and pays the gold; the end screen follows a moment later (see `play`). */
  private finishRun(victory: boolean): void {
    const { score, elapsed: seconds } = this.state;
    this.outcome.finish({ level: this.session.levelIndex, levelCount: LEVELS.length, difficulty: this.difficulty.id, score, seconds, victory });
    this.coach.finish();
  }

  private showEnd(result: RunResult): void {
    this.hud.hide();
    this.screens.showEnd(result);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.input.update(dt);
    if (this.input.consumeMute()) {
      this.settings.update({ muted: !this.settings.values.muted });
      this.applySettings();
    }
    if (this.screens.panelOpen()) {
      if (this.input.consume('Escape')) this.screens.closePanel();
    } else if (this.screens.menuOpen()) {
      if (this.input.consumeConfirm()) this.screens.confirm();
    } else if (this.input.consumePause() && this.state.isPlaying() && !this.intro.running) {
      this.setPaused(!this.paused);
    }
    if (!this.paused) this.step(dt);
    this.input.endFrame();
    this.renderer.render();
  }

  private step(dt: number): void {
    const time = this.clock.elapsedTime;
    const { flight, world, foes } = this.session;
    if (!this.intro.running) this.play(dt, time);
    else if (this.intro.update(dt, this.input.consumeSkip())) this.beginFlight();
    sunInView.value.copy(this.session.level.sunDirection).transformDirection(this.camera.matrixWorldInverse);
    this.shield.update(flight.position, this.abilities.isActive('shield'), time);
    world.sky.update(this.camera.position, time);
    world.obstacles.update(time, this.camera);
    world.castle.update(dt, time, this.effects);
    this.effects.update(dt);
    this.audio.update(this.state.phase, foes.boss() !== undefined, Math.min(1, flight.speedFactor / BOOST_FACTOR), this.dragon.consumeWingbeat());
    this.updateHud(dt);
  }

  /** One frame of flight and battle (in the menu, the dragon's showcase flight). */
  private play(dt: number, time: number): void {
    const { flight, director } = this.session;
    this.state.tick(dt);
    const steer = this.state.isPlaying() ? this.input : null;
    flight.hold = director.routeBlocked();
    flight.update(dt, steer?.horizontal() ?? 0, steer?.vertical() ?? 0, steer?.throttle() ?? 0, this.flightMode());
    this.abilities.update(dt);
    const power = this.input.consumeAbilityKey();
    if (power >= 0) this.battle.useAbility(ABILITIES[power].id);
    if (this.state.phase !== 'menu') this.battle.update(dt, time);
    const result = this.outcome.update(dt);
    if (result) this.showEnd(result);
  }

  /** End of the intro: the camera drops in behind the dragon and the run begins. */
  private beginFlight(): void {
    this.session.flight.update(0, 0, 0, 0, 'voyage');
    this.hud.show();
    this.hud.announce('Suis la rivière jusqu’au château');
  }

  private flightMode(): FlightMode {
    const phase = this.state.phase;
    return phase === 'menu' || phase === 'voyage' || phase === 'siege' ? phase : 'end';
  }

  private updateHud(dt: number): void {
    const { foes, flight } = this.session;
    const boss = foes.boss();
    const inRun = this.state.isPlaying() && !this.intro.running;
    const keys = this.settings.values.keys;
    this.hud.showHint(inRun ? this.coach.hint(dt, this.state.score, this.state.phase === 'siege') : null);
    this.hud.moveCrosshair(this.input.pointer.x, this.input.pointer.y);
    this.hud.update(dt, {
      dragonHp: this.state.dragonHp / this.state.maxHp,
      castleIntegrity: this.state.castleIntegrity(),
      keepShielded: this.state.phase === 'siege' && this.state.isShieldUp(),
      score: this.state.score,
      journey: flight.journey(),
      speed: flight.speedFactor,
      boss: boss ? { name: boss.bossName ?? '', health: boss.health / boss.maxHealth } : null,
    });
    this.hud.labelAbilities((index) => ({ key: powerKey(index, keys, this.input.usingGamepad), cost: this.abilities.cost(ABILITIES[index].id) }));
    this.hud.updateAbilities(this.abilities.statuses(this.state));
    this.threats.update(inRun ? this.session.threats() : [], this.camera);
  }

  private resize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.resize();
    this.effects.setViewportHeight(window.innerHeight);
  }
}
