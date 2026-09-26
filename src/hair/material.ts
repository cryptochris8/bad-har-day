// ─────────────────────────────────────────────────────────────────────────────
// Hair materials.
//
// BODY: the same vertex-coloured MeshToonMaterial + shared 3-band toonGradient() as every
// model (so the hair is lit by the world's hemisphere + key light exactly like the girls'
// faces and pajamas), extended via onBeforeCompile with the hair look:
//   • a stylised glossy "angel ring" crescent across the head (zig-zag toon edge, lens-shaped
//     per lock) + softer lens streaks down the fall — strength = shine, off where tangled;
//   • a darker part line + soft combed grooves on the cap;
//   • tangle → duller, flatter colour; a soft lit rim for volume.
// INK: the game's inverted-hull outline, but as a separate BackSide pass over the SAME vertex
// buffers (extruded in the vertex shader by the shared distance-scaled INK_WIDTH), so the
// deforming hair needs no CPU-side hull copy. Per-vertex aInkW makes the lock separation lines
// thinner than the outer silhouette.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { INK_WIDTH } from '../render/models/materials';
import { markShared } from '../render/models/shared';
import { toonGradient } from '../render/toon';

export interface HairUniforms {
  uShine: { value: number };
  uTime: { value: number };
  uSheen: { value: THREE.Color };
  uRoot: { value: THREE.Color };
  uDull: { value: THREE.Color };
  /** Part line: x, zBack, zFront. */
  uPart: { value: THREE.Vector3 };
  uHeadR: { value: THREE.Vector3 };
}

const VERT_PARS = /* glsl */ `
attribute vec4 aHair;
attribute float aTangle;
varying vec4 vHair;
varying float vTangle;
varying vec3 vHeadPos;
`;
const VERT_MAIN = /* glsl */ `
vHair = aHair;
vTangle = aTangle;
vHeadPos = position;
`;

const FRAG_PARS = /* glsl */ `
varying vec4 vHair;
varying float vTangle;
varying vec3 vHeadPos;
uniform float uShine;
uniform float uTime;
uniform vec3 uSheen;
uniform vec3 uRoot;
uniform vec3 uDull;
uniform vec3 uPart;
uniform vec3 uHeadR;
`;

const FRAG_BODY = /* glsl */ `
{
  float tg = clamp(vTangle, 0.0, 1.0);
  float layer = vHair.z;
  float base = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)) + 1e-4;
  float lit = clamp(dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) / base, 0.0, 1.6);
  vec3 hp = vHeadPos / uHeadR;
  float hl = 0.0;

  // Cap: darker part line + soft combed grooves (lines of constant z flowing away from the part).
  if (layer < 0.5) {
    float dx = abs(vHeadPos.x - uPart.x);
    float onPart = step(uPart.y, vHeadPos.z) * step(vHeadPos.z, uPart.z) * step(0.0, vHeadPos.y);
    float pw = fwidth(vHeadPos.x);
    float partLine = (1.0 - smoothstep(0.0022, 0.0022 + pw * 1.5, dx)) * onPart;
    float gz = vHeadPos.z * 46.0 + sin(vHeadPos.y * 26.0 + vHeadPos.x * 9.0) * 0.3;
    float gd = 0.5 - abs(fract(gz) - 0.5);
    float gw = fwidth(gz);
    float groove = (1.0 - smoothstep(0.035, 0.035 + gw * 1.5, gd)) * smoothstep(0.006, 0.03, dx) * step(-0.06, vHeadPos.z);
    outgoingLight = mix(outgoingLight, uRoot * max(lit, 0.6), groove * 0.28);
    outgoingLight = mix(outgoingLight, uRoot * 0.75, partLine * 0.9);
  }

  // Angel-ring crescent across the head (tilted back): smooth upper edge, spiky lower edge that
  // follows the locks (each lock carries a pointed lens of light).
  float isUnder = step(abs(layer - 2.0), 0.5);
  float isLock = step(0.5, layer) * (1.0 - isUnder);
  float across = vHair.y;
  if (length(hp) < 1.45 && isUnder < 0.5) {
    vec3 ax = vec3(0.0, 0.93, -0.36);
    float ang = acos(clamp(dot(normalize(hp), ax), -1.0, 1.0));
    float az = atan(hp.x, hp.z);
    float zig = abs(fract(az * 3.3 + 0.25) - 0.5) * 2.0;
    float spike = mix(zig, 1.0 - min(1.0, abs(across)), isLock);
    float top = 0.93;
    float bottom = top + 0.035 + 0.075 * spike * spike;
    float ring = min((ang - top) / 0.02, (bottom - ang) / 0.03);
    ring = min(ring, 1.0) - isLock * across * across * 0.9;
    hl = max(hl, ring);
  }
  // Thin streaks of light down the crest of the hanging locks (not every lock).
  if (abs(layer - 1.0) < 0.5 || abs(layer - 3.0) < 0.5) {
    float hang = smoothstep(-0.04, -0.12, vHeadPos.y);
    float c2 = 0.58 + (vHair.w - 0.5) * 0.2;
    float lens = 1.0 - (abs(vHair.x - c2) / 0.1 + across * across * 4.0);
    hl = max(hl, lens * hang * step(0.3, vHair.w) * 0.75);
  }
  float litK = smoothstep(0.62, 0.95, lit);
  float hlA = smoothstep(0.0, 0.1, hl) * uShine * (1.0 - 0.9 * tg) * (0.3 + 0.7 * litK);
  // Gloss keeps the hair's own hue: brighten it, then lift a little toward the sheen tint.
  vec3 gloss = mix(outgoingLight * 1.75, uSheen * (0.8 + 0.3 * min(lit, 1.2)), 0.38);
  outgoingLight = mix(outgoingLight, gloss, hlA * 0.9);

  // Soft lit rim (volume), fades with tangle.
  vec3 Vw = normalize(vViewPosition);
  float rim = smoothstep(0.62, 0.85, 1.0 - clamp(dot(normal, Vw), 0.0, 1.0));
  outgoingLight += uSheen * rim * 0.12 * min(lit, 1.0) * (0.4 + 0.6 * uShine) * (1.0 - tg);

  // Tangled sections: duller, flatter tone.
  outgoingLight = mix(outgoingLight, uDull * (0.55 + 0.45 * min(lit, 1.2)), tg * 0.5);
}
`;

export function createHairUniforms(): HairUniforms {
  return {
    uShine: { value: 1 },
    uTime: { value: 0 },
    uSheen: { value: new THREE.Color() },
    uRoot: { value: new THREE.Color() },
    uDull: { value: new THREE.Color() },
    uPart: { value: new THREE.Vector3() },
    uHeadR: { value: new THREE.Vector3(0.18, 0.19, 0.18) },
  };
}

/** Per-rig hair body material (own uniforms; all rigs share one compiled program). */
export function hairBodyMaterial(u: HairUniforms): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <opaque_fragment>', FRAG_BODY + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'bhd-hair-body';
  m.name = 'bhd-hair-body';
  return m;
}

// ── ink pass ────────────────────────────────────────────────────────────────
/** Hair outlines are thinner than model outlines up close (lock separation lines). */
export const HAIR_INK_MIN = 0.005;

let inkMat: THREE.ShaderMaterial | null = null;

/** Shared ink (inverted hull) material for hair geometry with an aInkW attribute. */
export function hairInkMaterial(): THREE.ShaderMaterial {
  if (inkMat) return inkMat;
  inkMat = new THREE.ShaderMaterial({
    name: 'bhd-hair-ink',
    side: THREE.BackSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uInk: { value: new THREE.Color(PAL.outline) },
        uInkScale: { value: INK_WIDTH.SCALE },
        uInkMin: { value: HAIR_INK_MIN },
        uInkMax: { value: INK_WIDTH.MAX },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute float aInkW;
      uniform float uInkScale;
      uniform float uInkMin;
      uniform float uInkMax;
      #include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 mvc = modelViewMatrix * vec4(position, 1.0);
        float w = clamp(-mvc.z * uInkScale, uInkMin, uInkMax) * aInkW;
        vec3 p = position + normal * w;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInk;
      #include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(uInk, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  markShared(inkMat);
  return inkMat;
}

// ── sprites (knot swirls, frizz squiggles, flyaways, sparkle glints, knot scribbles) ────
export const CELL_SWIRL = 0;
export const CELL_FRIZZ = 1;
export const CELL_STAR = 2;
export const CELL_STRAND = 3;
export const CELL_KNOT = 4;
export const CELL_GLOW = 5;

/** Atlas: 4 × 2 cells of CELL px. */
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;
const CELL = 128;
const AW = CELL * ATLAS_COLS;
const AH = CELL * ATLAS_ROWS;

function cellOrigin(cell: number): [number, number] {
  return [(cell % ATLAS_COLS) * CELL, Math.floor(cell / ATLAS_COLS) * CELL];
}

function stampLine(a: Float32Array, cell: number, pts: readonly [number, number][], width: number): void {
  // pts in cell units (-1..1); stamp anti-aliased discs along the polyline.
  const [cx0, cy0] = cellOrigin(cell);
  const r = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const px0 = cx0 + (x0 * 0.46 + 0.5) * CELL;
    const py0 = cy0 + (y0 * 0.46 + 0.5) * CELL;
    const px1 = cx0 + (x1 * 0.46 + 0.5) * CELL;
    const py1 = cy0 + (y1 * 0.46 + 0.5) * CELL;
    const len = Math.hypot(px1 - px0, py1 - py0);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    for (let s = 0; s <= steps; s++) {
      const x = px0 + ((px1 - px0) * s) / steps;
      const y = py0 + ((py1 - py0) * s) / steps;
      for (let yy = Math.floor(y - r - 1); yy <= Math.ceil(y + r + 1); yy++) {
        for (let xx = Math.floor(x - r - 1); xx <= Math.ceil(x + r + 1); xx++) {
          if (xx < cx0 || yy < cy0 || xx >= cx0 + CELL || yy >= cy0 + CELL) continue;
          const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
          const c = Math.max(0, Math.min(1, r + 0.5 - d));
          const k = yy * AW + xx;
          if (c > a[k]!) a[k] = c;
        }
      }
    }
  }
}

function fillCell(a: Float32Array, cell: number, f: (u: number, v: number) => number): void {
  const [cx0, cy0] = cellOrigin(cell);
  for (let y = 0; y < CELL; y++)
    for (let x = 0; x < CELL; x++) {
      const u = ((x + 0.5) / CELL - 0.5) * 2;
      const v = ((y + 0.5) / CELL - 0.5) * 2;
      const k = (cy0 + y) * AW + cx0 + x;
      a[k] = Math.max(a[k]!, Math.min(1, f(u, v)));
    }
}

/**
 * Procedural sprite atlas (pure JS pixels, AW × AH RGBA): swirl, frizz squiggle, sparkle star,
 * flyaway strand, knot scribble, soft glow disc.
 */
export function buildAtlasPixels(): Uint8Array {
  const a = new Float32Array(AW * AH);
  const glow = new Float32Array(AW * AH);
  // 0: swirl (knot marker) — an Archimedean spiral + a soft halo.
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 140; i++) {
      const t = (i / 140) * Math.PI * 3.6;
      const r = 0.12 + 0.235 * (t / Math.PI);
      pts.push([Math.cos(t) * r * 0.95, Math.sin(t) * r * 0.95]);
    }
    stampLine(a, CELL_SWIRL, pts, 9);
    fillCell(glow, CELL_SWIRL, (u, v) => Math.max(0, 1 - Math.hypot(u, v)) ** 2 * 0.35);
  }
  // 1: frizz squiggle (curly loops along a short arc).
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 220; i++) {
      const t = i / 220;
      const x = -0.85 + 1.7 * t + 0.2 * Math.cos(t * Math.PI * 7);
      const y = 0.22 * Math.sin(t * Math.PI * 7) - 0.25 * Math.sin(t * Math.PI);
      pts.push([x, y]);
    }
    stampLine(a, CELL_FRIZZ, pts, 5);
  }
  // 2: sparkle star (4 points + core).
  fillCell(a, CELL_STAR, (u, v) => {
    const ray = Math.exp(-(Math.abs(u) * 9 + v * v * 90)) + Math.exp(-(Math.abs(v) * 9 + u * u * 90));
    return ray * 1.1 + Math.exp(-(u * u + v * v) * 22);
  });
  // 3: flyaway strand (a springy arc with a little curl at the end).
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      const ang = Math.PI * (1.05 - 0.9 * t);
      const r = 0.8 - 0.25 * t;
      let x = Math.cos(ang) * r;
      let y = Math.sin(ang) * r - 0.35;
      if (t > 0.8) {
        const k = (t - 0.8) / 0.2;
        x += Math.sin(k * Math.PI * 1.5) * 0.12;
        y -= (1 - Math.cos(k * Math.PI * 1.5)) * 0.08;
      }
      pts.push([x, y]);
    }
    stampLine(a, CELL_STRAND, pts, 4);
  }
  // 4: knot scribble — a cute ball of looping lines (a tangled little cluster).
  {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 420; i++) {
      const t = (i / 420) * Math.PI * 9;
      const r = 0.42 + 0.26 * Math.sin(t * 0.53 + 0.4) + 0.08 * Math.sin(t * 2.9);
      pts.push([Math.cos(t) * r * 0.95 + 0.06 * Math.sin(t * 0.31), Math.sin(t) * r * 0.8 + 0.05 * Math.cos(t * 0.23)]);
    }
    stampLine(a, CELL_KNOT, pts, 5);
  }
  // 5: soft glow disc.
  fillCell(glow, CELL_GLOW, (u, v) => Math.max(0, 1 - Math.hypot(u, v)) ** 2);
  const px = new Uint8Array(AW * AH * 4);
  for (let i = 0; i < AW * AH; i++) {
    const al = Math.min(1, a[i]! + glow[i]!);
    // rgb = 255 for lines, slightly dimmer for halos (so the tint reads on the strokes).
    const lum = al > 0 ? (a[i]! + glow[i]! * 0.8) / al : 0;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = Math.round(255 * Math.min(1, lum));
    px[i * 4 + 3] = Math.round(255 * al);
  }
  return px;
}

let atlas: THREE.DataTexture | null = null;
export function spriteAtlas(): THREE.DataTexture {
  if (atlas) return atlas;
  atlas = new THREE.DataTexture(buildAtlasPixels(), AW, AH, THREE.RGBAFormat);
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.flipY = false;
  atlas.needsUpdate = true;
  markShared(atlas);
  return atlas;
}

let spriteMat: THREE.ShaderMaterial | null = null;

/**
 * Shared billboard sprite material. Premultiplied blending so one draw call mixes normal
 * (knots, frizz) and additive (glints) sprites: aAdd = 1 → additive.
 */
export function hairSpriteMaterial(): THREE.ShaderMaterial {
  if (spriteMat) return spriteMat;
  spriteMat = new THREE.ShaderMaterial({
    name: 'bhd-hair-sprite',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    uniforms: { uMap: { value: spriteAtlas() } },
    vertexShader: /* glsl */ `
      attribute vec2 aCorner;
      attribute vec4 aParam; // size, rotation, alpha, cell
      attribute vec3 aTint;
      attribute float aAdd;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vAlpha;
      varying float vAdd;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float c = cos(aParam.y);
        float s = sin(aParam.y);
        vec2 off = vec2(c * aCorner.x - s * aCorner.y, s * aCorner.x + c * aCorner.y) * aParam.x;
        mv.xy += off;
        mv.z += aParam.x * 0.6; // nudge toward the camera so sprites sit on (not in) the hair
        gl_Position = projectionMatrix * mv;
        float cell = aParam.w;
        vec2 cellSize = vec2(1.0 / ${ATLAS_COLS}.0, 1.0 / ${ATLAS_ROWS}.0);
        vec2 origin = vec2(mod(cell, ${ATLAS_COLS}.0), floor(cell / ${ATLAS_COLS}.0)) * cellSize;
        vUv = origin + (aCorner * 0.5 + 0.5) * cellSize;
        vTint = aTint;
        vAlpha = aParam.z;
        vAdd = aAdd;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vAlpha;
      varying float vAdd;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        float a = t.a * vAlpha;
        if (a < 0.004) discard;
        vec3 col = linearToOutputTexel(vec4(vTint * t.rgb, 1.0)).rgb;
        gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
      }
    `,
  });
  markShared(spriteMat);
  return spriteMat;
}
