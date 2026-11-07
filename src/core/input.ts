import { MathUtils, Vector2 } from 'three';
import { DEFAULT_KEYS, POWER_ACTIONS, type ActionId, type KeyBinding } from '../logic/settings';
import { Gamepad, PAD, STICK } from './gamepad';

/** Keys that always work besides the configurable ones. */
const ALTERNATES: Partial<Record<ActionId, string[]>> = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  faster: ['ShiftLeft', 'ShiftRight'],
  power1: ['Numpad1'],
  power2: ['Numpad2'],
  power3: ['Numpad3'],
  power4: ['Numpad4'],
};
/** Controller buttons for the four powers: X, Y, B, LB. */
const POWER_BUTTONS = [PAD.X, PAD.Y, PAD.B, PAD.LB];
const AIM_SPEED = 1.6;
const KEY_NAMES: Record<string, string> = { ' ': 'Espace', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Shift: 'Maj', Control: 'Ctrl', Enter: 'Entrée', Tab: 'Tab' };

/** What is printed on the key, for the options screen and the tutorial hints. */
function keyLabel(event: KeyboardEvent): string {
  return KEY_NAMES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
}

/**
 * Keyboard, mouse and Xbox controller, merged into the few actions the game needs.
 * Configurable keys are physical positions (event.code), so remapping is layout-independent.
 */
export class Input {
  readonly pointer = new Vector2();
  readonly gamepad = new Gamepad();
  /** The controller was the last device used (the aim assist is then more generous). */
  usingGamepad = false;
  padSensitivity = 1;
  invertY = false;
  private bindings: Record<ActionId, KeyBinding> = DEFAULT_KEYS;
  private pointerDown = false;
  private clicked = false;
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private capture: { onKey: (binding: KeyBinding) => void; onCancel: () => void } | null = null;

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.held.delete(event.code));
    window.addEventListener('blur', () => this.held.clear());
    target.addEventListener('pointermove', (event) => {
      this.usingGamepad = false;
      this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    });
    target.addEventListener('pointerdown', () => {
      this.pointerDown = true;
      this.clicked = true;
    });
    window.addEventListener('pointerup', () => (this.pointerDown = false));
  }

  setBindings(bindings: Record<ActionId, KeyBinding>): void {
    this.bindings = bindings;
  }

  /** The next key pressed is handed to `onKey` instead of the game (Escape cancels). */
  captureNextKey(onKey: (binding: KeyBinding) => void, onCancel: () => void): void {
    this.capture = { onKey, onCancel };
  }

  /** Once per frame: reads the controller; its right stick moves the crosshair. */
  update(dt: number): void {
    this.gamepad.poll();
    if (this.gamepad.active()) this.usingGamepad = true;
    const aimX = this.gamepad.axis(STICK.RIGHT_X);
    const aimY = this.gamepad.axis(STICK.RIGHT_Y);
    const speed = AIM_SPEED * this.padSensitivity * dt;
    if (aimX !== 0 || aimY !== 0) {
      this.pointer.x = MathUtils.clamp(this.pointer.x + aimX * speed, -0.95, 0.95);
      this.pointer.y = MathUtils.clamp(this.pointer.y - aimY * speed, -0.95, 0.95);
    }
  }

  /** -1 (left) to 1 (right). */
  horizontal(): number {
    return this.merge(this.axis('right', 'left'), this.gamepad.axis(STICK.LEFT_X), PAD.RIGHT, PAD.LEFT);
  }

  /** -1 (down) to 1 (up). */
  vertical(): number {
    const stick = -this.gamepad.axis(STICK.LEFT_Y) * (this.invertY ? -1 : 1);
    return this.merge(this.axis('up', 'down'), stick, PAD.UP, PAD.DOWN);
  }

  /** -1 (brake) to 1 (accelerate): keys, or RB / LT. */
  throttle(): number {
    const pad = (this.gamepad.held(PAD.RB) ? 1 : 0) - (this.gamepad.held(PAD.LT) ? 1 : 0);
    return MathUtils.clamp(this.axis('faster', 'slower') + pad, -1, 1);
  }

  isFiring(): boolean {
    return this.pointerDown || this.isDown('fire') || this.gamepad.held(PAD.RT);
  }

  /** Index (0-3) of the power requested this frame (its key or X, Y, B, LB), or -1. */
  consumeAbilityKey(): number {
    return POWER_ACTIONS.findIndex((action, i) => this.codes(action).map((code) => this.consume(code)).some(Boolean) || this.gamepad.pressed(POWER_BUTTONS[i]));
  }

  consumePause(): boolean {
    return this.consume('Escape') || this.gamepad.pressed(PAD.START);
  }

  consumeMute(): boolean {
    return this.consume('m');
  }

  /** Validates the main button of a menu screen: Enter or A. */
  consumeConfirm(): boolean {
    return this.consume('Enter') || this.gamepad.pressed(PAD.A);
  }

  /** Skips a cut scene: Enter, Space, a click or A. */
  consumeSkip(): boolean {
    const clicked = this.clicked;
    this.clicked = false;
    return this.consume('Enter') || this.consume('Space') || this.gamepad.pressed(PAD.A) || clicked;
  }

  /** True once per key press (by code, or by character for single letters). */
  consume(key: string): boolean {
    const wasPressed = this.pressed.has(key);
    this.pressed.delete(key);
    return wasPressed;
  }

  /**
   * End of frame: presses nothing used are dropped, like the controller's. Otherwise an Enter
   * pressed in flight would confirm the end screen the moment it appears.
   */
  endFrame(): void {
    this.pressed.clear();
    this.clicked = false;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.capture) {
      const { onKey, onCancel } = this.capture;
      this.capture = null;
      event.preventDefault();
      if (event.code === 'Escape') onCancel();
      else onKey({ code: event.code, label: keyLabel(event) });
      return;
    }
    this.usingGamepad = false;
    if (!event.repeat) {
      this.pressed.add(event.code);
      this.pressed.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
    }
    this.held.add(event.code);
    if (event.code === 'Space' || event.key.startsWith('Arrow')) event.preventDefault();
  }

  private codes(action: ActionId): string[] {
    return [this.bindings[action].code, ...(ALTERNATES[action] ?? [])];
  }

  private isDown(action: ActionId): boolean {
    return this.codes(action).some((code) => this.held.has(code));
  }

  private axis(positive: ActionId, negative: ActionId): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  private merge(keys: number, stick: number, positiveButton: number, negativeButton: number): number {
    const dpad = (this.gamepad.held(positiveButton) ? 1 : 0) - (this.gamepad.held(negativeButton) ? 1 : 0);
    return MathUtils.clamp(keys + stick + dpad, -1, 1);
  }
}
