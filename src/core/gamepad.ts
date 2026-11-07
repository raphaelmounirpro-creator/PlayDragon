const DEADZONE = 0.18;

/** Standard mapping of an Xbox controller. */
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;
export const STICK = { LEFT_X: 0, LEFT_Y: 1, RIGHT_X: 2, RIGHT_Y: 3 } as const;

/** The first connected game controller, polled once per frame. */
export class Gamepad {
  connected = false;
  private buttons: boolean[] = [];
  private previous: boolean[] = [];
  private axes: number[] = [];

  poll(): void {
    const pad = (navigator.getGamepads?.() ?? []).find((candidate) => candidate?.connected) ?? null;
    this.connected = pad !== null;
    this.previous = this.buttons;
    this.buttons = pad ? pad.buttons.map((button) => button.pressed || button.value > 0.4) : [];
    this.axes = pad ? pad.axes.map((value) => (Math.abs(value) < DEADZONE ? 0 : value)) : [];
  }

  /** Any stick pushed or button held this frame. */
  active(): boolean {
    return this.axes.some((value) => value !== 0) || this.buttons.some(Boolean);
  }

  held(button: number): boolean {
    return this.buttons[button] ?? false;
  }

  /** True on the frame the button goes down. */
  pressed(button: number): boolean {
    return this.held(button) && !(this.previous[button] ?? false);
  }

  axis(index: number): number {
    return this.axes[index] ?? 0;
  }
}
