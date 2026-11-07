import type { Difficulty } from '../logic/difficulty';
import type { Progression } from '../logic/progression';
import type { KeyBinding, Settings } from '../logic/settings';
import type { LevelDefinition } from '../world/levels';
import { element } from './dom';
import { Menu, type MenuActions, type MenuChoices, type RunResult } from './menu';
import { OptionsScreen } from './options';
import { ShopScreen } from './shop';

export interface ScreenActions extends Omit<MenuActions, 'openShop' | 'openOptions'> {
  resume(): void;
  settingsChanged(): void;
  captureKey(onKey: (binding: KeyBinding) => void, onCancel: () => void): void;
  /** What the title screen shows (asked again when Upgrades closes: the gold has changed). */
  menuChoices(): MenuChoices;
}

type Origin = 'menu' | 'pause';

/** The screens around the 3D view (title, end of run, pause, Options, Upgrades) and the way between them. */
export class Screens {
  private readonly menu: Menu;
  private readonly options: OptionsScreen;
  private readonly shop: ShopScreen;
  private readonly pause = element('pause');
  /** Options opens from the title screen or from the pause screen, and closing goes back there. */
  private origin: Origin = 'menu';

  constructor(levels: LevelDefinition[], difficulties: Difficulty[], settings: Settings, progression: Progression, private readonly actions: ScreenActions) {
    this.menu = new Menu(levels, difficulties, {
      chooseLevel: (index) => actions.chooseLevel(index),
      chooseDifficulty: (difficulty) => actions.chooseDifficulty(difficulty),
      start: () => actions.start(),
      next: () => actions.next(),
      backToMenu: () => actions.backToMenu(),
      openShop: () => this.openPanel(this.shop, 'menu'),
      openOptions: () => this.openPanel(this.options, 'menu'),
    });
    this.options = new OptionsScreen(settings, {
      applied: () => actions.settingsChanged(),
      captureKey: (onKey, onCancel) => actions.captureKey(onKey, onCancel),
      closed: () => this.back(),
    });
    this.shop = new ShopScreen(progression, () => this.back());
    element('pause-resume').addEventListener('click', () => actions.resume());
    element('pause-options').addEventListener('click', () => this.openPanel(this.options, 'pause'));
    element('pause-quit').addEventListener('click', () => actions.backToMenu());
  }

  showMenu(): void {
    this.menu.showMenu(this.actions.menuChoices());
  }

  showEnd(result: RunResult): void {
    this.menu.showEnd(result);
  }

  hideMenu(): void {
    this.menu.hide();
  }

  /** The title or end screen is up (Enter / A then confirms it). */
  menuOpen(): boolean {
    return this.menu.isOpen();
  }

  confirm(): void {
    this.menu.confirm();
  }

  setPaused(paused: boolean): void {
    this.pause.classList.toggle('hidden', !paused);
  }

  /** Options or Upgrades is open (Escape then closes it). */
  panelOpen(): boolean {
    return this.options.isOpen() || this.shop.isOpen();
  }

  closePanel(): void {
    if (this.options.isOpen()) this.options.close();
    if (this.shop.isOpen()) this.shop.close();
  }

  private openPanel(panel: OptionsScreen | ShopScreen, origin: Origin): void {
    this.origin = origin;
    this.menu.hide();
    this.setPaused(false);
    panel.open();
  }

  private back(): void {
    if (this.origin === 'menu') this.showMenu();
    else this.setPaused(true);
  }
}
