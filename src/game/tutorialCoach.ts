import type { Input } from '../core/input';
import type { Settings } from '../logic/settings';
import { TutorialScript } from '../logic/tutorial';
import { hintText } from '../ui/controlHints';

export type TutorialEvent = 'fired' | 'ringCollected' | 'powerUsed';

/** Plays the first-launch tutorial during a run: notes what the player does, picks the hint to show. */
export class TutorialCoach {
  private script: TutorialScript | null = null;
  private readonly events = new Set<TutorialEvent>();

  constructor(
    private readonly settings: Settings,
    private readonly input: Input,
  ) {}

  /** A run starts. The tutorial plays until the player finishes a run (Options can replay it). */
  begin(): void {
    this.script = this.settings.values.tutorialDone ? null : new TutorialScript();
    this.events.clear();
  }

  note(event: TutorialEvent): void {
    this.events.add(event);
  }

  /** The hint to show this frame, or null. */
  hint(dt: number, score: number, siege: boolean): string | null {
    if (!this.script) return null;
    const input = this.input;
    const step = this.script.update(dt, {
      steering: input.horizontal() !== 0 || input.vertical() !== 0,
      throttle: input.throttle() !== 0,
      fired: this.events.has('fired'),
      ringCollected: this.events.has('ringCollected'),
      powerUsed: this.events.has('powerUsed'),
      score,
      siege,
    });
    this.events.clear();
    return step ? hintText(step, this.settings.values.keys, input.usingGamepad) : null;
  }

  /** The run is over: finishing one completes the tutorial. */
  finish(): void {
    if (this.script) this.settings.update({ tutorialDone: true });
    this.script = null;
  }
}
