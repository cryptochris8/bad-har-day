// Maple Grove Elementary (right side, fictional): a friendly two-storey brick school with a columned entrance,
// a bell cupola with a clock, one-storey wings, windows with white trim, flower beds, the flagpole (the flag
// itself is animated, see route.ts), the monument sign, a bike rack, a parked school bus, and the drop-off
// bay's cones + DROP-OFF sign. Text faces come from the sign atlas (signs.ts).
import { PAL } from '../../render/palette';
import { shadeHex } from '../../render/models/builder';
import { type Chunks } from './chunks';
import { DROPOFF, SCHOOL, XS } from './layout';
import { LEAF_SETS, pineTree, roundTree, shrub, trafficCone } from './shapes';

export const SCHOOL_PARTS = {
  main: { s0: 504, s1: 538, x0: SCHOOL.front, depth: 14, h: 7.6 },
  wings: [
    { s0: 482, s1: 504, x0: SCHOOL.front + 1.5, depth: 11, h: 4.4 },
    { s0: 538, s1: 572, x0: SCHOOL.front + 1.5, depth: 11, h: 4.4 },
  ],
  portico: { s: SCHOOL.door, w: 8.4, x0: SCHOOL.front - 2.8, h: 3.7 },
  /** Name panel on the facade above the portico (s centre, y centre, width, height). */
  namePanel: { s: SCHOOL.door, y: 6.55, w: 12, h: 1.25 },
  flag: { s: 507, x: 11.6, h: 8.6 },
  monument: { s: 486.5, x: 10.9 },
  dropSign: { s: DROPOFF.s0 - 3, x: 9.3 },
  bus: { s: 566, x: XS.parkX },
  steps: { s: SCHOOL.door, x: SCHOOL.front - 3.8 },
  cupola: { s: SCHOOL.door, x: SCHOOL.front + 6 },
} as const;

const WIN = 0xa9d2ee;

/** Facade frame at (s, x) facing the road (−X). Local +x runs toward DECREASING s. */
function facade(ch: Chunks, s: number, x: number) {
  return ch.frame(s, x, -Math.PI / 2);
}

export function buildSchool(ch: Chunks, seed: number): void {
  const M = SCHOOL_PARTS.main;
  ch.proxyBox(M.s0, M.s1, M.x0 + 0.05, M.x0 + M.depth, 0, M.h + 0.6);
  for (const W of SCHOOL_PARTS.wings) ch.proxyBox(W.s0, W.s1, W.x0 + 0.05, W.x0 + W.depth, 0, W.h + 0.6);
  const brick = PAL.schoolBrick;
  const trim = PAL.schoolTrim;
  // ── main block ──
  {
    const w = M.s1 - M.s0;
    const cs = (M.s0 + M.s1) / 2;
    const f = facade(ch, cs, M.x0 + M.depth / 2);
    f.box(w + 0.3, 0.5, M.depth + 0.3, PAL.foundation, 0, 0.25, 0);
    f.box(w, M.h, M.depth, brick, 0, M.h / 2 + 0.3, 0, { shade: 0.03, seed });
    // parapet cap + a trim band between floors
    f.box(w + 0.3, 0.35, M.depth + 0.3, trim, 0, M.h + 0.47, 0);
    f.box(w + 0.1, 0.22, 0.1, trim, 0, 3.75, M.depth / 2 + 0.03, { ink: false });
    // windows: two floors, skipping the entrance and the name panel
    for (let lx = -w / 2 + 2; lx <= w / 2 - 2 + 1e-6; lx += 2.9) {
      const nearDoor = Math.abs(lx) < 4.6;
      for (const y of [1.95, 5.1]) {
        if (nearDoor && y < 3) continue;
        if (Math.abs(lx) < SCHOOL_PARTS.namePanel.w / 2 + 0.4 && y > 4) continue;
        f.box(1.8, 1.7, 0.08, trim, lx, y, M.depth / 2 + 0.02);
        f.box(1.55, 1.45, 0.06, WIN, lx, y, M.depth / 2 + 0.06, { ink: false });
        f.box(0.06, 1.45, 0.03, trim, lx, y, M.depth / 2 + 0.1, { ink: false });
        f.box(1.55, 0.06, 0.03, trim, lx, y + 0.2, M.depth / 2 + 0.1, { ink: false });
        f.box(2.0, 0.12, 0.3, trim, lx, y - 0.92, M.depth / 2 + 0.12, { ink: false });
      }
    }
    // name panel frame (the text face is a sign quad)
    const np = SCHOOL_PARTS.namePanel;
    f.box(np.w + 0.4, np.h + 0.36, 0.16, PAL.schoolDoor, 0, np.y, M.depth / 2 + 0.06);
  }
  // ── wings ──
  for (const W of SCHOOL_PARTS.wings) {
    const w = W.s1 - W.s0;
    const cs = (W.s0 + W.s1) / 2;
    const f = facade(ch, cs, W.x0 + W.depth / 2);
    f.box(w + 0.3, 0.45, W.depth + 0.3, PAL.foundation, 0, 0.22, 0);
    f.box(w, W.h, W.depth, shadeHex(brick, 1.04), 0, W.h / 2 + 0.3, 0, { shade: 0.03, seed: seed + 3 });
    f.box(w + 0.3, 0.3, W.depth + 0.3, trim, 0, W.h + 0.45, 0);
    for (let lx = -w / 2 + 2.2; lx <= w / 2 - 2; lx += 3.1) {
      f.box(2.3, 1.7, 0.08, trim, lx, 2.0, W.depth / 2 + 0.02);
      f.box(2.05, 1.45, 0.06, WIN, lx, 2.0, W.depth / 2 + 0.06, { ink: false });
      f.box(0.06, 1.45, 0.03, trim, lx, 2.0, W.depth / 2 + 0.1, { ink: false });
    }
    // flower bed along the wing
    ch.flatAt(cs).box(w - 1, 0.06, 1.2, PAL.mulch, { at: [W.x0 - 0.7, 0.0, -cs] });
    for (let s = W.s0 + 1.5; s < W.s1 - 1; s += 2.6) shrub(ch.frame(s, W.x0 - 0.7, 0), 0, 0, 0.5, Math.round(s * 3), PAL.hedge, 3);
  }
  // ── entrance portico: columns, pediment, doors, steps ──
  {
    const P = SCHOOL_PARTS.portico;
    const f = facade(ch, P.s, SCHOOL.front);
    const depth = SCHOOL.front - P.x0;
    f.box(P.w + 1, 0.45, depth + 0.4, PAL.sidewalk, 0, 0.225, depth / 2 - 0.2);
    for (let i = 0; i < 3; i++) f.box(P.w - 1.4, 0.15, 0.4, shadeHex(PAL.sidewalk, 0.95 + i * 0.03), 0, 0.075 + i * 0.15, depth + 1.2 - i * 0.4);
    for (const lx of [-P.w / 2 + 0.5, -1.5, 1.5, P.w / 2 - 0.5]) {
      f.cyl(0.26, 0.28, P.h - 0.45, 12, trim, lx, 0.45 + (P.h - 0.45) / 2, depth - 0.3);
      f.box(0.7, 0.2, 0.7, trim, lx, P.h - 0.1, depth - 0.3, { ink: false });
    }
    f.box(P.w + 0.4, 0.45, depth + 0.3, trim, 0, P.h + 0.22, depth / 2 - 0.1);
    f.gable(P.w + 0.6, 1.6, depth + 0.4, PAL.schoolRoof, 0, P.h + 0.45 + 0.8, depth / 2 - 0.1);
    f.cyl(0.42, 0.42, 0.08, 16, trim, 0, P.h + 1.0, depth + 0.12, { rot: [Math.PI / 2, 0, 0] });
    f.cyl(0.3, 0.3, 0.09, 16, PAL.playYellow, 0, P.h + 1.0, depth + 0.14, { rot: [Math.PI / 2, 0, 0], ink: false });
    // double doors
    for (const sx of [-1, 1]) {
      f.rbox(1.25, 2.5, 0.14, 0.05, PAL.schoolDoor, sx * 0.66, 0.45 + 1.25, 0.06, {}, 1);
      f.box(0.8, 1.0, 0.04, WIN, sx * 0.66, 0.45 + 1.75, 0.15, { ink: false });
      f.box(0.06, 0.4, 0.06, PAL.knobBrass, sx * 0.18, 0.45 + 1.2, 0.18, { ink: false });
    }
    f.box(3.1, 0.2, 0.2, trim, 0, 0.45 + 2.62, 0.08);
  }
  // ── bell cupola with a clock (≈ 8:00) ──
  {
    const C = SCHOOL_PARTS.cupola;
    const f = facade(ch, C.s, C.x);
    const y = M.h + 0.65;
    f.box(2.8, 0.4, 2.8, trim, 0, y + 0.2, 0);
    f.box(2.2, 2.2, 2.2, trim, 0, y + 1.5, 0);
    f.box(1.2, 1.4, 2.3, 0x3a3040, 0, y + 1.6, 0, { ink: false });
    f.taper(2.7, 2.7, 0.2, 0.2, 1.8, PAL.schoolRoof, 0, y + 3.5, 0);
    f.ball(0.22, 1, PAL.goldTrim, 0, y + 4.55, 0, { smooth: true });
    f.cyl(0.62, 0.62, 0.1, 18, 0xfff8ea, 0, y + 1.55, 1.15, { rot: [Math.PI / 2, 0, 0] });
    f.box(0.06, 0.42, 0.04, 0x3a3040, 0, y + 1.72, 1.23, { ink: false });
    f.box(0.06, 0.3, 0.04, 0x3a3040, 0.1, y + 1.47, 1.23, { rot: [0, 0, 0.9], ink: false });
  }
  // ── lawn: front walk, flagpole, monument, bike rack, trees ──
  {
    const S = SCHOOL_PARTS.steps;
    const walk0 = DROPOFF.x + 3.4;
    ch.strip(S.s - 1.3, S.s + 1.3, walk0, S.x + 0.5, 0.0, 0.05, PAL.paver);
    const F = SCHOOL_PARTS.flag;
    const ff = ch.frame(F.s, F.x, 0);
    ff.cyl(0.45, 0.6, 0.35, 10, PAL.sidewalk, 0, 0.17, 0);
    ff.cyl(0.055, 0.075, F.h, 8, 0xdfe3e8, 0, F.h / 2, 0);
    ff.ball(0.13, 1, PAL.goldTrim, 0, F.h + 0.1, 0, { smooth: true });
    for (let k = 0; k < 6; k++) ff.ball(0.12, 0, [PAL.flowerPink, PAL.flowerYellow, 0xffffff][k % 3]!, Math.cos(k) * 0.75, 0.22, Math.sin(k) * 0.75, { ink: false });
    const Mo = SCHOOL_PARTS.monument;
    const mf = ch.frame(Mo.s, Mo.x, -Math.PI / 2);
    mf.box(4.4, 0.7, 0.9, PAL.brick, 0, 0.35, 0);
    mf.box(4.0, 1.25, 0.5, PAL.schoolTrim, 0, 1.3, 0);
    mf.box(4.4, 0.2, 0.7, PAL.brick, 0, 2.0, 0);
    for (let k = 0; k < 7; k++) mf.ball(0.14, 0, [PAL.flowerPink, PAL.flowerYellow, PAL.confettiD][k % 3]!, -2 + k * 0.66, 0.1, 0.75, { ink: false });
    shrub(mf, -2.6, 0.2, 0.5, seed + 5, PAL.hedge, 3);
    shrub(mf, 2.6, 0.2, 0.5, seed + 6, PAL.hedge, 3);
    // bike rack with three bikes
    const bf = ch.frame(497.5, 12.2, -Math.PI / 2);
    for (let k = 0; k < 4; k++) bf.torus(0.4, 0.035, 5, 10, 0xb9c0c8, -1.5 + k, 0.4, 0, { rot: [0, Math.PI / 2, 0] }, Math.PI);
    [PAL.bikeFrameA, PAL.bikeFrameB, PAL.bikeFrameC].forEach((c, k) => {
      const x = -1 + k;
      for (const z of [-0.55, 0.55]) bf.torus(0.3, 0.03, 4, 12, PAL.tire, x, 0.32, z, { rot: [0, Math.PI / 2, 0] });
      bf.box(0.05, 0.05, 0.95, c, x, 0.55, 0, { ink: false });
      bf.box(0.05, 0.5, 0.05, c, x, 0.55, 0.25, { rot: [0.3, 0, 0], ink: false });
      bf.box(0.12, 0.05, 0.22, 0x3a3040, x, 0.82, 0.3, { ink: false });
      bf.box(0.4, 0.04, 0.04, 0x3a3040, x, 0.9, -0.45, { ink: false });
    });
    roundTree(ch.frame(494, 12.5, 0), 0, 0, 6.2, 2.0, seed + 91, LEAF_SETS[2]!);
    roundTree(ch.frame(548, 12.8, 0), 0, 0, 6.6, 2.1, seed + 92, LEAF_SETS[0]!);
    pineTree(ch.frame(578, 14, 0), 0, 0, 7.5, 1.9, seed + 93);
    roundTree(ch.frame(586, 11, 0), 0, 0, 5.8, 1.9, seed + 94, LEAF_SETS[3]!);
  }
  // ── drop-off bay: cones + the DROP-OFF sign post ──
  for (let s = DROPOFF.s0 + 4; s <= DROPOFF.s1 - 1; s += 6) trafficCone(ch.frame(s, 4.55, 0), 0, 0);
  {
    const D = SCHOOL_PARTS.dropSign;
    const f = ch.frame(D.s, D.x, 0);
    f.cyl(0.06, 0.06, 3.0, 6, PAL.poleGrey, 0, 1.5, 0);
    f.box(1.9, 0.98, 0.08, 0x2f8f86, 0, 2.55, 0.02);
  }
  // ── school bus (parked past the bay) ──
  {
    const B = SCHOOL_PARTS.bus;
    const f = ch.frame(B.s, B.x, Math.PI);
    const L = 10.5;
    f.taper(2.4, L, 2.3, L - 0.2, 2.4, PAL.busYellow, 0, 1.75, -0.4);
    f.taper(2.3, 1.8, 2.1, 1.5, 1.2, PAL.busYellow, 0, 1.05, L / 2 + 0.3, { sz: -0.12 });
    f.box(2.44, 0.12, L, 0x2b2733, 0, 1.3, -0.4, { ink: false });
    for (let k = 0; k < 7; k++) for (const sx of [-1, 1]) f.box(0.04, 0.8, 1.0, WIN, sx * 1.2, 2.3, -L / 2 + 0.6 + k * 1.35, { ink: false });
    f.box(2.1, 0.9, 0.05, WIN, 0, 2.35, L / 2 - 0.62, { ink: false });
    for (const z of [-L * 0.32, L * 0.38]) for (const sx of [-1, 1]) f.cyl(0.48, 0.48, 0.3, 12, PAL.tire, sx * 1.1, 0.48, z, { rot: [0, 0, Math.PI / 2] });
    f.box(0.5, 0.5, 0.05, PAL.stopRed, -1.28, 1.7, L * 0.3, { ink: false });
    for (const sx of [-0.7, 0.7]) f.ball(0.14, 0, 0xff4a3d, sx, 3.02, L / 2 - 0.7, { ink: false });
  }
}
