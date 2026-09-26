import { describe, expect, it } from 'vitest';
import { pathLength, stepPath, stickToWorld, turnToward, wrapAngle, yawOf } from '../../src/game/motion';

describe('motion helpers', () => {
  it('wraps angles into (−π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(Math.PI / 2 + Math.PI * 4)).toBeCloseTo(Math.PI / 2);
  });

  it('yaw 0 faces +Z, π/2 faces +X', () => {
    expect(yawOf(0, 1)).toBeCloseTo(0);
    expect(yawOf(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(Math.abs(yawOf(0, -1))).toBeCloseTo(Math.PI);
  });

  it('turns the short way and never overshoots', () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // across ±π
    expect(turnToward(0.9, 1, 0.5)).toBeCloseTo(1);
  });

  it('stick up walks toward −Z (away from the camera)', () => {
    expect(stickToWorld(0, 1)).toEqual({ x: 0, z: -1 });
    expect(stickToWorld(1, 0)).toEqual({ x: 1, z: -0 });
  });

  it('steps along a path and reports arrival', () => {
    const path = [
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 0, z: 4 },
    ];
    expect(pathLength(0, 0, path)).toBeCloseTo(7);
    const c = { x: 0, z: 0, i: 0, done: false };
    stepPath(c, path, 2);
    expect(c.x).toBeCloseTo(2);
    expect(c.done).toBe(false);
    stepPath(c, path, 3);
    expect(c.x).toBeCloseTo(3);
    expect(c.z).toBeCloseTo(2);
    stepPath(c, path, 10);
    expect(c.done).toBe(true);
    expect(c.z).toBeCloseTo(4);
  });
});
