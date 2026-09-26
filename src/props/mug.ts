// ─────────────────────────────────────────────────────────────────────────────
// Mugs: six designs (Ashley's favourite is 'sunflower'), a coffee surface that
// rises inside with setFill() and takes any colour via setLiquid() (black →
// latte), and three soft steam wisps animated entirely in a tiny vertex shader
// (update(dt) only advances a uniform). Handle on +X, design on the +Z front.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from '../render/palette';
import { shadeHex } from '../render/models/builder';
import { inked, plain } from '../render/models/common';
import { instanceMaterial, type InstanceUniforms } from '../render/models/materials';
import { BaseProp, propGeo } from './base';
import type { MugDesign, MugProp } from './types';
import {
  circlePts,
  flatDecal,
  heartPts,
  leafPts,
  mergeLocal,
  pixelText,
  profileRadius,
  rectDecal,
  smoothPath,
  starPts,
  sweepGeometry,
  wrapAround,
  type LocalPart,
  type P2,
} from './shapes';

export const MUG_DESIGNS: readonly MugDesign[] = ['sunflower', 'heart', 'stripes', 'dots', 'plain', 'bestDad'];

/** Coffee colours, black → latte (Ashley's order in FAMILY SETUP picks the target). */
export const COFFEE_COLORS: { black: number; splash: number; creamSugar: number; latte: number } = {
  black: PAL.coffeeBlack,
  splash: PAL.coffeeSplash,
  creamSugar: PAL.coffeeCreamSugar,
  latte: PAL.coffeeLatte,
};

const MUG_OUT: P2[] = [
  [0.001, 0.003],
  [0.04, 0],
  [0.049, 0.006],
  [0.053, 0.04],
  [0.052, 0.1],
  [0.049, 0.114],
  [0.0455, 0.117],
  [0.0435, 0.115],
];
const MUG_IN: P2[] = [
  [0.0435, 0.115],
  [0.0435, 0.016],
  [0.037, 0.012],
  [0.001, 0.012],
];
/** The outer wall used for decals (ascending in y). */
const WALL = MUG_OUT.slice(2, 6);
const rOut = (y: number): number => profileRadius(WALL, y);

/** Liquid surface travel inside the mug. */
export const MUG_LIQUID = { radius: 0.0432, y0: 0.0135, y1: 0.103 } as const;

/** Height (root space) of the liquid surface for a fill level 0..1. */
export function liquidY(fill: number): number {
  const f = Number.isFinite(fill) ? Math.max(0, Math.min(1, fill)) : 0;
  return MUG_LIQUID.y0 + f * (MUG_LIQUID.y1 - MUG_LIQUID.y0);
}

const BODY: Readonly<Record<MugDesign, number>> = {
  sunflower: PAL.mugSky,
  heart: PAL.mugBlush,
  stripes: PAL.mugCream,
  dots: PAL.mugMint,
  plain: PAL.mugOat,
  bestDad: PAL.mugNavy,
};

type B = ReturnType<typeof inked>;
const wrapped = (b: B, parts: LocalPart[], color: number) => {
  if (parts.length) b.add(wrapAround(mergeLocal(parts), rOut), color, { ink: false });
};

function sunflower(b: B): void {
  const cy = 0.061;
  const a1: LocalPart[] = [];
  const a2: LocalPart[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const part: LocalPart = [flatDecal(leafPts(0.0175, 0.0098, 4), 0.0012), [Math.cos(a) * 0.0065, cy + Math.sin(a) * 0.0065, 0], [0, 0, a - Math.PI / 2]];
    (i % 2 ? a2 : a1).push(part);
  }
  wrapped(b, a1, PAL.flowerYellow);
  wrapped(b, a2, PAL.great);
  wrapped(b, [[flatDecal(circlePts(0.0088, 12), 0.0016), [0, cy, 0]]], PAL.sunflowerCenter);
  wrapped(
    b,
    [
      [flatDecal(circlePts(0.0022, 6), 0.0019), [-0.003, cy + 0.003, 0]],
      [flatDecal(circlePts(0.0015, 6), 0.0019), [0.0025, cy - 0.002, 0]],
    ],
    shadeHex(PAL.sunflowerCenter, 1.5),
  );
  wrapped(
    b,
    [
      [rectDecal(0, 0.034, 0.003, 0.034, 0.0011), [0, 0, 0]],
      [flatDecal(leafPts(0.019, 0.01, 4), 0.0011), [0.001, 0.03, 0], [0, 0, -0.95]],
      [flatDecal(leafPts(0.017, 0.009, 4), 0.0011), [-0.001, 0.036, 0], [0, 0, 0.95]],
    ],
    PAL.plantGreen,
  );
}

function heart(b: B): void {
  wrapped(b, [[flatDecal(heartPts(0.042, 28), 0.0012), [0, 0.06, 0]]], PAL.heart);
  wrapped(b, [[flatDecal(circlePts(0.004, 8), 0.0016), [-0.009, 0.069, 0], [0, 0, 0.6]]], PAL.paper);
  wrapped(
    b,
    [
      [flatDecal(heartPts(0.012), 0.0012), [0.034, 0.09, 0], [0, 0, -0.3]],
      [flatDecal(heartPts(0.01), 0.0012), [-0.036, 0.034, 0], [0, 0, 0.3]],
      [flatDecal(heartPts(0.008), 0.0012), [0.032, 0.03, 0]],
    ],
    PAL.heartLight,
  );
}

function band(b: B, y: number, h: number, color: number): void {
  const g = new THREE.CylinderGeometry(rOut(y + h / 2) + 0.0009, rOut(y - h / 2) + 0.0009, h, 18, 1, true);
  b.add(g, color, { at: [0, y, 0], ink: false });
}

function stripes(b: B): void {
  band(b, 0.026, 0.011, PAL.mugStripe);
  band(b, 0.048, 0.008, PAL.mugNavy);
  band(b, 0.07, 0.011, PAL.mugStripe);
  band(b, 0.092, 0.008, PAL.mugNavy);
}

function dots(b: B): void {
  const parts: LocalPart[] = [];
  const rows = [0.03, 0.058, 0.086];
  rows.forEach((y, ri) => {
    for (let k = -3; k <= 3; k++) {
      const x = k * 0.026 + (ri % 2 ? 0.013 : 0);
      if (Math.abs(x) > 0.09) continue;
      parts.push([flatDecal(circlePts(0.0058, 10), 0.0011), [x, y, 0]]);
    }
  });
  wrapped(b, parts, PAL.paper);
}

function plainMug(b: B): void {
  band(b, 0.0125, 0.013, shadeHex(PAL.mugOat, 0.78));
  const parts: LocalPart[] = [];
  const spots: [number, number][] = [
    [-0.03, 0.05],
    [0.012, 0.08],
    [0.034, 0.042],
    [-0.012, 0.093],
    [0.0, 0.035],
    [-0.04, 0.078],
    [0.045, 0.07],
    [0.02, 0.058],
  ];
  for (const [x, y] of spots) parts.push([flatDecal(circlePts(0.0015, 6), 0.0011), [x, y, 0]]);
  wrapped(b, parts, shadeHex(PAL.mugOat, 0.62));
}

function bestDad(b: B): void {
  const cy = 0.07;
  wrapped(
    b,
    [
      [flatDecal([[-0.011, 0], [-0.002, 0], [-0.004, -0.03], [-0.0095, -0.024], [-0.015, -0.029]], 0.0011), [0, cy - 0.012, 0]],
      [flatDecal([[0.002, 0], [0.011, 0], [0.015, -0.029], [0.0095, -0.024], [0.004, -0.03]], 0.0011), [0, cy - 0.012, 0]],
    ],
    PAL.mugStripe,
  );
  wrapped(b, [[flatDecal(circlePts(0.0235, 18), 0.0014), [0, cy, 0]]], PAL.great);
  wrapped(b, [[flatDecal(circlePts(0.0195, 18), 0.0016), [0, cy, 0]]], PAL.starPrint);
  const txt: LocalPart[] = pixelText('#1', 0.0052).map((r) => [rectDecal(r.x, r.y, r.w, r.h, 0.002), [0, cy, 0]] as LocalPart);
  wrapped(b, txt, PAL.mugNavy);
  wrapped(
    b,
    [
      [flatDecal(starPts(0.006, 0.0025), 0.0012), [-0.03, 0.095, 0]],
      [flatDecal(starPts(0.0045, 0.002), 0.0012), [0.031, 0.036, 0]],
    ],
    PAL.great,
  );
}

const DESIGN_BUILDERS: Readonly<Record<MugDesign, (b: B) => void>> = {
  sunflower,
  heart,
  stripes,
  dots,
  plain: plainMug,
  bestDad,
};

function mugGeo(design: MugDesign): THREE.BufferGeometry {
  const b = inked();
  const body = BODY[design];
  b.lathe(MUG_OUT, 16, body, { smooth: true });
  b.lathe(MUG_IN, 16, design === 'bestDad' ? PAL.mugCream : PAL.mugCream, { smooth: true, ink: false });
  const handlePath = smoothPath(
    [
      [0.047, 0.099, 0],
      [0.074, 0.1, 0],
      [0.089, 0.082, 0],
      [0.088, 0.054, 0],
      [0.077, 0.035, 0],
      [0.05, 0.03, 0],
    ],
    11,
  );
  b.add(sweepGeometry(handlePath, 0.0088, 6, false, 0.8), body, { smooth: true });
  DESIGN_BUILDERS[design](b);
  return b.build();
}

function liquidGeo(): THREE.BufferGeometry {
  const b = plain();
  const r = MUG_LIQUID.radius;
  // Darker meniscus ring → the surface reads as liquid sitting inside the mug, in any colour.
  b.cyl(r, r, 0.002, 18, 0x9a9a9a, { at: [0, -0.001, 0] });
  b.cyl(r * 0.86, r * 0.86, 0.0022, 18, 0xd6d6d6, { at: [0, -0.0009, 0] });
  b.cyl(r * 0.74, r * 0.74, 0.0024, 18, 0xffffff, { at: [0, -0.0008, 0] });
  b.ball(r * 0.18, 0, 0xffffff, { at: [-r * 0.35, 0.0003, -r * 0.2], scale: [1.6, 0.05, 0.8] });
  return b.build();
}

// ── steam ────────────────────────────────────────────────────────────────────
const STEAM_VERT = /* glsl */ `
attribute float aPhase;
attribute float aH;
uniform float uTime;
uniform float uOn;
varying float vA;
void main() {
  float cyc = fract(uTime * 0.32 + aPhase);
  vec3 p = position;
  float h = aH;
  p.x += sin(h * 5.0 + uTime * 2.1 + aPhase * 6.2832) * 0.011 * (0.35 + h);
  p.z += cos(h * 4.0 + uTime * 1.6 + aPhase * 4.0) * 0.006 * h;
  p.y += cyc * 0.035;
  p.xz *= 1.0 + cyc * 0.5;
  vA = uOn * sin(3.14159 * cyc) * smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.55, 1.0, h));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  gl_FragColor = vec4(uColor, vA * 0.62);
  #include <colorspace_fragment>
}`;

function steamGeo(): THREE.BufferGeometry {
  const wisps: [number, number, number][] = [
    [-0.017, 0.0, 0.0],
    [0.002, 0.006, 0.34],
    [0.018, -0.005, 0.67],
  ];
  const geos = wisps.map(([x0, z0, phase], i) => {
    const s = i % 2 ? -1 : 1;
    const path = smoothPath(
      [
        [x0, 0, z0],
        [x0 + 0.008 * s, 0.026, z0],
        [x0 - 0.006 * s, 0.052, z0],
        [x0 + 0.004 * s, 0.078, z0],
      ],
      10,
    );
    const rad = path.map((_, k) => 0.0035 + 0.0055 * Math.sin(Math.PI * Math.min(1, (k / 9) * 1.15)));
    const g = sweepGeometry(path, rad, 5);
    const n = g.getAttribute('position').count;
    const ph = new Float32Array(n).fill(phase);
    const hh = new Float32Array(n);
    const p = g.getAttribute('position');
    for (let v = 0; v < n; v++) hh[v] = Math.max(0, Math.min(1, p.getY(v) / 0.078));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error('steam: merge failed');
  merged.computeBoundingSphere();
  return merged;
}

function steamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'bhd-mug-steam',
    vertexShader: STEAM_VERT,
    fragmentShader: STEAM_FRAG,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uColor: { value: new THREE.Color(PAL.steam) } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export class Mug extends BaseProp implements MugProp {
  readonly design: MugDesign;
  private readonly liquid: THREE.Mesh;
  private readonly liquidU: InstanceUniforms;
  private readonly steam: THREE.Mesh;
  private readonly steamMat: THREE.ShaderMaterial;
  private fill = 0;
  private steamOn = false;
  private steamAmt = 0;
  private t = 0;

  constructor(design: MugDesign) {
    const d: MugDesign = MUG_DESIGNS.includes(design) ? design : 'plain';
    super('mug:' + d);
    this.design = d;
    this.addPart(propGeo('mug|' + d, () => mugGeo(d)));
    const { material, uniforms } = instanceMaterial();
    this.owned.push(material);
    this.liquidU = uniforms;
    this.liquid = new THREE.Mesh(propGeo('mug|liquid', liquidGeo), material);
    this.liquid.name = 'liquid';
    this.liquid.visible = false;
    this.root.add(this.liquid);
    this.steamMat = steamMaterial();
    this.owned.push(this.steamMat);
    this.steam = new THREE.Mesh(propGeo('mug|steam', steamGeo), this.steamMat);
    this.steam.name = 'steam';
    this.steam.visible = false;
    this.steam.renderOrder = 6;
    this.steam.frustumCulled = false;
    this.root.add(this.steam);
    this.setGrip(0.084, 0.064, 0);
    this.measure();
    this.setLiquid(COFFEE_COLORS.black);
  }

  /** Current fill 0..1. */
  get level(): number {
    return this.fill;
  }

  setFill(v: number): void {
    this.fill = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.liquid.visible = this.fill > 0.004;
    this.liquid.position.y = liquidY(this.fill);
    this.placeSteam();
  }

  setLiquid(hex: number): void {
    this.liquidU.uTint.value.setHex(hex);
  }

  setSteam(on: boolean): void {
    this.steamOn = on;
  }

  private placeSteam(): void {
    this.steam.position.y = Math.max(liquidY(this.fill) - 0.004, 0.075);
  }

  update(dt: number): void {
    const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    this.t += d;
    const target = this.steamOn ? 1 : 0;
    this.steamAmt += (target - this.steamAmt) * (1 - Math.exp(-2.5 * d));
    if (!this.steamOn && this.steamAmt < 0.01) this.steamAmt = 0;
    this.steam.visible = this.steamAmt > 0.01;
    this.steamMat.uniforms.uOn!.value = this.steamAmt;
    this.steamMat.uniforms.uTime!.value = this.t;
    this.placeSteam();
  }
}
