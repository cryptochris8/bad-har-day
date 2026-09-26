import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { brushPoseOnHair, createGirlHair } from '../../src/hair';
import { buildAtlasPixels } from '../../src/hair/material';
import type { GirlHairRig } from '../../src/hair/rig';
import type { HairFit } from '../../src/hair/types';

const FIT: HairFit = { rx: 0.19, ry: 0.2, rz: 0.185, shoulderY: -0.2235, shoulderHalfWidth: 0.2123, backZ: -0.1257, neckY: -0.165 };
const make = (o: Partial<{ seed: number; cols: number; rows: number; length: number; color: number }> = {}) =>
  createGirlHair({ fit: FIT, color: o.color ?? 0x6b3d24, length: o.length ?? 0.55, seed: o.seed ?? 3, cols: o.cols, rows: o.rows }) as GirlHairRig;

/** Meshes the renderer would draw (visible object + visible material). */
function drawn(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverseVisible((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(Array.isArray(m.material) ? false : (m.material as THREE.Material).visible === false)) out.push(m);
  });
  return out;
}
const tris = (m: THREE.Mesh) => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;

describe('createGirlHair — contract basics', () => {
  it('defaults to a 9 × 4 field and supports 5 rows', () => {
    const r = make();
    expect(r.cols).toBe(9);
    expect(r.rows).toBe(4);
    expect(r.tangle.length).toBe(36);
    const r5 = make({ rows: 5 });
    expect(r5.rows).toBe(5);
    expect(r5.tangle.length).toBe(45);
  });

  it('stays within the budget: ≤ 5 k hair triangles, ≤ 3 draw calls (sprites included)', () => {
    for (const cols of [7, 9, 10, 14]) {
      for (let seed = 0; seed < 25; seed++) {
        const r = make({ seed, cols, rows: 5 });
        r.tangle.fill(0.8);
        r.commit();
        r.setKnotMarkers('inspect');
        r.setBedhead(1);
        r.update(0.016);
        const meshes = drawn(r.root);
        expect(meshes.length).toBeLessThanOrEqual(3);
        const hair = meshes.filter((m) => m !== r.spriteMesh).reduce((n, m) => n + tris(m), 0);
        expect(hair).toBeLessThanOrEqual(5000);
      }
    }
  });

  it('proxy uv IS hair space: covers [0, 1]² and is never drawn', () => {
    const r = make();
    const uv = r.proxy.geometry.getAttribute('uv');
    let minU = 1;
    let maxU = 0;
    let minV = 1;
    let maxV = 0;
    for (let i = 0; i < uv.count; i++) {
      minU = Math.min(minU, uv.getX(i));
      maxU = Math.max(maxU, uv.getX(i));
      minV = Math.min(minV, uv.getY(i));
      maxV = Math.max(maxV, uv.getY(i));
    }
    expect([minU, maxU, minV, maxV]).toEqual([0, 1, 0, 1]);
    expect((r.proxy.material as THREE.Material).visible).toBe(false);
    expect(r.proxy.parent).toBe(r.root);
  });
});

describe('surface ↔ proxy consistency', () => {
  const r = make();
  const head = new THREE.Group();
  head.position.set(0.4, 1.16, -0.3);
  head.rotation.y = Math.PI; // facing the mirror, like the bathroom
  head.add(r.root);
  head.updateMatrixWorld(true);
  r.update(0.016);
  const ray = new THREE.Raycaster();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  it('a pointer ray hitting the proxy returns the uv whose surfacePoint is the hit point', () => {
    const rng = new Rng(7);
    for (let k = 0; k < 40; k++) {
      const u = rng.range(0.1, 0.9);
      const v = rng.range(0.1, 0.95);
      r.surfacePoint(u, v, p);
      r.surfaceNormal(u, v, n);
      ray.set(p.clone().addScaledVector(n, 0.5), n.clone().negate());
      const hit = ray.intersectObject(r.proxy, false)[0];
      expect(hit).toBeTruthy();
      expect(hit!.uv!.x).toBeCloseTo(u, 2);
      expect(hit!.uv!.y).toBeCloseTo(v, 2);
      const back = r.surfacePoint(hit!.uv!.x, hit!.uv!.y, new THREE.Vector3());
      expect(back.distanceTo(hit!.point)).toBeLessThan(1e-4);
    }
  });

  it('normals are unit length and face away from the girl', () => {
    const local = new THREE.Vector3();
    for (let v = 0.35; v <= 0.95; v += 0.15) {
      r.surfaceNormal(0.5, v, n);
      expect(n.length()).toBeCloseTo(1, 5);
      // Head faces world −Z (yaw π) → her back faces world +Z.
      expect(n.z).toBeGreaterThan(0.3);
      r.surfacePointLocal(0.5, v, local);
      expect(local.z).toBeLessThan(FIT.backZ);
    }
  });

  it('the fall surface below the shoulders stays behind backZ (head space)', () => {
    const local = new THREE.Vector3();
    for (let u = 0; u <= 1; u += 0.1)
      for (let v = 0.6; v <= 1; v += 0.1) {
        r.surfacePointLocal(u, v, local);
        if (local.y < FIT.shoulderY) expect(local.z).toBeLessThan(FIT.backZ);
      }
  });

  it('places a brush on the hair (bristle tips at the surface, bristles pointing in)', () => {
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    brushPoseOnHair(r, 0.5, 0.6, pos, q);
    const into = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    r.surfaceNormal(0.5, 0.6, n);
    expect(into.dot(n)).toBeLessThan(-0.99);
    const head = new THREE.Vector3(0, 0.116, 0.028).applyQuaternion(q).add(pos);
    r.surfacePoint(0.5, 0.6, p);
    expect(head.distanceTo(p)).toBeLessThan(1e-3);
  });
});

describe('animation + stability', () => {
  it('committed tangles animate smoothly to their targets', () => {
    const r = make();
    r.tangle[5] = 0.9;
    r.tangle[20] = 0.4;
    r.commit();
    r.update(0.016);
    expect(r.displayTangle(5)).toBeGreaterThan(0);
    expect(r.displayTangle(5)).toBeLessThan(0.9);
    for (let f = 0; f < 120; f++) r.update(1 / 60);
    expect(r.displayTangle(5)).toBeCloseTo(0.9, 3);
    expect(r.displayTangle(20)).toBeCloseTo(0.4, 3);
  });

  it('commit sanitises values (NaN → 0, clamps to 0..1)', () => {
    const r = make();
    r.tangle[0] = Number.NaN;
    r.tangle[1] = 7;
    r.tangle[2] = -3;
    r.commit();
    for (let f = 0; f < 200; f++) r.update(1 / 60);
    expect(r.displayTangle(0)).toBe(0);
    expect(r.displayTangle(1)).toBeCloseTo(1, 3);
    expect(r.displayTangle(2)).toBe(0);
  });

  it('markers show on tangled cells only while enabled', () => {
    const r = make();
    r.setShine(0);
    r.setBedhead(0);
    for (let f = 0; f < 90; f++) r.update(1 / 60);
    expect(r.spriteMesh.visible).toBe(false);
    r.tangle[4] = 0.6;
    r.commit();
    r.setKnotMarkers('soft');
    for (let f = 0; f < 60; f++) r.update(1 / 60);
    expect(r.spriteMesh.visible).toBe(true);
    r.tangle.fill(0);
    r.commit();
    r.setKnotMarkers('off');
    for (let f = 0; f < 240; f++) r.update(1 / 60);
    expect(r.spriteMesh.visible).toBe(false);
  });

  it('survives dt spikes, teleports, spins, pauses and bad input without NaN', () => {
    const r = make({ seed: 11 });
    const head = new THREE.Group();
    head.add(r.root);
    const rng = new Rng(99);
    for (let f = 0; f < 400; f++) {
      if (rng.chance(0.05)) head.position.set(rng.range(-20, 20), 1, rng.range(-20, 20)); // teleport
      else head.position.x += rng.range(-0.08, 0.08);
      head.rotation.set(rng.range(-0.6, 0.6), head.rotation.y + rng.range(-0.8, 0.8), rng.range(-0.4, 0.4));
      if (f % 50 === 0) r.snag(rng.int(-2, 10), rng.int(-1, 5)); // incl. out of range
      r.setBrush(rng.chance(0.5) ? { u: rng.next(), v: rng.next(), pressure: rng.next(), width: 0.29, du: rng.range(-9, 9), dv: rng.chance(0.1) ? Number.NaN : rng.range(-9, 9) } : null);
      r.setBedhead(rng.next());
      const dt = rng.chance(0.08) ? rng.range(0.3, 5) : rng.chance(0.1) ? 0 : 1 / 60;
      r.update(dt);
    }
    expect(r.geo.pos.every((x) => Number.isFinite(x))).toBe(true);
    expect(r.geo.nrm.every((x) => Number.isFinite(x))).toBe(true);
    const p = r.surfacePoint(0.5, 0.5, new THREE.Vector3());
    expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  });

  it('dispose detaches the rig', () => {
    const r = make();
    const g = new THREE.Group();
    g.add(r.root);
    r.dispose();
    expect(r.root.parent).toBe(null);
    r.update(0.016); // harmless after dispose
  });
});

describe('sprite atlas', () => {
  it('is a 512 × 256 RGBA image with ink in every used cell', () => {
    const px = buildAtlasPixels();
    expect(px.length).toBe(512 * 256 * 4);
    const cellAlpha = (cx: number, cy: number) => {
      let s = 0;
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) s += px[((cy * 128 + y) * 512 + cx * 128 + x) * 4 + 3]!;
      return s;
    };
    for (const [cx, cy] of [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [0, 1],
      [1, 1],
    ] as const)
      expect(cellAlpha(cx, cy)).toBeGreaterThan(1000);
  });
});
