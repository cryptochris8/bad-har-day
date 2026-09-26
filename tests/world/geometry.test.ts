import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { splitGeometry } from '../../src/world/split';
import { lampSegment } from '../../src/world/lamps';
import { CUT_S, segAttribute } from '../../src/world/cutMaterial';
import { CUT_BASE, CUT_H, LAMPS, WALLS, WALL_H, solidPieces, wallRect } from '../../src/world/layout';

describe('splitGeometry', () => {
  it('buckets triangles by centroid and keeps every attribute', () => {
    const g = new THREE.BufferGeometry();
    // two triangles: one at x < 0, one at x > 0
    g.setAttribute('position', new THREE.Float32BufferAttribute([-2, 0, 0, -1, 0, 0, -1.5, 1, 0, 1, 0, 0, 2, 0, 0, 1.5, 1, 0], 3));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute([1, 1, 1, 2, 2, 2], 1));
    const parts = splitGeometry(g, 2, (x) => (x < 0 ? 0 : 1));
    expect(parts).toHaveLength(2);
    expect(parts[0]!.getAttribute('position').count).toBe(3);
    expect(parts[1]!.getAttribute('aSeg').getX(0)).toBe(2);
    expect(parts[0]!.boundingSphere).not.toBeNull();
  });
  it('drops empty buckets', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(splitGeometry(g, 3, () => 2)).toHaveLength(1);
  });
});

describe('cut-away geometry helpers', () => {
  it('squash factor maps the wall top to the cut height', () => {
    expect(CUT_BASE + (WALL_H - CUT_BASE) * CUT_S).toBeCloseTo(CUT_H, 6);
  });
  it('ink hull vertices inherit their face segment', () => {
    // 3 body vertices (role 5) followed by 3 hull vertices (role −1)
    const a = segAttribute([5, 5, 5, -1, -1, -1, 0, 0, 0]);
    expect(Array.from(a.array)).toEqual([5, 5, 5, 5, 5, 5, 0, 0, 0]);
  });
  it('wall rects have the wall thickness and pieces cover the run minus openings', () => {
    for (const w of WALLS) {
      const pieces = solidPieces(w, true);
      const covered = pieces.reduce((s, [a, b]) => s + (b - a), 0);
      const holes = w.openings.reduce((s, o) => s + (o.b - o.a), 0);
      expect(covered + holes).toBeCloseTo(w.b - w.a, 6);
      const r = wallRect(w, w.a, w.b);
      expect(Math.min(r.x1 - r.x0, r.z1 - r.z0)).toBeCloseTo(w.t, 6);
    }
  });
  it('wall-mounted lamps know their wall (so their glow drops with it)', () => {
    const vanityBar = LAMPS.find((l) => Math.abs(l.x - 0.9) < 0.01 && l.y > 2)!;
    expect(lampSegment(vanityBar)).toBeGreaterThan(0);
    const floorLamp = LAMPS.find((l) => Math.abs(l.x - 0.78) < 0.01)!;
    expect(lampSegment(floorLamp)).toBe(0);
  });
});
