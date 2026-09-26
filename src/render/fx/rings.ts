// Expanding ground rings (landing markers, score pulses): a fixed pool of flat instanced quads,
// ring shape drawn in the fragment shader. One draw call, allocation-free. Premultiplied blending
// that is ~40 % additive: rings glow on a dark night floor yet stay coloured on cream interiors.
import * as THREE from 'three';

const vert = /* glsl */ `
attribute vec4 iRing;  // x, y, z, radius
attribute vec4 iCol;   // rgb, alpha
attribute float iWidth;
varying vec2 vP;
varying vec4 vCol;
varying float vW;
void main() {
  vec3 p = iRing.xyz + vec3(position.x * iRing.w, 0.0, position.y * iRing.w);
  vP = position.xy;
  vCol = iCol;
  vW = iWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const frag = /* glsl */ `
varying vec2 vP;
varying vec4 vCol;
varying float vW;
void main() {
  float r = length(vP);
  float aa = fwidth(r) * 1.5;
  float a = smoothstep(1.0 - vW - aa, 1.0 - vW, r) * (1.0 - smoothstep(1.0 - aa, 1.0, r));
  a += (1.0 - smoothstep(0.0, 1.0 - vW, r)) * 0.12;
  a = min(a * vCol.a, 1.0);
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * 0.6);
}`;

export class Rings {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly max: number;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aRing: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aW: THREE.InstancedBufferAttribute;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly r: Float32Array;
  private readonly t: Float32Array;
  private readonly dur: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly alive: Uint8Array;
  private next = 0;
  private live = 0;
  private readonly c = new THREE.Color();

  constructor(max = 24) {
    this.max = max;
    const f = () => new Float32Array(max);
    this.x = f();
    this.y = f();
    this.z = f();
    this.r = f();
    this.t = f();
    this.dur = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.alive = new Uint8Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    // Quad in XZ facing up: (x, y) → world (x, z); winding counter-clockwise from above.
    g.setIndex([0, 2, 1, 0, 3, 2]);
    this.aRing = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aW = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iRing', this.aRing);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iWidth', this.aW);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-fx-rings',
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'fxRings';
  }

  get count(): number {
    return this.live;
  }

  spawn(x: number, y: number, z: number, hex: number, radius: number, seconds: number): void {
    let i = -1;
    for (let k = 0; k < this.max; k++) {
      const j = (this.next + k) % this.max;
      if (!this.alive[j]) {
        i = j;
        break;
      }
    }
    if (i < 0) i = this.next; // recycle
    this.next = (i + 1) % this.max;
    this.x[i] = x;
    this.y[i] = y + 0.04;
    this.z[i] = z;
    this.r[i] = Math.max(0.1, radius);
    this.t[i] = 0;
    this.dur[i] = Math.max(0.1, seconds);
    this.c.setHex(hex);
    this.cr[i] = this.c.r;
    this.cg[i] = this.c.g;
    this.cb[i] = this.c.b;
    this.alive[i] = 1;
  }

  clear(): void {
    this.alive.fill(0);
    this.live = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number): void {
    const R = this.aRing.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const W = this.aW.array as Float32Array;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      const t = (this.t[i] = this.t[i]! + dt);
      const k = t / this.dur[i]!;
      if (k >= 1) {
        this.alive[i] = 0;
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3);
      R[n * 4] = this.x[i]!;
      R[n * 4 + 1] = this.y[i]!;
      R[n * 4 + 2] = this.z[i]!;
      R[n * 4 + 3] = this.r[i]! * (0.15 + 0.85 * e);
      C[n * 4] = this.cr[i]!;
      C[n * 4 + 1] = this.cg[i]!;
      C[n * 4 + 2] = this.cb[i]!;
      C[n * 4 + 3] = (1 - k) * (1 - k) * 1.4;
      W[n] = 0.18 - 0.1 * k;
      n++;
    }
    this.live = n;
    this.geo.instanceCount = n;
    for (const a of [this.aRing, this.aCol, this.aW]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, Math.max(1, n) * a.itemSize);
      a.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
