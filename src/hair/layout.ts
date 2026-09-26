// ─────────────────────────────────────────────────────────────────────────────
// Hair layout (pure, deterministic per seed): the REST shape of every piece of the
// girls' hair in HEAD SPACE (origin = head centre, +Y up, +Z = face forward).
//
//   • cap    — a smooth shell over the head ellipsoid with a face-framing hairline.
//   • outer  — the brushable back fall: one lock per hair-space column (u 0 = head-space +X,
//              screen-left from behind). Rigid over the scalp (crown → nape), then a hanging
//              chain of simulated nodes down the back.
//   • under  — darker locks tucked between the outer locks (derived at runtime, no own nodes).
//   • front  — two face-framing locks (in front of the shoulders or tucked behind, seeded).
//   • bangs  — optional soft side-swept (or curtain) bangs, rigid.
//   • tufts  — bedhead tufts + a crown cowlick that grow out with bedhead (rigid).
//
// Every chain stores its control points twice: `rest0` (neat) and `rest1` (full bedhead) —
// the rig lerps between them. Chains are uniform Catmull-Rom curves through the control
// points; `pinned` control points are rigid (follow the head), the rest are simulated.
// ─────────────────────────────────────────────────────────────────────────────
import { hashInts } from '../core/rng';
import { arcSamples, crPoint, crTangent } from './curve';
import type { HairFit } from './types';

export type ChainKind = 'outer' | 'front' | 'bang' | 'tuft';

export interface Chain {
  readonly kind: ChainKind;
  readonly index: number;
  /** Hair-space u (outer locks); NaN otherwise. */
  readonly u: number;
  /** Control point count. */
  readonly cp: number;
  /** Rigid control points (0..pinned−1). pinned === cp → the whole chain is rigid. */
  readonly pinned: number;
  readonly rest0: Float32Array;
  readonly rest1: Float32Array;
  readonly rings: number;
  /** Spline parameter of each ring (0..cp−1). */
  readonly ringT: Float32Array;
  /** Length position of each ring (0 = root … 1 = tip vertex). */
  readonly ringV: Float32Array;
  readonly halfW0: Float32Array;
  readonly halfW1: Float32Array;
  readonly halfD0: Float32Array;
  readonly halfD1: Float32Array;
  /** Rest outward reference per ring (unit, rings × 3) — frames are built around it. */
  readonly out0: Float32Array;
  /** Cross-section vertex count. */
  readonly sides: number;
  /** Tip point distance beyond the last ring as a multiple of the last ring's half-width. */
  readonly tipK: number;
  /** Ink width multiplier (0 = no outline). */
  readonly ink: number;
  /** Cosmetic per-chain hash (0..1). */
  readonly rnd: number;
  /** Colour multiplier (lock-to-lock variation). */
  readonly shadeK: number;
}

export interface UnderLock {
  readonly left: number;
  readonly right: number;
  /** First outer ring index this lock follows. */
  readonly ringStart: number;
  readonly rings: number;
  /** Inward offset (m) behind the outer locks. */
  readonly inset: number;
  readonly widthK: number;
  readonly rnd: number;
}

export interface CapLayout {
  /** Azimuth segments. */
  readonly nt: number;
  /** Rings from the pole to the hairline. */
  readonly ns: number;
  /** Vertex count = 1 + nt × ns (pole first). */
  readonly count: number;
  readonly pos0: Float32Array;
  readonly pos1: Float32Array;
  readonly nrm: Float32Array;
  /** 0 at the pole … 1 at the hairline, per vertex. */
  readonly s: Float32Array;
}

export interface BodyCollider {
  /** Torso centre z and half depth (head space, estimated from backZ). */
  readonly torsoZ: number;
  readonly torsoHalf: number;
  readonly chestZ: number;
  /** Shoulder spheres (±x) centre + radius. */
  readonly shoulderX: number;
  readonly shoulderCY: number;
  readonly shoulderR: number;
}

export interface HairLayout {
  readonly fit: HairFit;
  readonly length: number;
  readonly cols: number;
  readonly rows: number;
  /** Part line x (head space) and side (−1/+1 side part, 0 = centre part). */
  readonly partX: number;
  readonly partSide: -1 | 0 | 1;
  /** y of the tips of the middle locks (head space). */
  readonly tipY: number;
  readonly cap: CapLayout;
  readonly outer: readonly Chain[];
  readonly under: readonly UnderLock[];
  readonly front: readonly Chain[];
  readonly bangs: readonly Chain[];
  readonly tufts: readonly Chain[];
  readonly body: BodyCollider;
  /** Front lock styles, per side (+X first). */
  readonly frontStyle: readonly ('front' | 'behind')[];
}

// ── tunables ────────────────────────────────────────────────────────────────
/** Visual fall locks: one per column, clamped (the triangle budget holds ≤ 5 k up to MAX_LOCKS). */
export const MIN_LOCKS = 7;
export const MAX_LOCKS = 10;
export const OUTER_SCALP_CP = 4;
export const OUTER_NODES = 5; // hanging nodes incl. the pinned junction
export const OUTER_RINGS = 11;
export const OUTER_SIDES = 6;
export const FRONT_SCALP_CP = 3;
export const FRONT_NODES = 4;
export const FRONT_RINGS = 9;
export const BANG_RINGS = 5;
export const TUFT_RINGS = 4;
export const CAP_NT = 20;
export const CAP_NS = 6;
/** Azimuth (rad from +Z toward +X) of the outermost fall locks: just behind the ears. */
export const FALL_THETA = 1.4;
/** Polar angle of the crown ring where the fall locks are rooted. */
export const CROWN_PHI = 0.3;
/** Hair on the scalp: cap offset (m) over the head at the back / at the top-front. */
export const CAP_OFF_BACK = 0.014;
export const CAP_OFF_TOP = 0.027;
export const SCALP_HALF_D = 0.009;
export const HANG_HALF_D = 0.016;

const r01 = (seed: number, a: number, b = 0): number => hashInts(seed, a, b) / 4294967296;
const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── ellipsoid helpers ───────────────────────────────────────────────────────

/** Point on the head ellipsoid at polar φ (from +Y) / azimuth θ (from +Z toward +X), pushed out by `off` along the normal. */
export function headPoint(fit: HairFit, phi: number, theta: number, off: number, out: number[] | Float32Array, o = 0): void {
  const sx = Math.sin(phi) * Math.sin(theta);
  const sy = Math.cos(phi);
  const sz = Math.sin(phi) * Math.cos(theta);
  let nx = sx / fit.rx;
  let ny = sy / fit.ry;
  let nz = sz / fit.rz;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  out[o] = fit.rx * sx + nx * off;
  out[o + 1] = fit.ry * sy + ny * off;
  out[o + 2] = fit.rz * sz + nz * off;
}

/** Outward unit normal of the head ellipsoid family at a point. */
export function headNormal(fit: HairFit, x: number, y: number, z: number, out: number[] | Float32Array, o = 0): void {
  let nx = x / (fit.rx * fit.rx);
  let ny = y / (fit.ry * fit.ry);
  let nz = z / (fit.rz * fit.rz);
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l;
  ny /= l;
  nz /= l;
  out[o] = nx;
  out[o + 1] = ny;
  out[o + 2] = nz;
}

/** Hairline: largest polar angle the cap covers at azimuth θ (face stays clear at the front). */
export function hairlinePhi(theta: number): number {
  const a = Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta)));
  const K = [
    [0, 0.88],
    [0.5, 0.97],
    [0.9, 1.26],
    [1.3, 1.62],
    [1.62, 1.8],
    [2.2, 2.12],
    [Math.PI, 2.28],
  ] as const;
  for (let i = 0; i < K.length - 1; i++) {
    const [a0, p0] = K[i]!;
    const [a1, p1] = K[i + 1]!;
    if (a <= a1) return lerp(p0, p1, sstep(a0, a1, a) * 0.5 + ((a - a0) / (a1 - a0)) * 0.5);
  }
  return K[K.length - 1]![1];
}

/** Cap offset (m) above the head at (s = φ/φmax, direction z). Back of the head is thinner (locks lie on it). */
export function capOffset(s: number, dirZ: number, bedhead: number): number {
  const back = sstep(0.15, -0.3, dirZ);
  let o = lerp(CAP_OFF_TOP, CAP_OFF_BACK, back);
  o *= lerp(1, 0.35, sstep(0.72, 1, s));
  o += bedhead * 0.04 * (1 - 0.5 * s) * (0.65 + 0.35 * back);
  return o;
}

// ── builders ─────────────────────────────────────────────────────────────────

function buildCap(fit: HairFit): CapLayout {
  const nt = CAP_NT;
  const ns = CAP_NS;
  const count = 1 + nt * ns;
  const pos0 = new Float32Array(count * 3);
  const pos1 = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const s = new Float32Array(count);
  const p = [0, 0, 0];
  const put = (i: number, phi: number, theta: number, sv: number) => {
    const dz = Math.sin(phi) * Math.cos(theta);
    headPoint(fit, phi, theta, capOffset(sv, dz, 0), pos0, i * 3);
    headPoint(fit, phi, theta, capOffset(sv, dz, 1), pos1, i * 3);
    headPoint(fit, phi, theta, 0, p, 0);
    headNormal(fit, p[0]!, p[1]!, p[2]!, nrm, i * 3);
    s[i] = sv;
  };
  put(0, 0, 0, 0);
  for (let k = 0; k < ns; k++) {
    const sv = (k + 1) / ns;
    for (let j = 0; j < nt; j++) {
      const theta = -Math.PI + (j / nt) * Math.PI * 2;
      put(1 + k * nt + j, sv * hairlinePhi(theta), theta, sv);
    }
  }
  return { nt, ns, count, pos0, pos1, nrm, s };
}

interface ChainSpec {
  kind: ChainKind;
  index: number;
  u: number;
  pinned: number;
  rest0: number[];
  rest1: number[];
  rings: number;
  sides: number;
  tipK: number;
  ink: number;
  rnd: number;
  shadeK: number;
  /** halfW / halfD at ring v (bedhead 0), multiplied by (1 + k·bedhead) for rest1. */
  width: (v: number, ringIndex: number) => number;
  depth: (v: number, ringIndex: number) => number;
  widthBed: number;
  depthBed: number;
  /** Outward reference for a ring at point p (writes a unit vector). */
  outward: (p: number[], v: number, out: number[]) => void;
}

function finishChain(c: ChainSpec): Chain {
  const n = c.rest0.length / 3;
  const rest0 = new Float32Array(c.rest0);
  const rest1 = new Float32Array(c.rest1);
  const arc = arcSamples(rest0, n, c.rings);
  const ringT = arc.t;
  const ringV = new Float32Array(c.rings);
  const halfW0 = new Float32Array(c.rings);
  const halfW1 = new Float32Array(c.rings);
  const halfD0 = new Float32Array(c.rings);
  const halfD1 = new Float32Array(c.rings);
  const out0 = new Float32Array(c.rings * 3);
  // v: arc-length fraction including the rounded tip beyond the last ring.
  const p = [0, 0, 0];
  const o = [0, 0, 0];
  for (let r = 0; r < c.rings; r++) {
    const vFrac = arc.length > 0 ? arc.s[r]! / arc.length : 0;
    halfW0[r] = c.width(vFrac, r);
    halfD0[r] = c.depth(vFrac, r);
  }
  const tipLen = halfW0[c.rings - 1]! * c.tipK;
  const total = arc.length + tipLen;
  for (let r = 0; r < c.rings; r++) {
    ringV[r] = total > 0 ? arc.s[r]! / total : 0;
    halfW1[r] = halfW0[r]! * (1 + c.widthBed);
    halfD1[r] = halfD0[r]! * (1 + c.depthBed);
    crPoint(rest0, 0, n, ringT[r]!, p, 0);
    c.outward(p, ringV[r]!, o);
    const l = Math.hypot(o[0]!, o[1]!, o[2]!) || 1;
    out0[r * 3] = o[0]! / l;
    out0[r * 3 + 1] = o[1]! / l;
    out0[r * 3 + 2] = o[2]! / l;
  }
  return {
    kind: c.kind,
    index: c.index,
    u: c.u,
    cp: n,
    pinned: c.pinned,
    rest0,
    rest1,
    rings: c.rings,
    ringT,
    ringV,
    halfW0,
    halfW1,
    halfD0,
    halfD1,
    out0,
    sides: c.sides,
    tipK: c.tipK,
    ink: c.ink,
    rnd: c.rnd,
    shadeK: c.shadeK,
  };
}

/** Theta (azimuth) of an outer lock at hair-space u: u 0 → +X side (θ = FALL_THETA), through the back (π), to −X. */
export function thetaOfU(u: number): number {
  return FALL_THETA + u * (Math.PI * 2 - 2 * FALL_THETA);
}

export function bodyCollider(fit: HairFit): BodyCollider {
  const torsoHalf = Math.max(0.06, -fit.backZ * 0.88);
  const torsoZ = fit.backZ + torsoHalf;
  return {
    torsoZ,
    torsoHalf,
    chestZ: torsoZ + torsoHalf,
    shoulderX: fit.shoulderHalfWidth * 0.68,
    shoulderCY: fit.shoulderY - 0.05,
    shoulderR: 0.075,
  };
}

/** Half-width (m) of the fall at shoulder height. */
export function fallHalfWidth(fit: HairFit): number {
  return Math.max(fit.rx * 1.1, fit.shoulderHalfWidth * 1.02);
}

export interface LayoutOpts {
  fit: HairFit;
  length: number;
  seed: number;
  cols?: number;
  rows?: number;
}

export function buildLayout(opts: LayoutOpts): HairLayout {
  const fit = opts.fit;
  const seed = opts.seed | 0;
  const cols = Math.max(1, Math.round(opts.cols ?? 9));
  const rows = Math.max(1, Math.round(opts.rows ?? 4));
  const length = Math.max(0.25, opts.length);
  const body = bodyCollider(fit);
  const tipY = fit.ry - length;

  // Part: 70 % side part (seeded side), 30 % centre part.
  const partSide: -1 | 0 | 1 = r01(seed, 1) < 0.7 ? (r01(seed, 2) < 0.5 ? -1 : 1) : 0;
  const partX = partSide * fit.rx * 0.24;

  const cap = buildCap(fit);

  // ── outer locks ──
  const nOuter = Math.max(MIN_LOCKS, Math.min(MAX_LOCKS, cols));
  const Ws = fallHalfWidth(fit);
  const clumpOff = r01(seed, 3) < 0.5 ? 0 : 1;
  const specs: { u: number; theta: number; scalp0: number[][]; scalp1: number[][]; hang0: number[][]; hang1: number[][]; rnd: number }[] = [];
  const tipXs: number[] = [];
  for (let i = 0; i < nOuter; i++) {
    const u = (i + 0.5) / nOuter;
    const theta = thetaOfU(u);
    const mid = Math.sin(Math.PI * u); // 0 at the sides, 1 in the middle
    const rnd = r01(seed, 10, i);
    const phiA = CROWN_PHI + (1 - mid) * 0.12;
    const phiX = lerp(1.74, 2.06, mid);
    const layer = i % 2 === 1 ? 0.004 : 0; // alternate locks sit a touch prouder → clumped, layered look
    const scalp0: number[][] = [];
    const scalp1: number[][] = [];
    for (let k = 0; k < OUTER_SCALP_CP; k++) {
      const f = k / (OUTER_SCALP_CP - 1);
      const phi = lerp(phiA, phiX, f);
      // Roots emerge from under the cap at the crown (no jagged tops), then lie on it.
      const off = k === 0 ? CAP_OFF_TOP * 0.55 : CAP_OFF_BACK * lerp(1.5, 1, f) + SCALP_HALF_D * 0.85 + layer * f;
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      headPoint(fit, phi, theta, off, a);
      // Bedhead: poofy volume over the scalp (bump in the middle of the path) + a slight per-lock lift.
      headPoint(fit, phi, theta, off + 0.018 + 0.046 * Math.sin(Math.PI * Math.min(1, f * 1.2)) + (r01(seed, 11, i * 8 + k) - 0.3) * 0.016, b);
      scalp0.push(a);
      scalp1.push(b);
    }
    const J0 = scalp0[OUTER_SCALP_CP - 1]!;
    const J1 = scalp1[OUTER_SCALP_CP - 1]!;
    const xs = Ws * (1 - 2 * u);
    const bulge = 0.02 * mid;
    // Side locks turn their flat side outward, so their width runs front-back: sit them further back.
    const zs = fit.backZ - 0.008 - HANG_HALF_D - bulge - layer - 0.042 * (1 - mid) * (1 - mid);
    const shY = Math.min(fit.shoulderY, J0[1]! - 0.07);
    const lenJit = (r01(seed, 12, i) - 0.5) * 0.06 + (i % 2 === 1 ? 0.012 : -0.008);
    const ty = tipY + 0.04 * (1 - 2 * u) * (1 - 2 * u) + lenJit;
    const tx = xs * 1.12;
    tipXs.push(tx);
    // Hanging rest path: J → below J (leaves the head going down) → shoulder → tip.
    // Side locks drop beside the jaw first (side curtains framing the face), then tuck behind the shoulders.
    const side = 1 - mid;
    const midZ = lerp(lerp(J0[2]!, zs, 0.7) - 0.004, Math.min(J0[2]!, -0.01), side * side);
    const midX = xs * lerp(0.97, 1.0, side);
    const hang0 = hangingNodes(J0, [midX, lerp(J0[1]!, shY, 0.55), midZ], [xs, shY, zs], [tx, ty, zs - 0.012]);
    const lat = (r01(seed, 13, i) - 0.5) * 0.05;
    const hang1 = hangingNodes(
      J1,
      [xs * 1.22 + lat * 0.3, lerp(J1[1]!, shY, 0.55) + 0.01, lerp(J1[2]!, zs, 0.6) - 0.04],
      [xs * 1.45 + lat * 0.6, shY + 0.035, zs - 0.06],
      [tx * 1.6 + lat, ty + 0.08 + (r01(seed, 14, i) - 0.5) * 0.05, zs - 0.1],
    );
    specs.push({ u, theta, scalp0, scalp1, hang0, hang1, rnd });
  }
  // Clump the tips in pairs (layered, clumped ends).
  for (let i = 0; i < nOuter; i++) {
    const c = Math.floor((i + clumpOff) / 2);
    let sum = 0;
    let n = 0;
    for (let j = 0; j < nOuter; j++)
      if (Math.floor((j + clumpOff) / 2) === c) {
        sum += tipXs[j]!;
        n++;
      }
    const cx = sum / n;
    const sp = specs[i]!;
    for (const hang of [sp.hang0, sp.hang1]) {
      const tip = hang[hang.length - 1]!;
      tip[0] = lerp(tip[0]!, cx, 0.18);
      const pre = hang[hang.length - 2]!;
      pre[0] = lerp(pre[0]!, cx, 0.06);
    }
  }
  // Rest ring spacing drives lock widths (neighbours overlap → no gaps).
  const outer: Chain[] = [];
  // Build chains first with provisional widths; measure neighbour spacing ring-by-ring; then set widths.
  const provisional: Chain[] = [];
  for (let i = 0; i < nOuter; i++) {
    const sp = specs[i]!;
    const rest0 = [...sp.scalp0.flat(), ...sp.hang0.slice(1).flat()];
    const rest1 = [...sp.scalp1.flat(), ...sp.hang1.slice(1).flat()];
    provisional.push(
      finishChain({
        kind: 'outer',
        index: i,
        u: sp.u,
        pinned: OUTER_SCALP_CP,
        rest0,
        rest1,
        rings: OUTER_RINGS,
        sides: OUTER_SIDES,
        tipK: 0.85,
        ink: 0.45,
        rnd: sp.rnd,
        shadeK: 0.95 + r01(seed, 15, i) * 0.1,
        width: () => 0.02,
        depth: () => SCALP_HALF_D,
        widthBed: 0.2,
        depthBed: 0.3,
        outward: (p, _v, out) => outerOutward(fit, body, p, out),
      }),
    );
  }
  const ringPos = provisional.map((c) => {
    const a = new Float32Array(c.rings * 3);
    for (let r = 0; r < c.rings; r++) crPoint(c.rest0, 0, c.cp, c.ringT[r]!, a, r * 3);
    return a;
  });
  const juncV = provisional.map((c) => {
    // v of the junction (last pinned control point).
    let best = 0;
    for (let r = 0; r < c.rings; r++) if (c.ringT[r]! <= c.pinned - 1 + 1e-6) best = c.ringV[r]!;
    return best;
  });
  for (let i = 0; i < nOuter; i++) {
    const c = provisional[i]!;
    const sp = specs[i]!;
    const widthK = 0.93 + r01(seed, 16, i) * 0.14;
    const spacing = new Float32Array(c.rings);
    for (let r = 0; r < c.rings; r++) {
      let s = 0;
      let n = 0;
      for (const j of [i - 1, i + 1]) {
        if (j < 0 || j >= nOuter) continue;
        const a = ringPos[i]!;
        const b = ringPos[j]!;
        s += Math.hypot(a[r * 3]! - b[r * 3]!, a[r * 3 + 1]! - b[r * 3 + 1]!, a[r * 3 + 2]! - b[r * 3 + 2]!);
        n++;
      }
      spacing[r] = n ? s / n : 0.04;
    }
    const jv = juncV[i]!;
    const chain = finishChain({
      kind: 'outer',
      index: i,
      u: sp.u,
      pinned: OUTER_SCALP_CP,
      rest0: Array.from(c.rest0),
      rest1: Array.from(c.rest1),
      rings: OUTER_RINGS,
      sides: OUTER_SIDES,
      tipK: 0.85,
      ink: 0.45,
      rnd: sp.rnd,
      shadeK: c.shadeK,
      width: (v, r) => {
        // Edge locks turn sideways below the head, so their (front-back) width is kept tighter there.
        const edge = (i === 0 || i === nOuter - 1) && v > jv + 0.04;
        const base = Math.min(edge ? 0.034 : 0.05, Math.max(0.01, spacing[r]! * 0.98)) * widthK;
        const root = 0.55 + 0.45 * sstep(0, 0.14, v);
        const taper = 1 - 0.36 * sstep(0.7, 1, v);
        return base * root * taper;
      },
      depth: (v) => {
        const hang = sstep(jv - 0.08, jv + 0.06, v);
        const taper = 1 - 0.55 * sstep(0.7, 1, v);
        return lerp(SCALP_HALF_D, HANG_HALF_D, hang) * taper;
      },
      widthBed: 0.22,
      depthBed: 0.35,
      outward: (p, _v, out) => outerOutward(fit, body, p, out),
    });
    outer.push(chain);
  }

  // ── under locks (between outer neighbours, below the scalp) ──
  const under: UnderLock[] = [];
  const firstHangRing = (c: Chain) => {
    for (let r = 0; r < c.rings; r++) if (c.ringT[r]! >= c.pinned - 1.5) return Math.max(0, r - 1);
    return 0;
  };
  for (let i = 0; i < nOuter - 1; i++) {
    const rs = Math.min(firstHangRing(outer[i]!), firstHangRing(outer[i + 1]!));
    under.push({
      left: i,
      right: i + 1,
      ringStart: rs,
      rings: OUTER_RINGS - rs,
      inset: HANG_HALF_D * 0.9,
      widthK: 0.95 + r01(seed, 20, i) * 0.1,
      rnd: r01(seed, 21, i),
    });
  }

  // ── front (face-framing) locks ──
  const frontStyle: ('front' | 'behind')[] = [];
  const front: Chain[] = [];
  for (let k = 0; k < 2; k++) {
    const s = k === 0 ? 1 : -1;
    const style: 'front' | 'behind' = r01(seed, 30, k) < 0.6 ? 'front' : 'behind';
    frontStyle.push(style);
    const scalp0: number[][] = [];
    const scalp1: number[][] = [];
    const path = [
      [0.64, 0.42],
      [0.98, 0.9],
      [1.34, 1.2],
    ] as const;
    for (let j = 0; j < FRONT_SCALP_CP; j++) {
      const [phi, th] = path[j]!;
      const a = [0, 0, 0];
      const b = [0, 0, 0];
      const off = CAP_OFF_TOP * lerp(1, 0.6, j / 2) + 0.008;
      headPoint(fit, phi, s * th, off, a);
      headPoint(fit, phi - 0.04, s * (th + 0.05), off + 0.02 + 0.01 * j, b);
      scalp0.push(a);
      scalp1.push(b);
    }
    const J0 = scalp0[FRONT_SCALP_CP - 1]!;
    const J1 = scalp1[FRONT_SCALP_CP - 1]!;
    let hang0: number[][];
    let hang1: number[][];
    const shw = fit.shoulderHalfWidth;
    if (style === 'front') {
      const cheekX = s * (fit.rx + 0.012);
      hang0 = [
        J0,
        [cheekX, lerp(J0[1]!, fit.shoulderY, 0.45), J0[2]! - 0.005],
        [s * shw * 0.78, fit.shoulderY + 0.05, body.torsoZ + body.torsoHalf * 0.35],
        [s * shw * 0.7, fit.shoulderY - Math.min(0.14, length * 0.25), body.chestZ + 0.03],
      ];
      hang1 = [
        J1,
        [cheekX * 1.2, lerp(J1[1]!, fit.shoulderY, 0.4), J1[2]! + 0.01],
        [s * shw * 1.02, fit.shoulderY + 0.07, body.torsoZ + body.torsoHalf * 0.5],
        [s * shw * 1.12, fit.shoulderY - 0.06, body.chestZ + 0.05],
      ];
    } else {
      hang0 = [
        J0,
        [s * (fit.rx + 0.016), lerp(J0[1]!, fit.shoulderY, 0.45), -0.035],
        [s * shw * 0.92, fit.shoulderY + 0.012, fit.backZ - 0.03],
        [s * shw * 0.96, fit.shoulderY - Math.min(0.13, length * 0.24), fit.backZ - 0.045],
      ];
      hang1 = [
        J1,
        [s * (fit.rx + 0.04), lerp(J1[1]!, fit.shoulderY, 0.4), -0.03],
        [s * shw * 1.15, fit.shoulderY + 0.04, fit.backZ - 0.05],
        [s * shw * 1.3, fit.shoulderY - 0.05, fit.backZ - 0.08],
      ];
    }
    const rest0 = [...scalp0.flat(), ...hang0.slice(1).flat()];
    const rest1 = [...scalp1.flat(), ...hang1.slice(1).flat()];
    const junction = (FRONT_SCALP_CP - 1) / (FRONT_SCALP_CP + FRONT_NODES - 2);
    front.push(
      finishChain({
        kind: 'front',
        index: k,
        u: Number.NaN,
        pinned: FRONT_SCALP_CP,
        rest0,
        rest1,
        rings: FRONT_RINGS,
        sides: OUTER_SIDES,
        tipK: 1.8,
        ink: 0.55,
        rnd: r01(seed, 31, k),
        shadeK: 1,
        width: (v) => 0.03 * (0.55 + 0.45 * sstep(0, 0.2, v)) * (1 - 0.6 * sstep(0.6, 1, v)) + 0.003,
        depth: (v) => lerp(0.008, 0.013, sstep(junction - 0.1, junction + 0.1, v)) * (1 - 0.5 * sstep(0.7, 1, v)),
        widthBed: 0.3,
        depthBed: 0.4,
        outward: (p, v, out) => {
          if (v < junction) headNormal(fit, p[0]!, p[1]!, p[2]!, out);
          else {
            out[0] = p[0]! * 2;
            out[1] = 0.2;
            out[2] = style === 'front' ? 0.9 : -0.7;
          }
        },
      }),
    );
  }

  // ── bangs ──
  const bangs: Chain[] = [];
  const hasBangs = r01(seed, 40) < 0.85;
  if (hasBangs) {
    const list: { th0: number; th1: number; ph0: number; ph1: number; w: number }[] = [];
    if (partSide !== 0) {
      const ps = partSide;
      for (let k = 0; k < 3; k++) {
        list.push({ th0: ps * (0.3 - 0.13 * k), th1: -ps * (0.48 + 0.24 * k), ph0: 0.55 + 0.03 * k, ph1: 1.1 + 0.03 * k - (k === 2 ? 0.08 : 0), w: 0.034 - 0.003 * k });
      }
    } else {
      for (const sd of [1, -1]) list.push({ th0: sd * 0.06, th1: sd * 0.82, ph0: 0.56, ph1: 1.1, w: 0.032 });
    }
    list.forEach((b, k) => {
      const rest0: number[] = [];
      const rest1: number[] = [];
      for (let j = 0; j < 4; j++) {
        const f = j / 3;
        const phi = lerp(b.ph0, b.ph1, Math.pow(f, 0.8));
        const th = lerp(b.th0, b.th1, f);
        const a = [0, 0, 0];
        const c = [0, 0, 0];
        // Root tucked into the cap (no shards at the part), then lying over the forehead.
        headPoint(fit, phi, th, j === 0 ? CAP_OFF_TOP * 0.55 : CAP_OFF_TOP * lerp(1, 0.45, f) + 0.009 + 0.006 * Math.sin(Math.PI * f), a);
        headPoint(fit, phi - 0.08 * f, th * (1 + 0.15 * f), CAP_OFF_TOP + 0.02 + 0.03 * Math.sin(Math.PI * f) + 0.02 * f, c);
        rest0.push(...a);
        rest1.push(...c);
      }
      bangs.push(
        finishChain({
          kind: 'bang',
          index: k,
          u: Number.NaN,
          pinned: 4,
          rest0,
          rest1,
          rings: BANG_RINGS,
          sides: 5,
          tipK: 1.5,
          ink: 0.5,
          rnd: r01(seed, 41, k),
          shadeK: 1,
          width: (v) => b.w * (0.45 + 0.55 * sstep(0, 0.3, v)) * (1 - 0.6 * sstep(0.45, 1, v)),
          depth: (v) => 0.0095 * (1 - 0.4 * v),
          widthBed: 0.25,
          depthBed: 0.5,
          outward: (p, _v, out) => headNormal(fit, p[0]!, p[1]!, p[2]!, out),
        }),
      );
    });
  }

  // ── bedhead tufts (collapsed inside the hair when neat) ──
  // Chunky, flame-shaped, curling tufts placed for all three reads: the top (dollhouse camera),
  // the sides (front view silhouette) and the back (brushing close-up). Plus the crown cowlick.
  const tufts: Chain[] = [];
  const ps = partSide === 0 ? 1 : partSide;
  const tuftSpots: [number, number, number, number, number, number][] = [
    // phi, theta, length, base half-width, sideways curl, up bias — flipped-up locks, not horns
    [0.12, Math.PI - 0.3 * ps, 0.07, 0.016, 0.9, 0.9], // crown cowlick (the classic sprout, curling over)
    [0.6, 0.55 * ps, 0.05, 0.028, -1.1, 0.1], // flicks near the part (sideways, lifting at the end)
    [0.75, -1.0 * ps, 0.048, 0.028, 1.0, 0.08],
    [1.2, 1.5, 0.055, 0.03, 0.8, 0.2], // side flicks over the ears
    [1.3, -1.6, 0.052, 0.03, -0.8, 0.15],
    [1.35, 2.3, 0.055, 0.03, -0.9, 0.1], // back-side flicks
    [1.05, -2.55, 0.05, 0.03, 0.95, 0.2],
  ];
  tuftSpots.forEach(([phi0, th0, len0, w0, curl, up], k) => {
    const phi = phi0 + (r01(seed, 50, k) - 0.5) * 0.1;
    const th = th0 + (r01(seed, 51, k) - 0.5) * 0.22;
    const len = len0 * (1 + r01(seed, 52, k) * 0.3);
    const a = [0, 0, 0];
    const n = [0, 0, 0];
    const a2 = [0, 0, 0];
    // Rooted near the (poofed) outer surface of the hair so the whole tuft reads.
    headPoint(fit, phi, th, CAP_OFF_TOP + 0.055, a);
    headPoint(fit, phi + 0.05, th, CAP_OFF_TOP + 0.055, a2);
    headNormal(fit, a[0]!, a[1]!, a[2]!, n);
    // Flow = down the head along the meridian (the way the lock lay before it flipped up).
    const flow = [a2[0]! - a[0]!, a2[1]! - a[1]!, a2[2]! - a[2]!];
    const fl = Math.hypot(flow[0]!, flow[1]!, flow[2]!) || 1;
    flow[0]! /= fl;
    flow[1]! /= fl;
    flow[2]! /= fl;
    // Sideways = n × flow.
    const side = [n[1]! * flow[2]! - n[2]! * flow[1]!, n[2]! * flow[0]! - n[0]! * flow[2]!, n[0]! * flow[1]! - n[1]! * flow[0]!];
    const rest1: number[] = [];
    const rest0: number[] = [];
    for (let j = 0; j < 4; j++) {
      const f = j / 3;
      const along = f * (1 - f) * 0.35 * (k === 0 ? 0.2 : 1);
      const outK = f * 0.7;
      rest1.push(
        a[0]! + (flow[0]! * along + n[0]! * outK + side[0]! * curl * f * f) * len,
        a[1]! + (flow[1]! * along + n[1]! * outK + up * f * f) * len,
        a[2]! + (flow[2]! * along + n[2]! * outK + side[2]! * curl * f * f) * len,
      );
      rest0.push(a[0]! - n[0]! * 0.065, a[1]! - n[1]! * 0.065, a[2]! - n[2]! * 0.065);
    }
    const chain = finishChain({
      kind: 'tuft',
      index: k,
      u: Number.NaN,
      pinned: 4,
      rest0: rest1, // arc-length sampling uses the grown shape
      rest1,
      rings: TUFT_RINGS,
      sides: 5,
      tipK: 1.4,
      ink: 0.6,
      rnd: r01(seed, 53, k),
      shadeK: 1,
      width: (v) => w0 * (1 - 0.62 * v),
      depth: (v) => w0 * 0.45 * (1 - 0.55 * v),
      widthBed: 0,
      depthBed: 0,
      outward: (_p, _v, out) => {
        out[0] = n[0]!;
        out[1] = n[1]!;
        out[2] = n[2]!;
      },
    });
    // Neat state: collapsed inside the hair.
    chain.rest0.set(rest0);
    tufts.push(chain);
  });

  return { fit, length, cols, rows, partX, partSide, tipY, cap, outer, under, front, bangs, tufts, body, frontStyle };
}

/** Outward reference for the back fall at a point: head normal on the scalp, away from the torso below. */
export function outerOutward(fit: HairFit, body: BodyCollider, p: number[], out: number[]): void {
  const e = Math.hypot(p[0]! / fit.rx, p[1]! / fit.ry, p[2]! / fit.rz);
  const hn = [0, 0, 0];
  headNormal(fit, p[0]!, p[1]!, p[2]!, hn);
  // Below / behind the head: face away from the torso axis (sideways-back).
  let bx = p[0]! * 1.4;
  let by = 0.12;
  let bz = p[2]! - body.torsoZ;
  const bl = Math.hypot(bx, by, bz) || 1;
  bx /= bl;
  by /= bl;
  bz /= bl;
  const onHead = p[1]! > -0.02 ? 1 : sstep(1.35, 1.05, e) * sstep(fit.neckY - 0.02, 0, p[1]!);
  out[0] = lerp(bx, hn[0]!, onHead);
  out[1] = lerp(by, hn[1]!, onHead);
  out[2] = lerp(bz, hn[2]!, onHead);
}

/**
 * Hanging-chain rest nodes: OUTER/FRONT_NODES points spaced evenly (arc length) along a smooth path
 * through the given anchor points (first = junction on the head, last = tip).
 */
function hangingNodes(...pts: number[][]): number[][] {
  const flat = pts.flat();
  const n = pts.length;
  const count = OUTER_NODES;
  const arc = arcSamples(flat, n, count);
  const out: number[][] = [];
  const p = [0, 0, 0];
  for (let k = 0; k < count; k++) {
    crPoint(flat, 0, n, arc.t[k]!, p, 0);
    out.push([p[0]!, p[1]!, p[2]!]);
  }
  out[0] = [pts[0]![0]!, pts[0]![1]!, pts[0]![2]!];
  return out;
}

/** Unit tangent of a chain's rest curve at ring r (test/debug helper). */
export function restTangent(c: Chain, r: number, out: number[]): void {
  crTangent(c.rest0, 0, c.cp, c.ringT[r]!, out, 0);
  const l = Math.hypot(out[0]!, out[1]!, out[2]!) || 1;
  out[0]! /= l;
  out[1]! /= l;
  out[2]! /= l;
}
