// ─────────────────────────────────────────────────────────────────────────────
// Pooled particle system: ONE instanced draw call for every camera-facing
// particle (puffs, confetti chips, stars, sparkles, glows, rings, velocity-
// stretched streaks, flames, hearts, soap bubbles, autumn leaves, water drops,
// crumbs, cereal O's, steam squiggles). Premultiplied-alpha blending lets
// additive and normal particles share the draw (additive ones output alpha = 0;
// `additive` may also be fractional for half-glowing twinkles). The particle's
// life fraction reaches the fragment shader (packed with the shape id), so
// bubbles can pop and steam can wiggle without extra attributes.
// CPU side is struct-of-arrays; emit() copies a reusable spec, update() writes
// straight into the instance buffers — zero allocations after construction.
// The live cap is adjustable (quality); when full, the oldest slot is recycled.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const SHAPE = {
  PUFF: 0,
  CHIP: 1,
  STAR: 2,
  SPARKLE: 3,
  GLOW: 4,
  RING: 5,
  STREAK: 6,
  FLAME: 7,
  HEART: 8,
  BUBBLE: 9,
  LEAF: 10,
  DROP: 11,
  CRUMB: 12,
  CEREAL: 13,
  WISP: 14,
} as const;
export type Shape = (typeof SHAPE)[keyof typeof SHAPE];

/** Mutable emission spec — fill it and call emit(); reuse it for the next particle. */
export class ParticleSpec {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  life = 1;
  size0 = 0.3;
  size1 = 0.3;
  /** Linear-space colour. */
  r = 1;
  g = 1;
  b = 1;
  alpha = 1;
  shape: Shape = SHAPE.PUFF;
  /** Additive amount: true/1 = pure glow, false/0 = normal alpha, fractions blend both. */
  additive: boolean | number = false;
  gravity = 0;
  drag = 0;
  rot = 0;
  rotV = 0;
  /** Confetti tumble (rad/s): squashes the quad horizontally with cos(flip). */
  flipV = 0;
  /** Fraction of life spent fading in. */
  fadeIn = 0;
  /** Twinkle frequency (Hz); 0 = steady. */
  blink = 0;
  /** World y below which the particle bounces (NaN = no floor). */
  floor = Number.NaN;
  /** Horizontal flutter amplitude (m/s) and frequency (rad/s) — falling paper. */
  sway = 0;
  swayF = 0;
  /** Stretch along velocity (s of motion shown as length, SHAPE.STREAK / DROP). */
  stretch = 0;
  /** Life fraction at which the fade-out starts (default 0.7). */
  fadeOut = 0.7;
  /** Life fraction spent popping in (size eases out-back from 0); 0 = no pop. */
  popIn = 0;

  reset(): this {
    this.vx = this.vy = this.vz = 0;
    this.life = 1;
    this.size0 = this.size1 = 0.3;
    this.r = this.g = this.b = 1;
    this.alpha = 1;
    this.shape = SHAPE.PUFF;
    this.additive = false;
    this.gravity = this.drag = this.rot = this.rotV = this.flipV = this.fadeIn = this.blink = 0;
    this.floor = Number.NaN;
    this.sway = this.swayF = this.stretch = 0;
    this.fadeOut = 0.7;
    this.popIn = 0;
    return this;
  }

  /** Set colour from an sRGB hex (converted to linear). */
  color(hex: number, mul = 1): this {
    tmpColor.setHex(hex);
    this.r = tmpColor.r * mul;
    this.g = tmpColor.g * mul;
    this.b = tmpColor.b * mul;
    return this;
  }
}
const tmpColor = new THREE.Color();

const vert = /* glsl */ `
attribute vec4 iPos;   // xyz, size
attribute vec4 iCol;   // rgb, alpha
attribute vec4 iMisc;  // rotation, shape + life fraction (fract), additive, flip squash
attribute vec4 iVel;   // velocity xyz, stretch (s)
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
varying float vT;
varying float vAdd;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  vec2 c = position.xy;
  float size = iPos.w;
  if (iVel.w > 0.0) {
    // Velocity-aligned streak: long axis along the projected view-space velocity.
    vec3 v = mat3(modelViewMatrix) * iVel.xyz;
    vec2 d = v.xy;
    float len = length(d);
    vec2 ax = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 ay = vec2(-ax.y, ax.x);
    float L = max(size, len * iVel.w);
    mv.xy += ax * c.x * L + ay * c.y * size;
  } else {
    c.x *= iMisc.w;
    float cr = cos(iMisc.x);
    float sr = sin(iMisc.x);
    mv.xy += vec2(cr * c.x - sr * c.y, sr * c.x + cr * c.y) * size;
  }
  gl_Position = projectionMatrix * mv;
  vUv = position.xy + 0.5;
  vCol = iCol;
  vShape = floor(iMisc.y);
  vT = iMisc.y - vShape;
  vAdd = iMisc.z;
}
`;

const frag = /* glsl */ `
varying vec2 vUv;
varying vec4 vCol;
varying float vShape;
varying float vT;
varying float vAdd;
// Plum ink (PAL.outline) in linear space.
const vec3 INK = vec3(0.042, 0.017, 0.029);
float dot2(vec2 v) { return dot(v, v); }
// 5-point star SDF (after Inigo Quilez): outer radius r, inner ratio rf, first point up.
float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// Heart SDF (after Inigo Quilez): point at (0,0), lobes up to y = 1.1.
float sdHeart(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float a = 1.0;
  vec3 col = vCol.rgb;
  int shape = int(vShape + 0.5);
  if (shape == 0) {
    // Soft puff (dust, smoke): round, lit from the top-left.
    a = 1.0 - smoothstep(0.34, 0.5, r);
    col *= 0.84 + 0.34 * clamp(0.5 + p.y * 1.4 - p.x * 0.4, 0.0, 1.0);
  } else if (shape == 1) {
    // Paper chip (confetti).
    vec2 q = abs(p);
    a = 1.0 - smoothstep(0.44, 0.5, max(q.x, q.y));
    col *= 0.9 + 0.2 * (p.y + 0.5);
  } else if (shape == 2) {
    // Toon star: chunky rounded 5-point star, plum outline, glint.
    float d = sdStar5(p - vec2(0.0, -0.02), 0.4, 0.52) - 0.05;
    a = 1.0 - smoothstep(-0.012, 0.008, d);
    col *= 0.92 + 0.3 * clamp(0.6 - r * 1.6, 0.0, 1.0);
    col = mix(col, INK, smoothstep(-0.07, -0.042, d) * 0.85);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.025, 0.05, length((p - vec2(-0.09, 0.08)) * vec2(1.0, 1.3)))) * 0.85);
  } else if (shape == 3) {
    // Twinkle: thin 4-point cross + hot core.
    float d = min(abs(p.x), abs(p.y));
    a = (1.0 - smoothstep(0.0, 0.05, d)) * (1.0 - smoothstep(0.04, 0.5, r)) + (1.0 - smoothstep(0.0, 0.2, r)) * 0.85;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.12, r)) * 0.8);
  } else if (shape == 4) {
    float g = clamp(1.0 - r * 2.0, 0.0, 1.0);
    a = g * g;
  } else if (shape == 5) {
    a = smoothstep(0.32, 0.4, r) * (1.0 - smoothstep(0.44, 0.5, r));
  } else if (shape == 6) {
    float gx = clamp(1.0 - abs(p.x) * 2.0, 0.0, 1.0);
    float gy = clamp(1.0 - abs(p.y) * 2.0, 0.0, 1.0);
    a = gx * gy * gy;
    col = mix(col, vec3(1.0), gy * gy * gx * 0.5);
  } else if (shape == 7) {
    // Flame: teardrop (point up), hot core.
    vec2 q = vec2(p.x * (1.4 + p.y * 1.6), p.y + 0.12);
    float d = length(q);
    a = 1.0 - smoothstep(0.26, 0.38, d);
    col = mix(col, vec3(1.0, 0.95, 0.7), (1.0 - smoothstep(0.0, 0.2, d)) * 0.8);
  } else if (shape == 8) {
    // Heart: plump, plum outline, white glint.
    float s = 1.27;
    float d = sdHeart(vec2(p.x * s, p.y * s + 0.55)) / s;
    a = 1.0 - smoothstep(-0.012, 0.008, d);
    col *= 0.92 + 0.22 * clamp(0.5 + p.y - p.x * 0.5, 0.0, 1.0);
    col = mix(col, INK, smoothstep(-0.075, -0.048, d) * 0.8);
    float gl = 1.0 - smoothstep(0.035, 0.065, length((p - vec2(-0.17, 0.13)) * vec2(1.0, 1.4)));
    col = mix(col, vec3(1.0), gl * 0.9);
  } else if (shape == 9) {
    // Soap bubble: faint tinted body, bright iridescent rim, glints; pops at the end of life.
    float ang = atan(p.y, p.x);
    if (vT < 0.88) {
      float rr = r / 0.46;
      float body = 1.0 - smoothstep(0.95, 1.0, rr);
      float rim = smoothstep(0.66, 0.96, rr) * body;
      vec3 iri = 0.55 + 0.45 * cos(6.2831853 * (vec3(0.0, 0.33, 0.67) + ang * 0.16 + vT * 0.8));
      col = mix(col, iri, 0.45);
      col = mix(col, vec3(1.0), rim * 0.35);
      // A thin cool edge line keeps suds readable on cream counters too.
      float edge = smoothstep(0.86, 0.95, rr) * body;
      col = mix(col, vec3(0.38, 0.55, 0.85), edge * 0.55);
      a = body * (0.14 + rim * 0.8);
      float g1 = 1.0 - smoothstep(0.05, 0.085, length((p - vec2(-0.16, 0.16)) * vec2(1.0, 1.3)));
      float g2 = 1.0 - smoothstep(0.02, 0.04, length(p - vec2(0.15, -0.14)));
      float g = max(g1, g2 * 0.8);
      col = mix(col, vec3(1.0), g);
      a = max(a, g * 0.95);
    } else {
      float k = (vT - 0.88) / 0.12;
      float rr = r / (0.46 * (1.0 + 0.25 * k));
      float ring = smoothstep(0.8, 0.92, rr) * (1.0 - smoothstep(0.96, 1.04, rr));
      float dash = step(0.42, fract(ang * 1.2732 + 0.1));
      a = ring * dash * (1.0 - k) * 1.3;
      col = mix(col, vec3(1.0), 0.6);
    }
  } else if (shape == 10) {
    // Autumn leaf: pointed oval with a serrated edge, midrib + stem, darker rim.
    float y = p.y + 0.03;
    float t = clamp((y + 0.4) / 0.82, 0.0, 1.0);
    float halfW = 0.3 * pow(sin(t * 3.14159), 0.8) * (1.0 + 0.12 * sin(y * 30.0));
    float d = abs(p.x) - halfW;
    float inside = step(-0.4, y) * step(y, 0.42);
    a = (1.0 - smoothstep(-0.012, 0.012, d)) * inside;
    col *= 0.86 + 0.26 * clamp(0.5 + p.x * 1.5, 0.0, 1.0);
    col = mix(col, col * 0.55, smoothstep(-0.06, -0.025, d));
    col = mix(col, col * 0.62, (1.0 - smoothstep(0.008, 0.02, abs(p.x))) * step(-0.38, y));
    float stem = (1.0 - smoothstep(0.012, 0.024, abs(p.x))) * step(-0.5, y) * step(y, -0.36);
    a = max(a, stem);
    col = mix(col, vCol.rgb * 0.45, stem);
  } else if (shape == 11) {
    // Water drop (velocity-aligned): round head leading, tapering tail, glint.
    vec2 c0 = vec2(0.14, 0.0);
    float head = length(p - c0) - 0.3;
    float tx = clamp((p.x + 0.48) / 0.62, 0.0, 1.0);
    float tail = max(abs(p.y) - 0.3 * tx, -(p.x + 0.48));
    float d = p.x < c0.x ? min(head, tail) : head;
    a = 1.0 - smoothstep(-0.02, 0.02, d);
    col = mix(col, col * 0.6, smoothstep(-0.08, -0.03, d));
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.035, 0.07, length(p - vec2(0.22, 0.1)))) * 0.95);
  } else if (shape == 12) {
    // Crumb: lumpy blob, lit top-left, darker rim.
    float ang = atan(p.y, p.x);
    float R = 0.36 + 0.07 * sin(ang * 5.0 + 1.0) + 0.04 * sin(ang * 3.0 + 2.0);
    float d = r - R;
    a = 1.0 - smoothstep(-0.02, 0.02, d);
    col *= 0.82 + 0.34 * clamp(0.5 + p.y * 1.2 - p.x * 0.5, 0.0, 1.0);
    col = mix(col, col * 0.5, smoothstep(-0.09, -0.03, d));
  } else if (shape == 13) {
    // Cereal O: chunky ring, lit top-left, darker rim.
    float d = abs(r - 0.3) - 0.15;
    a = 1.0 - smoothstep(-0.02, 0.02, d);
    col *= 0.85 + 0.32 * clamp(0.5 + p.y * 1.2 - p.x * 0.5, 0.0, 1.0);
    col = mix(col, col * 0.55, smoothstep(-0.07, -0.02, d));
  } else {
    // Steam squiggle: a soft wavy stroke that wiggles over its life.
    float y = p.y;
    float w = sin(y * 11.0 + vT * 9.0) * 0.1 * (0.6 + 0.4 * (y + 0.5));
    float d = abs(p.x - w) - 0.08 * (1.0 - abs(y) * 1.1);
    a = (1.0 - smoothstep(-0.035, 0.035, d)) * (1.0 - smoothstep(0.28, 0.5, abs(y)));
  }
  a *= vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a * (1.0 - vAdd));
}
`;

/** Ease-out-back 0 → 1 with a small overshoot (pop-in). */
export function easeOutBack(k: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.max(0, Math.min(1, k)) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/** Unpack the shape id + life fraction written to iMisc.y (mirrors the vertex shader). */
export function unpackShape(v: number): { shape: number; t: number } {
  const shape = Math.floor(v);
  return { shape, t: v - shape };
}

export class Particles {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  readonly max: number;
  private cap: number;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly attrs: THREE.InstancedBufferAttribute[];
  // SoA state
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly ca: Float32Array;
  private readonly rot: Float32Array;
  private readonly rotV: Float32Array;
  private readonly flip: Float32Array;
  private readonly flipV: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly fadeIn: Float32Array;
  private readonly blink: Float32Array;
  private readonly floor: Float32Array;
  private readonly sway: Float32Array;
  private readonly swayF: Float32Array;
  private readonly stretch: Float32Array;
  private readonly fadeOut: Float32Array;
  private readonly popIn: Float32Array;
  private readonly shape: Uint8Array;
  private readonly add: Float32Array;
  private readonly alive: Uint8Array;
  /** Spawn serial per slot (oldest-first recycling). */
  private readonly born: Float64Array;
  private serial = 0;
  private cursor = 0;
  private liveCount = 0;

  constructor(max = 2400) {
    this.max = max;
    this.cap = max;
    const f = () => new Float32Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.s0 = f();
    this.s1 = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.ca = f();
    this.rot = f();
    this.rotV = f();
    this.flip = f();
    this.flipV = f();
    this.grav = f();
    this.drag = f();
    this.fadeIn = f();
    this.blink = f();
    this.floor = f();
    this.sway = f();
    this.swayF = f();
    this.stretch = f();
    this.fadeOut = f();
    this.popIn = f();
    this.shape = new Uint8Array(max);
    this.add = f();
    this.alive = new Uint8Array(max);
    this.born = new Float64Array(max);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const ia = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(max * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = ia(4);
    this.aCol = ia(4);
    this.aMisc = ia(4);
    this.aVel = ia(4);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iMisc', this.aMisc);
    g.setAttribute('iVel', this.aVel);
    this.attrs = [this.aPos, this.aCol, this.aMisc, this.aVel];
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-particles',
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'particles';
  }

  /** Live particles. */
  get count(): number {
    return this.liveCount;
  }

  /** Current cap (≤ max). */
  get limit(): number {
    return this.cap;
  }

  /** Change the live cap (quality). Particles beyond the new cap are dropped. */
  setCap(n: number): void {
    this.cap = Math.max(16, Math.min(this.max, Math.floor(n)));
    for (let i = this.cap; i < this.max; i++) this.alive[i] = 0;
    if (this.cursor >= this.cap) this.cursor = 0;
  }

  /** Spawn one particle (recycles the oldest live slot when the pool is full). Returns the slot. */
  emit(sp: ParticleSpec): number {
    const cap = this.cap;
    let i = -1;
    for (let k = 0; k < cap; k++) {
      const j = (this.cursor + k) % cap;
      if (!this.alive[j]) {
        i = j;
        break;
      }
      if (k >= 64) break;
    }
    if (i < 0) {
      // Full (or no free slot nearby): recycle the oldest live particle.
      let oldest = 0;
      let ob = Infinity;
      for (let j = 0; j < cap; j++)
        if (this.born[j]! < ob) {
          ob = this.born[j]!;
          oldest = j;
        }
      i = oldest;
    }
    this.cursor = (i + 1) % cap;
    this.px[i] = sp.x;
    this.py[i] = sp.y;
    this.pz[i] = sp.z;
    this.vx[i] = sp.vx;
    this.vy[i] = sp.vy;
    this.vz[i] = sp.vz;
    this.age[i] = 0;
    this.life[i] = Math.max(0.05, sp.life);
    this.s0[i] = sp.size0;
    this.s1[i] = sp.size1;
    this.cr[i] = sp.r;
    this.cg[i] = sp.g;
    this.cb[i] = sp.b;
    this.ca[i] = sp.alpha;
    this.rot[i] = sp.rot;
    this.rotV[i] = sp.rotV;
    this.flip[i] = sp.rot;
    this.flipV[i] = sp.flipV;
    this.grav[i] = sp.gravity;
    this.drag[i] = sp.drag;
    this.fadeIn[i] = sp.fadeIn;
    this.blink[i] = sp.blink;
    this.floor[i] = sp.floor;
    this.sway[i] = sp.sway;
    this.swayF[i] = sp.swayF;
    this.stretch[i] = sp.stretch;
    this.fadeOut[i] = Math.max(0, Math.min(0.999, sp.fadeOut));
    this.popIn[i] = Math.max(0, Math.min(1, sp.popIn));
    this.shape[i] = sp.shape;
    this.add[i] = typeof sp.additive === 'number' ? Math.max(0, Math.min(1, sp.additive)) : sp.additive ? 1 : 0;
    this.alive[i] = 1;
    this.born[i] = this.serial++;
    return i;
  }

  /** Is slot i alive? (tests) */
  isAlive(i: number): boolean {
    return this.alive[i] === 1;
  }

  /** Spawn serial of slot i (tests: oldest-first recycling). */
  bornAt(i: number): number {
    return this.born[i]!;
  }

  clear(): void {
    this.alive.fill(0);
    this.liveCount = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number): void {
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const M = this.aMisc.array as Float32Array;
    const V = this.aVel.array as Float32Array;
    let n = 0;
    const cap = this.cap;
    for (let i = 0; i < cap; i++) {
      if (!this.alive[i]) continue;
      const age = (this.age[i] = this.age[i]! + dt);
      const life = this.life[i]!;
      if (age >= life) {
        this.alive[i] = 0;
        continue;
      }
      const d = this.drag[i]! > 0 ? Math.exp(-this.drag[i]! * dt) : 1;
      let vx = this.vx[i]! * d;
      let vy = (this.vy[i]! - this.grav[i]! * dt) * d;
      let vz = this.vz[i]! * d;
      const sw = this.sway[i]!;
      const swx = sw !== 0 ? Math.sin(age * this.swayF[i]! + i) * sw : 0;
      const swz = sw !== 0 ? Math.cos(age * this.swayF[i]! * 0.8 + i * 1.7) * sw * 0.7 : 0;
      const x = this.px[i]! + (vx + swx) * dt;
      let y = this.py[i]! + vy * dt;
      const z = this.pz[i]! + (vz + swz) * dt;
      const fl = this.floor[i]!;
      if (y < fl) {
        y = fl;
        vy = -vy * 0.3;
        vx *= 0.55;
        vz *= 0.55;
        this.rotV[i] = this.rotV[i]! * 0.4;
        this.flipV[i] = this.flipV[i]! * 0.2;
        this.sway[i] = 0;
      }
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.vz[i] = vz;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      const rot = (this.rot[i] = this.rot[i]! + this.rotV[i]! * dt);
      const flip = (this.flip[i] = this.flip[i]! + this.flipV[i]! * dt);
      const t = age / life;
      const fi = this.fadeIn[i]!;
      const fo = this.fadeOut[i]!;
      let a = this.ca[i]! * (fi > 0 ? Math.min(1, t / fi) : 1) * (t > fo ? 1 - (t - fo) / (1 - fo) : 1);
      const bl = this.blink[i]!;
      if (bl > 0) a *= 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(age * bl * 6.2832 + i));
      let size = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t;
      const pi = this.popIn[i]!;
      if (pi > 0 && t < pi) size *= easeOutBack(t / pi);
      const o = n * 4;
      P[o] = x;
      P[o + 1] = y;
      P[o + 2] = z;
      P[o + 3] = size;
      // Paper confetti darkens as it turns edge-on / shows its back.
      const fv = this.flipV[i]! !== 0 ? Math.cos(flip) : 1;
      const shadeK = this.flipV[i]! !== 0 ? 0.62 + 0.38 * Math.abs(fv) : 1;
      C[o] = this.cr[i]! * shadeK;
      C[o + 1] = this.cg[i]! * shadeK;
      C[o + 2] = this.cb[i]! * shadeK;
      C[o + 3] = a;
      M[o] = rot;
      M[o + 1] = this.shape[i]! + Math.min(t, 0.999);
      M[o + 2] = this.add[i]!;
      M[o + 3] = this.flipV[i]! !== 0 ? Math.max(0.12, Math.abs(fv)) : 1;
      V[o] = vx;
      V[o + 1] = vy;
      V[o + 2] = vz;
      V[o + 3] = this.stretch[i]!;
      n++;
    }
    this.liveCount = n;
    this.geo.instanceCount = n;
    for (const attr of this.attrs) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, Math.max(1, n) * 4);
      attr.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    this.mesh.material.dispose();
    this.mesh.removeFromParent();
  }
}
