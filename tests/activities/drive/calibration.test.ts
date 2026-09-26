// Arrival-time calibration (docs/GDD.md §3): a great drive ≈ 7:57, an average one ≈ 8:01, never after 8:05.
import { describe, expect, it } from 'vitest';
import { placeEvents } from '../../../src/activities/drive/placement';
import { ACT5_START, arrivalFor, scoreDrive } from '../../../src/activities/drive/scoring';
import { DriveSim, NO_INPUT, autoInput, type DriveInput } from '../../../src/activities/drive/sim';
import { generatePlan } from '../../../src/plan';
import { SCHOOL_DEADLINE, T } from '../../../src/plan/types';
import { CROSSWALKS, CROSSWALK_STOP, DROPOFF, EVENT_S0, EVENT_S1, INTERSECTIONS, LIGHTS, ROUTE_LENGTH } from '../../../src/world/route/layout';

const ROUTE = { length: ROUTE_LENGTH, crosswalks: CROSSWALKS, lights: LIGHTS, dropoff: DROPOFF, crosswalkStop: CROSSWALK_STOP };
const F = { crosswalks: CROSSWALKS, lights: LIGHTS, intersections: INTERSECTIONS, s0: EVENT_S0, s1: EVENT_S1, guardMax: 470 };
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

  it('every drive arrives (the bay pull-in and stop are assisted)', () => {
    for (const r of [...G, ...A, ...P]) expect(r.sim.arrived).toBe(true);
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

  it('nobody is ever later than 8:05 — not even a driver who touches nothing', () => {
    for (const r of [...G, ...A, ...P]) {
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
