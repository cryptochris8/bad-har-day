// Interaction markers: a pulsing warm-gold ground ring + a soft sparkle column with rising twinkles.
// Shared geometry; one material set per colour; all animation runs in the shaders (uTime).
import * as THREE from 'three';
import { PAL } from '../render/palette';
import type { Vec3Like } from '../render/types';

const RING_VERT = /* glsl */ `
uniform float uTime;
varying vec2 vP;
void main() {
  float s = 1.0 + 0.1 * sin(uTime * 4.0);
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x * s, position.y, position.z * s, 1.0);
}`;
const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vP;
void main() {
  float r = length(vP);
  float ring = smoothstep(0.08, 0.0, abs(r - 0.46)) ;
  float inner = smoothstep(0.46, 0.0, r) * 0.28;
  float wave = smoothstep(0.06, 0.0, abs(r - fract(uTime * 0.7) * 0.5)) * 0.5 * (1.0 - fract(uTime * 0.7));
  float a = (ring + inner + wave) * (0.8 + 0.2 * sin(uTime * 4.0));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;
const COL_VERT = /* glsl */ `
varying float vY;
varying float vA;
void main() {
  vY = position.y / 1.6;
  vA = atan(position.x, position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const COL_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying float vY;
varying float vA;
void main() {
  float a = pow(1.0 - vY, 2.2) * 0.32;
  a *= 0.75 + 0.25 * sin(vA * 5.0 + uTime * 2.0 + vY * 6.0);
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;
const SPARK_VERT = /* glsl */ `
attribute float aPhase;
uniform float uTime;
varying float vA;
void main() {
  float t = fract(uTime * 0.45 + aPhase);
  vec3 p = position;
  p.y = t * 1.7;
  p.x += sin(uTime * 2.0 + aPhase * 30.0) * 0.05;
  vA = sin(t * 3.14159) * (0.6 + 0.4 * sin(uTime * 9.0 + aPhase * 50.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(90.0 / -mv.z, 2.0, 9.0);
}`;
const SPARK_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.05, 0.5, length(q))) * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * a, 1.0);
  #include <colorspace_fragment>
}`;

interface MatSet {
  ring: THREE.ShaderMaterial;
  col: THREE.ShaderMaterial;
  spark: THREE.ShaderMaterial;
}

export class MarkerSystem {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  private readonly mats = new Map<number, MatSet>();
  private readonly ringGeo: THREE.BufferGeometry;
  private readonly colGeo: THREE.BufferGeometry;
  private readonly sparkGeo: THREE.BufferGeometry;

  constructor() {
    this.group.name = 'markers';
    this.ringGeo = new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2);
    this.colGeo = new THREE.CylinderGeometry(0.34, 0.42, 1.6, 20, 1, true).translate(0, 0.8, 0);
    const n = 10;
    const pos = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * 0.3;
      pos[i * 3 + 2] = Math.sin(a) * 0.3;
      ph[i] = (i * 0.618) % 1;
    }
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparkGeo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  }

  private matsFor(color: number): MatSet {
    let m = this.mats.get(color);
    if (!m) {
      const c = { value: new THREE.Color(color) };
      const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
      m = {
        ring: new THREE.ShaderMaterial({ name: 'bhd-marker-ring', vertexShader: RING_VERT, fragmentShader: RING_FRAG, uniforms: { uColor: c, uTime: this.time }, ...common, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
        col: new THREE.ShaderMaterial({ name: 'bhd-marker-col', vertexShader: COL_VERT, fragmentShader: COL_FRAG, uniforms: { uColor: c, uTime: this.time }, ...common, side: THREE.DoubleSide }),
        spark: new THREE.ShaderMaterial({ name: 'bhd-marker-spark', vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, uniforms: { uColor: c, uTime: this.time }, ...common }),
      };
      this.mats.set(color, m);
    }
    return m;
  }

  add(at: Vec3Like, color: number = PAL.interact): { move(at: Vec3Like): void; remove(): void } {
    const m = this.matsFor(color);
    const g = new THREE.Group();
    g.name = 'marker';
    const ring = new THREE.Mesh(this.ringGeo, m.ring);
    ring.position.y = 0.025;
    ring.renderOrder = 7;
    const col = new THREE.Mesh(this.colGeo, m.col);
    col.renderOrder = 7;
    const spark = new THREE.Points(this.sparkGeo, m.spark);
    spark.renderOrder = 8;
    spark.frustumCulled = false;
    g.add(ring, col, spark);
    g.position.set(at.x, at.y, at.z);
    this.group.add(g);
    let removed = false;
    return {
      move(p: Vec3Like) {
        g.position.set(p.x, p.y, p.z);
      },
      remove() {
        if (removed) return;
        removed = true;
        g.removeFromParent();
      },
    };
  }

  update(dt: number): void {
    this.time.value += dt;
  }

  dispose(): void {
    this.ringGeo.dispose();
    this.colGeo.dispose();
    this.sparkGeo.dispose();
    for (const m of this.mats.values()) {
      m.ring.dispose();
      m.col.dispose();
      m.spark.dispose();
    }
    this.group.removeFromParent();
  }
}
