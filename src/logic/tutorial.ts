export type TutorialStepId = 'steer' | 'fire' | 'rings' | 'speed' | 'powers' | 'siege';

/** What the player did this frame, as far as the tutorial cares. */
export interface TutorialSignals {
  steering: boolean;
  throttle: boolean;
  fired: boolean;
  ringCollected: boolean;
  powerUsed: boolean;
  score: number;
  siege: boolean;
}

interface Step {
  id: TutorialStepId;
  /** The hint waits for this before showing. */
  startWhen?: (s: TutorialSignals) => boolean;
  /** How much of the goal this frame achieves. */
  measure: (s: TutorialSignals, dt: number) => number;
  goal: number;
  /** Seconds before the hint gives up and moves on. */
  timeout: number;
}

const STEPS: Step[] = [
  { id: 'steer', measure: (s, dt) => (s.steering ? dt : 0), goal: 0.8, timeout: 9 },
  { id: 'fire', measure: (s) => (s.fired ? 1 : 0), goal: 3, timeout: 9 },
  { id: 'rings', measure: (s) => (s.ringCollected ? 1 : 0), goal: 1, timeout: 9 },
  { id: 'speed', measure: (s, dt) => (s.throttle ? dt : 0), goal: 0.6, timeout: 8 },
  { id: 'powers', startWhen: (s) => s.score >= 300, measure: (s) => (s.powerUsed ? 1 : 0), goal: 1, timeout: 10 },
  { id: 'siege', startWhen: (s) => s.siege, measure: (s, dt) => (s.steering ? dt : 0), goal: 2, timeout: 9 },
];

/** First-run hints, shown one at a time when they become useful, until done or timed out. */
export class TutorialScript {
  private index = 0;
  private progress = 0;
  private shownFor = -1;

  /** The hint to show this frame, or null. */
  update(dt: number, signals: TutorialSignals): TutorialStepId | null {
    const step = STEPS[this.index];
    if (!step) return null;
    if (this.shownFor < 0) {
      if (step.startWhen && !step.startWhen(signals)) return null;
      this.shownFor = 0;
    }
    this.shownFor += dt;
    this.progress += step.measure(signals, dt);
    if (this.progress >= step.goal || this.shownFor >= step.timeout) {
      this.index++;
      this.progress = 0;
      this.shownFor = -1;
      return null;
    }
    return step.id;
  }

  finished(): boolean {
    return this.index >= STEPS.length;
  }
}
