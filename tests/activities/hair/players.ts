// Simulated players for pacing tests (not a test file itself).
import { Rng } from '../../../src/core/rng';
import { SMOOTH_T, applyStroke, guideRow, smoothness, type BrushSpec } from '../../../src/activities/hair/rules';

export interface PlayResult {
  strokes: number;
  snags: number;
  smooth: number;
}

/**
 * A normal player: starts each stroke at the "ends" guide band (the lowest section with knots, or high up once
 * everything below is fine), aims at visibly knotted locks most of the time (with hand jitter) and otherwise
 * sweeps across, strokes down at a comfortable ~1.4 v/s, sampled like 30 fps pointer moves.
 */
export interface PlayerSkill {
  /** Share of strokes aimed at the most knotted lock (the rest sweep across). */
  aim: number;
  /** Hand jitter in u. */
  jitter: number;
  /** Share of impatient strokes that start one section above the guide band. */
  impatient: number;
  /** Share of fast flicks (≈ 2.4–3 v/s). */
  flick: number;
}
export const HUMAN: PlayerSkill = { aim: 0.5, jitter: 0.06, impatient: 0.15, flick: 0.1 };
export const EXPERT: PlayerSkill = { aim: 0.8, jitter: 0.03, impatient: 0, flick: 0 };

export function guidedPlayer(
  field: Float32Array,
  cols: number,
  rows: number,
  brush: BrushSpec,
  rateMul: number,
  seed: number,
  skill: PlayerSkill = HUMAN,
  target = 0.95,
  cap = 200,
): PlayResult {
  const rng = new Rng(seed);
  let strokes = 0;
  let snags = 0;
  let sweep = 0;
  while (smoothness(field) < target && strokes < cap) {
    const band = guideRow(field, cols, rows);
    let v0 = band >= 0 ? band / rows + 0.01 + rng.range(0, 0.03) : rng.range(0.02, 0.08);
    if (band > 0 && rng.chance(skill.impatient)) v0 -= 1 / rows;
    const rowFrom = Math.max(0, band);
    let u: number;
    if (rng.chance(skill.aim)) {
      // Aim at the most knotted lock at or below where the stroke starts.
      let best = 0;
      let bestT = -1;
      for (let c = 0; c < cols; c++) {
        let t = 0;
        for (let r = rowFrom; r < rows; r++) t += field[r * cols + c]!;
        if (t > bestT) {
          bestT = t;
          best = c;
        }
      }
      u = (best + 0.5) / cols + rng.range(-skill.jitter, skill.jitter);
    } else {
      u = 0.1 + ((sweep++ * brush.width * 0.8) % 0.8);
    }
    u = Math.max(0.02, Math.min(0.98, u));
    const speed = rng.chance(skill.flick) ? rng.range(2.4, 3.0) : rng.range(1.0, 1.8);
    let v = v0;
    const step = speed / 30;
    let start = v0;
    let snagged = false;
    while (v < 0.985) {
      const nv = Math.min(0.99, v + step);
      const r = applyStroke(field, cols, rows, u, v, u, nv, 1 / 30, start, brush, rateMul);
      if (r.snag) {
        snagged = true;
        break;
      }
      v = nv;
      if (start > v) start = v;
    }
    strokes++;
    if (snagged) snags++;
    // After a sweep with nothing left to see, the player polishes: tiny leftovers are ignored by the eye,
    // so they brush from the top.
    if (band < 0 && smoothness(field) < target) {
      let any = false;
      for (let i = 0; i < field.length; i++) if (field[i]! > SMOOTH_T) any = true;
      if (!any) break;
    }
  }
  return { strokes, snags, smooth: smoothness(field) };
}
