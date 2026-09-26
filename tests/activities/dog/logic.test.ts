import { describe, expect, it } from 'vitest';
import { ATTENTION, Attention, QUIRK_PAR, STUBBORN_TREAT_LEVEL, dogFlags, dogStars, judgeCall, pickSpots, quirkHaste, type DogTally } from '../../../src/activities/dog/logic';
import { Rng } from '../../../src/core/rng';
import type { DogQuirk } from '../../../src/plan/types';

const half = () => 0.5; // no jitter
const DT = 1 / 60;

function run(a: Attention, seconds: number, shaking: boolean, canGlance: boolean): { opens: number; closes: number } {
  let opens = 0;
  let closes = 0;
  for (let t = 0; t < seconds; t += DT) {
    const e = a.update(DT, shaking, canGlance);
    if (e === 'open') opens++;
    if (e === 'close') closes++;
  }
  return { opens, closes };
}

describe('Attention (glance-back rhythm)', () => {
  it('opens a window after the first delay and closes it after ~1.2 s at treat level 0', () => {
    const a = new Attention(half, 2);
    expect(run(a, 1.9, false, true).opens).toBe(0);
    let opened = -1;
    let closed = -1;
    for (let t = 1.9; t < 6; t += DT) {
      const e = a.update(DT, false, true);
      if (e === 'open' && opened < 0) opened = t;
      if (e === 'close' && closed < 0) closed = t;
    }
    expect(opened).toBeGreaterThan(1.9);
    expect(opened).toBeLessThan(2.1);
    expect(closed - opened).toBeCloseTo(ATTENTION.window[0], 1);
  });

  it('never opens while the dog is busy, then opens as soon as it may glance', () => {
    const a = new Attention(half, 1);
    expect(run(a, 5, false, false).opens).toBe(0);
    expect(a.open).toBe(false);
    expect(a.update(DT, false, true)).toBe('open');
  });

  it('a window closes early when the dog becomes busy', () => {
    const a = new Attention(half, 0.1);
    run(a, 0.2, false, true);
    expect(a.open).toBe(true);
    expect(a.update(DT, false, false)).toBe('close');
    expect(a.open).toBe(false);
  });

  it('shaking the treats raises the level: sooner and longer glances', () => {
    const calm = new Attention(half, 0);
    const treats = new Attention(half, 0);
    treats.level = 1;
    expect(treats.nextInterval()).toBeLessThan(calm.nextInterval());
    expect(treats.windowLength()).toBeGreaterThan(calm.windowLength());
    const a = new Attention(half, 10);
    run(a, 3, true, false);
    expect(a.level).toBeGreaterThan(0.9);
    run(a, 2, false, false);
    expect(a.level).toBeLessThan(0.9);
    expect(a.level).toBeGreaterThan(0.7); // decays slowly
  });

  it('counts down faster while shaking', () => {
    const a = new Attention(half, 4);
    const b = new Attention(half, 4);
    a.level = b.level = 0.8;
    run(a, 1, true, false);
    run(b, 1, false, false);
    expect(a.timer).toBeLessThan(b.timer);
  });

  it('glances come regularly over time (several windows in 20 s)', () => {
    const r = new Rng(3);
    const a = new Attention(() => r.next(), 2);
    const { opens, closes } = run(a, 20, false, true);
    expect(opens).toBeGreaterThanOrEqual(3);
    expect(opens).toBeLessThanOrEqual(6);
    expect(Math.abs(opens - closes)).toBeLessThanOrEqual(1);
  });

  it('soon() brings the next glance forward; close() ends a window', () => {
    const a = new Attention(half, 8);
    a.soon(0.5);
    expect(run(a, 0.6, false, true).opens).toBe(1);
    a.close();
    expect(a.open).toBe(false);
    expect(a.timer).toBeGreaterThan(1);
  });

  it('meter fills toward the glance and is full during it', () => {
    const a = new Attention(half, 2);
    expect(a.meter()).toBeCloseTo(0, 5);
    run(a, 1, false, true);
    expect(a.meter()).toBeGreaterThan(0.3);
    expect(a.meter()).toBeLessThan(1);
    run(a, 1.05, false, true);
    expect(a.open).toBe(true);
    expect(a.meter()).toBe(1);
  });

  it('ignores zero / NaN dt', () => {
    const a = new Attention(half, 0);
    expect(a.update(0, true, true)).toBeNull();
    expect(a.update(Number.NaN, true, true)).toBeNull();
    expect(a.level).toBe(0);
  });
});

describe('judgeCall', () => {
  it('only a glance window can bring the dog back — after the business, and not while stubborn', () => {
    expect(judgeCall(false, false, 0)).toBe('ignored');
    expect(judgeCall(false, true, 0)).toBe('ignored');
    expect(judgeCall(true, false, 0)).toBe('businessFirst');
    expect(judgeCall(true, true, 2)).toBe('stubborn');
    expect(judgeCall(true, true, 0)).toBe('recall');
  });

  it('treats get a stubborn dog up before the bag is even full', () => {
    expect(STUBBORN_TREAT_LEVEL).toBeGreaterThan(0.3);
    expect(STUBBORN_TREAT_LEVEL).toBeLessThan(1);
  });
});

describe('quirkHaste', () => {
  it('treats hurry the quirk along (monotonic, clamped)', () => {
    expect(quirkHaste(0)).toBe(1);
    expect(quirkHaste(0.5)).toBeGreaterThan(1);
    expect(quirkHaste(1)).toBeGreaterThan(quirkHaste(0.5));
    expect(quirkHaste(5)).toBe(quirkHaste(1));
  });
});

describe('pickSpots', () => {
  it('returns seeded, spaced spots accepted by the predicate', () => {
    const r1 = new Rng(11);
    const r2 = new Rng(11);
    const ok = (x: number, z: number) => x > 0 && z > -10;
    const a = pickSpots(() => r1.next(), 5, -5, 4, 5, ok, 1.5);
    const b = pickSpots(() => r2.next(), 5, -5, 4, 5, ok, 1.5);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(2);
    for (const p of a) {
      expect(ok(p.x, p.z)).toBe(true);
      expect(Math.hypot(p.x - 5, p.z + 5)).toBeLessThanOrEqual(4 + 1e-9);
    }
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) expect(Math.hypot(a[i]!.x - a[j]!.x, a[i]!.z - a[j]!.z)).toBeGreaterThanOrEqual(1.5);
  });

  it('gives up gracefully when nothing fits', () => {
    const r = new Rng(1);
    expect(pickSpots(() => r.next(), 0, 0, 3, 5, () => false)).toEqual([]);
  });
});

describe('dog scoring', () => {
  const base = (over: Partial<DogTally> = {}): DogTally => ({ quirk: 'sniffAll', seconds: 18, misses: 0, callsAfterBusiness: 1, treats: false, ...over });

  it('a quick first-call recall is 3 stars and a Dog Whisperer hint', () => {
    expect(dogStars(base())).toBe(3);
    expect(dogFlags(base())).toContain('dog:fast');
  });

  it('wasted calls and slow trips cost stars, never below 1', () => {
    expect(dogStars(base({ misses: 2 }))).toBe(2);
    expect(dogStars(base({ seconds: QUIRK_PAR.sniffAll + 5 }))).toBe(2);
    expect(dogStars(base({ misses: 3, seconds: QUIRK_PAR.sniffAll + 5 }))).toBe(1);
    expect(dogStars(base({ misses: 40, seconds: 999 }))).toBe(1);
  });

  it('one stray call is forgiven', () => {
    expect(dogStars(base({ misses: 1 }))).toBe(3);
    expect(dogFlags(base({ misses: 1 }))).not.toContain('dog:fast');
    expect(dogFlags(base({ callsAfterBusiness: 3 }))).not.toContain('dog:fast');
  });

  it('every quirk has a par and the treat bag leaves a hint', () => {
    for (const q of ['stare', 'leaf', 'sniffAll', 'zoomies', 'stubborn'] as DogQuirk[]) {
      expect(QUIRK_PAR[q]).toBeGreaterThan(10);
      expect(dogStars(base({ quirk: q, seconds: QUIRK_PAR[q] }))).toBe(3);
    }
    expect(dogFlags(base({ treats: true }))).toContain('dog:treats');
  });
});
