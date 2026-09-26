// ─────────────────────────────────────────────────────────────────────────────
// Coffee — PURE rules: mug line-up, brew fill verdicts, the creamer colour ramp (black → latte → milky), colour
// matching in CIE Lab (never by what the lit surface looks like), and stars. Unit-tested.
// ─────────────────────────────────────────────────────────────────────────────
import type { CoffeeOrder } from '../../plan/types';
import type { MugDesign } from '../../props/types';
import { PAL } from '../../render/palette';
import { shuffled, starsFrom } from '../station/logic';

/** Ashley's mug. */
export const HER_MUG: MugDesign = 'sunflower';
const OTHER_MUGS: readonly MugDesign[] = ['stripes', 'dots', 'bestDad', 'heart', 'plain'];

export const MUG_NAME: Readonly<Record<MugDesign, string>> = {
  sunflower: 'Sunflower',
  heart: 'Heart',
  stripes: 'Stripes',
  dots: 'Polka dots',
  plain: 'Plain oat',
  bestDad: '#1 Dad',
};

/** Four mugs for the shelf (left → right): the sunflower + three seeded others, shuffled. */
export function mugLineup(next: () => number): MugDesign[] {
  const others = shuffled(OTHER_MUGS, next).slice(0, 3);
  return shuffled([HER_MUG, ...others], next);
}

// ── brewing ──────────────────────────────────────────────────────────────────

/** The fill line (sweet zone) on the gauge. */
export const BREW_BAND = { lo: 0.78, hi: 0.9 } as const;
/** At or past this the coffee spills over (a comedic drip + a quick wipe, never a fail). */
export const OVERFLOW = 0.97;
/** Fill per second while brewing. */
export const BREW_RATE = 0.3;

export type FillVerdict = 'low' | 'perfect' | 'brim' | 'overflow';

export function fillVerdict(level: number): FillVerdict {
  if (!Number.isFinite(level) || level < BREW_BAND.lo) return 'low';
  if (level <= BREW_BAND.hi) return 'perfect';
  if (level < OVERFLOW) return 'brim';
  return 'overflow';
}

/** Brew fill after `dt` seconds (holding for `held` seconds so far: a soft start, then steady). */
export function brewStep(level: number, dt: number, held: number): number {
  const ramp = Math.min(1, 0.35 + held * 2.6);
  return Math.min(1, Math.max(0, level) + BREW_RATE * ramp * Math.max(0, dt));
}

// ── creamer ──────────────────────────────────────────────────────────────────

/** Creamer ramp stops (amount of cream 0..1 → coffee colour). The orders sit exactly on stops. */
export const CREAM_STOPS: readonly { t: number; c: number }[] = [
  { t: 0, c: PAL.coffeeBlack },
  { t: 0.3, c: PAL.coffeeSplash },
  { t: 0.55, c: PAL.coffeeCreamSugar },
  { t: 0.8, c: PAL.coffeeLatte },
  { t: 1, c: PAL.coffeeMilky },
];

/** Cream per second while pouring. */
export const CREAM_RATE = 0.2;

export const ORDER_COLOR: Readonly<Record<CoffeeOrder, number>> = {
  black: PAL.coffeeBlack,
  splash: PAL.coffeeSplash,
  creamSugar: PAL.coffeeCreamSugar,
  latte: PAL.coffeeLatte,
};

export const ORDER_T: Readonly<Record<CoffeeOrder, number>> = { black: 0, splash: 0.3, creamSugar: 0.55, latte: 0.8 };

export const ORDER_NAME: Readonly<Record<CoffeeOrder, string>> = {
  black: 'Black',
  splash: 'A splash of cream',
  creamSugar: 'Cream & one sugar',
  latte: 'Lots of cream',
};

const ch = (hex: number, s: number): number => (hex >> s) & 0xff;

/** RGB lerp between two hex colours. */
export function mixHex(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * k);
  const g = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * k);
  const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Coffee colour for a cream amount 0..1. */
export function creamColor(t: number): number {
  const x = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  for (let i = 1; i < CREAM_STOPS.length; i++) {
    const b = CREAM_STOPS[i]!;
    if (x <= b.t) {
      const a = CREAM_STOPS[i - 1]!;
      return mixHex(a.c, b.c, (x - a.t) / (b.t - a.t));
    }
  }
  return CREAM_STOPS[CREAM_STOPS.length - 1]!.c;
}

/** sRGB hex → CIE L*a*b* (D65). */
export function hexToLab(hex: number): [number, number, number] {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(ch(hex, 16));
  const g = lin(ch(hex, 8));
  const b = lin(ch(hex, 0));
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Perceptual colour distance (CIE76 ΔE). ~2.3 = just noticeable. */
export function colorDistance(a: number, b: number): number {
  const p = hexToLab(a);
  const q = hexToLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** ΔE under which the pour counts as a match ("that's it!"). */
export const MATCH_DE = 6;

export type CreamVerdict = 'under' | 'match' | 'over';

/** Compare the poured colour with the order's swatch. Direction (under/over) from the cream amount. */
export function creamVerdict(t: number, order: CoffeeOrder): CreamVerdict {
  const d = colorDistance(creamColor(t), ORDER_COLOR[order]);
  if (d <= MATCH_DE) return 'match';
  return t < ORDER_T[order] ? 'under' : 'over';
}

// ── stars ────────────────────────────────────────────────────────────────────

export interface CoffeeRun {
  wrongPicks: number;
  fill: FillVerdict;
  /** 'black' orders skip the creamer (full marks). */
  cream: 'match' | 'over' | 'black';
}

export function coffeePoints(r: CoffeeRun): number {
  const mug = r.wrongPicks <= 0 ? 1 : r.wrongPicks === 1 ? 0.5 : 0.25;
  const fill = r.fill === 'perfect' ? 1 : r.fill === 'brim' ? 0.5 : 0.25;
  const cream = r.cream === 'over' ? 0.5 : 1;
  return mug + fill + cream;
}

/** Right mug first try + fill in the band + colour match = 3 stars. Never 0. */
export function coffeeStars(r: CoffeeRun): 1 | 2 | 3 {
  return starsFrom(coffeePoints(r), 2.75, 1.75);
}
