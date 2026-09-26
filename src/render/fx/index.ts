// ─────────────────────────────────────────────────────────────────────────────
// createFx() — pooled celebration/household effects implementing Fx
// (src/render/types.ts), sized for a cosy family home (metres; hand-held props
// ≈ 0.1 m, people ≈ 1.2–1.9 m):
//   dust · spark · star · foam (soap chunks) · turf · fire · sparkle (hanging
//   twinkles) · heart (pink hearts float up) · bubble (soap suds that pop) ·
//   steam (wisps) · leaf (autumn leaves flutter down) · splash (water drops) ·
//   crumb (cereal O's + cookie bits),
// plus paper confetti (with a few hearts), fireworks, expanding ground rings
// and ribbon trails. Three draw calls total (particles, rings, trails). No
// allocations per frame; the only allocation after construction is one tiny
// handle per trail() call. Quality: setQuality('low') caps particles at 900 and
// scales default burst counts. Particles that fall bounce on createFx({ floor }).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { BurstKind, BurstOpts, Fx, TrailHandle, Vec3Like } from '../types';
import { CONFETTI_COLORS, PAL } from '../palette';
import { Particles, ParticleSpec, SHAPE, type Shape } from './particles';
import { Rings } from './rings';
import { Trails } from './trails';

export const FX_CAPS = { high: 2400, low: 900 } as const;
const MAX_SHELLS = 16;

/** Every burst kind (tests, dev gallery). */
export const BURST_KINDS: readonly BurstKind[] = ['dust', 'spark', 'star', 'foam', 'turf', 'fire', 'sparkle', 'heart', 'bubble', 'steam', 'leaf', 'splash', 'crumb'];

/** Default particle counts per burst (before quality scaling). */
export const BURST_DEFAULTS: Readonly<Record<BurstKind, number>> = {
  dust: 8,
  spark: 12,
  star: 8,
  foam: 12,
  turf: 12,
  fire: 14,
  sparkle: 10,
  heart: 5,
  bubble: 8,
  steam: 6,
  leaf: 6,
  splash: 12,
  crumb: 10,
};

/** Default fireworks launch area (used when fireworks() gets no position): above and behind the scene. */
export const FIREWORKS_ORIGIN = { x: 0, y: 3, z: -14 } as const;

const FIREWORK_SETS: readonly [number, number][] = [
  [PAL.confettiB, 0xffffff],
  [PAL.confettiA, PAL.confettiE],
  [PAL.confettiD, PAL.confettiB],
  [PAL.confettiC, 0xffffff],
  [PAL.heart, PAL.confettiB],
  [PAL.confettiD, PAL.confettiA],
];
const FIRE_COLORS: readonly number[] = [PAL.fireA, PAL.fireB, PAL.fireC, PAL.fireD];
const LEAF_COLORS: readonly number[] = [PAL.leafAutumn, PAL.leafRed, PAL.leafGold, PAL.leafBrown];
const CRUMB_COLORS: readonly number[] = [PAL.cereal, PAL.crumbCookie, PAL.cracker, PAL.crumbChoc];
const HEART_COLORS: readonly number[] = [PAL.heart, PAL.heartLight, PAL.flowerPink];
const EMPTY: BurstOpts = {};

interface Shell {
  active: boolean;
  delay: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  trailT: number;
  set: number;
  kind: number;
}

export interface FxSystem extends Fx {
  setQuality(q: 'high' | 'low'): void;
  /** Live particle count (diagnostics/tests). */
  readonly particleCount: number;
  readonly particles: Particles;
  readonly rings: Rings;
  readonly trails: Trails;
  readonly activeShells: number;
}

/** Particles emitted by one burst: explicit counts are used as-is, defaults scale with quality; capped at ¼ of the pool. */
export function burstCount(requested: number | undefined, def: number, qualityK: number, limit: number): number {
  const base = requested !== undefined && Number.isFinite(requested) ? requested : def * qualityK;
  return Math.max(1, Math.min(Math.round(base), Math.floor(limit / 4)));
}

/** `floor(x, z)` = ground height for bouncing particles (default: flat y = 0). */
export function createFx(opts: { quality?: 'high' | 'low'; floor?: (x: number, z: number) => number } = {}): FxSystem {
  const root = new THREE.Group();
  root.name = 'fx';
  const particles = new Particles(FX_CAPS.high);
  const rings = new Rings(24);
  const trails = new Trails();
  root.add(particles.mesh, rings.mesh, trails.mesh);
  const sp = new ParticleSpec();
  let qk = 1;
  const shells: Shell[] = [];
  for (let i = 0; i < MAX_SHELLS; i++) shells.push({ active: false, delay: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fuse: 0, trailT: 0, set: 0, kind: 0 });

  // Cosmetic PRNG (xorshift32) — deterministic, allocation-free.
  let st = 0x2f6b1a3d;
  const rnd = (): number => {
    st ^= st << 13;
    st ^= st >>> 17;
    st ^= st << 5;
    return (st >>> 0) / 4294967296;
  };
  const range = (a: number, b: number) => a + (b - a) * rnd();
  const pick = (arr: readonly number[]) => arr[Math.floor(rnd() * arr.length) % arr.length]!;

  const setQuality = (q: 'high' | 'low') => {
    qk = q === 'high' ? 1 : 0.55;
    particles.setCap(FX_CAPS[q]);
  };
  setQuality(opts.quality ?? 'high');

  const floorFn = opts.floor ?? (() => 0);
  const floorAt = (x: number, z: number) => floorFn(x, z) + 0.01;

  /** Random direction biased by opts.dir. */
  const dirOut = { x: 0, y: 0, z: 0 };
  const randomDir = (upBias: number, dir?: Vec3Like) => {
    const a = rnd() * Math.PI * 2;
    const u = rnd() * 2 - 1;
    const r = Math.sqrt(1 - u * u);
    let x = Math.cos(a) * r;
    let y = Math.abs(u) * upBias + u * (1 - upBias);
    let z = Math.sin(a) * r;
    if (dir) {
      const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
      x += (dir.x / l) * 1.2;
      y += (dir.y / l) * 1.2;
      z += (dir.z / l) * 1.2;
      const m = Math.hypot(x, y, z) || 1;
      x /= m;
      y /= m;
      z /= m;
    }
    dirOut.x = x;
    dirOut.y = y;
    dirOut.z = z;
    return dirOut;
  };

  const emitAt = (at: Vec3Like, shape: Shape, jitter = 0) => {
    sp.x = at.x + (jitter ? (rnd() - 0.5) * 2 * jitter : 0);
    sp.y = at.y + (jitter ? (rnd() - 0.5) * 2 * jitter : 0);
    sp.z = at.z + (jitter ? (rnd() - 0.5) * 2 * jitter : 0);
    sp.shape = shape;
  };

  const burst = (kind: BurstKind, at: Vec3Like, o: BurstOpts = EMPTY): void => {
    const spd = o.speed ?? 1;
    const siz = o.size ?? 1;
    const n = burstCount(o.count, BURST_DEFAULTS[kind] ?? 8, qk, particles.limit);
    switch (kind) {
      case 'dust': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.8, o.dir);
          sp.reset().color(o.color ?? PAL.fxDust);
          emitAt(at, SHAPE.PUFF);
          sp.x += d.x * 0.06 * siz;
          sp.z += d.z * 0.06 * siz;
          sp.vx = d.x * range(0.35, 1.0) * spd;
          sp.vy = Math.abs(d.y) * range(0.15, 0.5) * spd;
          sp.vz = d.z * range(0.35, 1.0) * spd;
          sp.life = range(0.45, 0.8);
          sp.size0 = 0.09 * siz;
          sp.size1 = range(0.22, 0.32) * siz;
          sp.drag = 3.5;
          sp.alpha = 0.75;
          particles.emit(sp);
        }
        break;
      }
      case 'spark': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.4, o.dir);
          sp.reset().color(o.color ?? (i % 3 === 0 ? PAL.interact : i % 3 === 1 ? PAL.great : PAL.fireA));
          emitAt(at, SHAPE.STREAK);
          const s = range(2.2, 4.5) * spd;
          sp.vx = d.x * s;
          sp.vy = d.y * s + 1;
          sp.vz = d.z * s;
          sp.life = range(0.25, 0.5);
          sp.size0 = 0.07 * siz;
          sp.size1 = 0.025 * siz;
          sp.stretch = 0.035;
          sp.additive = 0.5;
          sp.gravity = 8;
          sp.drag = 1.6;
          particles.emit(sp);
        }
        sp.reset().color(o.color ?? PAL.interact);
        emitAt(at, SHAPE.GLOW);
        sp.life = 0.16;
        sp.size0 = 0.45 * siz;
        sp.size1 = 0.12 * siz;
        sp.additive = 0.7;
        particles.emit(sp);
        break;
      }
      case 'star': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.75, o.dir);
          const star = i % 3 !== 2;
          sp.reset().color(o.color ?? (star ? PAL.great : PAL.sparkle));
          emitAt(at, star ? SHAPE.STAR : SHAPE.SPARKLE);
          const s = range(1.1, 2.3) * spd;
          sp.vx = d.x * s;
          sp.vy = Math.abs(d.y) * s + 0.9;
          sp.vz = d.z * s;
          sp.life = range(0.75, 1.15);
          sp.size0 = (star ? range(0.12, 0.17) : 0.14) * siz;
          sp.size1 = (star ? 0.07 : 0.04) * siz;
          sp.popIn = star ? 0.18 : 0;
          sp.rot = range(-0.4, 0.4);
          sp.rotV = range(-4, 4);
          sp.additive = star ? 0 : 1;
          sp.gravity = 2.6;
          sp.drag = 1.8;
          sp.blink = star ? 0 : 5;
          particles.emit(sp);
        }
        break;
      }
      case 'foam': {
        // Chunky soap-foam blobs that plop and bounce.
        const fl = floorAt(at.x, at.z);
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.6, o.dir);
          sp.reset().color(o.color ?? (i % 3 === 0 ? PAL.bubble : 0xffffff));
          emitAt(at, SHAPE.PUFF);
          const s = range(1.0, 2.2) * spd;
          sp.vx = d.x * s;
          sp.vy = Math.abs(d.y) * s + 1.1;
          sp.vz = d.z * s;
          sp.life = range(0.8, 1.3);
          sp.size0 = sp.size1 = range(0.04, 0.085) * siz;
          sp.popIn = 0.12;
          sp.gravity = 7;
          sp.drag = 0.9;
          sp.floor = fl;
          particles.emit(sp);
        }
        break;
      }
      case 'turf': {
        const fl = floorAt(at.x, at.z);
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.85, o.dir);
          const clod = i % 3 !== 0;
          sp.reset().color(o.color ?? (clod ? (i % 2 ? PAL.grassA : PAL.grassB) : PAL.dirtDark));
          emitAt(at, clod ? SHAPE.CRUMB : SHAPE.PUFF);
          const s = range(1.0, 2.4) * spd;
          sp.vx = d.x * s;
          sp.vy = Math.abs(d.y) * s + 1.3;
          sp.vz = d.z * s;
          sp.life = clod ? range(0.7, 1.1) : range(0.4, 0.7);
          sp.size0 = (clod ? range(0.035, 0.06) : 0.1) * siz;
          sp.size1 = clod ? sp.size0 : 0.22 * siz;
          sp.rot = rnd() * 6.28;
          sp.rotV = range(-10, 10);
          sp.gravity = clod ? 9 : 0;
          sp.drag = clod ? 0.4 : 3;
          sp.alpha = clod ? 1 : 0.6;
          sp.floor = fl;
          particles.emit(sp);
        }
        break;
      }
      case 'fire': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.9, o.dir);
          sp.reset().color(o.color ?? FIRE_COLORS[i % FIRE_COLORS.length]!);
          emitAt(at, i % 4 === 3 ? SHAPE.SPARKLE : SHAPE.FLAME);
          sp.x += d.x * 0.05 * siz;
          sp.z += d.z * 0.05 * siz;
          sp.vx = d.x * range(0.1, 0.45) * spd;
          sp.vy = range(0.7, 1.5) * spd;
          sp.vz = d.z * range(0.1, 0.45) * spd;
          sp.life = range(0.4, 0.7);
          sp.size0 = range(0.16, 0.26) * siz;
          sp.size1 = 0.04 * siz;
          sp.alpha = 0.9;
          sp.additive = 0.45;
          sp.drag = 1.5;
          sp.gravity = -0.8;
          sp.blink = i % 4 === 3 ? 6 : 0;
          particles.emit(sp);
        }
        break;
      }
      case 'sparkle': {
        // Tiny twinkles that pop, hang in the air and blink out (hair shine, the legendary brush).
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.5, o.dir);
          sp.reset().color(o.color ?? (i % 3 === 2 ? PAL.sparkle : PAL.great), i % 3 === 2 ? 1.15 : 1);
          emitAt(at, SHAPE.SPARKLE, 0.07 * siz);
          const s = range(0.12, 0.45) * spd;
          sp.vx = d.x * s;
          sp.vy = d.y * s + 0.08;
          sp.vz = d.z * s;
          sp.life = range(0.45, 0.95);
          sp.size0 = range(0.07, 0.13) * siz;
          sp.size1 = 0.02 * siz;
          sp.popIn = 0.3;
          sp.fadeOut = 0.6;
          sp.rot = range(-0.3, 0.3);
          sp.additive = 0.6;
          sp.drag = 3;
          sp.blink = range(4, 7);
          particles.emit(sp);
        }
        break;
      }
      case 'heart': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.9, o.dir);
          sp.reset().color(o.color ?? HEART_COLORS[i % HEART_COLORS.length]!);
          emitAt(at, SHAPE.HEART, 0.05 * siz);
          sp.vx = d.x * range(0.08, 0.25) * spd;
          sp.vy = range(0.35, 0.7) * spd;
          sp.vz = d.z * range(0.08, 0.25) * spd;
          sp.life = range(1.3, 1.9);
          sp.size0 = sp.size1 = range(0.1, 0.16) * siz;
          sp.popIn = 0.16;
          sp.fadeOut = 0.65;
          sp.rot = range(-0.25, 0.25);
          sp.rotV = range(-0.5, 0.5);
          sp.gravity = -0.25;
          sp.drag = 1.1;
          sp.sway = range(0.1, 0.2) * spd;
          sp.swayF = range(2.5, 4);
          particles.emit(sp);
        }
        break;
      }
      case 'bubble': {
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.7, o.dir);
          sp.reset().color(o.color ?? PAL.bubble);
          emitAt(at, SHAPE.BUBBLE, 0.06 * siz);
          sp.vx = d.x * range(0.05, 0.25) * spd;
          sp.vy = (Math.abs(d.y) * range(0.1, 0.3) + 0.12) * spd;
          sp.vz = d.z * range(0.05, 0.25) * spd;
          sp.life = range(1.3, 2.6);
          sp.size0 = range(0.03, 0.075) * siz;
          sp.size1 = sp.size0 * 1.12;
          sp.popIn = 0.12;
          sp.fadeOut = 0.985;
          sp.gravity = -0.06;
          sp.drag = 1.3;
          sp.sway = range(0.04, 0.09) * spd;
          sp.swayF = range(2, 3.5);
          particles.emit(sp);
        }
        break;
      }
      case 'steam': {
        for (let i = 0; i < n; i++) {
          const wisp = i % 3 !== 2;
          sp.reset().color(o.color ?? PAL.steam);
          emitAt(at, wisp ? SHAPE.WISP : SHAPE.GLOW, 0.03 * siz);
          const d = randomDir(0.95, o.dir);
          sp.vx = d.x * 0.04 * spd;
          sp.vy = range(0.16, 0.3) * spd;
          sp.vz = d.z * 0.04 * spd;
          sp.life = range(1.2, 1.9);
          sp.size0 = (wisp ? 0.09 : 0.08) * siz;
          sp.size1 = (wisp ? 0.17 : 0.22) * siz;
          sp.alpha = wisp ? 0.7 : 0.32;
          sp.fadeIn = 0.25;
          sp.fadeOut = 0.5;
          sp.rot = range(-0.2, 0.2);
          sp.additive = 0.2;
          sp.drag = 0.6;
          sp.sway = range(0.02, 0.05) * spd;
          sp.swayF = range(1.5, 2.5);
          particles.emit(sp);
        }
        break;
      }
      case 'leaf': {
        const fl = floorAt(at.x, at.z);
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.3, o.dir);
          sp.reset().color(o.color ?? pick(LEAF_COLORS));
          emitAt(at, SHAPE.LEAF, 0.2 * siz);
          sp.y = at.y + rnd() * 0.3 * siz;
          sp.vx = d.x * range(0.1, 0.5) * spd;
          sp.vy = range(-0.1, 0.35) * spd;
          sp.vz = d.z * range(0.1, 0.5) * spd;
          sp.life = range(2.4, 3.6);
          sp.size0 = sp.size1 = range(0.09, 0.14) * siz;
          sp.popIn = 0.06;
          sp.fadeOut = 0.82;
          sp.rot = rnd() * 6.28;
          sp.rotV = range(-2, 2);
          sp.flipV = range(3, 7);
          sp.gravity = 1.1;
          sp.drag = 2.1;
          sp.sway = range(0.35, 0.65) * spd;
          sp.swayF = range(2, 3.4);
          sp.floor = fl;
          particles.emit(sp);
        }
        break;
      }
      case 'splash': {
        const fl = floorAt(at.x, at.z);
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.75, o.dir);
          sp.reset().color(o.color ?? (i % 4 === 0 ? PAL.bubble : PAL.splash));
          emitAt(at, SHAPE.DROP);
          const s = range(1.3, 2.8) * spd;
          sp.vx = d.x * s;
          sp.vy = Math.abs(d.y) * s + 1.2;
          sp.vz = d.z * s;
          sp.life = range(0.45, 0.8);
          sp.size0 = range(0.028, 0.045) * siz;
          sp.size1 = sp.size0 * 0.7;
          sp.stretch = 0.045;
          sp.gravity = 9.8;
          sp.drag = 0.3;
          sp.floor = fl;
          particles.emit(sp);
        }
        break;
      }
      case 'crumb': {
        const fl = floorAt(at.x, at.z);
        for (let i = 0; i < n; i++) {
          const d = randomDir(0.7, o.dir);
          const o3 = i % 3 === 0;
          sp.reset().color(o.color ?? (o3 ? PAL.cereal : CRUMB_COLORS[1 + (i % 3)]!));
          emitAt(at, o3 ? SHAPE.CEREAL : SHAPE.CRUMB);
          const s = range(0.7, 1.7) * spd;
          sp.vx = d.x * s;
          sp.vy = Math.abs(d.y) * s + 1.1;
          sp.vz = d.z * s;
          sp.life = range(0.8, 1.3);
          sp.size0 = sp.size1 = (o3 ? range(0.034, 0.044) : range(0.022, 0.034)) * siz;
          sp.rot = rnd() * 6.28;
          sp.rotV = range(-9, 9);
          sp.gravity = 9;
          sp.drag = 0.4;
          sp.floor = fl;
          particles.emit(sp);
        }
        break;
      }
    }
  };

  const confetti = (at: Vec3Like, radius = 1.5, amount = 1): void => {
    const rad = Math.max(0.2, Number.isFinite(radius) ? radius : 1.5);
    const sc = Math.min(3, Math.max(0.6, rad / 1.5));
    const chip = Math.min(0.16, Math.max(0.05, 0.03 * rad + 0.03));
    const n = Math.round(Math.max(0, Math.min(1.5, Number.isFinite(amount) ? amount : 1)) * 190 * qk);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * rad;
      const heart = i % 7 === 0;
      const c = heart ? pick(HEART_COLORS) : CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)]!;
      sp.reset().color(c);
      sp.x = at.x + Math.cos(a) * r;
      sp.z = at.z + Math.sin(a) * r;
      sp.y = at.y + range(1.2, 2.4) * sc;
      sp.vx = Math.cos(a) * range(0.3, 1.4) * sc;
      sp.vy = range(0.6, 2.6) * sc;
      sp.vz = Math.sin(a) * range(0.3, 1.4) * sc;
      sp.shape = heart ? SHAPE.HEART : SHAPE.CHIP;
      sp.life = range(3.4, 5);
      sp.size0 = sp.size1 = (heart ? 1.5 : 1) * range(0.8, 1.2) * chip;
      sp.gravity = 2.4 * Math.sqrt(sc);
      sp.drag = 1.6;
      sp.sway = range(0.25, 0.6) * Math.sqrt(sc);
      sp.swayF = range(2.2, 4);
      sp.flipV = heart ? range(2, 4) : range(5, 12);
      sp.rot = rnd() * Math.PI;
      sp.rotV = range(-4, 4);
      sp.fadeIn = 0.02;
      sp.fadeOut = 0.8;
      sp.floor = floorAt(sp.x, sp.z);
      particles.emit(sp);
    }
  };

  const fireworks = (count = 5, at?: Vec3Like): void => {
    const base = at ?? FIREWORKS_ORIGIN;
    const spread = at ? 4 : 10;
    let placed = 0;
    for (const s of shells) {
      if (placed >= count) break;
      if (s.active) continue;
      s.active = true;
      s.delay = placed * range(0.25, 0.45);
      s.x = base.x + range(-spread, spread);
      s.y = base.y;
      s.z = base.z + range(-2, 2);
      s.vx = range(-1.2, 1.2);
      s.vy = range(13, 16);
      s.vz = range(-1, 1);
      s.fuse = range(0.95, 1.25);
      s.trailT = 0;
      s.set = Math.floor(rnd() * FIREWORK_SETS.length);
      s.kind = Math.floor(rnd() * 3);
      placed++;
    }
  };

  const burstShell = (s: Shell): void => {
    const [c1, c2] = FIREWORK_SETS[s.set]!;
    const n = Math.round(90 * qk);
    for (let i = 0; i < n; i++) {
      let dx: number;
      let dy: number;
      let dz: number;
      if (s.kind === 1) {
        // Ring burst, tilted.
        const a = (i / n) * Math.PI * 2;
        dx = Math.cos(a) * 0.35;
        dy = Math.sin(a);
        dz = Math.cos(a);
      } else {
        const d = randomDir(0);
        dx = d.x;
        dy = d.y;
        dz = d.z;
      }
      const willow = s.kind === 2;
      sp.reset().color(i % 2 === 0 ? c1 : c2, 1.2);
      sp.x = s.x;
      sp.y = s.y;
      sp.z = s.z;
      const v = willow ? range(6, 8) : range(8.5, 11);
      sp.vx = dx * v;
      sp.vy = dy * v;
      sp.vz = dz * v;
      sp.shape = willow ? SHAPE.STREAK : i % 5 === 0 ? SHAPE.SPARKLE : SHAPE.GLOW;
      sp.stretch = willow ? 0.1 : 0;
      sp.life = willow ? range(2.0, 2.6) : range(1.4, 2.0);
      sp.size0 = willow ? 0.7 : 1.3;
      sp.size1 = 0.25;
      sp.additive = true;
      sp.gravity = willow ? 2.2 : 3;
      sp.drag = willow ? 1.4 : 1.8;
      sp.blink = i % 5 === 0 ? 5 : 0;
      particles.emit(sp);
    }
    sp.reset().color(c1, 1.2);
    sp.x = s.x;
    sp.y = s.y;
    sp.z = s.z;
    sp.shape = SHAPE.GLOW;
    sp.life = 0.22;
    sp.size0 = 7;
    sp.size1 = 12;
    sp.alpha = 0.5;
    sp.additive = true;
    particles.emit(sp);
  };

  const updateShells = (dt: number): void => {
    for (const s of shells) {
      if (!s.active) continue;
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.vy -= 9.8 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.fuse -= dt;
      s.trailT -= dt;
      if (s.trailT <= 0) {
        s.trailT = 0.025;
        sp.reset().color(PAL.lampWarm);
        sp.x = s.x;
        sp.y = s.y;
        sp.z = s.z;
        sp.vx = range(-0.3, 0.3);
        sp.vy = range(-1.2, 0);
        sp.vz = range(-0.3, 0.3);
        sp.shape = SHAPE.SPARKLE;
        sp.life = range(0.35, 0.6);
        sp.size0 = 0.55;
        sp.size1 = 0.08;
        sp.additive = true;
        sp.gravity = 2;
        particles.emit(sp);
      }
      if (s.fuse <= 0) {
        s.active = false;
        burstShell(s);
      }
    }
  };

  const fx: FxSystem = {
    root,
    particles,
    rings,
    trails,
    get particleCount() {
      return particles.count;
    },
    get activeShells() {
      let n = 0;
      for (const s of shells) if (s.active) n++;
      return n;
    },
    burst,
    confetti,
    fireworks,
    ring(at, color, radius = 1.2, seconds = 0.8) {
      rings.spawn(at.x, at.y, at.z, color, radius, seconds);
    },
    trail(target: THREE.Object3D, color: number, width = 0.12): TrailHandle {
      return trails.start(target, color, width);
    },
    clear() {
      particles.clear();
      rings.clear();
      trails.clear();
      for (const s of shells) s.active = false;
    },
    update(dt, camera) {
      const d = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
      updateShells(d);
      particles.update(d);
      rings.update(d);
      trails.update(d, camera);
      particles.mesh.visible = particles.count > 0;
      rings.mesh.visible = rings.count > 0;
      trails.mesh.visible = trails.active > 0;
    },
    setQuality,
    dispose() {
      particles.dispose();
      rings.dispose();
      trails.dispose();
      root.removeFromParent();
    },
  };
  return fx;
}
