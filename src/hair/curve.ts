// Uniform Catmull-Rom evaluation over packed xyz control points (pure, allocation-free).
// Control points live in a Float32Array (or number[]) as [x0, y0, z0, x1, …] starting at `base`.
// The curve passes through every control point; the ends use mirrored phantom points.

type Arr = Float32Array | number[];

function cpx(cp: Arr, base: number, n: number, i: number, axis: number): number {
  if (i < 0) return 2 * cp[base + axis]! - cp[base + 3 + axis]!;
  if (i >= n) return 2 * cp[base + (n - 1) * 3 + axis]! - cp[base + (n - 2) * 3 + axis]!;
  return cp[base + i * 3 + axis]!;
}

/** Point at parameter t ∈ [0, n − 1] written to out[o..o+2]. Needs n ≥ 2. */
export function crPoint(cp: Arr, base: number, n: number, t: number, out: Arr, o: number): void {
  const tt = t < 0 ? 0 : t > n - 1 ? n - 1 : t;
  let seg = Math.floor(tt);
  if (seg > n - 2) seg = n - 2;
  const f = tt - seg;
  const f2 = f * f;
  const f3 = f2 * f;
  const w0 = -0.5 * f3 + f2 - 0.5 * f;
  const w1 = 1.5 * f3 - 2.5 * f2 + 1;
  const w2 = -1.5 * f3 + 2 * f2 + 0.5 * f;
  const w3 = 0.5 * f3 - 0.5 * f2;
  for (let a = 0; a < 3; a++) {
    out[o + a] =
      w0 * cpx(cp, base, n, seg - 1, a) + w1 * cpx(cp, base, n, seg, a) + w2 * cpx(cp, base, n, seg + 1, a) + w3 * cpx(cp, base, n, seg + 2, a);
  }
}

/** Derivative (unnormalised tangent) at t written to out[o..o+2]. */
export function crTangent(cp: Arr, base: number, n: number, t: number, out: Arr, o: number): void {
  const tt = t < 0 ? 0 : t > n - 1 ? n - 1 : t;
  let seg = Math.floor(tt);
  if (seg > n - 2) seg = n - 2;
  const f = tt - seg;
  const f2 = f * f;
  const w0 = -1.5 * f2 + 2 * f - 0.5;
  const w1 = 4.5 * f2 - 5 * f;
  const w2 = -4.5 * f2 + 4 * f + 0.5;
  const w3 = 1.5 * f2 - f;
  for (let a = 0; a < 3; a++) {
    out[o + a] =
      w0 * cpx(cp, base, n, seg - 1, a) + w1 * cpx(cp, base, n, seg, a) + w2 * cpx(cp, base, n, seg + 1, a) + w3 * cpx(cp, base, n, seg + 2, a);
  }
}

/**
 * Parameters of `count` samples spaced evenly by arc length along the curve (first = 0, last = n − 1),
 * plus the arc length of each sample. Build-time helper (allocates).
 */
export function arcSamples(cp: Arr, n: number, count: number, steps = 24): { t: Float32Array; s: Float32Array; length: number } {
  const total = (n - 1) * steps;
  const ts = new Float32Array(total + 1);
  const ss = new Float32Array(total + 1);
  const p = [0, 0, 0];
  const q = [0, 0, 0];
  crPoint(cp, 0, n, 0, p, 0);
  for (let i = 1; i <= total; i++) {
    const t = (i / total) * (n - 1);
    crPoint(cp, 0, n, t, q, 0);
    ts[i] = t;
    ss[i] = ss[i - 1]! + Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!);
    p[0] = q[0]!;
    p[1] = q[1]!;
    p[2] = q[2]!;
  }
  const length = ss[total]!;
  const t = new Float32Array(count);
  const s = new Float32Array(count);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count === 1 ? 0 : (k / (count - 1)) * length;
    while (j < total - 1 && ss[j + 1]! < target) j++;
    const seg = ss[j + 1]! - ss[j]!;
    const f = seg > 1e-9 ? (target - ss[j]!) / seg : 0;
    t[k] = ts[j]! + (ts[j + 1]! - ts[j]!) * Math.max(0, Math.min(1, f));
    s[k] = target;
  }
  t[count - 1] = n - 1;
  return { t, s, length };
}
