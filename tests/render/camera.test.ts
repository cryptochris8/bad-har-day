import { describe, expect, it } from 'vitest';
import { CameraRigImpl, DESIGN_ASPECT, approachFactor, effectiveFov, shakeNoise } from '../../src/render/camera';
import { detailTier } from '../../src/render/renderer';

describe('camera rig math', () => {
  it('keeps the designed FOV on wide screens', () => {
    expect(effectiveFov(55, DESIGN_ASPECT)).toBe(55);
    expect(effectiveFov(55, 2.4)).toBe(55);
  });
  it('widens the FOV on narrow/portrait screens, capped', () => {
    const land = effectiveFov(55, 4 / 3);
    const port = effectiveFov(55, 390 / 844);
    expect(land).toBeGreaterThan(55);
    expect(port).toBeGreaterThan(land);
    expect(port).toBeLessThanOrEqual(100);
    expect(effectiveFov(55, 0)).toBe(55);
  });
  it('approach factor is frame-rate independent and bounded', () => {
    expect(approachFactor(0, 0.016)).toBe(0);
    expect(approachFactor(60, 0.016)).toBe(1);
    const two = 1 - (1 - approachFactor(6, 0.01)) ** 2;
    expect(approachFactor(6, 0.02)).toBeCloseTo(two, 10);
    expect(approachFactor(6, 0)).toBe(0);
  });
  it('shake noise stays in range', () => {
    for (let t = 0; t < 5; t += 0.013) {
      const n = shakeNoise(t, 3);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });
});

describe('CameraRigImpl', () => {
  it('snaps to a goal, then eases toward the next one', () => {
    const rig = new CameraRigImpl();
    rig.setGoal({ position: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 1, z: 0 } }, 6);
    rig.snap();
    rig.update(0.016);
    expect(rig.camera.position.z).toBeCloseTo(10, 5);
    rig.setGoal({ position: { x: 0, y: 5, z: 20 }, target: { x: 0, y: 1, z: 0 } }, 6);
    rig.update(0.016);
    expect(rig.camera.position.z).toBeGreaterThan(10);
    expect(rig.camera.position.z).toBeLessThan(20);
    for (let i = 0; i < 300; i++) rig.update(0.016);
    expect(rig.camera.position.z).toBeCloseTo(20, 2);
  });
  it('ignores shake/kick when disabled, decays when enabled', () => {
    const rig = new CameraRigImpl();
    rig.shakeEnabled = false;
    rig.shake(1);
    rig.kick(10);
    expect(rig.debug().trauma).toBe(0);
    rig.shakeEnabled = true;
    rig.shake(0.8);
    expect(rig.debug().trauma).toBeCloseTo(0.8, 5);
    for (let i = 0; i < 60; i++) rig.update(0.016);
    expect(rig.debug().trauma).toBe(0);
  });
  it('orbits around a centre at the requested radius', () => {
    const rig = new CameraRigImpl();
    rig.orbit({ x: 0, y: 1, z: 0 }, 10, 2, 0.5);
    rig.snap();
    rig.update(0.016);
    const p = rig.camera.position;
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(10, 3);
    expect(p.y).toBeCloseTo(3, 3);
    expect(rig.orbiting).toBe(true);
    rig.setGoal({ position: { x: 1, y: 1, z: 1 }, target: { x: 0, y: 0, z: 0 } });
    expect(rig.orbiting).toBe(false);
  });
  it('survives NaN/huge dt', () => {
    const rig = new CameraRigImpl();
    rig.update(Number.NaN);
    rig.update(99);
    expect(Number.isFinite(rig.camera.position.x)).toBe(true);
  });
});

describe('detail tier', () => {
  it('maps quality to scene detail', () => {
    expect(detailTier('high', true)).toBe('high');
    expect(detailTier('low', false)).toBe('low');
    expect(detailTier('auto', false)).toBe('high');
    expect(detailTier('auto', true)).toBe('low');
  });
});
