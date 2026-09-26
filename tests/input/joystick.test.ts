import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STICK,
  clampInside,
  computeStick,
  computeStickX,
  createStickOutput,
  followOrigin,
  stickDims,
} from '../../src/input/joystick';

const R = DEFAULT_STICK.radius;

describe('computeStick (xy)', () => {
  it('is zero inside the dead zone', () => {
    const o = computeStick(R * 0.1, 0, DEFAULT_STICK, createStickOutput());
    expect(o.x).toBe(0);
    expect(o.y).toBe(0);
  });

  it('screen up (negative dy) is y > 0', () => {
    const o = computeStick(0, -R, DEFAULT_STICK, createStickOutput());
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(1);
  });

  it('keeps the direction on diagonals and never exceeds magnitude 1', () => {
    const o = computeStick(R * 2, R * 2, DEFAULT_STICK, createStickOutput());
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(1);
    expect(o.x).toBeCloseTo(Math.SQRT1_2);
    expect(o.y).toBeCloseTo(-Math.SQRT1_2);
  });

  it('full speed at fullAt travel, smooth ramp from the dead-zone edge', () => {
    expect(computeStick(R * DEFAULT_STICK.fullAt, 0, DEFAULT_STICK, createStickOutput()).x).toBeCloseTo(1);
    const edge = computeStick(R * (DEFAULT_STICK.deadzone + 0.001), 0, DEFAULT_STICK, createStickOutput());
    expect(edge.x).toBeGreaterThan(0);
    expect(edge.x).toBeLessThan(0.01);
    const half = computeStick(R * 0.5, 0, DEFAULT_STICK, createStickOutput());
    expect(half.x).toBeGreaterThan(0.4);
    expect(half.x).toBeLessThan(0.6);
  });

  it('clamps the knob to the travel radius', () => {
    const o = computeStick(R * 3, 0, DEFAULT_STICK, createStickOutput());
    expect(o.knobX).toBeCloseTo(R);
    expect(o.knobY).toBeCloseTo(0);
  });
});

describe('computeStickX (horizontal track)', () => {
  it('ignores vertical travel entirely', () => {
    const o = computeStickX(R, DEFAULT_STICK, createStickOutput());
    expect(o.x).toBeCloseTo(1);
    expect(o.y).toBe(0);
    expect(o.knobY).toBe(0);
  });

  it('dead zone, sign, clamp', () => {
    expect(computeStickX(R * 0.05, DEFAULT_STICK, createStickOutput()).x).toBe(0);
    expect(computeStickX(-R * 0.5, DEFAULT_STICK, createStickOutput()).x).toBeLessThan(-0.4);
    const far = computeStickX(-R * 4, DEFAULT_STICK, createStickOutput());
    expect(far.x).toBeCloseTo(-1);
    expect(far.knobX).toBeCloseTo(-R);
  });
});

describe('helpers', () => {
  it('followOrigin drags the base behind a drifting thumb', () => {
    const origin = { x: 0, y: 0 };
    followOrigin(origin, 100, 0, 40);
    expect(origin.x).toBeCloseTo(60);
    followOrigin(origin, 70, 0, 40); // within range: stays
    expect(origin.x).toBeCloseTo(60);
  });

  it('followOrigin xOnly: only the horizontal distance drags, y never moves', () => {
    const origin = { x: 0, y: 10 };
    followOrigin(origin, 30, 500, 40, true);
    expect(origin).toEqual({ x: 0, y: 10 });
    followOrigin(origin, -100, 500, 40, true);
    expect(origin).toEqual({ x: -60, y: 10 });
  });

  it('clampInside keeps the base inside the zone', () => {
    expect(clampInside(5, 200, 30)).toBe(30);
    expect(clampInside(195, 200, 30)).toBe(170);
    expect(clampInside(50, 40, 30)).toBe(20);
  });

  it('stickDims: base fits the travel, the track fits travel + knob', () => {
    const d = stickDims(R);
    expect(d.base).toBeGreaterThanOrEqual(R * 2);
    expect(d.knob).toBeLessThan(d.base);
    expect(d.trackW).toBeGreaterThanOrEqual(R * 2 + d.knob);
    expect(d.trackH).toBeGreaterThan(d.knob);
  });
});
