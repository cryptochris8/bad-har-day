// ─────────────────────────────────────────────────────────────────────────────
// Dishes — PURE rules: which dish goes where (plates/bowls/pan → bottom rack, cups/glasses/sippy → top rack,
// cutlery → basket), the seeded queue (some sticky ones need a rinse), streaks, rack slot layout, stars.
// ─────────────────────────────────────────────────────────────────────────────
import type { DishKind } from '../../props/types';
import { shuffled, starsFrom, type Dir } from '../station/logic';

export type DishZone = 'bottom' | 'top' | 'basket';

export const ZONE_OF: Readonly<Record<DishKind, DishZone>> = {
  plate: 'bottom',
  bowl: 'bottom',
  pan: 'bottom',
  cup: 'top',
  glass: 'top',
  sippy: 'top',
  fork: 'basket',
  spoon: 'basket',
  butterKnife: 'basket',
};

/** Direction → zone: LEFT = bottom rack, UP = top rack, RIGHT = basket (down = nothing). */
export function zoneForDir(d: Dir | null): DishZone | null {
  return d === 'left' ? 'bottom' : d === 'up' ? 'top' : d === 'right' ? 'basket' : null;
}

export const ZONE_LABEL: Readonly<Record<DishZone, string>> = { bottom: 'BOTTOM RACK', top: 'TOP RACK', basket: 'BASKET' };
export const ZONE_SUB: Readonly<Record<DishZone, string>> = { bottom: 'plates · bowls · pans', top: 'cups · glasses', basket: 'cutlery' };

const NAME: Readonly<Record<DishKind, string>> = {
  plate: 'Plates',
  bowl: 'Bowls',
  pan: 'Pans',
  cup: 'Cups',
  glass: 'Glasses',
  sippy: 'Sippy cups',
  fork: 'Forks',
  spoon: 'Spoons',
  butterKnife: 'Knives',
};

/** The gentle wrong-zone hint ("Cups go on top!"). */
export function wrongHint(kind: DishKind): string {
  const z = ZONE_OF[kind];
  const n = NAME[kind];
  return z === 'top' ? `${n} go on top!` : z === 'bottom' ? `${n} go in the bottom rack!` : `${n} go in the basket!`;
}

export interface DishSpec {
  kind: DishKind;
  dirty: boolean;
  /** Index into the accent colour list the activity passes to makeDish. */
  color: number;
}

/**
 * The seeded queue: 9–12 dishes (a proper family breakfast worth), mixed so each zone gets used, about a
 * third sticky (at least two), never three of one zone in a row at the start.
 */
export function buildQueue(next: () => number, colors = 4): DishSpec[] {
  const n = 9 + Math.floor(next() * 4);
  const bottom: DishKind[] = ['plate', 'plate', 'bowl', 'plate', 'bowl', 'pan'];
  const top: DishKind[] = ['cup', 'glass', 'sippy', 'cup', 'glass'];
  const basket: DishKind[] = ['fork', 'spoon', 'butterKnife', 'spoon', 'fork'];
  const counts = { bottom: Math.round(n * 0.38), top: Math.round(n * 0.3), basket: 0 };
  counts.basket = n - counts.bottom - counts.top;
  const pool: DishKind[] = [...shuffled(bottom, next).slice(0, counts.bottom), ...shuffled(top, next).slice(0, counts.top), ...shuffled(basket, next).slice(0, counts.basket)];
  let order = shuffled(pool, next);
  // Start with variety: the first three dishes span at least two zones.
  for (let tries = 0; tries < 8 && order.length >= 3 && ZONE_OF[order[0]!] === ZONE_OF[order[1]!] && ZONE_OF[order[1]!] === ZONE_OF[order[2]!]; tries++) order = shuffled(order, next);
  const dirtyTarget = Math.max(2, Math.round(n * 0.33));
  const dirtyIdx = new Set(shuffled([...order.keys()].filter((i) => i > 0), next).slice(0, dirtyTarget));
  return order.map((kind, i) => ({ kind, dirty: dirtyIdx.has(i), color: Math.floor(next() * Math.max(1, colors)) }));
}

/** Streak / accuracy book-keeping. */
export class DishTally {
  correct = 0;
  mistakes = 0;
  streak = 0;
  best = 0;
  rinses = 0;

  record(ok: boolean): void {
    if (ok) {
      this.correct++;
      this.streak++;
      if (this.streak > this.best) this.best = this.streak;
    } else {
      this.mistakes++;
      this.streak = 0;
    }
  }

  get accuracy(): number {
    const t = this.correct + this.mistakes;
    return t === 0 ? 1 : this.correct / t;
  }
}

/** Rising clink pitch with the streak (capped). */
export const clinkPitch = (streak: number): number => Math.min(1.6, 1 + Math.max(0, streak - 1) * 0.06);

/** Accuracy + streak + time → stars (never 0). */
export function dishesStars(t: DishTally, dishes: number, seconds: number): 1 | 2 | 3 {
  const acc = t.accuracy >= 0.95 ? 1 : t.accuracy >= 0.75 ? 0.5 : 0;
  const streakGoal = Math.max(4, Math.ceil(dishes * 0.75));
  const streak = t.best >= streakGoal ? 1 : t.best >= Math.ceil(dishes * 0.4) ? 0.5 : 0;
  const par = dishes * 2.6 + t.rinses * 1.2 + 6;
  const time = seconds <= par ? 1 : seconds <= par * 1.6 ? 0.5 : 0;
  return starsFrom(acc + streak + time, 2.5, 1.25);
}

/**
 * Neat slots inside a rack (rack-local metres; the rack's centre is (0,0), +Z toward the front).
 * bottom: plates stand upright in rows at the back/left (the basket lives at the front-right corner);
 * top: cups/glasses upside-down in a grid; basket: cutlery standing, slightly fanned.
 * Returns position + a simple orientation code.
 */
export function rackSlot(zone: DishZone, index: number, kind: DishKind): { x: number; z: number; pose: 'upright' | 'flat' | 'inverted' | 'standing' | 'tilted' } {
  if (zone === 'top') {
    const col = index % 4;
    const row = Math.floor(index / 4) % 3;
    return { x: -0.18 + col * 0.12, z: -0.14 + row * 0.13, pose: 'inverted' };
  }
  if (zone === 'basket') {
    const k = index % 6;
    return { x: -0.035 + (k % 3) * 0.035, z: -0.025 + Math.floor(k / 3) * 0.05, pose: 'standing' };
  }
  // The pan stands at the back-right (handle up); plates/bowls stand in a row down the left side, front → back
  // (the cutlery basket owns the front-right corner).
  if (kind === 'pan') return { x: 0.1, z: -0.15, pose: 'tilted' };
  const row = index % 6;
  return { x: -0.1, z: 0.17 - row * 0.075, pose: kind === 'bowl' ? 'tilted' : 'upright' };
}
