// ─────────────────────────────────────────────────────────────────────────────
// School-run route LAYOUT (pure data, no Three.js): the cheerful fictional
// neighbourhood street from home to Maple Grove Elementary, in ROUTE SPACE
// (s = distance along the road, the road runs toward −Z of the route root;
// x = lateral, +x = the right-hand side of travel, where the drop-off is).
//
//   s = −60 … 0      the street behind the start (the camera never looks back far)
//   s = 0            the minivan appears in the right lane
//   intersections    cross streets with traffic lights (stop line 10 m before the centre)
//   crosswalks       mid-block zebra crossings (crossing guard / geese cross here)
//   park             a little park on the left (pond, playground, benches, big trees)
//   school           Maple Grove Elementary on the right, with the drop-off bay
//   s ≈ 630          a T-junction closes the view past the school
//
// Cross-section (|x|): lanes 0 … 3.6 (centres LANE_X = ±1.8) · parking strip 3.6 … 5.1 · curb 5.1 … 5.3 ·
// planting strip 5.3 … 6.5 (street trees, mailboxes, lamps) · sidewalk 6.5 … 8.3 · front lawns 8.3 … · houses
// with their front faces at |x| ≈ 13.5 … 16. In the drop-off bay the right curb swings out to x = BAY.curb.
// ─────────────────────────────────────────────────────────────────────────────
import { Rng, hashInts } from '../../core/rng';

export const ROUTE_LENGTH = 600;
/** World position of the route root (s = 0, x = 0). Far behind the house (+Z) so neither scene ever sees the other. */
export const ROUTE_ORIGIN = { x: 0, y: 0, z: 2400 } as const;

export const XS = {
  lane: 3.6,
  parkX: 4.35,
  curb0: 5.1,
  curb1: 5.3,
  strip1: 6.5,
  walk1: 8.3,
  /** Ground plane half width. */
  ground: 95,
} as const;

/** Visual extent of the street along s. */
export const S_MIN = -70;
export const S_MAX = 720;

/** Cross streets (centre s) — both have traffic lights. */
export const INTERSECTIONS: readonly number[] = [135, 345];
/** Cross street half width (m). */
export const CROSS_HALF = 5;
/** Stop line distance before an intersection centre. */
export const STOP_BACK = 10;
/** Traffic-light stop lines (s) — the contract's `lights`. */
export const LIGHTS: readonly number[] = INTERSECTIONS.map((s) => s - STOP_BACK);
/** Mid-block crosswalks (centre s) — the contract's `crosswalks`. */
// (placed so a morning's 4–5 events can always be spread out: see tests/activities/drive/placement.test.ts)
export const CROSSWALKS: readonly number[] = [80, 168, 238, 292, 392, 468];
/** Crosswalk stripe band half-depth (m along s). */
export const CROSSWALK_HALF = 1.6;
/** A car stops with its FRONT at crosswalk − CROSSWALK_STOP. */
export const CROSSWALK_STOP = 3.4;

export const PARK = { side: -1 as const, s0: 222, s1: 322 };
export const SCHOOL = { side: 1 as const, s0: 478, s1: 592, front: 16, door: 521, doorX: 15.6 };
/** Drop-off bay: the right curb swings out to `curb` between the tapers; cars stop with their centre in [s0, s1]. */
export const DROPOFF = { s0: 500, s1: 542, x: 6.4 } as const;
export const BAY = { curb: 8.1, taperIn: 14, taperOut: 10 } as const;
/** T-junction past the school (cross street centre). */
export const T_JUNCTION = 632;

/** Events may be placed between these (the drop-off approach starts after). */
export const EVENT_S0 = 66;
export const EVENT_S1 = 445;

/** Right-hand curb line x at s (swings out around the drop-off bay). */
export function curbX(s: number, side: 1 | -1): number {
  if (side < 0) return XS.curb0;
  const a0 = DROPOFF.s0 - BAY.taperIn;
  const a1 = DROPOFF.s0;
  const b0 = DROPOFF.s1 + 4;
  const b1 = b0 + BAY.taperOut;
  if (s <= a0 || s >= b1) return XS.curb0;
  let k: number;
  if (s < a1) k = (s - a0) / (a1 - a0);
  else if (s <= b0) k = 1;
  else k = 1 - (s - b0) / (b1 - b0);
  k = k * k * (3 - 2 * k);
  return XS.curb0 + (BAY.curb - XS.curb0) * k;
}

/** True when s is inside a cross street (± pad). */
export function inIntersection(s: number, pad = 0): boolean {
  for (const c of INTERSECTIONS) if (Math.abs(s - c) <= CROSS_HALF + pad) return true;
  return Math.abs(s - T_JUNCTION) <= CROSS_HALF + pad;
}

export function nearCrosswalk(s: number, pad: number): boolean {
  for (const c of CROSSWALKS) if (Math.abs(s - c) <= CROSSWALK_HALF + pad) return true;
  return false;
}

// ── seeded lots (houses) ─────────────────────────────────────────────────────

export type RoofStyle = 'gableSide' | 'gableFront' | 'hip';
export type FenceStyle = 'picket' | 'hedge' | 'none';

export interface Lot {
  side: 1 | -1;
  /** Lot extent along s. */
  s0: number;
  s1: number;
  /** House centre along s, width along s, depth along x, front face |x|. */
  hs: number;
  hw: number;
  hd: number;
  front: number;
  storeys: 1 | 2;
  wall: number;
  roof: number;
  accent: number;
  roofStyle: RoofStyle;
  porch: boolean;
  garage: boolean;
  /** Driveway centre along s (null = none). */
  drive: number | null;
  fence: FenceStyle;
  /** Front-yard trees (s offsets inside the lot). */
  trees: number;
  mailbox: boolean;
  flowers: boolean;
  seed: number;
}

/** Cheerful house wall colours (hex). */
export const HOUSE_WALLS: readonly number[] = [0xf7d9a8, 0xbfe0d0, 0xf5c2c0, 0xc9d8f2, 0xf4e6b0, 0xd9cbef, 0xf8d0b0, 0xcfe8b8, 0xf2f0e6, 0xa9d4e4];
export const HOUSE_ROOFS: readonly number[] = [0x7a5a6e, 0x5b6b84, 0x8a5d4a, 0x4f6f7a, 0x9a6a5a, 0x6b5a8a];
export const HOUSE_ACCENTS: readonly number[] = [0xe0675a, 0x3f8a8c, 0xf2b84b, 0x6f9fd8, 0xb77fd6, 0x5fae63, 0xff8fb1];

interface Blocked {
  s0: number;
  s1: number;
}

function blockedFor(side: 1 | -1): Blocked[] {
  const b: Blocked[] = [];
  for (const c of INTERSECTIONS) b.push({ s0: c - CROSS_HALF - 9, s1: c + CROSS_HALF + 9 });
  b.push({ s0: T_JUNCTION - CROSS_HALF - 9, s1: T_JUNCTION + CROSS_HALF + 12 });
  if (side === PARK.side) b.push({ s0: PARK.s0, s1: PARK.s1 });
  if (side === SCHOOL.side) b.push({ s0: SCHOOL.s0, s1: SCHOOL.s1 });
  return b.sort((a, c) => a.s0 - c.s0);
}

/** Free stretches of one side between the blocked areas, within [S_MIN, T_JUNCTION]. */
export function freeStretches(side: 1 | -1): Blocked[] {
  const out: Blocked[] = [];
  let s = S_MIN + 4;
  for (const b of blockedFor(side)) {
    if (b.s0 > s) out.push({ s0: s, s1: Math.min(b.s0, T_JUNCTION - CROSS_HALF - 9) });
    s = Math.max(s, b.s1);
  }
  if (T_JUNCTION - CROSS_HALF - 9 > s) out.push({ s0: s, s1: T_JUNCTION - CROSS_HALF - 9 });
  return out.filter((r) => r.s1 - r.s0 >= 12);
}

/** Seeded house lots along both sides (deterministic per seed). */
export function makeLots(seed: number): Lot[] {
  const lots: Lot[] = [];
  for (const side of [1, -1] as const) {
    const rng = new Rng(hashInts(seed, side > 0 ? 0x51de : 0x1eff));
    for (const r of freeStretches(side)) {
      const span = r.s1 - r.s0;
      const n = Math.max(1, Math.round(span / rng.range(19, 23)));
      const w = span / n;
      for (let i = 0; i < n; i++) {
        const s0 = r.s0 + i * w;
        const s1 = s0 + w;
        const hw = Math.min(w - 5, rng.range(8.5, 12));
        const hs = (s0 + s1) / 2 + rng.range(-1, 1) * Math.max(0, (w - hw - 5) / 2);
        const garage = rng.chance(0.45);
        const driveOff = hw / 2 + 1.8;
        const dsgn = rng.sign();
        let drive: number | null = rng.chance(0.8) ? hs + dsgn * driveOff : null;
        if (drive !== null && (drive < s0 + 1.6 || drive > s1 - 1.6)) drive = hs - dsgn * driveOff;
        if (drive !== null && (drive < s0 + 1.6 || drive > s1 - 1.6 || nearCrosswalk(drive, 3) || inIntersection(drive, 3))) drive = null;
        const lotSeed = hashInts(seed, side, Math.round(s0 * 10));
        lots.push({
          side,
          s0,
          s1,
          hs,
          hw,
          hd: rng.range(7, 9),
          front: rng.range(13.5, 16),
          storeys: rng.chance(0.3) ? 2 : 1,
          wall: rng.pick(HOUSE_WALLS),
          roof: rng.pick(HOUSE_ROOFS),
          accent: rng.pick(HOUSE_ACCENTS),
          roofStyle: rng.weighted<RoofStyle>(['gableSide', 'gableFront', 'hip'], (k) => (k === 'gableSide' ? 3 : k === 'gableFront' ? 2 : 1)),
          porch: rng.chance(0.55),
          garage,
          drive,
          fence: rng.weighted<FenceStyle>(['picket', 'hedge', 'none'], (k) => (k === 'picket' ? 2 : k === 'hedge' ? 2 : 1.5)),
          trees: rng.int(0, 2),
          mailbox: rng.chance(0.85),
          flowers: rng.chance(0.7),
          seed: lotSeed,
        });
      }
    }
  }
  return lots;
}

// ── street furniture spots (pure) ────────────────────────────────────────────

/** Street-tree positions in the planting strips (both sides), skipping driveways, crosswalks and cross streets. */
export function streetTrees(lots: readonly Lot[], seed: number): { s: number; side: 1 | -1; k: number }[] {
  const out: { s: number; side: 1 | -1; k: number }[] = [];
  for (const side of [1, -1] as const) {
    const rng = new Rng(hashInts(seed, side, 0x7ee5));
    for (let s = S_MIN + 6; s < T_JUNCTION - 12; s += rng.range(16, 22)) {
      if (inIntersection(s, 6) || nearCrosswalk(s, 4)) continue;
      if (side === SCHOOL.side && s > DROPOFF.s0 - BAY.taperIn - 4 && s < DROPOFF.s1 + BAY.taperOut + 6) continue;
      if (lots.some((l) => l.side === side && l.drive !== null && Math.abs(l.drive - s) < 3.2)) continue;
      out.push({ s, side, k: rng.next() });
    }
  }
  return out;
}

/** Parked cars along the parking strips (never near crosswalks, cross streets, driveways or the drop-off). */
export function parkedCars(lots: readonly Lot[], seed: number): { s: number; side: 1 | -1; color: number; k: number }[] {
  const out: { s: number; side: 1 | -1; color: number; k: number }[] = [];
  const colors = [0xf2b84b, 0xe8918f, 0x7fb6a8, 0xb9a6e6, 0xf0efe8, 0x6f9fd8, 0xe07a5f];
  for (const side of [1, -1] as const) {
    const rng = new Rng(hashInts(seed, side, 0xca75));
    for (let s = 10; s < T_JUNCTION - 20; s += rng.range(26, 48)) {
      if (inIntersection(s, 9) || nearCrosswalk(s, 8)) continue;
      if (side === SCHOOL.side && s > DROPOFF.s0 - BAY.taperIn - 8 && s < DROPOFF.s1 + BAY.taperOut + 8) continue;
      if (side === PARK.side && s > PARK.s0 && s < PARK.s1 && rng.chance(0.6)) continue;
      if (lots.some((l) => l.side === side && l.drive !== null && Math.abs(l.drive - s) < 4.6)) continue;
      out.push({ s, side, color: rng.pick(colors), k: rng.next() });
    }
  }
  return out;
}
