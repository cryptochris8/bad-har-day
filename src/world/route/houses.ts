// The neighbours: low-detail, colourful, seeded houses facing the street (gable / front-gable / hip roofs,
// porches, garages, shutters, flower boxes) and their front yards (picket fences, hedges, yard trees,
// mailboxes, shrubs). Everything merges into the chunk's inked props mesh.
import { PAL } from '../../render/palette';
import { hash01, shadeHex } from '../../render/models/builder';
import { Frame } from '../kit';
import { faceRoadYaw, type Chunks } from './chunks';
import { T_JUNCTION, XS, nearCrosswalk, type Lot } from './layout';
import { LEAF_SETS, hedge, mailbox, pineTree, roundTree, shrub } from './shapes';
import { doorS } from './street';

const GLASS = 0xa9d2ee;

function windowAt(f: Frame, lx: number, ly: number, lz: number, w: number, h: number, shutter: number | null): void {
  f.box(w + 0.18, h + 0.18, 0.06, PAL.trim, lx, ly, lz);
  f.box(w, h, 0.05, GLASS, lx, ly, lz + 0.03, { ink: false });
  if (shutter !== null) for (const sx of [-1, 1]) f.box(0.26, h + 0.1, 0.05, shutter, lx + sx * (w / 2 + 0.24), ly, lz + 0.01, { ink: false });
}

/** Picket fence panels are atlas quads (cheap, crisp); `fenceQuads` is null without a DOM. */
export type FenceSink = ((cx: number, cz: number, len: number, yaw: number) => void) | null;

/** One house; `f` sits at the house centre, facing the road (+Z local). */
export function house(f: Frame, l: Lot): void {
  const w = l.hw;
  const d = l.hd;
  const H = l.storeys === 2 ? 5.3 : 2.8;
  const base = 0.35;
  const top = base + H;
  const seed = l.seed;
  const shutter = hash01(seed, 7) > 0.45 ? l.accent : null;
  f.box(w + 0.25, base, d + 0.25, PAL.foundation, 0, base / 2, 0);
  f.box(w, H, d, l.wall, 0, base + H / 2, 0, { shade: 0.025, seed });
  f.box(w + 0.12, 0.16, d + 0.12, PAL.trim, 0, top - 0.08, 0, { ink: false });
  // roof
  const rh = l.roofStyle === 'gableFront' ? 2.4 : 2.0;
  if (l.roofStyle === 'gableSide') f.gable(d + 1.1, rh, w + 0.9, l.roof, 0, top + rh / 2, 0, { rot: [0, Math.PI / 2, 0] });
  else if (l.roofStyle === 'gableFront') {
    f.gable(w + 1.0, rh, d + 1.0, l.roof, 0, top + rh / 2, 0);
    // gable-end trim + a round attic window
    f.cyl(0.36, 0.36, 0.06, 12, PAL.trim, 0, top + rh * 0.36, d / 2 + 0.05, { rot: [Math.PI / 2, 0, 0] });
    f.cyl(0.27, 0.27, 0.07, 12, GLASS, 0, top + rh * 0.36, d / 2 + 0.07, { rot: [Math.PI / 2, 0, 0], ink: false });
  } else f.taper(w + 1.0, d + 1.0, Math.max(0.4, w - d), 0.3, rh * 0.9, l.roof, 0, top + (rh * 0.9) / 2, 0);
  if (hash01(seed, 3) > 0.35) f.box(0.62, 1.7, 0.62, PAL.brick, w * 0.3 * (hash01(seed, 4) > 0.5 ? 1 : -1), top + 1.0, -d * 0.18);
  // front door + step + lamp
  const dx = -w * 0.18;
  f.box(1.05, 2.12, 0.12, l.accent, dx, base + 1.06, d / 2 + 0.03);
  f.box(0.9, 0.12, 0.02, shadeHex(l.accent, 0.8), dx, base + 1.5, d / 2 + 0.1, { ink: false });
  f.box(1.5, 0.2, 0.7, PAL.sidewalk, dx, 0.1, d / 2 + 0.4);
  // front windows (one or two rows)
  const xs = [dx - 1.8, dx + 1.9, dx + 3.6].filter((x) => Math.abs(x) < w / 2 - 0.8);
  for (const x of xs) windowAt(f, x, base + 1.45, d / 2 + 0.02, 1.15, 1.15, shutter);
  if (l.storeys === 2) for (const x of [dx, ...xs]) windowAt(f, x, base + 4.0, d / 2 + 0.02, 1.0, 1.0, shutter);
  // flower box under the first window
  if (l.flowers && xs.length > 0) {
    const x = xs[0]!;
    f.box(1.3, 0.2, 0.26, PAL.woodWarm, x, base + 0.75, d / 2 + 0.16);
    for (let k = 0; k < 4; k++) f.box(0.2, 0.18, 0.2, [PAL.flowerPink, PAL.flowerYellow, 0xffffff, l.accent][k]!, x - 0.45 + k * 0.3, base + 0.92, d / 2 + 0.18, { ink: false, rot: [0, k, 0] });
  }
  // porch
  if (l.porch) {
    const pw = Math.min(w * 0.55, 3.6);
    const pz = d / 2 + 0.9;
    f.box(pw, 0.28, 1.8, PAL.woodWarm, dx, 0.14, pz);
    for (const sx of [-1, 1]) f.box(0.14, 2.5, 0.14, PAL.trim, dx + sx * (pw / 2 - 0.15), 0.28 + 1.25, pz + 0.75);
    f.box(pw + 0.3, 0.14, 2.0, l.roof, dx, 2.85, pz - 0.05, { rot: [0.1, 0, 0] });
  }
  // garage on the driveway side
  if (l.garage && l.drive !== null) {
    const off = l.drive - l.hs;
    const gx = l.side > 0 ? -off : off;
    const gw = 3.6;
    const gd = d * 0.85;
    const gz = d / 2 - gd / 2 + 0.2;
    f.box(gw, 2.7, gd, shadeHex(l.wall, 0.96), gx, base + 1.35 - 0.2, gz, { shade: 0.02, seed: seed + 5 });
    f.gable(gd + 0.7, 1.2, gw + 0.5, l.roof, gx, base + 2.5 + 0.6 - 0.2, gz, { rot: [0, Math.PI / 2, 0] });
    f.box(2.9, 2.1, 0.06, PAL.trim, gx, base + 1.05 - 0.2, gz + gd / 2 + 0.03);
    for (let k = 0; k < 3; k++) f.box(2.8, 0.04, 0.02, shadeHex(PAL.trim, 0.86), gx, base + 0.45 + k * 0.6 - 0.2, gz + gd / 2 + 0.07, { ink: false });
  }
  // shrubs by the corners
  shrub(f, -w / 2 + 0.5, d / 2 + 0.6, 0.45, seed + 11, PAL.hedge, l.flowers ? 2 : 0);
  if (!l.porch || w > 9.5) shrub(f, w / 2 - 0.5, d / 2 + 0.6, 0.4, seed + 12, shadeHex(PAL.hedge, 1.06), 0);
}

/** A lot: the house + its front yard (fence / hedge, yard trees, mailbox). */
export function buildLot(ch: Chunks, l: Lot, fence: FenceSink): void {
  const side = l.side;
  const cx = side * (l.front + l.hd / 2);
  house(ch.frame(l.hs, cx, faceRoadYaw(side)), l);
  const H = (l.storeys === 2 ? 5.3 : 2.8) + 0.35;
  const x0 = side > 0 ? l.front : -(l.front + l.hd);
  ch.proxyBox(l.hs - l.hw / 2, l.hs + l.hw / 2, x0 + 0.05, x0 + l.hd - 0.05, 0, H + 1.0);
  const door = doorS(l);
  // fence / hedge along the sidewalk, with gaps for the front walk and the driveway
  const fx = side * (XS.walk1 + 0.35);
  const gaps: [number, number][] = [[door - 0.9, door + 0.9]];
  if (l.drive !== null) gaps.push([l.drive - 2.0, l.drive + 2.0]);
  const runs: [number, number][] = [];
  let s = l.s0 + 0.6;
  for (const [a, b] of gaps.sort((p, q) => p[0] - q[0])) {
    if (a > s + 0.5) runs.push([s, a]);
    s = Math.max(s, b);
  }
  if (l.s1 - 0.6 > s + 0.5) runs.push([s, l.s1 - 0.6]);
  const yaw = faceRoadYaw(side);
  for (const [a, b] of runs) {
    if (l.fence === 'hedge') {
      hedge(ch.frame((a + b) / 2, fx, yaw), 0, 0, b - a, 0.95, 0.8, l.seed + Math.round(a));
    } else if (l.fence === 'picket') {
      const len = b - a;
      const f = ch.frame((a + b) / 2, fx, yaw);
      const panels = Math.max(1, Math.round(len / 2.4));
      for (let i = 0; i <= panels; i++) f.box(0.12, 1.05, 0.12, PAL.fence, -len / 2 + (len * i) / panels, 0.52, -0.04);
      if (fence) {
        for (let i = 0; i < panels; i++) {
          const ps = a + ((i + 0.5) * len) / panels;
          fence(fx, -ps, len / panels, yaw);
        }
      } else for (const y of [0.32, 0.72]) f.box(len, 0.07, 0.04, PAL.fence, 0, y, -0.03, { ink: false });
    }
  }
  // yard trees
  for (let i = 0; i < l.trees; i++) {
    const ts = l.s0 + 2.5 + hash01(l.seed, 20 + i) * (l.s1 - l.s0 - 5);
    if (Math.abs(ts - door) < 2 || (l.drive !== null && Math.abs(ts - l.drive) < 2.6)) continue;
    const tx = side * (XS.walk1 + 1.8 + hash01(l.seed, 30 + i) * Math.max(0.2, l.front - XS.walk1 - 4));
    const f = ch.frame(ts, tx, 0);
    if (hash01(l.seed, 40 + i) > 0.7) {
      const h = 5 + hash01(l.seed, 41 + i) * 2;
      pineTree(f, 0, 0, h, 1.3, l.seed + i);
      ch.proxyTree(ts, tx, h * 0.8, 1.1);
    } else {
      const h = 4.6 + hash01(l.seed, 42 + i) * 1.6;
      const r = 1.5 + hash01(l.seed, 43 + i) * 0.5;
      roundTree(f, 0, 0, h, r, l.seed + i, LEAF_SETS[Math.floor(hash01(l.seed, 44 + i) * LEAF_SETS.length)]!);
      ch.proxyTree(ts, tx, h, r);
    }
  }
  // mailbox at the curb end of the front walk (or the driveway)
  if (l.mailbox) {
    const ms = l.drive !== null ? l.drive + (l.drive > l.hs ? 2.3 : -2.3) : door + 1.3;
    if (!nearCrosswalk(ms, 2) && ms < T_JUNCTION - 8) {
      const f = ch.frame(ms, side * 5.95, faceRoadYaw(side));
      mailbox(f, 0, 0, [PAL.mailboxA, PAL.mailboxB, PAL.mailboxC, l.accent][Math.floor(hash01(l.seed, 50) * 4)]!, hash01(l.seed, 51) > 0.6);
    }
  }
}

/** Houses across the end of the street (past the T-junction), facing the approaching car. */
export function buildEndRow(ch: Chunks, lots: readonly Lot[], seed: number): void {
  const s = T_JUNCTION + 17;
  let k = 0;
  for (let x = -60; x <= 60; x += 20, k++) {
    if (Math.abs(x) < 3) continue;
    const src = lots[(k * 7 + seed) % Math.max(1, lots.length)];
    if (!src) continue;
    const l: Lot = { ...src, side: 1, hw: 10, hd: 8, drive: null, garage: false, seed: src.seed + k };
    house(new Frame(ch.farInk, x, 0, -(s + 4), 0), l);
    const f = new Frame(ch.farInk, x + 6, 0, -(s - 4), 0);
    roundTree(f, 0, 0, 5.2, 1.7, seed + k, LEAF_SETS[k % LEAF_SETS.length]!);
  }
  // the view straight down the road ends at a friendly house with a big tree
  const f = new Frame(ch.farInk, 0, 0, -(s - 1.5), 0);
  hedge(f, 0, -2.5, 14, 0.95, 0.8, seed);
}
