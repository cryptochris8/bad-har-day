// ─────────────────────────────────────────────────────────────────────────────
// Brushing rules (pure, no three.js) — docs/GDD.md §6.2 / §6.3.
//   • Downward strokes through a section smooth it; upward motion does nothing.
//   • Work from the ends up: a section detangles well only when the section below it on the same lock is
//     already mostly clear, and brushing DOWN INTO a still-knotted section from above snags (a soft "boing").
//   • Controlled speed: going too fast through a tangled section snags too.
//   • THE BLACK BRUSH: ~1.3× wider, ~30 % faster, a larger good-speed window.
// Hair space: u across (0..1), v scalp → tips (0..1). Field index = row * cols + col.
// ─────────────────────────────────────────────────────────────────────────────
import type { BrushKind } from '../../hair/types';
import { sweepCells } from '../../hair/space';

export interface BrushSpec {
  /** Brush width in u (the BrushContact width). */
  width: number;
  /** Detangle speed multiplier. */
  rate: number;
  /** Fastest downward speed (v units / s) that's still "gentle" through a tangle. */
  speedMax: number;
  /** Self-brushing speed multiplier (unfocused girls). */
  self: number;
}

export const BRUSH_SPECS: Readonly<Record<BrushKind, BrushSpec>> = {
  black: { width: 0.29, rate: 1.3, speedMax: 3.1, self: 1.6 },
  purple: { width: 0.22, rate: 1, speedMax: 2.2, self: 1 },
  pink: { width: 0.22, rate: 1, speedMax: 2.2, self: 1 },
  teal: { width: 0.22, rate: 1, speedMax: 2.2, self: 1 },
};

/** A section at or above this entered from above catches the brush. */
export const KNOT_T = 0.35;
/** "Mostly clear": the section above it can be brushed at full speed. */
export const CLEAR_T = 0.3;
/** Speed only matters through sections at least this tangled. */
export const SPEED_T = 0.3;
/** At or below this a section counts as smooth (sparkle + chime). */
export const SMOOTH_T = 0.06;
/** Detangle per unit v travelled through a section (× brush rate × coverage). */
export const DETANGLE_RATE = 2.4;
/** Share of the normal rate when the section below is still knotted. */
export const GATED = 0.25;
/** Self-brushing (unfocused girls): tangle removed per second (× the brush's `self`). */
export const SELF_RATE = 0.07;
/** Mom approves at this smoothness (GDD §6.3). */
export const APPROVE_T = 0.95;

export type SnagReason = 'ends' | 'speed';

export interface StrokeResult {
  /** Total tangle removed. */
  removed: number;
  /** Where the brush caught (null = no snag). */
  snag: { col: number; row: number; reason: SnagReason } | null;
  /** v where the stroke effectively ended (the snag point, or v1). */
  endV: number;
  /** Cells that just became smooth. */
  cleared: number[];
  /** Knot "releases" (a cell crossing a quarter step) — little detangle pops. */
  releases: number;
  /** Stroke speed (v / s). */
  speed: number;
}

/**
 * Apply one pointer movement of a pressed brush from (u0, v0) to (u1, v1) over `dt` seconds.
 * `strokeStartV` = where this continuous stroke began (pointer down or after a snag), for the ends-up rule.
 * Mutates `field`. Upward / sideways-only movement does nothing.
 */
export function applyStroke(
  field: Float32Array,
  cols: number,
  rows: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  dt: number,
  strokeStartV: number,
  brush: BrushSpec,
  rateMul = 1,
): StrokeResult {
  const res: StrokeResult = { removed: 0, snag: null, endV: v1, cleared: [], releases: 0, speed: 0 };
  const dv = v1 - v0;
  if (!(dv > 1e-5) || !(dt > 0)) {
    res.endV = v1;
    return res;
  }
  const speed = Math.hypot(dv, (u1 - u0) * 0.5) / dt;
  res.speed = speed;
  // Rows top → bottom (sweepCells visits rows in ascending order); stop at the first snag.
  let snagRow = rows;
  sweepCells(u0, v0, u1, v1, brush.width / 2, cols, rows, (col, row, coverage) => {
    if (row > snagRow) return;
    const i = row * cols + col;
    const t = field[i]!;
    if (t <= 0) return;
    const top = row / rows;
    const bot = (row + 1) / rows;
    const central = coverage > 0.45;
    if (central && t >= KNOT_T && strokeStartV < top - 1e-6 && v1 > top) {
      // Brushed down into a still-knotted section from above.
      if (!res.snag || row < res.snag.row) res.snag = { col, row, reason: 'ends' };
      snagRow = row;
      return;
    }
    if (central && t >= SPEED_T && speed > brush.speedMax) {
      if (!res.snag || row < res.snag.row) res.snag = { col, row, reason: 'speed' };
      snagRow = row;
      return;
    }
    const dvIn = Math.max(0, Math.min(v1, bot) - Math.max(v0, top));
    if (dvIn <= 0) return;
    const below = row < rows - 1 ? field[(row + 1) * cols + col]! : 0;
    const gate = below <= CLEAR_T ? 1 : GATED;
    const amount = DETANGLE_RATE * brush.rate * rateMul * coverage * dvIn * gate;
    const nt = Math.max(0, t - amount);
    if (Math.floor(t * 4) > Math.floor(nt * 4 + 1e-9)) res.releases++;
    if (t > SMOOTH_T && nt <= SMOOTH_T) res.cleared.push(i);
    res.removed += t - nt;
    field[i] = nt;
  });
  if (res.snag) {
    // Cells above the snag were brushed fine; the brush stops at the knot's top edge.
    res.endV = Math.max(v0, res.snag.row / rows);
  }
  return res;
}

/**
 * Self-brushing (an unfocused girl): she works ends-first — the most tangled cell of the lowest row that
 * still has knots. Returns the index she worked on (−1 = nothing left).
 */
export function selfBrush(field: Float32Array, cols: number, rows: number, dt: number, rate: number): number {
  if (!(dt > 0) || !(rate > 0)) return -1;
  for (let r = rows - 1; r >= 0; r--) {
    let best = -1;
    let bestT = SMOOTH_T;
    for (let c = 0; c < cols; c++) {
      const t = field[r * cols + c]!;
      if (t > bestT) {
        bestT = t;
        best = r * cols + c;
      }
    }
    if (best >= 0) {
      field[best] = Math.max(0, field[best]! - rate * dt);
      return best;
    }
  }
  // Everything is ≤ SMOOTH_T: polish the last bits.
  let best = -1;
  for (let i = 0; i < field.length; i++) if (field[i]! > 0 && (best < 0 || field[i]! > field[best]!)) best = i;
  if (best >= 0) field[best] = Math.max(0, field[best]! - rate * dt);
  return best;
}

/** Smoothness 0..1 (1 − mean tangle). */
export function smoothness(field: ArrayLike<number>): number {
  if (field.length === 0) return 1;
  let s = 0;
  for (let i = 0; i < field.length; i++) s += Math.max(0, Math.min(1, field[i]!));
  return 1 - s / field.length;
}

/** Mom's verdict for one girl. */
export function momVerdict(smooth: number): 'approved' | 'finish' {
  return smooth >= APPROVE_T - 1e-9 ? 'approved' : 'finish';
}

/** Stroke speed feedback for the brush trail colour. */
export function speedBand(speed: number, brush: BrushSpec): 'slow' | 'good' | 'fast' {
  if (speed > brush.speedMax) return 'fast';
  if (speed < 0.25) return 'slow';
  return 'good';
}

export interface ScoreInput {
  /** Each girl's own smoothness when Mom inspected (before any Mom finishing). */
  smooth: readonly number[];
  /** Girls Mom approved without help. */
  solo: number;
  /** Mom arrived because everyone was done (not because the clock ran out). */
  early: boolean;
}

/** 1..3 stars from mean smoothness, solo approvals and time. Never 0. */
export function hairStars(s: ScoreInput): 1 | 2 | 3 {
  const n = Math.max(1, s.smooth.length);
  const mean = s.smooth.reduce((a, b) => a + Math.max(0, Math.min(1, b)), 0) / n;
  const score = 0.55 * mean + 0.3 * (Math.max(0, Math.min(n, s.solo)) / n) + (s.early ? 0.15 : 0);
  return score >= 0.8 ? 3 : score >= 0.5 ? 2 : 1;
}
