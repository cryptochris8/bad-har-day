// ─────────────────────────────────────────────────────────────────────────────
// Misc household props: coffee carafe, cow-spot creamer, sugar jar, teaspoon,
// the dog's treat bag, banana peel, autumn leaf, cereal box ("Crunchy O's"),
// cereal bowl, buttered toast, Ashley's keys, twin-bell alarm clock, the
// crossing guard's hand-held STOP sign, and the dog's fuzzy ball.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { mixHex, shadeHex, type V3 } from '../render/models/builder';
import { inked } from '../render/models/common';
import { bowlShell, spoonGeo } from './dishes';
import {
  addPixelText,
  breadPts,
  flatDecal,
  heartPts,
  maplePts,
  mergeLocal,
  plate,
  polygonPts,
  profileRadius,
  pixelText,
  rbox,
  scalePts,
  slab,
  smoothPath,
  starPts,
  sweepGeometry,
  tube,
  wrapAround,
  type LocalPart,
  type P2,
} from './shapes';

export type MiscKind =
  | 'coffeeCarafe'
  | 'creamer'
  | 'sugarJar'
  | 'spoon'
  | 'treatBag'
  | 'bananaPeel'
  | 'leaf'
  | 'cerealBox'
  | 'cerealBowl'
  | 'toast'
  | 'keys'
  | 'alarmClock'
  | 'stopSign'
  | 'ball';

type Geo = THREE.BufferGeometry;
type B = ReturnType<typeof inked>;

const cHandle = (b: B, pts: readonly V3[], r: number, color: number) => tube(b, smoothPath(pts, 10), r, color, {}, 6);

function coffeeCarafe(): Geo {
  const b = inked();
  const fillY = 0.064;
  b.lathe(
    [
      [0.001, 0],
      [0.05, 0],
      [0.062, 0.012],
      [0.07, 0.048],
      [0.0695, fillY],
    ],
    14,
    PAL.coffeeBlack,
    { smooth: true },
  );
  b.lathe(
    [
      [0.0695, fillY],
      [0.066, 0.086],
      [0.053, 0.108],
      [0.047, 0.122],
    ],
    14,
    PAL.carafeGlass,
    { smooth: true },
  );
  b.cyl(0.049, 0.051, 0.03, 14, PAL.carafeBlack, { at: [0, 0.135, 0], smooth: true });
  b.lathe(
    [
      [0.051, 0.15],
      [0.047, 0.157],
      [0.028, 0.163],
      [0.001, 0.165],
    ],
    14,
    PAL.carafeBlack,
    { smooth: true },
  );
  b.sphere(0.009, 8, 4, PAL.carafeBlack, { at: [0, 0.168, 0], scale: [1, 0.7, 1], smooth: true });
  // Pour spout on the left.
  b.cone(0.016, 0.03, 4, PAL.carafeBlack, { at: [-0.058, 0.138, 0], rot: [0, 0, Math.PI / 2 + 0.35], scale: [1, 1, 0.55] });
  cHandle(
    b,
    [
      [0.047, 0.135, 0],
      [0.082, 0.132, 0],
      [0.1, 0.108, 0],
      [0.098, 0.07, 0],
      [0.07, 0.05, 0],
    ],
    0.0095,
    PAL.carafeBlack,
  );
  b.box(0.006, 0.05, 0.002, 0xffffff, { at: [-0.03, 0.09, 0.058], rot: [0.35, -0.45, 0], ink: false });
  b.ball(0.012, 0, shadeHex(PAL.coffeeBlack, 1.9), { at: [-0.024, 0.035, 0.062], scale: [1.2, 0.5, 0.2], rot: [0, -0.35, 0], ink: false });
  return b.build();
}

const CREAMER: P2[] = [
  [0.001, 0],
  [0.03, 0],
  [0.036, 0.006],
  [0.043, 0.035],
  [0.039, 0.064],
  [0.034, 0.078],
  [0.037, 0.09],
];
function creamer(): Geo {
  const b = inked();
  b.lathe(CREAMER, 14, PAL.porcelain, { smooth: true });
  b.add(new THREE.CircleGeometry(0.0335, 14), PAL.milk, { at: [0, 0.083, 0], rot: [-Math.PI / 2, 0, 0], ink: false });
  b.lathe(
    [
      [0.037, 0.09],
      [0.034, 0.084],
      [0.033, 0.082],
    ],
    14,
    shadeHex(PAL.porcelain, 0.9),
    { ink: false },
  );
  b.cone(0.012, 0.024, 4, PAL.porcelain, { at: [-0.042, 0.088, 0], rot: [0, 0, Math.PI / 2 + 0.5], scale: [1, 1, 0.55] });
  cHandle(
    b,
    [
      [0.035, 0.078, 0],
      [0.058, 0.074, 0],
      [0.063, 0.05, 0],
      [0.042, 0.03, 0],
    ],
    0.0075,
    PAL.porcelain,
  );
  const rAt = (y: number) => profileRadius(CREAMER.slice(2, 6), y);
  const blob = (r: number, seed: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const k = 1 + 0.22 * Math.sin(a * 3 + seed) + 0.1 * Math.cos(a * 5 + seed * 2);
      out.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
    }
    return out;
  };
  const spots: LocalPart[] = [
    [flatDecal(blob(0.011, 1), 0.001), [-0.012, 0.05, 0]],
    [flatDecal(blob(0.008, 2), 0.001), [0.022, 0.028, 0]],
    [flatDecal(blob(0.007, 3), 0.001), [0.018, 0.064, 0]],
    [flatDecal(blob(0.006, 4), 0.001), [-0.034, 0.024, 0]],
  ];
  b.add(wrapAround(mergeLocal(spots), rAt), PAL.cowSpot, { ink: false });
  b.add(new THREE.CylinderGeometry(rAt(0.075) + 0.001, rAt(0.069) + 0.001, 0.006, 14, 1, true), PAL.mugBlush, { at: [0, 0.072, 0], ink: false });
  return b.build();
}

function sugarJar(): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.036, 0],
      [0.041, 0.006],
      [0.043, 0.06],
      [0.04, 0.07],
    ],
    14,
    PAL.mugMint,
    { smooth: true },
  );
  b.lathe(
    [
      [0.045, 0.066],
      [0.046, 0.074],
      [0.036, 0.086],
      [0.001, 0.09],
    ],
    14,
    PAL.mugCream,
    { smooth: true },
  );
  b.sphere(0.01, 8, 5, PAL.mugCream, { at: [0, 0.096, 0], smooth: true });
  // Sugar-cube badge on the front.
  b.box(0.02, 0.02, 0.01, PAL.salt, { at: [-0.004, 0.034, 0.041], rot: [0, 0, 0.12] });
  b.box(0.016, 0.016, 0.01, PAL.salt, { at: [0.013, 0.027, 0.039], rot: [0, 0.3, -0.2] });
  // A teaspoon poking out from under the lid.
  b.add(sweepGeometry(smoothPath([[0.02, 0.07, 0.02], [0.05, 0.1, 0.03], [0.062, 0.114, 0.034]], 5), 0.004, 5, false, 0.5), PAL.stainless, { smooth: true });
  return b.build();
}

function treatBag(): Geo {
  const b = inked();
  rbox(b, 0.12, 0.155, 0.06, 0.014, PAL.kraft, { at: [0, 0.078, 0] });
  b.add(new THREE.CapsuleGeometry(0.013, 0.1, 2, 8), shadeHex(PAL.kraft, 0.9), { at: [0, 0.162, 0], rot: [0, 0, Math.PI / 2], smooth: true });
  // Label with a bone.
  b.add(new THREE.CircleGeometry(0.032, 16), PAL.paper, { at: [0, 0.075, 0.0322], ink: false });
  const flat: LocalPart[] = [];
  const disc = (x: number, y: number, r: number, n = 8): LocalPart => [new THREE.CircleGeometry(r, n), [x, y, 0.0335]];
  flat.push([new THREE.PlaneGeometry(0.034, 0.009), [0, 0.075, 0.0335]]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) flat.push(disc(sx * 0.017, 0.075 + sy * 0.005, 0.0065));
  b.add(mergeLocal(flat), PAL.cocoa, { ink: false });
  const paws: LocalPart[] = [];
  for (const [x, y] of [
    [-0.04, 0.128],
    [0.042, 0.03],
  ] as const) {
    paws.push([new THREE.CircleGeometry(0.0065, 8), [x, y, 0.0312]]);
    for (let i = 0; i < 3; i++) paws.push([new THREE.CircleGeometry(0.003, 6), [x - 0.0065 + i * 0.0065, y + 0.01 - Math.abs(i - 1) * 0.002, 0.0312]]);
  }
  b.add(mergeLocal(paws), shadeHex(PAL.kraft, 0.7), { ink: false });
  return b.build();
}

export function bananaPeelGeo(): Geo {
  const b = inked();
  const flaps: [number, number, number][] = [
    [0.35, 0.075, 0.2],
    [1.95, 0.07, -0.25],
    [3.3, 0.078, 0.15],
    [4.7, 0.066, -0.2],
  ];
  const pale = mixHex(PAL.banana, PAL.paper, 0.55);
  for (const [a, len, bend] of flaps) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const pts: V3[] = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const along = 0.012 + t * len;
      const side = Math.sin(t * Math.PI * 0.8) * bend * len * 0.35;
      pts.push([c * along - s * side, 0.024 * (1 - t) * (1 - t) + 0.006, s * along + c * side]);
    }
    const rad = [0.015, 0.017, 0.016, 0.013, 0.009, 0.005];
    b.add(sweepGeometry(pts, rad, 4, false, 0.35), PAL.banana, { smooth: true });
    b.add(sweepGeometry(pts.map(([x, y, z]) => [x, y + 0.0035, z] as const).slice(0, 5), [0.009, 0.011, 0.01, 0.008, 0.005], 3, false, 0.3), pale, { smooth: true, ink: false });
    const e = pts[5]!;
    b.ball(0.0055, 0, PAL.bananaTip, { at: [e[0], e[1] + 0.001, e[2]], ink: false });
  }
  b.sphere(0.02, 8, 5, PAL.banana, { at: [0, 0.018, 0], scale: [1, 0.9, 1], smooth: true });
  b.cyl(0.006, 0.008, 0.022, 6, PAL.bananaTip, { at: [0.004, 0.04, 0], rot: [0, 0, -0.25] });
  return b.build();
}

function leaf(): Geo {
  const b = inked();
  const rot: V3 = [-Math.PI / 2 + 0.06, 0, 0.35];
  b.extrude(maplePts(0.13), 0.004, PAL.leafAutumn, { at: [0, 0.008, 0], rot });
  const veins: LocalPart[] = [];
  for (const a of [Math.PI / 2, Math.PI / 2 + 1.26, Math.PI / 2 - 1.26, Math.PI / 2 + 2.3, Math.PI / 2 - 2.3]) {
    const L = a === Math.PI / 2 ? 0.05 : 0.036;
    veins.push([new THREE.BoxGeometry(L, 0.0022, 0.002), [Math.cos(a) * L * 0.5, Math.sin(a) * L * 0.5, 0.0025], [0, 0, a]]);
  }
  b.add(mergeLocal(veins), shadeHex(PAL.leafAutumn, 0.78), { at: [0, 0.008, 0], rot, ink: false });
  tube(b, [[0, 0, 0], [0, -0.03, 0.0]], [0.0028, 0.002], PAL.leafBrown, { at: [0, 0.008, 0], rot }, 4);
  return b.build();
}

function cerealBox(): Geo {
  const b = inked();
  rbox(b, 0.22, 0.3, 0.075, 0.008, PAL.cerealBox, { at: [0, 0.15, 0] });
  const zf = 0.0378;
  b.box(0.19, 0.21, 0.004, PAL.cerealPanel, { at: [0, 0.135, zf], ink: false });
  // Banner with block letters.
  b.box(0.17, 0.042, 0.004, PAL.wrapperBerry, { at: [0, 0.255, zf + 0.0005], ink: false });
  addPixelText(b, "O'S", 0.0078, 0.003, PAL.paper, [0, 0.255, zf + 0.003]);
  // Bowl of O's illustration.
  const bowl: P2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    bowl.push([Math.cos(a) * 0.07, Math.sin(a) * 0.045]);
  }
  plate(b, bowl, zf + 0.002, 0.003, PAL.dishBlue, { at: [0, 0.1, 0], ink: false });
  b.box(0.14, 0.012, 0.003, PAL.milk, { at: [0, 0.103, zf + 0.0035], ink: false });
  const os: [number, number][] = [
    [-0.045, 0.114],
    [-0.02, 0.122],
    [0.006, 0.115],
    [0.03, 0.123],
    [0.052, 0.113],
    [-0.008, 0.138],
    [0.018, 0.142],
    [0.04, 0.16],
    [-0.035, 0.155],
  ];
  const ring: LocalPart[] = os.map(([x, y]) => [new THREE.RingGeometry(0.0045, 0.0125, 9), [x, y, zf + 0.0045]] as LocalPart);
  b.add(mergeLocal(ring), PAL.cereal, { ink: false });
  // Starburst in the corner.
  plate(b, starPts(0.028, 0.019, 12), zf + 0.002, 0.003, PAL.great, { at: [0.066, 0.19, 0], ink: false });
  b.add(new THREE.CircleGeometry(0.011, 10), PAL.paper, { at: [0.066, 0.19, zf + 0.0053], ink: false });
  return b.build();
}

function cerealBowl(): Geo {
  const b = inked();
  bowlShell(b, PAL.dishBlue);
  b.add(new THREE.CircleGeometry(0.0665, 16), PAL.milk, { at: [0, 0.051, 0], rot: [-Math.PI / 2, 0, 0], ink: false });
  const os: LocalPart[] = [];
  for (let i = 0; i < 10; i++) {
    const a = i * 2.39;
    const r = 0.01 + (i % 4) * 0.013;
    os.push([new THREE.RingGeometry(0.0042, 0.0118, 9), [Math.cos(a) * r, 0.0522 + (i % 3) * 0.0004, Math.sin(a) * r], [-Math.PI / 2, 0, a]]);
  }
  b.add(mergeLocal(os), PAL.cereal, { ink: false });
  b.add(sweepGeometry(smoothPath([[0.01, 0.052, 0.01], [0.06, 0.07, 0.02], [0.1, 0.085, 0.026]], 6), [0.006, 0.0055, 0.005, 0.0045, 0.004, 0.004], 5, false, 0.45), PAL.stainless, { smooth: true });
  return b.build();
}

function toast(): Geo {
  const b = inked();
  const W = 0.14;
  const H = 0.13;
  const pts: P2[] = breadPts(W, H).map(([x, y]) => [x, H / 2 - y] as const);
  slab(b, pts, 0, 0.018, PAL.breadCrust);
  slab(b, scalePts(pts, 0.86), 0.001, 0.0185, PAL.toast, { ink: false });
  rbox(b, 0.034, 0.009, 0.03, 0.003, PAL.butter, { at: [0.004, 0.023, 0.004], rot: [0, 0.45, 0] });
  b.ball(0.024, 1, mixHex(PAL.butter, PAL.toast, 0.35), { at: [0.004, 0.0195, 0.006], scale: [1.4, 0.08, 1.1], ink: false, smooth: true });
  return b.build();
}

function keys(): Geo {
  const b = inked();
  b.torus(0.02, 0.003, 3, 12, PAL.stainless, { at: [0, 0.003, 0], rot: [Math.PI / 2, 0, 0] });
  const key = (a: number, color: number, len: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (d: number, side = 0): V3 => [c * d - s * side, 0.003, s * d + c * side];
    b.cyl(0.015, 0.015, 0.005, 10, color, { at: at(0.032) });
    b.add(new THREE.CircleGeometry(0.0045, 6), shadeHex(color, 0.55), { at: [at(0.027)[0], 0.0056, at(0.027)[2]], rot: [-Math.PI / 2, 0, 0], ink: false });
    const teeth: P2[] = [
      [0.04, -0.005],
      [0.04 + len, -0.005],
      [0.04 + len + 0.005, 0],
      [0.04 + len, 0.005],
      [0.04 + len * 0.8, 0.005],
      [0.04 + len * 0.7, 0.009],
      [0.04 + len * 0.55, 0.005],
      [0.04 + len * 0.4, 0.009],
      [0.04 + len * 0.3, 0.005],
      [0.04, 0.005],
    ];
    slab(
      b,
      teeth.map(([x, z]) => [c * x - s * z, s * x + c * z] as const),
      0.001,
      0.003,
      color,
    );
  };
  key(0.5, PAL.keyBrass, 0.045);
  key(2.3, PAL.stainless, 0.04);
  // Car key fob + heart charm.
  const fa = -1.2;
  b.taper(0.03, 0.046, 0.026, 0.04, 0.012, PAL.fobDark, { at: [Math.cos(fa) * 0.048, 0.006, Math.sin(fa) * 0.048], rot: [0, -fa + Math.PI / 2, 0] });
  b.add(new THREE.CircleGeometry(0.0065, 8), PAL.stopRed, { at: [Math.cos(fa) * 0.05, 0.0125, Math.sin(fa) * 0.05], rot: [-Math.PI / 2, 0, 0], ink: false });
  slab(b, heartPts(0.03, 16).map(([x, y]) => [x - 0.038, -y + 0.024] as const), 0.001, 0.005, PAL.heart);
  return b.build();
}

function alarmClock(): Geo {
  const b = inked();
  const cy = 0.07;
  b.cyl(0.055, 0.055, 0.042, 18, PAL.clockBody, { at: [0, cy, 0], rot: [Math.PI / 2, 0, 0], smooth: false });
  b.torus(0.05, 0.006, 3, 16, shadeHex(PAL.clockBody, 1.12), { at: [0, cy, 0.021], ink: false });
  b.add(new THREE.CircleGeometry(0.047, 18), PAL.paper, { at: [0, cy, 0.0232], ink: false });
  const ticks: LocalPart[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    ticks.push([new THREE.PlaneGeometry(big ? 0.0045 : 0.0028, big ? 0.009 : 0.005), [Math.sin(a) * 0.038, cy + Math.cos(a) * 0.038, 0.0238], [0, 0, -a]]);
  }
  b.add(mergeLocal(ticks), PAL.carafeBlack, { ink: false });
  // 5:15 — the start of the morning.
  const hand = (a: number, len: number, w: number) =>
    b.box(w, len, 0.002, PAL.carafeBlack, { at: [Math.sin(a) * len * 0.45, cy + Math.cos(a) * len * 0.45, 0.025], rot: [0, 0, -a], ink: false });
  hand(((5 + 15 / 60) / 12) * Math.PI * 2, 0.024, 0.005);
  hand((15 / 60) * Math.PI * 2, 0.034, 0.0035);
  b.add(new THREE.CircleGeometry(0.0042, 8), PAL.stopRed, { at: [0, cy, 0.0262], ink: false });
  // Bells + hammer.
  for (const s of [-1, 1]) {
    b.add(new THREE.SphereGeometry(0.025, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), PAL.keyBrass, { at: [s * 0.034, cy + 0.052, 0], rot: [0, 0, -s * 0.55], smooth: true });
    b.cyl(0.005, 0.005, 0.014, 6, PAL.keyBrass, { at: [s * 0.03, cy + 0.048, 0], rot: [0, 0, -s * 0.55] });
    b.cyl(0.004, 0.005, 0.03, 6, PAL.carafeBlack, { at: [s * 0.036, 0.012, 0.0], rot: [0, 0, s * 0.45] });
  }
  b.box(0.004, 0.02, 0.004, PAL.carafeBlack, { at: [0, cy + 0.064, 0] });
  b.sphere(0.006, 6, 4, PAL.carafeBlack, { at: [0, cy + 0.076, 0], smooth: true });
  return b.build();
}

function stopSign(): Geo {
  const b = inked();
  const poleH = 1.1;
  b.cyl(0.013, 0.013, poleH, 8, PAL.plasticWhite, { at: [0, poleH / 2, 0], smooth: true });
  b.cyl(0.019, 0.019, 0.16, 8, PAL.carafeBlack, { at: [0, 0.5, 0], smooth: true });
  const cy = poleH + 0.235;
  plate(b, polygonPts(0.25, 8), -0.007, 0.014, PAL.plasticWhite, { at: [0, cy, 0] });
  plate(b, polygonPts(0.222, 8), -0.0085, 0.017, PAL.stopRed, { at: [0, cy, 0], ink: false });
  const cell = 0.026;
  addPixelText(b, 'STOP', cell, 0.003, PAL.plasticWhite, [0, cy, 0.009]);
  // Mirrored on the back so it reads from either side.
  for (const r of pixelText('STOP', cell)) b.box(r.w, r.h, 0.003, PAL.plasticWhite, { at: [-r.x, cy + r.y, -0.009], ink: false });
  b.cyl(0.02, 0.02, 0.012, 8, PAL.stainless, { at: [0, poleH + 0.005, 0], smooth: true });
  return b.build();
}

function ball(): Geo {
  const b = inked();
  const R = 0.042;
  b.sphere(R, 12, 8, PAL.ballYellow, { at: [0, R, 0], smooth: true });
  const seam: V3[] = [];
  const n = 24;
  const bb = 0.3;
  const aa = 1 - bb;
  const cc = 2 * Math.sqrt(aa * bb);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = aa * Math.cos(t) + bb * Math.cos(3 * t);
    const y = aa * Math.sin(t) - bb * Math.sin(3 * t);
    const z = cc * Math.sin(2 * t);
    const l = Math.hypot(x, y, z);
    seam.push([(x / l) * R * 1.005, (z / l) * R * 1.005 + R, (y / l) * R * 1.005]);
  }
  b.add(sweepGeometry(seam, 0.003, 3, true), PAL.paper, { smooth: true, ink: false });
  return b.build();
}

export interface MiscSpec {
  build(): Geo;
  grip?: V3;
}

export const MISC_SPECS: Readonly<Record<MiscKind, MiscSpec>> = {
  coffeeCarafe: { build: coffeeCarafe, grip: [0.098, 0.09, 0] },
  creamer: { build: creamer, grip: [0.06, 0.052, 0] },
  sugarJar: { build: sugarJar },
  spoon: { build: () => spoonGeo(PAL.stainless, true), grip: [-0.04, 0.008, 0] },
  treatBag: { build: treatBag, grip: [0, 0.162, 0] },
  bananaPeel: { build: bananaPeelGeo },
  leaf: { build: leaf },
  cerealBox: { build: cerealBox, grip: [0.11, 0.16, 0] },
  cerealBowl: { build: cerealBowl, grip: [0.07, 0.05, 0] },
  toast: { build: toast },
  keys: { build: keys, grip: [0, 0.004, 0] },
  alarmClock: { build: alarmClock },
  stopSign: { build: stopSign, grip: [0, 0.5, 0] },
  ball: { build: ball },
};

export const MISC_KINDS = Object.keys(MISC_SPECS) as MiscKind[];
