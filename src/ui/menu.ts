import type { Difficulty } from '../logic/difficulty';
import type { LevelDefinition } from '../world/levels';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing element #${id}`);
  return found as T;
}

export interface MenuActions {
  chooseLevel(index: number): void;
  chooseDifficulty(difficulty: Difficulty): void;
  start(): void;
  next(): void;
  backToMenu(): void;
}

export interface MenuChoices {
  level: number;
  unlocked: number;
  difficulty: Difficulty;
  best: number;
}

export interface RunResult {
  victory: boolean;
  score: number;
  seconds: number;
  best: number;
  newBest: boolean;
  /** A next level exists and is now unlocked. */
  hasNext: boolean;
}

/** Title screen (level and difficulty choice, best score) and end-of-run screen. */
export class Menu {
  private readonly menu = element('menu');
  private readonly end = element('end');
  private readonly next = element<HTMLButtonElement>('next-level');
  private readonly restart = element<HTMLButtonElement>('restart');

  constructor(
    private readonly levels: LevelDefinition[],
    private readonly difficulties: Difficulty[],
    private readonly actions: MenuActions,
  ) {
    element('start').addEventListener('click', () => actions.start());
    this.restart.addEventListener('click', () => actions.start());
    this.next.addEventListener('click', () => actions.next());
    element('to-menu').addEventListener('click', () => actions.backToMenu());
  }

  isOpen(): boolean {
    return !this.menu.classList.contains('hidden') || !this.end.classList.contains('hidden');
  }

  showMenu(choices: MenuChoices): void {
    this.end.classList.add('hidden');
    this.menu.classList.remove('hidden');
    element('menu-eyebrow').textContent = `Niveau ${choices.level + 1} · ${this.levels[choices.level].tagline}`;
    this.renderChips('level-choices', this.levels.map((level, i) => ({ label: `${i + 1}. ${level.name}`, locked: i >= choices.unlocked, selected: i === choices.level })), (i) => this.actions.chooseLevel(i));
    this.renderChips('difficulty-choices', this.difficulties.map((d) => ({ label: d.label, locked: false, selected: d.id === choices.difficulty.id })), (i) => this.actions.chooseDifficulty(this.difficulties[i]));
    element('best-score').textContent = choices.best > 0 ? `Meilleur score : ${choices.best} points` : 'Pas encore de score dans ce niveau';
  }

  hide(): void {
    this.menu.classList.add('hidden');
    this.end.classList.add('hidden');
  }

  showEnd(result: RunResult): void {
    element('end-eyebrow').textContent = result.victory ? 'Victoire' : 'Défaite';
    element('end-title').innerHTML = result.victory ? 'Le château<br />est tombé' : 'Le dragon<br />est tombé';
    element('end-summary').textContent = result.victory
      ? `Il ne reste que des cendres. ${result.score} points en ${Math.round(result.seconds)} secondes.`
      : `Les défenses ont eu raison de toi. ${result.score} points.`;
    element('end-record').textContent = result.newBest ? 'Nouveau record !' : `Meilleur score : ${result.best} points`;
    element('end-record').classList.toggle('is-new', result.newBest);
    this.next.classList.toggle('hidden', !result.hasNext);
    this.restart.classList.toggle('cta--ghost', result.hasNext);
    this.menu.classList.add('hidden');
    this.end.classList.remove('hidden');
  }

  /** Enter / A: starts the game, or goes on to the next level (else replays). */
  confirm(): void {
    if (!this.menu.classList.contains('hidden')) this.actions.start();
    else if (!this.end.classList.contains('hidden')) (this.next.classList.contains('hidden') ? this.restart : this.next).click();
  }

  private renderChips(id: string, chips: Array<{ label: string; locked: boolean; selected: boolean }>, onPick: (index: number) => void): void {
    const container = element(id);
    container.replaceChildren(
      ...chips.map((chip, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.textContent = chip.locked ? `${chip.label} 🔒` : chip.label;
        button.disabled = chip.locked;
        button.setAttribute('aria-pressed', String(chip.selected));
        if (chip.locked) button.title = 'Termine le niveau précédent pour le débloquer';
        button.addEventListener('click', () => onPick(i));
        return button;
      }),
    );
  }
}
