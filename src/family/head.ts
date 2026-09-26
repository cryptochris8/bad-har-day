// ─────────────────────────────────────────────────────────────────────────────
// Head + face geometry (build time). Everything is authored in the local rest
// frame of the bone it is bound to (see skeleton.ts): the skull/nose/ears/beard/
// glasses on the head bone, each face feature on its own bone so expressions can
// swap/scale it. Face-bone frames: +Z out of the face, +Y up along the face.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { type GeoBuilder, mixHex, shadeHex } from '../render/models/builder';
import { alignY, eul, starPoints } from './geo';
import { B, EYE_SCALE, F, MOUTHS, faceBone, headSurface, mouthBone, type MouthKind, type V3 } from './skeleton';
import type { SkinBuilder } from './skin';
import type { BodySpec } from './spec';

export interface HeadStyle {
  skin: number;
  /** Iris colour. */
  eyes: number;
  /** Hair colour (brows derive from it). */
  hair: number;
  lashes: boolean;
  /** Glasses frame colour, or null. */
  glasses: number | null;
  beard: 'none' | 'stubble' | 'beard';
  brows: 'soft' | 'thick' | 'arched';
  /** Ears hidden under long hair are skipped. */
  ears: boolean;
  /** Ellie's star clip colour (above her left ear, outside the hair), or null. */
  starClip: number | null;
  /** Fewer segments + fewer mouth shapes (extras). */
  low: boolean;
}

const AX = new THREE.Vector3(1, 0, 0);

function c(s: BodySpec): V3 {
  return [0, s.headCY, s.headCZ];
}

/** Mouths built for low-detail heads (extras); other kinds fall back to the nearest one. */
export const LOW_MOUTHS: readonly MouthKind[] = ['smile', 'bigSmile', 'grin', 'open', 'o', 'yawn'];

export function buildHead(sb: SkinBuilder, s: BodySpec, st: HeadStyle): void {
  const skin = st.skin;
  const C = c(s);
  const low = st.low;
  const hb = sb.on(B.head);
  // Skull: one clean, soft ellipsoid (cleanest cartoon read).
  hb.sphere(1, low ? 12 : 15, low ? 9 : 10, skin, { at: C, scale: [s.headRx, s.headRy, s.headRz], smooth: true });
  // Neck (bottom hidden in the collar).
  const neckR = s.headRx * (s.kid ? 0.3 : 0.32);
  const neckTop = s.headCY * 0.55;
  const neckBot = -(s.neckY - s.shoulderY) - 0.02;
  hb.cyl(neckR, neckR * 1.08, neckTop - neckBot, 8, skin, { at: [0, (neckTop + neckBot) / 2, -0.004], smooth: true, ink: false });

  // Ears.
  if (st.ears) {
    for (const sd of [-1, 1] as const) {
      const p = headSurface(s, sd * 1.52, s.eyePitch - 0.12, -s.headRx * 0.08);
      hb.sphere(s.headRx * 0.2, 7, 5, skin, { at: p.pos, scale: [0.5, 1, 0.78], smooth: true });
      hb.sphere(s.headRx * 0.11, 5, 3, shadeHex(skin, 0.82), { at: [p.pos[0] + sd * s.headRx * 0.07, p.pos[1], p.pos[2] + 0.004], scale: [0.35, 1, 0.7], ink: false, smooth: true });
    }
  }
  // Button nose (a little rosy). Un-inked: small features get heavy halos from the hull; a darker
  // underside gives it shape instead.
  const np = headSurface(s, 0, s.nosePitch, -s.headRz * 0.02);
  const nr = s.headRx * (s.kid ? 0.105 : 0.12);
  const nq = eul(np.quat);
  hb.sphere(nr, 8, 6, mixHex(shadeHex(skin, 0.97), PAL.blush, 0.16), { at: np.pos, rot: nq, scale: [1.15, 0.9, 0.9], smooth: true, ink: false });
  const nd = headSurface(s, 0, s.nosePitch - 0.05, -s.headRz * 0.035);
  hb.sphere(nr * 0.95, 8, 4, mixHex(shadeHex(skin, 0.78), PAL.blush, 0.2), { at: nd.pos, rot: nq, scale: [1.1, 0.7, 0.8], smooth: true, ink: false });

  if (st.beard !== 'none') beard(sb, s, st);
  if (st.glasses !== null) glasses(sb, s, st.glasses);
  if (st.starClip !== null) starClip(sb, s, st.starClip);

  for (const sd of [1, -1] as const) eyeParts(sb, s, st, sd);
  const kinds = low ? LOW_MOUTHS : MOUTHS;
  for (const k of kinds) mouth(sb, s, k);
}

// ── eyes ──────────────────────────────────────────────────────────────────────

function eyeParts(sb: SkinBuilder, s: BodySpec, st: HeadStyle, sd: 1 | -1): void {
  const er = s.eyeR;
  const ex = er * EYE_SCALE[0];
  const ey = er * EYE_SCALE[1];
  const low = st.low;
  const ink = PAL.eyeInk;
  // Open eye: white lens (front half-ellipsoid) + crisp ink rim.
  const eo = sb.on(faceBone(sd, F.open), false);
  eo.add(new THREE.SphereGeometry(er, low ? 8 : 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), PAL.eyeWhite, {
    rot: [Math.PI / 2, 0, 0],
    scale: [EYE_SCALE[0], EYE_SCALE[2], EYE_SCALE[1]],
    smooth: true,
  });
  eo.torus(er, er * 0.07, 3, 10, ink, { scale: [EYE_SCALE[0] * 1.03, EYE_SCALE[1] * 1.03, 1] });
  // Thicker upper-rim lash line (friendly, less "googly").
  eo.torus(er, er * 0.105, 3, low ? 7 : 9, ink, { at: [0, 0, -er * 0.01], rot: [0, 0, 0.16], scale: [EYE_SCALE[0] * 1.05, EYE_SCALE[1] * 1.04, 1] }, Math.PI - 0.32);
  // Iris + pupil + glints (moves for look direction, scales for pupil size).
  const ir = sb.on(faceBone(sd, F.iris), false);
  const irR = er * s.iris;
  const dome = (r: number, w: number, h: number, col: number, at: V3, sx: number, sy: number, sz: number, glow = 0) =>
    ir.add(new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, Math.PI / 2), col, { at, rot: [Math.PI / 2, 0, 0], scale: [sx, sz, sy], smooth: true, glow });
  const z0 = er * 0.4;
  const dz = irR * 0.24;
  dome(irR, low ? 8 : 10, 3, st.eyes, [0, -er * 0.04, z0], 0.8, 0.94, 0.24);
  if (!low) dome(irR * 0.78, 8, 2, mixHex(st.eyes, 0xffffff, 0.22), [0, -er * 0.04 - irR * 0.3, z0 + dz * 0.55], 0.62, 0.42, 0.24);
  dome(irR * 0.56, 8, 2, mixHex(ink, st.eyes, 0.12), [0, -er * 0.03, z0 + dz * 0.72], 0.8, 0.94, 0.24);
  dome(er * 0.2, 6, 2, 0xffffff, [-er * 0.17, er * 0.17, z0 + dz * 1.15], 1, 1.1, 0.3, 0xffffff);
  dome(er * 0.09, 5, 2, 0xffffff, [er * 0.19, -er * 0.22, z0 + dz * 1.05], 1, 1, 0.3, 0xffffff);

  // Upper lid: quarter shell hanging from the pivot at the eye top; bone scale.y 0 → 1 closes it.
  const H = ey * 2.04;
  const lidRx = ex * 1.16;
  const lidRz = er * 0.74;
  const lidCol = mixHex(shadeHex(st.skin, 0.88), PAL.blush, 0.06);
  const lu = sb.on(faceBone(sd, F.lidU), false);
  lu.add(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI, 0, Math.PI / 2), lidCol, { at: [0, -H, 0], scale: [lidRx, H, lidRz], smooth: true });
  // Lower lid (smiling / squinting eyes): rises from the eye bottom.
  if (!low) {
    const ld = sb.on(faceBone(sd, F.lidD), false);
    ld.add(new THREE.SphereGeometry(1, 8, 3, 0, Math.PI, Math.PI / 2, Math.PI / 2), lidCol, { at: [0, H, 0], scale: [lidRx, H, lidRz], smooth: true });
  }
  // Lid-edge lash line (rides the upper lid edge: the rig moves this bone down and narrows it with the
  // lid) + two lash flicks at the outer corner for the girls and Ashley.
  const la = sb.on(faceBone(sd, F.lash), false);
  la.torus(1, 0.075, 3, low ? 8 : 10, ink, { rot: [Math.PI / 2, 0, 0], scale: [lidRx * 1.02, lidRz * 1.02, er * 1.35] }, Math.PI);
  for (const e of [-1, 1]) la.sphere(er * 0.1, 5, 3, ink, { at: [e * lidRx * 1.02, 0, 0], scale: [1, 0.75, 1] });
  if (st.lashes) {
    const outer = sd; // outer corner is +x for the left eye (sd = +1)
    for (const [t0, len] of [
      [0.28, 0.46],
      [0.62, 0.38],
    ] as const) {
      const t = outer > 0 ? t0 : Math.PI - t0;
      const base: V3 = [Math.cos(t) * ex * 1.06, Math.sin(t) * ey * 1.05, er * 0.02];
      const d = new THREE.Vector3(Math.cos(t) + outer * 0.9, Math.sin(t) + 0.5, 0.25).normalize();
      const L = er * len;
      eo.cone(er * 0.07, L, 3, ink, { at: [base[0] + (d.x * L) / 2, base[1] + (d.y * L) / 2, base[2] + (d.z * L) / 2], rot: alignY(d), ink: false });
    }
  }
  // Joy eyes ^^ (upward arcs).
  const tube = er * 0.17;
  const jy = sb.on(faceBone(sd, F.joy), false);
  jy.torus(er * 0.56, tube, 3, 10, ink, { at: [0, -er * 0.18, er * 0.26], scale: [1.05, 1, 0.6] }, Math.PI);
  for (const x of [-1, 1]) jy.sphere(tube, 5, 3, ink, { at: [x * er * 0.56 * 1.05, -er * 0.18, er * 0.26], scale: [1, 1, 0.6] });
  // Closed, peaceful (asleep) — gentle downward arcs (+ lash flicks).
  const cl = sb.on(faceBone(sd, F.closed), false);
  cl.torus(er * 0.56, tube * 0.9, 3, 10, ink, { at: [0, er * 0.12, er * 0.26], rot: [0, 0, Math.PI], scale: [1.05, 0.7, 0.6] }, Math.PI);
  for (const x of [-1, 1]) cl.sphere(tube * 0.9, 5, 3, ink, { at: [x * er * 0.56 * 1.05, er * 0.12, er * 0.26], scale: [1, 1, 0.6] });
  if (st.lashes) {
    const ox = sd * er * 0.56 * 1.05;
    for (const k of [0, 1]) {
      const d = new THREE.Vector3(sd * (0.9 - k * 0.35), -0.55 - k * 0.3, 0.2).normalize();
      const L = er * 0.32;
      cl.cone(er * 0.06, L, 3, ink, { at: [ox - sd * k * er * 0.18 + (d.x * L) / 2, er * 0.1 - k * er * 0.12 + (d.y * L) / 2, er * 0.28], rot: alignY(d), ink: false });
    }
  }
  // Squeeze > < (chevrons pointing toward the nose).
  const sq = sb.on(faceBone(sd, F.squeeze), false);
  const inward = -sd;
  const tip: V3 = [inward * er * 0.42, 0, er * 0.26];
  for (const arm of [-1, 1]) {
    const end: V3 = [-inward * er * 0.42, arm * er * 0.42, er * 0.26];
    const d = new THREE.Vector3(end[0] - tip[0], end[1] - tip[1], 0);
    sq.cyl(tube, tube, d.length(), 5, ink, { at: [(tip[0] + end[0]) / 2, (tip[1] + end[1]) / 2, er * 0.26], rot: alignY(d), scale: [1, 1, 0.6] });
    sq.sphere(tube, 5, 3, ink, { at: end, scale: [1, 1, 0.6] });
  }
  sq.sphere(tube, 5, 3, ink, { at: tip, scale: [1, 1, 0.6] });

  // Brow.
  const br = sb.on(faceBone(sd, F.brow), false);
  const browCol = shadeHex(st.hair, st.hair < 0x303030 ? 1.25 : st.brows === 'soft' ? 0.92 : 0.82);
  const R = er * (st.brows === 'arched' ? 1.2 : 1.35);
  const bt = er * (st.brows === 'thick' ? 0.22 : st.brows === 'soft' ? 0.15 : 0.14);
  const arc = st.brows === 'arched' ? 1.15 : 0.95;
  br.torus(R, bt, 3, 8, browCol, { at: [0, -R, 0], rot: [0, 0, Math.PI / 2 - arc / 2], scale: [1, 1, 0.6], smooth: true }, arc);
  for (const e of [-1, 1]) {
    const a = Math.PI / 2 + (e * arc) / 2;
    br.sphere(bt, 5, 3, browCol, { at: [Math.cos(a) * R, Math.sin(a) * R - R, 0], scale: [1, 1, 0.6], smooth: true });
  }
  // Blush: a surface-conforming oval patch (no grazing slivers), authored in head space then moved into
  // the blush bone's frame (the rig scales it for more / less blush).
  const bl = sb.on(faceBone(sd, F.blush), false);
  const byaw = sd * (s.eyeYaw + 0.16);
  const bp = s.eyePitch - 0.3;
  const patch = headPatch(s, 1.0035, byaw - 0.2, byaw + 0.2, 8, 3, (y) => bp - 0.1 * Math.sqrt(Math.max(0, 1 - ((y - byaw) / 0.2) ** 2)), (y) => bp + 0.1 * Math.sqrt(Math.max(0, 1 - ((y - byaw) / 0.2) ** 2)));
  const bsp = headSurface(s, byaw, bp, -0.0045);
  patch.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...bsp.pos), bsp.quat, new THREE.Vector3(1, 1, 1)).invert());
  bl.add(patch, mixHex(st.skin, PAL.blush, 0.5), { smooth: true });
}

// ── mouths ───────────────────────────────────────────────────────────────────

function mouth(sb: SkinBuilder, s: BodySpec, kind: MouthKind): void {
  const Rh = (s.headRx + s.headRz) / 2;
  const bend = (v: THREE.Vector3) => {
    v.z -= (v.x * v.x) / (2 * Rh);
  };
  const b = sb.on(mouthBone(kind), false, bend);
  const w = s.headRx * (s.kid ? 0.2 : 0.19);
  const lt = w * 0.13;
  const lip = PAL.lipLine;
  const cap = (x: number, y: number, r = lt) => b.sphere(r, 4, 3, lip, { at: [x, y, 0], ink: false });
  const arcLine = (R: number, arcLen: number, centre: number, at: V3, t = lt) => {
    b.torus(R, t, 3, 8, lip, { at, rot: [0, 0, centre - arcLen / 2], ink: false }, arcLen);
    const a0 = centre - arcLen / 2;
    const a1 = centre + arcLen / 2;
    cap(at[0] + Math.cos(a0) * R, at[1] + Math.sin(a0) * R, t);
    cap(at[0] + Math.cos(a1) * R, at[1] + Math.sin(a1) * R, t);
  };
  switch (kind) {
    case 'smile':
      arcLine(w * 0.9, 2.0, -Math.PI / 2, [0, w * 0.46, 0]);
      break;
    case 'bigSmile':
      arcLine(w * 1.05, 2.4, -Math.PI / 2, [0, w * 0.52, 0], lt * 1.1);
      break;
    case 'smirk':
      arcLine(w * 0.82, 1.5, -Math.PI / 2 + 0.45, [w * 0.12, w * 0.36, 0]);
      break;
    case 'wavy': {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector3((t - 0.5) * w * 1.7, Math.sin(t * Math.PI * 3) * w * 0.16, 0));
      }
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, lt, 3, false), lip, { ink: false });
      cap(-w * 0.85, 0);
      cap(w * 0.85, 0);
      break;
    }
    case 'grin': {
      const top = w * 0.2;
      const h = w * 0.95;
      const n = 7;
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const x = -w + (2 * w * i) / n;
        pts.push([x, top + 0.2 * w * (x / w) * (x / w)]);
      }
      for (let i = 1; i < n; i++) {
        const t = Math.PI - (Math.PI * i) / n;
        pts.push([Math.cos(t) * w * 0.98, top - Math.sin(t) * h]);
      }
      pts.reverse();
      b.extrude(pts, Rh * 0.03, PAL.mouthDark, {});
      const tp: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const x = (-w + (2 * w * i) / n) * 0.84;
        tp.push([x, top + 0.2 * w * (x / w) * (x / w) - w * 0.03]);
      }
      for (let i = n; i >= 0; i--) {
        const x = (-w + (2 * w * i) / n) * 0.72;
        tp.push([x, top + 0.16 * w * (x / w) * (x / w) - w * 0.3]);
      }
      tp.reverse();
      b.extrude(tp, Rh * 0.012, PAL.teeth, { at: [0, 0, Rh * 0.012], ink: false });
      b.sphere(w * 0.46, 6, 3, PAL.tongue, { at: [0, top - h * 0.7, Rh * 0.008], scale: [1.15, 0.6, 0.2], ink: false });
      break;
    }
    case 'open':
    case 'yawn':
    case 'o': {
      const rx = kind === 'open' ? w * 0.52 : kind === 'yawn' ? w * 0.66 : w * 0.3;
      const ry = kind === 'open' ? w * 0.6 : kind === 'yawn' ? w * 1.08 : w * 0.36;
      const cy = kind === 'yawn' ? -w * 0.35 : kind === 'open' ? -w * 0.12 : -w * 0.05;
      const pts: [number, number][] = [];
      const n = kind === 'o' ? 8 : 10;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        pts.push([Math.cos(t) * rx, cy + Math.sin(t) * ry]);
      }
      b.extrude(pts, Rh * 0.03, PAL.mouthDark, {});
      if (kind !== 'o') b.sphere(rx * 0.62, 6, 3, PAL.tongue, { at: [0, cy - ry * 0.52, Rh * 0.01], scale: [1.1, 0.55, 0.2], ink: false });
      if (kind === 'yawn') b.sphere(rx * 0.55, 6, 3, PAL.teeth, { at: [0, cy + ry * 0.86, Rh * 0.012], scale: [1.2, 0.22, 0.2], ink: false });
      break;
    }
    case 'pout': {
      const pc = mixHex(PAL.tongue, PAL.lipLine, 0.45);
      b.torus(w * 0.24, w * 0.12, 3, 9, pc, { at: [0, -w * 0.05, w * 0.03], scale: [1, 0.72, 1], ink: false });
      b.sphere(w * 0.1, 5, 3, PAL.mouthDark, { at: [0, -w * 0.05, w * 0.05], scale: [1, 0.6, 0.4], ink: false });
      break;
    }
    case 'eek': {
      const hw = w * 1.0;
      const hh = w * 0.34;
      const n = 6;
      const pts: [number, number][] = [];
      const lift = (x: number) => 0.3 * w * (x / hw) * (x / hw);
      for (let i = 0; i <= n; i++) {
        const x = -hw + (2 * hw * i) / n;
        pts.push([x, -hh + lift(x) * 0.6]);
      }
      for (let i = n; i >= 0; i--) {
        const x = -hw + (2 * hw * i) / n;
        pts.push([x, hh + lift(x)]);
      }
      b.extrude(pts, Rh * 0.03, PAL.teeth, {});
      const rim = pts.map(([x, y]) => new THREE.Vector3(x, y, Rh * 0.016));
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 10, lt * 0.8, 3, true), lip, {});
      b.box(hw * 1.8, lt * 0.55, lt * 0.5, lip, { at: [0, w * 0.06, Rh * 0.016], ink: false });
      for (let i = 0; i < 2; i++) {
        const x = (-0.5 + (i + 1) / 3) * hw * 1.9;
        b.box(lt * 0.5, hh * 1.7, lt * 0.5, lip, { at: [x, lift(x) * 0.8, Rh * 0.016], ink: false });
      }
      break;
    }
  }
}

// ── beard, glasses, clip ───────────────────────────────────────────────────────

/** Parametric patch on the head ellipsoid: yaw columns × pitch rows from `bottom` up to `top(yaw)`. */
function headPatch(s: BodySpec, k: number, yaw0: number, yaw1: number, cols: number, rows: number, bottom: (yaw: number) => number, top: (yaw: number) => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const C = c(s);
  for (let i = 0; i <= cols; i++) {
    const yaw = yaw0 + ((yaw1 - yaw0) * i) / cols;
    const p0 = bottom(yaw);
    const p1 = top(yaw);
    for (let j = 0; j <= rows; j++) {
      const pitch = p0 + ((p1 - p0) * j) / rows;
      pos.push(C[0] + Math.sin(yaw) * Math.cos(pitch) * s.headRx * k, C[1] + Math.sin(pitch) * s.headRy * k, C[2] + Math.cos(yaw) * Math.cos(pitch) * s.headRz * k);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = i * (rows + 1) + j;
      const b = (i + 1) * (rows + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function beard(sb: SkinBuilder, s: BodySpec, st: HeadStyle): void {
  const b = sb.on(B.head);
  const col = st.hair;
  const mp = s.mouthPitch;
  // Top boundary: just under the lower lip at the front, rising along the cheeks to the sideburns.
  const topFull = (yaw: number) => {
    const a = Math.abs(yaw);
    return mp - 0.1 + 0.44 * smoothstepF(0.3, 1.45, a);
  };
  const bottom = () => -1.32;
  if (st.beard === 'stubble') {
    b.add(headPatch(s, 1.006, -1.5, 1.5, 12, 3, bottom, (y) => topFull(y) + 0.06), mixHex(st.skin, col, 0.32), { smooth: true, ink: false });
    return;
  }
  // Short full beard (friendly, rounded) + a soft moustache that joins it around the mouth.
  b.add(headPatch(s, 1.05, -1.52, 1.52, 14, 4, bottom, topFull), col, { smooth: true, jitter: 0.0012, seed: 11 });
  b.add(
    headPatch(s, 1.045, -0.55, 0.55, 8, 1, (y) => mp + 0.06 - 0.12 * smoothstepF(0.2, 0.55, Math.abs(y)), (y) => mp + 0.17 - 0.1 * smoothstepF(0.25, 0.55, Math.abs(y))),
    shadeHex(col, 1.06),
    { smooth: true, ink: false },
  );
}

function smoothstepF(e0: number, e1: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function glasses(sb: SkinBuilder, s: BodySpec, frame: number): void {
  const b = sb.on(B.head);
  const er = s.eyeR;
  const rimR = er * 1.18;
  const tube = er * 0.1;
  for (const sd of [-1, 1] as const) {
    const p = headSurface(s, sd * s.eyeYaw, s.eyePitch, er * 0.62);
    b.torus(rimR, tube * 1.25, 3, 14, frame, { at: p.pos, rot: eul(p.quat), scale: [0.95, 0.9, 1], smooth: true, ink: false });
    // Temple arm to the ear.
    const a0 = headSurface(s, sd * (s.eyeYaw + 0.42), s.eyePitch + 0.03, er * 0.3);
    const a1 = headSurface(s, sd * 1.45, s.eyePitch + 0.04, s.headRx * 0.02);
    const d = new THREE.Vector3(a1.pos[0] - a0.pos[0], a1.pos[1] - a0.pos[1], a1.pos[2] - a0.pos[2]);
    b.box(tube * 1.2, d.length(), tube * 1.2, frame, { at: [(a0.pos[0] + a1.pos[0]) / 2, (a0.pos[1] + a1.pos[1]) / 2, (a0.pos[2] + a1.pos[2]) / 2], rot: alignY(d), ink: false });
  }
  const br = headSurface(s, 0, s.eyePitch + 0.05, er * 0.55);
  b.box(er * 0.62, tube * 1.5, tube * 1.4, frame, { at: br.pos, rot: eul(br.quat), ink: false });
}

function starClip(sb: SkinBuilder, s: BodySpec, col: number): void {
  const b = sb.on(B.head);
  // Above the left ear, clear of the hair scalp cap (≤ 0.035 m beyond the head ellipsoid).
  const p = headSurface(s, 1.18, 0.62, 0.054, 0.25);
  const q = p.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(AX, 0));
  b.extrude(starPoints(0.034, 0.016), 0.016, col, { at: p.pos, rot: eul(q), smooth: false });
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(p.quat);
  b.sphere(0.008, 6, 4, 0xffffff, { at: [p.pos[0] + n.x * 0.01, p.pos[1] + n.y * 0.01, p.pos[2] + n.z * 0.01], scale: [1, 1, 0.5], ink: false });
}
