// ─────────────────────────────────────────────────────────────────────────────
// Procedural animation (pure pose writers — no THREE objects, no allocation):
// base poses (stand / sit / lie / kneel / drive), bouncy distance-driven
// locomotion, hold arm poses, personality idles + idle gestures, and every
// one-shot / loopable Action. Arm gestures mostly use IK hand targets given in
// metres relative to the shoulder in the chest frame (outward, up, forward).
// ─────────────────────────────────────────────────────────────────────────────
import { CHANNELS, type Pose, clamp01, envelope, mix, resetPose, smooth01, trk, type Track } from './pose';
import type { BodySpec } from './spec';
import type { Action, Expression, HoldKind, Pose as PoseKind } from './types';

/** Channel indices (typed-array access: no boxing in hot loops). */
export const C = Object.fromEntries(CHANNELS.map((c, i) => [c, i])) as { readonly [K in (typeof CHANNELS)[number]]: number };

const set = (p: Pose, i: number, v: number): void => {
  p.v[i] = v;
};
const add = (p: Pose, i: number, v: number): void => {
  p.v[i] = p.v[i]! + v;
};
const mt = (p: Pose, i: number, v: number, w: number): void => {
  p.v[i] = p.v[i]! + (v - p.v[i]!) * w;
};
const get = (p: Pose, i: number): number => p.v[i]!;

export type Persona = 'chris' | 'ashley' | 'addy' | 'ellie' | 'heidi' | 'extra' | 'neighbor' | 'guard' | 'kid';

export interface Drive {
  t: number;
  /** Gait phase (rad), advanced by distance. */
  phase: number;
  /** Smoothed speed (m/s). */
  speed: number;
  /** Locomotion weight 0..1. */
  move: number;
  /** 0 walk … 1 jog. */
  gait: number;
  /** Idle weight shift −1..1. */
  shift: number;
  hold: HoldKind;
  pose: PoseKind;
  seat: number;
  side: number;
  persona: Persona;
  spec: BodySpec;
  /** Sleepwalk shuffle weight 0..1. */
  shuffle: number;
}

export function newDrive(spec: BodySpec, persona: Persona): Drive {
  return { t: 0, phase: 0, speed: 0, move: 0, gait: 0, shift: 0, hold: 'none', pose: 'stand', seat: 0.45, side: 0, persona, spec, shuffle: 0 };
}

export const armLen = (s: BodySpec): number => s.upperArmL + s.foreArmL;
export const legLen = (s: BodySpec): number => s.thighL + s.shinL;
export const hipJointY = (s: BodySpec): number => s.thighL + s.shinL + s.ankleY;

/** Default seat / mattress height for a body. */
export function defaultSeat(pose: PoseKind, s: BodySpec): number {
  if (pose === 'lie') return 0.5;
  return s.kid ? 0.4 : 0.45;
}

// ── gait ──────────────────────────────────────────────────────────────────────

/** Gait blend from speed: ≤ 1.6 m/s walk (0) → ≥ 2.8 m/s jog (1). */
export function gaitOf(speed: number): number {
  return smooth01((speed - 1.6) / 1.2);
}

/** Step length (m) for a gait value; shuffling (sleepwalk) takes short steps. */
export function stepLength(gait: number, s: BodySpec, shuffle = 0): number {
  return legLen(s) * mix(0.8, 1.25, gait) * (1 - 0.55 * clamp01(shuffle));
}

/** Hip swing amplitude (rad) so the planted foot travels one step per half cycle (no skating). */
export function swingAmplitude(step: number, s: BodySpec): number {
  return Math.asin(Math.min(0.9, step / (2 * legLen(s))));
}

/** Phase advance (rad) for moving `dist` metres (π per step). */
export function phaseAdvance(dist: number, step: number): number {
  return (Math.PI * dist) / Math.max(1e-3, step);
}

// ── base poses ─────────────────────────────────────────────────────────────────

export function basePose(p: Pose, d: Drive): void {
  switch (d.pose) {
    case 'stand':
      standPose(p, d);
      break;
    case 'sit':
      sitPose(p, d);
      holdPose(p, d, 1);
      break;
    case 'kneel':
      kneelPose(p, d);
      holdPose(p, d, 1);
      break;
    case 'lie':
      liePose(p, d);
      break;
    case 'drive':
      sitPose(p, d);
      wheelHands(p, d, 1);
      break;
  }
}

export function standPose(p: Pose, d: Drive): void {
  resetPose(p);
  const s = d.spec;
  const t = d.t;
  const br = Math.sin(t * (s.kid ? 2.6 : 2.1));
  const idle = 1 - d.move;
  set(p, C.cx, 0.014 * br);
  set(p, C.hx, -0.012 * br);
  set(p, C.shL, 0.003 * (br + 1));
  set(p, C.shR, 0.003 * (br + 1));
  set(p, C.aLx, -0.04);
  set(p, C.aRx, -0.04);
  // Weight shift onto one leg.
  const sh = d.shift * idle * (d.persona === 'ashley' ? 1.4 : 1);
  set(p, C.pz, 0.045 * sh);
  set(p, C.btx, 0.012 * sh * s.scale);
  if (sh > 0) set(p, C.lRk, 0.2 * sh);
  else set(p, C.lLk, -0.2 * sh);
  set(p, C.lLa, -get(p, C.lLk) * 0.5);
  set(p, C.lRa, -get(p, C.lRk) * 0.5);
  if (idle > 0.001) personaIdle(p, d, idle * (d.hold === 'none' ? 1 : 0.4));
  holdPose(p, d, 1);
  if (d.move > 0.001) locomotion(p, d);
}

function personaIdle(p: Pose, d: Drive, w: number): void {
  const t = d.t;
  const s = d.spec;
  const L = armLen(s);
  switch (d.persona) {
    case 'chris': {
      // Easy slouch + slow sway (early-morning utility player).
      add(p, C.cx, 0.05 * w);
      add(p, C.hx, 0.04 * w);
      add(p, C.bz, 0.012 * Math.sin(t * 0.9) * w);
      add(p, C.aLe, 0.08 * w);
      add(p, C.aRe, 0.08 * w);
      break;
    }
    case 'ashley': {
      add(p, C.hz, 0.05 * Math.sin(t * 0.7) * w);
      add(p, C.sz, -0.02 * get(p, C.pz) * 10 * w);
      break;
    }
    case 'addy': {
      // Fidgety: bouncing on her toes, arms swinging.
      const b = Math.abs(Math.sin(t * 4.6));
      add(p, C.lLa, (0.1 + 0.12 * b) * w);
      add(p, C.lRa, (0.1 + 0.12 * b) * w);
      add(p, C.aLx, 0.16 * Math.sin(t * 2.3) * w);
      add(p, C.aRx, -0.16 * Math.sin(t * 2.3) * w);
      add(p, C.sy, 0.06 * Math.sin(t * 2.3) * w);
      add(p, C.hy, 0.08 * Math.sin(t * 1.3) * w);
      break;
    }
    case 'ellie': {
      // Calm sway, hands clasped behind her back.
      add(p, C.bz, 0.02 * Math.sin(t * 1.2) * w);
      add(p, C.hz, -0.03 * Math.sin(t * 1.2) * w);
      set(p, C.ikL, w);
      set(p, C.ikR, w);
      for (const side of [0, 1]) {
        const o = side === 0 ? C.tLo : C.tRo;
        set(p, o, -s.shoulderX + 0.03);
        set(p, o + 1, -(s.shoulderY - s.spineY) - 0.02);
        set(p, o + 2, -s.torsoD - 0.05);
        set(p, o + 3, 0.8);
        set(p, o + 4, -0.4);
        set(p, o + 5, -0.6);
      }
      void L;
      break;
    }
    case 'heidi': {
      const b = Math.abs(Math.sin(t * 3.8));
      add(p, C.hpy, 0.008 * b * w);
      add(p, C.aLo, 0.12 * w);
      add(p, C.aRo, 0.12 * w);
      add(p, C.hz, 0.06 * Math.sin(t * 1.9) * w);
      add(p, C.bz, 0.015 * Math.sin(t * 1.9) * w);
      break;
    }
    default:
      break;
  }
}

/** Arm IK target helper: metres relative to the shoulder (outward, up, forward) in the chest frame. */
function ik(p: Pose, side: 0 | 1, w: number, o: number, u: number, f: number, po = 0.6, pu = -1, pf = -0.3): void {
  const b = side === 0 ? C.ikL : C.ikR;
  mt(p, b, 1, w);
  mt(p, b + 1, o, w);
  mt(p, b + 2, u, w);
  mt(p, b + 3, f, w);
  mt(p, b + 4, po, w);
  mt(p, b + 5, pu, w);
  mt(p, b + 6, pf, w);
}

/** Model-space rest point → arm target (outward/up/forward from that shoulder). side 0 = L (+X), 1 = R. */
function rel(s: BodySpec, side: 0 | 1, mx: number, my: number, mz: number, out: [number, number, number]): [number, number, number] {
  const sg = side === 0 ? 1 : -1;
  out[0] = sg * mx - s.shoulderX;
  out[1] = my - s.shoulderY;
  out[2] = mz;
  return out;
}
const _r: [number, number, number] = [0, 0, 0];

/** Head-relative point (head space offsets) → arm target. */
function headTarget(s: BodySpec, side: 0 | 1, hx: number, hy: number, hz: number): [number, number, number] {
  return rel(s, side, hx, s.neckY + s.headCY + hy, s.headCZ + hz, _r);
}

export function holdPose(p: Pose, d: Drive, w: number): void {
  const s = d.spec;
  const L = armLen(s);
  switch (d.hold) {
    case 'none':
      return;
    case 'mug':
      ik(p, 1, w, -0.07 * L, -0.6 * L, 0.5 * L, 0.7, -1, -0.2);
      break;
    case 'bag':
      mt(p, C.aRo, 0.2, w);
      mt(p, C.aRx, 0.05, w);
      mt(p, C.aRe, 0.06, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.sz, -0.04, w);
      break;
    case 'box':
      ik(p, 0, w, -0.26 * L, -0.74 * L, 0.5 * L, 0.8, -1, -0.2);
      ik(p, 1, w, -0.26 * L, -0.74 * L, 0.5 * L, 0.8, -1, -0.2);
      break;
    case 'brush':
      ik(p, 1, w, 0.02 * L, 0.3 * L, 0.44 * L, 1, -0.4, -0.5);
      break;
    case 'phone':
      ik(p, 1, w, -0.2 * L, -0.62 * L, 0.42 * L, 0.7, -1, -0.2);
      mt(p, C.hx, 0.28, w);
      mt(p, C.hy, -0.08, w);
      mt(p, C.sRx, 0.9, w);
      break;
    case 'wheel':
      wheelHands(p, d, w);
      break;
  }
}

function wheelHands(p: Pose, d: Drive, w: number): void {
  const s = d.spec;
  const L = armLen(s);
  const g = wheelGrip(s);
  ik(p, 0, w, g.x - s.shoulderX, g.up, g.fwd, 0.8, -1, -0.3);
  ik(p, 1, w, g.x - s.shoulderX, g.up, g.fwd, 0.8, -1, -0.3);
  void L;
}

/** Steering-wheel grip (relative to the shoulders, chest frame): hands at ±x. The car module places the wheel here. */
export function wheelGrip(s: BodySpec): { x: number; up: number; fwd: number } {
  const L = armLen(s);
  return { x: s.kid ? 0.12 : 0.16, up: -0.32 * L, fwd: 0.66 * L };
}

function locomotion(p: Pose, d: Drive): void {
  const s = d.spec;
  const w = d.move;
  const g = d.gait;
  const sw = d.shuffle;
  const step = stepLength(g, s, sw);
  const A = swingAmplitude(step, s);
  const bias = mix(-0.04, -0.12, g);
  const K = mix(0.95, 1.7, g) * (1 - 0.7 * sw);
  const kflex = mix(0.08, 0.26, g);
  const armA = mix(0.42, 0.78, g) * (1 - 0.8 * sw);
  const elb = mix(0.32, 1.35, g);
  const lean = mix(0.05, 0.16, g);
  const bouncy = d.persona === 'addy' || d.persona === 'heidi' ? 1.4 : d.persona === 'chris' ? 0.8 : 1;
  const bob = mix(0.018, 0.04, g) * s.scale * bouncy * (1 - 0.6 * sw);
  const yawA = mix(0.09, 0.14, g);
  const ph = d.phase;
  for (let side = 0; side < 2; side++) {
    const f = side === 0 ? ph : ph + Math.PI;
    const s1 = Math.sin(f);
    const c1 = Math.cos(f);
    const x = bias - A * s1;
    const knee = kflex + K * Math.pow(Math.max(0, Math.cos(f + 0.35)), 1.5);
    const ank = -(x + knee) * 0.8 + 0.4 * Math.max(0, -s1) * g - 0.1 * Math.max(0, c1);
    const b = side === 0 ? C.lLx : C.lRx;
    mt(p, b, x, w);
    mt(p, b + 3, knee, w);
    mt(p, b + 4, ank, w);
  }
  const s0 = Math.sin(ph);
  add(p, C.hpy, w * bob * (Math.abs(s0) - 0.45));
  mt(p, C.sq, 1 - 0.025 * (1 - Math.abs(s0)) * bouncy, w);
  mt(p, C.pyaw, -yawA * s0, w);
  mt(p, C.sy, yawA * 1.3 * s0, w);
  add(p, C.sx, lean * w);
  add(p, C.hx, -lean * 0.7 * w);
  mt(p, C.hy, -yawA * 0.3 * s0, w);
  add(p, C.hz, 0.03 * Math.sin(ph * 2) * w * bouncy);
  if (d.persona === 'ashley') add(p, C.pz, 0.05 * s0 * w);
  // Arms swing opposite the legs (unless busy).
  const free = (side: 0 | 1) => (side === 0 ? d.hold !== 'box' && d.hold !== 'wheel' : d.hold === 'none') && d.persona !== 'ellie' || (d.persona === 'ellie' && w > 0.5);
  if (free(0)) {
    mt(p, C.ikL, 0, w);
    mt(p, C.aLx, armA * s0 - 0.1 * g, w);
    mt(p, C.aLe, elb + 0.3 * Math.max(0, -armA * s0), w);
    mt(p, C.aLo, 0.12 + 0.06 * g, w);
  }
  if (free(1)) {
    mt(p, C.ikR, 0, w);
    mt(p, C.aRx, -armA * s0 - 0.1 * g, w);
    mt(p, C.aRe, elb + 0.3 * Math.max(0, armA * s0), w);
    mt(p, C.aRo, 0.12 + 0.06 * g, w);
  }
}

export function sitPose(p: Pose, d: Drive): void {
  resetPose(p);
  const s = d.spec;
  const t = d.t;
  const seat = d.seat;
  const hj0 = hipJointY(s);
  const hjY = seat + s.legR * 0.85;
  const zH = 0.04 - s.thighL;
  set(p, C.gl, 0);
  set(p, C.hpy, hjY - hj0);
  set(p, C.hpz, zH);
  const lower = s.shinL + s.ankleY;
  // How far the knees must sit below the hip joints for vertical shins to reach the floor.
  const drop = hjY - lower;
  for (let side = 0; side < 2; side++) {
    let x: number;
    let k: number;
    let a: number;
    if (drop > s.thighL * 0.35) {
      // Feet dangle (kids on grown-up chairs): a happy little swing.
      x = -Math.PI / 2 + 0.08;
      const sw = s.kid ? 0.14 * Math.sin(t * 2.4 + side * Math.PI) : 0;
      k = Math.PI / 2 - 0.08 - 0.12 + sw;
      a = 0.3;
    } else if (drop >= s.thighL * 0.02) {
      // Thighs slope gently down to the knees, shins vertical, feet flat on the floor.
      x = -Math.PI / 2 + Math.asin(drop / s.thighL);
      k = -x;
      a = 0;
    } else {
      // Low seat: knees up, shins tilted forward to reach the floor.
      x = -Math.PI / 2 + 0.02;
      const kneeH = hjY - s.thighL * Math.sin(0.02);
      const th = Math.acos(Math.max(-1, Math.min(1, kneeH / lower)));
      k = Math.PI / 2 - 0.02 - th;
      a = th;
    }
    const b = side === 0 ? C.lLx : C.lRx;
    set(p, b, x);
    set(p, b + 1, 0.07);
    set(p, b + 2, 0.1);
    set(p, b + 3, k);
    set(p, b + 4, a);
  }
  const br = Math.sin(t * 2.1);
  set(p, C.sx, -0.03);
  set(p, C.cx, 0.012 * br);
  set(p, C.hx, 0.02);
  // Hands resting on the thighs.
  const sitShoulderY = hjY + (s.shoulderY - hj0);
  for (const side of [0, 1] as const) {
    const sg = side === 0 ? 1 : -1;
    const tx = sg * (s.hipX + 0.03);
    const ty = hjY + s.legR * 1.15 + s.handR * 0.5;
    const tz = zH + s.thighL * 0.62;
    ik(p, side, 1, sg * tx - s.shoulderX, ty - sitShoulderY, tz - zH, 0.7, -0.6, -0.6);
  }
}

export function kneelPose(p: Pose, d: Drive): void {
  resetPose(p);
  const s = d.spec;
  const hj0 = hipJointY(s);
  const hjY = s.thighL + s.legR * 0.8;
  set(p, C.gl, 0);
  set(p, C.hpy, hjY - hj0);
  set(p, C.hpz, -0.02);
  // Right knee down: thigh vertical, shin back along the floor, foot flat (top on the floor).
  set(p, C.lRx, 0.04);
  set(p, C.lRk, Math.PI / 2 - 0.04);
  set(p, C.lRa, Math.PI / 2 - 0.2);
  set(p, C.lRo, 0.04);
  // Left foot planted forward: thigh ~horizontal so the sole meets the floor, shin vertical.
  const sinPhi = Math.max(-0.3, Math.min(1, (hjY - s.shinL - s.ankleY) / s.thighL));
  const phi = Math.asin(sinPhi);
  const x = -Math.PI / 2 + phi;
  set(p, C.lLx, x);
  set(p, C.lLk, -x);
  set(p, C.lLa, 0);
  set(p, C.lLo, 0.12);
  set(p, C.sx, 0.14);
  set(p, C.hx, 0.22);
  // Left forearm resting on the left knee; right arm hanging forward.
  set(p, C.aLx, -0.55);
  set(p, C.aLe, 0.95);
  set(p, C.aLo, 0.14);
  set(p, C.aRx, -0.35);
  set(p, C.aRe, 0.35);
}

export function liePose(p: Pose, d: Drive): void {
  resetPose(p);
  const s = d.spec;
  const t = d.t;
  const side = Math.max(-1, Math.min(1, d.side));
  const as = Math.abs(side);
  const br = Math.sin(t * 1.4);
  set(p, C.gl, 0);
  set(p, C.bx, -Math.PI / 2);
  set(p, C.by, side * Math.PI / 2);
  const rest = mix(s.torsoD * 0.98, s.shoulderX + s.armR * 0.55, as);
  set(p, C.bty, d.seat + rest);
  set(p, C.btz, s.height / 2);
  set(p, C.cx, 0.02 * br);
  // Back: head on the pillow (chin slightly down), arms relaxed, one hand on the tummy.
  set(p, C.hx, mix(0.18, 0.1, as));
  set(p, C.lLk, mix(0.12, 1.25, as));
  set(p, C.lRk, mix(0.08, 1.05, as));
  set(p, C.lLx, mix(-0.08, -0.95, as));
  set(p, C.lRx, mix(-0.04, -0.75, as));
  set(p, C.lLa, mix(0.35, 0.3, as));
  set(p, C.lRa, mix(0.35, 0.3, as));
  set(p, C.lLo, mix(0.05, 0.02, as));
  set(p, C.lRo, mix(0.05, 0.02, as));
  set(p, C.aLo, mix(0.2, 0.05, as));
  set(p, C.aLx, mix(-0.1, -0.9, as));
  set(p, C.aLe, mix(0.4, 1.4, as));
  set(p, C.aRo, mix(0.12, 0.05, as));
  set(p, C.aRx, mix(-0.35, -1.1, as));
  set(p, C.aRe, mix(1.5, 1.1, as));
  set(p, C.sx, mix(0, 0.25, as));
  set(p, C.hz, 0.05 * side);
}

// ── actions ───────────────────────────────────────────────────────────────────

/** Default length (s) of every action at 1× speed. */
export const ACTION_DURATION: Readonly<Record<Action, number>> = {
  wave: 1.8,
  cheer: 1.5,
  jump: 0.85,
  yawn: 2.4,
  stretch: 2.2,
  gasp: 1.1,
  noooo: 2.2,
  point: 1.3,
  shrug: 1.2,
  checkWatch: 1.8,
  sip: 2.0,
  lunge: 0.75,
  grab: 0.6,
  pickUpLow: 1.4,
  handOff: 1.1,
  toss: 0.9,
  giggle: 1.5,
  hug: 2.2,
  nod: 0.8,
  shakeHead: 1.0,
  facepalm: 1.7,
  dance: 2.0,
  hairFlip: 1.0,
  inspect: 2.2,
  brushFast: 1.6,
  thumbsUp: 1.3,
  shh: 1.5,
  sleepwalk: 1.4,
  bounce: 0.7,
};

export const ACTIONS = Object.keys(ACTION_DURATION) as Action[];

/** Looping segment [a, b] of each action's progress (loop: plays 0 → b, then cycles a → b). */
export const LOOP_RANGE: Readonly<Partial<Record<Action, readonly [number, number]>>> = {
  wave: [0.22, 0.78],
  cheer: [0.25, 0.75],
  point: [0.3, 0.7],
  giggle: [0.18, 0.82],
  inspect: [0.28, 0.72],
  brushFast: [0.15, 0.85],
  thumbsUp: [0.3, 0.7],
  shh: [0.3, 0.7],
  hug: [0.35, 0.7],
  checkWatch: [0.3, 0.7],
  gasp: [0.3, 0.7],
  noooo: [0.2, 0.8],
  dance: [0, 1],
  bounce: [0, 1],
  sleepwalk: [0, 1],
};

export function loopRange(a: Action): readonly [number, number] {
  return LOOP_RANGE[a] ?? [0, 1];
}

/** Cyclic actions (pose at u = 0 equals u = 1 inside the loop — no envelope while looping). */
export function isCyclic(a: Action): boolean {
  return a === 'dance' || a === 'bounce' || a === 'sleepwalk';
}

/**
 * Action progress for elapsed time `t` (s) of an action with duration `dur`.
 * Looping actions play 0 → b once, then cycle within [a, b].
 */
export function actionProgress(a: Action, t: number, dur: number, loop: boolean): number {
  const u = Math.max(0, t) / Math.max(1e-3, dur);
  if (!loop) return Math.min(1, u);
  const [a0, b0] = loopRange(a);
  if (u < b0) return u;
  const span = Math.max(1e-3, b0 - a0);
  return a0 + ((u - b0) % span);
}

/** Expression an action shows while it plays (null = keep the current one). */
export function actionExpression(a: Action, u: number): Expression | null {
  switch (a) {
    case 'wave':
    case 'handOff':
    case 'thumbsUp':
    case 'nod':
      return 'happy';
    case 'cheer':
    case 'jump':
    case 'giggle':
    case 'hug':
    case 'dance':
    case 'bounce':
      return 'joy';
    case 'yawn':
      return u < 0.8 ? 'yawn' : 'sleepy';
    case 'stretch':
      return u < 0.55 ? 'yawn' : 'happy';
    case 'gasp':
      return 'surprised';
    case 'noooo':
      return 'dramatic';
    case 'point':
      return u < 0.35 ? 'surprised' : 'happy';
    case 'shrug':
      return 'worried';
    case 'checkWatch':
      return u > 0.4 && u < 0.75 ? 'surprised' : null;
    case 'sip':
      return u > 0.3 && u < 0.72 ? 'joy' : 'happy';
    case 'lunge':
    case 'grab':
      return 'determined';
    case 'toss':
      return u < 0.55 ? 'determined' : 'happy';
    case 'pickUpLow':
      return null;
    case 'shakeHead':
      return 'smug';
    case 'facepalm':
      return 'joy';
    case 'hairFlip':
      return 'proud';
    case 'inspect':
      return 'determined';
    case 'brushFast':
      return 'proud';
    case 'shh':
      return 'pout';
    case 'sleepwalk':
      return 'asleep';
  }
}

/** Actions during which lookAt is ignored (the action drives the head). */
export function actionBlocksLook(a: Action): boolean {
  return a === 'nod' || a === 'shakeHead' || a === 'yawn' || a === 'noooo' || a === 'facepalm' || a === 'hairFlip' || a === 'stretch' || a === 'dance' || a === 'sleepwalk' || a === 'pickUpLow' || a === 'giggle';
}

export interface ActCtx {
  spec: BodySpec;
  /** Seconds since the action started (continuous across loops). */
  at: number;
  /** Global time (s). */
  t: number;
  /** True while in a loop cycle (cyclic actions skip their envelope). */
  looping: boolean;
}

// Hoisted tracks.
const JUMP_PY: Track = [0, 0, 0.3, 0, 0.42, 0.62, 0.55, 1, 0.68, 0.62, 0.78, 0, 1, 0];
const JUMP_SQ: Track = [0, 1, 0.25, 0.88, 0.34, 1.1, 0.55, 1.02, 0.78, 0.88, 0.9, 1.03, 1, 1];
const JUMP_K: Track = [0, 0, 0.25, 0.95, 0.35, 0.05, 0.5, 0.7, 0.66, 0.4, 0.8, 0.9, 1, 0];
const TOSS_X: Track = [0, -0.04, 0.3, 0.75, 0.52, -1.65, 0.75, -1.3, 1, -0.04];
const TOSS_K: Track = [0, 0, 0.3, 0.35, 0.52, 0.05, 1, 0];
const BOUNCE_PY: Track = [0, 0, 0.15, 0, 0.5, 1, 0.85, 0, 1, 0];
const BOUNCE_SQ: Track = [0, 0.9, 0.18, 1.06, 0.5, 1.02, 0.82, 1.04, 0.92, 0.9, 1, 0.9];

/** Write action `a` at progress u onto p (p holds the base pose). */
export function actionPose(p: Pose, a: Action, u: number, c: ActCtx): void {
  const s = c.spec;
  const L = armLen(s);
  const at = c.at;
  const env = envelope(u, 0.14, 0.2);
  switch (a) {
    case 'wave': {
      const w = envelope(u, 0.18, 0.2);
      ik(p, 1, w, 0.3 * L + 0.11 * L * Math.sin(at * 10), 0.6 * L, 0.1 * L, 0.5, -1, -0.1);
      mt(p, C.hz, 0.07, w);
      mt(p, C.sz, 0.04, w);
      break;
    }
    case 'cheer': {
      const w = envelope(u, 0.16, 0.2);
      const k = Math.abs(Math.sin(at * 8));
      ik(p, 0, w, 0.24 * L, 0.95 * L + 0.04 * L * k, 0.1 * L, 0.6, -0.4, -0.2);
      ik(p, 1, w, 0.24 * L, 0.95 * L + 0.04 * L * k, 0.1 * L, 0.6, -0.4, -0.2);
      add(p, C.hpy, 0.035 * s.scale * k * w);
      mt(p, C.hx, -0.18, w);
      break;
    }
    case 'jump': {
      const w = envelope(u, 0.05, 0.1);
      add(p, C.hpy, 0.26 * s.scale * trk(u, JUMP_PY));
      set(p, C.sq, mix(get(p, C.sq), trk(u, JUMP_SQ), w));
      const k = trk(u, JUMP_K);
      for (const b of [C.lLx, C.lRx]) {
        mt(p, b, -0.45 * k, w);
        mt(p, b + 3, 0.95 * k, w);
        mt(p, b + 4, -0.3 * k, w);
      }
      const up = smooth01((u - 0.3) / 0.15) * (1 - smooth01((u - 0.7) / 0.2));
      mt(p, C.aLx, mix(0.45, -2.3, up), w);
      mt(p, C.aRx, mix(0.45, -2.3, up), w);
      mt(p, C.aLo, 0.3, w);
      mt(p, C.aRo, 0.3, w);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.hx, mix(0.1, -0.15, up), w);
      break;
    }
    case 'yawn':
    case 'stretch': {
      const w = envelope(u, 0.22, 0.25);
      const yawn = a === 'yawn';
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLx, yawn ? -2.75 : -2.9, w);
      mt(p, C.aRx, yawn ? -2.75 : -2.9, w);
      mt(p, C.aLo, yawn ? 0.35 : 0.55, w);
      mt(p, C.aRo, yawn ? 0.35 : 0.55, w);
      mt(p, C.aLe, yawn ? 0.9 : 0.25, w);
      mt(p, C.aRe, yawn ? 0.9 : 0.25, w);
      mt(p, C.sx, -0.12, w);
      mt(p, C.hx, -0.22, w);
      if (!yawn) {
        const sway = Math.sin(u * Math.PI * 2) * 0.16;
        mt(p, C.sz, sway, w);
        mt(p, C.lLa, 0.45, w);
        mt(p, C.lRa, 0.45, w);
      }
      break;
    }
    case 'gasp': {
      const w = envelope(u, 0.12, 0.25);
      const r = s.headRx;
      for (const side of [0, 1] as const) {
        const tgt = headTarget(s, side, (side === 0 ? 1 : -1) * r * 0.82, -s.headRy * 0.35, s.headRz * 0.35);
        ik(p, side, w, tgt[0], tgt[1], tgt[2] + 0.02, 0.9, -1, -0.1);
      }
      mt(p, C.sx, -0.1, w);
      mt(p, C.hx, -0.08, w);
      add(p, C.shL, 0.02 * w);
      add(p, C.shR, 0.02 * w);
      break;
    }
    case 'noooo': {
      const w = envelope(u, 0.15, 0.2);
      const sway = Math.sin(at * 4.5);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLo, 1.85, w);
      mt(p, C.aRo, 1.85, w);
      mt(p, C.aLx, -0.5, w);
      mt(p, C.aRx, -0.5, w);
      mt(p, C.aLe, 0.35, w);
      mt(p, C.aRe, 0.35, w);
      mt(p, C.hx, -0.5, w);
      mt(p, C.sx, -0.16, w);
      mt(p, C.bz, 0.06 * sway, w);
      for (const b of [C.lLx, C.lRx]) {
        mt(p, b, -0.35, w);
        mt(p, b + 3, 0.7, w);
        mt(p, b + 4, -0.35, w);
      }
      break;
    }
    case 'point': {
      const w = envelope(u, 0.2, 0.22);
      ik(p, 1, w, 0.04 * L, 0.08 * L, 0.98 * L, 0.3, -1, 0);
      mt(p, C.fR, 1, w);
      mt(p, C.sx, 0.06, w);
      mt(p, C.hx, -0.05, w);
      break;
    }
    case 'shrug': {
      const w = envelope(u, 0.25, 0.3);
      add(p, C.shL, 0.05 * s.scale * w);
      add(p, C.shR, 0.05 * s.scale * w);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLo, 0.42, w);
      mt(p, C.aRo, 0.42, w);
      mt(p, C.aLx, -0.25, w);
      mt(p, C.aRx, -0.25, w);
      mt(p, C.aLe, 1.45, w);
      mt(p, C.aRe, 1.45, w);
      mt(p, C.aLt, -0.9, w);
      mt(p, C.aRt, -0.9, w);
      mt(p, C.hz, 0.16, w);
      break;
    }
    case 'checkWatch': {
      const w = envelope(u, 0.22, 0.22);
      ik(p, 0, w, -0.22 * L, -0.4 * L, 0.52 * L, 0.8, -1, -0.2);
      mt(p, C.wLt, 1.2, w);
      mt(p, C.hx, 0.38, w);
      mt(p, C.hy, 0.28, w);
      break;
    }
    case 'sip': {
      const w = envelope(u, 0.22, 0.25);
      const tgt = headTarget(s, 1, -0.01, -s.headRy * 0.5, s.headRz + 0.06);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 0.8, -1, -0.1);
      const tip = smooth01((u - 0.3) / 0.12) * (1 - smooth01((u - 0.62) / 0.12));
      mt(p, C.sRx, -0.85 * tip, w);
      mt(p, C.hx, -0.14 * tip, w);
      break;
    }
    case 'lunge': {
      const w = envelope(u, 0.1, 0.35);
      mt(p, C.lLx, -0.85, w);
      mt(p, C.lLk, 0.95, w);
      mt(p, C.lLa, -0.1, w);
      mt(p, C.lRx, 0.35, w);
      mt(p, C.lRk, 0.2, w);
      mt(p, C.sx, 0.42, w);
      mt(p, C.hx, -0.3, w);
      mt(p, C.hpz, 0.08 * s.scale, w);
      ik(p, 1, w, 0.0, 0.12 * L, 1.0 * L, 0.3, -1, 0);
      mt(p, C.aLx, 0.5, w);
      mt(p, C.ikL, 0, w);
      break;
    }
    case 'grab': {
      const w = envelope(u, 0.25, 0.35);
      ik(p, 1, w, -0.06 * L, -0.66 * L, 0.6 * L, 0.7, -1, -0.2);
      mt(p, C.sx, 0.16, w);
      mt(p, C.hx, 0.15, w);
      break;
    }
    case 'pickUpLow': {
      const w = envelope(u, 0.3, 0.3);
      for (const b of [C.lLx, C.lRx]) {
        mt(p, b, -0.95, w);
        mt(p, b + 3, 1.7, w);
        mt(p, b + 4, -0.6, w);
      }
      mt(p, C.lLo, 0.15, w);
      mt(p, C.lRo, 0.15, w);
      mt(p, C.sx, 0.55, w);
      mt(p, C.cx, 0.1, w);
      mt(p, C.hx, 0.1, w);
      ik(p, 1, w, -0.1 * L, -0.98 * L, 0.3 * L, 0.6, 0, -1);
      break;
    }
    case 'handOff': {
      const w = envelope(u, 0.25, 0.3);
      ik(p, 1, w, -0.06 * L, -0.32 * L, 0.86 * L, 0.6, -1, -0.1);
      mt(p, C.sx, 0.1, w);
      mt(p, C.hx, 0.05, w);
      break;
    }
    case 'toss': {
      const w = envelope(u, 0.1, 0.25);
      mt(p, C.ikR, 0, w);
      mt(p, C.aRx, trk(u, TOSS_X), w);
      mt(p, C.aRe, 0.25, w);
      mt(p, C.aRo, 0.1, w);
      const k = trk(u, TOSS_K);
      mt(p, C.lLk, 0.5 * k, w);
      mt(p, C.lRk, 0.5 * k, w);
      mt(p, C.lLx, -0.25 * k, w);
      mt(p, C.lRx, -0.25 * k, w);
      mt(p, C.sx, 0.2 * k, w);
      mt(p, C.sRx, -0.6 * smooth01((u - 0.3) / 0.25), w);
      break;
    }
    case 'giggle': {
      const w = envelope(u, 0.15, 0.2);
      const k = Math.abs(Math.sin(at * 14));
      add(p, C.shL, 0.022 * k * w);
      add(p, C.shR, 0.022 * k * w);
      const tgt = headTarget(s, 1, -0.005, -s.headRy * 0.48, s.headRz + 0.03);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 0.8, -1, -0.1);
      mt(p, C.hz, 0.14 + 0.04 * Math.sin(at * 7), w);
      mt(p, C.hx, 0.06, w);
      mt(p, C.sq, 1 - 0.02 * k, w);
      break;
    }
    case 'hug': {
      const w = envelope(u, 0.12, 0.2);
      const close = smooth01((u - 0.2) / 0.18);
      for (const side of [0, 1] as const) ik(p, side, w, mix(0.36, -0.2, close) * L, -0.3 * L, mix(0.78, 0.46, close) * L, 0.9, -0.4, -0.4);
      mt(p, C.bz, 0.04 * Math.sin(at * 3) * close, w);
      mt(p, C.hz, 0.12 * close, w);
      mt(p, C.sx, 0.1 * close, w);
      break;
    }
    case 'nod': {
      const w = envelope(u, 0.1, 0.1);
      add(p, C.hx, 0.24 * Math.sin(u * Math.PI * 4) * w);
      break;
    }
    case 'shakeHead': {
      const w = envelope(u, 0.1, 0.15);
      add(p, C.hy, 0.34 * Math.sin(u * Math.PI * 5) * w);
      add(p, C.hz, 0.05 * w);
      break;
    }
    case 'facepalm': {
      const w = envelope(u, 0.25, 0.25);
      const tgt = headTarget(s, 1, 0, s.headRy * 0.25, s.headRz + 0.035);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 0.9, -1, 0.1);
      mt(p, C.hx, 0.3, w);
      mt(p, C.cx, 0.1, w);
      add(p, C.shL, -0.015 * w);
      add(p, C.shR, -0.015 * w);
      break;
    }
    case 'dance': {
      const w = c.looping ? 1 : envelope(u, 0.12, 0.12);
      const ph = at * 6.3;
      const s1 = Math.sin(ph);
      mt(p, C.pz, 0.12 * s1, w);
      mt(p, C.btx, 0.03 * s1 * s.scale, w);
      add(p, C.hpy, 0.03 * s.scale * Math.abs(Math.cos(ph)) * w);
      mt(p, C.sz, -0.1 * s1, w);
      mt(p, C.hz, 0.12 * Math.sin(ph + 0.6), w);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLx, -0.6 + 0.45 * s1, w);
      mt(p, C.aRx, -0.6 - 0.45 * s1, w);
      mt(p, C.aLe, 1.5, w);
      mt(p, C.aRe, 1.5, w);
      mt(p, C.aLo, 0.3, w);
      mt(p, C.aRo, 0.3, w);
      mt(p, C.lLk, 0.25 * Math.max(0, s1), w);
      mt(p, C.lRk, 0.25 * Math.max(0, -s1), w);
      break;
    }
    case 'hairFlip': {
      const w = envelope(u, 0.1, 0.3);
      const flick = trk(u, [0, 0, 0.3, -0.35, 0.5, 0.12, 1, 0]);
      add(p, C.hz, flick * w);
      add(p, C.hy, trk(u, [0, 0, 0.3, 0.28, 0.55, -0.05, 1, 0]) * w);
      mt(p, C.hx, -0.14, w);
      const out = smooth01((u - 0.25) / 0.2);
      ik(p, 1, w, mix(-0.02, 0.3, out) * L, mix(-0.05, 0.1, out) * L, 0.12 * L, 0.8, -1, -0.2);
      break;
    }
    case 'inspect': {
      const w = envelope(u, 0.2, 0.22);
      const lift = 0.05 * L * Math.sin(at * 3);
      mt(p, C.sx, 0.34, w);
      mt(p, C.hx, 0.16, w);
      mt(p, C.hz, 0.12, w);
      ik(p, 1, w, -0.16 * L, -0.05 * L + lift, 0.82 * L, 0.7, -1, -0.2);
      // Other hand on the hip (mock-serious).
      const hp = rel(s, 0, s.hipW + 0.03, hipJointY(s) + s.legR * 1.3, 0.0, _r);
      ik(p, 0, w, hp[0], hp[1], hp[2], 1, 0.2, -0.8);
      break;
    }
    case 'brushFast': {
      const w = envelope(u, 0.12, 0.15);
      const stroke = 0.5 - 0.5 * Math.cos(at * 22);
      ik(p, 1, w, -0.08 * L, mix(0.2, -0.35, stroke) * L, 0.72 * L, 0.9, -0.6, -0.3);
      mt(p, C.sx, 0.2, w);
      mt(p, C.hx, 0.12, w);
      add(p, C.bz, 0.02 * Math.sin(at * 11) * w);
      break;
    }
    case 'thumbsUp': {
      const w = envelope(u, 0.2, 0.25);
      ik(p, 1, w, 0.04 * L, -0.28 * L, 0.72 * L, 0.7, -1, -0.2);
      mt(p, C.hz, 0.1, w);
      break;
    }
    case 'shh': {
      const w = envelope(u, 0.2, 0.25);
      const tgt = headTarget(s, 1, 0, -s.headRy * 0.5, s.headRz + 0.05);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 0.8, -1, 0);
      mt(p, C.fR, 1, w);
      mt(p, C.sx, 0.1, w);
      mt(p, C.hx, 0.06, w);
      break;
    }
    case 'sleepwalk': {
      const w = c.looping ? 1 : envelope(u, 0.2, 0.2);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLx, -1.05, w);
      mt(p, C.aRx, -1.05, w);
      mt(p, C.aLo, 0.12, w);
      mt(p, C.aRo, 0.12, w);
      mt(p, C.aLe, 0.3, w);
      mt(p, C.aRe, 0.3, w);
      mt(p, C.wLx, 0.55, w);
      mt(p, C.wRx, 0.55, w);
      mt(p, C.hz, 0.16 + 0.05 * Math.sin(at * 1.6), w);
      mt(p, C.hx, 0.12, w);
      add(p, C.bz, 0.035 * Math.sin(at * 2.2) * w);
      break;
    }
    case 'bounce': {
      const w = c.looping ? 1 : envelope(u, 0.05, 0.05);
      const uu = (at / 0.7) % 1;
      add(p, C.hpy, 0.07 * s.scale * trk(uu, BOUNCE_PY) * w);
      set(p, C.sq, mix(get(p, C.sq), trk(uu, BOUNCE_SQ), w));
      const air = trk(uu, BOUNCE_PY);
      for (const b of [C.lLx, C.lRx]) {
        mt(p, b, -0.25 * (1 - air), w);
        mt(p, b + 3, 0.5 * (1 - air), w);
        mt(p, b + 4, 0.2 * air, w);
      }
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLx, -0.4 - 0.8 * air, w);
      mt(p, C.aRx, -0.4 - 0.8 * air, w);
      mt(p, C.aLe, 1.2, w);
      mt(p, C.aRe, 1.2, w);
      mt(p, C.aLo, 0.35, w);
      mt(p, C.aRo, 0.35, w);
      break;
    }
  }
  void env;
}

// ── idle gestures (personality; internal, never reported as `action`) ─────────

export type Gesture = 'rubEye' | 'scratchBeard' | 'stretchNeck' | 'hairTuck' | 'handOnHip' | 'hop' | 'armSwing' | 'lookAround' | 'rockHeels' | 'humSway' | 'twirl' | 'idleWave';

export const GESTURE_DURATION: Readonly<Record<Gesture, number>> = {
  rubEye: 2.2,
  scratchBeard: 2.2,
  stretchNeck: 1.8,
  hairTuck: 1.6,
  handOnHip: 3.6,
  hop: 0.7,
  armSwing: 2.2,
  lookAround: 2.6,
  rockHeels: 2.4,
  humSway: 3.2,
  twirl: 1.5,
  idleWave: 1.8,
};

export const PERSONA_GESTURES: Readonly<Record<Persona, readonly Gesture[]>> = {
  chris: ['rubEye', 'scratchBeard', 'stretchNeck', 'rubEye'],
  ashley: ['handOnHip', 'hairTuck', 'lookAround'],
  addy: ['hop', 'armSwing', 'lookAround', 'hop'],
  ellie: ['rockHeels', 'humSway', 'lookAround'],
  heidi: ['twirl', 'hop', 'twirl', 'lookAround'],
  extra: ['lookAround'],
  kid: ['hop', 'lookAround'],
  guard: ['lookAround'],
  neighbor: ['idleWave', 'lookAround'],
};

/** Seconds between idle gestures [min, max). */
export function gestureInterval(persona: Persona): [number, number] {
  switch (persona) {
    case 'addy':
    case 'heidi':
      return [2.8, 5.5];
    case 'ellie':
    case 'ashley':
      return [4.5, 8];
    case 'chris':
      return [4, 7.5];
    default:
      return [5, 10];
  }
}

export function gestureExpression(g: Gesture): Expression | null {
  switch (g) {
    case 'rubEye':
      return 'sleepy';
    case 'twirl':
    case 'hop':
    case 'humSway':
      return 'joy';
    case 'handOnHip':
    case 'hairTuck':
    case 'armSwing':
    case 'idleWave':
      return 'happy';
    default:
      return null;
  }
}

export function gesturePose(p: Pose, g: Gesture, u: number, c: ActCtx): void {
  const s = c.spec;
  const L = armLen(s);
  const at = c.at;
  switch (g) {
    case 'rubEye': {
      const w = envelope(u, 0.22, 0.25);
      const tgt = headTarget(s, 0, s.headRx * 0.36 + 0.008 * Math.sin(at * 12), s.headRy * (-0.05) + 0.008 * Math.cos(at * 12), s.headRz + 0.035);
      ik(p, 0, w, tgt[0], tgt[1], tgt[2], 0.9, -1, 0);
      mt(p, C.hx, 0.12, w);
      mt(p, C.hz, -0.1, w);
      break;
    }
    case 'scratchBeard': {
      const w = envelope(u, 0.22, 0.25);
      const tgt = headTarget(s, 1, -0.01 + 0.01 * Math.sin(at * 14), -s.headRy * 0.82, s.headRz * 0.6);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 0.9, -1, -0.1);
      mt(p, C.hx, -0.16, w);
      mt(p, C.hz, 0.1, w);
      break;
    }
    case 'stretchNeck': {
      const w = envelope(u, 0.2, 0.2);
      add(p, C.hz, 0.3 * Math.sin(u * Math.PI * 2) * w);
      add(p, C.hx, 0.1 * w);
      break;
    }
    case 'hairTuck': {
      const w = envelope(u, 0.3, 0.3);
      const tgt = headTarget(s, 1, -s.headRx * 0.95, s.headRy * 0.05, s.headRz * 0.05);
      ik(p, 1, w, tgt[0], tgt[1], tgt[2], 1, -0.6, -0.3);
      mt(p, C.hz, 0.14, w);
      break;
    }
    case 'handOnHip': {
      const w = envelope(u, 0.15, 0.15);
      const hp = rel(s, 0, s.hipW + 0.035, hipJointY(s) + s.legR * 1.4, 0.0, _r);
      ik(p, 0, w, hp[0], hp[1], hp[2], 1, 0.2, -0.8);
      mt(p, C.hz, -0.08, w);
      mt(p, C.pz, -0.05, w);
      break;
    }
    case 'hop': {
      const w = envelope(u, 0.05, 0.05);
      add(p, C.hpy, 0.07 * s.scale * trk(u, BOUNCE_PY));
      set(p, C.sq, mix(get(p, C.sq), trk(u, BOUNCE_SQ), w));
      mt(p, C.aLo, 0.4, w);
      mt(p, C.aRo, 0.4, w);
      break;
    }
    case 'armSwing': {
      const w = envelope(u, 0.15, 0.2);
      const k = Math.sin(at * 5);
      mt(p, C.sy, 0.3 * k, w);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLo, 0.35 + 0.25 * k, w);
      mt(p, C.aRo, 0.35 - 0.25 * k, w);
      mt(p, C.aLe, 0.4, w);
      mt(p, C.aRe, 0.4, w);
      break;
    }
    case 'lookAround': {
      const w = envelope(u, 0.15, 0.2);
      add(p, C.hy, trk(u, [0, 0, 0.25, 0.6, 0.5, 0.6, 0.72, -0.55, 0.9, -0.5, 1, 0]) * w);
      add(p, C.hx, -0.05 * w);
      break;
    }
    case 'rockHeels': {
      const w = envelope(u, 0.1, 0.15);
      const k = Math.sin(at * 5);
      add(p, C.lLa, 0.32 * Math.max(0, k) * w);
      add(p, C.lRa, 0.32 * Math.max(0, k) * w);
      add(p, C.lLa, -0.15 * Math.max(0, -k) * w);
      add(p, C.lRa, -0.15 * Math.max(0, -k) * w);
      add(p, C.px, 0.04 * k * w);
      break;
    }
    case 'humSway': {
      const w = envelope(u, 0.2, 0.2);
      const k = Math.sin(at * 3);
      add(p, C.bz, 0.05 * k * w);
      add(p, C.hz, 0.12 * k * w);
      break;
    }
    case 'twirl': {
      const w = envelope(u, 0.04, 0.06);
      set(p, C.by, get(p, C.by) + trk(u, [0, 0, 0.12, 0.2, 0.75, Math.PI * 2 - 0.15, 0.9, Math.PI * 2, 1, Math.PI * 2]));
      add(p, C.hpy, 0.035 * s.scale * Math.sin(Math.min(1, u / 0.85) * Math.PI) * w);
      mt(p, C.ikL, 0, w);
      mt(p, C.ikR, 0, w);
      mt(p, C.aLo, 1.25, w);
      mt(p, C.aRo, 1.25, w);
      mt(p, C.aLe, 0.3, w);
      mt(p, C.aRe, 0.3, w);
      mt(p, C.hx, -0.12, w);
      break;
    }
    case 'idleWave': {
      const w = envelope(u, 0.18, 0.2);
      ik(p, 1, w, 0.3 * L + 0.11 * L * Math.sin(at * 10), 0.6 * L, 0.1 * L, 0.5, -1, -0.1);
      mt(p, C.hz, 0.07, w);
      break;
    }
  }
}
