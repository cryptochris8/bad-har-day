// Light drizzle streaks around the camera focus — outdoors only (streaks over the house footprint are
// discarded in the shader, the dollhouse has no roof). Animation runs in the shader.
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { HOUSE } from './layout';

const VERT = /* glsl */ `
attribute float aPhase;
attribute float aEnd;
uniform float uTime;
uniform vec3 uCenter;
uniform vec4 uHouse;
varying float vA;
void main() {
  vec3 p = position;
  float t = fract(uTime * (0.9 + aPhase * 0.3) + aPhase);
  float y = mix(6.0, -0.2, t);
  p.y = y + aEnd * 0.34;
  p.x += aEnd * 0.05;
  vec3 w = p + uCenter;
  bool inside = w.x > uHouse.x && w.x < uHouse.z && w.z > uHouse.y && w.z < uHouse.w;
  vA = inside || y < 0.0 ? 0.0 : 0.5 * (1.0 - aEnd * 0.8);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uAmount;
varying float vA;
void main() {
  float a = vA * uAmount;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

export class Rain {
  readonly lines: THREE.LineSegments;
  private readonly u: { uTime: { value: number }; uCenter: { value: THREE.Vector3 }; uAmount: { value: number } };

  constructor(quality: 'high' | 'low') {
    const n = quality === 'high' ? 700 : 280;
    const pos = new Float32Array(n * 6);
    const ph = new Float32Array(n * 2);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const h1 = ((i * 2654435761) >>> 0) / 4294967296;
      const h2 = ((i * 2246822519 + 7) >>> 0) / 4294967296;
      const h3 = ((i * 3266489917 + 13) >>> 0) / 4294967296;
      const x = (h1 - 0.5) * 30;
      const z = (h2 - 0.5) * 24 - 2;
      pos.set([x, 0, z, x, 0, z], i * 6);
      ph[i * 2] = ph[i * 2 + 1] = h3;
      end[i * 2] = 0;
      end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.u = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-rain',
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.u,
        uColor: { value: new THREE.Color(PAL.rain) },
        uHouse: { value: new THREE.Vector4(HOUSE.x0 - 0.1, HOUSE.z0 - 0.1, HOUSE.x1 + 0.1, HOUSE.z1 + 0.1) },
      },
      transparent: true,
      depthWrite: false,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 10;
    this.lines.name = 'rain';
  }

  setAmount(a: number): void {
    this.u.uAmount.value = a;
    this.lines.visible = a > 0.01;
  }

  update(dt: number, fx: number, fz: number): void {
    if (!this.lines.visible) return;
    this.u.uTime.value += dt;
    // snap the emitter to a coarse grid so the streaks don't swim with the camera
    const sx = Math.round(fx / 6) * 6;
    const sz = Math.round(fz / 6) * 6;
    this.lines.position.set(sx, 0, sz);
    this.u.uCenter.value.set(sx, 0, sz);
  }

  dispose(): void {
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
    this.lines.removeFromParent();
  }
}
