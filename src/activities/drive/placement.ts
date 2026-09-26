// ─────────────────────────────────────────────────────────────────────────────
// Where each of the morning's drive events happens along the route (pure).
// Keeps the DayPlan order, spreads events evenly, snaps the crossing guard to a
// crosswalk and green lights to a traffic light, keeps free-standing events
// (ball, jogger, truck, puddle, sprinkler) away from cross streets / crosswalks.
// ─────────────────────────────────────────────────────────────────────────────
import type { DriveEvent } from '../../plan/types';

export interface RouteFeatures {
  readonly crosswalks: readonly number[];
  /** Traffic-light stop lines (s). */
  readonly lights: readonly number[];
  /** Cross-street centres (s) — free events keep clear of them. */
  readonly intersections: readonly number[];
  /** Placement window for events. */
  readonly s0: number;
  readonly s1: number;
  /** The crossing guard may also use a school crossing up to here. */
  readonly guardMax: number;
}

export interface Placed {
  kind: DriveEvent;
  s: number;
  /** Index into `lights` for greenLights, else −1. */
  light: number;
  /** Index into `crosswalks` when snapped to one, else −1. */
  crosswalk: number;
}

interface Cand {
  s: number;
  light: number;
  crosswalk: number;
}

const FREE_STEP = 5;

function candidates(kind: DriveEvent, f: RouteFeatures): Cand[] {
  const out: Cand[] = [];
  if (kind === 'crossingGuard') {
    f.crosswalks.forEach((s, i) => {
      if (s >= f.s0 && s <= f.guardMax) out.push({ s, light: -1, crosswalk: i });
    });
    return out;
  }
  if (kind === 'greenLights') {
    f.lights.forEach((s, i) => {
      if (s >= f.s0 - 20 && s <= f.s1 + 20) out.push({ s, light: i, crosswalk: -1 });
    });
    return out;
  }
  if (kind === 'geese')
    f.crosswalks.forEach((s, i) => {
      if (s >= f.s0 && s <= f.s1) out.push({ s, light: -1, crosswalk: i });
    });
  for (let s = f.s0; s <= f.s1 + 1e-6; s += FREE_STEP) {
    if (f.intersections.some((c) => Math.abs(s - c) < 24)) continue;
    if (f.lights.some((c) => Math.abs(s - c) < 26)) continue;
    if (f.crosswalks.some((c) => Math.abs(s - c) < 12)) continue;
    out.push({ s, light: -1, crosswalk: -1 });
  }
  return out;
}

/**
 * Place `events` (in order) along the route. Deterministic; never throws. Minimises the squared distance to
 * evenly spaced targets subject to increasing positions at least `gap` metres apart (relaxed if impossible).
 */
export function placeEvents(events: readonly DriveEvent[], f: RouteFeatures): Placed[] {
  const n = events.length;
  if (n === 0) return [];
  const cands = events.map((k) => candidates(k, f));
  const span = f.s1 - f.s0;
  const target = (i: number) => (n === 1 ? f.s0 + span / 2 : f.s0 + 8 + ((span - 16) * i) / (n - 1));
  for (const gap of [60, 50, 40, 30, 20, 10, 0]) {
    const res = solve(cands, target, gap);
    if (res)
      return res.map((c, i) => ({ kind: events[i]!, s: c.s, light: c.light, crosswalk: c.crosswalk }));
  }
  // Fallback (only when an event has no candidate at all): evenly spaced, no features.
  return events.map((kind, i) => ({ kind, s: target(i), light: -1, crosswalk: -1 }));
}

function solve(cands: Cand[][], target: (i: number) => number, gap: number): Cand[] | null {
  const n = cands.length;
  // dp[i][j] = best cost with event i at candidate j; prev[i][j] = index at i−1.
  const dp: number[][] = [];
  const prev: number[][] = [];
  for (let i = 0; i < n; i++) {
    const ci = cands[i]!;
    const row = new Array<number>(ci.length).fill(Number.POSITIVE_INFINITY);
    const back = new Array<number>(ci.length).fill(-1);
    for (let j = 0; j < ci.length; j++) {
      const c = ci[j]!;
      const d = c.s - target(i);
      const cost = d * d;
      if (i === 0) {
        row[j] = cost;
        continue;
      }
      const pc = cands[i - 1]!;
      const pr = dp[i - 1]!;
      for (let k = 0; k < pc.length; k++) {
        if (pc[k]!.s + gap > c.s || pc[k]!.s >= c.s) continue;
        const v = pr[k]! + cost;
        if (v < row[j]!) {
          row[j] = v;
          back[j] = k;
        }
      }
    }
    dp.push(row);
    prev.push(back);
  }
  const last = dp[n - 1]!;
  let bj = -1;
  for (let j = 0; j < last.length; j++) if (Number.isFinite(last[j]!) && (bj < 0 || last[j]! < last[bj]!)) bj = j;
  if (bj < 0) return null;
  const out: Cand[] = new Array<Cand>(n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = cands[i]![bj]!;
    bj = prev[i]![bj]!;
  }
  return out;
}
