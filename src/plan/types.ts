// ─────────────────────────────────────────────────────────────────────────────
// DAY PLAN — everything seeded about one morning (docs/GDD.md §10) + the act
// schedule + the report card. PURE data: no DOM, no Three.js, no Math.random.
// Owner: integration (src/plan/*). SHARED CONTRACT (frozen).
// ─────────────────────────────────────────────────────────────────────────────
import type { GirlId } from '../family/types';
import type { BrushKind } from '../hair/types';
import type { FoodKind, ItemKind } from '../props/types';
import type { HideSpotId } from '../world/types';

export type ChoreId = 'dog' | 'coffee' | 'lunch' | 'trash' | 'dishes';
export type ActivityId = ChoreId | 'wake' | 'hair' | 'rush' | 'drive';
export type WakeStyle = 'popUp' | 'burrito' | 'sleepwalker';
export type HairCondition = 'light' | 'bedhead' | 'sleepMess' | 'pictureDay' | 'rainy' | 'extraLong';
export type DogQuirk = 'stare' | 'leaf' | 'sniffAll' | 'zoomies' | 'stubborn';
export type Weather = 'clear' | 'cloudy' | 'drizzle';
export type CoffeeOrder = 'black' | 'splash' | 'creamSugar' | 'latte';
export type DriveEvent = 'crossingGuard' | 'geese' | 'greenLights' | 'sprinkler' | 'jogger' | 'garbageTruck' | 'ball' | 'puddle';

export const HAIR_CONDITION_LABEL: Readonly<Record<HairCondition, string>> = {
  light: 'Light tangles',
  bedhead: 'Big bedhead',
  sleepMess: 'Sleep-mess',
  pictureDay: 'Picture day!',
  rainy: 'Rainy-day frizz',
  extraLong: 'Extra-long brushing morning',
};

export const WAKE_STYLE_LABEL: Readonly<Record<WakeStyle, string>> = {
  popUp: 'Pop-up',
  burrito: 'Blanket burrito',
  sleepwalker: 'Sleepwalker',
};

export interface GirlHairPlan {
  condition: HairCondition;
  /** Mean-smoothness at which she declares "I'M DONE!" by herself (0.7..0.9). */
  doneAt: number;
  /** Seed for her tangle layout. */
  seed: number;
}

export interface MissingItem {
  item: ItemKind;
  girl: GirlId;
  spot: HideSpotId;
}

export interface DayPlan {
  seed: number;
  /** DAILY MORNING (date seed) vs NEW MORNING. */
  daily: boolean;
  /** "YYYY-MM-DD" for daily mornings. */
  dateKey: string | null;
  weather: Weather;
  /** Act I chore list in display order. Always includes 'dog' and 'coffee'. 4..5 items. */
  chores: ChoreId[];
  dogQuirk: DogQuirk;
  /** Each girl's favourite lunch item (a heart, never a rule). */
  lunchFavorites: Record<GirlId, FoodKind>;
  /** A permutation of the three styles (rotates who is who). */
  wake: Record<GirlId, WakeStyle>;
  hair: Record<GirlId, GirlHairPlan>;
  /** Who snags the black brush in the scramble (rotates). */
  blackBrushGrabber: GirlId;
  /** Each girl's backup brush (a permutation of purple/pink/teal). */
  backupBrush: Record<GirlId, Exclude<BrushKind, 'black'>>;
  /** Act IV: 3..5 items, distinct spots. */
  missing: MissingItem[];
  /** Act V: 4..5 wholesome events in route order. */
  drive: DriveEvent[];
  /** Twins' outfit accent variant etc. — cosmetic seed. */
  cosmeticSeed: number;
  /** Ashley's coffee order (FAMILY SETUP preference, not seeded). */
  coffeeOrder: CoffeeOrder;
}

// ── Acts & clock ─────────────────────────────────────────────────────────────

export type ActNumber = 1 | 2 | 3 | 4 | 5;

export interface ActInfo {
  act: ActNumber;
  /** Clock minute the act starts at (fixed: finishing an act early fast-forwards to the next act's start). */
  start: number;
  /** Hard end (minutes since midnight). */
  end: number;
  /** Game minutes per real second while the clock runs. */
  rate: number;
  title: string;
  subtitle: string;
}

/** Minutes since midnight. 315 = 5:15 AM. */
export const T = (h: number, m: number): number => h * 60 + m;

export const ASHLEY_LEAVES = T(7, 45);
export const SCHOOL_DEADLINE = T(8, 5);

export const ACTS: readonly ActInfo[] = [
  { act: 1, start: T(5, 15), end: T(6, 0), rate: 0.17, title: "CHRIS'S EARLY SHIFT", subtitle: 'EVERYBODY ELSE IS STILL ASLEEP.' },
  { act: 2, start: T(6, 0), end: T(6, 30), rate: 0.25, title: 'WAKE UP, GIRLS!', subtitle: 'RISE AND SHINE, SLEEPYHEADS.' },
  { act: 3, start: T(6, 30), end: T(7, 15), rate: 0.19, title: 'HAIR TIME', subtitle: 'THREE HEADS OF HAIR. ONE BLACK BRUSH.' },
  { act: 4, start: T(7, 15), end: T(7, 50), rate: 0.24, title: 'OUT THE DOOR', subtitle: 'SHOES. BACKPACKS. LUNCHES. GO.' },
  { act: 5, start: T(7, 50), end: T(8, 5), rate: 0.17, title: 'THE SCHOOL RUN', subtitle: 'BUCKLE UP, BUTTERCUPS.' },
];

// ── Report card ──────────────────────────────────────────────────────────────

export type Stars = 1 | 2 | 3;

export interface ActivityResult {
  /** 1..3 — never 0: no activity can "fail". */
  stars: Stars;
  /** Award / payoff hints, e.g. 'solo:addy', 'mom:ellie', 'coffee:perfect', 'dog:fast', 'loud'. */
  flags: string[];
}

export interface ActivityRecord {
  id: ActivityId;
  label: string;
  /** 0 = skipped (optional chore the clock ran out on). */
  stars: 0 | Stars;
  flags: string[];
}

export interface Award {
  id: string;
  title: string;
  blurb: string;
  icon: string;
}

export interface MorningReport {
  seed: number;
  daily: boolean;
  dateKey: string | null;
  /** Arrival at school (minutes since midnight, ≤ SCHOOL_DEADLINE). */
  arrival: number;
  records: ActivityRecord[];
  totalStars: number;
  maxStars: number;
  grade: { title: string; blurb: string };
  awards: Award[];
  /** Personal-best arrival this time? */
  newBestArrival: boolean;
  /** Real seconds played. */
  playSeconds: number;
}
