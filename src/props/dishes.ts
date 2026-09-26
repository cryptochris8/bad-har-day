// ─────────────────────────────────────────────────────────────────────────────
// Dishes for the dishwasher game: plate, bowl, cup, glass, fork, spoon, butter
// knife, sippy cup, pan. `color` is the accent (plate rim, bowl outside, cup,
// cutlery handles, sippy body, pan handle). Each kind also has a cached "dirty"
// overlay (syrup, milk, crumbs…) for the rinse beat — toggled via setDirty().
// Cutlery lies flat along X (head toward +X, handle toward −X).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { mixHex, shadeHex, type V3 } from '../render/models/builder';
import { inked } from '../render/models/common';
import type { DishKind } from './types';
import { flatDecal, heartPts, rbox, roundPoly, slab, smoothPath, starPts, sweepGeometry, tube, type P2 } from './shapes';

type Geo = THREE.BufferGeometry;

export interface DishSpec {
  body(color: number): Geo;
  dirty(): Geo;
  grip: V3;
}

const DEFAULT_ACCENT = PAL.dishBlue;

function blobs(list: readonly [number, number, number, number, number][], y: number, scaleY = 0.14): Geo {
  // [x, z, r, colour, seed]
  const b = inked();
  for (const [x, z, r, c, s] of list) b.sphere(r, 8, 4, c, { at: [x, y, z], scale: [1.25, scaleY, 1], jitter: r * 0.12, seed: s, ink: false, smooth: true });
  return b.build();
}

// ── plate ────────────────────────────────────────────────────────────────────
function plateGeo(color: number): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0.004],
      [0.075, 0.0],
    ],
    18,
    PAL.porcelain,
    { smooth: true },
  );
  b.lathe(
    [
      [0.075, 0.0],
      [0.118, 0.011],
      [0.131, 0.021],
      [0.127, 0.027],
      [0.1, 0.017],
    ],
    18,
    color,
    { smooth: true },
  );
  b.lathe(
    [
      [0.1, 0.017],
      [0.086, 0.0105],
      [0.001, 0.0095],
    ],
    18,
    PAL.porcelain,
    { smooth: true },
  );
  return b.build();
}

// ── bowl ─────────────────────────────────────────────────────────────────────
const BOWL_OUT: [number, number][] = [
  [0.001, 0],
  [0.038, 0],
  [0.043, 0.007],
  [0.066, 0.035],
  [0.076, 0.056],
  [0.075, 0.062],
  [0.07, 0.063],
];
const BOWL_IN: [number, number][] = [
  [0.07, 0.063],
  [0.067, 0.055],
  [0.057, 0.035],
  [0.036, 0.014],
  [0.001, 0.012],
];

export function bowlShell(b: ReturnType<typeof inked>, color: number): void {
  b.lathe(BOWL_OUT, 16, color, { smooth: true });
  b.lathe(BOWL_IN, 16, PAL.mugCream, { smooth: true, ink: false });
}

function bowlGeo(color: number): Geo {
  const b = inked();
  bowlShell(b, color);
  b.extrude(starPts(0.012, 0.006), 0.002, PAL.porcelain, { at: [0, 0.033, 0.0655], rot: [0.62, 0, 0], ink: false });
  return b.build();
}

// ── cup (kids' tumbler) ─────────────────────────────────────────────────────
function cupGeo(color: number): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.03, 0],
      [0.033, 0.004],
      [0.041, 0.1],
      [0.043, 0.105],
      [0.04, 0.107],
    ],
    14,
    color,
    { smooth: true },
  );
  b.lathe(
    [
      [0.04, 0.107],
      [0.032, 0.012],
      [0.001, 0.01],
    ],
    14,
    shadeHex(color, 0.85),
    { smooth: true, ink: false },
  );
  b.add(new THREE.CylinderGeometry(0.0425, 0.0422, 0.01, 14, 1, true), mixHex(color, 0xffffff, 0.55), { at: [0, 0.088, 0], ink: false });
  b.extrude(starPts(0.014, 0.0065), 0.002, PAL.paper, { at: [0, 0.05, 0.0385], rot: [-0.08, 0, 0], ink: false });
  return b.build();
}

// ── glass ────────────────────────────────────────────────────────────────────
function glassGeo(): Geo {
  const b = inked();
  const glass = mixHex(PAL.glass, PAL.porcelain, 0.5);
  b.lathe(
    [
      [0.001, 0],
      [0.032, 0],
      [0.034, 0.014],
      [0.038, 0.11],
      [0.0385, 0.114],
      [0.036, 0.1145],
    ],
    14,
    glass,
    { smooth: true },
  );
  b.lathe(
    [
      [0.036, 0.1145],
      [0.0325, 0.022],
      [0.001, 0.02],
    ],
    14,
    shadeHex(glass, 0.88),
    { smooth: true, ink: false },
  );
  // Painted-on shine streaks.
  b.box(0.005, 0.07, 0.002, 0xffffff, { at: [-0.016, 0.066, 0.034], rot: [0, -0.45, 0], ink: false });
  b.box(0.0025, 0.03, 0.002, 0xffffff, { at: [-0.007, 0.05, 0.0365], rot: [0, -0.2, 0], ink: false });
  return b.build();
}

// ── cutlery (chunky kids' cutlery, K = scale) ─────────────────────────────────
const K = 1.25;
function handle(b: ReturnType<typeof inked>, color: number, k = K): void {
  b.add(
    sweepGeometry(
      smoothPath(
        [
          [-0.112 * k, 0.0105 * k, 0],
          [-0.07 * k, 0.0105 * k, 0],
          [-0.02 * k, 0.009 * k, 0],
          [-0.004 * k, 0.008 * k, 0],
        ],
        8,
      ),
      [0.009, 0.0115, 0.0115, 0.0105, 0.009, 0.0075, 0.0065, 0.006].map((r) => r * k),
      6,
      false,
      0.5,
    ),
    color,
    { smooth: true },
  );
  b.box(0.034 * k, 0.0045 * k, 0.009 * k, PAL.stainless, { at: [0.012 * k, 0.0075 * k, 0] });
}

function forkGeo(color: number): Geo {
  const b = inked();
  handle(b, color);
  const head: P2[] = [
    [0.026, -0.004],
    [0.044, -0.0155],
    [0.088, -0.0155],
    [0.088, -0.0085],
    [0.058, -0.0085],
    [0.058, -0.0035],
    [0.088, -0.0035],
    [0.088, 0.0035],
    [0.058, 0.0035],
    [0.058, 0.0085],
    [0.088, 0.0085],
    [0.088, 0.0155],
    [0.044, 0.0155],
    [0.026, 0.004],
  ];
  slab(b, roundPoly(head.map(([x, z]) => [x * K, z * K] as const), 0.0028, 1), 0.004 * K, 0.0045 * K, PAL.stainless);
  return b.build();
}

function spoonGeo(color: number, metalHandle = false): Geo {
  const b = inked();
  const k = metalHandle ? 1 : K;
  if (metalHandle) {
    b.add(sweepGeometry(smoothPath([[-0.08, 0.008, 0], [-0.03, 0.008, 0], [0.012, 0.007, 0]], 6), [0.006, 0.006, 0.005, 0.004, 0.0035, 0.003], 5, false, 0.4), PAL.stainless, { smooth: true });
  } else handle(b, color, k);
  b.sphere(1, 10, 6, PAL.stainless, { at: [0.056 * k, 0.0075 * k, 0], scale: [0.03 * k, 0.0065 * k, 0.021 * k], smooth: true });
  b.sphere(1, 10, 5, shadeHex(PAL.stainless, 0.82), { at: [0.057 * k, 0.0115 * k, 0], scale: [0.024 * k, 0.003 * k, 0.016 * k], smooth: true, ink: false });
  return b.build();
}

function butterKnifeGeo(color: number): Geo {
  const b = inked();
  handle(b, color);
  const blade: P2[] = roundPoly(
    [
      [0.026, -0.008],
      [0.085, -0.01],
      [0.102, -0.004],
      [0.102, 0.007],
      [0.026, 0.008],
    ].map(([x, z]) => [x! * K, z! * K] as const),
    0.007,
    2,
  );
  slab(b, blade, 0.0045 * K, 0.004 * K, PAL.stainless);
  b.box(0.06 * K, 0.001, 0.003, shadeHex(PAL.stainless, 0.85), { at: [0.062 * K, 0.0086 * K + 0.0005, -0.002 * K], ink: false });
  return b.build();
}

// ── sippy cup ────────────────────────────────────────────────────────────────
function sippyGeo(color: number): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.03, 0],
      [0.034, 0.005],
      [0.037, 0.066],
      [0.036, 0.074],
    ],
    14,
    color,
    { smooth: true },
  );
  b.lathe(
    [
      [0.0385, 0.07],
      [0.0395, 0.084],
      [0.031, 0.096],
      [0.001, 0.099],
    ],
    14,
    PAL.plasticWhite,
    { smooth: true },
  );
  b.add(new THREE.CapsuleGeometry(0.0085, 0.022, 2, 8), PAL.plasticWhite, { at: [0, 0.105, 0.012], rot: [0.35, 0, 0], scale: [1, 1, 0.55], smooth: true });
  for (const s of [-1, 1])
    tube(b, smoothPath([[s * 0.034, 0.064, 0], [s * 0.056, 0.058, 0], [s * 0.058, 0.04, 0], [s * 0.035, 0.03, 0]], 6), 0.0055, PAL.plasticWhite, {}, 4);
  b.add(flatDecal(heartPts(0.022, 16), 0.0), PAL.paper, { at: [0, 0.04, 0.0368], rot: [-0.05, 0, 0], ink: false });
  return b.build();
}

// ── pan ──────────────────────────────────────────────────────────────────────
function panGeo(color: number): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.105, 0],
      [0.122, 0.008],
      [0.132, 0.034],
      [0.129, 0.039],
    ],
    18,
    PAL.metalDark,
    { smooth: true },
  );
  b.lathe(
    [
      [0.126, 0.038],
      [0.117, 0.012],
      [0.001, 0.01],
    ],
    18,
    mixHex(PAL.metalDark, PAL.stainless, 0.35),
    { smooth: true, ink: false },
  );
  b.torus(0.075, 0.004, 3, 18, mixHex(PAL.metalDark, PAL.stainless, 0.6), { at: [0, 0.0115, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.3], ink: false });
  rbox(b, 0.16, 0.018, 0.03, 0.008, color, { at: [0.215, 0.036, 0], rot: [0, 0, 0.1] });
  b.box(0.035, 0.012, 0.018, PAL.metalDark, { at: [0.135, 0.03, 0], rot: [0, 0, 0.1] });
  b.cyl(0.006, 0.006, 0.004, 6, PAL.stainless, { at: [0.28, 0.0435, 0], ink: false });
  return b.build();
}

// ── dirty overlays ───────────────────────────────────────────────────────────
const plateDirty = (): Geo =>
  blobs(
    [
      [-0.035, 0.02, 0.022, PAL.ketchup, 1],
      [0.03, -0.028, 0.018, PAL.syrup, 2],
      [0.045, 0.03, 0.009, PAL.syrup, 3],
      [-0.01, -0.045, 0.007, PAL.toast, 4],
      [0.005, 0.045, 0.006, PAL.toast, 5],
    ],
    0.011,
  );

const bowlDirty = (): Geo => {
  const b = inked();
  b.sphere(0.035, 10, 4, PAL.milk, { at: [0, 0.014, 0], scale: [1.2, 0.12, 1.2], ink: false, smooth: true });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    b.torus(0.0065, 0.0032, 3, 6, PAL.cereal, { at: [Math.cos(a) * 0.022, 0.018, Math.sin(a) * 0.022], rot: [Math.PI / 2 + 0.2, 0, a], ink: false });
  }
  b.ball(0.009, 0, PAL.cereal, { at: [0.035, 0.04, 0.046], scale: [1, 0.3, 1], ink: false });
  return b.build();
};

const cupDirty = (): Geo => {
  const b = inked();
  b.cyl(0.03, 0.03, 0.004, 12, PAL.juiceOrange, { at: [0, 0.013, 0], ink: false });
  b.ball(0.007, 1, PAL.juiceOrange, { at: [0.012, 0.098, 0.04], scale: [1, 1.8, 0.5], ink: false, smooth: true });
  return b.build();
};

const glassDirty = (): Geo => {
  const b = inked();
  b.cyl(0.031, 0.031, 0.006, 12, PAL.milk, { at: [0, 0.023, 0], ink: false });
  // Milk ring on the inner wall (profile runs downward → faces the inside).
  b.lathe(
    [
      [0.0343, 0.067],
      [0.0339, 0.058],
    ],
    14,
    PAL.milk,
    { ink: false },
  );
  return b.build();
};

const cutleryDirty = (): Geo =>
  blobs(
    [
      [0.075, 0.0, 0.014, PAL.peanutButter, 7],
      [0.088, 0.007, 0.008, PAL.jelly, 8],
    ],
    0.015,
    0.35,
  );

const sippyDirty = (): Geo => blobs([[0.0, 0.03, 0.006, PAL.juiceOrange, 9]], 0.1, 1.4);

const panDirty = (): Geo =>
  blobs(
    [
      [-0.03, 0.02, 0.028, PAL.eggWhite, 11],
      [-0.03, 0.02, 0.011, PAL.eggYolk, 12],
      [0.045, -0.02, 0.012, PAL.toast, 13],
      [0.02, 0.05, 0.008, PAL.toast, 14],
    ],
    0.013,
    0.2,
  );

export const DISH_SPECS: Readonly<Record<DishKind, DishSpec>> = {
  plate: { body: plateGeo, dirty: plateDirty, grip: [0.122, 0.018, 0] },
  bowl: { body: bowlGeo, dirty: bowlDirty, grip: [0.07, 0.05, 0] },
  cup: { body: cupGeo, dirty: cupDirty, grip: [0.0, 0.055, 0] },
  glass: { body: () => glassGeo(), dirty: glassDirty, grip: [0.0, 0.055, 0] },
  fork: { body: forkGeo, dirty: cutleryDirty, grip: [-0.08, 0.012, 0] },
  spoon: { body: (c) => spoonGeo(c), dirty: cutleryDirty, grip: [-0.08, 0.012, 0] },
  butterKnife: { body: butterKnifeGeo, dirty: cutleryDirty, grip: [-0.08, 0.012, 0] },
  sippy: { body: sippyGeo, dirty: sippyDirty, grip: [0.0, 0.05, 0] },
  pan: { body: panGeo, dirty: panDirty, grip: [0.24, 0.042, 0] },
};

export const DISH_KINDS = Object.keys(DISH_SPECS) as DishKind[];
export { DEFAULT_ACCENT, spoonGeo };
