// ─────────────────────────────────────────────────────────────────────────────
// Drive model (pure, unit-tested): the minivan's longitudinal speed (auto-cruise,
// GAS, BRAKE), lane changes (two lanes + the drop-off bay), speed caps from stop
// lines / obstacles, and the soft "Oops!" wobble. Route space: s = distance along
// the road, x = lateral (+x = right side of travel). No Three.js here.
// ─────────────────────────────────────────────────────────────────────────────
import { LANE_X } from '../../world/types';

export const CAR = {
  /** Half length / half width of the minivan footprint (m). */
  halfLen: 2.45,
  halfWidth: 0.98,
} as const;

export const TUNE = {
  /** Auto-cruise speed with no input (m/s). */
  cruise: 8,
  /** Top speed holding GAS (m/s). */
  max: 14,
  /** Acceleration toward cruise (no input) / toward max (GAS). */
  accel: 2.6,
  gasAccel: 4.4,
  /** Full brake deceleration. */
  brake: 10.5,
  /** Coast-down toward a lower target. */
  coast: 1.6,
  /** Comfortable stop deceleration the car uses once the player has reacted (braked) near a stop. */
  comfort: 5,
  /** Stop-line assist when the player did NOT react: stops the car right at the line (a playful "tsk"). */
  assist: 8,
  /** Needed deceleration above which an obstacle ahead means an "Oops!" (soft emergency stop). */
  emergency: 9.5,
  /** Emergency stop deceleration (cartoon screech). */
  hard: 26,
  /** Lateral spring (rad/s) for lane changes. */
  laneOmega: 5.2,
  /** Speed cap in the drop-off bay. */
  bayCap: 6,
} as const;

export interface CarState {
  /** Centre position along the route (m). */
  s: number;
  /** Speed (m/s, ≥ 0). */
  v: number;
  /** Lateral position and velocity. */
  x: number;
  xv: number;
  /** Target lane: 0 = left, 1 = right, 2 = drop-off bay. */
  lane: number;
  /** Wobble spring (pitch-ish, rad) and its velocity — bumps and hard stops kick it. */
  wobble: number;
  wobbleV: number;
  /** Emergency stop in progress (decelerating hard until `hardTo`). */
  hard: boolean;
  hardTo: number;
  /** Braking this frame (brake lights). */
  braking: boolean;
  /** Distance travelled this frame (wheel roll). */
  ds: number;
}

export function newCar(s = 0, lane = 1, v = 0): CarState {
  const x = LANE_X[lane] ?? 1.8;
  return { s, v, x, xv: 0, lane, wobble: 0, wobbleV: 0, hard: false, hardTo: 0, braking: false, ds: 0 };
}

/** Lane centre x (lane 2 = the drop-off bay at `bayX`). */
export function laneCenter(lane: number, bayX: number): number {
  if (lane >= 2) return bayX;
  return LANE_X[lane <= 0 ? 0 : 1] ?? 1.8;
}

/** Car front / rear along s. */
export const frontOf = (c: CarState): number => c.s + CAR.halfLen;

/**
 * Longitudinal speed step from input only (no caps): BRAKE decelerates, GAS accelerates toward `max`, no input
 * approaches the auto-cruise speed. `gas`, `brake` are 0..1 (analog sticks). `cruise` may be lowered (bay).
 */
export function speedStep(v: number, gas: number, brake: number, dt: number, cruise: number = TUNE.cruise): number {
  if (!(dt > 0)) return v;
  const g = gas > 0 ? Math.min(1, gas) : 0;
  const b = brake > 0 ? Math.min(1, brake) : 0;
  if (b > 0.05) return Math.max(0, v - TUNE.brake * b * dt);
  const target = cruise + (Math.max(cruise, TUNE.max) - cruise) * g;
  if (v < target) return Math.min(target, v + (g > 0.05 ? TUNE.gasAccel : TUNE.accel) * dt);
  return Math.max(target, v - TUNE.coast * dt);
}

/** Max speed that still stops within `dist` at deceleration `decel` (plus a moving target's speed). */
export function stopCap(dist: number, decel: number, vTarget = 0): number {
  return vTarget + Math.sqrt(2 * decel * Math.max(0, dist));
}

/** Deceleration needed to slow from v to vTarget within dist (∞ when dist ≤ 0 and still faster). */
export function neededDecel(v: number, vTarget: number, dist: number): number {
  const dv = v - vTarget;
  if (dv <= 0) return 0;
  if (dist <= 0.01) return Number.POSITIVE_INFINITY;
  return (dv * dv) / (2 * dist);
}

/**
 * Lane-change request. `maxLane` is 2 while the drop-off bay is reachable, else 1. Returns the new target lane.
 */
export function changeLane(lane: number, delta: number, maxLane: number): number {
  if (delta === 0) return lane;
  const n = lane + (delta > 0 ? 1 : -1);
  return Math.max(0, Math.min(maxLane, n));
}

/** Critically damped lateral move toward targetX (mutates c.x / c.xv). */
export function lateralStep(c: CarState, targetX: number, dt: number): void {
  if (!(dt > 0)) return;
  const w = TUNE.laneOmega;
  // exact critically damped step (stable at any dt)
  const d = c.x - targetX;
  const e = Math.exp(-w * dt);
  const nx = (d + (c.xv + w * d) * dt) * e;
  const nv = (c.xv - (c.xv + w * d) * w * dt) * e;
  c.x = targetX + nx;
  c.xv = nv;
}

/** Wobble spring update (underdamped: a funny bounce after a bump). */
export function wobbleStep(c: CarState, dt: number): void {
  if (!(dt > 0)) return;
  const k = 90;
  const damp = 7;
  c.wobbleV += (-k * c.wobble - damp * c.wobbleV) * dt;
  c.wobble += c.wobbleV * dt;
  if (Math.abs(c.wobble) < 1e-4 && Math.abs(c.wobbleV) < 1e-3) {
    c.wobble = 0;
    c.wobbleV = 0;
  }
}

/** Kick the wobble (bump / hard stop): forward pitch for a stop, a sideways shimmy for a ball bonk. */
export function kickWobble(c: CarState, amount: number): void {
  c.wobbleV += amount;
}

/** Visual steer angle (rad) for the front wheels + body yaw from the lateral velocity. */
export function steerOf(c: CarState): number {
  const v = Math.max(1.5, c.v);
  return Math.max(-0.5, Math.min(0.5, (c.xv / v) * 2.2));
}

/** Body yaw offset (rad) from the lateral velocity (heading along the path). */
export function headingOf(c: CarState): number {
  const v = Math.max(0.5, c.v);
  return Math.atan2(c.xv, v);
}
