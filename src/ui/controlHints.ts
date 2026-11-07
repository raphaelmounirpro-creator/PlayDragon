import { POWER_ACTIONS, type ActionId, type KeyBinding } from '../logic/settings';
import type { TutorialStepId } from '../logic/tutorial';

type Keys = Record<ActionId, KeyBinding>;

const PAD_POWER_BUTTONS = ['X', 'Y', 'B', 'LB'];

const GAMEPAD_HINTS: Record<TutorialStepId, string> = {
  steer: 'Dirige le dragon avec le stick gauche',
  fire: 'Vise avec le stick droit et crache le feu avec RT',
  rings: 'Traverse les anneaux dorés : +100 points chacun',
  speed: 'RB pour accélérer, LT pour freiner',
  powers: 'Tu as assez de points pour un pouvoir : X, Y, B ou LB',
  siege: 'Fais le tour du château avec le stick gauche',
};

/** The key (or controller button) of power number `index`, in the order of ABILITIES. */
export function powerKey(index: number, keys: Keys, gamepad: boolean): string {
  return gamepad ? PAD_POWER_BUTTONS[index] : keys[POWER_ACTIONS[index]].label;
}

/** How to circle the castle, for the siege announcement. */
export function orbitControls(keys: Keys, gamepad: boolean): string {
  return gamepad ? 'Stick gauche' : `${keys.left.label} / ${keys.right.label}`;
}

/** The tutorial hint, with the player's own keys (or the controller's buttons). */
export function hintText(step: TutorialStepId, keys: Keys, gamepad: boolean): string {
  if (gamepad) return GAMEPAD_HINTS[step];
  const key = (id: ActionId) => keys[id].label;
  switch (step) {
    case 'steer':
      return `Dirige le dragon avec ${key('up')} ${key('left')} ${key('down')} ${key('right')} ou les flèches`;
    case 'fire':
      return `Vise avec la souris et crache le feu : clic ou ${key('fire')}`;
    case 'rings':
      return 'Traverse les anneaux dorés : +100 points chacun';
    case 'speed':
      return `${key('faster')} pour accélérer, ${key('slower')} pour freiner`;
    case 'powers':
      return `Tu as assez de points pour un pouvoir : touches ${key('power1')} à ${key('power4')}`;
    case 'siege':
      return `Fais le tour du château avec ${orbitControls(keys, false)}, monte avec ${key('up')}`;
  }
}
