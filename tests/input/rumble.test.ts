import { describe, expect, it, vi } from 'vitest';
import {
  RUMBLE_MIN_INTERVAL,
  RUMBLE_PROFILES,
  RumbleGate,
  playDeviceVibration,
  playPadRumble,
} from '../../src/input/rumble';
import type { RumbleKind } from '../../src/input/types';
import { makePad } from './helpers';

const KINDS: RumbleKind[] = ['light', 'medium', 'heavy', 'score'];

describe('RUMBLE_PROFILES', () => {
  it('has a sane profile for every kind, ordered light < medium < heavy', () => {
    for (const k of KINDS) {
      const p = RUMBLE_PROFILES[k];
      expect(p.duration).toBeGreaterThan(0);
      expect(p.duration).toBeLessThanOrEqual(1000);
      for (const m of [p.strong, p.weak]) {
        expect(m).toBeGreaterThanOrEqual(0);
        expect(m).toBeLessThanOrEqual(1);
      }
    }
    expect(RUMBLE_PROFILES.light.strong).toBeLessThan(RUMBLE_PROFILES.medium.strong);
    expect(RUMBLE_PROFILES.medium.strong).toBeLessThan(RUMBLE_PROFILES.heavy.strong);
    expect(RUMBLE_PROFILES.light.priority).toBeLessThan(RUMBLE_PROFILES.heavy.priority);
    expect(RUMBLE_PROFILES.score.duration).toBeGreaterThan(RUMBLE_PROFILES.heavy.duration);
  });
});

describe('RumbleGate (anti-spam)', () => {
  it('drops repeats of the same kind within the min interval', () => {
    const g = new RumbleGate();
    const light = RUMBLE_PROFILES.light;
    expect(g.allow(light, 0)).toBe(true);
    expect(g.allow(light, 16)).toBe(false);
    expect(g.allow(light, RUMBLE_MIN_INTERVAL - 1)).toBe(false);
    expect(g.allow(light, RUMBLE_MIN_INTERVAL + 1)).toBe(true);
  });

  it('a stronger kind interrupts at once; a weaker one cannot cut a strong rumble short', () => {
    const g = new RumbleGate();
    expect(g.allow(RUMBLE_PROFILES.light, 0)).toBe(true);
    expect(g.allow(RUMBLE_PROFILES.heavy, 10)).toBe(true);
    expect(g.allow(RUMBLE_PROFILES.light, 200)).toBe(false); // heavy still playing (320 ms)
    expect(g.allow(RUMBLE_PROFILES.light, 10 + RUMBLE_PROFILES.heavy.duration + 1)).toBe(true);
  });

  it('60 calls per second of the same kind produce at most ~11 rumbles', () => {
    const g = new RumbleGate();
    let n = 0;
    for (let i = 0; i < 60; i++) if (g.allow(RUMBLE_PROFILES.light, i * (1000 / 60))) n++;
    expect(n).toBeLessThanOrEqual(Math.ceil(1000 / RUMBLE_MIN_INTERVAL));
    expect(n).toBeGreaterThan(1);
  });

  it('reset() re-arms', () => {
    const g = new RumbleGate();
    g.allow(RUMBLE_PROFILES.score, 0);
    g.reset();
    expect(g.allow(RUMBLE_PROFILES.light, 1)).toBe(true);
  });
});

describe('playPadRumble', () => {
  it('uses vibrationActuator.playEffect("dual-rumble")', () => {
    const pad = makePad();
    expect(playPadRumble(pad, RUMBLE_PROFILES.heavy)).toBe(true);
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({ duration: 320, strongMagnitude: 1, weakMagnitude: 0.75 }),
    );
  });

  it('falls back to Firefox hapticActuators[0].pulse and survives missing APIs', () => {
    const pulse = vi.fn(() => Promise.resolve(true));
    const pad = { ...makePad({ rumble: false }), hapticActuators: [{ pulse }] };
    expect(playPadRumble(pad, RUMBLE_PROFILES.medium)).toBe(true);
    expect(pulse).toHaveBeenCalledWith(0.6, 150);
    expect(playPadRumble(makePad({ rumble: false }), RUMBLE_PROFILES.medium)).toBe(false);
    expect(playPadRumble(null, RUMBLE_PROFILES.medium)).toBe(false);
  });

  it('swallows a rejected playEffect promise and a throwing actuator', async () => {
    const pad = makePad();
    pad.vibrationActuator!.playEffect.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    expect(playPadRumble(pad, RUMBLE_PROFILES.light)).toBe(true);
    await Promise.resolve();
    pad.vibrationActuator!.playEffect.mockImplementation(() => {
      throw new Error('NotSupportedError');
    });
    expect(playPadRumble(pad, RUMBLE_PROFILES.light)).toBe(false);
  });
});

describe('playDeviceVibration', () => {
  it('calls navigator.vibrate when present; false otherwise', () => {
    const vibrate = vi.fn(() => true);
    expect(playDeviceVibration({ vibrate } as unknown as Navigator, RUMBLE_PROFILES.score)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(RUMBLE_PROFILES.score.vibrate);
    expect(playDeviceVibration({} as Navigator, RUMBLE_PROFILES.score)).toBe(false);
    expect(playDeviceVibration(null, RUMBLE_PROFILES.score)).toBe(false);
  });
});
