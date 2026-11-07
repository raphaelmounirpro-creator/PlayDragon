import type { Mood } from '../audio/music';
import type { Sound } from '../audio/sound';
import type { Phase } from '../logic/gameState';

/** Picks the music for the moment and plays the dragon's wingbeats and wind. */
export class AudioDirector {
  constructor(private readonly sound: Sound) {}

  /** `speed` from 0 (stalling) to 1 (full boost); `wingbeat` is the strength of a new downstroke, or 0. */
  update(phase: Phase, bossPresent: boolean, speed: number, wingbeat: number): void {
    if (wingbeat > 0) this.sound.wingbeat(wingbeat);
    this.sound.setMood(mood(phase, bossPresent));
    this.sound.update(speed);
  }
}

function mood(phase: Phase, bossPresent: boolean): Mood {
  switch (phase) {
    case 'menu':
      return 'calm';
    case 'voyage':
      return bossPresent ? 'battle' : 'calm';
    case 'siege':
      return 'battle';
    default:
      return 'off';
  }
}
