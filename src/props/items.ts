// ─────────────────────────────────────────────────────────────────────────────
// Act IV "missing items", tinted with the owner's colour: a left sneaker, a
// backpack (zipper + star keychain), a library book (spine label + barcode
// sticker), a reusable water bottle, a scrunchie, a permission slip, a folded
// jacket — and the lunchbox (see lunchbox.ts). Colour-keyed geometry cache.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { mixHex, shadeHex, type V3 } from '../render/models/builder';
import { inked } from '../render/models/common';
import type { ItemKind } from './types';
import {
  circlePts,
  flatDecal,
  heartPts,
  mergeLocal,
  profileRadius,
  rbox,
  slab,
  smoothPath,
  starPts,
  sweepGeometry,
  tube,
  wrapAround,
  type LocalPart,
  type P2,
} from './shapes';

type Geo = THREE.BufferGeometry;

const light = (c: number, k = 0.35) => mixHex(c, 0xffffff, k);
const dark = (c: number, k = 0.78) => shadeHex(c, k);

// ── shoe (left sneaker: toe toward −X, outer side facing the camera) ─────────
function shoe(color: number): Geo {
  const b = inked();
  const sole: P2[] = [];
  for (let i = 0; i < 16; i++) {
    const t = (i / 16) * Math.PI * 2;
    const c = Math.cos(t);
    sole.push([0.112 * c, 0.043 * Math.sin(t) * (1 - 0.14 * c)]);
  }
  slab(b, sole, 0, 0.022, PAL.sneakerWhite);
  slab(b, sole.map(([x, z]) => [x * 1.004, z * 1.03] as const), 0.009, 0.005, dark(color), { ink: false });
  // Upper: toe box + ankle blob.
  b.sphere(1, 9, 6, color, { at: [-0.048, 0.03, 0], scale: [0.064, 0.036, 0.041], smooth: true });
  b.sphere(1, 9, 6, color, { at: [0.036, 0.04, 0], scale: [0.066, 0.058, 0.042], smooth: true });
  b.sphere(1, 8, 5, PAL.sneakerWhite, { at: [-0.088, 0.026, 0], scale: [0.03, 0.026, 0.0415], smooth: true });
  // Collar (ankle opening) + dark inside.
  b.torus(0.026, 0.0085, 4, 10, dark(color), { at: [0.05, 0.094, 0], rot: [Math.PI / 2, 0, 0], scale: [1.3, 1, 1] });
  b.add(new THREE.CircleGeometry(0.03, 10), shadeHex(color, 0.4), { at: [0.05, 0.095, 0], rot: [-Math.PI / 2, 0, 0], scale: [1.2, 0.9, 1], ink: false });
  // Tongue + laces.
  b.taper(0.03, 0.028, 0.026, 0.022, 0.036, light(color, 0.25), { at: [0.016, 0.092, 0], rot: [0, 0, 0.55] });
  for (let i = 0; i < 3; i++) b.box(0.007, 0.004, 0.05, PAL.sneakerWhite, { at: [-0.028 + i * 0.019, 0.063 + i * 0.01, 0], rot: [0, 0, 0.35 + i * 0.1] });
  // Star patch on the outer side + heel tab.
  b.extrude(starPts(0.017, 0.0075), 0.003, PAL.starPrint, { at: [0.03, 0.045, 0.0405], ink: false });
  b.box(0.012, 0.03, 0.02, dark(color), { at: [0.1, 0.07, 0], rot: [0, 0, -0.25] });
  return b.build();
}

// ── backpack ────────────────────────────────────────────────────────────────
function backpack(color: number): Geo {
  const b = inked();
  const d = dark(color);
  rbox(b, 0.28, 0.33, 0.14, 0.065, color, { at: [0, 0.165, 0] });
  rbox(b, 0.2, 0.13, 0.05, 0.028, d, { at: [0, 0.085, 0.075] });
  // Pocket zipper + pull.
  b.box(0.17, 0.005, 0.005, PAL.plasticWhite, { at: [0, 0.141, 0.098], ink: false });
  b.box(0.012, 0.022, 0.005, PAL.plasticWhite, { at: [0.064, 0.13, 0.101] });
  // Main zipper arc over the top front.
  const arc: V3[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI * (0.08 + (0.84 * i) / 9);
    arc.push([Math.cos(a) * 0.118, 0.205 + Math.sin(a) * 0.1, 0.071 - Math.sin(a) * 0.01]);
  }
  b.add(sweepGeometry(arc, 0.0035, 4, false, 0.5), PAL.plasticWhite, { smooth: true, ink: false });
  // Keychain: ring + little chain + gold star charm dangling from the main zipper pull.
  const kx = 0.085;
  const ky = 0.27;
  b.box(0.011, 0.02, 0.005, PAL.plasticWhite, { at: [kx, ky, 0.074], rot: [0, 0, 0.15] });
  b.torus(0.008, 0.0018, 3, 8, PAL.stainless, { at: [kx + 0.002, ky - 0.018, 0.077], ink: false });
  for (let i = 0; i < 3; i++) b.ball(0.0022, 0, PAL.stainless, { at: [kx + 0.004, ky - 0.03 - i * 0.006, 0.078], ink: false });
  b.extrude(starPts(0.024, 0.011), 0.007, PAL.great, { at: [kx + 0.006, ky - 0.068, 0.08], rot: [0, 0, 0.12] });
  // Heart patch on the upper front.
  b.extrude(heartPts(0.04, 16), 0.004, light(color, 0.7), { at: [-0.06, 0.225, 0.071], rot: [-0.1, -0.3, 0.1], ink: false });
  // Top grab loop + straps on the back.
  tube(b, smoothPath([[-0.03, 0.325, -0.01], [-0.02, 0.35, -0.012], [0.02, 0.35, -0.012], [0.03, 0.325, -0.01]], 7), 0.007, d, {}, 4, false, 0.6);
  for (const s of [-1, 1])
    b.add(
      sweepGeometry(
        smoothPath(
          [
            [s * 0.07, 0.29, -0.06],
            [s * 0.078, 0.22, -0.095],
            [s * 0.085, 0.12, -0.098],
            [s * 0.09, 0.04, -0.07],
          ],
          6,
        ),
        0.016,
        4,
        false,
        0.35,
      ),
      d,
      { smooth: true },
    );
  return b.build();
}

// ── library book (lying flat, spine toward the camera) ─────────────────────
function libraryBook(color: number): Geo {
  const b = inked();
  const L = 0.26;
  const D = 0.2;
  const T = 0.042;
  b.box(L - 0.012, T - 0.01, D - 0.01, PAL.paper, { at: [0, T / 2, -0.005] });
  b.box(L, 0.006, D, color, { at: [0, 0.003, 0] });
  b.box(L, 0.006, D, color, { at: [0, T - 0.003, 0] });
  rbox(b, L, T, 0.016, 0.007, dark(color), { at: [0, T / 2, D / 2 - 0.004] });
  // Page edges.
  for (const s of [-1, 1]) for (let i = 0; i < 2; i++) b.box(0.002, 0.0015, D - 0.03, shadeHex(PAL.paper, 0.85), { at: [s * (L / 2 - 0.0045), 0.016 + i * 0.01, -0.006], ink: false });
  b.box(L - 0.03, 0.0015, 0.002, shadeHex(PAL.paper, 0.85), { at: [0, 0.021, -D / 2 + 0.0045], ink: false });
  // Cover: title band + big star.
  b.box(0.15, 0.0015, 0.04, PAL.paper, { at: [-0.02, T + 0.0005, -0.035], ink: false });
  for (let i = 0; i < 2; i++) b.box(0.1 - i * 0.03, 0.0016, 0.006, dark(color, 0.6), { at: [-0.02 - i * 0.012, T + 0.0009, -0.042 + i * 0.014], ink: false });
  slab(b, starPts(0.028, 0.013), T, 0.002, PAL.great, { at: [0.07, 0, 0.03], ink: false });
  // Library barcode sticker on the cover.
  b.box(0.05, 0.0015, 0.026, PAL.paper, { at: [-0.085, T + 0.0006, 0.055], ink: false });
  for (let i = 0; i < 7; i++) b.box(i % 3 === 0 ? 0.003 : 0.0018, 0.0017, 0.016, PAL.carafeBlack, { at: [-0.103 + i * 0.006, T + 0.001, 0.055], ink: false });
  // Spine: call-number label + a round coloured dot sticker.
  const zs = D / 2 + 0.0042;
  b.box(0.04, 0.03, 0.002, PAL.paper, { at: [0.085, T / 2, zs], ink: false });
  for (let i = 0; i < 3; i++) b.box(0.026 - (i % 2) * 0.008, 0.0028, 0.0022, PAL.carafeBlack, { at: [0.083, T / 2 + 0.008 - i * 0.008, zs + 0.0005], ink: false });
  b.cyl(0.009, 0.009, 0.002, 10, PAL.great, { at: [0.045, T / 2, zs], rot: [Math.PI / 2, 0, 0], ink: false });
  return b.build();
}

// ── reusable water bottle ───────────────────────────────────────────────────
const BOTTLE: P2[] = [
  [0.001, 0],
  [0.034, 0],
  [0.038, 0.006],
  [0.038, 0.168],
  [0.034, 0.18],
  [0.027, 0.187],
];
function waterBottle(color: number): Geo {
  const b = inked();
  b.lathe(BOTTLE, 12, color, { smooth: true });
  b.add(new THREE.CylinderGeometry(0.0386, 0.0386, 0.02, 14, 1, true), dark(color), { at: [0, 0.02, 0], ink: false });
  b.lathe(
    [
      [0.001, 0.184],
      [0.03, 0.184],
      [0.031, 0.2],
      [0.026, 0.21],
      [0.001, 0.212],
    ],
    12,
    PAL.plasticWhite,
    { smooth: true },
  );
  b.taper(0.016, 0.02, 0.012, 0.016, 0.014, dark(color), { at: [0, 0.217, 0.008] });
  b.torus(0.014, 0.0045, 4, 10, PAL.plasticWhite, { at: [0, 0.226, -0.012] });
  const rAt = (y: number) => profileRadius(BOTTLE.slice(2, 4), y);
  const stickers: LocalPart[] = [
    [flatDecal(starPts(0.013, 0.006), 0.001), [-0.006, 0.12, 0], [0, 0, 0.2]],
  ];
  b.add(wrapAround(mergeLocal(stickers), rAt), PAL.starPrint, { ink: false });
  b.add(wrapAround(mergeLocal([[flatDecal(heartPts(0.02), 0.001), [0.012, 0.085, 0], [0, 0, -0.2]]]), rAt), PAL.heart, { ink: false });
  b.add(wrapAround(mergeLocal([[flatDecal(circlePts(0.008, 10), 0.001), [-0.014, 0.06, 0]]]), rAt), light(color, 0.6), { ink: false });
  return b.build();
}

// ── scrunchie ────────────────────────────────────────────────────────────────
function hairTie(color: number): Geo {
  const b = inked();
  const n = 27;
  const R = 0.042;
  const path: V3[] = [];
  const rad: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    path.push([Math.cos(a) * R, 0.018 + Math.sin(a * 3) * 0.002, Math.sin(a) * R]);
    rad.push(0.0165 * (1 + 0.24 * Math.sin(a * 9)));
  }
  b.add(sweepGeometry(path, rad, 5, true), color, { smooth: true });
  // Little polka dots on top.
  const dots: LocalPart[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    dots.push([new THREE.CircleGeometry(0.0042, 6), [Math.cos(a) * R, 0.0345, Math.sin(a) * R], [-Math.PI / 2, 0, 0]]);
  }
  b.add(mergeLocal(dots), light(color, 0.65), { ink: false });
  return b.build();
}

// ── permission slip ─────────────────────────────────────────────────────────
function permissionSlip(color: number): Geo {
  const b = inked();
  const W = 0.2;
  b.box(W, 0.003, 0.11, PAL.paper, { at: [0, 0.0015, -0.012] });
  b.box(W, 0.003, 0.036, PAL.paper, { at: [0, 0.009, 0.056], rot: [-0.45, 0, 0] });
  b.box(W, 0.0008, 0.02, color, { at: [0, 0.0034, -0.057], ink: false });
  for (let i = 0; i < 4; i++) b.box(0.15 - (i % 2) * 0.03, 0.0008, 0.004, PAL.paperLine, { at: [-0.012 - (i % 2) * 0.015, 0.0034, -0.035 + i * 0.013], ink: false });
  // Checkbox with a big check mark.
  b.box(0.016, 0.0009, 0.016, dark(color), { at: [-0.075, 0.0034, 0.024], ink: false });
  b.box(0.012, 0.001, 0.012, PAL.paper, { at: [-0.075, 0.0036, 0.024], ink: false });
  b.box(0.009, 0.0012, 0.003, color, { at: [-0.078, 0.0039, 0.026], rot: [0, -0.8, 0], ink: false });
  b.box(0.016, 0.0012, 0.003, color, { at: [-0.07, 0.0039, 0.021], rot: [0, 0.9, 0], ink: false });
  // Signature squiggle + paperclip.
  const sig: V3[] = [];
  for (let i = 0; i < 12; i++) sig.push([-0.04 + i * 0.008, 0.0038, 0.026 + Math.sin(i * 1.7) * 0.005]);
  b.add(sweepGeometry(sig, 0.0012, 3), PAL.milkBlue, { smooth: true, ink: false });
  tube(
    b,
    [
      [0.07, 0.004, -0.075],
      [0.07, 0.004, -0.03],
      [0.078, 0.004, -0.024],
      [0.086, 0.004, -0.03],
      [0.086, 0.004, -0.08],
      [0.08, 0.004, -0.085],
      [0.075, 0.004, -0.08],
      [0.075, 0.004, -0.045],
    ],
    0.0016,
    PAL.stainless,
    {},
    4,
  );
  return b.build();
}

// ── folded jacket ────────────────────────────────────────────────────────────
function jacket(color: number): Geo {
  const b = inked();
  const d = dark(color);
  rbox(b, 0.25, 0.07, 0.19, 0.03, color, { at: [0, 0.035, 0] });
  // Hood / collar lying at the back.
  b.torus(0.062, 0.02, 5, 10, d, { at: [0, 0.066, -0.06], rot: [Math.PI / 2, 0, 0], scale: [1, 0.75, 1] }, Math.PI);
  // Zipper down the middle + pull.
  b.box(0.005, 0.002, 0.15, PAL.plasticWhite, { at: [0, 0.0705, 0.015], ink: false });
  b.box(0.01, 0.004, 0.018, PAL.plasticWhite, { at: [0, 0.073, -0.045] });
  // A sleeve folded across the front with a cuff.
  b.add(new THREE.CapsuleGeometry(0.02, 0.17, 2, 8), light(color, 0.12), { at: [0.0, 0.076, 0.06], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.7], smooth: true });
  b.add(new THREE.CylinderGeometry(0.021, 0.021, 0.026, 8), d, { at: [0.1, 0.076, 0.06], rot: [0, 0, Math.PI / 2], scale: [1, 1, 0.72], smooth: true });
  // Drawstrings with aglets.
  for (const s of [-1, 1]) {
    tube(b, [[s * 0.022, 0.07, -0.035], [s * 0.028, 0.074, -0.01], [s * 0.03, 0.073, 0.01]], 0.0022, PAL.hoodieString, {}, 4);
    b.cyl(0.003, 0.003, 0.01, 5, PAL.stainless, { at: [s * 0.03, 0.073, 0.016], rot: [Math.PI / 2, 0, 0], ink: false });
  }
  // Star patch.
  b.extrude(starPts(0.018, 0.008), 0.002, PAL.starPrint, { at: [-0.07, 0.07, 0.0], rot: [-Math.PI / 2, 0, 0], ink: false });
  return b.build();
}

export interface ItemSpec {
  build(color: number): Geo;
  grip: V3 | null;
}

/** Items other than the lunchbox (built by lunchbox.ts). */
export const ITEM_SPECS: Readonly<Record<Exclude<ItemKind, 'lunchbox'>, ItemSpec>> = {
  shoe: { build: shoe, grip: [0.05, 0.085, 0] },
  backpack: { build: backpack, grip: [0, 0.345, -0.012] },
  libraryBook: { build: libraryBook, grip: null },
  waterBottle: { build: waterBottle, grip: [0, 0.1, 0] },
  hairTie: { build: hairTie, grip: [0.042, 0.018, 0] },
  permissionSlip: { build: permissionSlip, grip: [0, 0.003, 0] },
  jacket: { build: jacket, grip: null },
};

export const ITEM_KINDS: readonly ItemKind[] = ['shoe', 'backpack', 'libraryBook', 'waterBottle', 'hairTie', 'permissionSlip', 'jacket', 'lunchbox'];
