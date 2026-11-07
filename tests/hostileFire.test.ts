import { Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { HOSTILE } from '../src/config';
import { HostileFire } from '../src/game/hostileFire';
import { advance, fakeEffects } from './fakes';

vi.mock('../src/fx/textures', () => import('./fakes').then((m) => m.blankTextures));

const farBelow = () => -1000;
const still = new Vector3();

function setup() {
  const fire = new HostileFire(fakeEffects());
  const damage: number[] = [];
  const play = (seconds: number, dragon: Vector3, ground = farBelow, move?: (dt: number) => void) =>
    advance(seconds, (dt) => {
      move?.(dt);
      fire.update(dt, dragon, ground, (amount) => damage.push(amount));
    });
  return { fire, damage, play };
}

describe('HostileFire', () => {
  it('hurts the dragon once when a projectile reaches it', () => {
    const { fire, damage, play } = setup();
    const dragon = new Vector3(0, 400, -240);
    fire.fire('bolt', new Vector3(0, 400, 0), dragon, still);
    play(2, dragon);
    expect(damage).toEqual([HOSTILE.bolt.damage]);
  });

  it('bursts on the ground without hurting the dragon', () => {
    const { fire, damage, play } = setup();
    const dragon = new Vector3(0, 400, -240);
    fire.fire('stone', new Vector3(0, 400, 0), dragon, still);
    play(2, dragon, () => 1000);
    expect(damage).toEqual([]);
    expect(fire.incoming(dragon, 1000)).toEqual([]);
  });

  it('aims ahead of a moving dragon', () => {
    const { fire, play } = setup();
    fire.fire('bolt', new Vector3(0, 0, 0), new Vector3(0, 0, -240), new Vector3(100, 0, 0));
    const ahead = new Vector3(60, 0, -240);
    play(0.5, ahead);
    const [bolt] = fire.incoming(ahead, 1000);
    expect(bolt.x).toBeGreaterThan(10);
  });

  it('dodging works against straight shots, not against homing orbs', () => {
    const outcome = (kind: 'bolt' | 'orb') => {
      const { fire, damage, play } = setup();
      const dragon = new Vector3(0, 400, -300);
      fire.fire(kind, new Vector3(0, 400, 0), dragon.clone(), still);
      play(6, dragon, farBelow, (dt) => (dragon.x += 30 * dt));
      return damage;
    };
    expect(outcome('bolt')).toEqual([]);
    expect(outcome('orb')).toEqual([HOSTILE.orb.damage]);
  });

  it('warns only of projectiles coming toward the dragon', () => {
    const { fire, play } = setup();
    const dragon = new Vector3(0, 400, 0);
    fire.fire('bolt', new Vector3(0, 400, -200), dragon, still);
    fire.fire('bolt', new Vector3(0, 400, 100), new Vector3(0, 400, 900), still);
    play(0.05, dragon);
    expect(fire.incoming(dragon, 450)).toHaveLength(1);
  });
});
