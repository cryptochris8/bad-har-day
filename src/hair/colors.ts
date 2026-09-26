// Hair colour ramp derived from one hair colour (pure; hex in, hex out).
import { PAL } from '../render/palette';

const ch = (hex: number, s: number) => (hex >> s) & 255;

export function mix(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * k) & 255;
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export function shade(hex: number, k: number): number {
  const m = (s: number) => Math.min(255, Math.max(0, Math.round(ch(hex, s) * k)));
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Perceived lightness 0..1 (sRGB luma). */
export function luma(hex: number): number {
  return (0.2126 * ch(hex, 16) + 0.7152 * ch(hex, 8) + 0.0722 * ch(hex, 0)) / 255;
}

/** RGB hex → HSL (0..1 each). */
export function toHsl(hex: number): [number, number, number] {
  const r = ch(hex, 16) / 255;
  const g = ch(hex, 8) / 255;
  const b = ch(hex, 0) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

/** HSL (0..1 each) → RGB hex. */
export function fromHsl(h: number, s: number, l: number): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

/** Same hue, lighter (dl) and optionally more saturated (ds). */
export function lighten(hex: number, dl: number, ds = 0): number {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h, Math.max(0, Math.min(1, s + ds)), Math.max(0, Math.min(0.95, l + dl)));
}

export interface HairPalette {
  /** Scalp / part / first centimetres of every lock. */
  root: number;
  mid: number;
  /** Subtly lighter ends. */
  tip: number;
  /** Underside of the locks + the under layer. */
  under: number;
  /** Glossy highlight band. */
  sheen: number;
  /** Frizz squiggles / flyaway strands (reads as linework). */
  frizz: number;
  /** Dull tangled tone (mixed in by tangle). */
  dull: number;
}

export function hairPalette(color: number): HairPalette {
  const l = luma(color);
  const dark = 1 - Math.min(1, l / 0.55); // 1 for near-black hair, 0 for mid/light hair
  return {
    root: mix(shade(color, 0.74 + 0.1 * dark), PAL.outline, 0.12),
    mid: color,
    tip: mix(color, PAL.hairTipLight, 0.16 + 0.06 * dark),
    under: mix(shade(color, 0.66), PAL.outline, 0.1),
    // Dark hair needs a stronger (cooler, whiter) sheen to read; light hair a gentler one.
    sheen: mix(lighten(color, 0.16 + 0.12 * dark, -0.1), PAL.hairSheen, 0.14 + 0.24 * dark),
    frizz: mix(shade(color, 0.62), PAL.outline, 0.35),
    dull: mix(shade(color, 0.84), 0x8a8078, 0.3),
  };
}
