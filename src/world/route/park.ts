// Maple Grove Park (left side): a low hedge with an entrance, a winding path, a duck pond (the geese live
// here), benches, a small playground (slide, swings, climbing dome) and big shady trees.
import { PAL } from '../../render/palette';
import { hash01, shadeHex } from '../../render/models/builder';
import { type Chunks } from './chunks';
import { PARK, XS } from './layout';
import { LEAF_SETS, bench, hedge, pineTree, roundTree, shrub } from './shapes';

export const PARK_SIGN = { s: PARK.s0 + 22, x: -(XS.walk1 + 1.2) } as const;
export const POND = { s: PARK.s0 + 58, x: -22, rx: 7.5, rs: 11 } as const;

export function buildPark(ch: Chunks, seed: number): void {
  const s0 = PARK.s0;
  const s1 = PARK.s1;
  const hx = -(XS.walk1 + 0.5);
  // low hedge along the sidewalk with two gaps (entrances)
  const gates = [s0 + 22, s0 + 70];
  let hs = s0 + 1;
  for (const g of [...gates, s1 + 2.5]) {
    const he = g - 2.4;
    if (he > hs + 1) hedge(ch.frame((hs + he) / 2, hx, Math.PI / 2), 0, 0, he - hs, 0.75, 0.7, seed + Math.round(hs));
    hs = g + 2.4;
  }
  // entrance posts + the sign board (text face comes from the sign atlas)
  {
    const f = ch.frame(PARK_SIGN.s, PARK_SIGN.x, 0);
    for (const ds of [-1.6, 1.6]) f.box(0.28, 1.6, 0.28, PAL.brick, 0, 0.8, -ds);
    f.box(0.22, 0.9, 3.4, PAL.woodDark, 0, 1.45, 0);
  }
  // paths (flat pavers)
  const path = (a: [number, number], b: [number, number]) => {
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const s = a[0] + (b[0] - a[0]) * t;
      const x = a[1] + (b[1] - a[1]) * t;
      ch.flatAt(s).cyl(0.95, 0.95, 0.04, 7, shadeHex(PAL.paver, 0.97 + hash01(seed, i, Math.round(s)) * 0.06), { at: [x, 0.0, -s] });
    }
  };
  path([s0 + 22, hx - 0.5], [s0 + 34, -16]);
  path([s0 + 34, -16], [s0 + 50, -13.5]);
  path([s0 + 50, -13.5], [s0 + 70, hx - 0.5]);
  path([s0 + 34, -16], [s0 + 30, -30]);
  // the pond (flat water + a sandy rim + reeds + a lily pad)
  {
    const b = ch.flatAt(POND.s);
    b.cyl(1, 1, 0.05, 28, shadeHex(PAL.paver, 1.02), { at: [POND.x, -0.005, -POND.s], scale: [POND.rx + 0.7, 1, POND.rs + 0.7] });
    b.cyl(1, 1, 0.05, 28, PAL.pond, { at: [POND.x, 0.012, -POND.s], scale: [POND.rx, 1, POND.rs] });
    b.cyl(1, 1, 0.05, 24, PAL.pondDeep, { at: [POND.x - 0.6, 0.016, -POND.s + 0.8], scale: [POND.rx * 0.55, 1, POND.rs * 0.55] });
    const f = ch.frame(POND.s, POND.x, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      if (Math.cos(a) > 0.6) continue;
      const rx = Math.cos(a) * (POND.rx + 0.2);
      const rz = Math.sin(a) * (POND.rs + 0.2);
      for (let k = 0; k < 3; k++) f.cyl(0.025, 0.03, 0.9 + k * 0.2, 3, 0x6aa84f, rx + k * 0.12, 0.45 + k * 0.1, rz, { ink: false });
      f.cyl(0.05, 0.05, 0.22, 6, 0x8a5d3f, rx + 0.12, 1.1, rz, { ink: false });
    }
    for (const [x, z] of [
      [-2, 3],
      [1.5, -4],
      [3, 2],
    ] as const)
      f.cyl(0.55, 0.55, 0.04, 10, 0x6fbf6a, x, 0.05, z, { ink: false });
  }
  // benches facing the path / pond
  bench(ch.frame(s0 + 40, -11.8, -Math.PI / 2), 0, 0);
  bench(ch.frame(s0 + 58, -13.2, -Math.PI / 2), 0, 0);
  bench(ch.frame(s0 + 80, -24, Math.PI), 0, 0);
  // playground: slide, swings, climbing dome on a rubber mat
  {
    const ps = s0 + 84;
    const px = -17;
    ch.flatAt(ps).box(12, 0.05, 9, 0xe07a5f, { at: [px, 0.0, -ps] });
    const f = ch.frame(ps, px, Math.PI / 2);
    // slide tower
    f.box(1.6, 0.12, 1.6, PAL.playBlue, -2.8, 1.5, 0);
    for (const sx of [-0.7, 0.7]) for (const sz of [-0.7, 0.7]) f.cyl(0.07, 0.07, 2.4, 6, PAL.playYellow, -2.8 + sx, 1.2, sz);
    f.gable(1.9, 0.8, 1.9, PAL.playRed, -2.8, 2.9, 0);
    f.box(0.9, 0.08, 3.0, PAL.playYellow, -2.8, 0.85, 2.2, { rot: [0.5, 0, 0] });
    for (let i = 0; i < 5; i++) f.box(0.8, 0.06, 0.2, PAL.playRed, -2.8, 0.25 + i * 0.28, -1.1 - i * 0.12);
    // swings
    for (const sx of [-1, 1]) for (const d of [-1, 1]) f.cyl(0.06, 0.07, 2.5, 6, PAL.playRed, 1.6 + sx * 1.6, 1.15, d * 0.5, { rot: [d * 0.35, 0, 0] });
    f.cyl(0.07, 0.07, 3.4, 6, PAL.playRed, 1.6, 2.3, 0, { rot: [0, 0, Math.PI / 2] });
    for (const x of [0.9, 2.3]) {
      for (const dx of [-0.2, 0.2]) f.cyl(0.012, 0.012, 1.7, 4, 0x8a8f99, x + dx, 1.4, 0, { ink: false });
      f.rbox(0.5, 0.05, 0.22, 0.02, x < 1.5 ? PAL.playBlue : PAL.playYellow, x, 0.55, 0);
    }
    // climbing dome
    f.sphere(1.3, 10, 5, PAL.playYellow, 3.2, 0, -3.0, { scale: [1, 0.9, 1] });
  }
  // big shady trees + flower beds
  const spots: [number, number][] = [
    [s0 + 8, -14],
    [s0 + 14, -26],
    [s0 + 30, -34],
    [s0 + 46, -30],
    [s0 + 66, -12],
    [s0 + 74, -34],
    [s0 + 94, -11.5],
    [s0 + 98, -27],
    [s0 + 88, -36],
  ];
  spots.forEach(([s, x], i) => {
    const f = ch.frame(s, x, 0);
    if (i % 4 === 3) {
      pineTree(f, 0, 0, 7, 1.8, seed + i);
      ch.proxyTree(s, x, 5.6, 1.5);
    } else {
      const h = 6.4 + hash01(seed, i) * 1.5;
      const r = 2.2 + hash01(seed, i, 1) * 0.5;
      roundTree(f, 0, 0, h, r, seed + 70 + i, LEAF_SETS[(i + 2) % LEAF_SETS.length]!);
      ch.proxyTree(s, x, h, r);
    }
  });
  for (const [s, x] of [
    [s0 + 18, -12],
    [s0 + 27, -12],
    [s0 + 62, -11.5],
  ] as const) {
    const f = ch.frame(s, x, 0);
    f.cyl(1.1, 1.2, 0.2, 12, PAL.mulch, 0, 0.1, 0);
    shrub(f, 0, 0, 0.55, seed + s, PAL.hedge, 5);
  }
}
