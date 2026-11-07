export type Mood = 'off' | 'calm' | 'battle';

/** D minor progression i – VI – III – VII (Dm, Bb, F, C), as MIDI notes. */
const CHORDS = [
  [62, 65, 69],
  [58, 62, 65],
  [65, 69, 72],
  [60, 64, 67],
];
const BAR_SECONDS: Record<Exclude<Mood, 'off'>, number> = { calm: 4, battle: 2.4 };
const LOOKAHEAD = 0.6;

const frequency = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/**
 * Generative score, scheduled bar by bar on the audio clock: a warm pad and bass while flying,
 * plus taiko drums and a driving string ostinato during battles. Original and endless.
 */
export class Music {
  private mood: Mood = 'off';
  private nextBar = 0;
  private bar = 0;

  constructor(
    private readonly context: AudioContext,
    private readonly output: GainNode,
    private readonly noise: AudioBuffer,
  ) {}

  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.nextBar = Math.max(this.nextBar, this.context.currentTime + 0.05);
  }

  /** Called every frame: schedules the bars that will start soon. */
  update(): void {
    if (this.mood === 'off') return;
    const now = this.context.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar < now + LOOKAHEAD) {
      const length = BAR_SECONDS[this.mood];
      this.scheduleBar(this.nextBar, length, this.mood === 'battle');
      this.nextBar += length;
      this.bar++;
    }
  }

  private scheduleBar(start: number, length: number, battle: boolean): void {
    const chord = CHORDS[this.bar % CHORDS.length];
    for (const note of chord) this.pad(frequency(note), start, length, battle ? 1400 : 900);
    this.voice('triangle', frequency(chord[0] - 24), start, length, 0.22, 0.3, 0.8);
    if (battle) {
      this.drums(start, length);
      for (let i = 0; i < 8; i++) this.voice('sawtooth', frequency(chord[i % 2 === 0 ? 0 : 2] - 12), start + (i * length) / 8, length / 10, 0.05, 0.005, 0.12);
    } else {
      for (let i = 0; i < 4; i++) {
        const note = chord[(this.bar + i * 2) % 3] + 12 * (1 + (i % 2));
        this.voice('sine', frequency(note), start + i * (length / 4) + 0.1, 1.2, 0.05, 0.01, 1.1);
      }
    }
  }

  /** Two slightly detuned saws through a soft low-pass: the warm bed of the score. */
  private pad(freq: number, start: number, length: number, cutoff: number): void {
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = this.envelope(start, 0.045, length * 0.35, length * 1.15);
    filter.connect(gain);
    for (const detune of [-7, 7]) {
      const osc = this.context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(start);
      osc.stop(start + length * 1.6);
    }
  }

  private voice(type: OscillatorType, freq: number, start: number, length: number, volume: number, attack: number, release: number): void {
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(this.envelope(start, volume, attack, length + release));
    osc.start(start);
    osc.stop(start + length + release + 0.1);
  }

  /** Low taiko hits and a noise snare. */
  private drums(start: number, length: number): void {
    const step = length / 8;
    for (const beat of [0, 3, 4, 6]) {
      const at = start + beat * step;
      const osc = this.context.createOscillator();
      osc.frequency.setValueAtTime(110, at);
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.35);
      osc.connect(this.envelope(at, 0.5, 0.005, 0.45));
      osc.start(at);
      osc.stop(at + 0.5);
    }
    for (const beat of [2, 6]) {
      const at = start + beat * step;
      const source = this.context.createBufferSource();
      source.buffer = this.noise;
      const filter = this.context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      source.connect(filter);
      filter.connect(this.envelope(at, 0.12, 0.002, 0.18));
      source.start(at);
      source.stop(at + 0.25);
    }
  }

  private envelope(start: number, peak: number, attack: number, release: number): GainNode {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
    gain.connect(this.output);
    return gain;
  }
}
