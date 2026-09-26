// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers for the props: swept tubes with a radius profile (handles,
// straws, bananas, scrunchies, pretzels), rounded boxes, "rounded-rectangle
// lathes" (lunchbox trays and lids), 2D outlines (bread slice, heart, star,
// octagon, maple leaf, rounded rect) and a tiny 3×5 pixel font for block
// lettering ("STOP", "#1"). Pure and deterministic — every result is fed to a
// GeoBuilder and then cached per kind/colour by the prop factories.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { GeoBuilder, PartOpts, V3 } from '../render/models/builder';

export type P2 = readonly [number, number];

// ── swept tube ──────────────────────────────────────────────────────────────

/**
 * Tube swept along a polyline with a per-point radius (smooth normals). Open paths get
 * flat end caps; `closed` joins the last point back to the first (rings, scrunchies).
 * `flat` squashes the cross-section along the binormal (straps, ribbons, cutlery handles).
 */
export function sweepGeometry(
  path: readonly V3[],
  radius: number | readonly number[],
  radial = 6,
  closed = false,
  flat = 1,
): THREE.BufferGeometry {
  const n = path.length;
  if (n < 2) throw new Error('sweepGeometry: path needs ≥ 2 points');
  const rad = (i: number) => (typeof radius === 'number' ? radius : (radius[Math.min(i, radius.length - 1)] ?? 0.01));
  const P = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  // Tangents (central differences).
  const T: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = closed ? P[(i - 1 + n) % n]! : P[Math.max(0, i - 1)]!;
    const b = closed ? P[(i + 1) % n]! : P[Math.min(n - 1, i + 1)]!;
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  // Initial normal: perpendicular to T0 using the axis it is least aligned with.
  const t0 = T[0]!;
  const ax = Math.abs(t0.x) <= Math.abs(t0.y) && Math.abs(t0.x) <= Math.abs(t0.z) ? new THREE.Vector3(1, 0, 0) : Math.abs(t0.y) <= Math.abs(t0.z) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const N: THREE.Vector3[] = [new THREE.Vector3().crossVectors(t0, ax).normalize()];
  // Parallel transport by projection (fine for the smooth paths used here).
  for (let i = 1; i < n; i++) {
    const prev = N[i - 1]!;
    const t = T[i]!;
    const v = prev.clone().addScaledVector(t, -prev.dot(t));
    if (v.lengthSq() < 1e-10) v.copy(prev);
    N.push(v.normalize());
  }
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]!).normalize());

  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const cs: number[] = [];
  const sn: number[] = [];
  for (let j = 0; j < radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    cs.push(Math.cos(a));
    sn.push(Math.sin(a));
  }
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = rad(i);
    for (let j = 0; j < radial; j++) {
      const c = cs[j]!;
      const s = sn[j]!;
      pos.push(
        P[i]!.x + (N[i]!.x * c + B[i]!.x * s * flat) * r,
        P[i]!.y + (N[i]!.y * c + B[i]!.y * s * flat) * r,
        P[i]!.z + (N[i]!.z * c + B[i]!.z * s * flat) * r,
      );
      // Ellipse normal: (c·flat, s) in the (N, B) frame.
      tmp.set(0, 0, 0).addScaledVector(N[i]!, c * flat).addScaledVector(B[i]!, s).normalize();
      nor.push(tmp.x, tmp.y, tmp.z);
    }
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const i1 = (i + 1) % n;
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial;
      const a = i * radial + j;
      const b = i * radial + j1;
      const c = i1 * radial + j;
      const d = i1 * radial + j1;
      // (N, B, T) is right-handed → (a, b, c) and (b, d, c) face outward.
      idx.push(a, b, c, b, d, c);
    }
  }
  if (!closed) {
    for (const end of [0, n - 1]) {
      const t = T[end]!;
      const sign = end === 0 ? -1 : 1;
      const base = pos.length / 3;
      for (let j = 0; j < radial; j++) {
        const k = (end * radial + j) * 3;
        pos.push(pos[k]!, pos[k + 1]!, pos[k + 2]!);
        nor.push(t.x * sign, t.y * sign, t.z * sign);
      }
      const centre = pos.length / 3;
      pos.push(P[end]!.x, P[end]!.y, P[end]!.z);
      nor.push(t.x * sign, t.y * sign, t.z * sign);
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        if (end === 0) idx.push(centre, base + j1, base + j);
        else idx.push(centre, base + j, base + j1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Smooth path through control points (Catmull-Rom), `n` samples. */
export function smoothPath(points: readonly V3[], n: number, closed = false): V3[] {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
    closed,
    'centripetal',
  );
  const pts = closed ? curve.getSpacedPoints(n).slice(0, n) : curve.getSpacedPoints(n - 1);
  return pts.map((p) => [p.x, p.y, p.z] as const);
}

/** Circular arc in the XY plane (centre cx, cy; z fixed), angles in radians. */
export function arcPath(cx: number, cy: number, z: number, r: number, a0: number, a1: number, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + ((a1 - a0) * i) / (n - 1);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]);
  }
  return out;
}

/** Add a swept tube part. */
export function tube(
  b: GeoBuilder,
  path: readonly V3[],
  radius: number | readonly number[],
  color: number,
  o: PartOpts = {},
  radial = 6,
  closed = false,
  flat = 1,
): GeoBuilder {
  return b.add(sweepGeometry(path, radius, radial, closed, flat), color, { smooth: true, ...o });
}

/** A primitive placed in a local frame: [geometry, position, euler XYZ rotation]. */
export type LocalPart = readonly [THREE.BufferGeometry, V3, V3?];

/**
 * Merge primitives placed in a local frame into one geometry (so a group of details can be
 * transformed together by one GeoBuilder part — e.g. dots on a tilted face). Inputs are disposed.
 */
export function mergeLocal(parts: readonly LocalPart[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const nm = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (const [g0, at, rot] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0);
    q.setFromEuler(e);
    m.compose(v.set(at[0], at[1], at[2]), q, new THREE.Vector3(1, 1, 1));
    nm.getNormalMatrix(m);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
    }
    if (g !== g0) g.dispose();
    g0.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// ── decals wrapped onto surfaces of revolution (mugs, bottles, jugs) ─────────

/** Flat decal (ShapeGeometry, facing +Z) lifted to z. */
export function flatDecal(pts: readonly P2[], z = 0.001): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), 4);
  g.translate(0, 0, z);
  return g;
}

/** Flat axis-aligned rectangle decal centred at (x, y), lifted to z. */
export function rectDecal(x: number, y: number, w: number, h: number, z = 0.001): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(x, y, z);
  return g;
}

/**
 * Wrap geometry built in "unrolled" coordinates (x = arc length from the front, y = height,
 * z = offset above the surface) onto a surface of revolution around Y whose radius at height
 * y is rAt(y). x = 0 lands on the +Z front (or at angle yaw0). Returns non-indexed geometry.
 */
export function wrapAround(geo: THREE.BufferGeometry, rAt: (y: number) => number, yaw0 = 0): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const r = Math.max(1e-4, rAt(y));
    const th = x / r + yaw0;
    const R = r + z;
    p.setXYZ(i, R * Math.sin(th), y, R * Math.cos(th));
  }
  p.needsUpdate = true;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return g;
}

/** Radius of a lathe profile ([r, y] points, y ascending along the part used) at height y (clamped). */
export function profileRadius(profile: readonly P2[], y: number): number {
  const first = profile[0]!;
  const last = profile[profile.length - 1]!;
  if (y <= first[1]) return first[0];
  if (y >= last[1]) return last[0];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i]!;
    const [r1, y1] = profile[i + 1]!;
    if (y >= y0 && y <= y1) return y1 - y0 < 1e-9 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return last[0];
}

// ── rounded boxes & rounded-rectangle lathes ─────────────────────────────────

/** Rounded box part (chamfered, smooth-shaded edges). segs 1 = 108 triangles. */
export function rbox(b: GeoBuilder, w: number, h: number, d: number, r: number, color: number, o: PartOpts = {}, segs = 1): GeoBuilder {
  return b.add(new RoundedBoxGeometry(w, h, d, segs, r), color, { smooth: true, ...o });
}

/**
 * Rounded rectangle outline (w × d, corner radius r), counter-clockwise when seen from +Y
 * as (x, z) pairs. Each corner gets `seg` + 1 points, so outlines with the same `seg`
 * correspond point-for-point (used by roundRectLathe).
 */
export function roundRectPts(w: number, d: number, r: number, seg = 3): P2[] {
  const hw = w / 2;
  const hd = d / 2;
  const rr = Math.max(0, Math.min(r, hw, hd));
  const corners: [number, number, number][] = [
    [hw - rr, hd - rr, 0],
    [hw - rr, -hd + rr, -Math.PI / 2],
    [-hw + rr, -hd + rr, -Math.PI],
    [-hw + rr, hd - rr, (-3 * Math.PI) / 2],
  ];
  const out: P2[] = [];
  // Walk (+x,+z) → (+x,−z) → (−x,−z) → (−x,+z): clockwise in (x, z) maths axes, i.e.
  // counter-clockwise when viewed from +Y (x right, z toward the viewer).
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (-Math.PI / 2) * (i / seg) + Math.PI / 2;
      out.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
    }
  }
  return out;
}

/**
 * A lathe around a rounded rectangle instead of a circle: `profile` is a list of
 * [inset, y] pairs (inset = how far the ring is pulled in from the w × d outline).
 * Rings are rounded rectangles (w − 2·inset) × (d − 2·inset) with corner radius r − inset.
 * Smooth normals, faces oriented away from the axis (outer walls, domed lids). Rings that
 * collapse (inset ≥ d/2) close the top like a lathe's pole.
 */
export function roundRectLathe(w: number, d: number, r: number, profile: readonly P2[], seg = 3, inward = false): THREE.BufferGeometry {
  const rings = profile.map(([inset, y]) => {
    const ww = Math.max(1e-4, w - 2 * inset);
    const dd = Math.max(1e-4, d - 2 * inset);
    return { pts: roundRectPts(ww, dd, Math.max(1e-4, r - inset), seg), y };
  });
  const m = rings[0]!.pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const ring of rings) for (const [x, z] of ring.pts) pos.push(x, ring.y, z);
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j1;
      const c = (i + 1) * m + j;
      const dd = (i + 1) * m + j1;
      idx.push(a, b, c, b, dd, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Orient: first band must face away from the axis (or toward it for inner walls).
  const nrm = g.getAttribute('normal');
  let dot = 0;
  for (let j = 0; j < m; j++) dot += nrm.getX(j) * pos[j * 3]! + nrm.getZ(j) * pos[j * 3 + 2]!;
  if (dot < 0 !== inward) {
    const ix = g.getIndex()!;
    const arr = ix.array as Uint16Array | Uint32Array;
    for (let t = 0; t < arr.length; t += 3) {
      const tmp = arr[t + 1]!;
      arr[t + 1] = arr[t + 2]!;
      arr[t + 2] = tmp;
    }
    ix.needsUpdate = true;
    g.computeVertexNormals();
  }
  return g;
}

/** Flat (x, z) outline slab lying in XZ, from y0 to y0 + h. */
export function slab(b: GeoBuilder, pts: readonly P2[], y0: number, h: number, color: number, o: PartOpts = {}): GeoBuilder {
  const at = o.at ?? [0, 0, 0];
  // Extrude builds the shape in XY and extrudes along Z (centred); rotating −90° about X maps
  // shape (sx, sy) → (sx, ·, −sy), so feed (x, −z).
  return b.extrude(
    pts.map(([x, z]) => [x, -z] as const),
    h,
    color,
    { ...o, at: [at[0], y0 + h / 2 + at[1], at[2]], rot: [-Math.PI / 2, 0, 0] },
  );
}

/** Upright plate: an XY outline extruded `depth` along Z, its back at z0 (front faces +Z). */
export function plate(b: GeoBuilder, pts: readonly P2[], z0: number, depth: number, color: number, o: PartOpts = {}): GeoBuilder {
  const at = o.at ?? [0, 0, 0];
  return b.extrude(pts, depth, color, { ...o, at: [at[0], at[1], z0 + depth / 2 + at[2]] });
}

// ── 2D outlines (all centred on the origin unless noted) ─────────────────────

/** Classic bread-slice silhouette: flat bottom, straight sides, two domed shoulders. Bottom at y = 0. */
export function breadPts(w: number, h: number, seg = 5): P2[] {
  const out: P2[] = [];
  const rb = w * 0.08;
  const lobeR = w * 0.27;
  const lobeY = h - lobeR * 0.95;
  // bottom edge (left → right), bottom-right corner
  out.push([-w / 2 + rb, 0], [w / 2 - rb, 0]);
  for (let i = 1; i <= 2; i++) {
    const a = -Math.PI / 2 + (i / 2) * (Math.PI / 2);
    out.push([w / 2 - rb + Math.cos(a) * rb, rb + Math.sin(a) * rb]);
  }
  // right lobe then left lobe (counter-clockwise over the top)
  const lobe = (cx: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + ((a1 - a0) * i) / seg;
      out.push([cx + Math.cos(a) * lobeR, lobeY + Math.sin(a) * lobeR]);
    }
  };
  lobe(w / 2 - lobeR * 0.98, -0.45, Math.PI * 0.72);
  lobe(-w / 2 + lobeR * 0.98, Math.PI * 0.28, Math.PI + 0.45);
  // bottom-left corner (its last point would repeat the first one, so stop before it)
  for (let i = 0; i <= 1; i++) {
    const a = Math.PI + (i / 2) * (Math.PI / 2);
    out.push([-w / 2 + rb + Math.cos(a) * rb, rb + Math.sin(a) * rb]);
  }
  return out;
}

/** Heart outline (point down), total width ≈ size, centred. */
export function heartPts(size: number, n = 24): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.pow(Math.sin(t), 3);
    const y = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
    out.push([x * size * 0.5, (y + 0.1) * size * 0.5]);
  }
  return out;
}

/** n-pointed star outline, first point straight up. */
export function starPts(outer: number, inner: number, n = 5): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Regular polygon (octagon by default) with a flat top edge. */
export function polygonPts(r: number, n = 8): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / n + (i / n) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

/** Circle outline. */
export function circlePts(r: number, n = 12, cx = 0, cy = 0): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Pointed-oval leaf / petal outline along +Y (length len, width w), base at y = 0. */
export function leafPts(len: number, w: number, n = 6): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([Math.sin(t * Math.PI) * w * 0.5, t * len]);
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    out.push([-Math.sin(t * Math.PI) * w * 0.5, t * len]);
  }
  return out;
}

/** Teardrop (round bottom, point up), height ≈ size, bottom at y = 0. */
export function dropPts(size: number, n = 14): P2[] {
  const r = size * 0.36;
  const cy = r;
  // Tangent points from the tip to the circle sit at ±phi from the upward axis.
  const d = size - cy;
  const phi = Math.acos(Math.min(0.999, r / d));
  const aR = Math.PI / 2 - phi;
  const sweep = Math.PI * 2 - 2 * phi;
  const out: P2[] = [[0, size]];
  for (let i = 0; i <= n; i++) {
    const a = aR - (sweep * i) / n;
    out.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Round every corner of a polygon (quadratic corners of radius ≈ r, seg + 1 points each). */
export function roundPoly(pts: readonly P2[], r: number, seg = 2): P2[] {
  const out: P2[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [vx, vy] = pts[i]!;
    const [px, py] = pts[(i - 1 + n) % n]!;
    const [nx, ny] = pts[(i + 1) % n]!;
    const lp = Math.hypot(px - vx, py - vy) || 1;
    const ln = Math.hypot(nx - vx, ny - vy) || 1;
    const rp = Math.min(r, lp * 0.45);
    const rn = Math.min(r, ln * 0.45);
    const ax = vx + ((px - vx) / lp) * rp;
    const ay = vy + ((py - vy) / lp) * rp;
    const bx = vx + ((nx - vx) / ln) * rn;
    const by = vy + ((ny - vy) / ln) * rn;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const u = 1 - t;
      out.push([u * u * ax + 2 * u * t * vx + t * t * bx, u * u * ay + 2 * u * t * vy + t * t * by]);
    }
  }
  return out;
}

/** Scale an outline about a point. */
export function scalePts(pts: readonly P2[], k: number, cx = 0, cy = 0): P2[] {
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as const);
}

/** Cartoon maple leaf (5 rounded lobes, tip up), centred, overall size ≈ size. */
export function maplePts(size: number, n = 40): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Lobes at 90° (top), ±45° … weighted so the top lobe is biggest; notch at the bottom stem.
    const up = Math.sin(a);
    const lobes = Math.pow(Math.abs(Math.cos(2.5 * (a - Math.PI / 2))), 0.7);
    const r = size * 0.5 * (0.5 + 0.42 * lobes) * (0.85 + 0.15 * up) * (up < -0.85 ? 0.55 : 1);
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
}

// ── 3×5 pixel font ────────────────────────────────────────────────────────────

const FONT: Readonly<Record<string, readonly string[]>> = {
  S: ['###', '#..', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  "'": ['.#.', '.#.', '...', '...', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};

/** A lit run of pixels: centre x, centre y, width, height (text units = cell size). */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Lay out block text in the XY plane, centred on the origin: each glyph is 3×5 cells of
 * size `cell` with one blank column between glyphs. Horizontal runs are merged into one
 * rectangle (fewer boxes). Unknown characters render as blanks.
 */
export function pixelText(text: string, cell: number): PixelRect[] {
  const glyphs = [...text.toUpperCase()];
  const totalW = glyphs.length * 4 - 1;
  const out: PixelRect[] = [];
  glyphs.forEach((ch, gi) => {
    const rows = FONT[ch] ?? FONT[' ']!;
    rows.forEach((row, ri) => {
      let run = -1;
      for (let c = 0; c <= 3; c++) {
        const lit = c < 3 && row[c] === '#';
        if (lit && run < 0) run = c;
        if (!lit && run >= 0) {
          const col0 = gi * 4 + run;
          const len = c - run;
          out.push({
            x: (col0 + len / 2 - totalW / 2) * cell,
            y: (2.5 - ri - 0.5) * cell,
            w: len * cell,
            h: cell,
          });
          run = -1;
        }
      }
    });
  });
  return out;
}

/** Add block text as thin boxes (facing +Z) centred at `at`. */
export function addPixelText(b: GeoBuilder, text: string, cell: number, depth: number, color: number, at: V3, o: PartOpts = {}): GeoBuilder {
  for (const r of pixelText(text, cell)) b.box(r.w, r.h, depth, color, { ink: false, ...o, at: [at[0] + r.x, at[1] + r.y, at[2]] });
  return b;
}
