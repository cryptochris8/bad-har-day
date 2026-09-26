// ─────────────────────────────────────────────────────────────────────────────
// Lunch — PURE rules: the seeded food spread (every favourite included), the counter layout (grouped by
// category), packing (one main / snack / drink / fruit per box + an optional love note), stars, and the
// auto-pack used when the clock runs out or the chore is skipped. Every food is fine — favourites add a heart.
// ─────────────────────────────────────────────────────────────────────────────
import { GIRLS, type GirlId } from '../../family/types';
import { FOOD_CATEGORY, type FoodKind, type LunchCategory } from '../../props/types';
import { shuffled, starsFrom } from '../station/logic';

export const CATS: readonly LunchCategory[] = ['main', 'snack', 'drink', 'fruit'];

export const FOODS_BY_CAT: Readonly<Record<LunchCategory, readonly FoodKind[]>> = (() => {
  const out: Record<LunchCategory, FoodKind[]> = { main: [], snack: [], drink: [], fruit: [] };
  for (const k of Object.keys(FOOD_CATEGORY) as FoodKind[]) {
    const c = FOOD_CATEGORY[k];
    if (c !== 'extra') out[c].push(k);
  }
  return out;
})();

export const isFood = (k: FoodKind): boolean => FOOD_CATEGORY[k] !== 'extra';

export interface Spread {
  /** Foods on the counter (13–14, 3–4 per category, every girl's favourite included). */
  foods: FoodKind[];
  /** Love notes (1–2). */
  notes: number;
}

/** The seeded spread for this morning. */
export function buildSpread(next: () => number, favorites: Partial<Record<GirlId, FoodKind>>): Spread {
  const total = next() < 0.5 ? 13 : 14;
  const fours = shuffled(CATS, next).slice(0, total - 12);
  const foods: FoodKind[] = [];
  for (const cat of CATS) {
    const want = fours.includes(cat) ? 4 : 3;
    const picked: FoodKind[] = [];
    for (const g of GIRLS) {
      const f = favorites[g];
      if (f && FOOD_CATEGORY[f] === cat) picked.push(f);
    }
    const pool = shuffled(FOODS_BY_CAT[cat], next);
    for (const k of pool) if (picked.length < want && !picked.includes(k)) picked.push(k);
    // Small categories (3 drinks) repeat a kind when they need a 4th.
    let i = 0;
    while (picked.length < want && pool.length) picked.push(pool[i++ % pool.length]!);
    foods.push(...picked.slice(0, Math.max(want, picked.length)));
  }
  return { foods, notes: next() < 0.5 ? 1 : 2 };
}

export interface Cell {
  kind: FoodKind;
  /** 0..7 left → right (two columns per category: main, snack, drink, fruit). */
  col: number;
  /** 0 = back row, 1 = front row. */
  row: number;
}

/**
 * Counter layout: two columns per category (main | snack | drink | fruit), taller items in the back row so
 * nothing hides behind a juice box; love notes fill the free front cells.
 */
export function spreadCells(spread: Spread, heightOf: (k: FoodKind) => number): Cell[] {
  const cells: Cell[] = [];
  const free: { col: number; row: number }[] = [];
  CATS.forEach((cat, ci) => {
    const items = spread.foods.filter((k) => FOOD_CATEGORY[k] === cat).sort((a, b) => heightOf(b) - heightOf(a));
    const spots = [
      { col: ci * 2, row: 0 },
      { col: ci * 2 + 1, row: 0 },
      { col: ci * 2, row: 1 },
      { col: ci * 2 + 1, row: 1 },
    ];
    items.forEach((kind, i) => {
      const s = spots[i];
      if (s) cells.push({ kind, col: s.col, row: s.row });
      else free.push({ col: -1, row: -1 });
    });
    for (let i = items.length; i < spots.length; i++) free.push(spots[i]!);
  });
  const open = free.filter((f) => f.col >= 0).sort((a, b) => b.row - a.row || a.col - b.col);
  for (let n = 0; n < spread.notes && n < open.length; n++) cells.push({ kind: 'loveNote', col: open[n]!.col, row: open[n]!.row });
  return cells;
}

// ── packing ──────────────────────────────────────────────────────────────────

export interface Box {
  main: FoodKind | null;
  snack: FoodKind | null;
  drink: FoodKind | null;
  fruit: FoodKind | null;
  note: boolean;
}

export type Packing = Record<GirlId, Box>;

export function newPacking(): Packing {
  const mk = (): Box => ({ main: null, snack: null, drink: null, fruit: null, note: false });
  return { addy: mk(), ellie: mk(), heidi: mk() };
}

export type PlaceResult = 'placed' | 'full' | 'note' | 'noteFull';

/** Put a food (or a love note) into a girl's box. Mutates `p`. */
export function place(p: Packing, girl: GirlId, kind: FoodKind): PlaceResult {
  const box = p[girl];
  const cat = FOOD_CATEGORY[kind];
  if (cat === 'extra') {
    if (box.note) return 'noteFull';
    box.note = true;
    return 'note';
  }
  if (box[cat] !== null) return 'full';
  box[cat] = kind;
  return 'placed';
}

export const boxDone = (b: Box): boolean => b.main !== null && b.snack !== null && b.drink !== null && b.fruit !== null;
export const allDone = (p: Packing): boolean => GIRLS.every((g) => boxDone(p[g]));
export const packedCount = (b: Box): number => CATS.reduce((n, c) => n + (b[c] !== null ? 1 : 0), 0);

/** Which girls got their favourite in their own box. */
export function favoritesPacked(p: Packing, favorites: Partial<Record<GirlId, FoodKind>>): Record<GirlId, boolean> {
  const out = { addy: false, ellie: false, heidi: false } as Record<GirlId, boolean>;
  for (const g of GIRLS) {
    const f = favorites[g];
    if (!f) continue;
    const cat = FOOD_CATEGORY[f];
    out[g] = cat !== 'extra' && p[g][cat] === f;
  }
  return out;
}

/** The gentle bounce-back line when a compartment is taken. */
export function fullLine(kind: FoodKind): string {
  switch (FOOD_CATEGORY[kind]) {
    case 'main':
      return 'She already has her main!';
    case 'snack':
      return 'She already has a snack!';
    case 'drink':
      return 'She already has a drink!';
    case 'fruit':
      return 'She already has fruit!';
    default:
      return 'She already has a note! (So much love.)';
  }
}

/** Favourites packed (per girl) + speed. 3 stars = every favourite + a brisk pace. Never 0. */
export function lunchStars(favorites: number, seconds: number): 1 | 2 | 3 {
  const speed = seconds <= 40 ? 1 : seconds <= 65 ? 0.5 : 0;
  return starsFrom(Math.max(0, favorites) + speed, 3.5, 2);
}

/**
 * Auto-pack (clock ran out / skip): fill every empty compartment from the available foods — each girl's
 * favourite first, then anything of the right category. Returns the moves in order; does not mutate `p`.
 */
export function autoPack(p: Packing, available: readonly FoodKind[], favorites: Partial<Record<GirlId, FoodKind>>): { girl: GirlId; kind: FoodKind; index: number }[] {
  const used = new Set<number>();
  const moves: { girl: GirlId; kind: FoodKind; index: number }[] = [];
  const take = (pred: (k: FoodKind) => boolean): number => {
    for (let i = 0; i < available.length; i++) if (!used.has(i) && pred(available[i]!)) return i;
    return -1;
  };
  for (const g of GIRLS) {
    const f = favorites[g];
    if (!f) continue;
    const cat = FOOD_CATEGORY[f];
    if (cat === 'extra' || p[g][cat] !== null) continue;
    const i = take((k) => k === f);
    if (i >= 0) {
      used.add(i);
      moves.push({ girl: g, kind: f, index: i });
    }
  }
  for (const g of GIRLS) {
    for (const cat of CATS) {
      if (p[g][cat] !== null || moves.some((m) => m.girl === g && FOOD_CATEGORY[m.kind] === cat)) continue;
      const i = take((k) => FOOD_CATEGORY[k] === cat);
      if (i >= 0) {
        used.add(i);
        moves.push({ girl: g, kind: available[i]!, index: i });
      }
    }
  }
  return moves;
}

/** Can this food (or love note) still go into at least one box? */
export function fitsSomewhere(p: Packing, kind: FoodKind): boolean {
  const cat = FOOD_CATEGORY[kind];
  return GIRLS.some((g) => (cat === 'extra' ? !p[g].note : p[g][cat] === null));
}

/**
 * Where the keyboard / gamepad cursor should snap next: an unpacked food that still fits somewhere — a girl's
 * favourite whose compartment is still free first, then any food of a still-missing category (nearest to
 * `from`), love notes last (they're a bonus). −1 when nothing fits.
 */
export function suggestFood(
  foods: readonly { kind: FoodKind; packed: boolean; x: number; z: number }[],
  p: Packing,
  favorites: Partial<Record<GirlId, FoodKind>>,
  fromX: number,
  fromZ: number,
): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i]!;
    if (f.packed || !fitsSomewhere(p, f.kind)) continue;
    const cat = FOOD_CATEGORY[f.kind];
    const favFor = GIRLS.some((g) => favorites[g] === f.kind && cat !== 'extra' && p[g][cat] === null);
    const tier = favFor ? 0 : cat === 'extra' ? 2 : 1;
    const score = tier * 100 + Math.hypot(f.x - fromX, f.z - fromZ);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}
