import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { COLLIDE_BACK, COLLIDE_HEAD, HairSim, SIM_MAX_STEPS, SIM_STEP, transformPoints } from '../../src/hair/sim';

const COL = {
  rx: 0.19,
  ry: 0.2,
  rz: 0.185,
  neckY: -0.165,
  backZ: -0.126,
  shoulderY: -0.22,
  shoulderHalfWidth: 0.21,
  shoulderX: 0.14,
  shoulderCY: -0.27,
  shoulderR: 0.075,
  torsoZ: -0.015,
  chestZ: 0.095,
};

/** A few hanging chains (pinned junction + free nodes) like the rig builds. */
function makeSim(chains = 5, nodes = 5): HairSim {
  const sim = new HairSim(chains * nodes, COL);
  for (let c = 0; c < chains; c++) {
    const x = (c / (chains - 1) - 0.5) * 0.3;
    for (let j = 0; j < nodes; j++) {
      const i = c * nodes + j;
      sim.rest[i * 3] = x;
      sim.rest[i * 3 + 1] = -0.08 - j * 0.09;
      sim.rest[i * 3 + 2] = -0.2;
      sim.parent[i] = j === 0 ? -1 : i - 1;
      sim.pinned[i] = j === 0 ? 1 : 0;
      sim.shape[i] = j === 0 ? 1 : 0.1 * (1 - j / nodes) + 0.012;
      sim.margin[i] = 0.02;
      sim.flags[i] = COLLIDE_HEAD | COLLIDE_BACK;
    }
  }
  sim.updateRestLengths();
  sim.reset();
  return sim;
}

const finite = (a: Float32Array) => a.every((v) => Number.isFinite(v));
const maxDev = (sim: HairSim) => {
  let m = 0;
  for (let i = 0; i < sim.n; i++)
    m = Math.max(m, Math.hypot(sim.pos[i * 3]! - sim.rest[i * 3]!, sim.pos[i * 3 + 1]! - sim.rest[i * 3 + 1]!, sim.pos[i * 3 + 2]! - sim.rest[i * 3 + 2]!));
  return m;
};

describe('HairSim', () => {
  it('stays at rest when nothing moves (gravity along the hanging direction)', () => {
    const sim = makeSim();
    for (let f = 0; f < 240; f++) sim.advance(1 / 60, 0, -9.81, 0);
    expect(maxDev(sim)).toBeLessThan(0.02);
  });

  it('never explodes with dt spikes and violent head motion', () => {
    const sim = makeSim();
    const rng = new Rng(1234);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let f = 0; f < 600; f++) {
      e.set(rng.range(-1.2, 1.2), rng.range(-1.2, 1.2), rng.range(-1.2, 1.2));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)), q, new THREE.Vector3(1, 1, 1));
      sim.transfer(m.elements);
      const dt = rng.chance(0.1) ? rng.range(0.2, 3) : rng.range(0, 0.05); // hitches up to 3 s
      sim.advance(dt, rng.range(-12, 12), rng.range(-12, 12), rng.range(-12, 12));
      expect(finite(sim.pos)).toBe(true);
      expect(finite(sim.prev)).toBe(true);
    }
    // Every free node stays within its chain length of the root (length constraints hold).
    for (let i = 0; i < sim.n; i++) {
      const root = i - (i % 5);
      const d = Math.hypot(sim.pos[i * 3]! - sim.rest[root * 3]!, sim.pos[i * 3 + 1]! - sim.rest[root * 3 + 1]!, sim.pos[i * 3 + 2]! - sim.rest[root * 3 + 2]!);
      expect(d).toBeLessThan(0.09 * 4 + 1e-3);
    }
    // Then it settles back to the styled rest shape.
    for (let f = 0; f < 600; f++) sim.advance(1 / 60, 0, -9.81, 0);
    expect(maxDev(sim)).toBeLessThan(0.03);
  });

  it('caps substeps per frame (dt clamp) and ignores non-positive dt', () => {
    const sim = makeSim();
    expect(sim.advance(10, 0, -9.81, 0)).toBeLessThanOrEqual(SIM_MAX_STEPS);
    expect(sim.advance(0, 0, -9.81, 0)).toBe(0);
    expect(sim.advance(-1, 0, -9.81, 0)).toBe(0);
    expect(sim.advance(Number.NaN, 0, -9.81, 0)).toBe(0);
    expect(sim.advance(SIM_STEP * 2.5, 0, -9.81, 0)).toBe(2);
  });

  it('swings when the head moves, then damps out', () => {
    const sim = makeSim();
    // Head jumps 5 cm to +x: nodes stay put in the world → lag to −x in head space.
    const m = new THREE.Matrix4().makeTranslation(-0.05, 0, 0);
    sim.transfer(m.elements);
    sim.advance(1 / 60, 0, -9.81, 0);
    const tip = 4 * 3;
    expect(sim.pos[tip]!).toBeLessThan(sim.rest[tip]! - 0.005);
    for (let f = 0; f < 400; f++) sim.advance(1 / 60, 0, -9.81, 0);
    expect(Math.abs(sim.pos[tip]! - sim.rest[tip]!)).toBeLessThan(0.01);
  });

  it('keeps nodes behind the back plane and outside the head', () => {
    const sim = makeSim();
    // Shove everything forward into the body/head.
    for (let i = 0; i < sim.n; i++) if (!sim.pinned[i]) sim.kick(i, 0, 0.02, 0.05);
    for (let f = 0; f < 60; f++) sim.advance(1 / 60, 0, 0, 9.81);
    for (let i = 0; i < sim.n; i++) {
      if (sim.pinned[i]) continue;
      const x = sim.pos[i * 3]!;
      const y = sim.pos[i * 3 + 1]!;
      const z = sim.pos[i * 3 + 2]!;
      if (y < COL.neckY) expect(z).toBeLessThanOrEqual(COL.backZ - sim.margin[i]! + 1e-5);
      const m = sim.margin[i]!;
      const e = (x / (COL.rx + m)) ** 2 + (y / (COL.ry + m)) ** 2 + (z / (COL.rz + m)) ** 2;
      expect(e).toBeGreaterThanOrEqual(1 - 1e-3);
    }
  });

  it('pinned nodes follow the head exactly', () => {
    const sim = makeSim();
    sim.transfer(new THREE.Matrix4().makeRotationY(0.8).elements);
    sim.advance(1 / 60, 0, -9.81, 0);
    for (let c = 0; c < 5; c++) {
      const i = c * 5;
      expect(sim.pos[i * 3]).toBeCloseTo(sim.rest[i * 3]!, 6);
      expect(sim.pos[i * 3 + 2]).toBeCloseTo(sim.rest[i * 3 + 2]!, 6);
    }
  });

  it('transformPoints applies an affine matrix in place', () => {
    const a = new Float32Array([1, 2, 3, -1, 0, 0.5]);
    const m = new THREE.Matrix4().makeTranslation(1, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    transformPoints(a, 2, m.elements);
    const v = new THREE.Vector3(1, 2, 3).applyMatrix4(m);
    expect(a[0]).toBeCloseTo(v.x, 6);
    expect(a[1]).toBeCloseTo(v.y, 6);
    expect(a[2]).toBeCloseTo(v.z, 6);
  });
});
