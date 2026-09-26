import { describe, expect, it } from 'vitest';
import { CollisionWorld, pushOutCircle, pushOutRect } from '../../src/world/collision';
import { rect } from '../../src/world/layout';
import { buildPhysics } from '../../src/world/physics';

describe('primitive push-out', () => {
  it('pushes a circle out of a rect along the shortest way', () => {
    const p = { x: 0.1, z: 0.5 };
    expect(pushOutRect(p, 0.3, 0.2, 0, 1, 1)).toBe(true);
    expect(p.x).toBeCloseTo(-0.1, 6);
    const q = { x: 5, z: 5 };
    expect(pushOutRect(q, 0.3, 0, 0, 1, 1)).toBe(false);
  });
  it('pushes a circle out of a circle', () => {
    const p = { x: 0.2, z: 0 };
    expect(pushOutCircle(p, 0.3, 0, 0, 0.5)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.8, 6);
  });
});

describe('CollisionWorld', () => {
  const w = new CollisionWorld(rect(-10, -10, 10, 10), [rect(-0.1, -5, 0.1, 5)], [{ x: 5, z: 0, r: 1 }]);
  const out = { x: 0, z: 0 };

  it('stops at walls and slides along them', () => {
    // moving diagonally into the wall at x = 0 from the left: x is blocked, z keeps going (slide)
    w.move(-1, 0, 0.3, 2, 1, out);
    expect(out.x).toBeLessThanOrEqual(-0.4 + 1e-6);
    expect(out.z).toBeCloseTo(1, 1);
  });

  it('cannot tunnel through a thin wall with a big step', () => {
    w.move(-0.5, 0, 0.3, 5, 0, out);
    expect(out.x).toBeLessThan(0);
  });

  it('slides around circles and clamps to bounds', () => {
    w.move(3, 0.05, 0.3, 2, 0, out);
    expect(Math.hypot(out.x - 5, out.z)).toBeGreaterThanOrEqual(1.3 - 1e-6);
    w.move(9, 9, 0.3, 5, 5, out);
    expect(out.x).toBeLessThanOrEqual(9.7 + 1e-9);
    expect(out.z).toBeLessThanOrEqual(9.7 + 1e-9);
  });

  it('free() reports overlaps', () => {
    expect(w.free(-3, 0, 0.3)).toBe(true);
    expect(w.free(0, 0, 0.3)).toBe(false);
    expect(w.free(5.5, 0, 0.3)).toBe(false);
    expect(w.free(-9.9, 0, 0.3)).toBe(false); // outside bounds
  });

  it('dynamic rects block only while active', () => {
    const d = w.addDynamic(rect(-6, -1, -5.8, 1), true);
    w.move(-4, 0, 0.3, -3, 0, out);
    expect(out.x).toBeGreaterThan(-5.8);
    d.active = false;
    w.move(-4, 0, 0.3, -3, 0, out);
    expect(out.x).toBeCloseTo(-7, 5);
  });
});

describe('house collision', () => {
  const ph = buildPhysics();
  const out = { x: 0, z: 0 };

  it('closed front door blocks, open door lets you through', () => {
    // walk from the entry straight out of the front door (+Z)
    ph.doors.front.active = true;
    ph.col.move(-1.6, 3.4, 0.28, 0, 2.5, out);
    expect(out.z).toBeLessThan(4.5);
    ph.doors.front.active = false;
    ph.col.move(-1.6, 3.4, 0.28, 0, 2.5, out);
    expect(out.z).toBeGreaterThan(5.5);
    ph.doors.front.active = true;
  });

  it('closed back door blocks the way to the yard', () => {
    ph.doors.back.active = true;
    ph.col.move(8.3, -4.57, 0.28, 2, 0, out);
    expect(out.x).toBeLessThan(9);
    ph.doors.back.active = false;
    ph.col.move(8.3, -4.57, 0.28, 2, 0, out);
    expect(out.x).toBeGreaterThan(9.5);
    ph.doors.back.active = true;
  });

  it('walls stop you but archways let you walk between rooms', () => {
    // hall → twins through the arch at x ≈ −2.4
    ph.col.move(-2.4, -1.4, 0.28, 0, -2.0, out);
    expect(out.z).toBeLessThan(-3.2);
    // hall → twins through solid wall at x = −4.5: blocked
    ph.col.move(-4.5, -1.4, 0.28, 0, -2.0, out);
    expect(out.z).toBeGreaterThan(-2.2);
  });

  it('move() is allocation-light: same output object, repeated calls stable', () => {
    for (let i = 0; i < 1000; i++) ph.col.move(3, 2, 0.28, 0.01, 0, out);
    expect(Number.isFinite(out.x)).toBe(true);
  });
});
