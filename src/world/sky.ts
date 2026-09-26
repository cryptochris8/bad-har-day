// ─────────────────────────────────────────────────────────────────────────────
// Sky: one gradient dome (sunrise glow around the sun's azimuth, soft sun disc
// and a cartoon moon with craters + halo, all in the shader), twinkling star
// points and a handful of puffy stylised clouds. Follows the camera.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hashInts } from '../core/rng';
import { PAL } from '../render/palette';
import type { LightingState } from './lighting';

const R = 420;

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DOME_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGlowCol;
uniform float uGlow;
uniform vec3 uSunDir;
uniform float uSunDisc;
uniform vec3 uSunCol;
uniform vec3 uMoonDir;
uniform float uMoon;
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uTop, t);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.78, clamp(-d.y * 5.0, 0.0, 1.0));
  vec3 fd = normalize(vec3(d.x, 0.0, d.z) + 1e-5);
  vec3 fs = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5);
  float az = max(dot(fd, fs), 0.0);
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uGlowCol * uGlow * (pow(az, 3.0) * pow(1.0 - t, 2.2) * 0.9 + pow(sd, 10.0) * 0.45);
  float disc = smoothstep(0.99915, 0.9995, sd);
  col = mix(col, uSunCol, disc * uSunDisc);
  col += uSunCol * pow(sd, 90.0) * uSunDisc * 0.5;
  // moon: pale disc with soft craters + halo
  float md = dot(d, normalize(uMoonDir));
  float mdisc = smoothstep(0.99862, 0.99895, md);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 mr = normalize(cross(up, uMoonDir));
  vec3 mu = normalize(cross(uMoonDir, mr));
  vec2 mp = vec2(dot(d, mr), dot(d, mu)) * 19.0;
  float crater = smoothstep(0.35, 0.2, length(mp - vec2(0.25, 0.3))) + smoothstep(0.22, 0.1, length(mp - vec2(-0.3, -0.15))) + smoothstep(0.18, 0.08, length(mp - vec2(0.1, -0.45)));
  vec3 moonCol = mix(vec3(0.96, 0.94, 1.0), vec3(0.8, 0.8, 0.88), clamp(crater, 0.0, 1.0));
  col = mix(col, moonCol, mdisc * uMoon);
  col += vec3(0.55, 0.62, 1.0) * pow(max(md, 0.0), 180.0) * uMoon * 0.35;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uAlpha;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = (0.55 + 0.45 * sin(uTime * (1.1 + aPhase) + aPhase * 17.0)) * uAlpha;
  gl_PointSize = aSize;
}`;
const STAR_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.08, 0.5, length(p))) * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}`;

const CLOUD_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
void main() { vUv = aUv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CLOUD_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uShade;
uniform float uAlpha;
varying vec2 vUv;
varying float vSeed;
float blob(vec2 p, vec2 c, float r) { return smoothstep(r, r - 0.04, length(p - c)); }
void main() {
  vec2 p = vUv;
  float s = vSeed;
  float a = 0.0;
  a = max(a, blob(p, vec2(0.3, 0.38), 0.2 + 0.03 * sin(s * 3.0)));
  a = max(a, blob(p, vec2(0.5, 0.52), 0.27));
  a = max(a, blob(p, vec2(0.7, 0.4), 0.2 + 0.03 * cos(s * 5.0)));
  a = max(a, blob(p, vec2(0.16, 0.3), 0.13));
  a = max(a, blob(p, vec2(0.85, 0.3), 0.12));
  a *= smoothstep(0.18, 0.24, p.y);
  if (a < 0.01) discard;
  vec3 col = mix(uShade, uColor, smoothstep(0.2, 0.6, p.y));
  gl_FragColor = vec4(col, a * uAlpha);
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly group = new THREE.Group();
  private readonly domeU: Record<string, THREE.IUniform>;
  private readonly starU: Record<string, THREE.IUniform>;
  private readonly cloudU: Record<string, THREE.IUniform>;
  private readonly disposables: { dispose(): void }[] = [];
  private time = 0;

  constructor(quality: 'high' | 'low') {
    this.group.name = 'sky';
    const domeGeo = new THREE.SphereGeometry(R, 32, 16);
    this.domeU = {
      uTop: { value: new THREE.Color(PAL.skyNightTop) },
      uHorizon: { value: new THREE.Color(PAL.skyNightHorizon) },
      uGlowCol: { value: new THREE.Color(PAL.skySunriseGlow) },
      uGlow: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.8, -0.1, -0.5) },
      uSunDisc: { value: 0 },
      uSunCol: { value: new THREE.Color(PAL.sunDisc) },
      uMoonDir: { value: new THREE.Vector3(-0.72, 0.55, -0.42).normalize() },
      uMoon: { value: 1 },
    };
    const domeMat = new THREE.ShaderMaterial({ name: 'bhd-sky', vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: this.domeU, side: THREE.BackSide, depthWrite: false, fog: false });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;

    const N = quality === 'high' ? 460 : 240;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const phase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const h1 = hashInts(i, 11) / 4294967296;
      const h2 = hashInts(i, 23) / 4294967296;
      const h3 = hashInts(i, 37) / 4294967296;
      const az = h1 * Math.PI * 2;
      const el = 0.1 + Math.pow(h2, 0.75) * 1.35;
      const r = R * 0.9;
      pos[i * 3] = Math.cos(az) * Math.cos(el) * r;
      pos[i * 3 + 1] = Math.sin(el) * r;
      pos[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
      size[i] = 1.4 + h3 * h3 * 3.4;
      phase[i] = h3 * 3;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    this.starU = { uTime: { value: 0 }, uAlpha: { value: 1 }, uColor: { value: new THREE.Color(PAL.star) } };
    const starMat = new THREE.ShaderMaterial({
      name: 'bhd-stars',
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      uniforms: this.starU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    stars.renderOrder = -9;

    // clouds: camera-centred billboards arranged around the horizon (more to the north/east)
    const cpos: number[] = [];
    const cuv: number[] = [];
    const cseed: number[] = [];
    const nC = quality === 'high' ? 14 : 8;
    for (let i = 0; i < nC; i++) {
      const az = -1.7 + (i / nC) * 4.4 + (hashInts(i, 5) / 4294967296) * 0.25; // from west-north-west round to south-east
      const el = 0.1 + (hashInts(i, 7) / 4294967296) * 0.22;
      const rr = R * 0.8;
      const cxv = Math.sin(az) * Math.cos(el) * rr;
      const cyv = Math.sin(el) * rr;
      const czv = -Math.cos(az) * Math.cos(el) * rr;
      const w = 55 + (hashInts(i, 9) / 4294967296) * 45;
      const h = w * 0.45;
      const rx = Math.cos(az);
      const rz = Math.sin(az);
      const corners = [
        [-1, 0],
        [1, 0],
        [1, 1],
        [-1, 1],
      ];
      const pts = corners.map(([u, v]) => [cxv + rx * u! * w * 0.5, cyv + (v! - 0.3) * h, czv + rz * u! * w * 0.5]);
      for (const k of [0, 2, 1, 0, 3, 2]) {
        cpos.push(...pts[k]!);
        cuv.push((corners[k]![0]! + 1) / 2, corners[k]![1]!);
        cseed.push(i * 1.7);
      }
    }
    const cloudGeo = new THREE.BufferGeometry();
    cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
    cloudGeo.setAttribute('aUv', new THREE.Float32BufferAttribute(cuv, 2));
    cloudGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(cseed, 1));
    this.cloudU = { uColor: { value: new THREE.Color(PAL.cloudDay) }, uShade: { value: new THREE.Color(0xc9d3e6) }, uAlpha: { value: 0.6 } };
    const cloudMat = new THREE.ShaderMaterial({
      name: 'bhd-clouds',
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      uniforms: this.cloudU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const clouds = new THREE.Mesh(cloudGeo, cloudMat);
    clouds.frustumCulled = false;
    clouds.renderOrder = -8;

    this.disposables.push(domeGeo, domeMat, starGeo, starMat, cloudGeo, cloudMat);
    this.group.add(dome, stars, clouds);
  }

  apply(s: LightingState): void {
    const u = this.domeU;
    (u.uTop!.value as THREE.Color).setHex(s.skyTop);
    (u.uHorizon!.value as THREE.Color).setHex(s.skyHorizon);
    (u.uGlowCol!.value as THREE.Color).setHex(s.glowColor);
    u.uGlow!.value = s.glow;
    (u.uSunDir!.value as THREE.Vector3).set(s.sunX, s.sunY, s.sunZ);
    u.uSunDisc!.value = s.sunDisc;
    u.uMoon!.value = s.moon;
    this.starU.uAlpha!.value = s.stars;
    (this.cloudU.uColor!.value as THREE.Color).setHex(s.cloudColor);
    const shade = this.cloudU.uShade!.value as THREE.Color;
    shade.setHex(s.cloudColor).lerp((u.uTop!.value as THREE.Color), 0.35);
    this.cloudU.uAlpha!.value = s.cloudAlpha;
  }

  update(camera: THREE.Camera, dt: number): void {
    this.time += dt;
    this.starU.uTime!.value = this.time;
    this.group.position.copy(camera.position);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
