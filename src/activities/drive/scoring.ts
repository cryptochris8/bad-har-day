// ─────────────────────────────────────────────────────────────────────────────
// School-run clock pacing, arrival time and stars (pure, unit-tested).
//
// Act V starts at 7:50. Loading the car is a short cutscene (the clock creeps),
// then the clock runs at DRIVE_RATE while driving and HOLDS the moment the van
// stops in the drop-off bay — that minute is the morning's arrival time.
// Calibrated with DriveSim policies (tests/activities/drive/calibration.test.ts):
// a great drive (GAS, green light, polite honks) ≈ 7:57, an average one (no GAS,
// stops for everything) ≈ 8:01, and nothing can pass 8:05 (the act's clock cap).
// ─────────────────────────────────────────────────────────────────────────────
import { SCHOOL_DEADLINE, T } from '../../plan/types';
import type { DriveSummary } from './sim';

export const ACT5_START = T(7, 50);
/** Game minutes per real second while loading the car (cutscene). */
export const LOAD_RATE = 0.04;
/** Game minutes per real second while driving. */
export const DRIVE_RATE = 0.128;
/** Clock minute after which the drive wraps up (auto-gas, everything hurries). */
export const HURRY_AT = T(8, 3) + 0.5;
/** A skipped drive arrives here. */
export const SKIP_ARRIVAL = T(8, 1);

/** Arrival minute for a drive of `driveSeconds` after `loadSeconds` of loading (clamped to 8:05). */
export function arrivalFor(driveSeconds: number, loadSeconds: number, start = ACT5_START): number {
  const d = Number.isFinite(driveSeconds) ? Math.max(0, driveSeconds) : 0;
  const l = Number.isFinite(loadSeconds) ? Math.max(0, loadSeconds) : 0;
  return Math.min(SCHOOL_DEADLINE, start + l * LOAD_RATE + d * DRIVE_RATE);
}

/** 1 at ≤ 7:57 … 0.5 at 8:01 … 0 at 8:05. */
export function timeScore(arrival: number): number {
  const great = T(7, 57);
  const late = SCHOOL_DEADLINE;
  if (!Number.isFinite(arrival)) return 0.5;
  return Math.max(0, Math.min(1, (late - arrival) / (late - great)));
}

export function cleanScore(bumps: number): number {
  if (bumps <= 0) return 1;
  if (bumps === 1) return 0.55;
  if (bumps === 2) return 0.25;
  return 0;
}

export interface DriveScore {
  stars: 1 | 2 | 3;
  score: number;
  flags: string[];
}

/** Stars from stops obeyed + no bumps + arrival time (never 0), and the award flags. */
export function scoreDrive(sum: DriveSummary, arrival: number): DriveScore {
  const obey = sum.stopsTotal > 0 ? sum.stopsOk / sum.stopsTotal : 1;
  const clean = cleanScore(sum.bumps);
  const time = timeScore(arrival);
  const bonus = Math.min(0.06, sum.greens * 0.04 + sum.splashes * 0.01);
  const score = Math.max(0, Math.min(1, 0.35 * obey + 0.3 * clean + 0.35 * time + bonus));
  const stars: 1 | 2 | 3 = score >= 0.85 ? 3 : score >= 0.5 ? 2 : 1;
  const flags: string[] = [];
  if (sum.bumps === 0) flags.push('drive:clean');
  if (sum.guard === 'thanks') flags.push('drive:guard');
  if (sum.greens > 0) flags.push('drive:green');
  if (sum.splashes > 0) flags.push('drive:splash');
  if (sum.honked) flags.push('drive:honk');
  return { stars, score, flags };
}
