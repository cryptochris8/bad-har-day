// ─────────────────────────────────────────────────────────────────────────────
// Brushing guides drawn ON the focused girl's hair (children of her rig root, so they follow sway):
//   • the ENDS band — a glowing dashed line with little down-chevrons at the top of the lowest section that
//     still has knots ("start your strokes here"), shown while the lower sections are knotted;
//   • the cell highlight — a soft rounded frame around the knotted section under the brush: gold = work it now,
//     pink = a knot further down is still in the way ("start lower").
// Two tiny dynamic meshes, one draw call each, only while visible. Never in the mirror reflection.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { GirlHairRig } from '../../hair/rig';
import { PAL } from '../../render/palette';

const BAND_SEG = 22;
const PATCH = 5;
const LIFT = 0.016;

const BAND_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BAND_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  // Top: a dashed glowing line flowing across; below: chevrons drifting down ("brush down from here").
  float line = exp(-pow((vUv.y - 0.14) / 0.07, 2.0));
  float dash = smoothstep(0.25, 0.4, abs(fract(vUv.x * 14.0 - uTime * 0.6) - 0.5) * 2.0);
  float glow = exp(-pow((vUv.y - 0.14) / 0.2, 2.0)) * 0.35;
  float cx = fract(vUv.x * 7.0) - 0.5;
  float cy = fract((vUv.y - 0.3) * 2.4 - uTime * 0.9);
  float chev = (1.0 - smoothstep(0.02, 0.07, abs(abs(cx) * 1.25 - (0.55 - cy) * 0.55))) * step(0.32, vUv.y) * smoothstep(0.02, 0.2, cy) * smoothstep(0.75, 0.45, cy);
  float fadeX = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
  float fadeY = smoothstep(1.0, 0.7, vUv.y);
  float a = (line * (0.55 + 0.45 * dash) + glow + chev * 0.75) * fadeX * fadeY * uAlpha;
  vec3 col = mix(uColor, vec3(1.0), line * 0.45);
  gl_FragColor = linearToOutputTexel(vec4(col, clamp(a, 0.0, 1.0)));
}`;

const CELL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlpha;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  // Rounded-box SDF in −1..1 patch space: a soft pulsing outline + a faint fill.
  vec2 p = (vUv - 0.5) * 2.0;
  vec2 q = abs(p) - vec2(0.82) + 0.3;
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.3;
  float outline = exp(-pow(sd / 0.07, 2.0));
  float fill = (1.0 - smoothstep(-0.05, 0.0, sd)) * 0.14;
  float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
  float a = (outline * pulse + fill) * uAlpha;
  gl_FragColor = linearToOutputTexel(vec4(mix(uColor, vec3(1.0), outline * 0.3), clamp(a, 0.0, 1.0)));
}`;

function material(frag: string, color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'bhd-hair-guide',
    vertexShader: BAND_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Color(color) } },
  });
}

function strip(cols: number, rows: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const n = (cols + 1) * (rows + 1);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(n * 2);
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i <= cols; i++) {
      uv[(j * (cols + 1) + i) * 2] = i / cols;
      uv[(j * (cols + 1) + i) * 2 + 1] = j / rows;
    }
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      idx.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
  return g;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

export type CellHint = 'go' | 'wait';

export class HairGuides {
  readonly band: THREE.Mesh;
  readonly cell: THREE.Mesh;
  private readonly bandMat = material(BAND_FRAG, PAL.interact);
  private readonly cellMat = material(CELL_FRAG, PAL.interact);
  private bandA = 0;
  private cellA = 0;
  private bandV = -1;
  private time = 0;
  private cellKey = '';

  constructor() {
    this.band = new THREE.Mesh(strip(BAND_SEG, 3), this.bandMat);
    this.band.name = 'hairEndsGuide';
    this.band.renderOrder = 5;
    this.band.frustumCulled = false;
    this.band.visible = false;
    this.cell = new THREE.Mesh(strip(PATCH, PATCH), this.cellMat);
    this.cell.name = 'hairKnotHighlight';
    this.cell.renderOrder = 5;
    this.cell.frustumCulled = false;
    this.cell.visible = false;
  }

  /** Follow a girl's hair (reparent to her rig root). */
  attach(rig: GirlHairRig): void {
    if (this.band.parent !== rig.root) {
      rig.root.add(this.band, this.cell);
      this.bandA = 0;
      this.cellA = 0;
      this.cellKey = '';
    }
  }

  detach(): void {
    this.band.removeFromParent();
    this.cell.removeFromParent();
  }

  /**
   * `bandV` = hair-space v of the "start here" line (null = hidden). `cell` = the knotted section under the brush
   * (null = none). `dim` fades both while a stroke is in progress.
   */
  update(dt: number, rig: GirlHairRig, bandV: number | null, cell: { u0: number; u1: number; v0: number; v1: number; hint: CellHint } | null, dim: boolean): void {
    this.time += dt;
    const k = 1 - Math.exp(-8 * dt);
    // Band.
    const bandTarget = bandV === null ? 0 : dim ? 0.45 : 1;
    if (bandV !== null) this.bandV = this.bandV < 0 ? bandV : this.bandV + (bandV - this.bandV) * k;
    this.bandA += (bandTarget - this.bandA) * k;
    this.band.visible = this.bandA > 0.02 && this.bandV >= 0;
    if (this.band.visible) {
      this.bandMat.uniforms.uAlpha!.value = this.bandA;
      this.bandMat.uniforms.uTime!.value = this.time;
      const pos = this.band.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j <= 3; j++) {
        const v = Math.max(0, Math.min(1, this.bandV - 0.015 + j * 0.028));
        for (let i = 0; i <= BAND_SEG; i++) {
          const u = 0.02 + (i / BAND_SEG) * 0.96;
          rig.surfacePointLocal(u, v, _p);
          rig.surfaceNormalLocal(u, v, _n);
          _p.addScaledVector(_n, LIFT);
          pos.setXYZ(j * (BAND_SEG + 1) + i, _p.x, _p.y, _p.z);
        }
      }
      pos.needsUpdate = true;
    }
    // Cell highlight.
    const cellTarget = cell ? (dim ? 0.7 : 1) : 0;
    this.cellA += (cellTarget - this.cellA) * (1 - Math.exp(-12 * dt));
    this.cell.visible = this.cellA > 0.02;
    if (cell) {
      const key = `${cell.u0}|${cell.v0}|${cell.hint}`;
      if (key !== this.cellKey) {
        this.cellKey = key;
        (this.cellMat.uniforms.uColor!.value as THREE.Color).setHex(cell.hint === 'go' ? PAL.interact : PAL.knot);
      }
      const pos = this.cell.geometry.getAttribute('position') as THREE.BufferAttribute;
      const du = (cell.u1 - cell.u0) * 0.08;
      const dv = (cell.v1 - cell.v0) * 0.06;
      for (let j = 0; j <= PATCH; j++)
        for (let i = 0; i <= PATCH; i++) {
          const u = cell.u0 - du + ((cell.u1 - cell.u0 + 2 * du) * i) / PATCH;
          const v = cell.v0 - dv + ((cell.v1 - cell.v0 + 2 * dv) * j) / PATCH;
          rig.surfacePointLocal(Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)), _p);
          rig.surfaceNormalLocal(Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)), _n);
          _p.addScaledVector(_n, LIFT + 0.004);
          pos.setXYZ(j * (PATCH + 1) + i, _p.x, _p.y, _p.z);
        }
      pos.needsUpdate = true;
    }
    if (this.cell.visible) {
      this.cellMat.uniforms.uAlpha!.value = this.cellA;
      this.cellMat.uniforms.uTime!.value = this.time;
    }
  }

  dispose(): void {
    this.detach();
    this.band.geometry.dispose();
    this.cell.geometry.dispose();
    this.bandMat.dispose();
    this.cellMat.dispose();
  }
}
