import type { FoeCue } from '../entities/foes/foe';
import { Music, type Mood } from './music';

const MASTER_VOLUME = 0.8;
/** The score sits below the effects at full volume. */
const MUSIC_LEVEL = 0.45;

/**
 * All the game's sounds, synthesized live with the Web Audio API (no audio files):
 * wind, wingbeats, fire breath, explosions, creature cries, jingles and the music.
 */
export class Sound {
  muted = false;
  private context: AudioContext | null = null;
  private master!: GainNode;
  private effects!: GainNode;
  private musicBus!: GainNode;
  private musicVolume = 0.7;
  private effectsVolume = 0.9;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private music: Music | null = null;
  private mood: Mood = 'off';

  /** Browsers only allow audio after a user gesture: call on the first click or key press. */
  unlock(): void {
    if (!this.context) this.create();
    void this.context?.resume();
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.context) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.context.currentTime, 0.05);
  }

  /** Volumes from the options screen, 0 to 1. */
  setVolumes(music: number, effects: number): void {
    this.musicVolume = music;
    this.effectsVolume = effects;
    if (!this.context) return;
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL * music, this.context.currentTime, 0.05);
    this.effects.gain.setTargetAtTime(effects, this.context.currentTime, 0.05);
  }

  setMood(mood: Mood): void {
    this.mood = mood;
    this.music?.setMood(mood);
  }

  /** Every frame: wind follows the dragon's speed (0 to 1), the score keeps playing. */
  update(speed: number): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.windGain.gain.setTargetAtTime(this.mood === 'off' ? 0.02 : 0.05 + speed * 0.12, now, 0.3);
    this.windFilter.frequency.setTargetAtTime(300 + speed * 900, now, 0.3);
    this.music?.update();
  }

  wingbeat(strength: number): void {
    this.burst('lowpass', 420, 110, 0.4, 0.35 * strength);
  }

  fireBreath(): void {
    this.burst('bandpass', 1300, 380, 0.35, 0.3, 0.8);
    this.tone('sawtooth', 140, 70, 0.3, 0.06);
  }

  meteor(): void {
    this.burst('lowpass', 1800, 200, 1.1, 0.5);
    this.tone('sawtooth', 90, 40, 1, 0.12);
  }

  explosion(power: number): void {
    this.burst('lowpass', 900 + power * 300, 90, 0.5 + power * 0.25, Math.min(0.7, 0.25 + power * 0.12));
    this.tone('sine', 75, 32, 0.4 + power * 0.15, Math.min(0.6, 0.2 + power * 0.1));
  }

  hurt(): void {
    this.tone('square', 170, 55, 0.25, 0.12);
    this.burst('highpass', 2500, 900, 0.12, 0.15);
  }

  ring(): void {
    [880, 1320, 1760].forEach((freq, i) => this.tone('sine', freq, freq, 0.5, 0.12, i * 0.06));
  }

  power(): void {
    [440, 660, 880, 1320].forEach((freq, i) => this.tone('triangle', freq, freq * 1.01, 0.35, 0.1, i * 0.05));
  }

  shieldBlocked(): void {
    this.tone('sine', 620, 1240, 0.25, 0.12);
    this.burst('highpass', 5000, 3000, 0.2, 0.1);
  }

  victory(): void {
    [587, 740, 880, 1175].forEach((freq, i) => this.tone('triangle', freq, freq, 0.9 - i * 0.1, 0.16, i * 0.16));
  }

  defeat(): void {
    [440, 392, 349, 294].forEach((freq, i) => this.tone('triangle', freq, freq * 0.98, 0.7, 0.14, i * 0.3));
  }

  cue(name: FoeCue): void {
    switch (name) {
      case 'shriek':
        this.tone('sawtooth', 900, 1500, 0.25, 0.08);
        this.tone('sawtooth', 1500, 650, 0.35, 0.08, 0.22);
        break;
      case 'spit':
        this.burst('bandpass', 700, 300, 0.2, 0.18, 1.5);
        break;
      case 'bite':
        this.burst('highpass', 3000, 1500, 0.08, 0.25);
        this.tone('square', 300, 80, 0.15, 0.12);
        break;
      case 'roar':
        this.tone('sawtooth', 85, 50, 1.5, 0.22);
        this.burst('lowpass', 500, 120, 1.5, 0.3);
        break;
      case 'cast':
        [520, 780, 1040].forEach((freq, i) => this.tone('sine', freq, freq * 1.5, 0.3, 0.08, i * 0.07));
        break;
      case 'twang':
        this.tone('triangle', 240, 180, 0.18, 0.08);
        break;
      case 'chirp':
        for (let i = 0; i < 3; i++) this.tone('sine', 3200 + Math.random() * 900, 4300, 0.06, 0.04, i * 0.07);
        break;
    }
  }

  private create(): void {
    if (typeof AudioContext === 'undefined') return;
    const context = new AudioContext();
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.connect(context.destination);
    this.master = context.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(compressor);
    this.effects = context.createGain();
    this.effects.gain.value = this.effectsVolume;
    this.effects.connect(this.master);

    this.noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.Q.value = 0.6;
    this.windGain = context.createGain();
    this.windGain.gain.value = 0;
    const wind = context.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    this.musicBus = context.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL * this.musicVolume;
    this.musicBus.connect(this.master);
    this.music = new Music(context, this.musicBus, this.noise);
    this.music.setMood(this.mood);
  }

  /** Short envelope feeding the effects bus. */
  private envelope(start: number, peak: number, duration: number): GainNode {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.connect(this.effects);
    return gain;
  }

  private tone(type: OscillatorType, from: number, to: number, duration: number, volume: number, delay = 0): void {
    if (!this.context || volume <= 0) return;
    const start = this.context.currentTime + delay;
    const osc = this.context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    osc.connect(this.envelope(start, volume, duration));
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** Filtered noise sweep: whooshes, blasts, hisses. */
  private burst(type: BiquadFilterType, from: number, to: number, duration: number, volume: number, q = 0.7): void {
    if (!this.context || volume <= 0) return;
    const start = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    source.connect(filter).connect(this.envelope(start, volume, duration));
    source.start(start, Math.random());
    source.stop(start + duration + 0.05);
  }
}
