import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURST_DEFAULTS, BURST_KINDS, FX_CAPS, burstCount, createFx } from '../../src/render/fx/index';
import { SHAPE } from '../../src/render/fx/particles';
import type { BurstKind } from '../../src/render/types';

const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1200);
camera.position.set(0, 4, 10);
camera.lookAt(0, 1, 0);
const run = (fx: ReturnType<typeof createFx>, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) fx.update(dt, camera);
};
type FxSys = ReturnType<typeof createFx>;
const attr = (fx: FxSys, name: string) => fx.particles.mesh.geometry.getAttribute(name).array as Float32Array;
/** Live particles' [x, y, z, size] + [rot, shape+t, add, flip]. */
const live = (fx: FxSys) => {
  const P = attr(fx, 'iPos');
  const M = attr(fx, 'iMisc');
  const out: { x: number; y: number; z: number; size: number; shape: number; t: number; add: number }[] = [];
  for (let i = 0; i < fx.particleCount; i++) {
    const s = M[i * 4 + 1]!;
    out.push({ x: P[i * 4]!, y: P[i * 4 + 1]!, z: P[i * 4 + 2]!, size: P[i * 4 + 3]!, shape: Math.floor(s), t: s - Math.floor(s), add: M[i * 4 + 2]! });
  }
  return out;
};

describe('createFx', () => {
  it('knows all 13 burst kinds, including the new household ones', () => {
    for (const k of ['sparkle', 'heart', 'bubble', 'steam', 'leaf', 'splash', 'crumb'] as BurstKind[]) expect(BURST_KINDS).toContain(k);
    expect(BURST_KINDS.length).toBe(13);
  });

  it('every burst kind emits its default count, then expires', () => {
    const fx = createFx();
    for (const k of BURST_KINDS) {
      fx.burst(k, { x: 0, y: 1, z: 0 });
      fx.update(1 / 60, camera);
      // 'spark' adds one flash glow on top of its streaks.
      expect(fx.particleCount, k).toBe(BURST_DEFAULTS[k] + (k === 'spark' ? 1 : 0));
      run(fx, 4.5);
      expect(fx.particleCount, k).toBe(0);
    }
    fx.dispose();
  });

  it('low quality scales default counts, explicit counts are kept', () => {
    const fx = createFx({ quality: 'low' });
    fx.burst('heart', { x: 0, y: 1, z: 0 });
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBe(Math.round(BURST_DEFAULTS.heart * 0.55));
    fx.clear();
    fx.burst('heart', { x: 0, y: 1, z: 0 }, { count: 9 });
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBe(9);
    fx.dispose();
  });

  it('burstCount clamps to a quarter of the pool and never below 1', () => {
    expect(burstCount(undefined, 8, 1, 2400)).toBe(8);
    expect(burstCount(undefined, 8, 0.55, 900)).toBe(4);
    expect(burstCount(100000, 8, 1, 2400)).toBe(600);
    expect(burstCount(0, 8, 1, 2400)).toBe(1);
    expect(burstCount(Number.NaN, 8, 1, 2400)).toBe(8);
  });

  it('respects count/colour/dir options and clamps huge counts', () => {
    const fx = createFx();
    fx.burst('star', { x: 0, y: 1, z: 0 }, { count: 5, color: 0xff0000, dir: { x: 0, y: 1, z: 0 }, speed: 2, size: 2 });
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBe(5);
    fx.clear();
    fx.burst('spark', { x: 0, y: 1, z: 0 }, { count: 100000 });
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBeLessThanOrEqual(FX_CAPS.high / 4 + 1);
    fx.dispose();
  });

  it('hearts float up with a sway and live ~1.3–1.9 s', () => {
    const fx = createFx();
    fx.burst('heart', { x: 0, y: 1, z: 0 }, { count: 6 });
    fx.update(1 / 60, camera);
    const start = live(fx);
    expect(start.every((p) => p.shape === SHAPE.HEART)).toBe(true);
    run(fx, 1.0);
    const later = live(fx);
    expect(later.length).toBe(6);
    const meanY = (a: typeof start) => a.reduce((s, p) => s + p.y, 0) / a.length;
    expect(meanY(later)).toBeGreaterThan(meanY(start) + 0.2);
    run(fx, 1.2);
    expect(fx.particleCount).toBe(0);
    fx.dispose();
  });

  it('bubbles drift slowly, carry their life fraction to the shader and pop at the end', () => {
    const fx = createFx();
    fx.burst('bubble', { x: 0, y: 1, z: 0 }, { count: 8 });
    fx.update(1 / 60, camera);
    run(fx, 1.0);
    const mid = live(fx);
    expect(mid.length).toBe(8);
    for (const p of mid) {
      expect(p.shape).toBe(SHAPE.BUBBLE);
      expect(p.t).toBeGreaterThan(0.3);
      expect(p.t).toBeLessThan(0.8);
      expect(Math.abs(p.y - 1)).toBeLessThan(0.8);
    }
    run(fx, 2);
    expect(fx.particleCount).toBe(0);
    fx.dispose();
  });

  it('leaves flutter down and settle on the floor function', () => {
    const fx = createFx({ floor: () => 0.5 });
    fx.burst('leaf', { x: 0, y: 1.3, z: 0 }, { count: 10 });
    fx.update(1 / 60, camera);
    run(fx, 0.5);
    const early = live(fx);
    run(fx, 1.8);
    const ps = live(fx);
    expect(ps.length).toBeGreaterThan(0);
    const meanY = (a: typeof ps) => a.reduce((s, p) => s + p.y, 0) / a.length;
    // Slow flutter: still airborne after half a second, mostly down after ~2 s.
    expect(meanY(early)).toBeGreaterThan(1.0);
    expect(meanY(ps)).toBeLessThan(0.8);
    for (const p of ps) {
      expect(p.shape).toBe(SHAPE.LEAF);
      expect(p.y).toBeGreaterThanOrEqual(0.5);
    }
    fx.dispose();
  });

  it('splash drops and crumbs bounce on the floor instead of falling through', () => {
    for (const k of ['splash', 'crumb', 'foam', 'turf'] as BurstKind[]) {
      const fx = createFx({ floor: () => 0.9 });
      fx.burst(k, { x: 0, y: 1, z: 0 }, { count: 20 });
      for (let i = 0; i < 40; i++) {
        fx.update(1 / 60, camera);
        for (const p of live(fx)) expect(p.y, k).toBeGreaterThanOrEqual(0.9);
      }
      fx.dispose();
    }
  });

  it('sparkles hang near the point and glow partly additively; steam rises', () => {
    const fx = createFx();
    fx.burst('sparkle', { x: 0, y: 1, z: 0 }, { count: 10 });
    fx.update(1 / 60, camera);
    run(fx, 0.3);
    for (const p of live(fx)) {
      expect(Math.hypot(p.x, p.y - 1, p.z)).toBeLessThan(0.35);
      expect(p.add).toBeGreaterThan(0.3);
      expect(p.add).toBeLessThan(1);
    }
    fx.clear();
    fx.burst('steam', { x: 0, y: 1, z: 0 }, { count: 6 });
    fx.update(1 / 60, camera);
    run(fx, 0.8);
    for (const p of live(fx)) expect(p.y).toBeGreaterThan(1.05);
    fx.dispose();
  });

  it('quality caps the pool', () => {
    const fx = createFx({ quality: 'low' });
    for (let i = 0; i < 30; i++) fx.confetti({ x: 0, y: 0, z: 0 }, 5, 1.5);
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBeLessThanOrEqual(FX_CAPS.low);
    fx.setQuality('high');
    for (let i = 0; i < 30; i++) fx.confetti({ x: 0, y: 0, z: 0 }, 5, 1.5);
    fx.update(1 / 60, camera);
    expect(fx.particleCount).toBeGreaterThan(FX_CAPS.low);
    expect(fx.particleCount).toBeLessThanOrEqual(FX_CAPS.high);
    fx.dispose();
  });

  it('confetti falls slowly, includes hearts and settles on the floor', () => {
    const fx = createFx();
    fx.confetti({ x: 0, y: 0, z: 0 }, 1.5, 0.5);
    fx.update(1 / 60, camera);
    const n = fx.particleCount;
    expect(n).toBeGreaterThan(40);
    expect(live(fx).some((p) => p.shape === SHAPE.HEART)).toBe(true);
    run(fx, 2);
    expect(fx.particleCount).toBe(n); // still fluttering after 2 s
    for (const p of live(fx)) expect(p.y).toBeGreaterThanOrEqual(0);
    run(fx, 6);
    expect(fx.particleCount).toBe(0);
    fx.dispose();
  });

  it('fireworks launch shells that burst into many stars', () => {
    const fx = createFx();
    fx.fireworks(3);
    expect(fx.activeShells).toBe(3);
    run(fx, 0.5);
    run(fx, 2.2);
    expect(fx.activeShells).toBe(0);
    expect(fx.particleCount).toBeGreaterThan(60);
    fx.dispose();
  });

  it('rings expand and expire', () => {
    const fx = createFx();
    fx.ring({ x: 1, y: 0, z: 2 }, 0xffd23f, 3, 0.5);
    fx.update(1 / 60, camera);
    expect(fx.rings.count).toBe(1);
    run(fx, 0.6);
    expect(fx.rings.count).toBe(0);
    fx.dispose();
  });

  it('trails follow a target, fade after stop() and free their slot; stale handles are inert', () => {
    const fx = createFx();
    const scene = new THREE.Scene();
    const ball = new THREE.Object3D();
    scene.add(ball);
    const h = fx.trail(ball, 0xffffff, 0.3);
    for (let i = 0; i < 30; i++) {
      ball.position.set(i * 0.5, 2 + Math.sin(i * 0.2), 0);
      ball.updateMatrixWorld();
      fx.update(1 / 60, camera);
    }
    expect(fx.trails.active).toBe(1);
    const pos = fx.trails.mesh.geometry.getAttribute('position').array as Float32Array;
    expect(Math.abs(pos[0]! - ball.position.x)).toBeLessThan(0.5);
    h.stop();
    run(fx, 1);
    expect(fx.trails.active).toBe(0);
    const h2 = fx.trail(ball, 0xff0000);
    h.stop(); // stale: must not stop the new trail
    h.setColor(0x00ff00);
    run(fx, 0.2);
    expect(fx.trails.active).toBe(1);
    h2.stop();
    fx.clear();
    expect(fx.trails.active).toBe(0);
    fx.dispose();
  });

  it('dt = 0 (paused) freezes everything; NaN dt is ignored', () => {
    const fx = createFx();
    fx.burst('dust', { x: 0, y: 1, z: 0 });
    fx.update(1 / 60, camera);
    const n = fx.particleCount;
    for (let i = 0; i < 100; i++) fx.update(0, camera);
    fx.update(Number.NaN, camera);
    expect(fx.particleCount).toBe(n);
    fx.dispose();
  });

  it('stays within 3 draw calls (particles, rings, trails)', () => {
    const fx = createFx();
    let meshes = 0;
    fx.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(3);
    fx.dispose();
  });
});
