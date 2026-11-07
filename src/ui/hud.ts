import { BOOST_FACTOR } from '../config';
import { ABILITIES, type AbilityId, type AbilityStatus } from '../logic/abilities';
import { element } from './dom';

const ABILITY_ICONS: Record<AbilityId, string> = {
  triple: '<circle cx="5" cy="15" r="2.6"/><circle cx="12" cy="8.5" r="3.2"/><circle cx="19" cy="15" r="2.6"/>',
  shield: '<path d="M12 2.5l7.5 3v5.5c0 5-3.6 8.7-7.5 10.5C8.1 19.7 4.5 16 4.5 11V5.5z"/>',
  heal: '<path d="M12 20.5S4.5 15.8 4.5 9.8A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6c0 6-7.5 10.7-7.5 10.7z"/>',
  meteor: '<circle cx="15.5" cy="8.5" r="4.5"/><path d="M12 13L4 21M9.5 9.5L5 14M14.5 14.5L10 19" stroke-width="2" stroke-linecap="round" fill="none"/>',
};

export interface HudValues {
  dragonHp: number;
  castleIntegrity: number;
  /** The castle's keep is protected by the mage's dome. */
  keepShielded: boolean;
  score: number;
  journey: number;
  speed: number;
  boss: { name: string; health: number } | null;
}

/** Everything drawn over the 3D view during a game: bars, score, banners, powers. */
export class Hud {
  private readonly hud = element('hud');
  private readonly dragonHp = element('dragon-hp');
  private readonly castleMeter = element('castle-meter');
  private readonly castleLabel = element('castle-label');
  private readonly castleHp = element('castle-hp');
  private readonly bossMeter = element('boss-meter');
  private readonly bossName = element('boss-name');
  private readonly bossHp = element('boss-hp');
  private readonly sound = element('sound-state');
  private readonly score = element('score');
  private readonly journey = element('journey-progress');
  private readonly crosshair = element('crosshair');
  private readonly banner = element('banner');
  private readonly flash = element('damage-flash');
  private readonly hint = element('hint');
  /** Where the edge-of-screen threat arrows live. */
  readonly threatLayer = element('threats');
  private readonly speed = element('speed');
  private readonly abilityButtons = new Map<AbilityId, HTMLButtonElement>();
  private bannerTimer = 0;
  private hitTimer = 0;

  /** Builds the bottom-left buttons; a click (or its hotkey) calls `onUse`. */
  createAbilityBar(onUse: (id: AbilityId) => void): void {
    const bar = element('abilities');
    for (const ability of ABILITIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ability';
      button.tabIndex = -1; // never keep focus, or Space (fire) would also press the button
      button.innerHTML = `
        <span class="ability-key"></span>
        <svg class="ability-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" aria-hidden="true">${ABILITY_ICONS[ability.id]}</svg>
        <span class="ability-name">${ability.name}</span>
        <span class="ability-cost">${ability.cost}</span>
        <span class="ability-cooldown"></span>`;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => onUse(ability.id));
      this.abilityButtons.set(ability.id, button);
      bar.appendChild(button);
    }
  }

  /**
   * The key and price shown on each button: keys can be rebound, the controller has its own
   * buttons and the upgrade lowers prices. Cheap enough to call every frame.
   */
  labelAbilities(label: (index: number) => { key: string; cost: number }): void {
    ABILITIES.forEach((ability, index) => {
      const button = this.abilityButtons.get(ability.id);
      const { key, cost } = label(index);
      const title = `${ability.name} — ${cost} points (touche ${key})`;
      if (!button || button.title === title) return;
      button.title = title;
      button.querySelector('.ability-key')!.textContent = key;
      button.querySelector('.ability-cost')!.textContent = String(cost);
    });
  }

  updateAbilities(statuses: AbilityStatus[]): void {
    for (const status of statuses) {
      const button = this.abilityButtons.get(status.id);
      if (!button) continue;
      button.classList.toggle('is-ready', status.ready);
      button.classList.toggle('is-active', status.active);
      button.style.setProperty('--cooldown', String(status.cooldownRatio));
    }
  }

  show(): void {
    this.hud.classList.remove('hidden');
    this.castleMeter.classList.add('hidden');
    this.bossMeter.classList.add('hidden');
  }

  hide(): void {
    this.hud.classList.add('hidden');
  }

  /** `controls` names the player's own keys (or stick) for circling the castle. */
  showSiege(controls: string): void {
    this.castleMeter.classList.remove('hidden');
    this.announce(`Le château est en vue ! ${controls} pour en faire le tour`);
  }

  setMuted(muted: boolean): void {
    this.sound.textContent = muted ? 'Son coupé (M)' : 'Son (M)';
    this.sound.classList.toggle('is-muted', muted);
  }

  update(dt: number, values: HudValues): void {
    this.dragonHp.style.width = `${values.dragonHp * 100}%`;
    this.speed.style.width = `${Math.min(1, values.speed / BOOST_FACTOR) * 100}%`;
    this.castleHp.style.width = `${values.castleIntegrity * 100}%`;
    this.castleLabel.textContent = values.keepShielded ? 'Château · donjon protégé' : 'Château';
    this.bossMeter.classList.toggle('hidden', values.boss === null);
    if (values.boss) {
      this.bossName.textContent = values.boss.name;
      this.bossHp.style.width = `${values.boss.health * 100}%`;
    }
    this.score.textContent = String(values.score);
    this.journey.style.width = `${Math.min(1, values.journey) * 100}%`;
    this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.banner.classList.remove('visible');
    this.hitTimer -= dt;
    if (this.hitTimer <= 0) this.crosshair.classList.remove('is-hit', 'is-kill');
  }

  /** The crosshair flares when a shot lands (more when it kills). */
  hitMarker(kill: boolean): void {
    this.crosshair.classList.remove('is-hit', 'is-kill');
    this.crosshair.classList.add(kill ? 'is-kill' : 'is-hit');
    this.hitTimer = 0.18;
  }

  /** Tutorial hint above the journey bar, or none. */
  showHint(text: string | null): void {
    this.hint.classList.toggle('hidden', text === null);
    if (text !== null && this.hint.textContent !== text) this.hint.textContent = text;
  }

  moveCrosshair(x: number, y: number): void {
    this.crosshair.style.left = `${((x + 1) / 2) * 100}%`;
    this.crosshair.style.top = `${((1 - y) / 2) * 100}%`;
  }

  announce(text: string): void {
    this.banner.textContent = text;
    this.banner.classList.add('visible');
    this.bannerTimer = 2.6;
  }

  flashDamage(): void {
    this.flash.classList.add('visible');
    requestAnimationFrame(() => requestAnimationFrame(() => this.flash.classList.remove('visible')));
  }
}
