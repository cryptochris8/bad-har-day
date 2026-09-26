import { describe, expect, it } from 'vitest';
import {
  brushFalloffU,
  brushFalloffV,
  brushPartPush,
  cellAt,
  cellCenter,
  cellIndex,
  colOf,
  fieldMax,
  fieldMean,
  rowOf,
  sampleBilinear,
  sampleLock,
  smoothFraction,
  snagEnvelope,
  sweepCells,
} from '../../src/hair/space';

describe('hair space ↔ cells', () => {
  it('maps u/v to columns/rows with the documented half-open ranges', () => {
    expect(colOf(0, 9)).toBe(0);
    expect(colOf(0.1111, 9)).toBe(0);
    expect(colOf(1 / 9, 9)).toBe(1);
    expect(colOf(0.999, 9)).toBe(8);
    expect(colOf(1, 9)).toBe(8); // u = 1 belongs to the last column
    expect(rowOf(0, 4)).toBe(0);
    expect(rowOf(0.25, 4)).toBe(1);
    expect(rowOf(1, 4)).toBe(3);
  });

  it('clamps out-of-range coordinates', () => {
    expect(colOf(-0.3, 9)).toBe(0);
    expect(colOf(1.7, 9)).toBe(8);
    expect(rowOf(-1, 5)).toBe(0);
    expect(rowOf(2, 5)).toBe(4);
  });

  it('indexes cells row-major (row * cols + col)', () => {
    expect(cellIndex(3, 2, 9)).toBe(21);
    expect(cellAt(0.5, 0.6, 9, 4)).toBe(2 * 9 + 4);
    expect(cellAt(1, 1, 9, 4)).toBe(35);
  });

  it('round-trips every cell centre', () => {
    const out = { u: 0, v: 0 };
    for (const [cols, rows] of [
      [9, 4],
      [9, 5],
      [12, 4],
    ] as const) {
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          cellCenter(c, r, cols, rows, out);
          expect(cellAt(out.u, out.v, cols, rows)).toBe(cellIndex(c, r, cols));
        }
    }
  });
});

describe('field sampling', () => {
  const cols = 3;
  const rows = 4;
  const f = new Float32Array(cols * rows);
  // column 1: 0, 0.4, 0.8, 1 down the rows
  f[1] = 0;
  f[4] = 0.4;
  f[7] = 0.8;
  f[10] = 1;

  it('sampleLock returns the exact cell value at section centres', () => {
    const u = 0.5;
    for (let r = 0; r < rows; r++) expect(sampleLock(f, cols, rows, u, (r + 0.5) / rows)).toBeCloseTo(f[r * cols + 1]!, 6);
  });

  it('sampleLock uses the exact column (no bleed across locks)', () => {
    expect(sampleLock(f, cols, rows, 0.1, 0.9)).toBe(0);
    expect(sampleLock(f, cols, rows, 0.9, 0.9)).toBe(0);
  });

  it('sampleLock is monotone between row centres and clamps at the ends', () => {
    let prev = -1;
    for (let v = 0; v <= 1; v += 0.01) {
      const s = sampleLock(f, cols, rows, 0.5, v);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = s;
    }
    expect(sampleLock(f, cols, rows, 0.5, 0)).toBe(0);
    expect(sampleLock(f, cols, rows, 0.5, 1)).toBe(1);
  });

  it('sampleBilinear interpolates both axes and hits cell centres exactly', () => {
    expect(sampleBilinear(f, cols, rows, 0.5, 0.625)).toBeCloseTo(0.8, 6);
    const mid = sampleBilinear(f, cols, rows, 1 / 3, 0.625); // between col 0 and col 1 centres
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.8);
  });

  it('mean / max / smooth fraction', () => {
    expect(fieldMean(f)).toBeCloseTo((0.4 + 0.8 + 1) / 12, 6);
    expect(fieldMax(f)).toBe(1);
    expect(smoothFraction(f, 0.15)).toBeCloseTo(9 / 12, 6);
    expect(fieldMean(new Float32Array(0))).toBe(0);
    expect(smoothFraction(new Float32Array(0))).toBe(1);
  });
});

describe('stroke sweeps', () => {
  it('visits the cells a downward stroke crosses, once each, with coverage in (0, 1]', () => {
    const seen = new Map<number, number>();
    const n = sweepCells(0.5, 0.05, 0.5, 0.95, 0.11, 9, 4, (c, r, cov) => {
      const k = r * 9 + c;
      expect(seen.has(k)).toBe(false);
      expect(cov).toBeGreaterThan(0);
      expect(cov).toBeLessThanOrEqual(1);
      seen.set(k, cov);
    });
    expect(n).toBe(seen.size);
    for (let r = 0; r < 4; r++) expect(seen.has(r * 9 + 4)).toBe(true); // the centre column, every row
    expect(seen.get(4)).toBeCloseTo(1, 6); // dead centre of the brush
    // Neighbouring columns are touched (brush ≈ 2 columns wide) but less centrally.
    expect(seen.get(3)! < 1 && seen.get(5)! < 1).toBe(true);
    // Far columns untouched.
    expect(seen.has(0)).toBe(false);
    expect(seen.has(8)).toBe(false);
  });

  it('only visits rows between the stroke ends', () => {
    const rows = new Set<number>();
    sweepCells(0.3, 0.55, 0.32, 0.7, 0.05, 9, 4, (_c, r) => rows.add(r));
    expect([...rows].sort()).toEqual([2]);
  });

  it('follows a diagonal stroke', () => {
    const cols = new Map<number, number>();
    sweepCells(0.05, 0.1, 0.95, 0.9, 0.02, 9, 4, (c, r) => cols.set(r, c));
    expect(cols.get(0)!).toBeLessThan(cols.get(3)!);
  });
});

describe('brush influence falloff', () => {
  it('U: 1 at the centre, 0 at/after the edge, symmetric and monotone', () => {
    expect(brushFalloffU(0, 0.11)).toBe(1);
    expect(brushFalloffU(0.11, 0.11)).toBe(0);
    expect(brushFalloffU(0.3, 0.11)).toBe(0);
    expect(brushFalloffU(-0.05, 0.11)).toBeCloseTo(brushFalloffU(0.05, 0.11), 9);
    let prev = 2;
    for (let d = 0; d <= 0.12; d += 0.005) {
      const w = brushFalloffU(d, 0.11);
      expect(w).toBeLessThanOrEqual(prev);
      expect(w).toBeGreaterThanOrEqual(0);
      prev = w;
    }
    expect(brushFalloffU(0, 0)).toBe(0);
  });

  it('V: trails further below the brush (combing down) than above', () => {
    expect(brushFalloffV(0)).toBe(1);
    expect(brushFalloffV(0.1)).toBeGreaterThan(brushFalloffV(-0.1));
    expect(brushFalloffV(-0.07)).toBe(0);
    expect(brushFalloffV(0.16)).toBe(0);
    expect(brushFalloffV(0.08)).toBeGreaterThan(0);
  });

  it('part push is zero at the centre, pushes away from it, fades far out', () => {
    expect(brushPartPush(0, 0.1)).toBeCloseTo(0, 9);
    expect(brushPartPush(0.12, 0.1)).toBeGreaterThan(0);
    expect(brushPartPush(-0.12, 0.1)).toBeLessThan(0);
    expect(Math.abs(brushPartPush(0.12, 0.1))).toBeGreaterThan(Math.abs(brushPartPush(0.03, 0.1)));
    expect(brushPartPush(0.3, 0.1)).toBe(0);
    expect(brushPartPush(0.1, 0)).toBe(0);
  });

  it('snag envelope decays to zero', () => {
    expect(snagEnvelope(0)).toBe(1);
    expect(snagEnvelope(0.2)).toBeGreaterThan(snagEnvelope(0.4));
    expect(snagEnvelope(0.6)).toBe(0);
    expect(snagEnvelope(-1)).toBe(0);
  });
});
