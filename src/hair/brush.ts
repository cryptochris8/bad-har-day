// ─────────────────────────────────────────────────────────────────────────────
// The four hairbrushes (inked toon GeoBuilder models). Origin = centre of the grip;
// the head extends along +Y (≈ 0.24 m overall); bristles point toward +Z.
//   black  — THE BLACK BRUSH: a sleek matte-black paddle, soft rounded handle, a subtle
//            violet edge. setGlow(v) = legendary presentation: violet rim glow, a sheen
//            sweeping along it, twinkling sparkle glints.
//   purple — oval paddle · pink — round brush (cylindrical bristle barrel) · teal — wide-tooth detangler.
// Geometry is cached per kind (shared); only the black brush's glow parts are per instance.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, mixHex } from '../render/models/builder';
import { cachedGeo, disposeTree } from '../render/models/common';
import { modelMaterial } from '../render/models/materials';
import { CELL_STAR, hairSpriteMaterial } from './material';
import type { Brush, BrushKind } from './types';

type Pts = [number, number][];

/** Rounded rectangle outline (CCW), centred at (0, cy). */
export function roundedRect(w: number, h: number, r: number, cy: number, seg = 4): Pts {
  const pts: Pts = [];
  const rr = Math.min(r, w / 2, h / 2);
  const corners: [number, number, number][] = [
    [w / 2 - rr, -h / 2 + rr, -Math.PI / 2],
    [w / 2 - rr, h / 2 - rr, 0],
    [-w / 2 + rr, h / 2 - rr, Math.PI / 2],
    [-w / 2 + rr, -h / 2 + rr, Math.PI],
  ];
  for (const [cx, cyy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + cyy + Math.sin(a) * rr]);
    }
  }
  return pts;
}

/** Is (x, y) inside the rounded rect (with an inset margin)? */
export function insideRoundedRect(x: number, y: number, w: number, h: number, r: number, cy: number, inset = 0): boolean {
  const hw = w / 2 - inset;
  const hh = h / 2 - inset;
  const rr = Math.max(0, Math.min(r - inset, hw, hh));
  const dx = Math.max(0, Math.abs(x) - (hw - rr));
  const dy = Math.max(0, Math.abs(y - cy) - (hh - rr));
  return Math.abs(x) <= hw && Math.abs(y - cy) <= hh && dx * dx + dy * dy <= rr * rr;
}

/** Soft rounded handle (lathe, flattened in Z) from y0 up to y1. */
function handle(b: GeoBuilder, color: number, y0: number, y1: number, r: number, flat = 0.74): void {
  const L = y1 - y0;
  const prof: [number, number][] = [
    [0.0001, 0],
    [r * 0.62, L * 0.012],
    [r * 0.92, L * 0.06],
    [r, L * 0.2],
    [r * 0.97, L * 0.52],
    [r * 0.84, L * 0.82],
    [r * 0.74, L],
  ];
  b.lathe(prof, 8, color, { at: [0, y0, 0], scale: [1, 1, flat], smooth: true });
}

function paddle(b: GeoBuilder, o: { w: number; h: number; r: number; cy: number; body: number; pad: number; pin: number; tip: number; edge?: number; teeth?: boolean; handleCol: number }): void {
  const d = 0.016;
  b.extrude(roundedRect(o.w, o.h, o.r, o.cy), d, o.body, { smooth: false });
  // Neck from the handle into the paddle.
  b.taper(0.024, 0.012, o.w * 0.42, d * 0.9, 0.04, o.handleCol, { at: [0, o.cy - o.h / 2 - 0.004, 0] });
  if (o.edge) b.extrude(roundedRect(o.w + 0.0036, o.h + 0.0036, o.r + 0.0018, o.cy, 3), 0.0055, o.edge, { ink: false, glow: o.edge });
  // Cushion pad on the bristle face.
  const pw = o.w - 0.014;
  const ph = o.h - 0.014;
  const pr = Math.max(0.004, o.r - 0.007);
  b.extrude(roundedRect(pw, ph, pr, o.cy, 3), 0.004, o.pad, { ink: false, at: [0, 0, d / 2 + 0.0015] });
  // Pins (bristles) toward +Z.
  const cols = o.teeth ? 4 : 5;
  const rows = o.teeth ? 3 : 5;
  const len = o.teeth ? 0.021 : 0.017;
  const rad = o.teeth ? 0.0036 : 0.0019;
  const z0 = d / 2 + 0.003;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i / (cols - 1) - 0.5) * (pw - (o.teeth ? 0.022 : 0.014));
      const y = o.cy + (j / (rows - 1) - 0.5) * (ph - (o.teeth ? 0.026 : 0.014)) + (i % 2 ? 0.003 : -0.003) * (o.teeth ? 0 : 1);
      if (!insideRoundedRect(x, y, pw, ph, pr, o.cy, 0.004)) continue;
      if (o.teeth) {
        // Wide, soft flexible teeth with a rounded (domed) tip.
        b.cyl(rad * 0.85, rad, len, 5, o.pin, { at: [x, y, z0 + len / 2], rot: [Math.PI / 2, 0, 0], ink: false, smooth: true });
        b.sphere(rad * 0.9, 5, 2, o.tip, { at: [x, y, z0 + len], rot: [Math.PI / 2, 0, 0], ink: false, smooth: true });
      } else {
        b.cyl(rad, rad, len, 3, o.pin, { at: [x, y, z0 + len / 2], rot: [Math.PI / 2, 0, 0], ink: false });
        b.cone(rad * 1.5, 0.0034, 3, o.tip, { at: [x, y, z0 + len + 0.0012], rot: [Math.PI / 2, 0, 0], ink: false });
      }
    }
  }
}

function buildGeo(kind: BrushKind): THREE.BufferGeometry {
  const b = new GeoBuilder(true, true);
  switch (kind) {
    case 'black': {
      handle(b, PAL.blackBrush, -0.085, 0.052, 0.0165, 0.72);
      paddle(b, {
        w: 0.074,
        h: 0.104,
        r: 0.03,
        cy: 0.116,
        body: PAL.blackBrush,
        handleCol: PAL.blackBrush,
        pad: PAL.brushPad,
        pin: mixHex(PAL.bristle, PAL.blackBrush, 0.62),
        tip: PAL.bristleTip,
        edge: PAL.blackBrushEdge,
      });
      break;
    }
    case 'purple': {
      handle(b, PAL.brushPurple, -0.085, 0.05, 0.016, 0.76);
      paddle(b, {
        w: 0.07,
        h: 0.1,
        r: 0.035,
        cy: 0.117,
        body: PAL.brushPurple,
        handleCol: PAL.brushPurple,
        pad: mixHex(PAL.brushPurple, 0xffffff, 0.55),
        pin: PAL.bristle,
        tip: mixHex(PAL.brushPurple, PAL.outline, 0.35),
      });
      break;
    }
    case 'teal': {
      handle(b, PAL.brushTeal, -0.085, 0.048, 0.0165, 0.72);
      paddle(b, {
        w: 0.084,
        h: 0.096,
        r: 0.024,
        cy: 0.112,
        body: PAL.brushTeal,
        handleCol: PAL.brushTeal,
        pad: mixHex(PAL.brushTeal, 0xffffff, 0.5),
        pin: mixHex(PAL.brushTeal, 0xffffff, 0.78),
        tip: mixHex(PAL.brushTeal, 0xffffff, 0.9),
        teeth: true,
      });
      break;
    }
    case 'pink': {
      handle(b, PAL.brushPink, -0.085, 0.045, 0.015, 0.95);
      // Collar + cylindrical barrel with radial bristles.
      b.cyl(0.0135, 0.016, 0.012, 10, mixHex(PAL.brushPink, PAL.outline, 0.15), { at: [0, 0.051, 0], smooth: true });
      const y0 = 0.058;
      const y1 = 0.172;
      b.cyl(0.0115, 0.0115, y1 - y0, 10, mixHex(PAL.brushPink, 0xffffff, 0.55), { at: [0, (y0 + y1) / 2, 0], smooth: true });
      b.sphere(0.0118, 10, 5, PAL.brushPink, { at: [0, y1, 0], scale: [1, 0.7, 1], smooth: true });
      const rings = 6;
      const around = 7;
      for (let j = 0; j < rings; j++) {
        const y = y0 + 0.01 + (j / (rings - 1)) * (y1 - y0 - 0.02);
        for (let i = 0; i < around; i++) {
          const a = (i / around) * Math.PI * 2 + (j % 2) * (Math.PI / around);
          const dx = Math.sin(a);
          const dz = Math.cos(a);
          const len = 0.017;
          const rr = 0.0115 + len / 2;
          // Cone along +Y rotated to point radially outward.
          b.cone(0.0022, len, 3, PAL.bristle, { at: [dx * rr, y, dz * rr], rot: [Math.PI / 2, a, 0], ink: false });
        }
      }
      break;
    }
  }
  return b.build();
}

/** Brush model geometry (cached per kind; shared, never disposed per instance). */
export function brushGeometry(kind: BrushKind): THREE.BufferGeometry {
  return cachedGeo(`bhd-brush|${kind}`, () => buildGeo(kind));
}

// ── legendary glow (black brush) ───────────────────────────────────────────
function glowShellGeo(): THREE.BufferGeometry {
  return cachedGeo('bhd-brush|glowShell', () => {
    // Smooth, slightly inflated stand-ins for the paddle and handle (soft fresnel aura).
    const b = new GeoBuilder(false, false);
    b.sphere(1, 20, 14, 0xffffff, { at: [0, 0.116, 0], scale: [0.047, 0.062, 0.02], smooth: true });
    handle(b, 0xffffff, -0.087, 0.07, 0.0175, 0.8);
    return b.build();
  });
}

let haloMat: THREE.ShaderMaterial | null = null;
function haloMaterial(): THREE.ShaderMaterial {
  if (haloMat) return haloMat;
  haloMat = new THREE.ShaderMaterial({
    name: 'bhd-brush-halo',
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uGlow: { value: 0 },
      uSweep: { value: 0 },
      uColor: { value: new THREE.Color(PAL.blackBrushSheen) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vec3 p = position + normal * 0.017;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = position.y;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uGlow;
      uniform float uSweep;
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        // Violet aura (normal blend so it reads on light counters too) + a pale sheen band sweeping along.
        float rim = pow(f, 1.6);
        float band = exp(-pow((vY - uSweep) / 0.012, 2.0)) * (0.35 + 0.65 * f);
        float a = clamp(rim * 0.9 + band * 0.75, 0.0, 1.0) * uGlow;
        vec3 col = mix(uColor, vec3(1.0), band * 0.75 + rim * 0.15);
        gl_FragColor = linearToOutputTexel(vec4(col, a));
      }
    `,
  });
  return haloMat;
}

// Brush glint sprites share the hair sprite material (atlas star cell, additive).
const GLINT_SPOTS: readonly [number, number, number][] = [
  [0.036, 0.158, 0.012],
  [-0.04, 0.085, 0.01],
  [0.03, 0.074, -0.01],
  [-0.018, 0.176, 0.006],
  [0.012, -0.05, 0.016],
];

class BrushImpl implements Brush {
  readonly root = new THREE.Group();
  private glow = 0;
  private glowTarget = 0;
  private time = 0;
  private readonly halo: THREE.Mesh | null = null;
  private readonly haloU: { uGlow: { value: number }; uSweep: { value: number } } | null = null;
  private readonly glints: THREE.Mesh | null = null;
  private readonly gParam: Float32Array | null = null;

  constructor(readonly kind: BrushKind) {
    this.root.name = `brush-${kind}`;
    const m = new THREE.Mesh(brushGeometry(kind), modelMaterial());
    m.castShadow = true;
    this.root.add(m);
    if (kind === 'black') {
      const mat = haloMaterial().clone();
      this.haloU = mat.uniforms as unknown as { uGlow: { value: number }; uSweep: { value: number } };
      this.halo = new THREE.Mesh(glowShellGeo(), mat);
      this.halo.visible = false;
      this.halo.renderOrder = 3;
      this.root.add(this.halo);
      // Sparkle glints (additive stars).
      const n = GLINT_SPOTS.length;
      const pos = new Float32Array(n * 12);
      const corner = new Float32Array(n * 8);
      this.gParam = new Float32Array(n * 16);
      const tint = new Float32Array(n * 12);
      const add = new Float32Array(n * 4).fill(1);
      const idx = new Uint16Array(n * 6);
      const c = new THREE.Color(mixHex(PAL.blackBrushSheen, 0xffffff, 0.55));
      for (let i = 0; i < n; i++) {
        const [x, y, z] = GLINT_SPOTS[i]!;
        corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
        idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
        for (let k = 0; k < 4; k++) {
          pos.set([x, y, z], (i * 4 + k) * 3);
          tint.set([c.r, c.g, c.b], (i * 4 + k) * 3);
          this.gParam[(i * 4 + k) * 4 + 3] = CELL_STAR;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      g.setAttribute('aParam', new THREE.BufferAttribute(this.gParam, 4).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      g.setAttribute('aAdd', new THREE.BufferAttribute(add, 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      this.glints = new THREE.Mesh(g, hairSpriteMaterial());
      this.glints.frustumCulled = false;
      this.glints.visible = false;
      this.glints.renderOrder = 4;
      this.root.add(this.glints);
    }
  }

  setGlow(v: number): void {
    this.glowTarget = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  update(dt: number): void {
    if (!this.halo || !this.haloU || !this.glints || !this.gParam) return;
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    this.time += step;
    this.glow += (this.glowTarget - this.glow) * (step > 0 ? 1 - Math.exp(-5 * step) : 1);
    if (this.glow < 0.002) this.glow = this.glowTarget === 0 ? 0 : this.glow;
    const on = this.glow > 0.004;
    this.halo.visible = on;
    this.glints.visible = on;
    if (!on) return;
    const t = this.time;
    // Pulse + a sweep that travels handle → tip every ~1.8 s.
    const pulse = 0.85 + 0.15 * Math.sin(t * 3.1);
    this.haloU.uGlow.value = this.glow * pulse;
    const cyc = (t % 1.8) / 1.8;
    this.haloU.uSweep.value = -0.12 + cyc * 0.42;
    const n = GLINT_SPOTS.length;
    for (let i = 0; i < n; i++) {
      const tw = Math.max(0, Math.sin(t * (2.2 + i * 0.37) + i * 1.9));
      const s = (0.012 + 0.018 * tw * tw) * this.glow;
      const a = tw * this.glow;
      for (let k = 0; k < 4; k++) {
        const q = (i * 4 + k) * 4;
        this.gParam[q] = s;
        this.gParam[q + 1] = t * 0.8 + i;
        this.gParam[q + 2] = a;
      }
    }
    (this.glints.geometry.getAttribute('aParam') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    if (this.glints) this.glints.geometry.dispose();
    if (this.halo) (this.halo.material as THREE.Material).dispose();
    // Brush geometry/materials are shared caches (disposeTree skips them).
    disposeTree(this.root);
  }
}

export function createBrush(kind: BrushKind): Brush {
  return new BrushImpl(kind);
}
