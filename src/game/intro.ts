import { PerspectiveCamera, Vector3 } from 'three';

const FADE_OUT_AT = 3.2;
const END_AT = 3.6;
const RADIUS = 430;
const HEIGHT = 150;
const START_ANGLE = -0.35;
const ORBIT_SPEED = 0.12;

/**
 * Short level intro: the camera circles the castle waiting at the end of the valley while the
 * level's name is shown, then fades to black and hands over to the dragon. Skippable.
 */
export class Intro {
  private time = -1;
  private readonly center = new Vector3();
  private fadingOut = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly fade: HTMLElement,
    private readonly card: HTMLElement,
  ) {}

  get running(): boolean {
    return this.time >= 0;
  }

  start(castle: Vector3, title: string, subtitle: string): void {
    this.time = 0;
    this.fadingOut = false;
    this.center.copy(castle);
    this.card.querySelector('h2')!.textContent = title;
    this.card.querySelector('p')!.textContent = subtitle;
    this.card.classList.remove('hidden');
    this.setFade(1, false);
    requestAnimationFrame(() => this.setFade(0, true));
  }

  /** Returns true on the frame the intro ends: the game then puts the camera back behind the dragon. */
  update(dt: number, skip: boolean): boolean {
    if (this.time < 0) return false;
    this.time += dt;
    if (skip && this.time < FADE_OUT_AT) this.time = FADE_OUT_AT;
    const angle = START_ANGLE + this.time * ORBIT_SPEED;
    this.camera.position.set(this.center.x + Math.sin(angle) * RADIUS, this.center.y + HEIGHT, this.center.z + Math.cos(angle) * RADIUS);
    this.camera.lookAt(this.center.x, this.center.y + 40, this.center.z);
    if (this.time >= FADE_OUT_AT && !this.fadingOut) {
      this.fadingOut = true;
      this.setFade(1, true);
    }
    if (this.time < END_AT) return false;
    this.time = -1;
    this.card.classList.add('hidden');
    this.setFade(0, true);
    return true;
  }

  /** Stops at once (going back to the menu). */
  cancel(): void {
    this.time = -1;
    this.card.classList.add('hidden');
    this.setFade(0, false);
  }

  private setFade(opacity: number, animated: boolean): void {
    this.fade.style.transition = animated ? '' : 'none';
    this.fade.style.opacity = String(opacity);
  }
}
