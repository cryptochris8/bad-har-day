// ─────────────────────────────────────────────────────────────────────────────
// Clock → lighting state (pure, unit-tested). Keyframes across one school
// morning: 5:15 dark-blue pre-dawn with stars and cool moonlight, warm lamps
// inside · 6:00 sunrise begins (peach/pink east horizon, house lights ON) ·
// 6:30 low warm sun · 7:00 golden morning · 7:45–8:05 bright clear morning.
// Weather tints the result (cloudy: greyer, softer sun; drizzle: greyer still,
// rain streaks). Colours are hex; the scene applies them.
// ─────────────────────────────────────────────────────────────────────────────
import { PAL } from '../render/palette';

export type Weather = 'clear' | 'cloudy' | 'drizzle';

export interface LightingState {
  minutes: number;
  skyTop: number;
  skyHorizon: number;
  /** Sunrise glow strength around the sun's azimuth (0..1). */
  glow: number;
  glowColor: number;
  /** Sun direction in the SKY (unit, toward the sun). Elevation may be < 0 (below the horizon). */
  sunX: number;
  sunY: number;
  sunZ: number;
  /** Sun disc visibility 0..1. */
  sunDisc: number;
  /** Moon disc / halo visibility 0..1. */
  moon: number;
  stars: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyColor: number;
  keyIntensity: number;
  /** Key light direction (unit, from the scene toward the light) — gameplay-friendly, always from the camera side. */
  keyX: number;
  keyY: number;
  keyZ: number;
  /** 0 = the key light is the moon, 1 = the sun. */
  sunAmount: number;
  /** Lamp group levels 0..1. */
  nightLamps: number;
  houseLamps: number;
  outdoorLamps: number;
  /** Daylight seen through window glass (0 night … 1 bright day). */
  daylight: number;
  /** Warm glow of the windows seen from outside (lit rooms at night). */
  windowGlow: number;
  /** Fraction of the neighbours' windows lit. */
  neighbourWindows: number;
  /** Sunbeam strength through opened curtains (0..1). */
  sunbeam: number;
  /** Warm cast on the house interior while lamps light a dark house (0..1): the 6:00 "lights on!" moment. */
  interiorWarm: number;
  cloudColor: number;
  cloudAlpha: number;
  /** Rain streak amount 0..1. */
  rain: number;
  /** Fog / clear colour for distance haze. */
  fog: number;
}

interface Key {
  t: number;
  skyTop: number;
  skyHorizon: number;
  glow: number;
  glowColor: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  cloud: number;
  fog: number;
}

// Sky / ambient keyframes (minutes since midnight).
const KEYS: readonly Key[] = [
  // Night ambient is a touch brighter than "realistic" so the yard (the dog!) stays readable at 5:15.
  { t: 300, skyTop: PAL.skyNightTop, skyHorizon: PAL.skyNightHorizon, glow: 0, glowColor: PAL.skyDawnHorizon, hemiSky: 0x4d5d9c, hemiGround: 0x2b2546, hemiI: 1.28, cloud: 0x2a3160, fog: 0x1c2552 },
  { t: 315, skyTop: PAL.skyNightTop, skyHorizon: PAL.skyNightHorizon, glow: 0, glowColor: PAL.skyDawnHorizon, hemiSky: 0x4d5d9c, hemiGround: 0x2b2546, hemiI: 1.28, cloud: 0x2a3160, fog: 0x1c2552 },
  { t: 345, skyTop: 0x16235a, skyHorizon: 0x4a4c8a, glow: 0.15, glowColor: 0xd98a8a, hemiSky: 0x5563a6, hemiGround: 0x2d2648, hemiI: 1.24, cloud: 0x3a3a70, fog: 0x2b3268 },
  { t: 360, skyTop: 0x2c3f86, skyHorizon: 0xf09a8a, glow: 0.55, glowColor: PAL.skyDawnHorizon, hemiSky: 0x7a70a6, hemiGround: 0x3a3050, hemiI: 1.12, cloud: 0xc98fa0, fog: 0x8a7aa0 },
  { t: 375, skyTop: 0x4661ae, skyHorizon: 0xffb08a, glow: 0.95, glowColor: PAL.skySunriseGlow, hemiSky: 0xc0a2b6, hemiGround: 0x4e4050, hemiI: 1.18, cloud: PAL.cloudDawn, fog: 0xd7a89a },
  { t: 390, skyTop: 0x5a86cf, skyHorizon: 0xffcb9c, glow: 0.8, glowColor: PAL.skySunriseGlow, hemiSky: 0xe2c6b6, hemiGround: 0x5e4e4a, hemiI: 1.22, cloud: 0xffd6c4, fog: 0xecc4ae },
  { t: 420, skyTop: 0x5fa0e6, skyHorizon: 0xffe0b4, glow: 0.45, glowColor: 0xffd49a, hemiSky: 0xf0e2ce, hemiGround: 0x76685a, hemiI: 1.26, cloud: 0xfff2e2, fog: 0xf2e2cc },
  { t: 450, skyTop: PAL.skyMorningTop, skyHorizon: PAL.skyMorningHorizon, glow: 0.12, glowColor: 0xfff0d0, hemiSky: PAL.hemiSkyDay, hemiGround: PAL.hemiGroundDay, hemiI: 1.3, cloud: PAL.cloudDay, fog: 0xd6eeff },
  { t: 490, skyTop: PAL.skyMorningTop, skyHorizon: PAL.skyMorningHorizon, glow: 0.05, glowColor: 0xfff0d0, hemiSky: PAL.hemiSkyDay, hemiGround: PAL.hemiGroundDay, hemiI: 1.34, cloud: PAL.cloudDay, fog: 0xd6eeff },
  { t: 600, skyTop: PAL.skyMorningTop, skyHorizon: PAL.skyMorningHorizon, glow: 0, glowColor: 0xfff0d0, hemiSky: PAL.hemiSkyDay, hemiGround: PAL.hemiGroundDay, hemiI: 1.34, cloud: PAL.cloudDay, fog: 0xd6eeff },
];

// Sun key light (intensity + colour) keyframes.
const SUN: readonly { t: number; i: number; c: number }[] = [
  { t: 361, i: 0, c: PAL.keyDawn },
  { t: 368, i: 0.35, c: 0xff9f78 },
  { t: 378, i: 0.95, c: 0xffb07a },
  { t: 392, i: 1.5, c: 0xffc48c },
  { t: 420, i: 2.0, c: 0xffdca8 },
  { t: 450, i: 2.3, c: 0xffeecf },
  { t: 480, i: 2.45, c: PAL.keyDay },
  { t: 600, i: 2.45, c: PAL.keyDay },
];

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth01 = (e0: number, e1: number, v: number): number => {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

export function mixHex(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * k) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Relative luminance-ish brightness 0..1 of a hex colour (for tests / heuristics). */
export function brightness(hex: number): number {
  return (0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)) / 255;
}

function greyOf(hex: number, lift: number): number {
  const b = Math.round(brightness(hex) * 255 * (1 - lift) + 200 * lift);
  const g = Math.max(0, Math.min(255, b));
  return (g << 16) | (g << 8) | Math.min(255, g + 8);
}

function segment<T extends { t: number }>(keys: readonly T[], m: number): [T, T, number] {
  if (m <= keys[0]!.t) return [keys[0]!, keys[0]!, 0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (m <= b.t) return [a, b, (m - a.t) / (b.t - a.t)];
  }
  const last = keys[keys.length - 1]!;
  return [last, last, 0];
}

export function createLightingState(): LightingState {
  return lightingAt(315, 'clear');
}

/** The full lighting state for a clock time and weather. Pass `out` to avoid allocating. */
export function lightingAt(minutes: number, weather: Weather, out?: LightingState): LightingState {
  const o = out ?? ({} as LightingState);
  const m = Number.isFinite(minutes) ? minutes : 315;
  o.minutes = m;
  const [a, b, t] = segment(KEYS, m);
  const u = t * t * (3 - 2 * t);
  o.skyTop = mixHex(a.skyTop, b.skyTop, u);
  o.skyHorizon = mixHex(a.skyHorizon, b.skyHorizon, u);
  o.glow = a.glow + (b.glow - a.glow) * u;
  o.glowColor = mixHex(a.glowColor, b.glowColor, u);
  o.hemiSky = mixHex(a.hemiSky, b.hemiSky, u);
  o.hemiGround = mixHex(a.hemiGround, b.hemiGround, u);
  o.hemiIntensity = a.hemiI + (b.hemiI - a.hemiI) * u;
  o.cloudColor = mixHex(a.cloud, b.cloud, u);
  o.fog = mixHex(a.fog, b.fog, u);

  // Sun in the sky: rises in the north-east (visible to north-facing close-ups), climbs toward the east.
  const sunElevDeg = -6 + ((m - 355) / 130) * 30; // −6° at 5:55 → +24° at 8:05
  const az = (55 + ((m - 355) / 130) * 45) * (Math.PI / 180); // from north (−Z) toward east (+X)
  const el = sunElevDeg * (Math.PI / 180);
  o.sunX = Math.sin(az) * Math.cos(el);
  o.sunY = Math.sin(el);
  o.sunZ = -Math.cos(az) * Math.cos(el);
  o.sunDisc = smooth01(-1.5, 2.5, sunElevDeg);
  o.moon = 1 - smooth01(352, 392, m);
  o.stars = 1 - smooth01(338, 378, m);

  // Key light: moon until ≈ 6:00, then the sun. Intensity dips at the hand-over.
  const moonI = 1.15 * (1 - smooth01(342, 362, m));
  const [sa, sb, st] = segment(SUN, m);
  const su = st * st * (3 - 2 * st);
  const sunI = sa.i + (sb.i - sa.i) * su;
  const sunC = mixHex(sa.c, sb.c, su);
  const total = moonI + sunI;
  const sunShare = total > 1e-6 ? sunI / total : 1;
  o.sunAmount = sunShare;
  o.keyColor = mixHex(PAL.keyNight, sunC, sunShare);
  o.keyIntensity = total;
  // Direction (toward the light): moon high from the south-west, sun from the south-east (shadows fall away from the camera).
  const mx = -0.22;
  const my = 0.86;
  const mz = 0.45;
  const sunLow = 1 - smooth01(365, 470, m); // the sun key starts lower and climbs
  const sx = 0.1 + 0.14 * sunLow;
  const sy = 0.82 - 0.12 * sunLow;
  const sz = 0.55;
  let kx = mx + (sx - mx) * sunShare;
  let ky = my + (sy - my) * sunShare;
  let kz = mz + (sz - mz) * sunShare;
  const kl = Math.hypot(kx, ky, kz) || 1;
  kx /= kl;
  ky /= kl;
  kz /= kl;
  o.keyX = kx;
  o.keyY = ky;
  o.keyZ = kz;

  // Lamps.
  o.nightLamps = 1 - smooth01(398, 432, m);
  o.houseLamps = smooth01(359.3, 359.95, m) * (1 - smooth01(412, 442, m));
  o.outdoorLamps = 1 - smooth01(368, 392, m);
  o.daylight = smooth01(350, 430, m);
  o.windowGlow = Math.max(o.nightLamps * 0.75, o.houseLamps) * (1 - smooth01(380, 440, m) * 0.85);
  o.neighbourWindows = 0.28 * (1 - smooth01(355, 365, m)) + 0.62 * smooth01(355, 365, m) * (1 - smooth01(395, 425, m));
  o.sunbeam = smooth01(368, 392, m);
  o.interiorWarm = clamp01((o.houseLamps * 0.85 + o.nightLamps * 0.25) * (1 - o.daylight));
  o.cloudAlpha = 0.55;
  o.rain = 0;

  if (weather !== 'clear') {
    const g = weather === 'cloudy' ? 0.35 : 0.55;
    o.skyTop = mixHex(o.skyTop, greyOf(o.skyTop, 0.25), g);
    o.skyHorizon = mixHex(o.skyHorizon, greyOf(o.skyHorizon, 0.3), g);
    o.fog = mixHex(o.fog, greyOf(o.fog, 0.3), g);
    o.hemiSky = mixHex(o.hemiSky, greyOf(o.hemiSky, 0.2), g * 0.8);
    o.glow *= 1 - g;
    o.sunDisc *= weather === 'cloudy' ? 0.45 : 0.15;
    // Clouds dim the sun far more than they dim the (gameplay) moonlight.
    const dayMul = weather === 'cloudy' ? 0.72 : 0.52;
    const nightMul = weather === 'cloudy' ? 0.9 : 0.8;
    o.keyIntensity *= nightMul + (dayMul - nightMul) * o.sunAmount;
    o.hemiIntensity *= weather === 'cloudy' ? 1.02 : 0.96;
    o.stars *= 0.35;
    o.sunbeam *= weather === 'cloudy' ? 0.55 : 0.3;
    o.cloudAlpha = weather === 'cloudy' ? 0.95 : 1;
    o.cloudColor = mixHex(o.cloudColor, greyOf(o.cloudColor, 0.2), weather === 'cloudy' ? 0.35 : 0.6);
    o.rain = weather === 'drizzle' ? 1 : 0;
    // lamps stay on a little longer on grey mornings
    o.houseLamps = Math.max(o.houseLamps, smooth01(359.3, 359.95, m) * (1 - smooth01(425, 455, m)) * (weather === 'drizzle' ? 1 : 0.6));
  }
  return o;
}

/** "5:15" → 315, "7:05" → 425, plain number strings are minutes. NaN when invalid. */
export function parseClock(s: string | null | undefined): number {
  if (!s) return Number.NaN;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : Number.NaN;
}
