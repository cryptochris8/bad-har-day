// ─────────────────────────────────────────────────────────────────────────────
// Hair mesh: ONE indexed, dynamic BufferGeometry for all of a girl's hair (cap, locks,
// under layer, face-framing locks, bangs, bedhead tufts) + a second index-only view of
// the same attributes for the ink pass (inverted hull drawn with BackSide, extruded in the
// vertex shader). Two draw calls total, shared vertex buffers, no hull duplication on the CPU.
//
// Attributes: position, normal (dynamic) · color (static ramp) · aHair vec4 (static:
// v along the lock, across −1..1 (2 = underside), layer id, per-lock random) · aTangle
// (dynamic display tangle) · aInkW (static ink width multiplier).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hashInts } from '../core/rng';
import type { HairPalette } from './colors';
import { mix, shade } from './colors';
import type { Chain, HairLayout } from './layout';

export const LAYER_CAP = 0;
export const LAYER_OUTER = 1;
export const LAYER_UNDER = 2;
export const LAYER_FRONT = 3;
export const LAYER_BANG = 4;
export const LAYER_TUFT = 5;

export const UNDER_SIDES = 5;
/** Ink width multipliers (× the distance-scaled outline width). */
export const INK_CAP = 1;

export interface TubeRec {
  /** First vertex. */
  readonly v0: number;
  readonly rings: number;
  readonly sides: number;
}

const cosTab = new Map<number, Float32Array>();
const sinTab = new Map<number, Float32Array>();
export function ringTables(sides: number): { cos: Float32Array; sin: Float32Array } {
  let c = cosTab.get(sides);
  let s = sinTab.get(sides);
  if (!c || !s) {
    c = new Float32Array(sides);
    s = new Float32Array(sides);
    for (let j = 0; j < sides; j++) {
      c[j] = Math.cos((j / sides) * Math.PI * 2);
      s[j] = Math.sin((j / sides) * Math.PI * 2);
    }
    cosTab.set(sides, c);
    sinTab.set(sides, s);
  }
  return { cos: c, sin: s };
}

/** Vertices a tube needs (rings × sides + the tip point). */
export const tubeVerts = (rings: number, sides: number): number => rings * sides + 1;
/** Triangles a tube emits (side quads + tip fan). */
export const tubeTris = (rings: number, sides: number): number => (rings - 1) * sides * 2 + sides;
/** Triangles of the cap (pole fan + ring quads). */
export const capTris = (nt: number, ns: number): number => nt + (ns - 1) * nt * 2;

export interface HairGeometry {
  readonly geometry: THREE.BufferGeometry;
  readonly inkGeometry: THREE.BufferGeometry;
  readonly pos: Float32Array;
  readonly nrm: Float32Array;
  readonly tangle: Float32Array;
  /** Static per-vertex noise −0.5..0.5 (frizz). */
  readonly noise: Float32Array;
  readonly capV0: number;
  readonly outer: readonly TubeRec[];
  readonly under: readonly TubeRec[];
  readonly front: readonly TubeRec[];
  readonly bangs: readonly TubeRec[];
  readonly tufts: readonly TubeRec[];
  readonly vertexCount: number;
  readonly bodyTriangles: number;
  readonly inkTriangles: number;
}

/** Build the hair geometry + static attributes for a layout. */
export function buildHairGeometry(L: HairLayout, pal: HairPalette): HairGeometry {
  const cap = L.cap;
  let nv = cap.count;
  const recs = (chains: readonly Chain[]): TubeRec[] =>
    chains.map((c) => {
      const r = { v0: nv, rings: c.rings, sides: c.sides };
      nv += tubeVerts(c.rings, c.sides);
      return r;
    });
  const capV0 = 0;
  const outer = recs(L.outer);
  const front = recs(L.front);
  const bangs = recs(L.bangs);
  const tufts = recs(L.tufts);
  const under = L.under.map((u) => {
    const r = { v0: nv, rings: u.rings, sides: UNDER_SIDES };
    nv += tubeVerts(u.rings, UNDER_SIDES);
    return r;
  });

  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const hair = new Float32Array(nv * 4);
  const tangle = new Float32Array(nv);
  const inkW = new Float32Array(nv);
  const noise = new Float32Array(nv);
  for (let i = 0; i < nv; i++) noise[i] = hashInts(i, 911) / 4294967296 - 0.5;

  const tmp = new THREE.Color();
  const setCol = (i: number, hex: number) => {
    tmp.setHex(hex);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  };
  const setHair = (i: number, v: number, across: number, layer: number, rnd: number) => {
    hair[i * 4] = v;
    hair[i * 4 + 1] = across;
    hair[i * 4 + 2] = layer;
    hair[i * 4 + 3] = rnd;
  };

  // ── cap colours: roots darker along the part and toward the whorl, under-tone at the back (under the fall).
  for (let i = 0; i < cap.count; i++) {
    const x = cap.pos0[i * 3]!;
    const y = cap.pos0[i * 3 + 1]!;
    const z = cap.pos0[i * 3 + 2]!;
    const dPart = Math.abs(x - L.partX);
    const onTop = y > 0 && z > -0.05 ? 1 : 0;
    const partK = Math.exp(-(dPart * dPart) / (0.035 * 0.035)) * onTop;
    const backK = Math.min(1, Math.max(0, (-z - 0.02) / 0.08)) * (y < L.fit.ry * 0.7 ? 1 : 0.4);
    let c = mix(pal.mid, pal.root, 0.45 * partK + 0.15);
    c = mix(c, pal.under, 0.55 * backK);
    setCol(i, c);
    setHair(i, cap.s[i]!, 0, LAYER_CAP, 0.5);
    inkW[i] = INK_CAP;
  }

  // ── tubes
  const tubeColours = (rec: TubeRec, c: Chain, layer: number, ramp: (v: number) => number, underHex: number, ink: number) => {
    const { sin, cos } = ringTables(rec.sides);
    for (let r = 0; r < rec.rings; r++) {
      const v = c.ringV[r]!;
      const top = shade(ramp(v), c.shadeK);
      const bot = mix(underHex, top, 0.25);
      for (let j = 0; j < rec.sides; j++) {
        const i = rec.v0 + r * rec.sides + j;
        const s = sin[j]!;
        setCol(i, s < -0.05 ? bot : s < 0.2 ? mix(bot, top, 0.6) : top);
        setHair(i, v, s < -0.05 ? 2 : cos[j]!, layer, c.rnd);
        inkW[i] = ink;
      }
    }
    const tip = rec.v0 + rec.rings * rec.sides;
    setCol(tip, shade(ramp(1), c.shadeK));
    setHair(tip, 1, 0, layer, c.rnd);
    inkW[tip] = ink;
  };
  const lockRamp = (v: number) => {
    if (v < 0.16) return mix(pal.root, pal.mid, v / 0.16);
    if (v > 0.62) return mix(pal.mid, pal.tip, (v - 0.62) / 0.38);
    return pal.mid;
  };
  L.outer.forEach((c, k) => tubeColours(outer[k]!, c, LAYER_OUTER, lockRamp, pal.under, c.ink));
  L.front.forEach((c, k) => tubeColours(front[k]!, c, LAYER_FRONT, (v) => (v < 0.12 ? mix(pal.root, pal.mid, v / 0.12) : v > 0.6 ? mix(pal.mid, pal.tip, (v - 0.6) / 0.4) : pal.mid), pal.under, c.ink));
  L.bangs.forEach((c, k) => tubeColours(bangs[k]!, c, LAYER_BANG, (v) => mix(pal.mid, pal.tip, v * 0.5), pal.under, c.ink));
  L.tufts.forEach((c, k) => tubeColours(tufts[k]!, c, LAYER_TUFT, (v) => mix(pal.mid, pal.tip, v * 0.6), pal.under, c.ink));
  L.under.forEach((u, k) => {
    const rec = under[k]!;
    const left = L.outer[u.left]!;
    for (let r = 0; r < rec.rings; r++) {
      const v = left.ringV[u.ringStart + r]!;
      const c = mix(pal.under, pal.mid, 0.12 + 0.3 * Math.max(0, (v - 0.6) / 0.4));
      for (let j = 0; j < rec.sides; j++) {
        const i = rec.v0 + r * rec.sides + j;
        setCol(i, c);
        setHair(i, v, 2, LAYER_UNDER, u.rnd);
        inkW[i] = 0;
      }
    }
    const tip = rec.v0 + rec.rings * rec.sides;
    setCol(tip, mix(pal.under, pal.mid, 0.4));
    setHair(tip, 1, 2, LAYER_UNDER, u.rnd);
  });

  // ── indices: inked parts first, then the un-inked under layer.
  const idx: number[] = [];
  // cap: pole fan + ring quads (CCW from outside).
  for (let j = 0; j < cap.nt; j++) {
    const a = 1 + j;
    const b = 1 + ((j + 1) % cap.nt);
    idx.push(0, a, b);
  }
  for (let k = 0; k < cap.ns - 1; k++) {
    for (let j = 0; j < cap.nt; j++) {
      const a0 = 1 + k * cap.nt + j;
      const a1 = 1 + k * cap.nt + ((j + 1) % cap.nt);
      const b0 = a0 + cap.nt;
      const b1 = a1 + cap.nt;
      idx.push(a0, b0, b1, a0, b1, a1);
    }
  }
  const tube = (rec: TubeRec) => {
    const S = rec.sides;
    for (let r = 0; r < rec.rings - 1; r++) {
      for (let j = 0; j < S; j++) {
        const a = rec.v0 + r * S + j;
        const b = rec.v0 + r * S + ((j + 1) % S);
        const c = b + S;
        const d = a + S;
        idx.push(a, c, b, a, d, c);
      }
    }
    const tip = rec.v0 + rec.rings * S;
    const last = rec.v0 + (rec.rings - 1) * S;
    for (let j = 0; j < S; j++) idx.push(last + j, tip, last + ((j + 1) % S));
  };
  for (const r of outer) tube(r);
  for (const r of front) tube(r);
  for (const r of bangs) tube(r);
  for (const r of tufts) tube(r);
  const inkCount = idx.length;
  for (const r of under) tube(r);

  const geometry = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aNrm = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 3);
  const aHair = new THREE.BufferAttribute(hair, 4);
  const aTan = new THREE.BufferAttribute(tangle, 1).setUsage(THREE.DynamicDrawUsage);
  const aInk = new THREE.BufferAttribute(inkW, 1);
  geometry.setAttribute('position', aPos);
  geometry.setAttribute('normal', aNrm);
  geometry.setAttribute('color', aCol);
  geometry.setAttribute('aHair', aHair);
  geometry.setAttribute('aTangle', aTan);
  const index = nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  const inkGeometry = new THREE.BufferGeometry();
  inkGeometry.setAttribute('position', aPos);
  inkGeometry.setAttribute('normal', aNrm);
  inkGeometry.setAttribute('aInkW', aInk);
  inkGeometry.setIndex(new THREE.BufferAttribute(index.slice(0, inkCount), 1));

  return {
    geometry,
    inkGeometry,
    pos,
    nrm,
    tangle,
    noise,
    capV0,
    outer,
    under,
    front,
    bangs,
    tufts,
    vertexCount: nv,
    bodyTriangles: idx.length / 3,
    inkTriangles: inkCount / 3,
  };
}

/**
 * Write one tube's vertices (hot path, allocation-free).
 * C/T/S/O: ring centres, unit tangents, side and outward axes (rings × 3). hw/hd: half width/depth per ring.
 * twist: per-ring roll (rad) or null. frizz: per-ring noise amplitude (m) or null.
 */
export function writeTube(
  g: HairGeometry,
  rec: TubeRec,
  C: Float32Array,
  T: Float32Array,
  S: Float32Array,
  O: Float32Array,
  hw: Float32Array,
  hd: Float32Array,
  twist: Float32Array | null,
  frizz: Float32Array | null,
  tipK: number,
): void {
  const { cos, sin } = ringTables(rec.sides);
  const pos = g.pos;
  const nrm = g.nrm;
  const noise = g.noise;
  const sides = rec.sides;
  for (let r = 0; r < rec.rings; r++) {
    const o3 = r * 3;
    const cx = C[o3]!;
    const cy = C[o3 + 1]!;
    const cz = C[o3 + 2]!;
    let sx = S[o3]!;
    let sy = S[o3 + 1]!;
    let sz = S[o3 + 2]!;
    let ox = O[o3]!;
    let oy = O[o3 + 1]!;
    let oz = O[o3 + 2]!;
    if (twist) {
      const tw = twist[r]!;
      if (tw !== 0) {
        const ct = Math.cos(tw);
        const st = Math.sin(tw);
        const nsx = sx * ct + ox * st;
        const nsy = sy * ct + oy * st;
        const nsz = sz * ct + oz * st;
        ox = ox * ct - sx * st;
        oy = oy * ct - sy * st;
        oz = oz * ct - sz * st;
        sx = nsx;
        sy = nsy;
        sz = nsz;
      }
    }
    const w = hw[r]!;
    const d = hd[r]!;
    const iw = w > 1e-5 ? 1 / w : 0;
    const id = d > 1e-5 ? 1 / d : 0;
    const fz = frizz ? frizz[r]! : 0;
    for (let j = 0; j < sides; j++) {
      const vi = rec.v0 + r * sides + j;
      const c = cos[j]!;
      const s = sin[j]!;
      // Ellipse normal (falls back to the circle normal when collapsed).
      let nx = sx * c * (iw || 1) + ox * s * (id || 1);
      let ny = sy * c * (iw || 1) + oy * s * (id || 1);
      let nz = sz * c * (iw || 1) + oz * s * (id || 1);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      const f = fz * noise[vi]!;
      const p = vi * 3;
      pos[p] = cx + sx * c * w + ox * s * d + nx * f;
      pos[p + 1] = cy + sy * c * w + oy * s * d + ny * f;
      pos[p + 2] = cz + sz * c * w + oz * s * d + nz * f;
      nrm[p] = nx;
      nrm[p + 1] = ny;
      nrm[p + 2] = nz;
    }
  }
  const last = (rec.rings - 1) * 3;
  const tl = hw[rec.rings - 1]! * tipK;
  const ti = (rec.v0 + rec.rings * sides) * 3;
  const tx = T[last]!;
  const ty = T[last + 1]!;
  const tz = T[last + 2]!;
  pos[ti] = C[last]! + tx * tl;
  pos[ti + 1] = C[last + 1]! + ty * tl;
  pos[ti + 2] = C[last + 2]! + tz * tl;
  nrm[ti] = tx;
  nrm[ti + 1] = ty;
  nrm[ti + 2] = tz;
}
