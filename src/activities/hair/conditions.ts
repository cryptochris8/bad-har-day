// ─────────────────────────────────────────────────────────────────────────────
// Hair conditions → the girl's starting tangle field (pure, seeded).
// docs/GDD.md §6.2: Light tangles · Big bedhead · Sleep-mess · Picture day! (needs 100 %) ·
// Rainy-day frizz (knots near the ends) · Extra-long brushing morning (more knots, a bit slower).
// The field is cols × rows (row 0 = crown … last row = the ends); index = row * cols + col.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hashInts } from '../../core/rng';
import type { HairCondition } from '../../plan/types';

export interface ConditionInfo {
  /** Bedhead at the start of Act III (the dollhouse read of "hasn't brushed yet"). */
  bedhead: number;
  /** Detangle speed multiplier (extra-long hair is a little slower). */
  rate: number;
  /** Needs a perfect 100 % for the special sparkle moment. */
  perfect: boolean;
  /** Short hint shown on her portrait. */
  tag: string;
}

export const CONDITION_INFO: Readonly<Record<HairCondition, ConditionInfo>> = {
  light: { bedhead: 0.5, rate: 1, perfect: false, tag: 'Light tangles' },
  bedhead: { bedhead: 1, rate: 1, perfect: false, tag: 'Big bedhead' },
  sleepMess: { bedhead: 0.85, rate: 1, perfect: false, tag: 'Sleep-mess' },
  pictureDay: { bedhead: 0.6, rate: 1, perfect: true, tag: 'Picture day!' },
  rainy: { bedhead: 0.7, rate: 0.95, perfect: false, tag: 'Rainy-day frizz' },
  extraLong: { bedhead: 0.75, rate: 0.8, perfect: false, tag: 'Extra-long hair' },
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Starting tangle for a condition. Deterministic per (condition, seed, cols, rows); values in [0, 1].
 * `depth` 0 = crown … 1 = the ends.
 */
export function initialTangle(condition: HairCondition, seed: number, cols: number, rows: number): Float32Array {
  const rng = new Rng(hashInts(seed, 0x4a17, cols, rows));
  const out = new Float32Array(cols * rows);
  // A couple of "knot centres" per head make tangles clump like real sleep-mess.
  const hot = [rng.int(0, cols - 1), rng.int(0, cols - 1), rng.int(0, cols - 1)];
  for (let r = 0; r < rows; r++) {
    const depth = rows > 1 ? r / (rows - 1) : 1;
    for (let c = 0; c < cols; c++) {
      const near = Math.min(...hot.map((h) => Math.abs(h - c)));
      const clump = near === 0 ? 0.18 : near === 1 ? 0.08 : 0;
      let v: number;
      switch (condition) {
        case 'light':
          v = rng.chance(0.35 + 0.25 * depth) ? rng.range(0.15, 0.45) + clump * 0.5 : rng.range(0, 0.1);
          break;
        case 'bedhead':
          v = rng.range(0.2, 0.55) + clump + 0.08 * (1 - depth);
          break;
        case 'sleepMess':
          v = rng.range(0.3, 0.65) + clump + 0.1 * Math.sin(Math.PI * depth);
          break;
        case 'pictureDay':
          v = rng.chance(0.55) ? rng.range(0.2, 0.5) + clump * 0.6 : rng.range(0.03, 0.15);
          break;
        case 'rainy':
          v = depth > 0.7 ? rng.range(0.6, 0.95) + clump : depth > 0.4 ? rng.range(0.3, 0.6) + clump * 0.5 : rng.range(0.05, 0.3);
          break;
        case 'extraLong':
          v = rng.range(0.35, 0.7) + clump + 0.1 * depth;
          break;
      }
      out[r * cols + c] = clamp01(v);
    }
  }
  return out;
}

/** Bedhead that eases with brushing: full at the starting mess, 0 when smooth. */
export function bedheadFor(condition: HairCondition, meanTangle: number, startMean: number): number {
  const base = CONDITION_INFO[condition].bedhead;
  if (startMean <= 1e-6) return 0;
  return clamp01(base * Math.min(1, meanTangle / startMean) ** 0.8);
}
