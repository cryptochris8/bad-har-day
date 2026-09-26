// ─────────────────────────────────────────────────────────────────────────────
// Hair sway: a few Verlet nodes per lock, simulated in HEAD SPACE (pure, allocation-free).
//
// The rig feeds the head's frame-to-frame motion as a matrix D = inverse(M_now) × M_prev, which
// re-expresses last frame's node positions in the new head frame — i.e. the nodes stay where they
// were in the WORLD while the head moved, so walking, turning and hair flips swing the hair
// naturally. Gravity arrives already rotated into head space.
//
// Per fixed step: Verlet integrate (drag, velocity clamp) → gentle pull toward the styled rest
// shape (stiffer near the roots) → follow-the-leader length constraints → collisions (head
// ellipsoid, the back plane, shoulders/chest for face-framing locks). Unconditionally stable:
// every correction is a position projection with a fraction ≤ 1.
// ─────────────────────────────────────────────────────────────────────────────

export const COLLIDE_HEAD = 1;
export const COLLIDE_BACK = 2;
export const COLLIDE_FRONT = 4;

export interface SimColliders {
  rx: number;
  ry: number;
  rz: number;
  /** Nodes below this y (head space) are kept behind `backZ`. */
  neckY: number;
  backZ: number;
  shoulderY: number;
  shoulderHalfWidth: number;
  /** Shoulder spheres at (±shoulderX, shoulderCY, torsoZ), radius shoulderR. */
  shoulderX: number;
  shoulderCY: number;
  shoulderR: number;
  torsoZ: number;
  chestZ: number;
}

/** In-place affine transform of n packed xyz points by a column-major 4×4 matrix. */
export function transformPoints(a: Float32Array, n: number, d: ArrayLike<number>): void {
  const e0 = d[0]!, e1 = d[1]!, e2 = d[2]!, e4 = d[4]!, e5 = d[5]!, e6 = d[6]!;
  const e8 = d[8]!, e9 = d[9]!, e10 = d[10]!, e12 = d[12]!, e13 = d[13]!, e14 = d[14]!;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const x = a[o]!;
    const y = a[o + 1]!;
    const z = a[o + 2]!;
    a[o] = e0 * x + e4 * y + e8 * z + e12;
    a[o + 1] = e1 * x + e5 * y + e9 * z + e13;
    a[o + 2] = e2 * x + e6 * y + e10 * z + e14;
  }
}

export const SIM_STEP = 1 / 120;
export const SIM_MAX_STEPS = 8;

export class HairSim {
  readonly n: number;
  readonly pos: Float32Array;
  readonly prev: Float32Array;
  /** Rest (target) positions — the rig rewrites them when the style changes (bedhead). */
  readonly rest: Float32Array;
  readonly restLen: Float32Array;
  readonly pinned: Uint8Array;
  /** Per-node pull toward rest per step (0..1). */
  readonly shape: Float32Array;
  /** Per-node collision margin (m) = lock half-depth + a little. */
  readonly margin: Float32Array;
  readonly flags: Uint8Array;
  /** Chain start index per node (so constraints know their parent). */
  readonly parent: Int32Array;
  drag = 0.03;
  /** Max displacement per step (m) — velocity clamp. */
  maxStep = 0.035;
  private acc = 0;

  constructor(
    n: number,
    readonly col: SimColliders,
  ) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.rest = new Float32Array(n * 3);
    this.restLen = new Float32Array(n);
    this.pinned = new Uint8Array(n);
    this.shape = new Float32Array(n);
    this.margin = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.parent = new Int32Array(n).fill(-1);
  }

  /** Recompute rest lengths from the current rest positions (after the rest shape changed). */
  updateRestLengths(): void {
    const r = this.rest;
    for (let i = 0; i < this.n; i++) {
      const p = this.parent[i]!;
      if (p < 0) {
        this.restLen[i] = 0;
        continue;
      }
      const dx = r[i * 3]! - r[p * 3]!;
      const dy = r[i * 3 + 1]! - r[p * 3 + 1]!;
      const dz = r[i * 3 + 2]! - r[p * 3 + 2]!;
      this.restLen[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
  }

  /** Snap every node to its rest position with zero velocity. */
  reset(): void {
    this.pos.set(this.rest);
    this.prev.set(this.rest);
    this.acc = 0;
  }

  /**
   * Re-express node positions after the head frame moved: p ← D·p for pos and prev (D = column-major 4×4,
   * inverse(M_now) × M_prev). Pinned nodes are re-pinned to rest afterwards in step().
   */
  transfer(d: ArrayLike<number>): void {
    transformPoints(this.pos, this.n, d);
    transformPoints(this.prev, this.n, d);
  }

  /** Add a velocity kick (m per step) to a node. */
  kick(i: number, dx: number, dy: number, dz: number): void {
    if (this.pinned[i]) return;
    this.prev[i * 3]! -= dx;
    this.prev[i * 3 + 1]! -= dy;
    this.prev[i * 3 + 2]! -= dz;
  }

  /**
   * Advance by dt (clamped) in fixed SIM_STEP substeps. `gx, gy, gz` = gravity in head space (m/s²).
   * Returns the number of substeps taken.
   */
  advance(dt: number, gx: number, gy: number, gz: number): number {
    if (!(dt > 0)) return 0;
    this.acc += Math.min(dt, SIM_STEP * SIM_MAX_STEPS);
    let steps = 0;
    while (this.acc >= SIM_STEP && steps < SIM_MAX_STEPS) {
      this.acc -= SIM_STEP;
      this.step(gx, gy, gz);
      steps++;
    }
    if (steps >= SIM_MAX_STEPS) this.acc = 0;
    return steps;
  }

  /** One fixed step. */
  step(gx: number, gy: number, gz: number): void {
    const h2 = SIM_STEP * SIM_STEP;
    const { pos, prev, rest, shape } = this;
    const keep = 1 - this.drag;
    const maxS = this.maxStep;
    for (let i = 0; i < this.n; i++) {
      const o = i * 3;
      if (this.pinned[i]) {
        pos[o] = prev[o] = rest[o]!;
        pos[o + 1] = prev[o + 1] = rest[o + 1]!;
        pos[o + 2] = prev[o + 2] = rest[o + 2]!;
        continue;
      }
      let vx = (pos[o]! - prev[o]!) * keep;
      let vy = (pos[o + 1]! - prev[o + 1]!) * keep;
      let vz = (pos[o + 2]! - prev[o + 2]!) * keep;
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (sp > maxS) {
        const k = maxS / sp;
        vx *= k;
        vy *= k;
        vz *= k;
      }
      prev[o] = pos[o]!;
      prev[o + 1] = pos[o + 1]!;
      prev[o + 2] = pos[o + 2]!;
      let x = pos[o]! + vx + gx * h2;
      let y = pos[o + 1]! + vy + gy * h2;
      let z = pos[o + 2]! + vz + gz * h2;
      const s = shape[i]!;
      x += (rest[o]! - x) * s;
      y += (rest[o + 1]! - y) * s;
      z += (rest[o + 2]! - z) * s;
      pos[o] = x;
      pos[o + 1] = y;
      pos[o + 2] = z;
    }
    // Follow-the-leader length constraints + collisions (parents always precede children).
    for (let i = 0; i < this.n; i++) {
      const p = this.parent[i]!;
      if (p < 0 || this.pinned[i]) continue;
      const o = i * 3;
      const q = p * 3;
      let dx = pos[o]! - pos[q]!;
      let dy = pos[o + 1]! - pos[q + 1]!;
      let dz = pos[o + 2]! - pos[q + 2]!;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const L = this.restLen[i]!;
      if (l > 1e-6) {
        const k = L / l;
        dx *= k;
        dy *= k;
        dz *= k;
      } else {
        dx = 0;
        dy = -L;
        dz = 0;
      }
      pos[o] = pos[q]! + dx;
      pos[o + 1] = pos[q + 1]! + dy;
      pos[o + 2] = pos[q + 2]! + dz;
      this.collide(i);
    }
  }

  private collide(i: number): void {
    const c = this.col;
    const f = this.flags[i]!;
    const m = this.margin[i]!;
    const pos = this.pos;
    const o = i * 3;
    if (f & COLLIDE_HEAD) {
      const ax = c.rx + m;
      const ay = c.ry + m;
      const az = c.rz + m;
      const x = pos[o]!;
      const y = pos[o + 1]!;
      const z = pos[o + 2]!;
      const e = (x * x) / (ax * ax) + (y * y) / (ay * ay) + (z * z) / (az * az);
      if (e < 1 && e > 1e-8) {
        const k = 1 / Math.sqrt(e);
        pos[o] = x * k;
        pos[o + 1] = y * k;
        pos[o + 2] = z * k;
      }
    }
    if (f & COLLIDE_BACK) {
      if (pos[o + 1]! < c.neckY) {
        const lim = c.backZ - m;
        if (pos[o + 2]! > lim) pos[o + 2] = lim;
      }
    }
    if (f & COLLIDE_FRONT) {
      for (let s = -1; s <= 1; s += 2) {
        const cx = s * c.shoulderX;
        const dx = pos[o]! - cx;
        const dy = pos[o + 1]! - c.shoulderCY;
        const dz = pos[o + 2]! - c.torsoZ;
        const R = c.shoulderR + m;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R * R && d2 > 1e-10) {
          const k = R / Math.sqrt(d2);
          pos[o] = cx + dx * k;
          pos[o + 1] = c.shoulderCY + dy * k;
          pos[o + 2] = c.torsoZ + dz * k;
        }
      }
      // Chest: below the shoulder line and within the torso width, stay in front of the chest.
      if (pos[o + 1]! < c.shoulderY - 0.02 && Math.abs(pos[o]!) < c.shoulderHalfWidth && pos[o + 2]! > c.torsoZ) {
        const lim = c.chestZ + m;
        if (pos[o + 2]! < lim) pos[o + 2] = lim;
      }
    }
  }
}
