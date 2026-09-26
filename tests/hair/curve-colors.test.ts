import { describe, expect, it } from 'vitest';
import { hairPalette, fromHsl, lighten, luma, mix, shade, toHsl } from '../../src/hair/colors';
import { arcSamples, crPoint, crTangent } from '../../src/hair/curve';
import { HAIR_COLORS } from '../../src/render/palette';

describe('Catmull-Rom helpers', () => {
  const cps = [0, 0, 0, 1, 0.5, 0, 2, 0, 0.2, 3, -1, 0];
  it('passes through every control point', () => {
    const p = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      crPoint(cps, 0, 4, i, p, 0);
      expect(p[0]).toBeCloseTo(cps[i * 3]!, 6);
      expect(p[1]).toBeCloseTo(cps[i * 3 + 1]!, 6);
      expect(p[2]).toBeCloseTo(cps[i * 3 + 2]!, 6);
    }
  });
  it('tangent matches the finite difference', () => {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    const t = [0, 0, 0];
    for (const u of [0.3, 1.2, 2.7]) {
      crPoint(cps, 0, 4, u - 1e-4, a, 0);
      crPoint(cps, 0, 4, u + 1e-4, b, 0);
      crTangent(cps, 0, 4, u, t, 0);
      for (let k = 0; k < 3; k++) expect(t[k]!).toBeCloseTo((b[k]! - a[k]!) / 2e-4, 3);
    }
  });
  it('arcSamples spaces samples evenly by arc length', () => {
    const { t, s, length } = arcSamples(cps, 4, 7);
    expect(t[0]).toBe(0);
    expect(t[6]).toBe(3);
    const p = [0, 0, 0];
    const q = [0, 0, 0];
    for (let k = 1; k < 7; k++) {
      expect(s[k]! - s[k - 1]!).toBeCloseTo(length / 6, 5);
      expect(t[k]!).toBeGreaterThan(t[k - 1]!);
      crPoint(cps, 0, 4, t[k - 1]!, p, 0);
      crPoint(cps, 0, 4, t[k]!, q, 0);
      // Chord ≤ arc.
      expect(Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!)).toBeLessThanOrEqual(length / 6 + 1e-6);
    }
  });
});

describe('hair colours', () => {
  it('HSL round-trips', () => {
    for (const c of [0x6b3d24, 0xd9ad5f, 0x1b1616, 0xb9b6bd, 0xff0000, 0x00ff80]) {
      const [h, s, l] = toHsl(c);
      const back = fromHsl(h, s, l);
      for (const sh of [16, 8, 0]) expect(Math.abs(((back >> sh) & 255) - ((c >> sh) & 255))).toBeLessThanOrEqual(1);
    }
  });
  it('mix / shade / lighten behave', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(shade(0x808080, 0.5)).toBe(0x404040);
    expect(luma(lighten(0x6b3d24, 0.2))).toBeGreaterThan(luma(0x6b3d24));
  });
  it('derives darker roots/underside, lighter tips/sheen for every preset', () => {
    for (const { hex } of HAIR_COLORS) {
      const p = hairPalette(hex);
      expect(luma(p.root)).toBeLessThan(luma(p.mid));
      expect(luma(p.under)).toBeLessThan(luma(p.mid));
      expect(luma(p.tip)).toBeGreaterThanOrEqual(luma(p.mid) - 0.01);
      expect(luma(p.sheen)).toBeGreaterThan(luma(p.mid));
    }
  });
});
