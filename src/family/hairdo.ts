// ─────────────────────────────────────────────────────────────────────────────
// The family module's own hair (the girls' brushable hair is the hair module's):
//  • Chris: short, tousled, static (a tiny bounce via the hairTop bone).
//  • Ashley: long soft waves past the shoulders — ribbon locks blended over the
//    hair chains (hairBack0-2, hairSide*) so they sway with secondary motion.
//  • Extras: simple short / bun / ponytail styles.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mixHex, shadeHex } from '../render/models/builder';
import { alignY, eul, lockGeometry, sstep } from './geo';
import { B, dirOf, headSurface, type Rig, restPos } from './skeleton';
import type { SkinBuilder, SkinW, WeightFn } from './skin';
import type { BodySpec } from './spec';

export type HairStyle = 'chris' | 'ashley' | 'short' | 'bun' | 'ponytail' | 'buzz' | 'none';

/** Head-centre model position. */
function headC(s: BodySpec): THREE.Vector3 {
  return new THREE.Vector3(0, s.neckY + s.headCY, s.headCZ);
}

/** Point on (or above) the head ellipsoid in head-centre space. */
function onHead(s: BodySpec, yaw: number, pitch: number, lift: number): THREE.Vector3 {
  const d = dirOf(yaw, pitch);
  const n = new THREE.Vector3(d[0] / s.headRx, d[1] / s.headRy, d[2] / s.headRz).normalize();
  return new THREE.Vector3(d[0] * s.headRx + n.x * lift, d[1] * s.headRy + n.y * lift, d[2] * s.headRz + n.z * lift);
}

export function buildHair(sb: SkinBuilder, s: BodySpec, rig: Rig, style: HairStyle, color: number, seed = 1): void {
  switch (style) {
    case 'chris':
      chrisHair(sb, s, color);
      return;
    case 'ashley':
      ashleyHair(sb, s, rig, color);
      return;
    case 'short':
      shortHair(sb, s, color, seed, false);
      return;
    case 'buzz':
      shortHair(sb, s, color, seed, true);
      return;
    case 'bun':
      bunHair(sb, s, color);
      return;
    case 'ponytail':
      ponytailHair(sb, s, rig, color);
      return;
    case 'none':
      return;
  }
}

/** Crown shell (head space → hairTop-local offset applied by the caller). */
function shell(b: ReturnType<SkinBuilder['on']>, s: BodySpec, C: [number, number, number], color: number, thetaMax: number, tilt: number, k = 1.06, seg = 14): void {
  b.add(new THREE.SphereGeometry(1, seg, 7, 0, Math.PI * 2, 0, thetaMax), color, { at: C, rot: [tilt, 0, 0], scale: [s.headRx * k, s.headRy * k, s.headRz * (k + 0.01)], smooth: true });
}

/** Flattened lobe of hair lying on the scalp: long axis along the sweep direction on the surface. */
function lobe(b: ReturnType<SkinBuilder['on']>, s: BodySpec, C: [number, number, number], yaw: number, pitch: number, dYaw: number, dPitch: number, len: number, wid: number, thick: number, lift: number, color: number, seed: number, ink = true): void {
  const p0 = onHead(s, yaw, pitch, lift);
  const p1 = onHead(s, yaw + dYaw * 0.3, pitch + dPitch * 0.3, lift);
  const n = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch) / s.headRx, Math.sin(pitch) / s.headRy, Math.cos(yaw) * Math.cos(pitch) / s.headRz).normalize();
  const t = p1.sub(p0).addScaledVector(n, -p1.dot(n)).normalize();
  const side = new THREE.Vector3().crossVectors(n, t).normalize();
  const m = new THREE.Matrix4().makeBasis(side, n, t);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  b.sphere(1, 7, 5, color, { at: [p0.x + C[0], p0.y + C[1], p0.z + C[2]], rot: eul(q), scale: [wid, thick, len], smooth: true, jitter: 0.0015, seed, ink });
}

function chrisHair(sb: SkinBuilder, s: BodySpec, color: number): void {
  const b = sb.on(B.hairTop);
  // hairTop sits at (0, cy + ry·0.35, cz) in head space → head centre relative to it:
  const C: [number, number, number] = [0, -s.headRy * 0.35, 0];
  const dark = shadeHex(color, 0.86);
  const light = mixHex(color, 0xffffff, 0.07);
  shell(b, s, C, color, 1.4, -0.52, 1.05);
  // Short tousled cut: soft lobes lying on the scalp, a fringe swept to his left, a couple of crown flicks.
  const L: [number, number, number, number, number, number, number, number][] = [
    // yaw, pitch, dYaw, dPitch, len, wid, thick, lift
    [-0.62, 0.78, 0.6, 0.1, 0.075, 0.05, 0.022, 0.018],
    [-0.3, 0.86, 0.7, -0.05, 0.085, 0.056, 0.026, 0.02],
    [0.05, 0.9, 0.75, -0.12, 0.085, 0.056, 0.026, 0.022],
    [0.42, 0.82, 0.6, -0.25, 0.075, 0.05, 0.024, 0.02],
    [0.78, 0.66, 0.3, -0.35, 0.06, 0.042, 0.02, 0.016],
    [-0.15, 1.18, 0.4, -0.6, 0.08, 0.06, 0.026, 0.02],
    [0.35, 1.2, 0.5, -0.5, 0.075, 0.055, 0.024, 0.02],
    [-0.9, 0.55, 0.2, -0.3, 0.06, 0.04, 0.02, 0.014],
    [Math.PI - 0.35, 1.25, 0.5, 0.35, 0.07, 0.05, 0.022, 0.016],
  ];
  L.forEach(([yaw, pitch, dy, dp, len, wid, th, lift], i) => lobe(b, s, C, yaw, pitch, dy, dp, len, wid, th, lift, i === 2 || i === 6 ? light : color, 20 + i, i < 7));
  // Sideburns down to the ears (meet the beard).
  for (const sd of [-1, 1] as const) {
    const p = onHead(s, sd * 1.32, 0.02, 0.004);
    b.sphere(s.headRx * 0.2, 6, 3, dark, { at: [p.x + C[0], p.y + C[1], p.z + C[2]], rot: eul(headSurface(s, sd * 1.32, 0.02).quat), scale: [0.9, 1.6, 0.3], smooth: true, ink: false });
  }
}

function shortHair(sb: SkinBuilder, s: BodySpec, color: number, seed: number, buzz: boolean): void {
  const b = sb.on(B.hairTop);
  const C: [number, number, number] = [0, -s.headRy * 0.35, 0];
  shell(b, s, C, buzz ? mixHex(color, 0xf0c8a0, 0.25) : color, 1.45, -0.48, buzz ? 1.02 : 1.05, 14);
  if (buzz) return;
  for (let i = 0; i < 4; i++) {
    const yaw = -0.5 + i * 0.33 + ((seed % 3) - 1) * 0.1;
    const base = onHead(s, yaw, 0.9, 0.01);
    const dir = new THREE.Vector3(0.4, 0.35, 0.8).normalize();
    b.sphere(0.045, 6, 4, color, { at: [base.x + C[0], base.y + C[1], base.z + C[2]], rot: alignY(dir), scale: [1, 1.6, 0.6], smooth: true });
  }
}

function bunHair(sb: SkinBuilder, s: BodySpec, color: number): void {
  const b = sb.on(B.hairTop);
  const C: [number, number, number] = [0, -s.headRy * 0.35, 0];
  shell(b, s, C, color, 1.6, -0.35, 1.06, 14);
  const top = onHead(s, Math.PI, 1.15, 0.05);
  b.sphere(s.headRx * 0.42, 10, 7, color, { at: [top.x, top.y + C[1], top.z], smooth: true, jitter: 0.003, seed: 3 });
  // Soft side-swept fringe.
  const f = onHead(s, 0.25, 0.9, 0.02);
  b.sphere(s.headRx * 0.5, 9, 6, color, { at: [f.x, f.y + C[1], f.z], rot: [0.3, 0, -0.5], scale: [1.3, 0.5, 0.8], smooth: true });
}

function ponytailHair(sb: SkinBuilder, s: BodySpec, rig: Rig, color: number): void {
  const b = sb.on(B.hairTop);
  const C: [number, number, number] = [0, -s.headRy * 0.35, 0];
  shell(b, s, C, color, 1.58, -0.38, 1.06, 14);
  const f = onHead(s, -0.2, 0.85, 0.018);
  b.sphere(s.headRx * 0.55, 9, 6, color, { at: [f.x, f.y + C[1], f.z], rot: [0.4, 0, 0.35], scale: [1.3, 0.45, 0.8], smooth: true });
  // Ponytail on the back chain (sways).
  const hc = headC(s);
  const b0 = restPos(rig, B.hairBack0);
  const b1 = restPos(rig, B.hairBack1);
  const wfn = chainWeights(hc.y + s.headRy * 0.1, b0.y - 0.02, b1.y, b1.y - 0.2, false);
  const p = sb.blend(B.base, wfn);
  const root = onHead(s, Math.PI, 0.35, 0.02).add(hc);
  p.torus(0.028, 0.012, 5, 10, mixHex(color, 0xff7a6b, 0.8), { at: [root.x, root.y, root.z - 0.01], rot: [0.5, 0, 0], ink: false });
  const pts = [root, root.clone().add(new THREE.Vector3(0, -0.05, -0.06)), root.clone().add(new THREE.Vector3(0, -0.14, -0.08)), root.clone().add(new THREE.Vector3(0, -0.24, -0.06)), root.clone().add(new THREE.Vector3(0, -0.3, -0.04))];
  const outs = pts.map(() => new THREE.Vector3(0, 0.2, -1).normalize());
  p.add(lockGeometry(pts, [0.03, 0.042, 0.04, 0.028, 0.012], [0.028, 0.036, 0.034, 0.024, 0.01], outs, 6), color, { smooth: true });
}

/** Weights down a hair chain by model height: head → c0 → c1 → c2 (side = use side chains by x sign). */
function chainWeights(yHead: number, y0: number, y1: number, y2: number, side: boolean): WeightFn {
  return (x, y, _z, o: SkinW) => {
    const w0 = sstep(yHead, y0, y);
    const w1 = sstep(y0 - 0.02, y1, y);
    const w2 = sstep(y1 - 0.02, y2, y);
    const c0 = side ? (x >= 0 ? B.hairSideL0 : B.hairSideR0) : B.hairBack0;
    const c1 = side ? (x >= 0 ? B.hairSideL1 : B.hairSideR1) : B.hairBack1;
    const c2 = side ? c1 : B.hairBack2;
    o.i[0] = B.head;
    o.w[0] = 1 - w0;
    o.i[1] = c0;
    o.w[1] = w0 - w1;
    o.i[2] = c1;
    o.w[2] = w1 - (side ? 0 : w2);
    o.i[3] = c2;
    o.w[3] = side ? 0 : w2;
  };
}

function ashleyHair(sb: SkinBuilder, s: BodySpec, rig: Rig, color: number): void {
  const hc = headC(s);
  const root = shadeHex(color, 0.9);
  const light = mixHex(color, 0xffe2c0, 0.16);
  // Scalp cap (rigid on the head) with a soft side part on her right.
  const cap = sb.on(B.head);
  const C: [number, number, number] = [0, s.headCY, s.headCZ];
  cap.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, 1.8), color, { at: C, rot: [-0.66, 0, 0], scale: [s.headRx * 1.075, s.headRy * 1.07, s.headRz * 1.1], smooth: true });
  // Volume at the back of the head (under the locks).
  cap.sphere(1, 10, 6, root, { at: [0, C[1] - s.headRy * 0.2, C[2] - s.headRz * 0.35], scale: [s.headRx * 1.02, s.headRy * 0.95, s.headRz * 0.78], smooth: true, ink: false });

  const b0 = restPos(rig, B.hairBack0);
  const b1 = restPos(rig, B.hairBack1);
  const b2 = restPos(rig, B.hairBack2);
  const backW = chainWeights(hc.y + s.headRy * 0.35, hc.y - s.headRy * 0.35, b1.y - 0.05, b2.y - 0.06, false);
  const sideW = chainWeights(hc.y + s.headRy * 0.2, hc.y - s.headRy * 0.4, hc.y - s.headRy * 1.1, hc.y - s.headRy * 1.2, true);
  const back = sb.blend(B.base, backW);
  const side = sb.blend(B.base, sideW);

  const tipY = s.shoulderY - 0.24 - hc.y; // head-space y of the back tips (past the shoulders)
  const torsoBack = (x: number): number => {
    const w = s.torsoW * 1.02;
    const d = s.torsoD;
    const k = Math.max(0, 1 - (x / w) * (x / w));
    return -(d * Math.sqrt(k)) - hc.z - 0.028;
  };
  const shoulderTop = s.shoulderY + s.armR * 0.9 - hc.y;

  // Back + side-back locks: over the crown, down the back of the head, falling behind the shoulders in soft waves.
  const backYaws = [-1.0, -0.66, -0.33, 0, 0.33, 0.66, 1.0, -1.32, 1.32];
  backYaws.forEach((a, i) => {
    const yaw = Math.PI + a;
    const pts: THREE.Vector3[] = [];
    const wv: number[] = [];
    const tv: number[] = [];
    const outs: THREE.Vector3[] = [];
    const lift = 0.02 + (Math.abs(a) > 1.1 ? 0.012 : 0);
    const p0 = onHead(s, yaw, 0.75, lift * 0.6);
    const p1 = onHead(s, yaw, 0.25, lift);
    const p2 = onHead(s, yaw, -0.25, lift * 1.25);
    const p3 = onHead(s, yaw, -0.62, lift * 1.2);
    pts.push(p0, p1, p2, p3);
    // Fall: keep x (slightly outward), z behind the back, gentle S-waves.
    const len = p3.y - tipY;
    const n = 6;
    const outward = Math.sign(p3.x || 1) * Math.min(0.02, Math.abs(p3.x) * 0.12);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const y = p3.y - len * t;
      const wave = Math.sin(t * Math.PI * 2.2 + i * 1.3) * 0.012;
      const x = p3.x + outward * t + wave * (Math.abs(a) > 0.5 ? Math.sign(a) : 1);
      let z = Math.min(p3.z, torsoBack(x) - 0.005) + Math.cos(t * Math.PI * 2 + i) * 0.006;
      if (y > shoulderTop) z = Math.min(z, p3.z);
      pts.push(new THREE.Vector3(x, y, z));
    }
    for (let k = 0; k < pts.length; k++) {
      const t = k / (pts.length - 1);
      wv.push((Math.abs(a) > 1.1 ? 0.034 : 0.04) * (1 - t * 0.55) + (k === 0 ? -0.01 : 0));
      tv.push(0.016 * (1 - t * 0.5));
      const p = pts[k]!;
      outs.push(new THREE.Vector3(p.x * 0.6, k < 4 ? p.y * 0.3 : 0, Math.min(-0.3, p.z)).normalize());
    }
    const col = i % 3 === 1 ? light : i % 3 === 2 ? root : color;
    back.add(lockGeometry(pts.map((p) => p.clone().add(hc)), wv, tv, outs, 6), col, { smooth: true });
  });

  // Side locks behind the ears, to the shoulders.
  for (const sd of [-1, 1] as const) {
    const yaw = sd * 1.9;
    const p0 = onHead(s, yaw, 0.7, 0.012);
    const p1 = onHead(s, yaw, 0.2, 0.03);
    const p2 = onHead(s, yaw, -0.3, 0.04);
    const pts = [p0, p1, p2];
    const x3 = p2.x + sd * 0.012;
    const n = 5;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const y = p2.y - (p2.y - (tipY + 0.06)) * t;
      const x = x3 + Math.sin(t * Math.PI * 2 + sd) * 0.01;
      pts.push(new THREE.Vector3(x, y, Math.min(p2.z, torsoBack(x) - 0.01) - 0.01));
    }
    const wv = pts.map((_, k) => 0.036 * (1 - (k / (pts.length - 1)) * 0.55));
    const tv = pts.map((_, k) => 0.015 * (1 - (k / (pts.length - 1)) * 0.5));
    const outs = pts.map((p) => new THREE.Vector3(p.x, 0.1, -0.4).normalize());
    back.add(lockGeometry(pts.map((p) => p.clone().add(hc)), wv, tv, outs, 6), sd > 0 ? color : light, { smooth: true });
  }

  // Side-swept fringe: from the part (her right) across the forehead, framing her left cheek to the jaw.
  {
    const path: [number, number, number][] = [
      [-0.46, 1.22, 0.012],
      [-0.08, 1.02, 0.02],
      [0.36, 0.86, 0.024],
      [0.8, 0.62, 0.028],
      [1.12, 0.22, 0.032],
      [1.24, -0.26, 0.03],
      [1.14, -0.7, 0.026],
    ];
    const pts = path.map(([y, p, l]) => onHead(s, y, p, l));
    const wv = [0.026, 0.042, 0.04, 0.036, 0.034, 0.03, 0.016];
    const tv = [0.012, 0.016, 0.016, 0.016, 0.015, 0.013, 0.008];
    const outs = path.map(([y, p]) => new THREE.Vector3(...dirOf(y, p)));
    side.add(lockGeometry(pts.map((p) => p.clone().add(hc)), wv, tv, outs, 6), color, { smooth: true });
  }
  // Framing lock on her right side (from the part down past the temple to the jaw).
  {
    const path: [number, number, number][] = [
      [-0.62, 1.05, 0.012],
      [-0.95, 0.66, 0.026],
      [-1.2, 0.2, 0.032],
      [-1.26, -0.28, 0.032],
      [-1.16, -0.7, 0.026],
    ];
    const pts = path.map(([y, p, l]) => onHead(s, y, p, l));
    const wv = [0.028, 0.042, 0.042, 0.036, 0.018];
    const tv = [0.012, 0.016, 0.016, 0.014, 0.008];
    const outs = path.map(([y, p]) => new THREE.Vector3(...dirOf(y, p)));
    side.add(lockGeometry(pts.map((p) => p.clone().add(hc)), wv, tv, outs, 6), light, { smooth: true });
  }
  void b0;
}

export { headC };
