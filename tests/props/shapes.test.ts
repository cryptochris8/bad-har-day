import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GeoBuilder, INK_BASE } from '../../src/render/models/builder';
import { PROP_INK, thinInk } from '../../src/props/base';
import { clampAmount } from '../../src/props/highlight';
import { slotFit, slotLayout, LUNCHBOX } from '../../src/props/lunchbox';
import {
  breadPts,
  circlePts,
  dropPts,
  heartPts,
  leafPts,
  maplePts,
  mergeLocal,
  pixelText,
  polygonPts,
  profileRadius,
  roundPoly,
  roundRectLathe,
  roundRectPts,
  scalePts,
  starPts,
  sweepGeometry,
  wrapAround,
  type P2,
} from '../../src/props/shapes';

const finite = (pts: readonly P2[]) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
const extent = (pts: readonly P2[]) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};

describe('sweepGeometry', () => {
  it('open tube: rings + capped ends, unit normals', () => {
    const g = sweepGeometry(
      [
        [0, 0, 0],
        [0.1, 0, 0],
        [0.2, 0.05, 0],
      ],
      0.01,
      6,
    );
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(3 * 6 + 2 * (6 + 1));
    expect(g.getIndex()!.count / 3).toBe(2 * 6 * 2 + 2 * 6);
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 4);
  });

  it('closed loop has no caps; ring normals point away from the path', () => {
    const path: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) path.push([Math.cos((i / 12) * Math.PI * 2) * 0.1, 0, Math.sin((i / 12) * Math.PI * 2) * 0.1]);
    const g = sweepGeometry(path, 0.02, 5, true);
    expect(g.getAttribute('position').count).toBe(12 * 5);
    // Triangle winding faces outward: face normal · (centroid − path point) > 0.
    const p = g.getAttribute('position');
    const idx = g.getIndex()!;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    let good = 0;
    for (let t = 0; t < idx.count; t += 3) {
      a.fromBufferAttribute(p, idx.getX(t));
      b.fromBufferAttribute(p, idx.getX(t + 1));
      c.fromBufferAttribute(p, idx.getX(t + 2));
      const fn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const cen = a.clone().add(b).add(c).divideScalar(3);
      const onPath = new THREE.Vector3(cen.x, 0, cen.z).setLength(0.1);
      if (fn.dot(cen.clone().sub(onPath)) > 0) good++;
    }
    expect(good).toBe(idx.count / 3);
  });

  it('flat squashes the cross-section', () => {
    const g = sweepGeometry(
      [
        [0, 0, 0],
        [0.2, 0, 0],
      ],
      0.02,
      8,
      false,
      0.25,
    );
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const ext = [bb.max.y - bb.min.y, bb.max.z - bb.min.z].sort((x, y) => x - y);
    expect(ext[0]!).toBeLessThan(ext[1]! * 0.4);
  });

  it('rejects degenerate paths', () => {
    expect(() => sweepGeometry([[0, 0, 0]], 0.01)).toThrow();
  });
});

describe('outlines', () => {
  it('rounded rectangle: 4(seg+1) points inside w × d', () => {
    const pts = roundRectPts(0.3, 0.2, 0.05, 3);
    expect(pts.length).toBe(16);
    const e = extent(pts);
    expect(e.maxX).toBeCloseTo(0.15, 6);
    expect(e.minY).toBeCloseTo(-0.1, 6);
  });

  it('bread, heart, star, polygon, drop, leaf, maple, circle are finite and sized', () => {
    for (const pts of [breadPts(0.15, 0.14), heartPts(0.04), starPts(0.02, 0.01), polygonPts(0.2), dropPts(0.02), leafPts(0.03, 0.01), maplePts(0.12), circlePts(0.01, 8)]) {
      expect(pts.length).toBeGreaterThan(4);
      expect(finite(pts)).toBe(true);
    }
    const b = extent(breadPts(0.15, 0.14));
    expect(b.minY).toBeCloseTo(0, 6);
    expect(b.maxX - b.minX).toBeGreaterThan(0.14);
    expect(b.maxX - b.minX).toBeLessThan(0.17);
    const h = extent(heartPts(0.04));
    expect(h.maxX - h.minX).toBeCloseTo(0.04, 3);
    const s = starPts(0.02, 0.01, 5);
    expect(s.length).toBe(10);
    s.forEach(([x, y], i) => expect(Math.hypot(x, y)).toBeCloseTo(i % 2 ? 0.01 : 0.02, 6));
    expect(polygonPts(0.2, 8).length).toBe(8);
    const d = extent(dropPts(0.02));
    expect(d.maxY).toBeCloseTo(0.02, 6);
    expect(d.minY).toBeGreaterThanOrEqual(-1e-9);
  });

  it('roundPoly adds seg + 1 points per corner; scalePts scales about a point', () => {
    const sq: P2[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(roundPoly(sq, 0.1, 2).length).toBe(12);
    expect(scalePts(sq, 2, 1, 1)[0]).toEqual([-1, -1]);
  });
});

describe('roundRectLathe', () => {
  it('outer walls face outward; inward flag flips them', () => {
    const check = (g: THREE.BufferGeometry) => {
      const p = g.getAttribute('position');
      const n = g.getAttribute('normal');
      let s = 0;
      for (let i = 0; i < p.count; i++) s += n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i);
      return s;
    };
    const wall = [
      [0, 0],
      [0, 0.05],
    ] as const;
    expect(check(roundRectLathe(0.3, 0.2, 0.04, wall))).toBeGreaterThan(0);
    expect(check(roundRectLathe(0.3, 0.2, 0.04, wall, 3, true))).toBeLessThan(0);
  });
});

describe('pixel text', () => {
  it('merges horizontal runs and centres the text', () => {
    const t = pixelText('T', 1);
    // T = one 3-wide bar + four 1-wide stems.
    expect(t.length).toBe(5);
    expect(t[0]!.w).toBe(3);
    expect(t[0]!.y).toBe(2);
    const stop = pixelText('STOP', 0.01);
    const xs = stop.flatMap((r) => [r.x - r.w / 2, r.x + r.w / 2]);
    expect(Math.min(...xs)).toBeCloseTo(-Math.max(...xs), 6);
    expect(pixelText('~', 1).length).toBe(0);
  });
});

describe('decal wrapping + profiles', () => {
  it('profileRadius interpolates and clamps', () => {
    const prof: P2[] = [
      [0.05, 0],
      [0.06, 0.1],
    ];
    expect(profileRadius(prof, 0.05)).toBeCloseTo(0.055, 6);
    expect(profileRadius(prof, -1)).toBe(0.05);
    expect(profileRadius(prof, 1)).toBe(0.06);
  });

  it('wrapAround maps x = 0 to the +Z front and preserves arc length', () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.05, 0, 0.05, 0.05, 0, 0, 0.06, 0.001], 3));
    const w = wrapAround(g, () => 0.05);
    const p = w.getAttribute('position');
    expect(p.getX(0)).toBeCloseTo(0, 6);
    expect(p.getZ(0)).toBeCloseTo(0.05, 6);
    const theta = Math.atan2(p.getX(1), p.getZ(1));
    expect(theta * 0.05).toBeCloseTo(0.05, 5);
    expect(Math.hypot(p.getX(2), p.getZ(2))).toBeCloseTo(0.051, 6);
  });

  it('mergeLocal applies each part transform', () => {
    const g = mergeLocal([[new THREE.BoxGeometry(0.1, 0.1, 0.1), [1, 2, 3]]]);
    g.computeBoundingBox();
    const c = g.boundingBox!.getCenter(new THREE.Vector3());
    expect(c.x).toBeCloseTo(1, 6);
    expect(c.y).toBeCloseTo(2, 6);
    expect(c.z).toBeCloseTo(3, 6);
  });
});

describe('prop ink + highlight helpers', () => {
  it('thinInk pulls hull vertices in to PROP_INK and leaves the body alone', () => {
    const b = new GeoBuilder(true, true);
    b.box(0.1, 0.1, 0.1, 0xffffff);
    const g = b.build();
    const before = (g.getAttribute('position').array as Float32Array).slice();
    thinInk(g);
    const pos = g.getAttribute('position');
    const ink = g.getAttribute('aInk');
    let hull = 0;
    for (let i = 0; i < pos.count; i++) {
      const ix = ink.getX(i);
      const iy = ink.getY(i);
      const iz = ink.getZ(i);
      if (ix === 0 && iy === 0 && iz === 0) {
        expect(pos.getX(i)).toBe(before[i * 3]);
        continue;
      }
      hull++;
      const d = (before[i * 3]! - pos.getX(i)) * ix + (before[i * 3 + 1]! - pos.getY(i)) * iy + (before[i * 3 + 2]! - pos.getZ(i)) * iz;
      expect(d).toBeCloseTo(INK_BASE - PROP_INK, 5);
    }
    expect(hull).toBeGreaterThan(0);
  });

  it('clampAmount', () => {
    expect(clampAmount(-1)).toBe(0);
    expect(clampAmount(0.4)).toBe(0.4);
    expect(clampAmount(9)).toBe(1);
    expect(clampAmount(Number.NaN)).toBe(0);
  });
});

describe('lunchbox layout + slot fitting (pure)', () => {
  it('four non-overlapping compartments inside the box', () => {
    const L = slotLayout();
    expect(L.length).toBe(4);
    for (const s of L) {
      expect(Math.abs(s.x) + s.size.w / 2).toBeLessThanOrEqual(LUNCHBOX.w / 2 - LUNCHBOX.wall + 1e-9);
      expect(Math.abs(s.z) + s.size.d / 2).toBeLessThanOrEqual(LUNCHBOX.d / 2 - LUNCHBOX.wall + 1e-9);
    }
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const a = L[i]!;
        const b = L[j]!;
        const overlapX = Math.abs(a.x - b.x) < (a.size.w + b.size.w) / 2 - 1e-9;
        const overlapZ = Math.abs(a.z - b.z) < (a.size.d + b.size.d) / 2 - 1e-9;
        expect(overlapX && overlapZ).toBe(false);
      }
  });

  it('slotFit keeps small items upright at full size and lays tall ones down', () => {
    const size = { w: 0.13, d: 0.09, h: 0.07 };
    expect(slotFit([0.05, 0.04, 0.05], size)).toEqual({ scale: 1, pose: 'up' });
    const tall = slotFit([0.07, 0.18, 0.045], size);
    expect(tall.pose).not.toBe('up');
    expect(tall.scale).toBeGreaterThan(0.5);
    const huge = slotFit([0.5, 0.5, 0.5], size);
    expect(huge.scale).toBeLessThan(0.3);
    expect(huge.scale).toBeGreaterThan(0);
  });
});
