// Arrival-time calibration (docs/GDD.md §3): a great drive ≈ 7:57, an average one ≈ 8:01, never after 8:05.
import { describe, expect, it } from 'vitest';
import { DRIVE_FEATURES as F, placeEvents } from '../../../src/activities/drive/placement';
import { obedient } from './policies';
import { ACT5_START, arrivalFor, scoreDrive } from '../../../src/activities/drive/scoring';
import { DriveSim, NO_INPUT, autoInput, type DriveInput } from '../../../src/activities/drive/sim';
import { generatePlan } from '../../../src/plan';
import { SCHOOL_DEADLINE, T } from '../../../src/plan/types';
import { CROSSWALKS, CROSSWALK_STOP, DROPOFF, LIGHTS, ROUTE_LENGTH } from '../../../src/world/route/layout';

const ROUTE = { length: ROUTE_LENGTH, crosswalks: CROSSWALKS, lights: LIGHTS, dropoff: DROPOFF, crosswalkStop: CROSSWALK_STOP };
/** The loading cutscene takes ~10 s of real time. */
const LOAD_S = 10;

function drive(seed: number, policy: (s: DriveSim) => DriveInput) {
  const plan = generatePlan(seed, { daily: false, dateKey: null, coffeeOrder: 'black' });
  const sim = new DriveSim(ROUTE, placeEvents(plan.drive, F), plan.seed, { s: 0, lane: 1, v: 5 });
  let t = 0;
  while (!sim.arrived && t < 400) {
    const arrival = arrivalFor(sim.t, LOAD_S);
    sim.hurry = arrival >= T(8, 3) + 0.5;
    sim.update(1 / 30, policy(sim));
    sim.cues.length = 0;
    t += 1 / 30;
  }
  const arrival = arrivalFor(sim.t, LOAD_S);
  return { sim, arrival, score: scoreDrive(sim.summary(), arrival) };
}

const great = (s: DriveSim) => autoInput(s);
const average = (s: DriveSim) => autoInput(s, { gas: 0, honk: false });
const passive = () => NO_INPUT;

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

describe('arrival calibration', () => {
  const seeds = Array.from({ length: 40 }, (_v, i) => i * 7 + 1);
  const G = seeds.map((s) => drive(s, great));
  const A = seeds.map((s) => drive(s, average));
  const P = seeds.map((s) => drive(s, passive));
  // does EXACTLY what the game says, the moment it says it (brakes as soon as "Slow down" shows, waits, …)
  const O = seeds.map((s) => drive(s, obedient));

  it('every drive arrives (the bay pull-in and stop are assisted)', () => {
    for (const r of [...G, ...A, ...P, ...O]) expect(r.sim.arrived).toBe(true);
  });

  it('a great drive ≈ 7:57', () => {
    const m = mean(G.map((r) => r.arrival));
    expect(m).toBeGreaterThan(T(7, 55.5));
    expect(m).toBeLessThan(T(7, 58.5));
  });

  it('an average drive (no GAS, waits for everything) ≈ 8:01', () => {
    const m = mean(A.map((r) => r.arrival));
    expect(m).toBeGreaterThan(T(7, 59.5));
    expect(m).toBeLessThan(T(8, 2.5));
    expect(m - mean(G.map((r) => r.arrival))).toBeGreaterThan(2.5);
  });

  it('an obedient driver (follows every prompt immediately) is never stuck: ≈ 8:00, never in the late wrap-up', () => {
    const arr = O.map((r) => r.arrival);
    const m = mean(arr);
    // eslint-disable-next-line no-console
    console.log(`obedient driver: mean ${Math.floor(m / 60)}:${(m % 60).toFixed(1)}, latest ${Math.floor(Math.max(...arr) / 60)}:${(Math.max(...arr) % 60).toFixed(1)}`);
    expect(m).toBeLessThan(T(8, 2.5));
    for (const r of O) {
      expect(r.arrival).toBeLessThan(T(8, 3) + 0.5); // never needed the hurry
      expect(r.score.stars).toBeGreaterThanOrEqual(2);
      expect(r.score.flags).toContain('drive:guard');
      expect(r.sim.bumps).toBe(0);
    }
  });

  it('nobody is ever later than 8:05 — not even a driver who touches nothing', () => {
    for (const r of [...G, ...A, ...P, ...O]) {
      expect(r.arrival).toBeLessThanOrEqual(SCHOOL_DEADLINE);
      expect(r.arrival).toBeGreaterThan(ACT5_START);
    }
  });

  it('stars: great drives earn 3, careful ones 2+, careless ones still ≥ 1 (never 0)', () => {
    expect(mean(G.map((r) => r.score.stars))).toBeGreaterThan(2.8);
    for (const r of A) expect(r.score.stars).toBeGreaterThanOrEqual(2);
    for (const r of P) {
      expect(r.score.stars).toBeGreaterThanOrEqual(1);
      expect(r.score.stars).toBeLessThanOrEqual(2);
    }
    expect(G.every((r) => r.score.flags.includes('drive:clean') && r.score.flags.includes('drive:guard'))).toBe(true);
    expect(P.some((r) => !r.score.flags.includes('drive:clean'))).toBe(true);
  });
});

describe('no shared state between drives (a second morning drives exactly like the first)', () => {
  const runSteps = (sims: DriveSim[], policy: (s: DriveSim) => DriveInput) => {
    for (let t = 0; t < 400 && sims.some((s) => !s.arrived); t += 1 / 30)
      for (const s of sims) {
        if (s.arrived) continue;
        s.update(1 / 30, policy(s));
        s.cues.length = 0;
      }
  };
  const fresh = (seed: number) => {
    const plan = generatePlan(seed, { daily: false, dateKey: null, coffeeOrder: 'black' });
    return new DriveSim(ROUTE, placeEvents(plan.drive, F), plan.seed, { s: 0, lane: 1, v: 5 });
  };
  it('the same seed gives the same drive alone, after other drives, and stepped in lock-step with another sim', () => {
    for (const seed of [148, 22, 99]) {
      const alone = fresh(seed);
      runSteps([alone], obedient);
      for (const other of [1, 2, 3]) drive(other, great);
      const later = fresh(seed);
      runSteps([later], obedient);
      const a = fresh(seed);
      const b = fresh(seed + 1);
      runSteps([a, b], obedient);
      for (const s of [later, a]) {
        expect(s.t).toBeCloseTo(alone.t, 9);
        expect(s.summary()).toEqual(alone.summary());
      }
    }
  });
});
