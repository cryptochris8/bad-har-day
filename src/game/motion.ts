// Pure movement helpers shared by the walker and the NPC director (unit-tested).
import type { Vec3Like } from '../render/types';

export const TAU = Math.PI * 2;

/** Wrap an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a <= -Math.PI ? a + TAU : a;
}

/** Yaw that faces the direction (dx, dz) with the character convention "yaw 0 faces +Z". */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** Turn `from` toward `to` by at most `maxStep` rad (shortest way). */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  if (Math.abs(d) <= maxStep) return wrapAngle(to);
  return wrapAngle(from + Math.sign(d) * maxStep);
}

/** Screen-relative stick → world XZ for the fixed dollhouse camera (screen-up = −Z). */
export function stickToWorld(moveX: number, moveY: number): { x: number; z: number } {
  return { x: moveX, z: -moveY };
}

export interface PathCursor {
  x: number;
  z: number;
  /** Index of the waypoint being walked to. */
  i: number;
  done: boolean;
}

/**
 * Advance a point along a polyline of waypoints by `dist` metres. Mutates and returns the cursor.
 * Arrival: done = true when the last waypoint is reached.
 */
export function stepPath(c: PathCursor, path: readonly Vec3Like[], dist: number): PathCursor {
  let left = dist;
  while (left > 0 && c.i < path.length) {
    const p = path[c.i]!;
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d <= left) {
      c.x = p.x;
      c.z = p.z;
      left -= d;
      c.i++;
    } else {
      c.x += (dx / d) * left;
      c.z += (dz / d) * left;
      left = 0;
    }
  }
  c.done = c.i >= path.length;
  return c;
}

/** Total length of a path starting at (x, z). */
export function pathLength(x: number, z: number, path: readonly Vec3Like[]): number {
  let len = 0;
  let px = x;
  let pz = z;
  for (const p of path) {
    len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len;
}

/** Frame-rate independent smoothing factor. */
export function smoothK(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}
