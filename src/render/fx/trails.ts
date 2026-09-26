// Ribbon trails following objects (balls in flight): a fixed pool of camera-facing ribbons in
// ONE mesh. Each trail samples its target's world position every frame into a ring buffer;
// points age out; the ribbon tapers + fades toward the tail and has a hot core. After stop()
// the trail fades and frees its slot. Allocation-free after construction. Blending is ~45 %
// additive so ribbons glow at night but keep their colour against bright interiors.
import * as THREE from 'three';
import type { TrailHandle } from '../types';

export const MAX_TRAILS = 16;
export const TRAIL_POINTS = 28;
const POINT_LIFE = 0.42;

const vert = /* glsl */ `
attribute vec4 aCol;
attribute float aSide;
varying vec4 vCol;
varying float vSide;
void main() {
  vCol = aCol;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const frag = /* glsl */ `
varying vec4 vCol;
varying float vSide;
void main() {
  float core = 1.0 - abs(vSide);
  float a = vCol.a * (0.35 + 0.65 * core);
  vec3 col = mix(vCol.rgb, vec3(1.0), core * core * 0.6);
  a = min(a, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * 0.55);
}`;

interface Slot {
  used: boolean;
  emitting: boolean;
  gen: number;
  target: THREE.Object3D | null;
  r: number;
  g: number;
  b: number;
  width: number;
  /** Ring buffer of points (xyz) and their ages. */
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  age: Float32Array;
  head: number;
  count: number;
  orphanT: number;
}

export class Trails {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly slots: Slot[] = [];
  private readonly pos: THREE.BufferAttribute;
  private readonly col: THREE.BufferAttribute;
  private readonly tmp = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor() {
    const nv = MAX_TRAILS * TRAIL_POINTS * 2;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(nv * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(nv);
    for (let i = 0; i < nv; i++) side[i] = i % 2 === 0 ? -1 : 1;
    g.setAttribute('position', this.pos);
    g.setAttribute('aCol', this.col);
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    const idx: number[] = [];
    for (let t = 0; t < MAX_TRAILS; t++)
      for (let i = 0; i < TRAIL_POINTS - 1; i++) {
        const a = (t * TRAIL_POINTS + i) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-fx-trails',
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'fxTrails';
    for (let i = 0; i < MAX_TRAILS; i++) {
      const s: Slot = {
        used: false,
        emitting: false,
        gen: 0,
        target: null,
        r: 1,
        g: 1,
        b: 1,
        width: 0.2,
        px: new Float32Array(TRAIL_POINTS),
        py: new Float32Array(TRAIL_POINTS),
        pz: new Float32Array(TRAIL_POINTS),
        age: new Float32Array(TRAIL_POINTS),
        head: 0,
        count: 0,
        orphanT: 0,
      };
      this.slots.push(s);
    }
  }

  /** Trails currently drawing (tests). */
  get active(): number {
    let n = 0;
    for (const s of this.slots) if (s.used) n++;
    return n;
  }

  start(target: THREE.Object3D, hex: number, width: number): TrailHandle {
    let i = this.slots.findIndex((s) => !s.used);
    if (i < 0) {
      // Recycle the oldest non-emitting trail, else slot 0.
      i = this.slots.findIndex((s) => !s.emitting);
      if (i < 0) i = 0;
    }
    const s = this.slots[i]!;
    s.used = true;
    s.emitting = true;
    s.gen++;
    s.target = target;
    s.width = Math.max(0.02, width);
    s.head = 0;
    s.count = 0;
    s.orphanT = 0;
    this.c.setHex(hex);
    s.r = this.c.r;
    s.g = this.c.g;
    s.b = this.c.b;
    // A small handle per trail (not per frame); it only controls the generation it was made for.
    const gen = s.gen;
    return {
      stop: () => {
        if (s.gen === gen) s.emitting = false;
      },
      setColor: (hex: number) => {
        if (s.gen !== gen) return;
        this.c.setHex(hex);
        s.r = this.c.r;
        s.g = this.c.g;
        s.b = this.c.b;
      },
    };
  }

  clear(): void {
    for (const s of this.slots) {
      s.used = false;
      s.emitting = false;
      s.count = 0;
      s.target = null;
      s.gen++;
    }
    (this.col.array as Float32Array).fill(0);
    this.col.needsUpdate = true;
  }

  update(dt: number, camera: THREE.Camera): void {
    const P = this.pos.array as Float32Array;
    const C = this.col.array as Float32Array;
    const cam = camera.position;
    for (let t = 0; t < MAX_TRAILS; t++) {
      const s = this.slots[t]!;
      const vbase = t * TRAIL_POINTS * 2;
      if (!s.used) {
        for (let v = 0; v < TRAIL_POINTS * 2; v++) C[(vbase + v) * 4 + 3] = 0;
        continue;
      }
      // Age points; drop expired ones from the tail.
      for (let k = 0; k < s.count; k++) {
        const j = (s.head - k + TRAIL_POINTS) % TRAIL_POINTS;
        s.age[j] = s.age[j]! + dt;
      }
      while (s.count > 0 && s.age[(s.head - s.count + 1 + TRAIL_POINTS) % TRAIL_POINTS]! > POINT_LIFE) s.count--;
      if (s.emitting && s.target) {
        if (!s.target.parent) {
          s.orphanT += dt;
          if (s.orphanT > 1) s.emitting = false;
        } else s.orphanT = 0;
        s.target.getWorldPosition(this.tmp);
        const hx = s.px[s.head]!;
        const hy = s.py[s.head]!;
        const hz = s.pz[s.head]!;
        const moved = s.count === 0 || Math.hypot(this.tmp.x - hx, this.tmp.y - hy, this.tmp.z - hz) > 0.12 || s.age[s.head]! > 0.03;
        if (moved) {
          s.head = (s.head + 1) % TRAIL_POINTS;
          s.count = Math.min(TRAIL_POINTS, s.count + 1);
        }
        s.px[s.head] = this.tmp.x;
        s.py[s.head] = this.tmp.y;
        s.pz[s.head] = this.tmp.z;
        if (moved) s.age[s.head] = 0;
      }
      if (!s.emitting && s.count === 0) {
        s.used = false;
        s.target = null;
        continue;
      }
      // Build the ribbon newest → oldest.
      for (let k = 0; k < TRAIL_POINTS; k++) {
        const v0 = (vbase + k * 2) * 3;
        const c0 = (vbase + k * 2) * 4;
        if (k >= s.count) {
          // Collapse unused vertices onto the last point, invisible.
          const last = k > 0 ? v0 - 6 : v0;
          P[v0] = P[v0 + 3] = P[last]!;
          P[v0 + 1] = P[v0 + 4] = P[last + 1]!;
          P[v0 + 2] = P[v0 + 5] = P[last + 2]!;
          C[c0 + 3] = C[c0 + 7] = 0;
          continue;
        }
        const j = (s.head - k + TRAIL_POINTS) % TRAIL_POINTS;
        const jn = (s.head - Math.max(0, k - 1) + TRAIL_POINTS) % TRAIL_POINTS;
        const jp = (s.head - Math.min(s.count - 1, k + 1) + TRAIL_POINTS) % TRAIL_POINTS;
        const x = s.px[j]!;
        const y = s.py[j]!;
        const z = s.pz[j]!;
        let tx = s.px[jn]! - s.px[jp]!;
        let ty = s.py[jn]! - s.py[jp]!;
        let tz = s.pz[jn]! - s.pz[jp]!;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        const vx = cam.x - x;
        const vy = cam.y - y;
        const vz = cam.z - z;
        let sx = ty * vz - tz * vy;
        let sy = tz * vx - tx * vz;
        let sz = tx * vy - ty * vx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const fade = 1 - Math.min(1, s.age[j]! / POINT_LIFE);
        const w = s.width * (0.25 + 0.75 * fade) * 0.5;
        sx = (sx / sl) * w;
        sy = (sy / sl) * w;
        sz = (sz / sl) * w;
        P[v0] = x - sx;
        P[v0 + 1] = y - sy;
        P[v0 + 2] = z - sz;
        P[v0 + 3] = x + sx;
        P[v0 + 4] = y + sy;
        P[v0 + 5] = z + sz;
        const a = Math.pow(fade, 1.4) * (k === 0 ? 0.9 : 1);
        C[c0] = C[c0 + 4] = s.r;
        C[c0 + 1] = C[c0 + 5] = s.g;
        C[c0 + 2] = C[c0 + 6] = s.b;
        C[c0 + 3] = C[c0 + 7] = a;
      }
    }
    this.pos.needsUpdate = true;
    this.col.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
