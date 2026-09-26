// Pure game logic for "Take out the trash" (no three.js, no DOM): the swinging-bag pendulum, the catch window, the
// toss charge / sweet zone / accuracy, the flight arc, a path helper and scoring. Unit-tested in tests/activities/trash/.
import type { Stars } from '../../plan/types';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// ── the swinging bag ─────────────────────────────────────────────────────────

export interface SwingTuning {
  /** Pendulum length (m): knot → bag centre. */
  length: number;
  gravity: number;
  /** Angular damping (1/s). */
  damping: number;
  /** How much of the hand's acceleration reaches the bag (a loose arm absorbs the rest). */
  coupling: number;
  /** Swing amplitude (rad) at which something starts slipping out. */
  slip: number;
  /** Hard clamp (rad). */
  maxAngle: number;
}

export const SWING: Readonly<SwingTuning> = {
  length: 0.5,
  gravity: 9.8,
  damping: 1.1,
  coupling: 0.34,
  slip: 0.55,
  maxAngle: 1.25,
};

/** Seconds Chris has to catch what's slipping. */
export const CATCH_WINDOW = 0.8;

/**
 * A 2-axis pendulum hanging from Chris's hand, driven by the hand's horizontal acceleration: starting, stopping and
 * turning sharply kick it; a steady walk lets it settle. `ax`/`az` = angles (rad) the bag swings toward world +X/+Z.
 */
export class Pendulum {
  ax = 0;
  az = 0;
  vx = 0;
  vz = 0;

  constructor(readonly t: Readonly<SwingTuning> = SWING) {}

  get omega(): number {
    return Math.sqrt(this.t.gravity / this.t.length);
  }

  /** Advance by dt with the hand's world acceleration (m/s²). Sub-stepped, stable for any dt. */
  step(dt: number, accX: number, accZ: number): void {
    if (!(dt > 0)) return;
    const ax = Number.isFinite(accX) ? accX : 0;
    const az = Number.isFinite(accZ) ? accZ : 0;
    const { gravity, length, damping, coupling, maxAngle } = this.t;
    const w2 = gravity / length;
    const n = Math.min(12, Math.max(1, Math.ceil(dt / (1 / 120))));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      // The bob lags behind the hand: forcing opposes the acceleration.
      this.vx += (-w2 * Math.sin(this.ax) - ((coupling * ax) / length) * Math.cos(this.ax) - damping * this.vx) * h;
      this.vz += (-w2 * Math.sin(this.az) - ((coupling * az) / length) * Math.cos(this.az) - damping * this.vz) * h;
      this.ax += this.vx * h;
      this.az += this.vz * h;
      if (Math.abs(this.ax) > maxAngle) {
        this.ax = Math.sign(this.ax) * maxAngle;
        this.vx = 0;
      }
      if (Math.abs(this.az) > maxAngle) {
        this.az = Math.sign(this.az) * maxAngle;
        this.vz = 0;
      }
    }
  }

  /** Phase-independent swing size (rad): angle and angular speed combined (energy-like). */
  amplitude(): number {
    const w = this.omega;
    return Math.sqrt(this.ax * this.ax + this.az * this.az + (this.vx * this.vx + this.vz * this.vz) / (w * w));
  }

  /** Calm the swing (a catch steadies the bag). */
  damp(k: number): void {
    const f = clamp01(k);
    this.ax *= f;
    this.az *= f;
    this.vx *= f;
    this.vz *= f;
  }

  reset(): void {
    this.ax = this.az = this.vx = this.vz = 0;
  }
}

/** Slip threshold after `drops` drops: the bag "settles" (squished down) so the morning never snowballs. */
export function slipThreshold(drops: number, base = SWING.slip): number {
  return base * (drops >= 2 ? 1.35 : 1);
}

/** World → Chris-local swing angles for the bag pivot (x = sideways, z = forward). */
export function toLocalSwing(ax: number, az: number, yaw: number): { side: number; fwd: number } {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return { side: ax * c - az * s, fwd: ax * s + az * c };
}

// ── toss ─────────────────────────────────────────────────────────────────────

export const TOSS = {
  /** Full ping-pong cycle of the wind-up meter (s). */
  period: 1.5,
  /** Sweet zone centre and half-width at the first attempt. */
  center: 0.72,
  halfWidth: 0.085,
  /** Extra half-width per missed toss (forgiving), capped. */
  widen: 0.035,
  maxHalfWidth: 0.16,
  /** Charges below this are a tap, not a throw ("hold it!"). */
  minCharge: 0.1,
} as const;

/** Wind-up meter value for `t` seconds of holding: 0 → 1 → 0 … (triangle wave). */
export function tossCharge(t: number, period: number = TOSS.period): number {
  if (!(t > 0)) return 0;
  const half = period / 2;
  const u = (t / half) % 2;
  return u <= 1 ? u : 2 - u;
}

export interface Band {
  lo: number;
  hi: number;
}

export function tossBand(misses: number): Band {
  const hw = Math.min(TOSS.maxHalfWidth, TOSS.halfWidth + TOSS.widen * Math.max(0, misses));
  return { lo: TOSS.center - hw, hi: TOSS.center + hw };
}

export type TossJudge = 'in' | 'short' | 'long';

export function judgeToss(v: number, band: Band): TossJudge {
  if (v < band.lo) return 'short';
  if (v > band.hi) return 'long';
  return 'in';
}

/** 1 at the band centre, 0.5 at its edges, 0 outside. */
export function tossAccuracy(v: number, band: Band): number {
  if (v < band.lo || v > band.hi) return 0;
  const c = (band.lo + band.hi) / 2;
  const hw = Math.max(1e-6, (band.hi - band.lo) / 2);
  return clamp01(1 - (0.5 * Math.abs(v - c)) / hw);
}

/** Point on a parabolic arc from a to b peaking `h` above the straight line, u ∈ 0..1. Writes `out`. */
export function arcPoint<T extends { x: number; y: number; z: number }>(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, h: number, u: number, out: T): T {
  const k = clamp01(u);
  out.x = a.x + (b.x - a.x) * k;
  out.y = a.y + (b.y - a.y) * k + 4 * h * k * (1 - k);
  out.z = a.z + (b.z - a.z) * k;
  return out;
}

// ── route ────────────────────────────────────────────────────────────────────

/** The point `d` metres along a polyline (clamped to its end). */
export function pointAlong(path: readonly { x: number; z: number }[], d: number): { x: number; y: number; z: number } | null {
  if (path.length === 0) return null;
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    if (seg >= left && seg > 1e-9) {
      const k = left / seg;
      return { x: a.x + (b.x - a.x) * k, y: 0, z: a.z + (b.z - a.z) * k };
    }
    left -= seg;
  }
  const last = path[path.length - 1]!;
  return { x: last.x, y: 0, z: last.z };
}

// ── scoring ──────────────────────────────────────────────────────────────────

export interface TrashTally {
  /** Seconds from the bag coming out of the can to the bag landing in the bin. */
  seconds: number;
  /** Banana peels dropped. */
  drops: number;
  /** Tosses that bounced off the rim. */
  tossMisses: number;
  /** Accuracy (0.5..1) of the toss that went in. */
  accuracy: number;
}

export const TRASH_PAR = 30;

const DROP_SCORE = [1, 0.55, 0.25, 0] as const;
const MISS_SCORE = [1, 0.7, 0.5, 0.35] as const;

/** 0..1: no drops (40 %) + toss accuracy (35 %) + time (25 %). */
export function trashScore(t: TrashTally): number {
  const drop = DROP_SCORE[Math.min(3, Math.max(0, t.drops))]!;
  const acc = 0.6 + 0.8 * (clamp01(t.accuracy) - 0.5);
  const toss = clamp01(acc) * MISS_SCORE[Math.min(3, Math.max(0, t.tossMisses))]!;
  const time = t.seconds <= TRASH_PAR ? 1 : clamp01(1 - (t.seconds - TRASH_PAR) / TRASH_PAR);
  return 0.4 * drop + 0.35 * toss + 0.25 * time;
}

/** 1..3 — never 0: the bag always makes it eventually. */
export function trashStars(t: TrashTally): Stars {
  const s = trashScore(t);
  return s >= 0.82 ? 3 : s >= 0.55 ? 2 : 1;
}

export function trashFlags(t: TrashTally): string[] {
  const f: string[] = [];
  if (t.drops === 0) f.push('trash:clean');
  if (t.tossMisses === 0 && t.accuracy >= 0.85) f.push('trash:swish');
  return f;
}
