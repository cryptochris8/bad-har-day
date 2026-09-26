// Small reusable neighbourhood shapes for the route (inked toy style, tri-budgeted — the whole street is on
// screen at once): maple + pine trees, shrubs, low-detail parked cars, lamp posts, mailboxes, hydrants,
// benches, traffic cones, trimmed hedges.
import { PAL } from '../../render/palette';
import { hash01, shadeHex } from '../../render/models/builder';
import type { Frame } from '../kit';

export const LEAF_SETS: readonly [number, number][] = [
  [PAL.treeLeaf, PAL.treeLeafDark],
  [0x8fcf6a, 0x62b05a],
  [PAL.leafAutumn, 0xd4832a],
  [PAL.leafGold, 0xe0a83a],
  [0xf08a5a, 0xd96a45],
];

/** Round cartoon maple: trunk + one big smooth crown + two faceted puffs (~290 tris with ink). */
export function roundTree(f: Frame, lx: number, lz: number, h: number, r: number, seed: number, leaves: readonly [number, number]): void {
  const [leaf, dark] = leaves;
  f.cyl(r * 0.1, r * 0.15, h * 0.55, 5, PAL.treeTrunk, lx, h * 0.275, lz);
  f.ball(r, 1, leaf, lx, h * 0.72, lz, { smooth: true, jitter: r * 0.05, seed, scale: [1, 0.92, 1] });
  const a = hash01(seed, 1) * Math.PI * 2;
  f.ball(r * 0.62, 0, dark, lx + Math.cos(a) * r * 0.72, h * 0.62, lz + Math.sin(a) * r * 0.72, { smooth: true, seed: seed + 1 });
  f.ball(r * 0.55, 0, shadeHex(leaf, 1.08), lx - Math.cos(a) * r * 0.6, h * 0.82, lz - Math.sin(a) * r * 0.6, { smooth: true, seed: seed + 2 });
}

/** Stacked-cone pine (~120 tris with ink). */
export function pineTree(f: Frame, lx: number, lz: number, h: number, r: number, seed: number): void {
  f.cyl(r * 0.1, r * 0.13, h * 0.3, 5, PAL.treeTrunk, lx, h * 0.15, lz);
  const c = hash01(seed, 4) > 0.5 ? 0x3f8a5a : 0x4b9a62;
  for (let i = 0; i < 3; i++) {
    const k = 1 - i * 0.26;
    f.cone(r * k, h * 0.38, 7, shadeHex(c, 1 + i * 0.06), lx, h * (0.34 + i * 0.2), lz, { rot: [0, hash01(seed, i) * 3, 0] });
  }
}

/** Round shrub (faceted, ~40 tris + flowers). */
export function shrub(f: Frame, lx: number, lz: number, r: number, seed: number, col: number = PAL.hedge, flowers = 0): void {
  f.ball(r, 0, col, lx, r * 0.72, lz, { smooth: true, seed, scale: [1.12, 0.88, 1.05] });
  for (let i = 0; i < flowers; i++) {
    const a = hash01(seed, i) * Math.PI * 2;
    f.ball(r * 0.15, 0, [PAL.flowerPink, PAL.flowerYellow, 0xffffff][i % 3]!, lx + Math.cos(a) * r * 0.8, r * (0.85 + hash01(seed, i, 2) * 0.35), lz + Math.sin(a) * r * 0.8, { ink: false });
  }
}

/** A trimmed hedge run along local X (length `len`), with a few soft puffs on top (~24 + 40/puff tris). */
export function hedge(f: Frame, lx: number, lz: number, len: number, h: number, depth: number, seed: number): void {
  f.taper(len, depth, len - 0.2, depth - 0.25, h, PAL.hedge, lx, h / 2, lz, { shade: 0.05, seed });
  const n = Math.max(1, Math.floor(len / 3));
  for (let i = 0; i < n; i++) {
    const x = lx - len / 2 + ((i + 0.5) * len) / n;
    f.ball(depth * 0.42, 0, shadeHex(PAL.hedge, 1.06), x, h - 0.02, lz, { smooth: true, seed: seed + i, scale: [1.5, 0.55, 1] });
  }
}

/** Low-detail parked car facing local +Z (~270 tris). */
export function parkedCar(f: Frame, lx: number, lz: number, color: number, seed: number): void {
  const L = 4.2;
  const W = 1.8;
  f.taper(W, L, W - 0.08, L - 0.3, 0.62, color, lx, 0.62, lz);
  const cabinL = L * (0.48 + hash01(seed, 1) * 0.12);
  const cz = lz - L * 0.06;
  f.taper(W - 0.12, cabinL, W - 0.42, cabinL - 0.7, 0.58, shadeHex(color, 1.05), lx, 1.2, cz);
  // glass bands (un-inked)
  f.taper(W - 0.08, cabinL - 0.08, W - 0.38, cabinL - 0.74, 0.34, 0x9fc6e6, lx, 1.18, cz, { ink: false });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) f.cyl(0.33, 0.33, 0.22, 8, PAL.tire, lx + sx * (W / 2 - 0.1), 0.33, lz + sz * L * 0.32, { rot: [0, 0, Math.PI / 2], ink: false });
  f.box(W + 0.04, 0.14, 0.14, PAL.carTrim, lx, 0.4, lz + L / 2, { ink: false });
  f.box(W + 0.04, 0.14, 0.14, PAL.carTrim, lx, 0.4, lz - L / 2, { ink: false });
  for (const sx of [-1, 1]) f.box(0.3, 0.13, 0.04, 0xe05a5a, lx + sx * (W / 2 - 0.25), 0.8, lz - L / 2 + 0.14, { ink: false });
}

/** Friendly street lamp (post + arm + lantern). */
export function lampPost(f: Frame, lx: number, lz: number, toRoad: number): void {
  f.cyl(0.07, 0.09, 4.6, 6, PAL.signalBox, lx, 2.3, lz);
  f.cyl(0.14, 0.16, 0.3, 6, PAL.signalBox, lx, 0.15, lz, { ink: false });
  f.box(0.07, 0.07, 1.2, PAL.signalBox, lx, 4.55, lz + toRoad * 0.55, { ink: false });
  f.cyl(0.2, 0.28, 0.32, 8, PAL.signalBox, lx, 4.42, lz + toRoad * 1.1);
  f.cyl(0.18, 0.18, 0.08, 8, 0xfff4d0, lx, 4.24, lz + toRoad * 1.1, { ink: false });
}

export function mailbox(f: Frame, lx: number, lz: number, color: number, flagUp: boolean): void {
  f.box(0.1, 1.0, 0.1, PAL.woodWarm, lx, 0.5, lz);
  f.box(0.3, 0.2, 0.52, color, lx, 1.08, lz);
  f.cyl(0.15, 0.15, 0.52, 8, color, lx, 1.18, lz, { rot: [Math.PI / 2, 0, 0] });
  f.box(0.03, flagUp ? 0.24 : 0.06, 0.06, 0xe5483f, lx + 0.17, flagUp ? 1.28 : 1.12, lz - 0.12, { ink: false });
}

export function hydrant(f: Frame, lx: number, lz: number): void {
  f.cyl(0.14, 0.17, 0.55, 8, PAL.hydrant, lx, 0.28, lz);
  f.ball(0.15, 0, PAL.hydrant, lx, 0.58, lz, { smooth: true });
  f.cyl(0.06, 0.06, 0.42, 6, shadeHex(PAL.hydrant, 0.85), lx, 0.36, lz, { rot: [0, 0, Math.PI / 2], ink: false });
}

export function bench(f: Frame, lx: number, lz: number): void {
  f.box(1.6, 0.08, 0.42, PAL.benchWood, lx, 0.46, lz);
  f.box(1.6, 0.36, 0.07, PAL.benchWood, lx, 0.78, lz - 0.2, { rot: [-0.12, 0, 0] });
  for (const sx of [-0.65, 0.65]) f.box(0.07, 0.46, 0.4, PAL.signalBox, lx + sx, 0.23, lz, { ink: false });
}

export function trafficCone(f: Frame, lx: number, lz: number): void {
  f.box(0.42, 0.05, 0.42, PAL.coneOrange, lx, 0.025, lz);
  f.cone(0.17, 0.62, 8, PAL.coneOrange, lx, 0.36, lz);
  f.cyl(0.118, 0.14, 0.1, 8, PAL.coneStripe, lx, 0.34, lz, { ink: false });
}
