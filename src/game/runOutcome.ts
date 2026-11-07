import type { Sound } from '../audio/sound';
import type { Progression } from '../logic/progression';
import type { Records } from '../logic/records';
import type { RunResult } from '../ui/menu';

const END_SCREEN_DELAY = 3;

export interface FinishedRun {
  level: number;
  levelCount: number;
  difficulty: string;
  score: number;
  seconds: number;
  victory: boolean;
}

/** Ends a run: saves the score, pays the gold, plays the jingle, then shows the end screen. */
export class RunOutcome {
  private result: RunResult | null = null;
  private timer = 0;

  constructor(
    private readonly records: Records,
    private readonly progression: Progression,
    private readonly sound: Sound,
  ) {}

  get finished(): boolean {
    return this.result !== null;
  }

  reset(): void {
    this.result = null;
    this.timer = 0;
  }

  finish(run: FinishedRun): void {
    const newBest = this.records.submit(run.level, run.difficulty, run.score, run.victory);
    this.result = {
      victory: run.victory,
      score: run.score,
      seconds: run.seconds,
      best: this.records.best(run.level, run.difficulty),
      newBest,
      hasNext: run.victory && run.level + 1 < run.levelCount,
      gold: this.progression.reward(run.score, run.victory),
    };
    this.timer = 0;
    if (run.victory) this.sound.victory();
    else this.sound.defeat();
  }

  /** The result, once, when it is time to show the end screen (a few seconds after the end). */
  update(dt: number): RunResult | null {
    if (!this.result || this.timer < 0) return null;
    this.timer += dt;
    if (this.timer < END_SCREEN_DELAY) return null;
    this.timer = -1;
    return this.result;
  }
}
