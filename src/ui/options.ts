import { ACTIONS, type ActionId, type KeyBinding, type Quality, type Settings, type SettingsData } from '../logic/settings';
import { element } from './dom';

function create<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export interface OptionsHooks {
  /** Settings changed: the game applies them (volumes, quality, keys…). */
  applied(): void;
  captureKey(onKey: (binding: KeyBinding) => void, onCancel: () => void): void;
  closed(): void;
}

const QUALITIES: Array<[Quality, string]> = [['haute', 'Haute'], ['moyenne', 'Moyenne'], ['basse', 'Basse (PC modestes)']];
const SENSITIVITY = { min: 0.4, max: 2.5 };

/** Options screen: sound, graphics, aiming, controller and key bindings, all saved. */
export class OptionsScreen {
  private readonly screen = element('options');
  private readonly body = element('options-body');

  constructor(
    private readonly settings: Settings,
    private readonly hooks: OptionsHooks,
  ) {
    element('options-close').addEventListener('click', () => this.close());
  }

  isOpen(): boolean {
    return !this.screen.classList.contains('hidden');
  }

  open(): void {
    this.render();
    this.screen.classList.remove('hidden');
  }

  close(): void {
    this.screen.classList.add('hidden');
    this.hooks.closed();
  }

  private render(): void {
    const s = this.settings.values;
    this.body.replaceChildren(
      this.section('Son', [
        this.slider('Musique', s.musicVolume, (value) => this.change({ musicVolume: value })),
        this.slider('Effets', s.effectsVolume, (value) => this.change({ effectsVolume: value })),
      ]),
      this.section('Graphismes', [this.choice('Qualité', QUALITIES, s.quality, (quality) => this.change({ quality }, true))]),
      this.section('Visée et manette', [
        this.choice('Aide à la visée', [[true, 'Oui'], [false, 'Non']], s.aimAssist, (aimAssist) => this.change({ aimAssist }, true)),
        this.slider('Sensibilité du stick de visée', (s.padSensitivity - SENSITIVITY.min) / (SENSITIVITY.max - SENSITIVITY.min), (value) =>
          this.change({ padSensitivity: SENSITIVITY.min + value * (SENSITIVITY.max - SENSITIVITY.min) }),
        ),
        this.choice('Inverser le haut et le bas (manette)', [[false, 'Non'], [true, 'Oui']], s.invertY, (invertY) => this.change({ invertY }, true)),
      ]),
      this.section('Touches', [...ACTIONS.map(({ id, label }) => this.keyRow(id, label, s)), this.button('Remettre les touches par défaut', () => this.resetKeys())]),
      this.section('Tutoriel', [this.button(s.tutorialDone ? 'Revoir le tutoriel au prochain départ' : 'Le tutoriel sera montré au prochain départ', () => this.change({ tutorialDone: false }, true))]),
    );
  }

  private change(patch: Partial<Omit<SettingsData, 'keys'>>, rerender = false): void {
    this.settings.update(patch);
    this.hooks.applied();
    if (rerender) this.render();
  }

  private resetKeys(): void {
    this.settings.resetKeys();
    this.hooks.applied();
    this.render();
  }

  private section(title: string, rows: HTMLElement[]): HTMLElement {
    const section = create('section', 'options-section');
    section.append(create('h3', 'options-heading', title), ...rows);
    return section;
  }

  private row(label: string, control: HTMLElement): HTMLElement {
    const row = create('div', 'options-row');
    row.append(create('span', 'options-label', label), control);
    return row;
  }

  private slider(label: string, value: number, onInput: (value: number) => void): HTMLElement {
    const input = create('input', 'options-slider');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(value * 100));
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onInput(Number(input.value) / 100));
    return this.row(label, input);
  }

  private choice<T>(label: string, options: Array<[T, string]>, current: T, onPick: (value: T) => void): HTMLElement {
    const chips = create('div', 'chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const chip = create('button', 'chip', text);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(value === current));
      chip.addEventListener('click', () => onPick(value));
      chips.append(chip);
    }
    return this.row(label, chips);
  }

  private keyRow(action: ActionId, label: string, s: Readonly<SettingsData>): HTMLElement {
    const key = create('button', 'key-button', s.keys[action].label);
    key.type = 'button';
    key.title = 'Clique puis appuie sur la nouvelle touche (Échap pour annuler)';
    key.addEventListener('click', () => {
      key.textContent = 'Appuie sur une touche…';
      key.classList.add('is-waiting');
      this.hooks.captureKey(
        (binding) => {
          this.settings.bind(action, binding);
          this.hooks.applied();
          this.render();
        },
        () => this.render(),
      );
    });
    return this.row(label, key);
  }

  private button(text: string, onClick: () => void): HTMLElement {
    const button = create('button', 'chip', text);
    button.type = 'button';
    button.addEventListener('click', onClick);
    const row = create('div', 'options-row');
    row.append(button);
    return row;
  }
}
