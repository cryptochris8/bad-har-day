// ─────────────────────────────────────────────────────────────────────────────
// Prop highlight ("selected / hover"): a warm-gold shell drawn with the prop's OWN
// cached geometry (no extra buffers). One shader does two things:
//   • body triangles  → a soft fresnel rim glow over the surface (camera-facing
//                        centre stays readable, silhouette edges light up gold);
//   • ink-hull triangles (aInk ≠ 0) → pushed out past the plum outline so a gold
//                        halo band surrounds the ink line, ~constant on screen
//                        (same distance scaling as the model material's ink).
// Materials are created lazily per prop (only once it is highlighted) and share
// one compiled program; the gentle pulse uses one global time uniform.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { INK_BASE } from '../render/models/builder';
import { INK_WIDTH } from '../render/models/materials';

/** Halo width (m) beyond the ink = clamp(viewDistance × SCALE, MIN, MAX) × amount. */
export const HALO_WIDTH = { SCALE: 0.0036, MIN: 0.005, MAX: 0.07 } as const;

const time = { value: 0 };

const vert = /* glsl */ `
attribute vec3 aInk;
uniform float uAmt;
varying float vRim;
varying float vHalo;
void main() {
  vec3 p = position;
  float isInk = step(0.0001, dot(aInk, aInk));
  vec4 mv0 = modelViewMatrix * vec4(p, 1.0);
  float dist = max(-mv0.z, 0.0);
  float inkW = clamp(dist * ${INK_WIDTH.SCALE.toFixed(5)}, ${INK_WIDTH.MIN.toFixed(5)}, ${INK_WIDTH.MAX.toFixed(5)}) - ${INK_BASE.toFixed(5)};
  float halo = clamp(dist * ${HALO_WIDTH.SCALE.toFixed(5)}, ${HALO_WIDTH.MIN.toFixed(5)}, ${HALO_WIDTH.MAX.toFixed(5)}) * (0.55 + 0.45 * uAmt);
  p += aInk * (max(inkW, 0.0) + halo);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec3 n = normalize(normalMatrix * normal);
  vec3 v = normalize(-mv.xyz);
  vRim = 1.0 - clamp(abs(dot(n, v)), 0.0, 1.0);
  vHalo = isInk;
}`;

const frag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uAmt;
uniform float uTime;
varying float vRim;
varying float vHalo;
void main() {
  float pulse = 0.82 + 0.18 * sin(uTime * 5.5);
  vec3 col;
  float a;
  if (vHalo > 0.5) {
    col = uColor;
    a = 0.92 * uAmt * pulse;
  } else {
    float rim = pow(vRim, 2.2);
    col = mix(uCore, uColor, rim);
    a = (0.1 + 0.7 * rim) * uAmt * pulse;
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

export interface HighlightMaterial extends THREE.ShaderMaterial {
  uniforms: { uAmt: { value: number }; uColor: { value: THREE.Color }; uCore: { value: THREE.Color }; uTime: { value: number } };
}

/** A per-prop highlight material (dispose it with the prop). */
export function highlightMaterial(): HighlightMaterial {
  const m = new THREE.ShaderMaterial({
    name: 'bhd-prop-highlight',
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uAmt: { value: 0 },
      uColor: { value: new THREE.Color(PAL.interact) },
      uCore: { value: new THREE.Color(PAL.interactGlow) },
      uTime: time,
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  return m as HighlightMaterial;
}

/** onBeforeRender hook for shells: advances the shared pulse clock (cheap, allocation-free). */
export function tickHighlight(): void {
  time.value = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
}

/** Clamp a highlight amount to 0..1 (NaN → 0). */
export function clampAmount(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
