import { describe, expect, it } from 'vitest';
import {
  CircleAccumulator,
  FlickDetector,
  approach,
  clamp01,
  easeOutBack,
  hop,
  pickOnRay,
  shuffled,
  smooth,
  starsFrom,
  swipeDir,
  yawToward,
} from '../../../src/activities/station/logic';
import { Rng } from '../../../src/core/rng';

describe('station easing', () => {
  it('clamps and eases', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBeCloseTo(0.5);
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(Math.max(...[0.6, 0.7, 0.8, 0.9].map((t) => easeOutBack(t)))).toBeGreaterThan(1); // overshoots
    expect(hop(0, 0.3)).toBe(0);
    expect(hop(1, 0.3)).toBe(0);
    expect(hop(0.5, 0.3)).toBeCloseTo(0.3);
  });

  it('approaches frame-rate independently', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 1, 5, 1 / 60);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 1, 5, 1 / 30);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe('FlickDetector', () => {
  it('fires once per push along the dominant axis and re-arms at rest', () => {
    const f = new FlickDetector();
    expect(f.update(0, 0)).toBeNull();
    expect(f.update(1, 0)).toBe('right');
    expect(f.update(1, 0)).toBeNull(); // held
    expect(f.update(0.4, 0)).toBeNull(); // not re-armed yet
    expect(f.update(0, 0)).toBeNull();
    expect(f.update(-0.9, 0.2)).toBe('left');
    f.update(0, 0);
    expect(f.update(0.1, 0.8)).toBe('up');
    f.update(0, 0);
    expect(f.update(0.2, -0.7)).toBe('down');
  });

  it('ignores small stick drift', () => {
    const f = new FlickDetector();
    for (let i = 0; i < 10; i++) expect(f.update(0.3, -0.2)).toBeNull();
  });

  it('reset() swallows a held direction until release', () => {
    const f = new FlickDetector();
    f.reset();
    expect(f.update(1, 0)).toBeNull();
    f.update(0, 0);
    expect(f.update(1, 0)).toBe('right');
  });
});

describe('swipeDir', () => {
  it('classifies screen drags (y down)', () => {
    expect(swipeDir(80, 5)).toBe('right');
    expect(swipeDir(-80, 10)).toBe('left');
    expect(swipeDir(5, -60)).toBe('up');
    expect(swipeDir(5, 60)).toBe('down');
    expect(swipeDir(10, 10)).toBeNull();
    expect(swipeDir(Number.NaN, 100)).toBeNull();
  });
});

describe('pickOnRay', () => {
  const targets = [
    { x: -1, y: 0, z: -5, r: 0.3 },
    { x: 0, y: 0, z: -5, r: 0.3 },
    { x: 1, y: 0, z: -5, r: 0.3 },
  ];
  it('picks the target the ray passes through', () => {
    expect(pickOnRay(0, 0, 0, 0, 0, -1, targets)).toBe(1);
    const d = Math.hypot(1, 5);
    expect(pickOnRay(0, 0, 0, 1 / d, 0, -5 / d, targets)).toBe(2);
  });
  it('misses when nothing is close and ignores targets behind', () => {
    expect(pickOnRay(0, 3, 0, 0, 0, -1, targets)).toBe(-1);
    expect(pickOnRay(0, 0, 0, 0, 0, 1, targets)).toBe(-1);
    expect(pickOnRay(0, 0, 0, 0, 0, -1, [null, { x: 0, y: 0, z: -2, r: 0 }])).toBe(-1);
  });
  it('prefers the better-centred target, then the nearer one', () => {
    const t = [
      { x: 0.2, y: 0, z: -3, r: 0.3 },
      { x: 0.05, y: 0, z: -3, r: 0.3 },
    ];
    expect(pickOnRay(0, 0, 0, 0, 0, -1, t)).toBe(1);
    const same = [
      { x: 0, y: 0, z: -6, r: 0.3 },
      { x: 0, y: 0, z: -3, r: 0.3 },
    ];
    expect(pickOnRay(0, 0, 0, 0, 0, -1, same)).toBe(1);
  });
  it('slack widens the reach', () => {
    const t = [{ x: 0.4, y: 0, z: -3, r: 0.3 }];
    expect(pickOnRay(0, 0, 0, 0, 0, -1, t)).toBe(-1);
    expect(pickOnRay(0, 0, 0, 0, 0, -1, t, 1.5)).toBe(0);
  });
});

describe('CircleAccumulator', () => {
  it('sums the swept angle of circling, both directions', () => {
    const c = new CircleAccumulator();
    for (let i = 0; i <= 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      c.update(100 + Math.cos(a) * 40, 100 + Math.sin(a) * 40, 100, 100);
    }
    expect(c.total).toBeCloseTo(Math.PI * 2, 3);
    for (let i = 36; i >= 18; i--) {
      const a = (i / 36) * Math.PI * 2;
      c.update(100 + Math.cos(a) * 40, 100 + Math.sin(a) * 40, 100, 100);
    }
    expect(c.total).toBeCloseTo(Math.PI * 3, 3);
  });
  it('ignores jitter at the centre and teleports', () => {
    const c = new CircleAccumulator();
    c.update(101, 100, 100, 100);
    c.update(100, 101, 100, 100);
    expect(c.total).toBe(0);
    c.update(140, 100, 100, 100);
    c.update(60, 101, 100, 100); // half a circle in one frame = a jump, not stirring
    expect(c.total).toBe(0);
    c.reset();
    expect(c.total).toBe(0);
  });
});

describe('stars + misc', () => {
  it('maps points to 1..3 stars, never 0', () => {
    expect(starsFrom(3, 2.75, 1.75)).toBe(3);
    expect(starsFrom(2, 2.75, 1.75)).toBe(2);
    expect(starsFrom(0, 2.75, 1.75)).toBe(1);
    expect(starsFrom(Number.NaN, 2.75, 1.75)).toBe(1);
  });
  it('shuffles deterministically without losing items', () => {
    const a = shuffled([1, 2, 3, 4, 5, 6], () => new Rng(7).next());
    const r1 = new Rng(42);
    const r2 = new Rng(42);
    const s1 = shuffled([1, 2, 3, 4, 5, 6], () => r1.next());
    const s2 = shuffled([1, 2, 3, 4, 5, 6], () => r2.next());
    expect(s1).toEqual(s2);
    expect([...s1].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a).toHaveLength(6);
  });
  it('yawToward follows the character yaw convention (0 = +Z)', () => {
    expect(yawToward(0, 0, 0, 1)).toBeCloseTo(0);
    expect(Math.abs(yawToward(0, 0, 0, -1))).toBeCloseTo(Math.PI);
    expect(yawToward(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2);
  });
});
