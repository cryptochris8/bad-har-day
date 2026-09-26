// ─────────────────────────────────────────────────────────────────────────────
// Food: the 16 lunch items (+ the love note). Every one is ONE merged inked
// geometry (cached per kind), origin at the bottom centre, front (+Z) toward the
// camera, cartoon scale ≈ 1.25× real. All of it looks yummy — no food is "bad".
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { shadeHex, type GeoBuilder } from '../render/models/builder';
import { inked } from '../render/models/common';
import type { FoodKind } from './types';
import {
  breadPts,
  dropPts,
  heartPts,
  leafPts,
  mergeLocal,
  type LocalPart,
  rbox,
  roundPoly,
  scalePts,
  slab,
  smoothPath,
  starPts,
  sweepGeometry,
  tube,
  type P2,
} from './shapes';

type Geo = THREE.BufferGeometry;

/** Lay a small leaf (XY outline) tilted near-flat at `at`, yaw `yaw`. */
function leaf(b: GeoBuilder, len: number, w: number, at: readonly [number, number, number], yaw: number, tilt = 0.35, color: number = PAL.plantGreen): void {
  b.extrude(leafPts(len, w), 0.003, color, { at, rot: [-Math.PI / 2 + tilt, 0, yaw] });
}

// ── mains ────────────────────────────────────────────────────────────────────

function sandwich(): Geo {
  const W = 0.15;
  const H = 0.14;
  const bread: P2[] = breadPts(W, H, 3).map(([x, y]) => [x, H / 2 - y] as const);
  const inner = scalePts(bread, 0.86);
  const b = inked();
  const slice = (y0: number) => {
    slab(b, bread, y0, 0.02, PAL.breadCrust);
    slab(b, inner, y0 + 0.001, 0.0205, PAL.bread, { ink: false });
  };
  slice(0);
  slab(b, scalePts(bread, 1.08), 0.02, 0.006, PAL.lettuce, { jitter: 0.005, seed: 3 });
  slab(b, scalePts(bread, 1.0), 0.026, 0.006, PAL.ham, { ink: false });
  b.box(0.12, 0.005, 0.12, PAL.cheese, { at: [0.008, 0.0345, 0.012], rot: [0, 0.4, 0], ink: false });
  b.cyl(0.026, 0.026, 0.006, 10, PAL.tomato, { at: [-0.04, 0.029, 0.05], ink: false });
  b.cyl(0.024, 0.024, 0.006, 10, PAL.tomato, { at: [0.045, 0.029, 0.048], ink: false });
  slice(0.037);
  return b.build();
}

function pbj(): Geo {
  const b = inked();
  const a = 0.086;
  const tri = roundPoly(
    [
      [-a, 0.03],
      [a, 0.03],
      [0, 0.03 - a],
    ],
    0.012,
    2,
  );
  const half = (x: number, z: number, yaw: number) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const pts = (k: number): P2[] => scalePts(tri, k, 0, 0).map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c] as const);
    slab(b, pts(1), 0, 0.016, PAL.bread);
    slab(b, pts(0.97), 0.016, 0.007, PAL.peanutButter, { ink: false });
    slab(b, pts(1.025), 0.023, 0.007, PAL.jelly);
    slab(b, pts(1), 0.03, 0.016, PAL.bread);
    // A cheerful jelly drip on the cut face.
    const fx = x + 0.0 * c + 0.03 * s;
    const fz = z - 0.0 * s + 0.03 * c;
    b.ball(0.008, 1, PAL.jelly, { at: [fx + 0.012 * c, 0.021, fz + 0.004 * c], scale: [1.3, 1.6, 0.8], rot: [0, yaw, 0], ink: false, smooth: true });
  };
  half(-0.05, 0.02, 0.28);
  half(0.058, -0.012, -0.3);
  return b.build();
}

function wrap(): Geo {
  const b = inked();
  const R = 0.036;
  const prof: [number, number][] = [
    [0.001, 0],
    [0.02, 0.004],
    [0.032, 0.018],
    [R, 0.04],
    [R, 0.085],
  ];
  const spiral = (): [number, number, number][] => {
    const out: [number, number, number][] = [];
    const turns = 2.2;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const th = t * turns * Math.PI * 2;
      const r = 0.004 + t * 0.026;
      out.push([Math.cos(th) * r, Math.sin(th) * r, 0]);
    }
    return out;
  };
  const cap = (at: readonly [number, number, number], rot: readonly [number, number, number]) => {
    b.add(new THREE.CircleGeometry(R - 0.002, 12), PAL.lettuce, { at, rot, ink: false });
  };
  // Lying half: axis along +X, cut face at +X showing the filling.
  b.lathe(prof, 10, PAL.tortilla, { at: [-0.085, R, 0.018], rot: [0, 0, -Math.PI / 2], smooth: true });
  cap([0.0005, R, 0.018], [0, Math.PI / 2, 0]);
  b.add(sweepGeometry(spiral(), 0.0028, 3), PAL.tortilla, { at: [0.0015, R, 0.018], rot: [0, Math.PI / 2, 0], ink: false, smooth: true });
  b.ball(0.006, 0, PAL.tomato, { at: [0.002, R + 0.012, 0.03], ink: false });
  b.ball(0.005, 0, PAL.cheese, { at: [0.002, R - 0.014, 0.006], ink: false });
  // Parchment band.
  b.add(new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.03, 10, 1, true), PAL.paper, { at: [-0.035, R, 0.018], rot: [0, 0, Math.PI / 2] });
  // Toasty spots.
  for (let i = 0; i < 2; i++) b.ball(0.005, 0, PAL.tortillaSpot, { at: [-0.07 + i * 0.014, R * 2 - 0.001, 0.018 + (i % 2 ? 0.01 : -0.008)], scale: [1.3, 0.3, 1], ink: false });
  // Standing half: cut face up with the spiral.
  b.lathe(prof, 10, PAL.tortilla, { at: [0.052, 0, -0.03], smooth: true });
  cap([0.052, 0.0855, -0.03], [-Math.PI / 2, 0, 0]);
  b.add(sweepGeometry(spiral(), 0.0028, 3), PAL.tortilla, { at: [0.052, 0.0865, -0.03], rot: [-Math.PI / 2, 0, 0], ink: false, smooth: true });
  b.ball(0.006, 0, PAL.tomato, { at: [0.064, 0.087, -0.022], ink: false, scale: [1, 0.4, 1] });
  b.ball(0.005, 0, PAL.cheese, { at: [0.04, 0.087, -0.04], ink: false, scale: [1, 0.4, 1] });
  return b.build();
}

function pastaCup(): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.038, 0],
      [0.042, 0.005],
      [0.048, 0.05],
      [0.052, 0.056],
      [0.05, 0.06],
    ],
    12,
    PAL.dishBlue,
    { smooth: true },
  );
  b.lathe(
    [
      [0.047, 0.059],
      [0.041, 0.014],
      [0.001, 0.012],
    ],
    12,
    PAL.mugCream,
    { ink: false, smooth: true },
  );
  b.ball(0.046, 1, PAL.pasta, { at: [0, 0.05, 0], scale: [1, 0.42, 1], jitter: 0.004, seed: 7, smooth: true });
  const elbows: [number, number, number, number][] = [
    [0.0, 0.07, 0.012, 0.3],
    [-0.02, 0.066, -0.008, 1.8],
    [0.022, 0.065, -0.012, 2.6],
    [-0.018, 0.064, 0.022, 4.1],
    [0.02, 0.065, 0.022, 5.2],
  ];
  for (const [x, y, z, a] of elbows)
    b.torus(0.009, 0.0045, 3, 5, shadeHex(PAL.pasta, 0.95), { at: [x, y, z], rot: [0.9, a, 0.3], ink: false }, Math.PI);
  // Little plastic fork planted in the pasta.
  b.box(0.006, 0.06, 0.003, PAL.plasticWhite, { at: [0.024, 0.09, 0.008], rot: [0, 0, -0.35] });
  b.box(0.014, 0.012, 0.003, PAL.plasticWhite, { at: [0.035, 0.121, 0.008], rot: [0, 0, -0.35], ink: false });
  return b.build();
}

// ── snacks ───────────────────────────────────────────────────────────────────

function crackers(): Geo {
  const b = inked();
  const scal: P2[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.031 : 0.0285;
    scal.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const holes: LocalPart[] = [];
  const cracker = (x: number, y: number, z: number, yaw: number, top: boolean) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    slab(b, scal.map(([px, pz]) => [px * c + pz * s, -px * s + pz * c] as const), y, 0.007, PAL.cracker, { at: [x, 0, z] });
    if (top)
      for (let i = 0; i < 5; i++) {
        const a = (i / 4) * Math.PI * 2 + yaw;
        const rr = i === 4 ? 0 : 0.014;
        holes.push([new THREE.CircleGeometry(0.0026, 5), [x + Math.cos(a) * rr, y + 0.0075, z + Math.sin(a) * rr], [-Math.PI / 2, 0, 0]]);
      }
  };
  cracker(-0.012, 0, -0.008, 0, false);
  b.box(0.04, 0.006, 0.04, PAL.cheese, { at: [-0.009, 0.01, -0.006], rot: [0, 0.3, 0] });
  cracker(-0.008, 0.013, -0.005, 0.2, false);
  b.box(0.04, 0.006, 0.04, PAL.cheese, { at: [-0.011, 0.023, -0.004], rot: [0, -0.25, 0] });
  cracker(-0.01, 0.026, -0.004, 0.1, true);
  // One more on the counter in front, with a cheese square on it.
  cracker(0.034, 0, 0.036, 0.4, false);
  b.box(0.038, 0.006, 0.038, PAL.cheese, { at: [0.036, 0.01, 0.036], rot: [0, 0.8, 0] });
  b.add(mergeLocal(holes), shadeHex(PAL.cracker, 0.7), { ink: false });
  return b.build();
}

function pretzels(): Geo {
  const b = inked();
  const s = 0.062;
  // Classic pretzel knot drawn on paper (x right, y up), lying flat (paper y → −z).
  const knot: [number, number, number][] = [
    [-0.38, -0.62, 0.0],
    [-0.1, -0.12, 0.5],
    [0.28, 0.32, 0.2],
    [0.6, 0.55, 0],
    [0.9, 0.3, 0],
    [0.9, -0.12, 0],
    [0.62, -0.55, 0],
    [0.0, -0.8, 0],
    [-0.62, -0.55, 0],
    [-0.9, -0.12, 0],
    [-0.9, 0.3, 0],
    [-0.6, 0.55, 0],
    [-0.28, 0.32, 0.2],
    [0.1, -0.12, -0.3],
    [0.38, -0.62, 0.0],
  ];
  const r = 0.0095;
  const path = smoothPath(
    knot.map(([x, y, h]) => [x * s, r + h * 0.012, -y * s + 0.004] as const),
    28,
  );
  b.add(sweepGeometry(path, r, 5), PAL.pretzel, { smooth: true });
  const salt: [number, number][] = [
    [0.03, 0.02],
    [-0.035, 0.015],
    [0.05, -0.012],
    [-0.05, -0.01],
    [0.005, 0.045],
    [-0.02, -0.03],
    [0.03, -0.028],
  ];
  salt.forEach(([x, z], i) => b.box(0.005, 0.004, 0.005, PAL.salt, { at: [x, r * 2 + 0.001, z], rot: [0.3, i, 0.2], ink: false }));
  return b.build();
}

function granolaBar(): Geo {
  const b = inked();
  rbox(b, 0.105, 0.026, 0.046, 0.009, PAL.wrapperSun, { at: [-0.008, 0.013, 0] });
  b.box(0.014, 0.007, 0.05, PAL.wrapperSun, { at: [-0.064, 0.012, 0] });
  b.box(0.028, 0.0265, 0.0465, PAL.wrapperBerry, { at: [-0.03, 0.013, 0], ink: false });
  // Sunburst badge.
  slab(b, starPts(0.013, 0.008, 8), 0.0262, 0.002, PAL.paper, { at: [0.014, 0, 0], ink: false });
  b.cyl(0.006, 0.006, 0.0025, 10, PAL.juiceOrange, { at: [0.014, 0.0285, 0], ink: false });
  // Torn-open end with the oat bar peeking out.
  rbox(b, 0.036, 0.018, 0.036, 0.006, PAL.granola, { at: [0.056, 0.012, 0], jitter: 0.0015, seed: 11 });
  for (let i = 0; i < 3; i++) b.ball(0.004, 0, shadeHex(PAL.granola, i % 2 ? 0.75 : 1.12), { at: [0.05 + i * 0.008, 0.0215, -0.008 + i * 0.008], ink: false });
  b.box(0.018, 0.002, 0.044, PAL.wrapperSun, { at: [0.05, 0.03, 0], rot: [0, 0, 0.55] });
  return b.build();
}

function cheeseStick(): Geo {
  const b = inked();
  const r = 0.015;
  const axis: readonly [number, number, number] = [0, 0, Math.PI / 2];
  b.add(new THREE.CapsuleGeometry(r, 0.072, 3, 10), PAL.stringCheese, { at: [-0.008, r, 0], rot: axis, smooth: true });
  // Wrapper sleeve over the left half with a crimped seal and a stripe.
  b.add(new THREE.CylinderGeometry(r + 0.0022, r + 0.0022, 0.046, 10, 1, true), PAL.wrapperBerry, { at: [-0.036, r, 0], rot: axis, smooth: true });
  b.add(new THREE.CylinderGeometry(r + 0.0026, r + 0.0026, 0.009, 10, 1, true), PAL.paper, { at: [-0.026, r, 0], rot: axis, ink: false });
  b.box(0.016, 0.005, 0.036, PAL.wrapperBerry, { at: [-0.066, r, 0] });
  // Peeled strings splaying out of the right end (the best part).
  const strings: [number, number][] = [
    [0.004, 0.012],
    [0.011, 0.0],
    [0.003, -0.013],
  ];
  for (const [dy, dz] of strings)
    tube(
      b,
      smoothPath(
        [
          [0.034, r + dy * 0.5, dz * 0.4],
          [0.052, r + dy + 0.003, dz * 1.1],
          [0.068, r + dy * 1.6 + 0.006, dz * 1.8],
        ],
        5,
      ),
      [0.0055, 0.0048, 0.004, 0.0032, 0.0025],
      PAL.stringCheese,
      {},
      4,
    );
  return b.build();
}

// ── drinks ───────────────────────────────────────────────────────────────────

function juiceBox(): Geo {
  const b = inked();
  rbox(b, 0.07, 0.12, 0.046, 0.007, PAL.juiceOrange, { at: [0, 0.06, 0] });
  // Cream label panel with a big happy orange.
  rbox(b, 0.058, 0.07, 0.004, 0.008, PAL.paper, { at: [0, 0.056, 0.0225], ink: false });
  b.add(new THREE.CircleGeometry(0.02, 14), PAL.clementine, { at: [0, 0.052, 0.0252], ink: false });
  b.add(new THREE.CircleGeometry(0.0055, 8), PAL.paper, { at: [-0.008, 0.06, 0.0256], ink: false });
  b.extrude(leafPts(0.02, 0.011), 0.002, PAL.plantGreen, { at: [0.006, 0.069, 0.0255], rot: [0, 0, -0.7], ink: false });
  b.box(0.0705, 0.012, 0.0465, PAL.wrapperSun, { at: [0, 0.103, 0], ink: false });
  // Bendy straw.
  tube(b, smoothPath([[0.02, 0.112, 0.008], [0.02, 0.15, 0.008], [0.024, 0.162, 0.008], [0.036, 0.168, 0.008]], 8), 0.0035, PAL.wrapperBerry, {}, 5);
  b.add(new THREE.CircleGeometry(0.006, 8), PAL.stainless, { at: [0.02, 0.1202, 0.008], rot: [-Math.PI / 2, 0, 0], ink: false });
  return b.build();
}

function waterBottleFood(): Geo {
  const b = inked();
  b.lathe(
    [
      [0.001, 0],
      [0.026, 0],
      [0.03, 0.006],
      [0.03, 0.088],
      [0.026, 0.106],
      [0.015, 0.12],
      [0.0125, 0.13],
    ],
    12,
    PAL.waterBlue,
    { smooth: true },
  );
  b.cyl(0.0135, 0.0135, 0.02, 12, PAL.milkBlue, { at: [0, 0.139, 0], smooth: true });
  b.add(new THREE.CylinderGeometry(0.0312, 0.0312, 0.036, 12, 1, true), PAL.paper, { at: [0, 0.05, 0], ink: false });
  b.add(new THREE.CylinderGeometry(0.0314, 0.0314, 0.007, 12, 1, true), PAL.milkBlue, { at: [0, 0.036, 0], ink: false });
  b.extrude(dropPts(0.018), 0.002, PAL.milkBlue, { at: [0, 0.047, 0.0315], ink: false });
  // Sparkly highlight streak.
  b.box(0.004, 0.03, 0.002, PAL.paper, { at: [-0.018, 0.08, 0.024], rot: [0, -0.6, 0], ink: false });
  return b.build();
}

function milkCarton(): Geo {
  const b = inked();
  rbox(b, 0.066, 0.086, 0.066, 0.005, PAL.milk, { at: [0, 0.043, 0] });
  b.gable(0.066, 0.03, 0.066, PAL.milk, { at: [0, 0.101, 0] });
  b.box(0.006, 0.012, 0.064, PAL.milk, { at: [0, 0.121, 0] });
  b.box(0.0665, 0.03, 0.0665, PAL.milkBlue, { at: [0, 0.028, 0], ink: false });
  b.extrude(dropPts(0.022), 0.002, PAL.milkBlue, { at: [0, 0.052, 0.0335], ink: false });
  b.extrude(heartPts(0.014), 0.002, PAL.paper, { at: [0, 0.028, 0.0335], ink: false });
  return b.build();
}

// ── fruit ────────────────────────────────────────────────────────────────────

function appleSlices(): Geo {
  const b = inked();
  const R = 0.046;
  const a0 = Math.PI * 1.12;
  const a1 = Math.PI * 1.88;
  // Circular segment: chord on y = 0, arc below → in (x, z) the arc points toward +z.
  const seg: P2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = a0 + ((a1 - a0) * i) / 8;
    seg.push([Math.cos(a) * R, -(Math.sin(a) * R - Math.sin(a0) * R)]);
  }
  const flesh = scalePts(seg, 0.84, 0, 0.004);
  const n = 3;
  const gap = 0.024;
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI * 2 + 0.25;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const place = (pts: readonly P2[]): P2[] => pts.map(([x, z]) => [x * c + (z + gap) * sn, -x * sn + (z + gap) * c] as const);
    slab(b, place(seg), 0, 0.018, PAL.appleRed);
    slab(b, place(flesh), 0.001, 0.0185, PAL.appleFlesh, { ink: false });
    for (const sx of [-1, 1]) {
      const px = sx * 0.007;
      const pz = gap + 0.008;
      b.ball(0.0035, 0, PAL.bananaTip, { at: [px * c + pz * sn, 0.0195, -px * sn + pz * c], scale: [0.8, 0.3, 1.4], rot: [0, yaw, 0], ink: false });
    }
  }
  return b.build();
}

function grapes(): Geo {
  const b = inked();
  const r = 0.0165;
  const spots: [number, number, number][] = [
    [0, r, 0.034],
    [-0.017, r, 0.011],
    [0.017, r, 0.011],
    [-0.012, r, -0.015],
    [0.012, r, -0.015],
    [-0.008, r + 0.021, 0.0],
    [0.011, r + 0.021, 0.008],
  ];
  spots.forEach(([x, y, z], i) => b.sphere(r, 7, 4, shadeHex(PAL.grapePurple, i % 3 === 0 ? 1.08 : i % 3 === 1 ? 0.95 : 1), { at: [x, y, z], smooth: true }));
  tube(b, smoothPath([[0, 0.03, -0.018], [0.004, 0.036, -0.036], [0.012, 0.038, -0.046]], 4), 0.0032, PAL.bananaTip, {}, 4);
  leaf(b, 0.036, 0.024, [0.01, 0.037, -0.044], -1.1, 0.25);
  return b.build();
}

function banana(): Geo {
  const b = inked();
  const Rb = 0.11;
  const n = 12;
  const pts: [number, number, number][] = [];
  const rad: number[] = [];
  const t0 = Math.PI * 1.2;
  const t1 = Math.PI * 1.8;
  const zc = Rb * 0.78;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t0 + (t1 - t0) * t;
    const r = 0.025 * Math.pow(Math.sin(Math.PI * (0.06 + 0.88 * t)), 0.55);
    pts.push([Math.cos(a) * Rb, 0.025, Math.sin(a) * Rb + zc]);
    rad.push(Math.max(0.008, r));
  }
  b.add(sweepGeometry(pts, rad, 5), PAL.banana, { smooth: false });
  // Brown stem + tip.
  const p0 = pts[0]!;
  const p1 = pts[1]!;
  const dx = p0[0] - p1[0];
  const dz = p0[2] - p1[2];
  const dl = Math.hypot(dx, dz);
  tube(b, [p0, [p0[0] + (dx / dl) * 0.022, 0.028, p0[2] + (dz / dl) * 0.022]], [0.0065, 0.005], PAL.bananaTip, {}, 5);
  const pe = pts[n - 1]!;
  b.ball(0.0075, 0, PAL.bananaTip, { at: [pe[0], 0.025, pe[2]] });
  return b.build();
}

function clementine(): Geo {
  const b = inked();
  b.sphere(0.036, 12, 9, PAL.clementine, { at: [0, 0.032, 0], scale: [1, 0.88, 1], smooth: true });
  slab(b, starPts(0.009, 0.004, 5), 0.0625, 0.002, PAL.plantGreen, { ink: false });
  b.cyl(0.0025, 0.003, 0.008, 5, PAL.bananaTip, { at: [0, 0.067, 0] });
  leaf(b, 0.042, 0.022, [0.002, 0.066, 0.0], 0.5, 0.45);
  b.ball(0.006, 0, shadeHex(PAL.clementine, 1.12), { at: [-0.018, 0.05, 0.022], scale: [1, 0.6, 0.3], ink: false });
  return b.build();
}

// ── extra ────────────────────────────────────────────────────────────────────

function loveNote(): Geo {
  const b = inked();
  rbox(b, 0.08, 0.006, 0.056, 0.002, PAL.paper, { at: [0, 0.003, 0] });
  // Envelope flap (a soft triangle) + the heart seal.
  slab(
    b,
    roundPoly(
      [
        [-0.039, -0.027],
        [0.039, -0.027],
        [0, 0.008],
      ],
      0.004,
      1,
    ),
    0.006,
    0.0015,
    shadeHex(PAL.paper, 0.94),
    { ink: false },
  );
  slab(b, heartPts(0.024).map(([x, y]) => [x, -y + 0.004] as const), 0.0072, 0.0025, PAL.heart, { ink: false });
  b.ball(0.0025, 0, PAL.paper, { at: [-0.004, 0.0098, 0.0], scale: [1, 0.3, 1], ink: false });
  return b.build();
}

export const FOOD_BUILDERS: Readonly<Record<FoodKind, () => Geo>> = {
  sandwich,
  wrap,
  pastaCup,
  pbj,
  crackers,
  pretzels,
  granolaBar,
  cheeseStick,
  juiceBox,
  waterBottle: waterBottleFood,
  milkCarton,
  appleSlices,
  grapes,
  banana,
  clementine,
  loveNote,
};

export const FOOD_KINDS = Object.keys(FOOD_BUILDERS) as FoodKind[];
