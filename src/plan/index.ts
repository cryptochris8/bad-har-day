// Day-plan generation (docs/GDD.md §10): everything seeded about one morning. PURE.
import { Rng, hashString } from '../core/rng';
import { GIRLS, type GirlId } from '../family/types';
import type { BrushKind } from '../hair/types';
import { FOOD_CATEGORY, type FoodKind, type ItemKind } from '../props/types';
import type { HideSpotId } from '../world/types';
import type { ChoreId, DayPlan, DogQuirk, DriveEvent, GirlHairPlan, HairCondition, MissingItem, WakeStyle, Weather } from './types';

export * from './types';
export { buildReport, gradeFor, pickAwards, type ReportInput } from './report';

const DOG_QUIRKS: readonly DogQuirk[] = ['stare', 'leaf', 'sniffAll', 'zoomies', 'stubborn'];
const WAKE_STYLES: readonly WakeStyle[] = ['popUp', 'burrito', 'sleepwalker'];
const BACKUP_BRUSHES: readonly Exclude<BrushKind, 'black'>[] = ['purple', 'pink', 'teal'];
const MISSING_KINDS: readonly ItemKind[] = ['shoe', 'backpack', 'libraryBook', 'waterBottle', 'hairTie', 'permissionSlip', 'jacket'];
export const HIDE_SPOTS: readonly HideSpotId[] = [
  'couchCushion',
  'dogBed',
  'bathCounter',
  'twinsFloor',
  'heidiFloor',
  'kitchenTable',
  'yardGrass',
  'masterChair',
  'hallBasket',
  'entryBench',
  'laundryPile',
  'underTwinsBed',
];
const DRIVE_EXTRAS: readonly DriveEvent[] = ['geese', 'greenLights', 'sprinkler', 'jogger', 'garbageTruck', 'ball', 'puddle'];
const LUNCH_FOODS = (Object.keys(FOOD_CATEGORY) as FoodKind[]).filter((k) => FOOD_CATEGORY[k] !== 'extra');

/** Fisher–Yates with the plan's RNG (returns a new array). */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Seed for the DAILY MORNING of a local date. */
export function dailySeed(dateKey: string): number {
  return hashString(`bad-hair-day:${dateKey}`);
}

/** Local date key "YYYY-MM-DD". */
export function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function hairPlan(rng: Rng, weather: Weather): GirlHairPlan {
  const pool: HairCondition[] = ['light', 'bedhead', 'sleepMess', 'extraLong'];
  if (weather === 'drizzle') pool.push('rainy', 'rainy');
  let condition: HairCondition = rng.pick(pool);
  if (rng.chance(0.1)) condition = 'pictureDay';
  return { condition, doneAt: Math.round(rng.range(0.7, 0.9) * 100) / 100, seed: rng.int(1, 0x7fffffff) };
}

export interface PlanOpts {
  daily?: boolean;
  dateKey?: string | null;
}

export function generatePlan(seed: number, opts: PlanOpts = {}): DayPlan {
  const rng = new Rng(seed >>> 0);
  const weather: Weather = rng.weighted<Weather>(['clear', 'cloudy', 'drizzle'], (w) => (w === 'clear' ? 0.6 : w === 'cloudy' ? 0.25 : 0.15));

  const optional: ChoreId[] = [];
  if (rng.chance(0.65)) optional.push('lunch');
  if (rng.chance(0.5)) optional.push('trash');
  if (rng.chance(0.6)) optional.push('dishes');
  if (optional.length === 0) optional.push(rng.pick<ChoreId>(['lunch', 'trash', 'dishes']));
  const chores: ChoreId[] = ['dog', 'coffee', ...shuffle(rng, optional)];

  const dogQuirk = rng.pick(DOG_QUIRKS);
  const lunchFavorites = {} as Record<GirlId, FoodKind>;
  for (const g of GIRLS) lunchFavorites[g] = rng.pick(LUNCH_FOODS);

  const wakeOrder = shuffle(rng, WAKE_STYLES);
  const wake = {} as Record<GirlId, WakeStyle>;
  GIRLS.forEach((g, i) => (wake[g] = wakeOrder[i]!));

  const hair = {} as Record<GirlId, GirlHairPlan>;
  for (const g of GIRLS) hair[g] = hairPlan(rng, weather);
  if (weather === 'drizzle' && !GIRLS.some((g) => hair[g].condition === 'rainy')) hair[rng.pick(GIRLS)].condition = 'rainy';

  const blackBrushGrabber = rng.pick(GIRLS);
  const brushOrder = shuffle(rng, BACKUP_BRUSHES);
  const backupBrush = {} as Record<GirlId, Exclude<BrushKind, 'black'>>;
  GIRLS.forEach((g, i) => (backupBrush[g] = brushOrder[i]!));

  const count = rng.int(3, 5);
  const kinds = shuffle(rng, MISSING_KINDS).slice(0, count);
  const spots = shuffle(
    rng,
    HIDE_SPOTS.filter((s) => !(weather === 'drizzle' && s === 'yardGrass')),
  ).slice(0, count);
  const girlsCycle = shuffle(rng, GIRLS);
  const missing: MissingItem[] = kinds.map((item, i) => ({ item, girl: girlsCycle[i % 3]!, spot: spots[i]! }));

  const drive: DriveEvent[] = ['crossingGuard', ...shuffle(rng, DRIVE_EXTRAS).slice(0, rng.int(3, 4))];
  const driveOrdered = shuffle(rng, drive);

  return {
    seed: seed >>> 0,
    daily: !!opts.daily,
    dateKey: opts.dateKey ?? null,
    weather,
    chores,
    dogQuirk,
    lunchFavorites,
    wake,
    hair,
    blackBrushGrabber,
    backupBrush,
    missing,
    drive: driveOrdered,
    cosmeticSeed: rng.int(1, 0x7fffffff),
  };
}
