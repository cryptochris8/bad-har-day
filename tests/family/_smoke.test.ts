import { describe, it, expect, vi } from 'vitest';
vi.mock('../../src/hair', async () => {
  const THREE = await import('three');
  return {
    createGirlHair: () => ({ root: new THREE.Group(), cols: 9, rows: 4, tangle: new Float32Array(36), commit() {}, setBedhead() {}, setShine() {}, setKnotMarkers() {}, setBrush() {}, snag() {}, proxy: new THREE.Mesh(), surfacePoint: (_u: number, _v: number, o: any) => o, surfaceNormal: (_u: number, _v: number, o: any) => o, update() {}, dispose() {} }),
    createBrush: () => ({}),
  };
});
import { createFamily, createExtra, DEFAULT_LOOKS } from '../../src/family';
import { countTriangles } from '../../src/render/models/builder';
describe('smoke', () => {
  it('builds', () => {
    const t0 = performance.now();
    const f = createFamily(DEFAULT_LOOKS);
    const t1 = performance.now();
    for (const c of f.members) { c.update(0.016); console.log(c.id, 'tris', countTriangles(c.root), 'h', c.height); }
    console.log('dog tris', countTriangles(f.dog.root));
    for (const c of f.members) c.setOutfit('day');
    const t2 = performance.now();
    for (const c of f.members) { c.update(0.016); console.log(c.id, 'day tris', countTriangles(c.root)); }
    console.log('build ms sleep', (t1 - t0).toFixed(0), 'day', (t2 - t1).toFixed(0));
    for (const k of ['crossingGuard', 'jogger', 'teacher', 'kid', 'neighbor'] as const) { const e = createExtra(k, 3); e.update(0.016); console.log(k, countTriangles(e.root)); }
    expect(true).toBe(true);
  });
});
