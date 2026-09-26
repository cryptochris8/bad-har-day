import { describe, expect, it } from 'vitest';
import { CONDITION_INFO, bedheadFor, initialTangle } from '../../../src/activities/hair/conditions';
import {
  APPROVE_T,
  BRUSH_SPECS,
  CLEAR_T,
  KNOT_T,
  SMOOTH_T,
  applyStroke,
  coverageFlat,
  displayPercent,
  guideRow,
  hairStars,
  isPerfect,
  momVerdict,
  selfBrush,
  smoothness,
  speedBand,
  type BrushSpec,
} from '../../../src/activities/hair/rules';
import { EXPERT, HUMAN, guidedPlayer, type PlayerSkill } from './players';
import type { HairCondition } from '../../../src/plan/types';

const COLS = 9;
const ROWS = 4;
const CONDITIONS: HairCondition[] = ['light', 'bedhead', 'sleepMess', 'pictureDay', 'rainy', 'extraLong'];
const mean = (f: ArrayLike<number>, r0 = 0, r1 = ROWS) => {
  let s = 0;
  for (let r = r0; r < r1; r++) for (let c = 0; c < COLS; c++) s += f[r * COLS + c]!;
  return s / ((r1 - r0) * COLS);
};

describe('hair conditions → starting tangle', () => {
  it('is deterministic per seed, bounded, and differs across seeds', () => {
    for (const c of CONDITIONS) {
      const a = initialTangle(c, 42, COLS, ROWS);
      const b = initialTangle(c, 42, COLS, ROWS);
      const d = initialTangle(c, 43, COLS, ROWS);
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(Array.from(a)).not.toEqual(Array.from(d));
      expect(a.length).toBe(COLS * ROWS);
      for (const v of a) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('matches each condition’s character (averaged over seeds)', () => {
    const avg = (c: HairCondition, r0 = 0, r1 = ROWS) => {
      let s = 0;
      for (let seed = 1; seed <= 40; seed++) s += mean(initialTangle(c, seed, COLS, ROWS), r0, r1);
      return s / 40;
    };
    expect(avg('light')).toBeLessThan(avg('bedhead'));
    expect(avg('light')).toBeLessThan(avg('sleepMess'));
    expect(avg('extraLong')).toBeGreaterThan(avg('light') + 0.2);
    expect(avg('pictureDay')).toBeLessThan(avg('sleepMess'));
    // Rainy: knots gather near the ends.
    expect(avg('rainy', ROWS - 1, ROWS)).toBeGreaterThan(avg('rainy', 0, 1) + 0.4);
    expect(avg('rainy', ROWS - 1, ROWS)).toBeGreaterThan(avg('light', ROWS - 1, ROWS));
  });

  it('supports extra rows (5) too', () => {
    const f = initialTangle('extraLong', 9, COLS, 5);
    expect(f.length).toBe(45);
  });

  it('bedhead eases with the mean tangle and is consistent with the condition', () => {
    expect(bedheadFor('bedhead', 0.5, 0.5)).toBeCloseTo(CONDITION_INFO.bedhead.bedhead, 6);
    expect(bedheadFor('bedhead', 0, 0.5)).toBe(0);
    expect(bedheadFor('bedhead', 0.25, 0.5)).toBeLessThan(bedheadFor('bedhead', 0.4, 0.5));
    expect(bedheadFor('light', 0.3, 0.2)).toBeLessThanOrEqual(CONDITION_INFO.light.bedhead);
    expect(CONDITION_INFO.extraLong.rate).toBeLessThan(1);
    expect(CONDITION_INFO.pictureDay.perfect).toBe(true);
  });
});

describe('stroke rules', () => {
  const blank = () => new Float32Array(COLS * ROWS);
  const N = BRUSH_SPECS.purple;
  const B = BRUSH_SPECS.black;
  const cu = (c: number) => (c + 0.5) / COLS;

  it('downward strokes detangle; upward and sideways do nothing', () => {
    const f = blank();
    f[3 * COLS + 4] = 0.8;
    const up = applyStroke(f, COLS, ROWS, cu(4), 0.95, cu(4), 0.8, 0.2, 0.95, N);
    expect(up.removed).toBe(0);
    const side = applyStroke(f, COLS, ROWS, cu(3), 0.9, cu(5), 0.9, 0.2, 0.9, N);
    expect(side.removed).toBe(0);
    expect(f[3 * COLS + 4]).toBeCloseTo(0.8, 6);
    const down = applyStroke(f, COLS, ROWS, cu(4), 0.76, cu(4), 0.99, 0.25, 0.76, N);
    expect(down.removed).toBeGreaterThan(0.2);
    expect(down.snag).toBe(null);
    expect(f[3 * COLS + 4]!).toBeLessThan(0.8);
  });

  it('works from the ends up: brushing down INTO a knotted section from above snags', () => {
    const f = blank();
    f[3 * COLS + 4] = 0.8; // knot at the ends
    const r = applyStroke(f, COLS, ROWS, cu(4), 0.55, cu(4), 0.9, 0.3, 0.55, N);
    expect(r.snag).toEqual({ col: 4, row: 3, reason: 'ends' });
    expect(r.endV).toBeCloseTo(0.75, 6);
    expect(f[3 * COLS + 4]).toBeCloseTo(0.8, 6); // the knot itself untouched
    // Starting inside the knotted section (the ends first) is fine.
    const ok = applyStroke(f, COLS, ROWS, cu(4), 0.77, cu(4), 0.98, 0.25, 0.77, N);
    expect(ok.snag).toBe(null);
    expect(ok.removed).toBeGreaterThan(0);
  });

  it('a section detangles slowly while the one below it is still knotted', () => {
    const gated = blank();
    gated[2 * COLS + 4] = 0.8;
    gated[3 * COLS + 4] = 0.8;
    const free = blank();
    free[2 * COLS + 4] = 0.8;
    const a = applyStroke(gated, COLS, ROWS, cu(4), 0.5, cu(4), 0.74, 0.2, 0.5, N);
    const b = applyStroke(free, COLS, ROWS, cu(4), 0.5, cu(4), 0.74, 0.2, 0.5, N);
    expect(a.snag).toBe(null);
    expect(a.removed).toBeGreaterThan(0);
    expect(a.removed).toBeLessThan(b.removed * 0.5);
  });

  it('too fast through a tangle snags (speed); the black brush tolerates more speed', () => {
    const mk = () => {
      const f = blank();
      f[3 * COLS + 4] = 0.7;
      return f;
    };
    const fast = (N.speedMax + B.speedMax) / 2; // between the two windows
    const dv = 0.2;
    const r1 = applyStroke(mk(), COLS, ROWS, cu(4), 0.77, cu(4), 0.77 + dv, dv / fast, 0.77, N);
    expect(r1.snag?.reason).toBe('speed');
    const r2 = applyStroke(mk(), COLS, ROWS, cu(4), 0.77, cu(4), 0.77 + dv, dv / fast, 0.77, B);
    expect(r2.snag).toBe(null);
    // Fast through smooth hair is fine.
    const r3 = applyStroke(blank(), COLS, ROWS, cu(4), 0.1, cu(4), 0.9, 0.05, 0.1, N);
    expect(r3.snag).toBe(null);
    expect(speedBand(fast, N)).toBe('fast');
    expect(speedBand(1.2, N)).toBe('good');
    expect(speedBand(0.1, N)).toBe('slow');
  });

  it('the black brush is wider and faster', () => {
    expect(B.width / N.width).toBeCloseTo(1.3, 1);
    expect(B.rate).toBeCloseTo(1.3, 5);
    expect(B.speedMax).toBeGreaterThan(N.speedMax);
    // Deep knots (the rate matters) brushed between two locks (the width matters).
    const a = blank().fill(0.95);
    const b = blank().fill(0.95);
    const u = 0.5 + 0.5 / COLS;
    const ra = applyStroke(a, COLS, ROWS, u, 0.76, u, 0.99, 0.3, 0.76, N);
    const rb = applyStroke(b, COLS, ROWS, u, 0.76, u, 0.99, 0.3, 0.76, B);
    expect(rb.removed).toBeGreaterThan(ra.removed * 1.3);
  });

  it('reports cleared sections and knot releases', () => {
    const f = blank();
    f[3 * COLS + 4] = 0.2;
    const r = applyStroke(f, COLS, ROWS, cu(4), 0.76, cu(4), 0.99, 0.3, 0.76, N);
    expect(r.cleared).toContain(3 * COLS + 4);
    expect(f[3 * COLS + 4]!).toBeLessThanOrEqual(SMOOTH_T);
    expect(r.releases).toBeGreaterThanOrEqual(0);
  });

  it('thresholds are ordered sensibly', () => {
    expect(SMOOTH_T).toBeLessThan(CLEAR_T);
    expect(CLEAR_T).toBeLessThanOrEqual(KNOT_T);
  });
});

const avgStrokes = (cond: HairCondition, brush: BrushSpec, skill: PlayerSkill, n = 30) => {
  let t = 0;
  let fails = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = guidedPlayer(initialTangle(cond, seed * 17, COLS, ROWS), COLS, ROWS, brush, CONDITION_INFO[cond].rate, seed, skill);
    t += r.strokes;
    if (r.smooth < 0.95) fails++;
  }
  return { avg: t / n, fails };
};

describe('pacing (simulated players)', () => {
  it('a normal player reaches 95 % on normal hair with a regular brush in ~20–32 strokes (QA target 25–35 in play)', () => {
    for (const cond of ['bedhead', 'sleepMess'] as const) {
      const r = avgStrokes(cond, BRUSH_SPECS.purple, HUMAN);
      expect(r.fails).toBe(0);
      expect(r.avg).toBeGreaterThan(16);
      expect(r.avg).toBeLessThan(32);
    }
    // Light tangles are quick; extra-long hair takes the longest.
    expect(avgStrokes('light', BRUSH_SPECS.purple, HUMAN).avg).toBeLessThan(avgStrokes('bedhead', BRUSH_SPECS.purple, HUMAN).avg);
    expect(avgStrokes('extraLong', BRUSH_SPECS.purple, HUMAN).avg).toBeGreaterThan(avgStrokes('bedhead', BRUSH_SPECS.purple, HUMAN).avg);
  });

  it('the black brush needs noticeably fewer strokes', () => {
    for (const cond of ['bedhead', 'sleepMess', 'extraLong'] as const) {
      expect(avgStrokes(cond, BRUSH_SPECS.black, HUMAN).avg).toBeLessThan(avgStrokes(cond, BRUSH_SPECS.teal, HUMAN).avg * 0.85);
    }
  });

  it('an expert who follows the guide never snags', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = guidedPlayer(initialTangle('rainy', seed, COLS, ROWS), COLS, ROWS, BRUSH_SPECS.purple, 1, seed, EXPERT);
      expect(r.snags).toBe(0);
      expect(r.smooth).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('brushing from the scalp through knots snags (the game teaches ends-first)', () => {
    const f = initialTangle('rainy', 3, COLS, ROWS);
    const r = applyStroke(f, COLS, ROWS, 0.5, 0.02, 0.5, 0.98, 0.7, 0.02, BRUSH_SPECS.purple);
    expect(r.snag?.reason).toBe('ends');
  });

  it('100 % is reachable: careful strokes brush every section out completely', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const f = initialTangle('pictureDay', seed, COLS, ROWS);
      const r = guidedPlayer(f, COLS, ROWS, BRUSH_SPECS.purple, 1, seed, EXPERT, 0.999, 120);
      // A few polishing passes top to bottom finish whatever is left.
      for (let pass = 0; pass < 3 && !isPerfect(f); pass++)
        for (let c = 0; c < COLS; c++) applyStroke(f, COLS, ROWS, (c + 0.5) / COLS, 0.01, (c + 0.5) / COLS, 0.99, 0.7, 0.01, BRUSH_SPECS.purple);
      expect(isPerfect(f)).toBe(true);
      expect(displayPercent(f)).toBe(100);
      expect(r.strokes).toBeLessThan(120);
    }
  });
});

describe('guides + display', () => {
  it('guide row = the lowest section that still has a real knot', () => {
    const f = new Float32Array(COLS * ROWS);
    expect(guideRow(f, COLS, ROWS)).toBe(-1);
    f[1 * COLS + 2] = 0.5;
    expect(guideRow(f, COLS, ROWS)).toBe(1);
    f[3 * COLS + 7] = KNOT_T + 0.01;
    expect(guideRow(f, COLS, ROWS)).toBe(3);
    f[3 * COLS + 7] = KNOT_T - 0.01;
    expect(guideRow(f, COLS, ROWS)).toBe(1);
  });

  it('percent shows 100 only when every section is brushed out', () => {
    const f = new Float32Array(COLS * ROWS).fill(0.001);
    expect(displayPercent(f)).toBe(100);
    f[5] = 0.04;
    expect(isPerfect(f)).toBe(false);
    expect(displayPercent(f)).toBe(99);
    f.fill(0.3);
    expect(displayPercent(f)).toBe(70);
  });

  it('flat brush coverage: full under the paddle, fading over half a column', () => {
    expect(coverageFlat(0, 0.11, 9)).toBe(1);
    expect(coverageFlat(0.11, 0.11, 9)).toBe(1);
    expect(coverageFlat(0.11 + 0.5 / 9 / 2, 0.11, 9)).toBeCloseTo(0.5, 6);
    expect(coverageFlat(0.2, 0.11, 9)).toBe(0);
    expect(coverageFlat(-0.05, 0.11, 9)).toBe(1);
  });
});

describe('self-brushing', () => {
  it('works ends-first and never overshoots', () => {
    const f = new Float32Array(COLS * ROWS).fill(0.5);
    const i = selfBrush(f, COLS, ROWS, 0.5, 0.2);
    expect(Math.floor(i / COLS)).toBe(ROWS - 1);
    expect(f[i]!).toBeCloseTo(0.4, 6);
    for (let k = 0; k < 10000; k++) selfBrush(f, COLS, ROWS, 0.1, 0.2);
    for (const v of f) expect(v).toBeGreaterThanOrEqual(0);
    expect(smoothness(f)).toBeCloseTo(1, 6);
    expect(selfBrush(f, COLS, ROWS, 0.1, 0.2)).toBe(-1);
    expect(selfBrush(f, COLS, ROWS, 0, 0.2)).toBe(-1);
  });
});

describe('Mom + scoring', () => {
  it('approves at ≥ 95 % smooth, otherwise finishes it lovingly', () => {
    expect(momVerdict(APPROVE_T)).toBe('approved');
    expect(momVerdict(Math.fround(APPROVE_T))).toBe('approved');
    expect(momVerdict(0.99)).toBe('approved');
    expect(momVerdict(0.94)).toBe('finish');
    expect(momVerdict(0)).toBe('finish');
  });

  it('stars: never 0, rewards smoothness, solo approvals and finishing early', () => {
    expect(hairStars({ smooth: [0.98, 0.97, 0.96], solo: 3, early: true })).toBe(3);
    expect(hairStars({ smooth: [0.97, 0.96, 0.8], solo: 2, early: true })).toBe(3);
    expect(hairStars({ smooth: [0.96, 0.75, 0.72], solo: 1, early: false })).toBe(2);
    expect(hairStars({ smooth: [0.5, 0.4, 0.6], solo: 0, early: false })).toBe(1);
    expect(hairStars({ smooth: [], solo: 0, early: false })).toBe(1);
    expect(hairStars({ smooth: [0, 0, 0], solo: 0, early: false })).toBe(1);
  });
});

describe("QA's sweep pattern (shots/qa2/s-hair-mouse.mjs)", () => {
  it('reaches 95 % in ~20–38 strokes with a regular brush (was 50–70)', () => {
    const us = [0.12, 0.3, 0.5, 0.7, 0.88];
    for (const cond of ['light', 'bedhead', 'sleepMess'] as const) {
      let tot = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const f = initialTangle(cond, seed * 13, COLS, ROWS);
        let n = 0;
        let done = false;
        for (let cycle = 0; cycle < 4 && !done; cycle++)
          for (const vs of [0.75, 0.5, 0.25, 0.02]) {
            if (done) break;
            for (let rep = 0; rep < 2 && !done; rep++)
              for (const u of us) {
                const dur = 0.9 + (1 - vs) * 0.9;
                for (let i = 0; i < 10; i++) {
                  const r = applyStroke(f, COLS, ROWS, u, vs + ((0.99 - vs) * i) / 10, u, vs + ((0.99 - vs) * (i + 1)) / 10, dur / 10, vs, BRUSH_SPECS.purple);
                  if (r.snag) break;
                }
                n++;
                if (smoothness(f) >= 0.95) {
                  done = true;
                  break;
                }
              }
          }
        expect(done).toBe(true);
        tot += n;
      }
      const avg = tot / 12;
      expect(avg).toBeGreaterThan(18);
      expect(avg).toBeLessThan(38);
    }
  });
});
