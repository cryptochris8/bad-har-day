import { describe, expect, it } from 'vitest';
import { ahead, bedRoot, freeSpotNear, nearestInReach, nearestOnScreen, yawTo } from '../../../src/activities/wake/geo';

describe('hotspot picking', () => {
  it('nearestInReach picks the closest enabled item within its own reach', () => {
    const items = [
      { x: 0, z: 0, r: 1.2, enabled: true },
      { x: 0.5, z: 0, r: 1.2, enabled: true },
      { x: 0.2, z: 0, r: 1.2, enabled: false },
      { x: 5, z: 5, r: 1.2, enabled: true },
    ];
    expect(nearestInReach(0.6, 0, items)).toBe(1);
    expect(nearestInReach(-0.3, 0, items)).toBe(0);
    expect(nearestInReach(3, 3, items)).toBe(-1);
    expect(nearestInReach(5.5, 5, items)).toBe(3);
  });

  it('nearestOnScreen respects the pixel radius and visibility', () => {
    const pts = [
      { x: 100, y: 100, ok: true },
      { x: 130, y: 100, ok: false },
      { x: 300, y: 300, ok: true },
    ];
    expect(nearestOnScreen(125, 100, pts, 60)).toBe(0);
    expect(nearestOnScreen(200, 200, pts, 60)).toBe(-1);
    expect(nearestOnScreen(290, 310, pts, 60)).toBe(2);
  });
});

describe('places', () => {
  it('freeSpotNear prefers the given direction and skips blocked spots', () => {
    const out = { x: 0, z: 0 };
    // everything free: straight along +X (yaw π/2) at the first radius
    expect(freeSpotNear(() => true, 0, 0, Math.PI / 2, out, [1])).toBe(true);
    expect(out.x).toBeCloseTo(1, 6);
    expect(out.z).toBeCloseTo(0, 6);
    // +X side blocked → the nearest free direction next to it
    const free = (x: number) => x < 0.5;
    expect(freeSpotNear(free, 0, 0, Math.PI / 2, out, [1])).toBe(true);
    expect(out.x).toBeLessThan(0.5);
    // nothing fits
    expect(freeSpotNear(() => false, 3, 4, 0, out)).toBe(false);
    expect(out).toEqual({ x: 3, z: 4 });
  });

  it('bedRoot moves half a body toward the headboard (the bed anchor is the feet)', () => {
    // yaw 0: head toward −Z
    const p = bedRoot({ x: 1, z: 2, yaw: 0 }, 1.4);
    expect(p.x).toBeCloseTo(1, 6);
    expect(p.z).toBeCloseTo(1.3, 6);
    const q = bedRoot({ x: 0, z: 0, yaw: Math.PI / 2 }, 1);
    expect(q.x).toBeCloseTo(-0.5, 6);
  });

  it('yawTo / ahead agree (0 = +Z)', () => {
    expect(yawTo(0, 0, 0, 1)).toBeCloseTo(0, 6);
    expect(yawTo(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2, 6);
    const a = ahead({ x: 1, z: 1, yaw: yawTo(1, 1, 4, 5) }, 5);
    expect(a.x).toBeCloseTo(4, 6);
    expect(a.z).toBeCloseTo(5, 6);
  });
});
