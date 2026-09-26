import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHANNELS, Pose, blendPose, copyPose, envelope, poseFinite, resetPose, trk, wrapPi } from '../../src/family/pose';
import { legExtension, solveTwoBone, twoBoneEnd } from '../../src/family/ik';
import { SkinBuilder, blend2, newSkinW, normalizeSkinW } from '../../src/family/skin';
import { lockGeometry, ringAt, ringTube, sstep, starPoints, tubePoint, vRingOpenCheck } from './helpers';

describe('Pose container', () => {
  it('has named accessors over one typed array', () => {
    const p = new Pose();
    expect(p.v.length).toBe(CHANNELS.length);
    expect(p.sq).toBe(1);
    expect(p.gl).toBe(1);
    p.hx = 0.3;
    expect(p.v[CHANNELS.indexOf('hx')]).toBe(0.3);
    resetPose(p);
    expect(p.hx).toBe(0);
  });

  it('copies, blends (shortest arc for yaw) and stays finite', () => {
    const a = new Pose();
    const b = new Pose();
    b.hx = 1;
    b.by = Math.PI * 2 - 0.1;
    const o = new Pose();
    blendPose(o, a, b, 0.5);
    expect(o.hx).toBeCloseTo(0.5);
    expect(o.by).toBeCloseTo(-0.05); // wraps the short way round
    copyPose(o, b);
    expect(o.hx).toBe(1);
    expect(poseFinite(o)).toBe(true);
    o.aLx = NaN;
    expect(poseFinite(o)).toBe(false);
  });

  it('tracks interpolate through keys and clamp at the ends', () => {
    const k = [0, 0, 0.5, 1, 1, 0];
    expect(trk(-1, k)).toBe(0);
    expect(trk(0.5, k)).toBeCloseTo(1);
    expect(trk(2, k)).toBe(0);
    expect(trk(0.25, k)).toBeGreaterThan(0);
    expect(trk(0.25, k)).toBeLessThan(1);
  });

  it('envelope eases in and out', () => {
    expect(envelope(0)).toBe(0);
    expect(envelope(1)).toBe(0);
    expect(envelope(0.5)).toBe(1);
    expect(envelope(0.05)).toBeGreaterThan(0);
    expect(envelope(0.05)).toBeLessThan(1);
    expect(wrapPi(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapPi(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
  });
});

describe('two-bone IK', () => {
  it('reaches reachable targets exactly', () => {
    const sh = new THREE.Vector3(0.2, 1.4, 0);
    const q = new THREE.Quaternion();
    const out = new THREE.Vector3();
    for (const t of [
      [0.4, 1.2, 0.3],
      [0.2, 1.0, 0.35],
      [-0.1, 1.5, 0.3],
      [0.3, 1.7, 0.1],
    ] as const) {
      const target = new THREE.Vector3(...t);
      const bend = solveTwoBone(sh, target, 0.3, 0.3, new THREE.Vector3(1, -1, -0.3), q);
      twoBoneEnd(sh, q, bend, 0.3, 0.3, out);
      expect(out.distanceTo(target)).toBeLessThan(1e-4);
      expect(bend).toBeGreaterThanOrEqual(0);
    }
  });

  it('stretches toward unreachable targets', () => {
    const sh = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const bend = solveTwoBone(sh, new THREE.Vector3(0, 0, 5), 0.3, 0.3, new THREE.Vector3(0, -1, 0), q);
    expect(bend).toBeLessThan(0.1);
    const end = twoBoneEnd(sh, q, bend, 0.3, 0.3, new THREE.Vector3());
    expect(end.z).toBeGreaterThan(0.59);
  });

  it('leg extension: straight leg = full length, bent knee is shorter, knee cap floor when kneeling', () => {
    const full = legExtension(0.4, 0.4, 0.07, 0.25, 0.07, 0, 0, 0, 0);
    expect(full).toBeCloseTo(0.87);
    expect(legExtension(0.4, 0.4, 0.07, 0.25, 0.07, -0.5, 0, 1, -0.5)).toBeLessThan(full);
    // Toes pointed down lengthen the reach (tiptoe).
    expect(legExtension(0.4, 0.4, 0.07, 0.25, 0.07, 0, 0, 0, 0.5)).toBeGreaterThan(full);
  });
});

describe('skin weights', () => {
  it('blend2 + normalize', () => {
    const w = newSkinW();
    blend2(w, 3, 4, 0.25);
    expect(w.i.slice(0, 2)).toEqual([3, 4]);
    expect(w.w[0]).toBeCloseTo(0.75);
    w.w[0] = 2;
    w.w[1] = 2;
    normalizeSkinW(w);
    expect(w.w[0]! + w.w[1]! + w.w[2]! + w.w[3]!).toBeCloseTo(1);
    w.w[0] = w.w[1] = w.w[2] = w.w[3] = 0;
    normalizeSkinW(w);
    expect(w.w[0]).toBe(1);
    w.w[0] = NaN;
    w.w[1] = 1;
    normalizeSkinW(w);
    expect(w.w[0]).toBe(0);
    expect(w.w[1]).toBe(1);
  });

  it('SkinBuilder places bone-local parts at the bone rest and writes normalized weights', () => {
    const rest = [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(0, 1, 0)];
    const sb = new SkinBuilder(rest);
    sb.on(1).box(0.1, 0.1, 0.1, 0xff0000);
    sb.blend(0, (_x, y, _z, o) => blend2(o, 0, 1, y)).box(0.1, 1, 0.1, 0x00ff00, { at: [0, 0.5, 0] });
    const g = sb.build();
    const pos = g.getAttribute('position');
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    expect(g.getAttribute('aInk')).toBeTruthy();
    // First part: all on bone 1, around y = 1.
    let minY = Infinity;
    for (let i = 0; i < 36; i++) {
      expect(si.getX(i)).toBe(1);
      expect(sw.getX(i)).toBe(1);
      minY = Math.min(minY, pos.getY(i));
    }
    expect(minY).toBeGreaterThan(0.9);
    for (let i = 0; i < sw.count; i++) {
      const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
      expect(s).toBeCloseTo(1, 5);
    }
  });
});

describe('build-time geometry helpers', () => {
  it('ring tubes: closed, open (per-ring V) and surface sampling', () => {
    const rings = [
      { y: 0, w: 0.2, d: 0.1 },
      { y: 1, w: 0.1, d: 0.05 },
    ];
    const g = ringTube(rings, 8, { closeBottom: true });
    expect(g.index!.count / 3).toBe(8 * 2 + 8);
    const r = ringAt(rings, 0.5);
    expect(r.w).toBeCloseTo(0.15);
    const p = tubePoint(rings, 0, 0.5);
    expect(p.pos[2]).toBeCloseTo(0.075);
    expect(p.n[2]).toBeGreaterThan(0.9);
    expect(sstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(starPoints(1).length).toBe(10);
    expect(vRingOpenCheck()).toBe(true);
  });

  it('lock geometry is a closed ribbon', () => {
    const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, -0.01), new THREE.Vector3(0, -0.2, 0)];
    const out = pts.map(() => new THREE.Vector3(0, 0, -1));
    const g = lockGeometry(pts, [0.02, 0.02, 0.01], [0.01, 0.01, 0.005], out, 6);
    expect(g.index!.count / 3).toBe(2 * 6 * 2 + 6 + 6);
  });
});
