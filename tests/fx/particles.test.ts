import { describe, expect, it } from 'vitest';
import { Particles, ParticleSpec, SHAPE, easeOutBack, unpackShape } from '../../src/render/fx/particles';

function spec(life = 1): ParticleSpec {
  const sp = new ParticleSpec().reset().color(0xffffff);
  sp.life = life;
  sp.shape = SHAPE.PUFF;
  return sp;
}

describe('Particles pool', () => {
  it('never exceeds its cap, however much is emitted', () => {
    const p = new Particles(500);
    p.setCap(200);
    const sp = spec(5);
    for (let i = 0; i < 1000; i++) p.emit(sp);
    p.update(1 / 60);
    expect(p.count).toBe(200);
    expect(p.mesh.geometry.instanceCount).toBe(200);
    p.dispose();
  });

  it('recycles the oldest particle when full', () => {
    const p = new Particles(64);
    p.setCap(16);
    const sp = spec(10);
    const slots: number[] = [];
    for (let i = 0; i < 16; i++) slots.push(p.emit(sp));
    const oldestSlot = slots[0]!;
    const reused = p.emit(sp);
    expect(reused).toBe(oldestSlot);
    // The new occupant is the newest; every other slot is older.
    for (const s of slots) if (s !== reused) expect(p.bornAt(s)).toBeLessThan(p.bornAt(reused));
    p.dispose();
  });

  it('frees particles when their life ends and reuses free slots first', () => {
    const p = new Particles(32);
    const sp = spec(0.2);
    for (let i = 0; i < 10; i++) p.emit(sp);
    p.update(0.1);
    expect(p.count).toBe(10);
    p.update(0.15);
    expect(p.count).toBe(0);
    const s = p.emit(spec(1));
    expect(p.isAlive(s)).toBe(true);
    p.update(0.01);
    expect(p.count).toBe(1);
    p.clear();
    expect(p.count).toBe(0);
    p.dispose();
  });

  it('bounces on the floor and applies gravity/drag', () => {
    const p = new Particles(8);
    const sp = spec(3);
    sp.y = 2;
    sp.vy = 0;
    sp.gravity = 20;
    sp.floor = 0.5;
    p.emit(sp);
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    const y = (p.mesh.geometry.getAttribute('iPos').array as Float32Array)[1]!;
    expect(y).toBeGreaterThanOrEqual(0.5);
    expect(y).toBeLessThan(1.2);
    p.dispose();
  });

  it('easeOutBack pops in with a small overshoot', () => {
    expect(easeOutBack(0)).toBeCloseTo(0, 6);
    expect(easeOutBack(1)).toBeCloseTo(1, 6);
    let max = 0;
    for (let k = 0; k <= 1; k += 0.01) max = Math.max(max, easeOutBack(k));
    expect(max).toBeGreaterThan(1.05);
    expect(max).toBeLessThan(1.2);
    expect(easeOutBack(-3)).toBeCloseTo(0, 6);
  });

  it('packs shape id + life fraction for the shader', () => {
    const p = new Particles(8);
    const sp = spec(2);
    sp.shape = SHAPE.BUBBLE;
    p.emit(sp);
    p.update(0.5);
    const m = (p.mesh.geometry.getAttribute('iMisc').array as Float32Array)[1]!;
    const u = unpackShape(m);
    expect(u.shape).toBe(SHAPE.BUBBLE);
    expect(u.t).toBeCloseTo(0.25, 3);
    p.dispose();
  });

  it('fadeOut, popIn and fractional additive are honoured', () => {
    const p = new Particles(8);
    const sp = spec(1);
    sp.fadeOut = 0.95;
    sp.popIn = 0.5;
    sp.size0 = sp.size1 = 1;
    sp.additive = 0.6;
    p.emit(sp);
    p.update(0.1);
    const P = p.mesh.geometry.getAttribute('iPos').array as Float32Array;
    const C = p.mesh.geometry.getAttribute('iCol').array as Float32Array;
    const M = p.mesh.geometry.getAttribute('iMisc').array as Float32Array;
    expect(P[3]!).toBeCloseTo(easeOutBack(0.2), 5); // popping in
    expect(M[2]!).toBeCloseTo(0.6, 6);
    p.update(0.7); // t = 0.8: still fully opaque (fade starts at 0.95)
    expect(C[3]!).toBeCloseTo(1, 5);
    expect(P[3]!).toBeCloseTo(1, 5);
    p.dispose();
  });

  it('lowering the cap drops particles beyond it', () => {
    const p = new Particles(100);
    const sp = spec(5);
    for (let i = 0; i < 100; i++) p.emit(sp);
    p.setCap(40);
    p.update(0.01);
    expect(p.count).toBeLessThanOrEqual(40);
    expect(p.limit).toBe(40);
    p.dispose();
  });
});
