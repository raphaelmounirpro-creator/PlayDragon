import { MathUtils, Vector2 } from 'three';
import { Gamepad, PAD, STICK } from './gamepad';

// Letters are read by the character they produce (event.key), so the AZERTY layout works as
// printed: Z Q S D to steer, E to speed up, A to brake.
const UP = ['z', 'w', 'ArrowUp'];
const DOWN = ['s', 'ArrowDown'];
const LEFT = ['q', 'ArrowLeft'];
const RIGHT = ['d', 'ArrowRight'];
const FASTER = ['e', 'Shift'];
const SLOWER = ['a'];
const FIRE = ' ';
// Digits are read by physical key (event.code): on AZERTY the top row types & é " ' without Shift.
const ABILITY_CODES = [
  ['Digit1', 'Numpad1'],
  ['Digit2', 'Numpad2'],
  ['Digit3', 'Numpad3'],
  ['Digit4', 'Numpad4'],
];
/** Controller buttons for the four powers: X, Y, B, LB. */
const ABILITY_BUTTONS = [PAD.X, PAD.Y, PAD.B, PAD.LB];
const AIM_SPEED = 1.6;

function normalize(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

/** Keyboard, mouse and Xbox controller, merged into the few actions the game needs. */
export class Input {
  readonly pointer = new Vector2();
  readonly gamepad = new Gamepad();
  private pointerDown = false;
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (event) => {
      const key = normalize(event);
      if (!this.keys.has(key)) this.pressed.add(key);
      if (!event.repeat) this.pressed.add(event.code);
      this.keys.add(key);
      if (key === FIRE || key.startsWith('Arrow')) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(normalize(event)));
    window.addEventListener('blur', () => this.keys.clear());
    target.addEventListener('pointermove', (event) => {
      this.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
    });
    target.addEventListener('pointerdown', () => (this.pointerDown = true));
    window.addEventListener('pointerup', () => (this.pointerDown = false));
  }

  /** Once per frame: reads the controller; its right stick moves the crosshair. */
  update(dt: number): void {
    this.gamepad.poll();
    const aimX = this.gamepad.axis(STICK.RIGHT_X);
    const aimY = this.gamepad.axis(STICK.RIGHT_Y);
    if (aimX !== 0 || aimY !== 0) {
      this.pointer.x = MathUtils.clamp(this.pointer.x + aimX * AIM_SPEED * dt, -0.95, 0.95);
      this.pointer.y = MathUtils.clamp(this.pointer.y - aimY * AIM_SPEED * dt, -0.95, 0.95);
    }
  }

  /** -1 (left) to 1 (right). */
  horizontal(): number {
    return this.merge(this.axis(RIGHT, LEFT), this.gamepad.axis(STICK.LEFT_X), PAD.RIGHT, PAD.LEFT);
  }

  /** -1 (down) to 1 (up). */
  vertical(): number {
    return this.merge(this.axis(UP, DOWN), -this.gamepad.axis(STICK.LEFT_Y), PAD.UP, PAD.DOWN);
  }

  /** -1 (brake) to 1 (accelerate): E / A, or RB / LT. */
  throttle(): number {
    const pad = (this.gamepad.held(PAD.RB) ? 1 : 0) - (this.gamepad.held(PAD.LT) ? 1 : 0);
    return MathUtils.clamp(this.axis(FASTER, SLOWER) + pad, -1, 1);
  }

  isFiring(): boolean {
    return this.pointerDown || this.keys.has(FIRE) || this.gamepad.held(PAD.RT);
  }

  /** Index (0-3) of the power requested this frame (keys 1-4 or X, Y, B, LB), or -1. */
  consumeAbilityKey(): number {
    return ABILITY_CODES.findIndex((codes, i) => codes.map((code) => this.consume(code)).some(Boolean) || this.gamepad.pressed(ABILITY_BUTTONS[i]));
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

  /** True once per key press. */
  consume(key: string): boolean {
    const wasPressed = this.pressed.has(key);
    this.pressed.delete(key);
    return wasPressed;
  }

  private axis(positive: string[], negative: string[]): number {
    const isDown = (keys: string[]) => keys.some((key) => this.keys.has(key));
    return (isDown(positive) ? 1 : 0) - (isDown(negative) ? 1 : 0);
  }

  private merge(keys: number, stick: number, positiveButton: number, negativeButton: number): number {
    const dpad = (this.gamepad.held(positiveButton) ? 1 : 0) - (this.gamepad.held(negativeButton) ? 1 : 0);
    return MathUtils.clamp(keys + stick + dpad, -1, 1);
  }
}
