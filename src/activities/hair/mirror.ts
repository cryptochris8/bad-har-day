// ─────────────────────────────────────────────────────────────────────────────
// The bathroom mirror's reflection (so the girls' reactions read from the brushing camera behind them).
//
// A virtual camera = the main camera reflected across the mirror plane (oblique near plane on the mirror, like
// three's Reflector) renders ONLY a whitelisted layer (the bathroom furniture/walls/floor, the family, our
// props, the lights) into a small render target, at ≤ 30 Hz. The virtual projection is cropped to the mirror's
// on-screen rectangle so every RT pixel lands on the glass. The mirror's material is swapped for one that
// samples the RT projectively (keeping the original soft glass streaks) and restored on dispose.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const MIRROR_LAYER = 7;

const VERT = /* glsl */ `
uniform mat4 uTexMat;
varying vec4 vUvP;
varying vec2 vUv;
void main() {
  vUv = uv;
  vUvP = uTexMat * vec4(position, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform float uHas;
uniform float uDim;
uniform vec3 uGlassA;
uniform vec3 uGlassB;
varying vec4 vUvP;
varying vec2 vUv;
void main() {
  vec3 glass = mix(uGlassA, uGlassB, vUv.y);
  vec2 st = vUvP.xy / max(vUvP.w, 1e-5);
  vec3 refl = texture2D(tMap, st).rgb;
  float inside = step(0.0, st.x) * step(st.x, 1.0) * step(0.0, st.y) * step(st.y, 1.0) * uHas;
  // Slightly cool, slightly brighter glass so it reads as a mirror, with the original soft streaks on top.
  vec3 col = mix(glass, refl * 1.04 + vec3(0.012, 0.018, 0.026), inside * 0.94);
  float s1 = smoothstep(0.05, 0.0, abs(vUv.x * 0.9 + vUv.y * 0.5 - 0.42) - 0.03);
  float s2 = smoothstep(0.03, 0.0, abs(vUv.x * 0.9 + vUv.y * 0.5 - 0.58) - 0.01);
  col += vec3(0.12) * (s1 + s2 * 0.7);
  // Soft vignette toward the frame.
  vec2 e = min(vUv, 1.0 - vUv);
  col *= 0.9 + 0.1 * smoothstep(0.0, 0.06, min(e.x, e.y * 2.4));
  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
}`;

export interface MirrorOpts {
  width?: number;
  height?: number;
  /** Max reflection renders per second. */
  hz?: number;
  /** MSAA samples (WebGL2). */
  samples?: number;
}

export class MirrorReflection {
  readonly rt: THREE.WebGLRenderTarget;
  readonly camera = new THREE.PerspectiveCamera();
  private readonly material: THREE.ShaderMaterial;
  private readonly original: THREE.Material | THREE.Material[];
  private readonly tagged: THREE.Object3D[] = [];
  private acc = 1;
  private readonly period: number;
  /** Smoothed frame time: when the game runs slowly the reflection drops to ~12 Hz. */
  private frameDt = 1 / 60;
  /** Renders performed (tests / perf). */
  renders = 0;
  lastMs = 0;
  /** Draw calls / triangles of the last reflection pass. */
  lastCalls = 0;
  lastTris = 0;
  enabled = true;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly mirror: THREE.Mesh,
    o: MirrorOpts = {},
  ) {
    this.rt = new THREE.WebGLRenderTarget(o.width ?? 640, o.height ?? 320, { depthBuffer: true, samples: o.samples ?? 0 });
    this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.period = 1 / (o.hz ?? 30);
    this.camera.layers.set(MIRROR_LAYER);
    this.original = mirror.material;
    const prev = mirror.material as THREE.ShaderMaterial;
    const dimU = prev.uniforms?.uDim;
    this.material = new THREE.ShaderMaterial({
      name: 'bhd-mirror-reflect',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tMap: { value: this.rt.texture },
        uTexMat: { value: new THREE.Matrix4() },
        uHas: { value: 0 },
        // Share the world's day/night dimming uniform when it exists.
        uDim: dimU ?? { value: 1 },
        uGlassA: { value: new THREE.Color(0xa9c4d6) },
        uGlassB: { value: new THREE.Color(0xcfe6f2) },
      },
    });
    mirror.material = this.material;
  }

  /** Show `obj` (and its descendants) in the reflection. */
  include(obj: THREE.Object3D | null | undefined): void {
    if (!obj) return;
    obj.traverse((o) => {
      if (o === this.mirror || o.layers.isEnabled(MIRROR_LAYER)) return;
      o.layers.enable(MIRROR_LAYER);
      this.tagged.push(o);
    });
  }

  /** Include a single object only (no descendants). */
  includeOne(obj: THREE.Object3D | null | undefined): void {
    if (!obj || obj === this.mirror || obj.layers.isEnabled(MIRROR_LAYER)) return;
    obj.layers.enable(MIRROR_LAYER);
    this.tagged.push(obj);
  }

  /** Render the reflection if it's due (≤ hz). `force` renders now. */
  update(dt: number, camera: THREE.PerspectiveCamera, force = false): void {
    if (this.disposed || !this.enabled) return;
    this.acc += dt;
    if (dt > 0) this.frameDt += (Math.min(dt, 0.25) - this.frameDt) * 0.1;
    const period = this.frameDt > 1 / 28 ? Math.max(this.period, 1 / 12) : this.period;
    if (!force && this.acc < period) return;
    this.acc = 0;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const m = this.mirror;
    const u = this.material.uniforms;
    m.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    if (!reflectCamera(camera, m.matrixWorld, geo.boundingBox!, this.camera, u.uTexMat!.value as THREE.Matrix4)) {
      u.uHas!.value = 0;
      return;
    }
    const vc = this.camera;
    // Render (no shadow-map re-render, restore state).
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    const prevXr = r.xr.enabled;
    r.xr.enabled = false;
    r.shadowMap.autoUpdate = false;
    m.visible = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, vc);
    this.lastCalls = r.info.render.calls;
    this.lastTris = r.info.render.triangles;
    r.setRenderTarget(prevTarget);
    m.visible = true;
    r.shadowMap.autoUpdate = prevShadow;
    r.xr.enabled = prevXr;
    u.uHas!.value = 1;
    this.renders++;
    if (t0) this.lastMs = performance.now() - t0;
  }

  /** Debug: a few RT pixels + camera info. */
  probe(): Record<string, unknown> {
    const r = this.renderer;
    const buf = new Uint8Array(4);
    const px: number[][] = [];
    for (const [fx, fy] of [
      [0.5, 0.5],
      [0.25, 0.3],
      [0.75, 0.7],
    ] as const) {
      r.readRenderTargetPixels(this.rt, Math.floor(this.rt.width * fx), Math.floor(this.rt.height * fy), 1, 1, buf);
      px.push(Array.from(buf));
    }
    const c = this.camera;
    return { px, tagged: this.tagged.length, pos: c.position.toArray().map((x) => +x.toFixed(2)), dir: c.getWorldDirection(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), renders: this.renders, has: this.material.uniforms.uHas!.value };
  }

  /** Debug: the reflection as a PNG data URL (dev only). */
  image(): string {
    const w = this.rt.width;
    const h = this.rt.height;
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.rt, 0, 0, w, h, buf);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c2 = cv.getContext('2d')!;
    const img = c2.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    c2.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const o of this.tagged) o.layers.disable(MIRROR_LAYER);
    this.tagged.length = 0;
    this.mirror.material = this.original;
    this.material.dispose();
    this.rt.dispose();
  }
}

/** How far in front of the glass the reflection starts (m). */
export const CLIP_OFFSET = 0.035;

const _n = new THREE.Vector3();
const _mp = new THREE.Vector3();
const _cp = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3();
const _view = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _crop = new THREE.Matrix4();
const _corner = new THREE.Vector3();

/**
 * Pure-ish reflection math (no rendering): set `vc` to `camera` mirrored across the plane of a mirror (local +Z
 * normal, world matrix `mirrorWorld`), with its projection cropped to the mirror's on-screen rectangle and an
 * oblique near plane on the mirror. Writes the local-position → RT-uv texture matrix. False = nothing to render.
 */
export function reflectCamera(
  camera: THREE.PerspectiveCamera,
  mirrorWorld: THREE.Matrix4,
  bbox: THREE.Box3,
  vc: THREE.PerspectiveCamera,
  texMat: THREE.Matrix4,
  clipOffset = CLIP_OFFSET,
): boolean {
  _mp.setFromMatrixPosition(mirrorWorld);
  _cp.setFromMatrixPosition(camera.matrixWorld);
  _rot.extractRotation(mirrorWorld);
  _n.set(0, 0, 1).applyMatrix4(_rot).normalize();
  _view.subVectors(_mp, _cp);
  if (_view.dot(_n) > 0) return false; // camera behind the mirror
  _view.reflect(_n).negate().add(_mp);
  _rot.extractRotation(camera.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
  _target.subVectors(_mp, _look).reflect(_n).negate().add(_mp);
  vc.position.copy(_view);
  vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
  vc.lookAt(_target);
  vc.near = camera.near;
  vc.far = camera.far;
  vc.updateMatrixWorld(true);
  vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
  vc.projectionMatrix.copy(camera.projectionMatrix);

  // Crop the projection to the mirror's on-screen rectangle (NDC bounds of its corners in the virtual view).
  let x0 = 1;
  let x1 = -1;
  let y0 = 1;
  let y1 = -1;
  for (let i = 0; i < 4; i++) {
    _corner.set(i & 1 ? bbox.max.x : bbox.min.x, i & 2 ? bbox.max.y : bbox.min.y, 0).applyMatrix4(mirrorWorld);
    _corner.applyMatrix4(vc.matrixWorldInverse);
    if (_corner.z > -vc.near) {
      x0 = y0 = -1;
      x1 = y1 = 1;
      break;
    }
    _corner.applyMatrix4(vc.projectionMatrix);
    x0 = Math.min(x0, _corner.x);
    x1 = Math.max(x1, _corner.x);
    y0 = Math.min(y0, _corner.y);
    y1 = Math.max(y1, _corner.y);
  }
  x0 = Math.max(-1, x0);
  y0 = Math.max(-1, y0);
  x1 = Math.min(1, x1);
  y1 = Math.min(1, y1);
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return false;
  _crop.set(2 / (x1 - x0), 0, 0, -(x1 + x0) / (x1 - x0), 0, 2 / (y1 - y0), 0, -(y1 + y0) / (y1 - y0), 0, 0, 1, 0, 0, 0, 0, 1);
  vc.projectionMatrix.premultiply(_crop);

  texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  texMat.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse).multiply(mirrorWorld);

  // Oblique near plane = the mirror plane, nudged a little into the room: the frame / backing board sits just
  // behind the glass and its ink hull pokes a few mm in front of it (it would cover the whole reflection).
  _look.copy(_mp).addScaledVector(_n, clipOffset);
  _plane.setFromNormalAndCoplanarPoint(_n, _look).applyMatrix4(vc.matrixWorldInverse);
  _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const pe = vc.projectionMatrix.elements;
  _q.set((Math.sign(_clip.x) + pe[8]!) / pe[0]!, (Math.sign(_clip.y) + pe[9]!) / pe[5]!, -1, (1 + pe[10]!) / pe[14]!);
  _clip.multiplyScalar(2 / _clip.dot(_q));
  pe[2] = _clip.x;
  pe[6] = _clip.y;
  pe[10] = _clip.z + 1 - 0.003;
  pe[14] = _clip.w;
  vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();
  return true;
}
