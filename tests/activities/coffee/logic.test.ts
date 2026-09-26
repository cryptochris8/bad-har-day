import { describe, expect, it } from 'vitest';
import {
  BREW_BAND,
  CREAM_STOPS,
  HER_MUG,
  MATCH_DE,
  ORDER_COLOR,
  ORDER_T,
  OVERFLOW,
  brewStep,
  coffeePoints,
  coffeeStars,
  colorDistance,
  creamColor,
  creamVerdict,
  fillVerdict,
  hexToLab,
  mixHex,
  mugLineup,
} from '../../../src/activities/coffee/logic';
import { Rng } from '../../../src/core/rng';
import { COFFEE_COLORS } from '../../../src/props';
import type { CoffeeOrder } from '../../../src/plan/types';

const ORDERS: CoffeeOrder[] = ['black', 'splash', 'creamSugar', 'latte'];

describe('mug line-up', () => {
  it('always has the sunflower plus three distinct others, seeded', () => {
    for (let seed = 1; seed < 60; seed++) {
      const r = new Rng(seed);
      const l = mugLineup(() => r.next());
      expect(l).toHaveLength(4);
      expect(new Set(l).size).toBe(4);
      expect(l).toContain(HER_MUG);
    }
    const a = new Rng(5);
    const b = new Rng(5);
    expect(mugLineup(() => a.next())).toEqual(mugLineup(() => b.next()));
  });
  it('puts the sunflower in different slots across seeds', () => {
    const slots = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      const r = new Rng(seed);
      slots.add(mugLineup(() => r.next()).indexOf(HER_MUG));
    }
    expect(slots.size).toBeGreaterThan(2);
  });
});

describe('brewing', () => {
  it('classifies the fill level', () => {
    expect(fillVerdict(0.5)).toBe('low');
    expect(fillVerdict(BREW_BAND.lo)).toBe('perfect');
    expect(fillVerdict(0.84)).toBe('perfect');
    expect(fillVerdict(BREW_BAND.hi)).toBe('perfect');
    expect(fillVerdict(0.93)).toBe('brim');
    expect(fillVerdict(OVERFLOW)).toBe('overflow');
    expect(fillVerdict(Number.NaN)).toBe('low');
  });
  it('fills steadily after a soft start and never passes 1', () => {
    let lvl = 0;
    let held = 0;
    const dt = 1 / 60;
    let t = 0;
    while (fillVerdict(lvl) === 'low' && t < 10) {
      lvl = brewStep(lvl, dt, held);
      held += dt;
      t += dt;
    }
    // the sweet zone is reachable in a few seconds and stays open for a human-sized window
    expect(t).toBeGreaterThan(2);
    expect(t).toBeLessThan(3.6);
    const window = (BREW_BAND.hi - BREW_BAND.lo) / 0.3;
    expect(window).toBeGreaterThan(0.35);
    for (let i = 0; i < 600; i++) lvl = brewStep(lvl, dt, 5);
    expect(lvl).toBe(1);
    expect(brewStep(0.5, -1, 1)).toBe(0.5);
  });
});

describe('creamer colour ramp', () => {
  it('starts black and passes exactly through every order colour', () => {
    expect(creamColor(0)).toBe(COFFEE_COLORS.black);
    for (const o of ORDERS) expect(creamColor(ORDER_T[o])).toBe(ORDER_COLOR[o]);
    expect(ORDER_COLOR.splash).toBe(COFFEE_COLORS.splash);
    expect(ORDER_COLOR.creamSugar).toBe(COFFEE_COLORS.creamSugar);
    expect(ORDER_COLOR.latte).toBe(COFFEE_COLORS.latte);
    expect(creamColor(2)).toBe(CREAM_STOPS[CREAM_STOPS.length - 1]!.c);
    expect(creamColor(Number.NaN)).toBe(COFFEE_COLORS.black);
  });
  it('gets lighter monotonically as cream goes in', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const L = hexToLab(creamColor(t))[0];
      expect(L).toBeGreaterThan(prev - 1e-6);
      prev = L;
    }
  });
  it('mixes hex colours per channel', () => {
    expect(mixHex(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixHex(0x102030, 0x102030, 0.7)).toBe(0x102030);
    expect(mixHex(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });
});

describe('colour matching (Lab ΔE)', () => {
  it('is zero for equal colours, symmetric, and large for black vs white', () => {
    expect(colorDistance(0x9d6d47, 0x9d6d47)).toBeCloseTo(0);
    expect(colorDistance(0x3b2418, 0xc79f73)).toBeCloseTo(colorDistance(0xc79f73, 0x3b2418));
    expect(colorDistance(0x000000, 0xffffff)).toBeCloseTo(100, 0);
  });
  it('matches near the order, and says which way you are off', () => {
    for (const o of ['splash', 'creamSugar', 'latte'] as const) {
      const t = ORDER_T[o];
      expect(creamVerdict(t, o)).toBe('match');
      expect(creamVerdict(t - 0.03, o)).toBe('match');
      expect(creamVerdict(t + 0.03, o)).toBe('match');
      expect(creamVerdict(t - 0.18, o)).toBe('under');
      expect(creamVerdict(Math.min(1, t + 0.18), o)).toBe('over');
    }
  });
  it('the match window is a fair, human-sized pour (≈ 0.25–0.9 s at the pour rate)', () => {
    for (const o of ['splash', 'creamSugar', 'latte'] as const) {
      let lo = ORDER_T[o];
      while (colorDistance(creamColor(lo - 0.001), ORDER_COLOR[o]) <= MATCH_DE) lo -= 0.001;
      let hi = ORDER_T[o];
      while (hi < 1 && colorDistance(creamColor(hi + 0.001), ORDER_COLOR[o]) <= MATCH_DE) hi += 0.001;
      const seconds = (hi - lo) / 0.2;
      expect(seconds).toBeGreaterThan(0.25);
      expect(seconds).toBeLessThan(0.9);
    }
  });
});

describe('coffee stars', () => {
  it('3 stars for right mug + fill in band + colour match', () => {
    expect(coffeeStars({ wrongPicks: 0, fill: 'perfect', cream: 'match' })).toBe(3);
    expect(coffeeStars({ wrongPicks: 0, fill: 'perfect', cream: 'black' })).toBe(3);
  });
  it('one slip costs a star, never below 1', () => {
    expect(coffeeStars({ wrongPicks: 1, fill: 'perfect', cream: 'match' })).toBe(2);
    expect(coffeeStars({ wrongPicks: 0, fill: 'brim', cream: 'match' })).toBe(2);
    expect(coffeeStars({ wrongPicks: 0, fill: 'perfect', cream: 'over' })).toBe(2);
    expect(coffeeStars({ wrongPicks: 5, fill: 'overflow', cream: 'over' })).toBe(1);
    expect(coffeePoints({ wrongPicks: 9, fill: 'overflow', cream: 'over' })).toBeGreaterThan(0);
  });
});
