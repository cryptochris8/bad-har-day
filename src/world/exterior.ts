// ─────────────────────────────────────────────────────────────────────────────
// Everything outside the house: lawn, paths, patio, driveway, sidewalk + street,
// flowerbeds, shrubs, hedges, the picket-fenced backyard (instanced pickets) with
// its tree, the dog's bush, fallen leaves, swing set and patio; porch lights,
// mailbox, street lamps, low-detail neighbour houses (windows glow at night)
// and a ring of distant trees. Grass tufts and leaves are instanced.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, hash01, linear, shadeHex } from '../render/models/builder';
import { modelMaterial, sceneryMaterial, windowMaterial } from '../render/models/materials';
import { Frame, plant, type Glows } from './kit';
import { DRIVEWAY, FENCES, HOUSE, OUT, STREET, YARD, inRect, rect, type Furn, type Rect } from './layout';
import { HEDGE_T } from './physics';
import { splitGeometry } from './split';
import { faceFrame, findWall } from './house';

const fx = (f: Furn) => (f.r.x0 + f.r.x1) / 2;
const fz = (f: Furn) => (f.r.z0 + f.r.z1) / 2;

// Areas that are NOT lawn (no grass tufts / leaves there).
const PAVED: Rect[] = [
  rect(HOUSE.x0 - 0.3, HOUSE.z0 - 0.3, HOUSE.x1 + 0.3, HOUSE.z1 + 0.3),
  rect(DRIVEWAY.x0 - 0.2, DRIVEWAY.z0 - 0.2, DRIVEWAY.x1 + 0.2, 30),
  rect(-80, STREET.sidewalk0 - 0.1, 80, 30),
  rect(-2.8, 4.5, -0.4, 10.7), // porch + front walk
  rect(9.1, -6.4, 12.7, -2.5), // patio
  rect(-10.5, -3.7, -9.0, 4.6), // west bed strip
  rect(-9.0, 4.5, 9.0, 5.6), // front flowerbeds
];
const isPaved = (x: number, z: number, pad = 0.15) => PAVED.some((r) => inRect(r, x, z, pad));

/** Ground: big lawn plane with soft vertex-colour variation (one mesh). */
function groundGeometry(): THREE.BufferGeometry {
  const W = 260;
  const D = 220;
  const g = new THREE.PlaneGeometry(W, D, 52, 44);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.02, 20);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const a = linear(PAL.grassA);
  const b = linear(PAL.grassB);
  const far = linear(shadeHex(PAL.grassB, 0.92));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const n = 0.5 + 0.25 * Math.sin(x * 0.21 + z * 0.13) + 0.25 * Math.sin(x * 0.07 - z * 0.19 + 1.3);
    const d = Math.min(1, Math.max(0, (Math.hypot(x, z * 1.2) - 30) / 60));
    for (let k = 0; k < 3; k++) {
      const v = a[k]! + (b[k]! - a[k]!) * n;
      col[i * 3 + k] = v + (far[k]! - v) * d;
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function pavers(b: GeoBuilder, r: Rect, sx: number, sz: number, a: number, c: number, gap: number, seed: number, y = 0.004): void {
  b.box(r.x1 - r.x0, 0.03, r.z1 - r.z0, shadeHex(c, 0.78), { at: [(r.x0 + r.x1) / 2, y - 0.02, (r.z0 + r.z1) / 2] });
  let j = 0;
  for (let z = r.z0; z < r.z1 - 0.02; z += sz, j++) {
    const off = j % 2 ? sx / 2 : 0;
    for (let x = r.x0 - off; x < r.x1 - 0.02; x += sx) {
      const x0 = Math.max(r.x0, x + gap / 2);
      const x1 = Math.min(r.x1, x + sx - gap / 2);
      const z1 = Math.min(r.z1, z + sz - gap / 2);
      if (x1 - x0 < 0.05) continue;
      const k = hash01(seed, Math.round(x * 10), j);
      b.box(x1 - x0, 0.02, z1 - z - gap / 2, shadeHex(k > 0.5 ? a : c, 0.95 + k * 0.08), { at: [(x0 + x1) / 2, y, (z + gap / 2 + z1) / 2] });
    }
  }
}

function stepStones(b: GeoBuilder, pts: [number, number][], seed: number): void {
  pts.forEach(([x, z], i) => {
    const r = 0.26 + hash01(seed, i) * 0.06;
    b.cyl(r, r, 0.03, 9, shadeHex(PAL.paver, 0.95 + hash01(seed, i, 2) * 0.1), { at: [x, 0.0, z], rot: [0, hash01(seed, i, 3) * 3, 0], scale: [1.15, 1, 0.9] });
  });
}

let shrubShadow: GeoBuilder | null = null;

function shrub(f: Frame, x: number, z: number, r: number, seed: number, col: number = PAL.hedge, flowers = 0): void {
  shrubShadow?.ball(r * 0.85, 0, 0xffffff, { at: [x, r * 0.72, z], scale: [1.05, 0.85, 1.0], ink: false });
  f.ball(r, 1, col, x, r * 0.72, z, { smooth: true, jitter: r * 0.07, seed, scale: [1.1, 0.9, 1.05] });
  f.ball(r * 0.7, 1, shadeHex(col, 1.12), x + r * 0.35, r * 1.1, z + r * 0.2, { smooth: true, jitter: r * 0.05, seed: seed + 1 });
  for (let i = 0; i < flowers; i++) {
    const a = hash01(seed, i) * Math.PI * 2;
    const h = 0.4 + hash01(seed, i, 2) * 0.5;
    f.ball(r * 0.14, 0, [PAL.flowerPink, PAL.flowerYellow, 0xffffff][i % 3]!, x + Math.cos(a) * r * 0.85, r * (0.6 + h * 0.6), z + Math.sin(a) * r * 0.85, { ink: false });
  }
}

function tree(f: Frame, x: number, z: number, h: number, r: number, seed: number, leaf: number, leafDark: number, accent?: number): void {
  f.cyl(r * 0.12, r * 0.18, h * 0.55, 8, PAL.treeTrunk, x, h * 0.275, z);
  f.cyl(r * 0.05, r * 0.08, r * 0.8, 6, PAL.treeTrunk, x + r * 0.2, h * 0.5, z, { rot: [0, 0, -0.7] });
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const rr = r * (0.45 + hash01(seed, i) * 0.2);
    const y = h * 0.62 + hash01(seed, i, 2) * h * 0.18;
    const c = accent !== undefined && i % 3 === 1 ? accent : i % 2 ? leaf : leafDark;
    f.ball(r * (0.5 + hash01(seed, i, 3) * 0.12), 1, c, x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, { smooth: true, jitter: r * 0.04, seed: seed + i });
  }
  f.ball(r * 0.62, 1, leaf, x, h * 0.86, z, { smooth: true, jitter: r * 0.04, seed: seed + 9 });
}

/** Low-detail neighbour house (body into `b`, glass panes into `win` with a per-window rank). */
function neighbour(
  b: GeoBuilder,
  win: { pos: number[]; nor: number[]; col: number[]; rank: number[] },
  x: number,
  z: number,
  w: number,
  d: number,
  facing: 1 | -1,
  wall: number,
  roof: number,
  seed: number,
): void {
  const H = 2.9;
  const f = new Frame(b, x, 0, z, facing > 0 ? 0 : Math.PI);
  f.box(w + 0.2, 0.3, d + 0.2, PAL.foundation, 0, 0.15, 0);
  f.box(w, H, d, wall, 0, 0.3 + H / 2, 0, { shade: 0.02, seed });
  f.gable(d + 0.9, 1.9, w + 0.7, roof, 0, 0.3 + H + 0.95, 0, { rot: [0, Math.PI / 2, 0] });
  f.box(0.7, 1.6, 0.7, PAL.brick, w * 0.28, 0.3 + H + 1.1, -d * 0.15);
  f.box(1.0, 2.1, 0.08, [PAL.frontDoor, PAL.shutter, PAL.booksA][seed % 3]!, -w * 0.18, 0.3 + 1.05, d / 2 + 0.03);
  f.box(1.6, 0.25, 1.0, PAL.sidewalk, -w * 0.18, 0.12, d / 2 + 0.5);
  const glass = linear(0x9fb8d6);
  const addWin = (lx: number, ly: number, lz: number, ww: number, hh: number, sideZ: number) => {
    const c = f.at(lx, ly, lz + sideZ * 0.05);
    const g = new THREE.BoxGeometry(ww, hh, 0.06).toNonIndexed();
    g.rotateY(facing > 0 ? 0 : Math.PI);
    g.translate(c[0], c[1], c[2]);
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const r = hash01(seed, Math.round(lx * 10), Math.round(lz * 10));
    for (let k = 0; k < p.count; k++) {
      win.pos.push(p.getX(k), p.getY(k), p.getZ(k));
      win.nor.push(n.getX(k), n.getY(k), n.getZ(k));
      win.col.push(glass[0]!, glass[1]!, glass[2]!);
      win.rank.push(r);
    }
    g.dispose();
    // trim frame
    f.box(ww + 0.14, 0.07, 0.08, PAL.trim, lx, ly + hh / 2 + 0.035, lz + sideZ * 0.04);
    f.box(ww + 0.2, 0.08, 0.14, PAL.trim, lx, ly - hh / 2 - 0.04, lz + sideZ * 0.06);
  };
  for (const lx of [-w * 0.38, w * 0.2, w * 0.38]) if (Math.abs(lx + w * 0.18) > 0.8) addWin(lx, 1.8, d / 2, 1.1, 1.1, 1);
  for (const lx of [-w * 0.3, w * 0.05, w * 0.32]) addWin(lx, 1.8, -d / 2, 1.0, 1.0, -1);
}

export interface ExteriorSet {
  readonly group: THREE.Group;
  setWindows(frac: number): void;
  dispose(): void;
}

export function buildExterior(quality: 'high' | 'low', wallB: GeoBuilder, glows: Glows, shadow: GeoBuilder): ExteriorSet {
  const group = new THREE.Group();
  group.name = 'exterior';
  const disposables: { dispose(): void }[] = [];
  const hi = quality === 'high';
  shrubShadow = shadow;

  // ── ground ──
  const groundGeo = groundGeometry();
  const ground = new THREE.Mesh(groundGeo, sceneryMaterial());
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  disposables.push(groundGeo);

  // ── flat pavement / beds (scenery) ──
  const P = new GeoBuilder(false, false);
  // porch + front walk + path to the driveway
  pavers(P, rect(-2.75, 4.62, -0.45, 5.9), 0.55, 0.42, PAL.paver, PAL.paverB, 0.02, 1);
  pavers(P, rect(-2.15, 5.9, -1.05, STREET.sidewalk0), 0.55, 0.42, PAL.paver, PAL.paverB, 0.025, 2);
  pavers(P, rect(DRIVEWAY.x1, 6.0, -2.15, 6.9), 0.6, 0.45, PAL.paver, PAL.paverB, 0.025, 3);
  // patio
  pavers(P, rect(9.12, -6.3, 12.6, -2.6), 0.6, 0.6, PAL.paver, PAL.paverB, 0.02, 4);
  // back door step
  P.box(0.7, 0.08, 1.35, PAL.sidewalk, { at: [9.45, 0.02, -4.57] });
  // stepping stones: front walk → side path → gate; patio → gate (inside the yard)
  stepStones(
    P,
    [
      [0.2, 6.5],
      [1.1, 6.45],
      [2.0, 6.55],
      [2.9, 6.5],
      [3.8, 6.45],
      [4.7, 6.55],
      [5.6, 6.5],
      [6.5, 6.4],
      [7.4, 6.45],
      [8.3, 6.3],
      [9.2, 6.0],
      [10.0, 5.4],
      [10.7, 4.6],
      [10.8, 3.7],
      [10.8, 2.8],
      [10.8, 1.9],
      [10.8, 1.0],
      [10.8, 0.1],
      [10.8, -0.8],
      [10.8, -1.7],
    ],
    5,
  );
  // driveway (concrete with joints) + apron over the sidewalk
  P.box(DRIVEWAY.x1 - DRIVEWAY.x0, 0.04, DRIVEWAY.z1 - DRIVEWAY.z0, PAL.driveway, { at: [(DRIVEWAY.x0 + DRIVEWAY.x1) / 2, -0.012, (DRIVEWAY.z0 + DRIVEWAY.z1) / 2] });
  for (let z = DRIVEWAY.z0 + 3; z < DRIVEWAY.z1 - 0.5; z += 3.2) P.box(DRIVEWAY.x1 - DRIVEWAY.x0, 0.042, 0.03, shadeHex(PAL.driveway, 0.82), { at: [(DRIVEWAY.x0 + DRIVEWAY.x1) / 2, -0.01, z] });
  P.box(0.03, 0.042, DRIVEWAY.z1 - DRIVEWAY.z0, shadeHex(PAL.driveway, 0.82), { at: [(DRIVEWAY.x0 + DRIVEWAY.x1) / 2, -0.01, (DRIVEWAY.z0 + DRIVEWAY.z1) / 2] });
  // sidewalk, curb, street, far side
  P.box(160, 0.04, STREET.sidewalk1 - STREET.sidewalk0, PAL.sidewalk, { at: [0, -0.015, (STREET.sidewalk0 + STREET.sidewalk1) / 2] });
  for (let x = -60; x < 60; x += 1.6) P.box(0.025, 0.042, STREET.sidewalk1 - STREET.sidewalk0, shadeHex(PAL.sidewalk, 0.85), { at: [x, -0.012, (STREET.sidewalk0 + STREET.sidewalk1) / 2] });
  P.box(160, 0.14, 0.18, PAL.curb, { at: [0, 0.03, STREET.road0 - 0.05] });
  P.box(160, 0.04, STREET.road1 - STREET.road0, PAL.asphalt, { at: [0, -0.03, (STREET.road0 + STREET.road1) / 2] });
  for (let x = -60; x < 60; x += 3) P.box(1.6, 0.045, 0.14, PAL.asphaltLine, { at: [x, -0.027, (STREET.road0 + STREET.road1) / 2] });
  P.box(160, 0.14, 0.18, PAL.curb, { at: [0, 0.03, STREET.road1 + 0.05] });
  P.box(160, 0.04, 2.0, PAL.sidewalk, { at: [0, -0.015, STREET.road1 + 1.1] });
  P.box(DRIVEWAY.x1 - DRIVEWAY.x0, 0.05, STREET.road0 - STREET.sidewalk0 + 0.2, PAL.driveway, { at: [(DRIVEWAY.x0 + DRIVEWAY.x1) / 2, -0.008, (STREET.sidewalk0 + STREET.road0) / 2] });
  // mulch beds: front of the house, west strip, yard border along the east fence
  P.box(HOUSE.x1 - HOUSE.x0 - 0.1, 0.03, 0.85, PAL.mulch, { at: [0, -0.005, HOUSE.z1 + 0.54] });
  P.box(1.3, 0.03, 8.0, PAL.mulch, { at: [-9.75, -0.005, 0.5] });
  P.box(0.9, 0.03, YARD.z1 - YARD.z0 - 0.4, PAL.mulch, { at: [YARD.x1 - 0.55, -0.005, (YARD.z0 + YARD.z1) / 2] });
  const pGeo = P.build();
  disposables.push(pGeo);
  const paving = new THREE.Mesh(pGeo, sceneryMaterial());
  paving.receiveShadow = true;
  paving.name = 'paving';
  group.add(paving);

  // ── inked props: shrubs, flowers, trees, hedges, fence rails & posts, yard toys, street lamps, mailbox ──
  const B = new GeoBuilder(true, true);
  const W = new Frame(B, 0, 0, 0, 0);
  // front flowerbeds (skip the porch)
  for (let x = -8.4; x < 8.6; x += 0.95) {
    if (x > -3.2 && x < 0.0) continue;
    const s = Math.round(x * 10);
    if (hash01(s, 3) > 0.45) shrub(W, x, HOUSE.z1 + 0.55, 0.3 + hash01(s, 4) * 0.1, s, PAL.hedge, hi ? 3 : 1);
    else
      for (let k = 0; k < 4; k++)
        W.ball(0.07, 0, [PAL.flowerPink, PAL.flowerYellow, 0xffffff, PAL.confettiA][(s + k) & 3]!, x + (k - 1.5) * 0.18, 0.22 + (k % 2) * 0.06, HOUSE.z1 + 0.5 + (k % 2) * 0.15, {});
  }
  shrub(W, -3.05, HOUSE.z1 + 0.55, 0.38, 77, PAL.hedge, 3);
  shrub(W, -0.15, HOUSE.z1 + 0.55, 0.38, 78, PAL.hedge, 3);
  for (let z = -3.0; z < 4.2; z += 1.3) shrub(W, -9.75, z, 0.34, Math.round(z * 10) + 200, shadeHex(PAL.hedge, 1.05), hi ? 2 : 0);
  // hedges on the lot lines
  for (const fr of FENCES) {
    if (fr.kind !== 'hedge') continue;
    const len = Math.hypot(fr.x1 - fr.x0, fr.z1 - fr.z0);
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = fr.x0 + (fr.x1 - fr.x0) * t;
      const z = fr.z0 + (fr.z1 - fr.z0) * t;
      W.rbox(fr.x0 === fr.x1 ? HEDGE_T : len / n + 0.1, 1.05, fr.x0 === fr.x1 ? len / n + 0.1 : HEDGE_T, 0.28, i % 2 ? PAL.hedge : shadeHex(PAL.hedge, 1.06), x, 0.525, z, {}, 1);
      shadow.box(fr.x0 === fr.x1 ? HEDGE_T - 0.1 : len / n, 0.95, fr.x0 === fr.x1 ? len / n : HEDGE_T - 0.1, 0xffffff, { at: [x, 0.48, z], ink: false });
    }
  }
  // yard fence rails + posts (pickets are instanced below)
  const railCol = shadeHex(PAL.fence, 0.94);
  const pickets: { x: number; z: number; yaw: number }[] = [];
  for (const fr of FENCES) {
    if (fr.kind !== 'picket') continue;
    const len = Math.hypot(fr.x1 - fr.x0, fr.z1 - fr.z0);
    const yaw = Math.atan2(fr.x1 - fr.x0, fr.z1 - fr.z0);
    const mx = (fr.x0 + fr.x1) / 2;
    const mz = (fr.z0 + fr.z1) / 2;
    for (const y of [0.35, 0.85]) W.box(0.05, 0.08, len, railCol, mx, y, mz, { rot: [0, yaw, 0], ink: false });
    const nPost = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= nPost; i++) {
      const t = i / nPost;
      W.box(0.11, 1.3, 0.11, PAL.fence, fr.x0 + (fr.x1 - fr.x0) * t, 0.65, fr.z0 + (fr.z1 - fr.z0) * t);
      W.cone(0.09, 0.1, 4, PAL.fence, fr.x0 + (fr.x1 - fr.x0) * t, 1.35, fr.z0 + (fr.z1 - fr.z0) * t, { rot: [0, Math.PI / 4, 0] });
    }
    const n = Math.floor(len / 0.17);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      pickets.push({ x: fr.x0 + (fr.x1 - fr.x0) * t, z: fr.z0 + (fr.z1 - fr.z0) * t, yaw });
    }
  }
  // gate: open leaf swung into the yard + an arbor over it
  const gx0 = YARD.gateA;
  const gx1 = YARD.gateB;
  const G = new Frame(B, gx0 + 0.05, 0, YARD.z1, 0);
  for (const z of [-0.03, -1.02]) G.box(0.05, 1.1, 0.06, PAL.fence, 0.03, 0.6, z);
  for (let k = 0; k < 6; k++) G.box(0.03, 1.05, 0.08, PAL.fence, 0.03, 0.62, -0.1 - k * 0.17);
  for (const y of [0.35, 0.85]) G.box(0.05, 0.08, 1.05, railCol, 0.03, y, -0.52, { ink: false });
  const arb = new Frame(B, (gx0 + gx1) / 2, 0, YARD.z1, 0);
  for (const s of [-1, 1]) arb.box(0.1, 2.3, 0.1, PAL.fence, s * ((gx1 - gx0) / 2 + 0.08), 1.15, 0);
  arb.torus((gx1 - gx0) / 2 + 0.08, 0.05, 6, 16, PAL.fence, 0, 2.3, 0, { scale: [1, 0.45, 1] }, Math.PI);
  for (let k = 0; k < 9; k++) {
    const a = (k / 8) * Math.PI;
    arb.ball(0.09, 0, k % 3 ? PAL.plantGreen : PAL.flowerPink, Math.cos(a) * ((gx1 - gx0) / 2 + 0.08), 2.3 + Math.sin(a) * 0.3, 0.05, { ink: false });
  }
  // yard: big tree, small tree, the dog's bush, swing set, patio set, planter, gnome, ball, flower border
  tree(W, fx(OUT.yardTree), fz(OUT.yardTree), 5.4, 1.9, 11, PAL.treeLeaf, PAL.treeLeafDark, PAL.leafAutumn);
  tree(W, fx(OUT.yardTreeSmall), fz(OUT.yardTreeSmall), 3.8, 1.2, 12, 0xe8a33d, 0xd4832a, PAL.treeLeaf);
  shrub(W, fx(OUT.yardBush), fz(OUT.yardBush), 0.78, 13, shadeHex(PAL.hedge, 0.96), 0);
  shrub(W, fx(OUT.yardBush) + 0.75, fz(OUT.yardBush) - 0.2, 0.5, 14, PAL.hedge, 0);
  const sw = OUT.swingSet.r;
  const SW = new Frame(B, (sw.x0 + sw.x1) / 2, 0, (sw.z0 + sw.z1) / 2, 0);
  const swl = sw.x1 - sw.x0;
  for (const s of [-1, 1])
    for (const d of [-1, 1]) SW.cyl(0.05, 0.06, 2.35, 6, PAL.woodWarm, s * (swl / 2 - 0.1), 1.1, d * 0.38, { rot: [d * 0.33, 0, 0] });
  SW.cyl(0.07, 0.07, swl, 8, PAL.woodWarm, 0, 2.2, 0, { rot: [0, 0, Math.PI / 2] });
  for (const [x, c] of [
    [-0.55, PAL.addyMain],
    [0.55, PAL.heidiMain],
  ] as const) {
    for (const d of [-0.18, 0.18]) SW.cyl(0.008, 0.008, 1.7, 4, 0x8a8f99, x + d, 1.33, 0, { ink: false });
    SW.rbox(0.48, 0.04, 0.2, 0.02, c, x, 0.48, 0);
  }
  const pt = OUT.patioTable;
  W.cyl(0.42, 0.42, 0.04, 18, PAL.cabinetCream, fx(pt), 0.72, fz(pt));
  W.cyl(0.03, 0.03, 0.7, 6, PAL.stoveDark, fx(pt), 0.36, fz(pt));
  W.cyl(0.22, 0.25, 0.03, 12, PAL.stoveDark, fx(pt), 0.015, fz(pt));
  for (const [dx, yaw] of [
    [-0.72, Math.PI / 2],
    [0.72, -Math.PI / 2],
  ] as const) {
    const C = new Frame(B, fx(pt) + dx, 0, fz(pt), yaw);
    C.rbox(0.44, 0.05, 0.42, 0.02, PAL.shutter, 0, 0.44, 0);
    C.rbox(0.44, 0.42, 0.05, 0.02, PAL.shutter, 0, 0.7, -0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) C.cyl(0.018, 0.018, 0.44, 5, PAL.stoveDark, sx * 0.18, 0.22, sz * 0.17, { ink: false });
  }
  plant(W, fx(OUT.planterA), fz(OUT.planterA), 0.7, 21, PAL.plantPot, PAL.plantGreen);
  plant(W, 9.45, -3.1, 0.55, 22, 0xd9825b, PAL.flowerPink);
  // gnome by the flower border
  const gn = new Frame(B, 19.7, 0, -4.2, -Math.PI / 2 - 0.4);
  gn.cyl(0.1, 0.13, 0.22, 10, PAL.booksA, 0, 0.11, 0);
  gn.sphere(0.08, 10, 8, 0xf6d2b0, 0, 0.27, 0);
  gn.cone(0.1, 0.24, 10, PAL.gnomeRed, 0, 0.43, 0, { rot: [0.15, 0, 0] });
  gn.sphere(0.07, 8, 6, 0xffffff, 0, 0.21, 0.05, { scale: [1, 0.9, 0.6] });
  W.sphere(0.11, 12, 8, PAL.confettiA, 15.6, 0.11, -7.4);
  W.box(0.06, 0.02, 0.2, 0xffffff, 15.65, 0.2, -7.4, { rot: [0, 0.4, 0.3], ink: false });
  for (let z = YARD.z0 + 0.8; z < YARD.z1 - 0.6; z += 0.9) {
    const s = Math.round(z * 10) + 500;
    if (hash01(s, 1) > 0.35) shrub(W, YARD.x1 - 0.5, z, 0.26, s, PAL.hedge, hi ? 3 : 1);
  }
  // side path: hose reel
  const hr = OUT.hoseReel;
  W.cyl(0.18, 0.18, 0.12, 12, 0x3d9a5a, fx(hr), 0.35, fz(hr), { rot: [0, 0, Math.PI / 2] });
  W.torus(0.16, 0.035, 5, 14, 0x4fbf6a, fx(hr), 0.35, fz(hr), { rot: [0, Math.PI / 2, 0], ink: false });
  W.box(0.08, 0.5, 0.3, 0x3d9a5a, fx(hr), 0.2, fz(hr));
  // front: ornamental maple, mailbox, street lamps
  tree(W, fx(OUT.frontTree), fz(OUT.frontTree), 4.2, 1.5, 31, 0xe8743d, 0xd4582a, PAL.leafAutumn);
  const mb = OUT.mailbox;
  W.cyl(0.05, 0.05, 1.0, 6, PAL.woodWarm, fx(mb), 0.5, fz(mb));
  W.rbox(0.24, 0.24, 0.48, 0.1, PAL.chrisHoodie, fx(mb), 1.1, fz(mb) - 0.02, {}, 2);
  W.box(0.02, 0.2, 0.06, PAL.gnomeRed, fx(mb) + 0.13, 1.2, fz(mb) - 0.12);
  for (const l of [
    [-12.0, 12.95],
    [7.0, 12.95],
  ] as const) {
    const post = 0x3f4f48;
    W.cyl(0.06, 0.09, 3.5, 8, post, l[0], 1.75, l[1]);
    W.cyl(0.15, 0.17, 0.25, 8, post, l[0], 0.12, l[1]);
    W.torus(0.09, 0.02, 4, 10, post, l[0], 3.45, l[1], { rot: [Math.PI / 2, 0, 0], ink: false });
    W.cyl(0.05, 0.16, 0.12, 8, post, l[0], 3.62, l[1]);
    W.cone(0.24, 0.24, 8, post, l[0], 4.32, l[1]);
    W.ball(0.05, 0, post, l[0], 4.47, l[1], { ink: false });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      W.box(0.025, 0.46, 0.025, post, l[0] + Math.cos(a) * 0.15, 3.93, l[1] + Math.sin(a) * 0.15, { ink: false });
    }
    new Frame(glows.outdoor, l[0], 0, l[1], 0).cyl(0.14, 0.11, 0.42, 8, PAL.lampBulb, 0, 3.92, 0, { ink: false });
  }
  // porch light (front facade) + back door light (east facade), glowing parts in the outdoor group
  const wFront = findWall('x', 4.5, -3.6);
  const pl = faceFrame(wallB, wFront, 1, -2.55, 0);
  pl.box(0.12, 0.2, 0.05, PAL.stoveDark, 0, 1.98, 0.025);
  pl.box(0.16, 0.03, 0.2, PAL.stoveDark, 0, 2.14, 0.12);
  pl.on(glows.outdoor).rbox(0.13, 0.2, 0.13, 0.03, PAL.lampBulb, 0, 1.99, 0.13, { ink: false });
  const wBack = findWall('z', 9, -6.5);
  const bl = faceFrame(wallB, wBack, 1, -3.75, 0);
  bl.box(0.1, 0.18, 0.05, PAL.stoveDark, 0, 2.0, 0.025);
  bl.on(glows.outdoor).sphere(0.08, 10, 8, PAL.lampBulb, 0, 1.96, 0.1, { ink: false });

  const bGeo = B.build();
  const region = (x: number, _y: number, z: number): number => (x < -9.4 ? 0 : x > 9.05 && z < -0.85 ? 1 : z > 9.5 || x > 13.6 ? 2 : 3);
  splitGeometry(bGeo, 4, region).forEach((g, i) => {
    disposables.push(g);
    const props = new THREE.Mesh(g, modelMaterial());
    props.name = 'exteriorProps' + i;
    props.castShadow = false;
    props.receiveShadow = true;
    group.add(props);
  });
  bGeo.dispose();
  shrubShadow = null;

  // ── instanced pickets ──
  const pb = new GeoBuilder(false, false);
  pb.box(0.085, 1.0, 0.028, PAL.fence, { at: [0, 0.5, 0] });
  pb.cone(0.062, 0.12, 4, PAL.fence, { at: [0, 1.06, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.33] });
  const picketGeo = pb.build();
  const pickMesh = new THREE.InstancedMesh(picketGeo, sceneryMaterial(), pickets.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const v = new THREE.Vector3();
  pickets.forEach((p, i) => {
    q.setFromEuler(e.set(0, p.yaw + Math.PI / 2, 0));
    m4.compose(v.set(p.x, 0, p.z), q, one);
    pickMesh.setMatrixAt(i, m4);
  });
  pickMesh.castShadow = true;
  pickMesh.receiveShadow = true;
  pickMesh.name = 'pickets';
  group.add(pickMesh);
  disposables.push(picketGeo);

  // ── grass tufts ──
  const tb = new GeoBuilder(false, false);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI;
    tb.add(new THREE.ConeGeometry(0.05, 0.22 + k * 0.03, 3, 1, true), k % 2 ? PAL.grassB : shadeHex(PAL.grassA, 1.05), { at: [Math.cos(a) * 0.04, 0.1, Math.sin(a) * 0.04], rot: [0, a, (k - 1) * 0.3], scale: [1, 1, 0.25] });
  }
  const tuftGeo = tb.build();
  const nTuft = hi ? 1100 : 400;
  const tufts = new THREE.InstancedMesh(tuftGeo, sceneryMaterial(), nTuft);
  const tc = new THREE.Color();
  let placed = 0;
  for (let i = 0; placed < nTuft && i < nTuft * 8; i++) {
    const x = -22 + hash01(i, 1) * 46;
    const z = -14 + hash01(i, 2) * 25;
    if (isPaved(x, z)) continue;
    const s = 0.7 + hash01(i, 3) * 0.7;
    q.setFromEuler(e.set(0, hash01(i, 4) * Math.PI * 2, 0));
    m4.compose(v.set(x, -0.02, z), q, one.set(s, s * (0.8 + hash01(i, 5) * 0.5), s));
    tufts.setMatrixAt(placed, m4);
    tc.setRGB(0.85 + hash01(i, 6) * 0.3, 0.9 + hash01(i, 7) * 0.2, 0.85 + hash01(i, 8) * 0.2);
    tufts.setColorAt(placed, tc);
    placed++;
  }
  one.set(1, 1, 1);
  tufts.count = placed;
  tufts.receiveShadow = true;
  tufts.name = 'grassTufts';
  group.add(tufts);
  disposables.push(tuftGeo);

  // ── fallen leaves (yard + a few in front) ──
  const lb = new GeoBuilder(false, false);
  lb.add(
    (() => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.07, 0, 0, 0.07, 0.045, 0, 0, 0, 0, -0.07, -0.045, 0, 0, 0, 0, 0.07], 3));
      return g;
    })(),
    0xffffff,
  );
  const leafGeo = lb.build();
  const nLeaf = hi ? 220 : 80;
  const leaves = new THREE.InstancedMesh(leafGeo, sceneryMaterial(), nLeaf);
  const leafCols = [PAL.leafAutumn, 0xe8743d, 0xd4582a, 0xf2c14b, 0xc9652a];
  for (let i = 0; i < nLeaf; i++) {
    const nearTree = i % 3 !== 0;
    const x = nearTree ? fx(OUT.yardTree) + (hash01(i, 11) - 0.5) * 7 : 9.5 + hash01(i, 12) * 10.5;
    const z = nearTree ? fz(OUT.yardTree) + (hash01(i, 13) - 0.3) * 6 : -12.5 + hash01(i, 14) * 11.4;
    const cx2 = Math.min(YARD.x1 - 0.2, Math.max(YARD.x0 + 0.3, x));
    const cz2 = Math.min(YARD.z1 - 0.2, Math.max(YARD.z0 + 0.3, z));
    q.setFromEuler(e.set((hash01(i, 15) - 0.5) * 0.3, hash01(i, 16) * Math.PI * 2, (hash01(i, 17) - 0.5) * 0.3));
    const s = 0.9 + hash01(i, 18) * 0.8;
    m4.compose(v.set(cx2, 0.01 + hash01(i, 19) * 0.01, cz2), q, one.set(s, s, s));
    leaves.setMatrixAt(i, m4);
    tc.setHex(leafCols[i % leafCols.length]!);
    leaves.setColorAt(i, tc);
  }
  one.set(1, 1, 1);
  leaves.receiveShadow = true;
  leaves.name = 'leaves';
  group.add(leaves);
  disposables.push(leafGeo);

  // ── neighbours (bodies + glowing windows) ──
  const NB = new GeoBuilder(false, false);
  const win = { pos: [] as number[], nor: [] as number[], col: [] as number[], rank: [] as number[] };
  const houses: [number, number, number, number, 1 | -1, number, number][] = [
    [-30, 0.5, 9.5, 8, 1, PAL.neighborA, PAL.neighborRoofA],
    [32, -0.5, 10, 8.5, 1, PAL.neighborB, PAL.neighborRoofB],
    [-48, 1, 9, 8, 1, PAL.neighborC, PAL.neighborRoofB],
    [50, 0.5, 9, 8, 1, PAL.neighborA, PAL.neighborRoofA],
    [-11, -25, 11, 8, -1, PAL.neighborC, PAL.neighborRoofA],
    [7, -26, 10, 8.5, -1, PAL.neighborB, PAL.neighborRoofB],
    [25, -24.5, 10, 8, -1, PAL.neighborA, PAL.roofSlate],
    [-16, 31, 10, 8, -1, PAL.neighborB, PAL.neighborRoofA],
    [3, 31.5, 11, 8.5, -1, PAL.neighborA, PAL.roofSlate],
    [21, 31, 10, 8, -1, PAL.neighborC, PAL.neighborRoofB],
  ];
  const nbCount = hi ? houses.length : 7;
  houses.slice(0, nbCount).forEach(([x, z, w, d, f, wall, roof], i) => neighbour(NB, win, x, z, w, d, f, wall, roof, i + 3));
  const nbGeo = NB.build();
  const nbMesh = new THREE.Mesh(nbGeo, sceneryMaterial());
  nbMesh.receiveShadow = true;
  nbMesh.name = 'neighbours';
  group.add(nbMesh);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(win.pos, 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(win.nor, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(win.col, 3));
  wg.setAttribute('aRank', new THREE.Float32BufferAttribute(win.rank, 1));
  wg.computeBoundingSphere();
  const wm = windowMaterial();
  const winMesh = new THREE.Mesh(wg, wm.material);
  winMesh.name = 'neighbourWindows';
  group.add(winMesh);
  disposables.push(nbGeo, wg, wm.material);

  // ── distant trees (instanced) ──
  const db = new GeoBuilder(false, false);
  db.cyl(0.12, 0.18, 1.4, 6, 0x7a5c48, { at: [0, 0.7, 0] });
  db.ball(1.3, 0, 0xffffff, { at: [0, 2.3, 0], scale: [1, 1.1, 1], shade: 0.06, seed: 3 });
  db.ball(0.95, 0, 0xf0f0f0, { at: [0.3, 3.3, 0.1], shade: 0.06, seed: 4 });
  const dtGeo = db.build();
  const nD = hi ? 90 : 40;
  const dtrees = new THREE.InstancedMesh(dtGeo, sceneryMaterial(), nD);
  const dCols = [PAL.distantTree, PAL.treeLeafDark, PAL.treeLeaf, 0xd99a45, 0x6fa86a];
  let nd = 0;
  for (let i = 0; nd < nD && i < nD * 6; i++) {
    const a = hash01(i, 31) * Math.PI * 2;
    const r = 32 + hash01(i, 32) * 45;
    const x = Math.cos(a) * r * 1.2;
    const z = Math.sin(a) * r;
    if (z > 8 && z < 26) continue; // keep the street corridor clear
    if (houses.some(([hx, hz, hw, hd]) => Math.abs(x - hx) < hw / 2 + 2.5 && Math.abs(z - hz) < hd / 2 + 2.5)) continue;
    const s = 1.1 + hash01(i, 33) * 1.2;
    q.setFromEuler(e.set(0, hash01(i, 34) * 6.28, 0));
    m4.compose(v.set(x, 0, z), q, one.set(s, s * (0.9 + hash01(i, 35) * 0.5), s));
    dtrees.setMatrixAt(nd, m4);
    tc.setHex(dCols[Math.floor(hash01(i, 36) * dCols.length)]!);
    dtrees.setColorAt(nd, tc);
    nd++;
  }
  dtrees.count = nd;
  dtrees.name = 'distantTrees';
  group.add(dtrees);
  disposables.push(dtGeo);

  return {
    group,
    setWindows(frac: number) {
      wm.uniforms.uLit.value = frac;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      pickMesh.dispose();
      tufts.dispose();
      leaves.dispose();
      dtrees.dispose();
      group.removeFromParent();
    },
  };
}
