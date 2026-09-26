// ─────────────────────────────────────────────────────────────────────────────
// Circle-vs-world collision with sliding (pure, allocation-free after build).
// Static colliders (walls, furniture, fences) are axis-aligned rects or circles
// bucketed on a coarse grid; dynamic rects (closed doors, parked cars) are few
// and checked every time. Adapted from Trash Panda's sim/world/collide.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Rect } from './layout';

const BUCKET = 2;

export interface DynRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  active: boolean;
}

export interface CircleShape {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface MutPos {
  x: number;
  z: number;
}

/** Push a circle (p, r) out of a rect. Returns true if it moved. */
export function pushOutRect(p: MutPos, r: number, x0: number, z0: number, x1: number, z1: number): boolean {
  const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
  const cz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
    return true;
  }
  // centre inside the rect: push out along the axis of least penetration
  const left = p.x - x0;
  const right = x1 - p.x;
  const top = p.z - z0;
  const bottom = z1 - p.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) p.x = x0 - r;
  else if (m === right) p.x = x1 + r;
  else if (m === top) p.z = z0 - r;
  else p.z = z1 + r;
  return true;
}

export function pushOutCircle(p: MutPos, r: number, cx: number, cz: number, cr: number): boolean {
  const dx = p.x - cx;
  const dz = p.z - cz;
  const min = cr + r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-6) {
    p.x = cx + min;
    return true;
  }
  p.x = cx + (dx / d) * min;
  p.z = cz + (dz / d) * min;
  return true;
}

const overlapsRect = (x: number, z: number, r: number, x0: number, z0: number, x1: number, z1: number): boolean => {
  const cx = x < x0 ? x0 : x > x1 ? x1 : x;
  const cz = z < z0 ? z0 : z > z1 ? z1 : z;
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r - 1e-9;
};

export class CollisionWorld {
  /** Static rects packed [x0, z0, x1, z1] × n. */
  private readonly rects: Float64Array;
  /** Static circles packed [x, z, r] × n. */
  private readonly circles: Float64Array;
  private readonly cols: number;
  private readonly rows: number;
  /** Per bucket: collider ids (rect i ≥ 0, circle ~j < 0 encoded as −1 − j). */
  private readonly buckets: Int32Array[];
  readonly dynamic: DynRect[] = [];
  private readonly scratch: MutPos = { x: 0, z: 0 };

  constructor(
    readonly bounds: Rect,
    rects: readonly Rect[],
    circles: readonly CircleShape[],
  ) {
    this.rects = new Float64Array(rects.length * 4);
    rects.forEach((r, i) => this.rects.set([r.x0, r.z0, r.x1, r.z1], i * 4));
    this.circles = new Float64Array(circles.length * 3);
    circles.forEach((c, i) => this.circles.set([c.x, c.z, c.r], i * 3));
    this.cols = Math.ceil((bounds.x1 - bounds.x0) / BUCKET) + 1;
    this.rows = Math.ceil((bounds.z1 - bounds.z0) / BUCKET) + 1;
    const lists: number[][] = Array.from({ length: this.cols * this.rows }, () => []);
    const addTo = (id: number, x0: number, z0: number, x1: number, z1: number) => {
      const c0 = Math.max(0, Math.floor((x0 - bounds.x0) / BUCKET));
      const c1 = Math.min(this.cols - 1, Math.floor((x1 - bounds.x0) / BUCKET));
      const r0 = Math.max(0, Math.floor((z0 - bounds.z0) / BUCKET));
      const r1 = Math.min(this.rows - 1, Math.floor((z1 - bounds.z0) / BUCKET));
      for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++) lists[rr * this.cols + cc]!.push(id);
    };
    rects.forEach((r, i) => addTo(i, r.x0, r.z0, r.x1, r.z1));
    circles.forEach((c, j) => addTo(-1 - j, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r));
    this.buckets = lists.map((l) => Int32Array.from(l));
  }

  addDynamic(r: Rect, active = true): DynRect {
    const d: DynRect = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, active };
    this.dynamic.push(d);
    return d;
  }

  get staticCount(): number {
    return this.rects.length / 4 + this.circles.length / 3;
  }

  /** Resolve one position against everything nearby. Returns true if it moved. */
  resolve(p: MutPos, r: number): boolean {
    let movedAny = false;
    const b = this.bounds;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      const c0 = Math.max(0, Math.floor((p.x - r - b.x0) / BUCKET));
      const c1 = Math.min(this.cols - 1, Math.floor((p.x + r - b.x0) / BUCKET));
      const r0 = Math.max(0, Math.floor((p.z - r - b.z0) / BUCKET));
      const r1 = Math.min(this.rows - 1, Math.floor((p.z + r - b.z0) / BUCKET));
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          const list = this.buckets[rr * this.cols + cc]!;
          for (let k = 0; k < list.length; k++) {
            const id = list[k]!;
            if (id >= 0) {
              const o = id * 4;
              if (pushOutRect(p, r, this.rects[o]!, this.rects[o + 1]!, this.rects[o + 2]!, this.rects[o + 3]!)) moved = true;
            } else {
              const o = (-1 - id) * 3;
              if (pushOutCircle(p, r, this.circles[o]!, this.circles[o + 1]!, this.circles[o + 2]!)) moved = true;
            }
          }
        }
      }
      for (let k = 0; k < this.dynamic.length; k++) {
        const d = this.dynamic[k]!;
        if (d.active && pushOutRect(p, r, d.x0, d.z0, d.x1, d.z1)) moved = true;
      }
      // world bounds
      if (p.x < b.x0 + r) (p.x = b.x0 + r), (moved = true);
      if (p.x > b.x1 - r) (p.x = b.x1 - r), (moved = true);
      if (p.z < b.z0 + r) (p.z = b.z0 + r), (moved = true);
      if (p.z > b.z1 - r) (p.z = b.z1 - r), (moved = true);
      if (!moved) break;
      movedAny = true;
    }
    return movedAny;
  }

  /**
   * Move a circle from (x, z) by (dx, dz), sub-stepped so it can't tunnel through thin walls, sliding along
   * obstacles. Writes the result to `out`. Allocation-free.
   */
  move(x: number, z: number, r: number, dx: number, dz: number, out: MutPos): void {
    const len = Math.sqrt(dx * dx + dz * dz);
    const steps = Math.max(1, Math.ceil(len / Math.max(0.05, r * 0.45)));
    const p = this.scratch;
    p.x = x;
    p.z = z;
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      p.x += sx;
      p.z += sz;
      this.resolve(p, r);
    }
    out.x = p.x;
    out.z = p.z;
  }

  /** True when a circle of radius r fits at (x, z). */
  free(x: number, z: number, r: number): boolean {
    const b = this.bounds;
    if (x - r < b.x0 || x + r > b.x1 || z - r < b.z0 || z + r > b.z1) return false;
    const c0 = Math.max(0, Math.floor((x - r - b.x0) / BUCKET));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r - b.x0) / BUCKET));
    const r0 = Math.max(0, Math.floor((z - r - b.z0) / BUCKET));
    const r1 = Math.min(this.rows - 1, Math.floor((z + r - b.z0) / BUCKET));
    for (let rr = r0; rr <= r1; rr++) {
      for (let cc = c0; cc <= c1; cc++) {
        const list = this.buckets[rr * this.cols + cc]!;
        for (let k = 0; k < list.length; k++) {
          const id = list[k]!;
          if (id >= 0) {
            const o = id * 4;
            if (overlapsRect(x, z, r, this.rects[o]!, this.rects[o + 1]!, this.rects[o + 2]!, this.rects[o + 3]!)) return false;
          } else {
            const o = (-1 - id) * 3;
            const dx = x - this.circles[o]!;
            const dz = z - this.circles[o + 1]!;
            const m = this.circles[o + 2]! + r;
            if (dx * dx + dz * dz < m * m - 1e-9) return false;
          }
        }
      }
    }
    for (let k = 0; k < this.dynamic.length; k++) {
      const d = this.dynamic[k]!;
      if (d.active && overlapsRect(x, z, r, d.x0, d.z0, d.x1, d.z1)) return false;
    }
    return true;
  }

  /** Visit every static collider (nav grid building). */
  forEachStatic(onRect: (x0: number, z0: number, x1: number, z1: number) => void, onCircle: (x: number, z: number, r: number) => void): void {
    for (let i = 0; i < this.rects.length; i += 4) onRect(this.rects[i]!, this.rects[i + 1]!, this.rects[i + 2]!, this.rects[i + 3]!);
    for (let i = 0; i < this.circles.length; i += 3) onCircle(this.circles[i]!, this.circles[i + 1]!, this.circles[i + 2]!);
  }
}
