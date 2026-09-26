import { describe, expect, it } from 'vitest';
import { crPoint } from '../../src/hair/curve';
import { buildLayout, capOffset, CAP_NS, hairlinePhi, thetaOfU } from '../../src/hair/layout';
import type { HairFit } from '../../src/hair/types';

// Fits: the family spec's twin / Heidi (hairFitFor), the family stub, and a small-headed mannequin.
const FITS: Record<string, HairFit> = {
  twin: { rx: 0.19, ry: 0.2, rz: 0.185, shoulderY: -0.2235, shoulderHalfWidth: 0.2123, backZ: -0.1257, neckY: -0.165 },
  heidi: { rx: 0.19, ry: 0.182, rz: 0.18, shoulderY: -0.1979, shoulderHalfWidth: 0.1932, backZ: -0.1257, neckY: -0.15 },
  stub: { rx: 0.17, ry: 0.17, rz: 0.17, shoulderY: -0.28, shoulderHalfWidth: 0.2, backZ: -0.15, neckY: -0.15 },
  small: { rx: 0.165, ry: 0.175, rz: 0.16, shoulderY: -0.25, shoulderHalfWidth: 0.19, backZ: -0.11, neckY: -0.14 },
};

const P = [0, 0, 0];

describe('layout determinism', () => {
  it('is identical for the same seed and differs for another seed', () => {
    const a = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 42 });
    const b = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 42 });
    const c = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 43 });
    expect(a.outer.length).toBe(b.outer.length);
    for (let i = 0; i < a.outer.length; i++) {
      expect(Array.from(a.outer[i]!.rest0)).toEqual(Array.from(b.outer[i]!.rest0));
      expect(Array.from(a.outer[i]!.halfW0)).toEqual(Array.from(b.outer[i]!.halfW0));
    }
    expect(Array.from(a.cap.pos0)).toEqual(Array.from(b.cap.pos0));
    expect(a.partX).toBe(b.partX);
    const differs = a.outer.some((l, i) => l.rest0.some((v, k) => v !== c.outer[i]!.rest0[k]));
    expect(differs).toBe(true);
  });
});

describe.each(Object.entries(FITS))('layout invariants (%s)', (_name, fit) => {
  for (const seed of [1, 7, 99]) {
    const L = buildLayout({ fit, length: 0.55, seed });

    it(`one outer lock per column, u ascending and centred (seed ${seed})`, () => {
      expect(L.outer.length).toBe(9);
      L.outer.forEach((l, i) => expect(l.u).toBeCloseTo((i + 0.5) / 9, 9));
      // u 0 sits on head-space +X (screen-left from behind), u 1 on −X.
      expect(Math.sin(thetaOfU(0))).toBeGreaterThan(0.9);
      expect(Math.sin(thetaOfU(1))).toBeLessThan(-0.9);
      expect(Math.cos(thetaOfU(0.5))).toBeCloseTo(-1, 6);
    });

    it(`hanging hair stays behind backZ below the shoulders (seed ${seed})`, () => {
      for (const l of L.outer) {
        for (const rest of [l.rest0, l.rest1]) {
          for (let k = l.pinned - 1; k < l.cp; k++) {
            const y = rest[k * 3 + 1]!;
            const z = rest[k * 3 + 2]!;
            if (y < fit.shoulderY) expect(z).toBeLessThan(fit.backZ);
          }
          // Densely along the curve too (rings between nodes).
          for (let t = l.pinned - 1; t <= l.cp - 1; t += 0.1) {
            crPoint(rest, 0, l.cp, t, P, 0);
            if (P[1]! < fit.shoulderY) expect(P[2]!).toBeLessThan(fit.backZ);
          }
        }
      }
    });

    it(`neighbouring locks overlap along the fall (no gaps from behind) (seed ${seed})`, () => {
      const pa = [0, 0, 0];
      const pb = [0, 0, 0];
      for (let i = 0; i < L.outer.length - 1; i++) {
        const A = L.outer[i]!;
        const B = L.outer[i + 1]!;
        for (let r = 1; r < A.rings - 2; r++) {
          crPoint(A.rest0, 0, A.cp, A.ringT[r]!, pa, 0);
          crPoint(B.rest0, 0, B.cp, B.ringT[r]!, pb, 0);
          const d = Math.hypot(pa[0]! - pb[0]!, pa[1]! - pb[1]!, pa[2]! - pb[2]!);
          expect(A.halfW0[r]! + B.halfW0[r]!).toBeGreaterThan(d * 0.98);
        }
      }
      // And an under lock sits in every seam.
      expect(L.under.length).toBe(L.outer.length - 1);
    });

    it(`lock rings run root → tip with increasing v in [0, 1) (seed ${seed})`, () => {
      for (const l of [...L.outer, ...L.front, ...L.bangs, ...L.tufts]) {
        expect(l.ringV[0]).toBe(0);
        for (let r = 1; r < l.rings; r++) expect(l.ringV[r]!).toBeGreaterThan(l.ringV[r - 1]!);
        expect(l.ringV[l.rings - 1]!).toBeLessThan(1);
        for (let r = 0; r < l.rings; r++) {
          expect(l.halfW0[r]!).toBeGreaterThan(0);
          expect(l.halfD0[r]!).toBeGreaterThan(0);
          const o = l.out0;
          expect(Math.hypot(o[r * 3]!, o[r * 3 + 1]!, o[r * 3 + 2]!)).toBeCloseTo(1, 5);
        }
      }
    });

    it(`tips land around crown − length (seed ${seed})`, () => {
      for (const l of L.outer) {
        const tipY = l.rest0[(l.cp - 1) * 3 + 1]!;
        expect(tipY).toBeGreaterThan(fit.ry - 0.55 - 0.06);
        expect(tipY).toBeLessThan(fit.ry - 0.55 + 0.08);
      }
    });

    it(`bangs stay above the brows; face-framing locks stay beside the face (seed ${seed})`, () => {
      for (const b of L.bangs) for (let k = 0; k < b.cp; k++) expect(b.rest0[k * 3 + 1]!).toBeGreaterThan(fit.ry * 0.35);
      for (const f of L.front) {
        for (let k = 0; k < f.cp; k++) {
          const x = f.rest0[k * 3]!;
          const y = f.rest0[k * 3 + 1]!;
          const z = f.rest0[k * 3 + 2]!;
          // In the face zone (front half, between chin and forehead) the lock must be out at the cheeks.
          if (z > 0 && y > -fit.ry * 0.8 && y < fit.ry * 0.6) expect(Math.abs(x)).toBeGreaterThan(fit.rx * 0.8);
        }
      }
    });
  }
});

describe('scalp cap', () => {
  it('stays within 0.035 m of the head (neat)', () => {
    for (let s = 0; s <= 1; s += 0.05) for (let dz = -1; dz <= 1; dz += 0.1) expect(capOffset(s, dz, 0)).toBeLessThanOrEqual(0.035);
    const L = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 3 });
    const f = FITS.twin!;
    for (let i = 0; i < L.cap.count; i++) {
      const x = L.cap.pos0[i * 3]!;
      const y = L.cap.pos0[i * 3 + 1]!;
      const z = L.cap.pos0[i * 3 + 2]!;
      const e = Math.hypot(x / f.rx, y / f.ry, z / f.rz);
      expect(e).toBeGreaterThanOrEqual(1);
      expect((e - 1) * Math.min(f.rx, f.ry, f.rz)).toBeLessThanOrEqual(0.036);
    }
  });

  it('poofs out with bedhead', () => {
    expect(capOffset(0.3, 0, 1)).toBeGreaterThan(capOffset(0.3, 0, 0) + 0.01);
  });

  it('hairline frames the face: high at the forehead, down over the ears, low at the nape', () => {
    for (let t = -0.8; t <= 0.8; t += 0.1) expect(hairlinePhi(t)).toBeLessThan(1.3);
    expect(hairlinePhi(Math.PI / 2)).toBeGreaterThan(1.7);
    expect(hairlinePhi(-Math.PI / 2)).toBeGreaterThan(1.7);
    expect(hairlinePhi(Math.PI)).toBeGreaterThan(2.1);
    expect(hairlinePhi(0.3)).toBeCloseTo(hairlinePhi(-0.3), 9);
  });

  it('has the expected ring structure', () => {
    const L = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 3 });
    expect(L.cap.count).toBe(1 + L.cap.nt * CAP_NS);
    expect(L.cap.s[0]).toBe(0);
    expect(L.cap.s[L.cap.count - 1]).toBe(1);
  });
});

describe('field resolution', () => {
  it('follows cols (clamped to 7..10 visual locks) and keeps rows', () => {
    expect(buildLayout({ fit: FITS.twin!, length: 0.55, seed: 1, cols: 10, rows: 5 }).outer.length).toBe(10);
    expect(buildLayout({ fit: FITS.twin!, length: 0.55, seed: 1, cols: 14, rows: 5 }).outer.length).toBe(10);
    const L = buildLayout({ fit: FITS.twin!, length: 0.55, seed: 1, cols: 4, rows: 5 });
    expect(L.outer.length).toBe(7);
    expect(L.cols).toBe(4);
    expect(L.rows).toBe(5);
  });
});
