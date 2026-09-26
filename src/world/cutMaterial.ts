// ─────────────────────────────────────────────────────────────────────────────
// Cut-away rendering: every vertex of a cut-able mesh carries `aSeg` (its wall
// segment id; 0 = never cut). The vertex shader squashes everything above
// CUT_BASE into [CUT_BASE, CUT_H] by the segment's factor uCut[aSeg] (1 = full
// height). The same squash runs in the shadow depth pass, so cut walls stop
// casting their full-height shadows. Works for toon (inked), basic and depth
// materials (they all share three's <common>/<begin_vertex> chunks).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { toonGradient } from '../render/toon';
import { INK_BASE, type GeoBuilder } from '../render/models/builder';
import { INK_WIDTH } from '../render/models/materials';
import { CUT_BASE, CUT_H, WALL_H } from './layout';

export const MAX_SEGS = 48;
/** Squash factor of a fully cut wall. */
export const CUT_S = (CUT_H - CUT_BASE) / (WALL_H - CUT_BASE);

export interface CutUniforms {
  uCut: { value: Float32Array };
  uCutBase: { value: number };
}

export function createCutUniforms(): CutUniforms {
  return { uCut: { value: new Float32Array(MAX_SEGS).fill(1) }, uCutBase: { value: CUT_BASE } };
}

const SQUASH_PARS = /* glsl */ `
attribute float aSeg;
uniform float uCut[${MAX_SEGS}];
uniform float uCutBase;
`;
export const SQUASH_VERT = /* glsl */ `
{
  vec4 cutW = modelMatrix * vec4(transformed, 1.0);
  float cutS = uCut[int(aSeg + 0.5)];
  if (cutW.y > uCutBase && cutS < 0.9999) {
    float cutY = uCutBase + (cutW.y - uCutBase) * cutS;
    transformed.y += (cutY - cutW.y) / max(modelMatrix[1][1], 1e-4);
  }
}
`;

const INK_PARS = /* glsl */ `
attribute vec3 aInk;
attribute vec3 aGlow;
varying float vInk;
varying vec3 vGlow;
uniform float uInkScale;
uniform float uInkMin;
uniform float uInkMax;
uniform float uInkBase;
`;
const INK_VERT = /* glsl */ `
vInk = step(0.0001, dot(aInk, aInk));
vGlow = aGlow;
if (vInk > 0.5) {
  vec4 inkMv = modelViewMatrix * vec4(transformed, 1.0);
  float inkW = clamp(-inkMv.z * uInkScale, uInkMin, uInkMax) - uInkBase;
  transformed += aInk * max(inkW, 0.0);
}
`;
const INK_FRAG_PARS = /* glsl */ `
varying float vInk;
varying vec3 vGlow;
uniform vec3 uInkColor;
`;
const INK_FRAG = /* glsl */ `
if (vGlow.r + vGlow.g + vGlow.b > 0.001) outgoingLight = vGlow;
if (vInk > 0.5) outgoingLight = uInkColor;
`;

/** Add the squash to any built-in material's vertex shader (keeps an existing onBeforeCompile). */
export function injectSquash<T extends THREE.Material>(m: T, u: CutUniforms, key: string): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uCut = u.uCut;
    shader.uniforms.uCutBase = u.uCutBase;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SQUASH_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SQUASH_VERT);
  };
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + '|bhd-cut|' + key;
  return m;
}

/** Vertex-coloured, inked toon material with the cut-away squash (walls, trims, doors, curtains, wall decor). */
export function cutToonMaterial(u: CutUniforms, key: string): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: toonGradient() });
  const inkColor = { value: new THREE.Color(PAL.outline) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uInkColor = inkColor;
    shader.uniforms.uInkScale = { value: INK_WIDTH.SCALE };
    shader.uniforms.uInkMin = { value: INK_WIDTH.MIN };
    shader.uniforms.uInkMax = { value: INK_WIDTH.MAX };
    shader.uniforms.uInkBase = { value: INK_BASE };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + INK_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + INK_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + INK_FRAG_PARS)
      .replace('#include <opaque_fragment>', INK_FRAG + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'bhd-cut-toon';
  m.name = 'bhd-cut-' + key;
  return injectSquash(m, u, 'toon');
}

/** Shadow depth material with the same squash (assign to mesh.customDepthMaterial). */
export function cutDepthMaterial(u: CutUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial();
  m.name = 'bhd-cut-depth';
  return injectSquash(m, u, 'depth');
}

/** aSeg attribute from a GeoBuilder's per-vertex roles (hull vertices inherit their face's segment). */
export function segAttribute(roles: readonly number[]): THREE.Float32BufferAttribute {
  const a = new Float32Array(roles.length);
  for (let i = 0; i < roles.length; i++) {
    let r = roles[i]!;
    if (r < 0) r = roles[i - 3] ?? 0; // ink hull: same face's body vertex
    a[i] = r < 0 ? 0 : r;
  }
  return new THREE.Float32BufferAttribute(a, 1);
}

/** Build a GeoBuilder into a geometry with its aSeg attribute. */
export function buildWithSeg(b: GeoBuilder): THREE.BufferGeometry {
  const roles = b.roles.slice();
  const g = b.build();
  g.setAttribute('aSeg', segAttribute(roles));
  return g;
}

/** A mesh that squashes with the walls and casts correct shadows. */
export function cutMesh(geo: THREE.BufferGeometry, mat: THREE.Material, depth: THREE.Material, opts: { cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.customDepthMaterial = depth;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}
