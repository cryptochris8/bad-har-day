import { describe, expect, it } from 'vitest';
import {
  CATCH_WINDOW,
  Pendulum,
  SWING,
  TOSS,
  TRASH_PAR,
  arcPoint,
  judgeToss,
  pointAlong,
  slipThreshold,
  toLocalSwing,
  tossAccuracy,
  tossBand,
  tossCharge,
  trashFlags,
  trashScore,
  trashStars,
  type TrashTally,
} from '../../../src/activities/trash/logic';

const DT = 1 / 60;
const ACCEL = 14; // the walker's velocity smoothing (src/game/walker.ts)
const SPEED = 1.9; // carrying speed

/** Drive a pendulum with a walker-like velocity that chases `target(t)`; returns the peak amplitude. */
function drive(p: Pendulum, seconds: number, target: (t: number) => { x: number; z: number }, v = { x: 0, z: 0 }): number {
  let peak = 0;
  for (let t = 0; t < seconds; t += DT) {
    const g = target(t);
    const k = Math.min(1, ACCEL * DT);
    const nx = v.x + (g.x - v.x) * k;
    const nz = v.z + (g.z - v.z) * k;
    p.step(DT, (nx - v.x) / DT, (nz - v.z) / DT);
    v.x = nx;
    v.z = nz;
    peak = Math.max(peak, p.amplitude());
  }
  return peak;
}

describe('Pendulum (the swinging bag)', () => {
  it('hangs still when nothing moves and settles after a push', () => {
    const p = new Pendulum();
    p.step(1, 0, 0);
    expect(p.amplitude()).toBe(0);
    p.vx = 2;
    const a0 = p.amplitude();
    for (let i = 0; i < 300; i++) p.step(DT, 0, 0);
    expect(p.amplitude()).toBeLessThan(a0 * 0.1);
  });

  it('lags behind the hand: accelerating toward +X swings the bag toward −X', () => {
    const p = new Pendulum();
    for (let i = 0; i < 6; i++) p.step(DT, 8, 0);
    expect(p.ax).toBeLessThan(0);
    expect(Math.abs(p.az)).toBeLessThan(1e-9);
  });

  it('a plain start, a steady walk and a stop never make anything slip', () => {
    const p = new Pendulum();
    const peak = drive(p, 4, (t) => (t < 2.5 ? { x: SPEED, z: 0 } : { x: 0, z: 0 }));
    expect(peak).toBeGreaterThan(0.1); // it does swing
    expect(peak).toBeLessThan(SWING.slip);
  });

  it('the worst-timed start → stop still stays under the threshold', () => {
    let worst = 0;
    for (let stopAt = 0.2; stopAt < 1.6; stopAt += 0.05) {
      const p = new Pendulum();
      worst = Math.max(worst, drive(p, stopAt + 1.5, (t) => (t < stopAt ? { x: SPEED, z: 0 } : { x: 0, z: 0 })));
    }
    expect(worst).toBeLessThan(SWING.slip);
  });

  it('zig-zagging hard makes it slip', () => {
    const p = new Pendulum();
    const peak = drive(p, 3, (t) => ({ x: Math.floor(t / 0.7) % 2 === 0 ? SPEED : -SPEED, z: 0 }));
    expect(peak).toBeGreaterThan(SWING.slip);
  });

  it('a sharp reversal right after setting off makes it slip', () => {
    const p = new Pendulum();
    const peak = drive(p, 2, (t) => (t < 0.7 ? { x: SPEED, z: 0 } : { x: -SPEED, z: 0 }));
    expect(peak).toBeGreaterThan(SWING.slip);
  });

  it('is stable with huge / invalid inputs and clamps its angle', () => {
    const p = new Pendulum();
    p.step(0.5, 1e6, -1e6);
    expect(Math.abs(p.ax)).toBeLessThanOrEqual(SWING.maxAngle);
    expect(Math.abs(p.az)).toBeLessThanOrEqual(SWING.maxAngle);
    p.step(DT, Number.NaN, Number.POSITIVE_INFINITY);
    expect(Number.isFinite(p.amplitude())).toBe(true);
    p.step(-1, 5, 5);
    p.damp(0.25);
    expect(p.amplitude()).toBeLessThan(SWING.maxAngle * 2);
    p.reset();
    expect(p.amplitude()).toBe(0);
  });

  it('the bag settles after two drops (higher threshold) and the catch window is ~0.8 s', () => {
    expect(slipThreshold(0)).toBe(SWING.slip);
    expect(slipThreshold(1)).toBe(SWING.slip);
    expect(slipThreshold(2)).toBeGreaterThan(SWING.slip);
    expect(CATCH_WINDOW).toBeCloseTo(0.8);
  });

  it('toLocalSwing maps world swing into Chris-local (side, forward)', () => {
    // Facing +Z (yaw 0): world +Z is forward.
    expect(toLocalSwing(0, 0.3, 0).fwd).toBeCloseTo(0.3);
    expect(toLocalSwing(0.3, 0, 0).side).toBeCloseTo(0.3);
    // Facing +X (yaw π/2): world +X is forward.
    expect(toLocalSwing(0.3, 0, Math.PI / 2).fwd).toBeCloseTo(0.3);
    expect(toLocalSwing(0.3, 0, Math.PI / 2).side).toBeCloseTo(0);
  });
});

describe('toss', () => {
  it('the wind-up meter ping-pongs 0 → 1 → 0', () => {
    expect(tossCharge(0)).toBe(0);
    expect(tossCharge(TOSS.period / 4)).toBeCloseTo(0.5);
    expect(tossCharge(TOSS.period / 2)).toBeCloseTo(1);
    expect(tossCharge((TOSS.period * 3) / 4)).toBeCloseTo(0.5);
    expect(tossCharge(TOSS.period)).toBeCloseTo(0);
    expect(tossCharge(-1)).toBe(0);
    for (let t = 0; t < 5; t += 0.07) {
      expect(tossCharge(t)).toBeGreaterThanOrEqual(0);
      expect(tossCharge(t)).toBeLessThanOrEqual(1);
    }
  });

  it('judges short / in / long around the sweet zone', () => {
    const b = tossBand(0);
    expect(judgeToss(b.lo - 0.01, b)).toBe('short');
    expect(judgeToss((b.lo + b.hi) / 2, b)).toBe('in');
    expect(judgeToss(b.hi + 0.01, b)).toBe('long');
    expect(judgeToss(b.lo, b)).toBe('in');
  });

  it('the zone widens after each miss (capped) and stays reachable', () => {
    const b0 = tossBand(0);
    const b2 = tossBand(2);
    const b9 = tossBand(9);
    expect(b2.hi - b2.lo).toBeGreaterThan(b0.hi - b0.lo);
    expect(b9.hi - b9.lo).toBeCloseTo(TOSS.maxHalfWidth * 2);
    expect(b9.lo).toBeGreaterThan(0);
    expect(b9.hi).toBeLessThan(1);
    // The meter spends a fair moment inside the first zone every cycle.
    let inside = 0;
    for (let t = 0; t < TOSS.period; t += 0.001) if (judgeToss(tossCharge(t), b0) === 'in') inside += 0.001;
    expect(inside).toBeGreaterThan(0.2);
  });

  it('accuracy is 1 at the centre, 0.5 at the edges, 0 outside', () => {
    const b = tossBand(0);
    expect(tossAccuracy((b.lo + b.hi) / 2, b)).toBeCloseTo(1);
    expect(tossAccuracy(b.lo, b)).toBeCloseTo(0.5);
    expect(tossAccuracy(b.hi, b)).toBeCloseTo(0.5);
    expect(tossAccuracy(b.hi + 0.1, b)).toBe(0);
  });

  it('arcPoint starts, peaks and lands where it should', () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 2, y: 1, z: 0 };
    const o = { x: 0, y: 0, z: 0 };
    expect(arcPoint(a, b, 0.8, 0, o)).toEqual({ x: 0, y: 1, z: 0 });
    arcPoint(a, b, 0.8, 0.5, o);
    expect(o.x).toBeCloseTo(1);
    expect(o.y).toBeCloseTo(1.8);
    arcPoint(a, b, 0.8, 1, o);
    expect(o.x).toBeCloseTo(2);
    expect(o.y).toBeCloseTo(1);
    arcPoint(a, b, 0.8, 7, o);
    expect(o.x).toBeCloseTo(2);
  });
});

describe('pointAlong', () => {
  it('walks a polyline and clamps at its end', () => {
    const path = [
      { x: 0, z: 0 },
      { x: 2, z: 0 },
      { x: 2, z: 3 },
    ];
    expect(pointAlong(path, 1)).toEqual({ x: 1, y: 0, z: 0 });
    expect(pointAlong(path, 3)).toEqual({ x: 2, y: 0, z: 1 });
    expect(pointAlong(path, 99)).toEqual({ x: 2, y: 0, z: 3 });
    expect(pointAlong(path, -5)).toEqual({ x: 0, y: 0, z: 0 });
    expect(pointAlong([], 1)).toBeNull();
    expect(pointAlong([{ x: 4, z: 4 }], 1)).toEqual({ x: 4, y: 0, z: 4 });
  });
});

describe('trash scoring', () => {
  const t = (over: Partial<TrashTally> = {}): TrashTally => ({ seconds: 22, drops: 0, tossMisses: 0, accuracy: 0.95, ...over });

  it('clean carry + good toss + quick = 3 stars and both hints', () => {
    expect(trashStars(t())).toBe(3);
    expect(trashFlags(t())).toEqual(['trash:clean', 'trash:swish']);
  });

  it('drops, rim shots and dawdling cost stars — never below 1', () => {
    expect(trashStars(t({ drops: 1 }))).toBe(2);
    expect(trashStars(t({ tossMisses: 2, accuracy: 0.6 }))).toBeLessThan(3);
    expect(trashStars(t({ seconds: TRASH_PAR * 3 }))).toBeLessThanOrEqual(3);
    expect(trashStars(t({ drops: 9, tossMisses: 9, accuracy: 0.5, seconds: 999 }))).toBe(1);
    expect(trashFlags(t({ drops: 1, tossMisses: 1 }))).toEqual([]);
  });

  it('the score is monotonic in each factor', () => {
    expect(trashScore(t({ drops: 1 }))).toBeLessThan(trashScore(t()));
    expect(trashScore(t({ drops: 2 }))).toBeLessThan(trashScore(t({ drops: 1 })));
    expect(trashScore(t({ tossMisses: 1 }))).toBeLessThan(trashScore(t()));
    expect(trashScore(t({ accuracy: 0.6 }))).toBeLessThan(trashScore(t({ accuracy: 0.9 })));
    expect(trashScore(t({ seconds: TRASH_PAR + 10 }))).toBeLessThan(trashScore(t()));
    expect(trashScore(t({ seconds: 1 }))).toBe(trashScore(t({ seconds: TRASH_PAR })));
  });
});
