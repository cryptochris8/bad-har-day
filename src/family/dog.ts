// ─────────────────────────────────────────────────────────────────────────────
// The family dog ("Biscuit" by default): a medium cartoon dog built as ONE
// skinned, inked mesh (coat from DOG_COATS: main / light / dark), floppy ears
// with secondary motion, a wagging 3-bone tail, tongue + jaw, big shiny eyes,
// red collar + gold tag. Poses, gaits (trot / gallop, stride tied to distance)
// and every DogAction are pure pose writers; update() is allocation-free.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Rng, hashString } from '../core/rng';
import { DOG_COATS, PAL, type DogCoat } from '../render/palette';
import { mixHex, shadeHex } from '../render/models/builder';
import { modelMaterial } from '../render/models/materials';
import { isShared } from '../render/models/shared';
import { shadowGeo, shadowMaterial } from './character';
import { EmoteSprite } from './emotes';
import { alignY, ringTube, sstep } from './geo';
import { clamp01, envelope, mix, smooth01, trk, wrapPi, type Track } from './pose';
import { SkinBuilder, acquireGeo, releaseGeo, type SkinW } from './skin';
import type { Dog, DogAction, DogLook, DogPose, DogSocket, Emote, PlayOpts } from './types';

// ── dimensions ────────────────────────────────────────────────────────────────

export const DOG = {
  bodyY: 0.36,
  /** Chest (front) and rump (rear) body centres along Z. */
  frontZ: 0.17,
  rearZ: -0.2,
  bodyW: 0.15,
  bodyH: 0.155,
  shoulderX: 0.092,
  hipX: 0.092,
  shoulderY: 0.33,
  hipY: 0.33,
  upperL: 0.135,
  lowerL: 0.135,
  pawY: 0.045,
  headR: 0.13,
  /** Head bone (skull centre) rest position (model). */
  headY: 0.6,
  headZ: 0.32,
  neckY: 0.43,
  neckZ: 0.23,
} as const;

/** Standing height to the top of the head (m). */
export const DOG_HEIGHT = DOG.headY + DOG.headR * 0.95;

// ── bones ─────────────────────────────────────────────────────────────────────

export const DB = {
  base: 0,
  torso: 1,
  rear: 2,
  front: 3,
  neck: 4,
  head: 5,
  jaw: 6,
  tongue: 7,
  earL: 8,
  earR: 9,
  eyeL: 10,
  eyeR: 11,
  lidL: 12,
  lidR: 13,
  closedL: 14,
  closedR: 15,
  happyL: 16,
  happyR: 17,
  browL: 18,
  browR: 19,
  tail0: 20,
  tail1: 21,
  tail2: 22,
  // legs: upper, lower, paw  (FL, FR, BL, BR)
  flU: 23,
  flL: 24,
  flP: 25,
  frU: 26,
  frL: 27,
  frP: 28,
  blU: 29,
  blL: 30,
  blP: 31,
  brU: 32,
  brL: 33,
  brP: 34,
  count: 35,
} as const;

/** Leg bone triples [upper, lower, paw] in order FL, FR, BL, BR. */
const LEGS: readonly [number, number, number][] = [
  [DB.flU, DB.flL, DB.flP],
  [DB.frU, DB.frL, DB.frP],
  [DB.blU, DB.blL, DB.blP],
  [DB.brU, DB.brL, DB.brP],
];

const EYE_X = 0.058;
const EYE_Y = 0.038;
const EYE_Z = 0.098;
const EYE_R = 0.036;

function buildDogBones(): { bones: THREE.Bone[]; rest: THREE.Matrix4[] } {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < DB.count; i++) bones.push(new THREE.Bone());
  for (const [k, v] of Object.entries(DB)) if (k !== 'count') bones[v]!.name = 'dog:' + k;
  const at = (i: number, parent: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const b = bones[i]!;
    b.position.set(x, y, z);
    b.rotation.set(rx, ry, rz);
    if (parent >= 0) bones[parent]!.add(b);
  };
  const D = DOG;
  at(DB.base, -1, 0, 0, 0);
  at(DB.torso, DB.base, 0, D.bodyY, 0);
  at(DB.rear, DB.torso, 0, 0, D.rearZ * 0.3);
  at(DB.front, DB.torso, 0, 0, D.frontZ * 0.3);
  at(DB.neck, DB.front, 0, D.neckY - D.bodyY, D.neckZ - D.frontZ * 0.3);
  at(DB.head, DB.neck, 0, D.headY - D.neckY, D.headZ - D.neckZ);
  at(DB.jaw, DB.head, 0, -0.045, 0.06);
  at(DB.tongue, DB.jaw, 0, 0.0, 0.07);
  for (const sd of [1, -1] as const) {
    at(sd > 0 ? DB.earL : DB.earR, DB.head, sd * 0.1, 0.07, -0.025, 0, 0, 0);
    const ex = sd * EYE_X;
    const yaw = sd * 0.42;
    at(sd > 0 ? DB.eyeL : DB.eyeR, DB.head, ex, EYE_Y, EYE_Z, 0, yaw, 0);
    at(sd > 0 ? DB.lidL : DB.lidR, sd > 0 ? DB.eyeL : DB.eyeR, 0, EYE_R * 1.02, 0);
    at(sd > 0 ? DB.closedL : DB.closedR, DB.head, ex, EYE_Y, EYE_Z, 0, yaw, 0);
    at(sd > 0 ? DB.happyL : DB.happyR, DB.head, ex, EYE_Y, EYE_Z, 0, yaw, 0);
    at(sd > 0 ? DB.browL : DB.browR, DB.head, sd * 0.06, EYE_Y + 0.055, EYE_Z - 0.012, 0, yaw * 0.8, 0);
  }
  at(DB.tail0, DB.rear, 0, 0.07, D.rearZ * 0.7 - 0.1);
  at(DB.tail1, DB.tail0, 0, 0.09, -0.02);
  at(DB.tail2, DB.tail1, 0, 0.09, -0.005);
  const legRoot = (i: number, parent: number, x: number, y: number, z: number) => {
    const [u, l, p] = LEGS[i]!;
    at(u, parent, x, y, z);
    at(l, u, 0, -D.upperL, 0);
    at(p, l, 0, -D.lowerL, 0);
  };
  const fz = D.frontZ - D.frontZ * 0.3;
  const rz = D.rearZ - D.rearZ * 0.3;
  legRoot(0, DB.front, D.shoulderX, D.shoulderY - D.bodyY, fz);
  legRoot(1, DB.front, -D.shoulderX, D.shoulderY - D.bodyY, fz);
  legRoot(2, DB.rear, D.hipX, D.hipY - D.bodyY, rz);
  legRoot(3, DB.rear, -D.hipX, D.hipY - D.bodyY, rz);
  bones[DB.base]!.updateMatrixWorld(true);
  return { bones, rest: bones.map((b) => b.matrixWorld.clone()) };
}

// ── geometry ──────────────────────────────────────────────────────────────────

function dogGeometry(coat: DogCoat, rest: THREE.Matrix4[]): THREE.BufferGeometry {
  const c = DOG_COATS[coat] ?? DOG_COATS.golden;
  const main = c.main;
  const light = c.light;
  const dark = c.dark;
  const spotted = coat === 'spotted';
  const earCol = spotted ? c.dark : dark;
  const D = DOG;
  const sb = new SkinBuilder(rest);
  const restY = (i: number) => new THREE.Vector3().setFromMatrixPosition(rest[i]!);
  const rearZ = restY(DB.rear).z;
  const frontZ = restY(DB.front).z;

  // Torso: blended rear → front along Z (a soft bean).
  const torsoW = (x: number, y: number, z: number, o: SkinW) => {
    const t = sstep(rearZ - 0.02, frontZ + 0.02, z);
    o.i[0] = DB.rear;
    o.w[0] = 1 - t;
    o.i[1] = DB.front;
    o.w[1] = t;
    o.i[2] = o.i[3] = 0;
    o.w[2] = o.w[3] = 0;
    void x;
    void y;
  };
  const tb = sb.blend(DB.base, torsoW);
  // Torso lathe along Z: rings in XY (use ringTube along Y then rotate to Z).
  const rings = [
    { y: -0.3, w: 0.03, d: 0.035 },
    { y: -0.27, w: 0.1, d: 0.11 },
    { y: -0.2, w: D.bodyW, d: D.bodyH * 0.98 },
    { y: -0.05, w: D.bodyW * 0.93, d: D.bodyH * 0.9 },
    { y: 0.1, w: D.bodyW * 0.98, d: D.bodyH * 0.98 },
    { y: 0.2, w: D.bodyW * 0.95, d: D.bodyH * 1.0 },
    { y: 0.27, w: 0.1, d: 0.12 },
    { y: 0.3, w: 0.04, d: 0.05 },
  ];
  tb.add(ringTube(rings, 12, { closeBottom: true, closeTop: true }), main, { at: [0, D.bodyY + 0.01, -0.02], rot: [Math.PI / 2, 0, 0], smooth: true });
  // Light chest bib + belly.
  tb.sphere(1, 8, 5, light, { at: [0, D.bodyY - 0.03, 0.17], scale: [0.1, 0.12, 0.08], smooth: true, ink: false });
  tb.sphere(1, 8, 4, light, { at: [0, D.bodyY - 0.085, 0.0], scale: [0.095, 0.05, 0.21], smooth: true, ink: false });
  if (spotted) {
    tb.sphere(1, 8, 5, dark, { at: [0.07, D.bodyY + 0.08, -0.08], scale: [0.07, 0.06, 0.09], smooth: true, ink: false });
    tb.sphere(1, 8, 5, dark, { at: [-0.06, D.bodyY + 0.06, 0.08], scale: [0.07, 0.07, 0.07], smooth: true, ink: false });
  }

  // Neck (blended front → head) + collar.
  const hp = restY(DB.head);
  const np = restY(DB.neck);
  const neckW = (x: number, y: number, z: number, o: SkinW) => {
    const t = sstep(np.y - 0.02, hp.y - 0.02, y);
    o.i[0] = DB.front;
    o.w[0] = 1 - t;
    o.i[1] = DB.neck;
    o.w[1] = t;
    o.i[2] = o.i[3] = 0;
    o.w[2] = o.w[3] = 0;
    void x;
    void z;
  };
  const nb = sb.blend(DB.base, neckW);
  const dir = new THREE.Vector3(0, hp.y - np.y + 0.06, hp.z - np.z).normalize();
  const nlen = hp.distanceTo(np) + 0.06;
  nb.cyl(0.07, 0.095, nlen, 9, main, { at: [0, (np.y + hp.y) / 2 - 0.04, (np.z + hp.z) / 2 - 0.02], rot: alignY(dir), smooth: true });
  const collar = sb.on(DB.neck);
  collar.torus(0.083, 0.017, 4, 12, PAL.dogCollar, { at: [0, 0.04, 0.02], rot: [Math.PI / 2 - 0.75, 0, 0], smooth: true });
  collar.cyl(0.024, 0.024, 0.008, 8, PAL.goldTrim, { at: [0, -0.01, 0.1], rot: [Math.PI / 2 - 0.3, 0, 0], glow: 0 });
  collar.torus(0.008, 0.003, 3, 8, PAL.goldTrim, { at: [0, 0.015, 0.098], rot: [0.3, 0, 0], ink: false });

  // Head.
  const hb = sb.on(DB.head);
  const R = D.headR;
  hb.sphere(1, 14, 10, main, { scale: [R * 1.04, R * 0.94, R * 0.98], smooth: true });
  hb.sphere(1, 8, 5, main, { at: [0, -0.025, 0.035], scale: [R * 0.85, R * 0.72, R * 0.8], smooth: true, ink: false });
  // Upper muzzle + nose + mouth line.
  hb.sphere(1, 10, 6, light, { at: [0, -0.028, 0.118], scale: [0.068, 0.05, 0.07], smooth: true });
  hb.sphere(1, 8, 5, PAL.dogNose, { at: [0, -0.01, 0.18], scale: [0.025, 0.018, 0.017], smooth: true, ink: false });
  hb.sphere(0.006, 5, 3, 0xffffff, { at: [-0.007, -0.002, 0.194], scale: [1.2, 0.7, 0.5], ink: false, glow: 0xffffff });
  hb.cyl(0.0035, 0.0035, 0.03, 5, PAL.eyeInk, { at: [0, -0.042, 0.176], rot: [0.3, 0, 0], ink: false });
  // Mouth interior (seen when the jaw opens).
  hb.sphere(1, 8, 4, PAL.mouthDark, { at: [0, -0.055, 0.1], scale: [0.05, 0.022, 0.07], smooth: true, ink: false });
  // Cheek fluff + forehead light patch.
  for (const sd of [-1, 1]) hb.sphere(1, 6, 4, light, { at: [sd * 0.05, -0.04, 0.09], scale: [0.04, 0.035, 0.04], smooth: true, ink: false });
  if (spotted) hb.sphere(1, 6, 4, dark, { at: [0.06, 0.07, 0.06], scale: [0.05, 0.045, 0.045], smooth: true, ink: false });
  // Jaw (lower muzzle).
  const jb = sb.on(DB.jaw);
  jb.sphere(1, 8, 5, light, { at: [0, -0.012, 0.055], scale: [0.058, 0.028, 0.062], smooth: true });
  jb.sphere(1, 6, 3, PAL.mouthDark, { at: [0, 0.006, 0.05], scale: [0.045, 0.012, 0.05], smooth: true, ink: false });
  // Tongue.
  const tg = sb.on(DB.tongue);
  tg.sphere(1, 7, 4, PAL.tongue, { at: [0, -0.02, 0.02], scale: [0.03, 0.012, 0.05], rot: [0.7, 0, 0], smooth: true });
  tg.cyl(0.002, 0.002, 0.04, 4, shadeHex(PAL.tongue, 0.8), { at: [0, -0.012, 0.03], rot: [Math.PI / 2 + 0.7, 0, 0], ink: false });

  // Eyes: big glossy dark eyes, lids, closed / happy variants, brows.
  for (const sd of [1, -1] as const) {
    const eb = sb.on(sd > 0 ? DB.eyeL : DB.eyeR);
    eb.sphere(EYE_R, 10, 6, mixHex(PAL.eyeInk, 0x6b4a2b, 0.25), { scale: [1, 1.08, 0.62], smooth: true });
    eb.sphere(EYE_R * 0.62, 8, 4, PAL.eyeInk, { at: [0, -EYE_R * 0.06, EYE_R * 0.28], scale: [1, 1.05, 0.5], smooth: true, ink: false });
    eb.sphere(EYE_R * 0.34, 6, 3, 0xffffff, { at: [-EYE_R * 0.3, EYE_R * 0.34, EYE_R * 0.52], scale: [1, 1.1, 0.4], ink: false, glow: 0xffffff });
    eb.sphere(EYE_R * 0.14, 5, 2, 0xffffff, { at: [EYE_R * 0.3, -EYE_R * 0.3, EYE_R * 0.54], scale: [1, 1, 0.4], ink: false, glow: 0xffffff });
    const lid = sb.on(sd > 0 ? DB.lidL : DB.lidR, false);
    const H = EYE_R * 2.1;
    lid.add(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI, 0, Math.PI / 2), main, { at: [0, -H, 0], scale: [EYE_R * 1.12, H, EYE_R * 0.8], smooth: true });
    lid.torus(1, 0.1, 3, 9, PAL.eyeInk, { at: [0, -H, 0], rot: [Math.PI / 2, 0, 0], scale: [EYE_R * 1.13, EYE_R * 0.81, EYE_R * 0.5] }, Math.PI);
    const cl = sb.on(sd > 0 ? DB.closedL : DB.closedR, false);
    cl.torus(EYE_R * 0.62, EYE_R * 0.16, 3, 8, PAL.eyeInk, { at: [0, EYE_R * 0.1, EYE_R * 0.35], rot: [0, 0, Math.PI], scale: [1, 0.7, 0.6] }, Math.PI);
    const hpE = sb.on(sd > 0 ? DB.happyL : DB.happyR, false);
    hpE.torus(EYE_R * 0.62, EYE_R * 0.17, 3, 8, PAL.eyeInk, { at: [0, -EYE_R * 0.2, EYE_R * 0.35], scale: [1, 1, 0.6] }, Math.PI);
    const br = sb.on(sd > 0 ? DB.browL : DB.browR, false);
    br.sphere(1, 6, 3, spotted ? PAL.eyeInk : shadeHex(dark, 0.9), { scale: [0.022, 0.009, 0.01], rot: [0, 0, sd * -0.25], smooth: true });
  }

  // Floppy ears (rigid on the ear bones), hanging down.
  for (const sd of [1, -1] as const) {
    const e = sb.on(sd > 0 ? DB.earL : DB.earR);
    e.sphere(1, 8, 6, earCol, { at: [sd * 0.018, -0.07, 0.0], rot: [0.08, 0, sd * 0.12], scale: [0.03, 0.085, 0.058], smooth: true });
    e.sphere(1, 6, 3, shadeHex(earCol, 0.85), { at: [sd * 0.008, -0.03, 0.005], scale: [0.025, 0.035, 0.04], smooth: true, ink: false });
  }

  // Tail (blended chain), curving up, light tip.
  const t0 = restY(DB.tail0);
  const t1 = restY(DB.tail1);
  const t2 = restY(DB.tail2);
  const tailW = (x: number, y: number, z: number, o: SkinW) => {
    const a = sstep(t0.y + 0.02, t1.y, y);
    const b = sstep(t1.y + 0.02, t2.y, y);
    o.i[0] = DB.tail0;
    o.w[0] = 1 - a;
    o.i[1] = DB.tail1;
    o.w[1] = a - b;
    o.i[2] = DB.tail2;
    o.w[2] = b;
    o.i[3] = 0;
    o.w[3] = 0;
    void x;
    void z;
  };
  const tl = sb.blend(DB.base, tailW);
  const tailPts = [t0.clone().add(new THREE.Vector3(0, -0.03, 0.02)), t0, t1, t2, t2.clone().add(new THREE.Vector3(0, 0.07, 0.01))];
  const curve = new THREE.CatmullRomCurve3(tailPts);
  const tube = new THREE.TubeGeometry(curve, 8, 0.028, 6, false);
  // Taper the tube toward the tip.
  const pos = tube.getAttribute('position') as THREE.BufferAttribute;
  const segs = 9;
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / 7);
    const t = ring / (segs - 1);
    const p = curve.getPointAt(Math.min(1, t));
    const k = 1 - 0.55 * t;
    pos.setXYZ(i, p.x + (pos.getX(i) - p.x) * k, p.y + (pos.getY(i) - p.y) * k, p.z + (pos.getZ(i) - p.z) * k);
  }
  tube.computeVertexNormals();
  tl.add(tube, main, { smooth: true });
  tl.sphere(0.02, 6, 4, light, { at: [tailPts[4]!.x, tailPts[4]!.y, tailPts[4]!.z], scale: [1, 1.3, 1], smooth: true });

  // Legs: blended upper/lower tubes + rigid light paws.
  for (let li = 0; li < 4; li++) {
    const [u, l, p] = LEGS[li]!;
    const up = restY(u);
    const lo = restY(l);
    const front = li < 2;
    const legW = (x: number, y: number, z: number, o: SkinW) => {
      const t = sstep(lo.y + 0.03, lo.y - 0.03, y);
      const top = sstep(up.y - 0.02, up.y + 0.06, y) * 0.6;
      o.i[0] = u;
      o.w[0] = (1 - t) * (1 - top);
      o.i[1] = l;
      o.w[1] = t * (1 - top);
      o.i[2] = front ? DB.front : DB.rear;
      o.w[2] = top;
      o.i[3] = 0;
      o.w[3] = 0;
      void x;
      void z;
    };
    const lb = sb.blend(DB.base, legW);
    const r0 = front ? 0.05 : 0.058;
    const leg = [
      { y: up.y - D.upperL - D.lowerL + 0.01, w: 0.036, d: 0.038, x: up.x, z: up.z },
      { y: lo.y - 0.04, w: 0.039, d: 0.04, x: up.x, z: up.z },
      { y: lo.y, w: 0.042, d: 0.044, x: up.x, z: up.z - (front ? 0 : 0.01) },
      { y: lo.y + 0.05, w: r0 * 0.95, d: r0, x: up.x, z: up.z },
      { y: up.y, w: r0 * 1.15, d: r0 * 1.2, x: up.x, z: up.z },
      { y: up.y + 0.07, w: r0 * 1.2, d: r0 * 1.3, x: up.x * 0.9, z: up.z },
    ];
    lb.add(ringTube(leg, 7), main, { smooth: true });
    const pb = sb.on(p);
    pb.sphere(1, 7, 4, light, { at: [0, -D.pawY + 0.02, 0.02], scale: [0.042, 0.026, 0.052], smooth: true });
  }
  return sb.build();
}

// ── pose channels ─────────────────────────────────────────────────────────────

const CH = [
  'bx', 'by', 'bz', 'btx', 'bty', 'btz', 'sq',
  'rx', 'ry', 'rz', 'fx', 'fy', 'fz',
  'nx', 'ny', 'hx', 'hy', 'hz', 'jaw', 'tongue',
  'eLx', 'eLz', 'eRx', 'eRz', 'brow',
  't0x', 't0y', 't1y', 't2y', 'wag',
  'aFLx', 'kFL', 'pFL', 'aFRx', 'kFR', 'pFR', 'aBLx', 'kBL', 'pBL', 'aBRx', 'kBR', 'pBR',
  'oBL', 'oBR', 'oFL', 'oFR',
  'eyes', 'lid', 'tz',
] as const;
type DCh = (typeof CH)[number];
export const DC = Object.fromEntries(CH.map((c, i) => [c, i])) as { readonly [K in DCh]: number };
const DN = CH.length;
const DDEF = new Float64Array(DN);
DDEF[DC.sq] = 1;
DDEF[DC.t0x] = -0.35;
DDEF[DC.wag] = 1;

export class DogPoseData {
  readonly v = new Float64Array(DN);
  constructor() {
    this.v.set(DDEF);
  }
}
const dreset = (p: DogPoseData) => p.v.set(DDEF);
const dcopy = (o: DogPoseData, a: DogPoseData) => o.v.set(a.v);
function dblend(o: DogPoseData, a: DogPoseData, b: DogPoseData, t: number): void {
  for (let i = 0; i < DN; i++) {
    const d = i === DC.by || i === DC.tz ? wrapPi(b.v[i]! - a.v[i]!) : b.v[i]! - a.v[i]!;
    o.v[i] = a.v[i]! + d * t;
  }
}
const dset = (p: DogPoseData, i: number, v: number) => {
  p.v[i] = v;
};
const dadd = (p: DogPoseData, i: number, v: number) => {
  p.v[i] = p.v[i]! + v;
};
const dmt = (p: DogPoseData, i: number, v: number, w: number) => {
  p.v[i] = p.v[i]! + (v - p.v[i]!) * w;
};

export type DogMood = 'excited' | 'calm' | 'sleepy';

interface DogDrive {
  t: number;
  phase: number;
  speed: number;
  move: number;
  /** 0 trot … 1 gallop. */
  gait: number;
  pose: DogPose;
  mood: DogMood;
  /** Mood blend: excitement 0..1, sleepiness 0..1. */
  ex: number;
  sl: number;
}

// ── gait ──────────────────────────────────────────────────────────────────────

export function dogGaitOf(speed: number): number {
  return smooth01((speed - 1.9) / 1.0);
}

/** Stride (m per half cycle): trot ≈ 0.3 m, gallop ≈ 0.62 m. */
export function dogStride(gait: number): number {
  return mix(0.3, 0.62, gait);
}

// ── durations ─────────────────────────────────────────────────────────────────

export const DOG_ACTION_DURATION: Readonly<Record<DogAction, number>> = {
  bark: 0.95,
  wag: 1.5,
  sniff: 2.2,
  pee: 3.4,
  stare: 2.6,
  zoomies: 1.8,
  jump: 0.8,
  shake: 1.1,
  tilt: 1.3,
  pounce: 1.4,
  roll: 2.0,
  scratch: 1.9,
  beg: 2.2,
  yawn: 1.7,
  stretch: 2.1,
  dig: 1.7,
};

export const DOG_ACTIONS = Object.keys(DOG_ACTION_DURATION) as DogAction[];

export const DOG_LOOP: Readonly<Partial<Record<DogAction, readonly [number, number]>>> = {
  bark: [0.05, 0.95],
  wag: [0.1, 0.9],
  sniff: [0.2, 0.8],
  stare: [0.25, 0.75],
  zoomies: [0, 1],
  scratch: [0.25, 0.75],
  beg: [0.3, 0.7],
  dig: [0.2, 0.8],
  tilt: [0.3, 0.7],
};

export function dogActionProgress(a: DogAction, t: number, dur: number, loop: boolean): number {
  const u = Math.max(0, t) / Math.max(1e-3, dur);
  if (!loop) return Math.min(1, u);
  const r = DOG_LOOP[a] ?? [0, 1];
  if (u < r[1]) return u;
  return r[0] + ((u - r[1]) % Math.max(1e-3, r[1] - r[0]));
}

// ── base poses ────────────────────────────────────────────────────────────────

function legSet(p: DogPoseData, leg: number, x: number, k: number, a: number): void {
  const b = DC.aFLx + leg * 3;
  dset(p, b, x);
  dset(p, b + 1, k);
  dset(p, b + 2, a);
}

function legMix(p: DogPoseData, leg: number, x: number, k: number, a: number, w: number): void {
  const b = DC.aFLx + leg * 3;
  dmt(p, b, x, w);
  dmt(p, b + 1, k, w);
  dmt(p, b + 2, a, w);
}

export function dogBasePose(p: DogPoseData, d: DogDrive): void {
  dreset(p);
  const t = d.t;
  const pant = d.ex;
  const br = Math.sin(t * (2 + pant * 8));
  dset(p, DC.fx, 0.006 * br);
  dset(p, DC.jaw, 0.22 * pant + 0.05 * pant * br);
  dset(p, DC.tongue, pant);
  dset(p, DC.wag, mix(0.55, 1.6, d.ex) * (1 - d.sl * 0.7));
  dset(p, DC.lid, 0.45 * d.sl);
  dset(p, DC.hx, 0.06 * d.sl);
  switch (d.pose) {
    case 'stand':
      dset(p, DC.hx, get(p, DC.hx) - 0.08);
      break;
    case 'sit': {
      // Rump down, chest up: tilt the body, front legs straight, hind legs folded.
      dset(p, DC.bx, -0.55);
      dset(p, DC.bty, -0.1);
      dset(p, DC.btz, -0.04);
      legSet(p, 0, 0.55, 0.0, -0.02);
      legSet(p, 1, 0.55, 0.0, -0.02);
      legSet(p, 2, -0.95, 1.9, -0.4);
      legSet(p, 3, -0.95, 1.9, -0.4);
      dset(p, DC.oBL, 0.12);
      dset(p, DC.oBR, 0.12);
      dset(p, DC.nx, 0.25);
      dset(p, DC.hx, get(p, DC.hx) + 0.18);
      dset(p, DC.t0x, 0.9);
      break;
    }
    case 'lie':
    case 'sleep': {
      const sleep = d.pose === 'sleep';
      dset(p, DC.bty, -0.235);
      legSet(p, 0, -1.35, -0.1, 0.35);
      legSet(p, 1, -1.35, -0.1, 0.35);
      legSet(p, 2, -1.25, 2.35, -0.9);
      legSet(p, 3, -1.25, 2.35, -0.9);
      dset(p, DC.oBL, 0.25);
      dset(p, DC.oBR, 0.25);
      if (sleep) {
        dset(p, DC.nx, 0.55);
        dset(p, DC.hx, 0.35);
        dset(p, DC.hz, 0.15);
        dset(p, DC.eyes, 1);
        dset(p, DC.jaw, 0);
        dset(p, DC.tongue, 0);
        dset(p, DC.t0x, 0.9);
        dset(p, DC.t0y, 0.9);
        dset(p, DC.wag, 0.05);
        dset(p, DC.fx, 0.01 * Math.sin(t * 1.3));
      } else {
        dset(p, DC.nx, 0.05);
        dset(p, DC.hx, get(p, DC.hx) - 0.05);
        dset(p, DC.t0x, 0.8);
        dset(p, DC.t0y, 0.3);
      }
      break;
    }
    case 'curl': {
      dset(p, DC.bty, -0.25);
      dset(p, DC.bz, 0.25);
      dset(p, DC.ry, -0.55);
      dset(p, DC.fy, 0.55);
      legSet(p, 0, -1.2, 1.6, 0.4);
      legSet(p, 1, -1.2, 1.6, 0.4);
      legSet(p, 2, -1.35, 2.4, -0.9);
      legSet(p, 3, -1.35, 2.4, -0.9);
      dset(p, DC.nx, 0.45);
      dset(p, DC.ny, 0.7);
      dset(p, DC.hx, 0.35);
      dset(p, DC.hy, 0.4);
      dset(p, DC.hz, 0.3);
      dset(p, DC.eyes, 1);
      dset(p, DC.jaw, 0);
      dset(p, DC.tongue, 0);
      dset(p, DC.t0x, 1.1);
      dset(p, DC.t0y, 1.3);
      dset(p, DC.t1y, 0.6);
      dset(p, DC.wag, 0.03);
      dset(p, DC.fx, 0.012 * Math.sin(t * 1.2));
      break;
    }
  }
  if (d.move > 0.001 && d.pose === 'stand') dogGait(p, d);
}

function get(p: DogPoseData, i: number): number {
  return p.v[i]!;
}

function dogGait(p: DogPoseData, d: DogDrive): void {
  const w = d.move;
  const g = d.gait;
  const ph = d.phase;
  const A = mix(0.42, 0.75, g);
  const K = mix(0.8, 1.1, g);
  for (let leg = 0; leg < 4; leg++) {
    // Trot: diagonal pairs (FL+BR, FR+BL). Gallop: fronts together, rears together, rears lead.
    const trotOff = leg === 0 || leg === 3 ? 0 : Math.PI;
    const galOff = leg < 2 ? (leg === 0 ? 0 : 0.35) : leg === 2 ? Math.PI * 0.9 : Math.PI * 1.1;
    const f = ph + mix(trotOff, galOff, g);
    const s1 = Math.sin(f);
    const lift = Math.max(0, Math.cos(f + 0.3));
    const front = leg < 2;
    const x = -A * s1;
    const k = K * Math.pow(lift, 1.4) * (front ? -1 : 1);
    legMix(p, leg, x, k, -x * 0.5 - k * 0.6, w);
  }
  const bob = mix(0.012, 0.035, g);
  dadd(p, DC.bty, w * bob * Math.abs(Math.sin(ph * (g > 0.5 ? 1 : 2))));
  dadd(p, DC.bx, w * g * 0.1 * Math.sin(ph));
  dadd(p, DC.hx, w * 0.05 * Math.sin(ph * 2));
  dadd(p, DC.nx, -w * 0.08 * g);
  dset(p, DC.jaw, mix(get(p, DC.jaw), 0.28, w * g));
  dset(p, DC.tongue, mix(get(p, DC.tongue), 1, w * g));
  dadd(p, DC.t0x, -0.2 * w);
}

// ── actions ───────────────────────────────────────────────────────────────────

interface DogCtx {
  at: number;
  /** Local yaw that turns the dog's back to the dollhouse camera (faces world −Z). */
  backYaw: number;
  looping: boolean;
}

const JUMP: Track = [0, 0, 0.25, 0, 0.45, 1, 0.65, 0.6, 0.8, 0, 1, 0];
const POUNCE_Y: Track = [0, 0, 0.55, 0, 0.72, 1, 0.88, 0, 1, 0];
const ZOOM_YAW: Track = [0, 0, 0.1, 0.3, 0.9, Math.PI * 4 - 0.3, 1, Math.PI * 4];
const ROLL_Z: Track = [0, 0, 0.15, 0, 0.45, Math.PI, 0.55, Math.PI, 0.85, Math.PI * 2, 1, Math.PI * 2];

export function dogActionPose(p: DogPoseData, a: DogAction, u: number, c: DogCtx): void {
  const at = c.at;
  switch (a) {
    case 'bark': {
      const w = envelope(u, 0.06, 0.1);
      const k = Math.max(0, Math.sin(at * 3.3 * Math.PI * 2 / 1.0));
      dmt(p, DC.jaw, 0.55 * k, w);
      dmt(p, DC.tongue, 0.4 * k, w);
      dadd(p, DC.hx, -0.18 * k * w);
      dadd(p, DC.nx, -0.08 * k * w);
      dadd(p, DC.bty, 0.012 * k * w);
      dmt(p, DC.eLx, -0.35 * k, w);
      dmt(p, DC.eRx, -0.35 * k, w);
      dmt(p, DC.wag, 1.4, w);
      break;
    }
    case 'wag': {
      const w = envelope(u, 0.08, 0.15);
      dmt(p, DC.wag, 2.4, w);
      dadd(p, DC.ry, 0.12 * Math.sin(at * 18) * w);
      dmt(p, DC.jaw, 0.3, w);
      dmt(p, DC.tongue, 1, w);
      dmt(p, DC.eyes, 2, w > 0.5 ? 1 : 0);
      break;
    }
    case 'sniff': {
      const w = envelope(u, 0.15, 0.2);
      dmt(p, DC.nx, 0.75, w);
      dmt(p, DC.hx, 0.45, w);
      dmt(p, DC.fx, 0.15, w);
      dadd(p, DC.hy, 0.35 * Math.sin(at * 2.2) * w);
      dadd(p, DC.hx, 0.03 * Math.sin(at * 22) * w);
      legMix(p, 0, 0.25, -0.35, 0.1, w);
      legMix(p, 1, 0.25, -0.35, 0.1, w);
      break;
    }
    case 'pee': {
      // Discreet: turns its back to the camera, lifts a hind leg briefly (no liquid, ever), turns back.
      const turn = smooth01(u / 0.18) * (1 - smooth01((u - 0.8) / 0.18));
      dset(p, DC.by, get(p, DC.by) + c.backYaw * turn);
      const lift = smooth01((u - 0.3) / 0.1) * (1 - smooth01((u - 0.62) / 0.1));
      legMix(p, 2, -0.35, 1.0, -0.2, lift);
      dmt(p, DC.oBL, 1.05, lift);
      dmt(p, DC.bz, -0.1, lift);
      dmt(p, DC.hx, -0.1, lift);
      dmt(p, DC.wag, 0.2, lift);
      break;
    }
    case 'stare': {
      const w = envelope(u, 0.1, 0.15);
      dmt(p, DC.wag, 0, w);
      dmt(p, DC.t0x, -0.6, w);
      dmt(p, DC.eLx, -0.9, w);
      dmt(p, DC.eRx, -0.9, w);
      dmt(p, DC.eLz, 0.25, w);
      dmt(p, DC.eRz, 0.25, w);
      dmt(p, DC.hx, -0.18, w);
      dmt(p, DC.nx, -0.1, w);
      dmt(p, DC.jaw, 0, w);
      dmt(p, DC.tongue, 0, w);
      dmt(p, DC.lid, 0, w);
      dmt(p, DC.brow, 0.6, w);
      dmt(p, DC.fx, 0, w);
      break;
    }
    case 'zoomies': {
      const w = c.looping ? 1 : envelope(u, 0.05, 0.08);
      dset(p, DC.by, get(p, DC.by) + (c.looping ? (at / 1.8) * Math.PI * 4 : trk(u, ZOOM_YAW)));
      const b = Math.abs(Math.sin(at * 12));
      dadd(p, DC.bty, 0.05 * b * w);
      dmt(p, DC.bz, -0.25, w);
      for (let leg = 0; leg < 4; leg++) legMix(p, leg, 0.5 * Math.sin(at * 24 + leg * 1.6), 0.4 * b, 0, w);
      dmt(p, DC.jaw, 0.4, w);
      dmt(p, DC.tongue, 1, w);
      dmt(p, DC.wag, 2.5, w);
      dmt(p, DC.eLx, 0.5, w);
      dmt(p, DC.eRx, 0.5, w);
      break;
    }
    case 'jump': {
      const w = envelope(u, 0.05, 0.1);
      const h = trk(u, JUMP);
      dadd(p, DC.bty, 0.22 * h);
      dmt(p, DC.bx, -0.55 * h, w);
      legMix(p, 0, -0.9 * h, -0.9 * h, 0.3, w);
      legMix(p, 1, -0.9 * h, -0.9 * h, 0.3, w);
      dmt(p, DC.eyes, 2, h > 0.3 ? 1 : 0);
      dmt(p, DC.jaw, 0.35, w);
      dmt(p, DC.tongue, 1, w);
      dmt(p, DC.wag, 2.2, w);
      dmt(p, DC.eLx, 0.6 * h, w);
      dmt(p, DC.eRx, 0.6 * h, w);
      break;
    }
    case 'shake': {
      const w = envelope(u, 0.08, 0.2);
      const k = Math.sin(at * 34);
      dadd(p, DC.bz, 0.22 * k * w);
      dadd(p, DC.hz, 0.4 * k * w);
      dadd(p, DC.fy, 0.12 * k * w);
      dmt(p, DC.eLz, -1.0 * k, w);
      dmt(p, DC.eRz, 1.0 * k, w);
      dmt(p, DC.eyes, 1, w > 0.5 ? 1 : 0);
      break;
    }
    case 'tilt': {
      const w = envelope(u, 0.15, 0.2);
      dmt(p, DC.hz, 0.45, w);
      dmt(p, DC.eLx, -0.7, w);
      dmt(p, DC.brow, 0.8, w);
      dmt(p, DC.jaw, 0, w);
      dmt(p, DC.tongue, 0, w);
      dmt(p, DC.wag, 0.3, w);
      break;
    }
    case 'pounce': {
      const w = envelope(u, 0.1, 0.12);
      const bow = smooth01(u / 0.15) * (1 - smooth01((u - 0.5) / 0.08));
      dmt(p, DC.bx, 0.35, bow * w);
      dadd(p, DC.bty, -0.07 * bow * w);
      legMix(p, 0, -1.0, 0.2, 0.9, bow * w);
      legMix(p, 1, -1.0, 0.2, 0.9, bow * w);
      dadd(p, DC.ry, 0.1 * Math.sin(at * 14) * bow * w);
      dmt(p, DC.wag, 2.5, bow * w);
      const h = trk(u, POUNCE_Y);
      dadd(p, DC.bty, 0.16 * h);
      dadd(p, DC.btz, 0.12 * h);
      legMix(p, 0, -1.0 * h, -0.6 * h, 0.2, h);
      legMix(p, 1, -1.0 * h, -0.6 * h, 0.2, h);
      dmt(p, DC.jaw, 0.3, w);
      dmt(p, DC.tongue, 1, w);
      break;
    }
    case 'roll': {
      const w = envelope(u, 0.1, 0.1);
      const down = smooth01(u / 0.15) * (1 - smooth01((u - 0.85) / 0.15));
      dmt(p, DC.bty, -0.19, down);
      // Roll about the body's long axis through its centre (not the feet).
      dset(p, DC.tz, get(p, DC.tz) + trk(u, ROLL_Z));
      for (let leg = 0; leg < 4; leg++) legMix(p, leg, -0.6, 1.2 * (leg < 2 ? -1 : 1), 0.3, down);
      dmt(p, DC.jaw, 0.4, w);
      dmt(p, DC.tongue, 1, w);
      dmt(p, DC.eyes, 2, w > 0.5 ? 1 : 0);
      break;
    }
    case 'scratch': {
      const w = envelope(u, 0.15, 0.15);
      // Sit, hind leg scratches behind the ear.
      dmt(p, DC.bx, -0.55, w);
      dmt(p, DC.bty, -0.1, w);
      legMix(p, 0, 0.55, 0, 0, w);
      legMix(p, 1, 0.55, 0, 0, w);
      legMix(p, 3, -0.95, 1.9, -0.4, w);
      const k = Math.sin(at * 26);
      legMix(p, 2, -1.7 + 0.25 * k, 1.3, 0.2, w);
      dmt(p, DC.oBL, 0.5, w);
      dmt(p, DC.hz, -0.45, w);
      dmt(p, DC.hy, 0.35, w);
      dmt(p, DC.eyes, 2, w > 0.5 ? 1 : 0);
      dmt(p, DC.t0x, 0.9, w);
      break;
    }
    case 'beg': {
      const w = envelope(u, 0.2, 0.2);
      dmt(p, DC.bx, -1.05, w);
      dmt(p, DC.bty, -0.12, w);
      legMix(p, 2, -0.9, 1.9, -0.6, w);
      legMix(p, 3, -0.9, 1.9, -0.6, w);
      const k = Math.sin(at * 6) * 0.15;
      legMix(p, 0, 1.25 + k, -1.6, 0.4, w);
      legMix(p, 1, 1.25 - k, -1.6, 0.4, w);
      dmt(p, DC.nx, 0.5, w);
      dmt(p, DC.hx, 0.45, w);
      dmt(p, DC.jaw, 0.2, w);
      dmt(p, DC.tongue, 1, w);
      dmt(p, DC.wag, 1.8, w);
      dmt(p, DC.brow, 0.5, w);
      break;
    }
    case 'yawn': {
      const w = envelope(u, 0.2, 0.25);
      dmt(p, DC.jaw, 0.95, w);
      dmt(p, DC.tongue, 0.7, w);
      dmt(p, DC.hx, -0.35, w);
      dmt(p, DC.eyes, 1, w > 0.4 ? 1 : 0);
      dmt(p, DC.eLx, 0.3, w);
      dmt(p, DC.eRx, 0.3, w);
      break;
    }
    case 'stretch': {
      const w = envelope(u, 0.15, 0.2);
      const front = 1 - smooth01((u - 0.5) / 0.15);
      dmt(p, DC.bx, 0.35 * front - 0.12 * (1 - front), w);
      dadd(p, DC.bty, -0.06 * w);
      legMix(p, 0, -1.2 * front, 0.1, 1.0 * front, w);
      legMix(p, 1, -1.2 * front, 0.1, 1.0 * front, w);
      legMix(p, 2, 0.6 * (1 - front), -0.2, 0.6 * (1 - front), w);
      legMix(p, 3, 0.6 * (1 - front), -0.2, 0.6 * (1 - front), w);
      dmt(p, DC.jaw, 0.6 * front, w);
      dmt(p, DC.eyes, 1, w > 0.4 ? 1 : 0);
      break;
    }
    case 'dig': {
      const w = envelope(u, 0.12, 0.15);
      dmt(p, DC.bx, 0.3, w);
      dadd(p, DC.bty, -0.04 * w);
      dmt(p, DC.nx, 0.5, w);
      dmt(p, DC.hx, 0.3, w);
      const k = Math.sin(at * 20);
      legMix(p, 0, -0.9 + 0.5 * Math.max(0, k), -1.0 * Math.max(0, k), 0.5, w);
      legMix(p, 1, -0.9 + 0.5 * Math.max(0, -k), -1.0 * Math.max(0, -k), 0.5, w);
      dmt(p, DC.wag, 2, w);
      dmt(p, DC.jaw, 0.25, w);
      dmt(p, DC.tongue, 1, w);
      break;
    }
  }
}

export function dogActionBlocksLook(a: DogAction): boolean {
  return a !== 'wag' && a !== 'bark';
}

// ── rig ───────────────────────────────────────────────────────────────────────

const HIDE = 1e-4;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

let dogSeq = 0;

export class DogRig implements Dog {
  readonly root: THREE.Group;
  readonly name: string;
  readonly coat: DogCoat;
  private readonly bones: THREE.Bone[];
  private readonly mesh: THREE.SkinnedMesh;
  private readonly geo: THREE.BufferGeometry;
  private readonly sockets: Record<DogSocket, THREE.Object3D>;
  private readonly emoteSprite: EmoteSprite;
  private readonly shadow: THREE.Mesh;
  private readonly rng: Rng;
  private readonly restPos: THREE.Vector3[];
  private disposed = false;

  private readonly d: DogDrive = { t: 0, phase: 0, speed: 0, move: 0, gait: 0, pose: 'stand', mood: 'calm', ex: 0.3, sl: 0 };
  private speedTarget = 0;
  private readonly base = new DogPoseData();
  private readonly act = new DogPoseData();
  private readonly out = new DogPoseData();
  private readonly snap = new DogPoseData();
  private fadeT = 1;
  private fadeDur = 0;
  private curAction: DogAction | null = null;
  private actT = 0;
  private actDur = 1;
  private actLoop = false;
  private readonly ctx: DogCtx = { at: 0, backYaw: 0, looping: false };
  private blinkIn = 2;
  private blinkT = -1;
  private readonly lookTarget = new THREE.Vector3();
  private hasLook = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private idleT = 3;
  private idleYaw = 0;
  private idleTilt = 0;
  private wagPh = 0;
  private readonly ear = { l: 0, vl: 0, r: 0, vr: 0 };
  private readonly headPrev = new THREE.Vector3();
  private headVY = 0;
  private hasPrev = false;

  constructor(look: DogLook) {
    this.name = look.name;
    this.coat = Object.prototype.hasOwnProperty.call(DOG_COATS, look.coat) ? look.coat : 'golden';
    this.rng = new Rng(hashString('dog:' + look.name) ^ Math.imul(++dogSeq, 0x9e3779b1));
    this.blinkIn = 1 + this.rng.next() * 2;
    const { bones, rest } = buildDogBones();
    this.bones = bones;
    this.restPos = bones.map((b) => b.position.clone());
    this.geo = acquireGeo('dog|' + this.coat, () => dogGeometry(this.coat, rest));
    this.root = new THREE.Group();
    this.root.name = 'dog';
    this.mesh = new THREE.SkinnedMesh(this.geo, modelMaterial());
    this.mesh.name = 'dog-body';
    this.mesh.castShadow = true;
    this.mesh.add(bones[DB.base]!);
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.35, 0), 0.85);
    this.mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-0.7, -0.1, -0.7), new THREE.Vector3(0.7, 1.1, 0.7));

    const mk = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const ob = new THREE.Object3D();
      ob.name = 'socket:' + name;
      ob.position.set(x, y, z);
      parent.add(ob);
      return ob;
    };
    const mouth = mk('mouth', bones[DB.jaw]!, 0, 0.0, 0.11);
    const head = mk('head', bones[DB.head]!, 0, 0, 0);
    const overhead = mk('overhead', this.root, 0, DOG_HEIGHT + 0.3, DOG.headZ);
    this.sockets = { mouth, head, overhead, root: this.root };
    this.emoteSprite = new EmoteSprite(overhead);
    this.shadow = new THREE.Mesh(shadowGeo(), shadowMaterial());
    this.shadow.name = 'shadow';
    this.shadow.renderOrder = -1;
    this.shadow.scale.set(0.3, 1, 0.48);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);
    this.update(0);
  }

  get pose(): DogPose {
    return this.d.pose;
  }

  get action(): DogAction | null {
    return this.curAction;
  }

  get mood(): DogMood {
    return this.d.mood;
  }

  get currentEmote(): Emote | null {
    return this.emoteSprite.current;
  }

  get body(): THREE.SkinnedMesh {
    return this.mesh;
  }

  setMotion(speed: number): void {
    this.speedTarget = Number.isFinite(speed) ? Math.max(0, Math.min(12, speed)) : 0;
  }

  setPose(pose: DogPose): void {
    if (pose !== 'stand' && pose !== 'sit' && pose !== 'lie' && pose !== 'sleep' && pose !== 'curl') return;
    if (pose === this.d.pose) return;
    this.startFade(0.45);
    this.d.pose = pose;
  }

  play(action: DogAction, opts: PlayOpts = {}): number {
    const d0 = DOG_ACTION_DURATION[action];
    if (d0 === undefined) return 0;
    const dur = opts.duration !== undefined && Number.isFinite(opts.duration) && opts.duration > 0 ? Math.max(0.1, opts.duration) : d0;
    this.startFade(0.12);
    this.curAction = action;
    this.actT = 0;
    this.actDur = dur;
    this.actLoop = !!opts.loop;
    return dur;
  }

  cancelAction(): void {
    if (!this.curAction) return;
    this.startFade(0.25);
    this.curAction = null;
  }

  lookAt(world: THREE.Vector3 | null): void {
    if (!world || !Number.isFinite(world.x + world.y + world.z)) this.hasLook = false;
    else {
      this.lookTarget.copy(world);
      this.hasLook = true;
    }
  }

  emote(kind: Emote | null, seconds?: number): void {
    this.emoteSprite.show(kind, seconds);
  }

  setMood(mood: DogMood): void {
    if (mood === 'excited' || mood === 'calm' || mood === 'sleepy') this.d.mood = mood;
  }

  socket(name: DogSocket): THREE.Object3D {
    return this.sockets[name] ?? this.root;
  }

  update(dtIn: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, Number.isFinite(dtIn) ? dtIn : 0));
    const d = this.d;
    d.t += dt;
    const k = 1 - Math.exp(-7 * dt);
    d.speed += (this.speedTarget - d.speed) * k;
    if (d.speed < 1e-3 && this.speedTarget === 0) d.speed = 0;
    d.gait = dogGaitOf(d.speed);
    d.move = d.pose === 'stand' ? smooth01((d.speed - 0.05) / 0.4) : 0;
    if (d.pose === 'stand') {
      d.phase += (Math.PI * d.speed * dt) / dogStride(d.gait);
      if (d.phase > 1000) d.phase -= Math.PI * 300;
    }
    const exT = d.mood === 'excited' ? 1 : d.mood === 'calm' ? 0.25 : 0;
    const slT = d.mood === 'sleepy' ? 1 : 0;
    const mk = d.t < 0.05 ? 1 : 1 - Math.exp(-3 * dt);
    d.ex += (exT - d.ex) * mk;
    d.sl += (slT - d.sl) * mk;

    dogBasePose(this.base, d);
    let target = this.base;
    let finished = false;
    if (this.curAction) {
      this.actT += dt;
      const u = dogActionProgress(this.curAction, this.actT, this.actDur, this.actLoop);
      dcopy(this.act, this.base);
      this.ctx.at = this.actT * (DOG_ACTION_DURATION[this.curAction] / this.actDur);
      this.ctx.looping = this.actLoop && (DOG_LOOP[this.curAction]?.[0] ?? 1) === 0 && (DOG_LOOP[this.curAction]?.[1] ?? 0) === 1;
      this.root.getWorldQuaternion(_q);
      _e.setFromQuaternion(_q, 'YXZ');
      this.ctx.backYaw = wrapPi(Math.PI - _e.y);
      dogActionPose(this.act, this.curAction, u, this.ctx);
      target = this.act;
      if (!this.actLoop && this.actT >= this.actDur) finished = true;
    }
    if (this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      dblend(this.out, this.snap, target, smooth01(this.fadeT / this.fadeDur));
    } else dcopy(this.out, target);
    if (finished) {
      this.startFade(0.25);
      this.curAction = null;
    }
    this.updateLook(dt);
    this.apply(dt);
    this.root.updateMatrixWorld(true);
    // Overhead socket above the head.
    this.bones[DB.head]!.getWorldPosition(_v);
    this.root.worldToLocal(_v);
    this.sockets.overhead.position.set(_v.x, _v.y + DOG.headR + 0.3, _v.z);
    this.bones[DB.torso]!.getWorldPosition(_v2);
    this.root.worldToLocal(_v2);
    this.shadow.position.set(_v2.x, 0.012, _v2.z);
    this.emoteSprite.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.emoteSprite.dispose();
    releaseGeo(this.geo);
    this.mesh.skeleton.dispose();
    this.root.traverse((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry && !isShared(m.geometry)) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat && !isShared(mat)) mat.dispose();
    });
  }

  private startFade(dur: number): void {
    dcopy(this.snap, this.out);
    this.fadeT = 0;
    this.fadeDur = dur;
  }

  private updateLook(dt: number): void {
    const d = this.d;
    let yaw = 0;
    let pitch = 0;
    const blocked = this.curAction !== null && dogActionBlocksLook(this.curAction);
    if (this.hasLook) {
      const neck = this.bones[DB.neck]!;
      _m.copy(neck.matrixWorld).invert();
      _v.copy(this.lookTarget).applyMatrix4(_m);
      _v.y -= DOG.headY - DOG.neckY;
      yaw = Math.atan2(_v.x, _v.z);
      pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
    } else if (!this.curAction && d.move < 0.3 && (d.pose === 'stand' || d.pose === 'sit' || d.pose === 'lie')) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        this.idleT = 1.5 + this.rng.next() * 3;
        this.idleYaw = this.rng.next() < 0.4 ? 0 : (this.rng.next() - 0.5) * 1.1;
        this.idleTilt = this.rng.next() < 0.2 ? (this.rng.next() - 0.5) * 0.5 : 0;
      }
      yaw = this.idleYaw;
    } else this.idleTilt = 0;
    const w = blocked ? 0 : 1;
    yaw = Math.max(-1.0, Math.min(1.0, yaw)) * w;
    pitch = Math.max(-0.5, Math.min(0.5, pitch)) * w;
    const lk = dt > 0 ? 1 - Math.exp(-6 * dt) : d.t < 0.05 ? 1 : 0;
    this.lookYaw += (yaw - this.lookYaw) * lk;
    this.lookPitch += (pitch - this.lookPitch) * lk;
    // Blinks.
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.15) this.blinkT = -1;
    } else if (dt > 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0;
        this.blinkIn = 1.6 + this.rng.next() * 3.5;
      }
    }
  }

  private apply(dt: number): void {
    const v = this.out.v;
    const bn = this.bones;
    const d = this.d;
    const base = bn[DB.base]!;
    base.position.set(v[DC.btx]!, v[DC.bty]!, v[DC.btz]!);
    base.rotation.set(v[DC.bx]!, v[DC.by]!, v[DC.bz]!, 'YXZ');
    const sq = Math.max(0.7, Math.min(1.3, v[DC.sq]!));
    base.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    bn[DB.torso]!.rotation.set(0, 0, v[DC.tz]!);
    bn[DB.rear]!.rotation.set(v[DC.rx]!, v[DC.ry]!, v[DC.rz]!);
    bn[DB.front]!.rotation.set(v[DC.fx]!, v[DC.fy]!, v[DC.fz]!);
    bn[DB.neck]!.rotation.set(v[DC.nx]!, v[DC.ny]! + this.lookYaw * 0.35, 0);
    bn[DB.head]!.rotation.set(v[DC.hx]! - this.lookPitch * 0.7, v[DC.hy]! + this.lookYaw * 0.6, v[DC.hz]! + this.idleTilt, 'YXZ');
    bn[DB.jaw]!.rotation.x = Math.max(0, v[DC.jaw]!);
    const tongue = clamp01(v[DC.tongue]!);
    const tb = bn[DB.tongue]!;
    if (tongue < 0.05) tb.scale.setScalar(HIDE);
    else {
      tb.scale.set(1, 1, 0.3 + 0.7 * tongue);
      tb.rotation.x = 0.25 * tongue + 0.1 * Math.sin(d.t * 14) * tongue;
    }
    // Legs.
    for (let leg = 0; leg < 4; leg++) {
      const lb = LEGS[leg]!;
      const u = lb[0];
      const l = lb[1];
      const p = lb[2];
      const b = DC.aFLx + leg * 3;
      const ab = leg === 0 ? DC.oFL : leg === 1 ? DC.oFR : leg === 2 ? DC.oBL : DC.oBR;
      const sd = leg === 0 || leg === 2 ? 1 : -1;
      bn[u]!.rotation.set(v[b]!, 0, sd * v[ab]!, 'XZY');
      bn[l]!.rotation.x = v[b + 1]!;
      bn[p]!.rotation.x = v[b + 2]!;
    }
    // Tail wag (continuous phase; amplitude/rate from the pose + mood).
    const wag = Math.max(0, v[DC.wag]!);
    this.wagPh += dt * (5 + wag * 6);
    const s1 = Math.sin(this.wagPh);
    bn[DB.tail0]!.rotation.set(v[DC.t0x]!, v[DC.t0y]! + s1 * 0.32 * Math.min(1.4, wag), 0, 'YXZ');
    bn[DB.tail1]!.rotation.set(0.15, v[DC.t1y]! + Math.sin(this.wagPh - 0.7) * 0.28 * Math.min(1.4, wag), 0, 'YXZ');
    bn[DB.tail2]!.rotation.set(0.1, v[DC.t2y]! + Math.sin(this.wagPh - 1.4) * 0.25 * Math.min(1.4, wag), 0, 'YXZ');
    // Ears: floppy spring driven by the head's vertical motion.
    const head = bn[DB.head]!;
    head.getWorldPosition(_v);
    if (!this.hasPrev) {
      this.headPrev.copy(_v);
      this.hasPrev = true;
    }
    const vy = dt > 0 ? (_v.y - this.headPrev.y) / dt : 0;
    const ay = dt > 0 ? (vy - this.headVY) / dt : 0;
    this.headVY = vy;
    this.headPrev.copy(_v);
    const e = this.ear;
    const drive = Math.max(-0.8, Math.min(0.8, -ay * 0.01));
    if (dt > 0) {
      e.vl += (-90 * (e.l - drive) - 6 * e.vl) * dt;
      e.l += e.vl * dt;
      e.vr += (-80 * (e.r - drive) - 6 * e.vr) * dt;
      e.r += e.vr * dt;
      if (!Number.isFinite(e.l + e.r)) e.l = e.r = e.vl = e.vr = 0;
    }
    bn[DB.earL]!.rotation.set(v[DC.eLx]! + e.l * 0.4, 0, 0.1 + v[DC.eLz]! + e.l * 0.5);
    bn[DB.earR]!.rotation.set(v[DC.eRx]! + e.r * 0.4, 0, -0.1 - v[DC.eRz]! - e.r * 0.5);
    // Eyes: 0 open, 1 closed, 2 happy.
    const eyes = Math.round(v[DC.eyes]!);
    for (let sd = 0; sd < 2; sd++) {
      const open = bn[sd === 0 ? DB.eyeL : DB.eyeR]!;
      const closed = bn[sd === 0 ? DB.closedL : DB.closedR]!;
      const happy = bn[sd === 0 ? DB.happyL : DB.happyR]!;
      open.scale.setScalar(eyes === 0 ? 1 : HIDE);
      closed.scale.setScalar(eyes === 1 ? 1 : HIDE);
      happy.scale.setScalar(eyes === 2 ? 1 : HIDE);
      const blink = this.blinkT >= 0 ? Math.sin(Math.min(1, this.blinkT / 0.15) * Math.PI) : 0;
      const c = Math.min(1, Math.max(v[DC.lid]!, blink));
      const lid = bn[sd === 0 ? DB.lidL : DB.lidR]!;
      if (c < 0.02) lid.scale.setScalar(HIDE);
      else lid.scale.set(1, c, 1);
      const brow = bn[sd === 0 ? DB.browL : DB.browR]!;
      brow.position.copy(this.restPos[sd === 0 ? DB.browL : DB.browR]!);
      brow.position.y += v[DC.brow]! * 0.012 * (sd === 0 ? 1.3 : 0.8);
    }
  }
}

export function createDogRig(look: DogLook): DogRig {
  return new DogRig(look);
}
