import { describe, expect, it } from 'vitest';
import {
  CAR,
  TUNE,
  changeLane,
  frontOf,
  headingOf,
  kickWobble,
  laneCenter,
  lateralStep,
  neededDecel,
  newCar,
  speedStep,
  steerOf,
  stopCap,
  wobbleStep,
} from '../../../src/activities/drive/model';
import { LANE_X } from '../../../src/world/types';

const run = (v: number, gas: number, brake: number, seconds: number, cruise?: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) v = speedStep(v, gas, brake, 1 / 60, cruise);
  return v;
};

describe('speedStep (auto-cruise, GAS, BRAKE)', () => {
  it('cruises by itself with no input', () => {
    expect(run(0, 0, 0, 10)).toBeCloseTo(TUNE.cruise, 5);
    expect(run(TUNE.max, 0, 0, 20)).toBeCloseTo(TUNE.cruise, 5);
  });
  it('GAS reaches top speed; analog gas lands in between', () => {
    expect(run(TUNE.cruise, 1, 0, 5)).toBeCloseTo(TUNE.max, 5);
    const half = run(TUNE.cruise, 0.5, 0, 6);
    expect(half).toBeGreaterThan(TUNE.cruise);
    expect(half).toBeLessThan(TUNE.max);
  });
  it('BRAKE stops the car and never goes negative', () => {
    expect(run(TUNE.max, 0, 1, 3)).toBe(0);
    expect(run(TUNE.max, 1, 1, 3)).toBe(0); // brake wins over gas
    expect(speedStep(0.1, 0, 1, 1)).toBe(0);
  });
  it('ignores dt ≤ 0 and non-finite inputs stay sane', () => {
    expect(speedStep(5, 1, 0, 0)).toBe(5);
    expect(speedStep(5, 1, 0, -1)).toBe(5);
    expect(Number.isFinite(speedStep(5, Number.NaN, 0, 0.016))).toBe(true);
  });
  it('a lower cruise (the drop-off bay) is respected', () => {
    expect(run(TUNE.max, 0, 0, 10, TUNE.bayCap)).toBeCloseTo(TUNE.bayCap, 5);
  });
});

describe('stop helpers', () => {
  it('stopCap is the speed that still stops within the distance', () => {
    expect(stopCap(0, 8)).toBe(0);
    expect(stopCap(-3, 8)).toBe(0);
    expect(stopCap(4, 8)).toBeCloseTo(8, 6);
    expect(stopCap(4, 8, 2)).toBeCloseTo(10, 6);
  });
  it('neededDecel', () => {
    expect(neededDecel(10, 0, 5)).toBeCloseTo(10, 6);
    expect(neededDecel(3, 5, 5)).toBe(0);
    expect(neededDecel(3, 0, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('lanes', () => {
  it('changeLane moves one lane at a time and clamps to the lanes available', () => {
    expect(changeLane(1, -1, 1)).toBe(0);
    expect(changeLane(0, -1, 1)).toBe(0);
    expect(changeLane(1, 1, 1)).toBe(1);
    expect(changeLane(1, 1, 2)).toBe(2);
    expect(changeLane(2, 1, 2)).toBe(2);
    expect(changeLane(1, 0, 2)).toBe(1);
  });
  it('laneCenter uses LANE_X and the bay x', () => {
    expect(laneCenter(0, 6.4)).toBe(LANE_X[0]);
    expect(laneCenter(1, 6.4)).toBe(LANE_X[1]);
    expect(laneCenter(2, 6.4)).toBe(6.4);
  });
  it('lateralStep glides to the lane without overshoot, at any frame rate', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.1]) {
      const c = newCar(0, 1, 9);
      const target = LANE_X[0]!;
      let minX = c.x;
      for (let t = 0; t < 3; t += dt) {
        lateralStep(c, target, dt);
        minX = Math.min(minX, c.x);
      }
      expect(c.x).toBeCloseTo(target, 2);
      expect(minX).toBeGreaterThan(target - 0.02);
    }
  });
  it('a lane change takes well under a second to be mostly done', () => {
    const c = newCar(0, 1, 9);
    for (let t = 0; t < 0.6; t += 1 / 60) lateralStep(c, LANE_X[0]!, 1 / 60);
    expect(Math.abs(c.x - LANE_X[0]!)).toBeLessThan(0.7);
  });
});

describe('wobble + visuals', () => {
  it('a kicked wobble bounces and settles', () => {
    const c = newCar();
    kickWobble(c, 2.6);
    let peak = 0;
    for (let t = 0; t < 3; t += 1 / 60) {
      wobbleStep(c, 1 / 60);
      peak = Math.max(peak, Math.abs(c.wobble));
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(Math.abs(c.wobble)).toBeLessThan(0.01);
  });
  it('steer/heading follow the lateral velocity sign and are clamped', () => {
    const c = newCar(0, 1, 9);
    c.xv = 3;
    expect(steerOf(c)).toBeGreaterThan(0);
    expect(headingOf(c)).toBeGreaterThan(0);
    c.xv = -50;
    expect(steerOf(c)).toBe(-0.5);
    expect(frontOf(c)).toBeCloseTo(c.s + CAR.halfLen, 6);
  });
});
