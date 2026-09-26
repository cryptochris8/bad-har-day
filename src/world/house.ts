// ─────────────────────────────────────────────────────────────────────────────
// House shell: walls (two-coloured faces, cut caps, baseboards, crown trim,
// archways with trimmed curved heads, door and window openings, exterior
// siding / foundation / fascia) and the window glass (one shader: sky view
// from inside, warm lit rooms / daytime reflections from outside). Everything
// here squashes with its wall segment (cut-away).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, shadeHex } from '../render/models/builder';
import { Frame } from './kit';
import { DOOR_HEAD, HOUSE, WALL_H, WALLS, solidPieces, type Opening, type WallDef } from './layout';
import { MAX_SEGS, SQUASH_VERT, type CutUniforms } from './cutMaterial';
import type { RoomId } from './types';

export const ROOM_WALL: Record<RoomId, number> = {
  kitchen: PAL.wallSage,
  living: PAL.wallCream,
  hall: PAL.wallButter,
  entry: PAL.wallButter,
  master: PAL.wallTaupe,
  twins: PAL.wallLavender,
  heidi: PAL.wallBlush,
  bath: PAL.wallSky,
  yard: PAL.siding,
  side: PAL.siding,
  driveway: PAL.siding,
  front: PAL.siding,
  street: PAL.siding,
};

const H = WALL_H;

export function findWall(axis: 'x' | 'z', c: number, a: number): WallDef {
  const w = WALLS.find((q) => q.axis === axis && Math.abs(q.c - c) < 1e-6 && Math.abs(q.a - a) < 1e-6);
  if (!w) throw new Error(`no wall ${axis} ${c} ${a}`);
  return w;
}

/**
 * Frame on a wall face: origin at (along, y) on the face of `side` (+1 = the +Z/+X face), local +Z pointing out of
 * the wall, local +X = right as seen by someone facing the wall.
 */
export function faceFrame(b: GeoBuilder, w: WallDef, side: -1 | 1, along: number, y: number, proud = 0): Frame {
  const off = side * (w.t / 2 + proud);
  if (w.axis === 'x') return new Frame(b, along, y, w.c + off, side > 0 ? 0 : Math.PI, w.id);
  return new Frame(b, w.c + off, y, along, side > 0 ? Math.PI / 2 : -Math.PI / 2, w.id);
}

/** Box on wall w: along [a0,a1], height [y0,y1], across [u0,u1] (offset from the centre line, + = pos side). */
export function wbox(b: GeoBuilder, w: WallDef, a0: number, a1: number, y0: number, y1: number, u0: number, u1: number, color: number, ink = false): void {
  const la = a1 - a0;
  const ly = y1 - y0;
  const lu = u1 - u0;
  if (la <= 1e-5 || ly <= 1e-5 || lu <= 1e-5) return;
  const ma = (a0 + a1) / 2;
  const my = (y0 + y1) / 2;
  const mu = w.c + (u0 + u1) / 2;
  if (w.axis === 'x') b.box(la, ly, lu, color, { at: [ma, my, mu], role: w.id, ink });
  else b.box(lu, ly, la, color, { at: [mu, my, ma], role: w.id, ink });
}

/** Flat quad on a wall face (2 triangles): along [a0,a1], height [y0,y1], `off` proud of the face on `side`. */
export function wquad(b: GeoBuilder, w: WallDef, a0: number, a1: number, y0: number, y1: number, side: -1 | 1, off: number, color: number): void {
  if (a1 - a0 <= 1e-4 || y1 - y0 <= 1e-4) return;
  const g = new THREE.PlaneGeometry(a1 - a0, y1 - y0);
  const u = w.c + side * (w.t / 2 + off);
  const ma = (a0 + a1) / 2;
  const my = (y0 + y1) / 2;
  if (w.axis === 'x') b.add(g, color, { at: [ma, my, u], rot: [0, side > 0 ? 0 : Math.PI, 0], role: w.id, ink: false });
  else b.add(g, color, { at: [u, my, ma], rot: [0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0], role: w.id, ink: false });
}

const sideRoom = (w: WallDef, s: -1 | 1): RoomId | null => (s < 0 ? w.neg : w.pos);
const sideColor = (w: WallDef, s: -1 | 1): number => {
  const r = sideRoom(w, s);
  return r ? ROOM_WALL[r] : PAL.siding;
};
const isOutside = (w: WallDef, s: -1 | 1): boolean => sideRoom(w, s) === null;

/** Arch geometry: spring height + curve height at u (0..wd). */
function archCurve(wd: number): { spring: number; rise: number; at: (u: number) => number } {
  const rise = Math.min(0.34, wd * 0.26);
  const spring = DOOR_HEAD - rise;
  return {
    spring,
    rise,
    at: (u: number) => {
      const k = (u - wd / 2) / (wd / 2);
      return spring + rise * Math.sqrt(Math.max(0, 1 - k * k));
    },
  };
}

function addArch(b: GeoBuilder, w: WallDef, o: Opening): void {
  const wd = o.b - o.a;
  const arc = archCurve(wd);
  const N = 14;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const u = (wd * i) / N;
    pts.push([u, arc.at(u)]);
  }
  pts.push([wd, H], [0, H]);
  const ht = w.t / 2;
  for (const s of [-1, 1] as const) {
    const at: [number, number, number] = w.axis === 'x' ? [o.a, 0, w.c + (s * ht) / 2] : [w.c + (s * ht) / 2, 0, o.a];
    const rot: [number, number, number] = w.axis === 'x' ? [0, 0, 0] : [0, -Math.PI / 2, 0];
    b.extrude(pts, ht * 0.999, sideColor(w, s), { at, rot, role: w.id, ink: false });
    // trimmed arch band + jamb boards on interior faces
    if (isOutside(w, s)) continue;
    const T = 0.07;
    const shape: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const u = (wd * i) / N;
      shape.push([u, arc.at(u)]); // inner curve, left → right
    }
    for (let i = 0; i <= N; i++) {
      const ang = (Math.PI * i) / N; // outer curve, right → left
      shape.push([wd / 2 + Math.cos(ang) * (wd / 2 + T), arc.spring + Math.sin(ang) * (arc.rise + T)]);
    }
    const z = s * (ht + 0.009);
    const bat: [number, number, number] = w.axis === 'x' ? [o.a, 0, w.c + z] : [w.c + z, 0, o.a];
    b.extrude(shape, 0.018, PAL.trim, { at: bat, rot, role: w.id, ink: false });
    // jambs
    wbox(b, w, o.a - T, o.a, 0, arc.spring, s > 0 ? ht : -ht - 0.018, s > 0 ? ht + 0.018 : -ht, PAL.trim);
    wbox(b, w, o.b, o.b + T, 0, arc.spring, s > 0 ? ht : -ht - 0.018, s > 0 ? ht + 0.018 : -ht, PAL.trim);
  }
  // reveal lining (soffit colour = trim) inside the thickness at the jambs
  wbox(b, w, o.a, o.a + 0.012, 0, arc.spring, -ht, ht, PAL.trim);
  wbox(b, w, o.b - 0.012, o.b, 0, arc.spring, -ht, ht, PAL.trim);
}

function addDoorOpening(b: GeoBuilder, w: WallDef, o: Opening): void {
  const ht = w.t / 2;
  const head = o.head ?? DOOR_HEAD;
  for (const s of [-1, 1] as const) {
    const col = sideColor(w, s);
    wbox(b, w, o.a, o.b, head, H, s < 0 ? -ht : 0, s < 0 ? 0 : ht, col);
    const T = 0.08;
    const u0 = s > 0 ? ht : -ht - 0.022;
    const u1 = s > 0 ? ht + 0.022 : -ht;
    const trim = PAL.trim;
    wbox(b, w, o.a - T, o.a, 0, head + T, u0, u1, trim);
    wbox(b, w, o.b, o.b + T, 0, head + T, u0, u1, trim);
    wbox(b, w, o.a - T - 0.02, o.b + T + 0.02, head, head + T + 0.02, u0, u1 + (s > 0 ? 0.01 : 0), trim);
  }
  // reveal + threshold
  wbox(b, w, o.a, o.a + 0.015, 0, head, -ht, ht, PAL.trim);
  wbox(b, w, o.b - 0.015, o.b, 0, head, -ht, ht, PAL.trim);
  wbox(b, w, o.a, o.b, head - 0.015, head, -ht, ht, PAL.trim);
  wbox(b, w, o.a, o.b, 0, 0.025, -ht - 0.03, ht + 0.03, shadeHex(PAL.woodWarm, 0.95));
}

function addWindowOpening(b: GeoBuilder, w: WallDef, o: Opening, front: boolean): void {
  const ht = w.t / 2;
  const sill = o.sill ?? 0.95;
  const head = o.head ?? 2.05;
  for (const s of [-1, 1] as const) {
    const col = sideColor(w, s);
    wbox(b, w, o.a, o.b, 0, sill, s < 0 ? -ht : 0, s < 0 ? 0 : ht, col);
    wbox(b, w, o.a, o.b, head, H, s < 0 ? -ht : 0, s < 0 ? 0 : ht, col);
    const T = 0.075;
    const u0 = s > 0 ? ht : -ht - 0.022;
    const u1 = s > 0 ? ht + 0.022 : -ht;
    wbox(b, w, o.a - T, o.a, sill, head, u0, u1, PAL.trim);
    wbox(b, w, o.b, o.b + T, sill, head, u0, u1, PAL.trim);
    wbox(b, w, o.a - T - 0.02, o.b + T + 0.02, head, head + T + 0.015, u0, u1, PAL.trim);
    // sill ledge + apron
    const su0 = s > 0 ? ht : -ht - 0.07;
    const su1 = s > 0 ? ht + 0.07 : -ht;
    wbox(b, w, o.a - T - 0.03, o.b + T + 0.03, sill - 0.035, sill + 0.012, su0, su1, PAL.trim);
    wbox(b, w, o.a - T, o.b + T, sill - 0.13, sill - 0.035, u0, u1, PAL.trim);
    if (isOutside(w, s) && front) {
      // shutters + a flower box on the street side
      const sw = (o.b - o.a) * 0.42;
      const uu0 = -ht - 0.05;
      const uu1 = -ht - 0.012;
      const su = s > 0 ? [ht + 0.012, ht + 0.05] : [uu0, uu1];
      wbox(b, w, o.a - T - 0.02 - sw, o.a - T - 0.02, sill - 0.02, head + 0.02, su[0]!, su[1]!, PAL.shutter);
      wbox(b, w, o.b + T + 0.02, o.b + T + 0.02 + sw, sill - 0.02, head + 0.02, su[0]!, su[1]!, PAL.shutter);
      for (const [x0, x1] of [
        [o.a - T - 0.02 - sw, o.a - T - 0.02],
        [o.b + T + 0.02, o.b + T + 0.02 + sw],
      ] as const)
        for (let k = 1; k < 5; k++) {
          const y = sill + ((head - sill) * k) / 5;
          const pu = s > 0 ? [ht + 0.05, ht + 0.058] : [-ht - 0.058, -ht - 0.05];
          wbox(b, w, x0 + 0.03, x1 - 0.03, y - 0.008, y + 0.008, pu[0]!, pu[1]!, shadeHex(PAL.shutter, 0.85));
        }
      const bu = s > 0 ? [ht, ht + 0.24] : [-ht - 0.24, -ht];
      wbox(b, w, o.a - 0.06, o.b + 0.06, sill - 0.34, sill - 0.14, bu[0]!, bu[1]!, PAL.woodWarm, true);
      const n = Math.max(3, Math.round((o.b - o.a) / 0.16));
      for (let k = 0; k < n; k++) {
        const along = o.a + ((o.b - o.a) * (k + 0.5)) / n;
        const across = w.c + (s > 0 ? ht + 0.12 : -ht - 0.12);
        const fcol = [PAL.flowerPink, PAL.flowerYellow, 0xffffff, PAL.confettiA][k % 4]!;
        const at: [number, number, number] = w.axis === 'x' ? [along, sill - 0.08, across] : [across, sill - 0.08, along];
        b.ball(0.055, 0, PAL.plantGreen, { at: [at[0], at[1] - 0.03, at[2]], scale: [1.4, 0.8, 1.2], role: w.id });
        b.ball(0.045, 0, fcol, { at, role: w.id });
      }
    }
  }
  // reveals (lining inside the thickness)
  wbox(b, w, o.a, o.a + 0.02, sill, head, -ht, ht, PAL.trim);
  wbox(b, w, o.b - 0.02, o.b, sill, head, -ht, ht, PAL.trim);
  wbox(b, w, o.a, o.b, sill, sill + 0.02, -ht, ht, PAL.trim);
  wbox(b, w, o.a, o.b, head - 0.02, head, -ht, ht, PAL.trim);
  // mullions (cross) through the glass plane
  const m = 0.035;
  wbox(b, w, (o.a + o.b) / 2 - m / 2, (o.a + o.b) / 2 + m / 2, sill, head, -0.03, 0.03, PAL.trim);
  wbox(b, w, o.a, o.b, (sill + head) / 2 - m / 2 + 0.05, (sill + head) / 2 + m / 2 + 0.05, -0.03, 0.03, PAL.trim);
}

/** Walls, trims and openings of the whole house into one builder (inked decor may be added later). */
export function buildWalls(b: GeoBuilder, shadow?: GeoBuilder): void {
  for (const w of WALLS) {
    const ht = w.t / 2;
    if (shadow) {
      // plain shadow-caster pieces (squash with the wall via their role)
      const pieceOf = (a0: number, a1: number, y0: number, y1: number) => wbox(shadow, w, a0 + 0.01, a1 - 0.01, y0, y1, -ht + 0.012, ht - 0.012, 0xffffff);
      for (const [a0, a1] of solidPieces(w, true)) pieceOf(a0, a1, 0, H);
      for (const o of w.openings) {
        if (o.kind === 'window') {
          pieceOf(o.a, o.b, 0, o.sill ?? 0.95);
          pieceOf(o.a, o.b, o.head ?? 2.05, H);
        } else pieceOf(o.a, o.b, (o.head ?? DOOR_HEAD) - (o.kind === 'arch' ? 0.2 : 0), H);
      }
    }
    const pieces = solidPieces(w, true).map(([a, bb]) => {
      let a0 = a;
      let a1 = bb;
      if (w.ext && w.axis === 'x') {
        if (Math.abs(a0 - HOUSE.x0) < 1e-6) a0 -= ht;
        if (Math.abs(a1 - HOUSE.x1) < 1e-6) a1 += ht;
      }
      return [a0, a1] as const;
    });
    for (const [a0, a1] of pieces) {
      for (const s of [-1, 1] as const) {
        wbox(b, w, a0, a1, 0, H, s < 0 ? -ht : 0, s < 0 ? 0 : ht, sideColor(w, s));
        const out = isOutside(w, s);
        const u = (d: number): [number, number] => (s > 0 ? [ht, ht + d] : [-ht - d, -ht]);
        if (out) {
          const [f0, f1] = u(0.028);
          wbox(b, w, a0, a1, 0, 0.3, f0, f1, PAL.foundation);
          const [c0, c1] = u(0.045);
          wbox(b, w, a0, a1, H - 0.2, H - 0.03, c0, c1, PAL.trim);
          for (let y = 0.52; y < H - 0.25; y += 0.19) wquad(b, w, a0, a1, y, y + 0.024, s, 0.004, PAL.sidingShadow);
        } else {
          const [b0, b1] = u(0.018);
          wbox(b, w, a0, a1, 0, 0.11, b0, b1, PAL.trim);
          const [k0, k1] = u(0.02);
          wbox(b, w, a0, a1, H - 0.09, H - 0.03, k0, k1, PAL.trim);
        }
      }
      // cut cap (top) + inset end caps (visible only when a neighbour piece is lower)
      wbox(b, w, a0, a1, H - 0.03, H + 0.004, -ht - 0.014, ht + 0.014, PAL.wallCut);
      wbox(b, w, a0 - 0.004, a0 + 0.001, 0.12, H - 0.003, -ht + 0.004, ht - 0.004, PAL.wallCut);
      wbox(b, w, a1 - 0.001, a1 + 0.004, 0.12, H - 0.003, -ht + 0.004, ht - 0.004, PAL.wallCut);
    }
    const front = w.ext && w.axis === 'x' && w.c === HOUSE.z1;
    for (const o of w.openings) {
      if (o.kind === 'arch') addArch(b, w, o);
      else if (o.kind === 'door') addDoorOpening(b, w, o);
      else addWindowOpening(b, w, o, front);
      // caps over openings
      wbox(b, w, o.a, o.b, H - 0.03, H + 0.004, -ht - 0.014, ht + 0.014, PAL.wallCut);
      if (o.kind === 'window') {
        // under-sill part also gets baseboard / foundation
        for (const s of [-1, 1] as const) {
          const u0 = s > 0 ? ht : -ht - (isOutside(w, s) ? 0.028 : 0.018);
          const u1 = s > 0 ? ht + (isOutside(w, s) ? 0.028 : 0.018) : -ht;
          wbox(b, w, o.a, o.b, 0, isOutside(w, s) ? 0.3 : 0.11, u0, u1, isOutside(w, s) ? PAL.foundation : PAL.trim);
        }
      }
    }
    // exterior corner boards
    if (w.ext && w.axis === 'x')
      for (const x of [HOUSE.x0, HOUSE.x1])
        if (Math.abs(w.a - x) < 1e-6 || Math.abs(w.b - x) < 1e-6) {
          const sx = x < 0 ? -1 : 1;
          const sz = w.c < 0 ? -1 : 1;
          b.box(0.12, H - 0.2, 0.12, PAL.trim, { at: [x + sx * (ht + 0.02), (H - 0.2) / 2 + 0.3 - 0.15, w.c + sz * (ht + 0.02)], role: w.id });
        }
  }
}

// ── window glass ───────────────────────────────────────────────────────────────

export interface GlassUniforms {
  uTop: { value: THREE.Color };
  uHorizon: { value: THREE.Color };
  uGlowCol: { value: THREE.Color };
  uGlow: { value: number };
  uStars: { value: number };
  uTree: { value: THREE.Color };
  uWarm: { value: THREE.Color };
  uWarmK: { value: number };
  uDay: { value: THREE.Color };
  uTime: { value: number };
}

const GLASS_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aSide;
attribute float aSeg;
attribute float aSeed;
uniform float uCut[${MAX_SEGS}];
uniform float uCutBase;
varying vec2 vUv;
varying float vSide;
varying float vSeed;
void main() {
  vec3 transformed = position;
  ${SQUASH_VERT}
  vUv = aUv;
  vSide = aSide;
  vSeed = aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`;

const GLASS_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlowCol;
uniform float uGlow;
uniform float uStars;
uniform vec3 uTree;
uniform vec3 uWarm;
uniform float uWarmK;
uniform vec3 uDay;
uniform float uTime;
varying vec2 vUv;
varying float vSide;
varying float vSeed;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 col;
  float streak = smoothstep(0.08, 0.0, abs(fract((vUv.x * 0.8 + vUv.y) * 0.9 + vSeed) - 0.5) - 0.02);
  if (vSide < 0.5) {
    // looking out: sky gradient, a sunrise glow low down, twinkling stars, a soft tree line
    float h = clamp((vUv.y - 0.12) / 0.88, 0.0, 1.0);
    col = mix(uHorizon, uTop, pow(h, 0.75));
    col += uGlowCol * uGlow * pow(1.0 - h, 2.0) * 0.55;
    vec2 cell = vUv * vec2(7.0, 6.0) + vSeed * 17.0;
    vec2 g = floor(cell);
    vec2 f = fract(cell) - 0.5;
    float r = h21(g);
    float tw = 0.6 + 0.4 * sin(uTime * (1.5 + r * 2.0) + r * 20.0);
    float star = step(0.8, r) * smoothstep(0.1, 0.0, length(f + (vec2(h21(g + 3.1), h21(g + 7.7)) - 0.5) * 0.6)) * uStars * tw;
    col += vec3(1.0, 0.97, 0.88) * star * step(0.3, vUv.y);
    float tl = 0.2 + 0.06 * sin(vUv.x * 8.0 + vSeed * 9.0) + 0.035 * sin(vUv.x * 21.0 + vSeed * 4.0);
    col = mix(col, uTree, smoothstep(tl + 0.012, tl - 0.012, vUv.y));
    col += vec3(0.08) * streak * (0.4 + 0.6 * (1.0 - uStars));
  } else {
    // seen from outside: daytime reflections, warm lit rooms at night
    vec3 day = mix(uDay * 0.82, uDay * 1.08, vUv.y);
    vec3 warm = uWarm * (0.78 + 0.28 * vUv.y);
    col = mix(day, warm, uWarmK);
    col += vec3(0.16) * streak * (1.0 - uWarmK * 0.7);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function glassMaterial(cut: CutUniforms): { material: THREE.ShaderMaterial; uniforms: GlassUniforms } {
  const uniforms: GlassUniforms = {
    uTop: { value: new THREE.Color(PAL.skyNightTop) },
    uHorizon: { value: new THREE.Color(PAL.skyNightHorizon) },
    uGlowCol: { value: new THREE.Color(PAL.skySunriseGlow) },
    uGlow: { value: 0 },
    uStars: { value: 1 },
    uTree: { value: new THREE.Color(0x1d2a3a) },
    uWarm: { value: new THREE.Color(PAL.windowWarm) },
    uWarmK: { value: 1 },
    uDay: { value: new THREE.Color(PAL.windowDay) },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: 'bhd-glass',
    vertexShader: GLASS_VERT,
    fragmentShader: GLASS_FRAG,
    uniforms: { ...uniforms, uCut: cut.uCut, uCutBase: cut.uCutBase },
  });
  return { material, uniforms };
}

/** Glass panes for every window: inner face (sky view) + outer face (reflection / warm glow). */
export function buildGlass(): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const side: number[] = [];
  const seg: number[] = [];
  const seed: number[] = [];
  const quad = (w: WallDef, o: Opening, s: -1 | 1, outer: boolean, sd: number) => {
    const sill = o.sill ?? 0.95;
    const head = o.head ?? 2.05;
    const off = w.c + s * 0.006;
    // corners in (along, y); order CCW as seen from the side the face points to
    const A = o.a;
    const B = o.b;
    const corners: [number, number, number, number][] = [
      [A, sill, 0, 0],
      [B, sill, 1, 0],
      [B, head, 1, 1],
      [A, head, 0, 1],
    ];
    const p = corners.map(([al, y, u, v]) => {
      const x = w.axis === 'x' ? al : off;
      const z = w.axis === 'x' ? off : al;
      return { x, y, z, u, v };
    });
    // face normal: axis x → ±Z, axis z → ±X. Viewer-right must map to +u.
    let order = [0, 1, 2, 0, 2, 3];
    const normalPos = s > 0;
    // For 'x' walls facing +Z, along = +X = viewer right → CCW as listed. Facing −Z: flip.
    // For 'z' walls facing +X, viewer right = −Z → flip u and winding.
    const flip = w.axis === 'x' ? !normalPos : normalPos;
    if (flip) {
      order = [0, 2, 1, 0, 3, 2];
      for (const q of p) q.u = 1 - q.u;
    }
    for (const i of order) {
      const q = p[i]!;
      pos.push(q.x, q.y, q.z);
      uv.push(q.u, q.v);
      side.push(outer ? 1 : 0);
      seg.push(w.id);
      seed.push(sd);
    }
  };
  let k = 0;
  for (const w of WALLS)
    for (const o of w.openings) {
      if (o.kind !== 'window') continue;
      const inner: -1 | 1 = w.pos ? 1 : -1; // exterior walls: exactly one side is a room
      quad(w, o, inner, false, (k * 0.37) % 1);
      quad(w, o, (-inner) as -1 | 1, true, (k * 0.61) % 1);
      k++;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  g.computeBoundingSphere();
  return g;
}

