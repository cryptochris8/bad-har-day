import { describe, expect, it } from 'vitest';
import { placeEvents, type RouteFeatures } from '../../../src/activities/drive/placement';
import { generatePlan } from '../../../src/plan';
import type { DriveEvent } from '../../../src/plan/types';
import { CROSSWALKS, EVENT_S0, EVENT_S1, INTERSECTIONS, LIGHTS } from '../../../src/world/route/layout';

const F: RouteFeatures = { crosswalks: CROSSWALKS, lights: LIGHTS, intersections: INTERSECTIONS, s0: EVENT_S0, s1: EVENT_S1, guardMax: 470 };

describe('placeEvents', () => {
  it('keeps the plan order, snaps features, spreads events out', () => {
    let roomy = 0;
    const N = 300;
    for (let seed = 1; seed <= N; seed++) {
      const plan = generatePlan(seed, { daily: false, dateKey: null, coffeeOrder: 'black' });
      const p = placeEvents(plan.drive, F);
      expect(p.map((x) => x.kind)).toEqual(plan.drive);
      let minGap = Number.POSITIVE_INFINITY;
      for (let i = 1; i < p.length; i++) minGap = Math.min(minGap, p[i]!.s - p[i - 1]!.s);
      expect(minGap).toBeGreaterThanOrEqual(20);
      if (minGap >= 40) roomy++;
      for (const e of p) {
        expect(e.s).toBeGreaterThanOrEqual(EVENT_S0 - 20);
        expect(e.s).toBeLessThanOrEqual(470);
        if (e.kind === 'crossingGuard') {
          expect(e.crosswalk).toBeGreaterThanOrEqual(0);
          expect(CROSSWALKS[e.crosswalk]).toBe(e.s);
        }
        if (e.kind === 'greenLights') {
          expect(e.light).toBeGreaterThanOrEqual(0);
          expect(LIGHTS[e.light]).toBe(e.s);
        }
        if (e.kind === 'ball' || e.kind === 'jogger' || e.kind === 'garbageTruck' || e.kind === 'puddle' || e.kind === 'sprinkler') {
          for (const c of INTERSECTIONS) expect(Math.abs(e.s - c)).toBeGreaterThanOrEqual(24);
          for (const c of CROSSWALKS) expect(Math.abs(e.s - c)).toBeGreaterThanOrEqual(12);
          if (e.kind !== 'sprinkler' && e.kind !== 'puddle') expect(e.s).toBeLessThanOrEqual(EVENT_S1);
        }
      }
    }
    // the fixed crosswalks / lights make a few orders tight, but most mornings are roomy
    expect(roomy / N).toBeGreaterThan(0.85);
  });

  it('is deterministic and never throws on odd input', () => {
    const ev: DriveEvent[] = ['geese', 'crossingGuard', 'greenLights', 'ball', 'puddle'];
    expect(placeEvents(ev, F)).toEqual(placeEvents(ev, F));
    expect(placeEvents([], F)).toEqual([]);
    const one = placeEvents(['sprinkler'], F);
    expect(one).toHaveLength(1);
    // no features at all: falls back to evenly spaced
    const bare = placeEvents(['crossingGuard', 'greenLights'], { ...F, crosswalks: [], lights: [] });
    expect(bare).toHaveLength(2);
    expect(bare[1]!.s).toBeGreaterThan(bare[0]!.s);
  });

  it('squeezes when needed (relaxed spacing) instead of failing', () => {
    const tight: RouteFeatures = { ...F, s0: 100, s1: 180, guardMax: 220 };
    const p = placeEvents(['ball', 'crossingGuard', 'puddle', 'jogger'], tight);
    expect(p).toHaveLength(4);
    for (let i = 1; i < p.length; i++) expect(p[i]!.s).toBeGreaterThan(p[i - 1]!.s);
  });
});
