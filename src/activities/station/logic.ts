// ─────────────────────────────────────────────────────────────────────────────
// Station helpers — PURE logic shared by the close-up station chores (coffee, lunch, dishes):
// easing, stick flicks, swipe classification, ray picking, stir circles, stars.
// No Three.js / DOM here (unit-tested in tests/activities/station).
// ─────────────────────────────────────────────────────────────────────────────

export type Dir = 'left' | 'right' | 'up' | 'down';

export const clamp01 = (v: number): number => (v <= 0 || !Number.isFinite(v) ? 0 : v >= 1 ? 1 : v);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smooth ease in/out 0..1. */
export const smooth = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Ease out with a little overshoot (props landing). */
export function easeOutBack(t: number, k = 1.6): number {
  const x = clamp01(t) - 1;
  return 1 + x * x * ((k + 1) * x + k);
}

/** Parabolic hop height at progress t (0 at both ends, `h` at the middle). */
export const hop = (t: number, h: number): number => {
  const x = clamp01(t);
  return 4 * h * x * (1 - x);
};

/** Frame-rate independent approach toward a target. */
export const approach = (cur: number, target: number, rate: number, dt: number): number => cur + (target - cur) * (1 - Math.exp(-rate * dt));

/**
 * Stick / arrow-key / D-pad FLICKS → one direction event per push. Fires when the stick crosses `on` along its
 * dominant axis; re-arms once it returns inside `off`. Analog sticks and digital keys behave the same.
 */
export class FlickDetector {
  private armed = true;

  constructor(
    private readonly on = 0.55,
    private readonly off = 0.3,
  ) {}

  update(moveX: number, moveY: number): Dir | null {
    const ax = Math.abs(moveX);
    const ay = Math.abs(moveY);
    const mag = Math.max(ax, ay);
    if (!this.armed) {
      if (mag < this.off) this.armed = true;
      return null;
    }
    if (mag < this.on) return null;
    this.armed = false;
    if (ax >= ay) return moveX > 0 ? 'right' : 'left';
    return moveY > 0 ? 'up' : 'down';
  }

  reset(): void {
    this.armed = false;
  }
}

/**
 * Classify a screen-space drag (CSS px, y DOWN) as a swipe direction, or null when it is too short.
 * The dominant axis wins; `minLen` is the minimum drag length.
 */
export function swipeDir(dx: number, dy: number, minLen = 36): Dir | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.hypot(dx, dy) < minLen) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

/** A pick target: a sphere (world centre + radius). */
export interface PickSphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

/**
 * Forgiving ray pick: the target whose centre is closest to the ray RELATIVE to its radius (distance / r < 1),
 * ties → nearer along the ray. Targets behind the ray origin are ignored. Returns the index or −1.
 * (dx, dy, dz) must be normalised.
 */
export function pickOnRay(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  targets: readonly (PickSphere | null)[],
  slack = 1,
): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t || !(t.r > 0)) continue;
    const vx = t.x - ox;
    const vy = t.y - oy;
    const vz = t.z - oz;
    const along = vx * dx + vy * dy + vz * dz;
    if (along <= 0) continue;
    const px = vx - dx * along;
    const py = vy - dy * along;
    const pz = vz - dz * along;
    const off = Math.sqrt(px * px + py * py + pz * pz) / (t.r * slack);
    if (off >= 1) continue;
    // Mostly "how centred", a hint of depth so a closer, equally centred target wins.
    const score = off + along * 0.02;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * Accumulates how far a pointer circles around a centre (screen px): the absolute swept angle, ignoring jitter
 * very close to the centre. One full circle ≈ 2π.
 */
export class CircleAccumulator {
  total = 0;
  private lastA: number | null = null;

  constructor(private readonly minRadius = 12) {}

  update(x: number, y: number, cx: number, cy: number): number {
    const dx = x - cx;
    const dy = y - cy;
    if (Math.hypot(dx, dy) < this.minRadius) {
      this.lastA = null;
      return this.total;
    }
    const a = Math.atan2(dy, dx);
    if (this.lastA !== null) {
      let d = a - this.lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // A single frame can't sweep more than ~90° from real circling; bigger jumps are teleports.
      if (Math.abs(d) < Math.PI / 2) this.total += Math.abs(d);
    }
    this.lastA = a;
    return this.total;
  }

  reset(): void {
    this.total = 0;
    this.lastA = null;
  }
}

/** Points → stars (1..3, never 0). `three` / `two` are the minimum points for 3 / 2 stars. */
export function starsFrom(points: number, three: number, two: number): 1 | 2 | 3 {
  if (!Number.isFinite(points)) return 1;
  return points >= three ? 3 : points >= two ? 2 : 1;
}

/** Deterministic Fisher–Yates with a uniform [0,1) source (the activity's seeded Rng). */
export function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(next() * (i + 1)));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** Yaw (0 = facing +Z) that faces from (x0, z0) toward (x1, z1). */
export const yawToward = (x0: number, z0: number, x1: number, z1: number): number => Math.atan2(x1 - x0, z1 - z0);

// ── portrait framing ─────────────────────────────────────────────────────────

export interface PortraitFraming {
  /** Distance multiplier at full portrait (< 1 = move in; the rig widens the FOV on narrow screens). */
  zoom: number;
  /** Raise the subject by this fraction of the half-screen height (clears the centred prompt / thumb zone). */
  lift: number;
  /** Move the subject left by this fraction of the half-screen width (clears the right-hand cards). */
  left: number;
}

/** 0 on landscape-ish screens (aspect ≥ 0.9) → 1 on a tall phone (aspect ≤ 0.5). */
export function portraitAmount(aspect: number): number {
  if (!(aspect > 0)) return 0;
  return clamp01((0.9 - aspect) / 0.4);
}

interface GoalLike {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/**
 * Pure: adapt a close-up goal (designed for 16:9) to a tall screen. `vfovDeg` = the vertical FOV the rig will
 * really use on this aspect. Moves the camera in along its view line, then slides camera + target so the subject
 * sits higher (and a little left) on screen. Writes into `out` (may alias nothing in `g`).
 */
export function portraitGoal(g: GoalLike, aspect: number, vfovDeg: number, f: PortraitFraming, out: GoalLike): GoalLike {
  const k = portraitAmount(aspect);
  const zoom = 1 + (f.zoom - 1) * k;
  const tx = g.target.x;
  const ty = g.target.y;
  const tz = g.target.z;
  const px = tx + (g.position.x - tx) * zoom;
  const py = ty + (g.position.y - ty) * zoom;
  const pz = tz + (g.position.z - tz) * zoom;
  const dist = Math.hypot(px - tx, py - ty, pz - tz);
  const halfV = Math.tan((Math.max(1, Math.min(170, vfovDeg)) * Math.PI) / 360) * dist;
  const dy = -f.lift * k * halfV;
  // "Left on screen" = move the camera and target toward screen-right (+X for these north-wall stations).
  const dx = f.left * k * halfV * Math.max(0.1, aspect);
  out.position.x = px + dx;
  out.position.y = py + dy;
  out.position.z = pz;
  out.target.x = tx + dx;
  out.target.y = ty + dy;
  out.target.z = tz;
  return out;
}
