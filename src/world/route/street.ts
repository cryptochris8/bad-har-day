// The street surfaces (flat, un-inked scenery): asphalt with the parking strips, lane dashes and edge lines,
// curbs, sidewalks (two-tone slabs), cross streets, zebra crosswalks, stop lines, the drop-off bay (the right
// curb swings out), driveways and front walks.
import { PAL } from '../../render/palette';
import { shadeHex } from '../../render/models/builder';
import type { Chunks } from './chunks';
import {
  BAY,
  CROSSWALKS,
  CROSSWALK_HALF,
  CROSSWALK_STOP,
  CROSS_HALF,
  DROPOFF,
  INTERSECTIONS,
  LIGHTS,
  S_MAX,
  S_MIN,
  T_JUNCTION,
  XS,
  curbX,
  inIntersection,
  nearCrosswalk,
  type Lot,
} from './layout';

const ROAD_Y = -0.02;
const ROAD_H = 0.04;
const PAINT_Y = 0.004;
const PAINT_H = 0.012;
const WALK_Y = 0.03;
const WALK_H = 0.1;
const CURB_H = 0.16;
const CROSS_X = XS.ground - 2;

/** s ranges of the main road that are NOT cross streets (for curbs / sidewalks / edge lines). */
function segments(s0: number, s1: number, pad: number): [number, number][] {
  const cuts = [...INTERSECTIONS.map((c) => [c - CROSS_HALF - pad, c + CROSS_HALF + pad] as [number, number]), [T_JUNCTION - CROSS_HALF - pad, S_MAX + 100] as [number, number]].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let s = s0;
  for (const [a, b] of cuts) {
    if (a > s) out.push([s, Math.min(a, s1)]);
    s = Math.max(s, b);
    if (s >= s1) break;
  }
  if (s < s1) out.push([s, s1]);
  return out.filter(([a, b]) => b - a > 0.1);
}

export function buildStreet(ch: Chunks, lots: readonly Lot[]): void {
  const endS = T_JUNCTION + CROSS_HALF;
  const asphalt = PAL.asphalt;
  // ── main road (both parking strips included) ──
  ch.strip(S_MIN, endS, -XS.curb0, XS.curb0, ROAD_Y, ROAD_H, asphalt);
  // parking strips a touch darker
  for (const side of [-1, 1] as const) {
    const x0 = side > 0 ? XS.lane + 0.08 : -XS.curb0;
    const x1 = side > 0 ? XS.curb0 : -XS.lane - 0.08;
    for (const [a, b] of segments(S_MIN, endS, 0)) ch.strip(a, b, x0, x1, ROAD_Y + 0.001, ROAD_H, shadeHex(asphalt, 0.95));
  }
  // drop-off bay asphalt (the right curb swings out)
  const bs0 = DROPOFF.s0 - BAY.taperIn;
  const bs1 = DROPOFF.s1 + 4 + BAY.taperOut;
  for (let s = bs0; s < bs1; s += 1.5) {
    const s2 = Math.min(bs1, s + 1.5);
    const xa = curbX(s, 1);
    const xb = curbX(s2, 1);
    const b = ch.flatAt(s);
    // hexa corner order: (−x,−z) (+x,−z) (+x,+z) (−x,+z) — −z is the FAR end (s2)
    b.hexa(
      [
        [XS.curb0 - 0.05, ROAD_Y - ROAD_H / 2, -s2],
        [Math.max(xa, xb), ROAD_Y - ROAD_H / 2, -s2],
        [Math.max(xa, xb), ROAD_Y - ROAD_H / 2, -s],
        [XS.curb0 - 0.05, ROAD_Y - ROAD_H / 2, -s],
        [XS.curb0 - 0.05, ROAD_Y + ROAD_H / 2, -s2],
        [xb, ROAD_Y + ROAD_H / 2, -s2],
        [xa, ROAD_Y + ROAD_H / 2, -s],
        [XS.curb0 - 0.05, ROAD_Y + ROAD_H / 2, -s],
      ],
      shadeHex(asphalt, 1.04),
    );
  }
  // ── cross streets ──
  for (const c of [...INTERSECTIONS, T_JUNCTION]) {
    for (const side of [-1, 1] as const) {
      const x0 = side > 0 ? XS.curb0 : -CROSS_X;
      const x1 = side > 0 ? CROSS_X : -XS.curb0;
      ch.strip(c - CROSS_HALF, c + CROSS_HALF, x0, x1, ROAD_Y, ROAD_H, PAL.asphaltPatch);
      // centre dashes of the cross street
      for (let x = XS.walk1 + 2; x < CROSS_X - 2; x += 6) ch.strip(c - 0.08, c + 0.08, side > 0 ? x : -x - 2.6, side > 0 ? x + 2.6 : -x, PAINT_Y, PAINT_H, PAL.asphaltLine);
      // cross-street sidewalks + curbs
      for (const e of [-1, 1]) {
        const cs = c + e * (CROSS_HALF + 0.1);
        ch.strip(Math.min(cs, cs + e * 0.2), Math.max(cs, cs + e * 0.2), side > 0 ? XS.curb0 + 0.1 : -CROSS_X, side > 0 ? CROSS_X : -XS.curb0 - 0.1, 0.05, CURB_H, PAL.curb);
        const w0 = c + e * (CROSS_HALF + 1.6);
        const w1 = c + e * (CROSS_HALF + 3.4);
        ch.strip(Math.min(w0, w1), Math.max(w0, w1), side > 0 ? XS.strip1 : -CROSS_X, side > 0 ? CROSS_X : -XS.strip1, WALK_Y, WALK_H, PAL.sidewalk);
      }
    }
    // the T-junction: the far side is one continuous curb + sidewalk across the whole street
    if (c === T_JUNCTION) {
      ch.strip(c + CROSS_HALF + 0.1, c + CROSS_HALF + 0.3, -CROSS_X, CROSS_X, 0.05, CURB_H, PAL.curb);
      ch.strip(c + CROSS_HALF + 1.6, c + CROSS_HALF + 3.4, -CROSS_X, CROSS_X, WALK_Y, WALK_H, PAL.sidewalk);
      ch.strip(c - CROSS_HALF, c + CROSS_HALF, -XS.curb0, XS.curb0, ROAD_Y + 0.002, ROAD_H, PAL.asphaltPatch);
    }
    // zebra crossings on both sides of the intersection (not across the T's far side)
    for (const e of c === T_JUNCTION ? [-1] : [-1, 1]) zebra(ch, c + e * (CROSS_HALF + 2.4), 1.2);
  }
  // ── lane paint ──
  for (const [a, b] of segments(S_MIN, endS, 2)) {
    // dashed centre line (both lanes run our way)
    for (let s = a + 1; s + 3 < b; s += 7.5) {
      if (nearCrosswalk(s, 1.2) || nearCrosswalk(s + 3, 1.2)) continue;
      ch.strip(s, s + 3, -0.07, 0.07, PAINT_Y, PAINT_H, PAL.laneWhite);
    }
    // edge lines between the lanes and the parking strips
    for (const side of [-1, 1] as const) {
      let s = a;
      const x = side * (XS.lane + 0.04);
      for (const cw of [...CROSSWALKS, Number.POSITIVE_INFINITY]) {
        const e = Math.min(b, cw - CROSSWALK_HALF - 0.6);
        if (e > s + 0.5) ch.strip(s, e, x - 0.06, x + 0.06, PAINT_Y, PAINT_H, PAL.laneWhite);
        s = Math.max(s, cw + CROSSWALK_HALF + 0.6);
        if (s >= b) break;
      }
    }
  }
  // mid-block zebras + their stop lines
  for (const cw of CROSSWALKS) {
    zebra(ch, cw, CROSSWALK_HALF);
    ch.strip(cw - CROSSWALK_STOP + 0.35, cw - CROSSWALK_STOP + 0.75, -XS.lane, XS.lane, PAINT_Y, PAINT_H, PAL.laneWhite);
  }
  // traffic-light stop lines
  for (const l of LIGHTS) ch.strip(l + 0.1, l + 0.6, -XS.lane, XS.lane, PAINT_Y, PAINT_H, PAL.laneWhite);
  // drop-off bay lane line (dashed yellow) + stop marks
  for (let s = DROPOFF.s0 - 6; s < DROPOFF.s1 + 2; s += 3) ch.strip(s, s + 1.6, XS.curb0 - 0.2, XS.curb0 - 0.06, PAINT_Y, PAINT_H, PAL.laneYellow);

  // ── curbs + planting strips + sidewalks ──
  for (const side of [-1, 1] as const) {
    for (const [a, b] of segments(S_MIN, endS - CROSS_HALF, 0.2)) {
      // curbs: long straight runs (lowered at driveways), the bay curve in 2 m hexa steps on the right
      const drives = lots.filter((l) => l.side === side && l.drive !== null).map((l) => l.drive!);
      const cuts: number[] = [a, b];
      for (const d of drives) if (d > a && d < b) cuts.push(d - 1.7, d + 1.7);
      const bay0 = DROPOFF.s0 - BAY.taperIn;
      const bay1 = DROPOFF.s1 + 4 + BAY.taperOut;
      if (side > 0 && bay0 < b && bay1 > a) cuts.push(Math.max(a, bay0), Math.min(b, bay1));
      cuts.sort((p, q) => p - q);
      for (let i = 0; i < cuts.length - 1; i++) {
        const s0 = cuts[i]!;
        const s1 = cuts[i + 1]!;
        if (s1 - s0 < 0.05) continue;
        const mid = (s0 + s1) / 2;
        const inDrive = drives.some((d) => Math.abs(mid - d) < 1.7);
        const h = inDrive ? 0.05 : CURB_H;
        const yy = inDrive ? 0.0 : 0.05;
        if (side > 0 && mid > bay0 && mid < bay1) {
          for (let t = s0; t < s1 - 1e-3; t += 2) {
            const t2 = Math.min(s1, t + 2);
            const x0 = curbX(t, 1);
            const x1 = curbX(t2, 1);
            ch.flatAt((t + t2) / 2).hexa(
              [
                [x1, yy - h / 2, -t2],
                [x1 + 0.2, yy - h / 2, -t2],
                [x0 + 0.2, yy - h / 2, -t],
                [x0, yy - h / 2, -t],
                [x1, yy + h / 2, -t2],
                [x1 + 0.2, yy + h / 2, -t2],
                [x0 + 0.2, yy + h / 2, -t],
                [x0, yy + h / 2, -t],
              ],
              PAL.curb,
            );
          }
        } else {
          const xa = side > 0 ? XS.curb0 : -XS.curb1;
          ch.strip(s0, s1, xa, xa + 0.2, yy, h, PAL.curb);
        }
      }
      // sidewalk slabs (two-tone), pushed out around the bay
      let k = 0;
      for (let t = a; t < b - 0.2; t += 4.8, k++) {
        const t2 = Math.min(b, t + 4.8);
        const mid = (t + t2) / 2;
        const inner = side > 0 ? Math.max(XS.strip1, curbX(mid, 1) + 0.25) : XS.strip1;
        const w = XS.walk1 - XS.strip1;
        const x0 = side * inner;
        const x1 = side * (inner + w);
        const col = k % 2 ? PAL.sidewalk : shadeHex(PAL.sidewalk, 0.96);
        ch.strip(t + 0.03, t2 - 0.03, Math.min(x0, x1), Math.max(x0, x1), WALK_Y, WALK_H, col);
      }
    }
  }
  // driveways + front walks
  for (const l of lots) {
    const side = l.side;
    if (l.drive !== null && !inIntersection(l.drive, 3)) {
      const x0 = XS.curb0 + 0.2;
      const x1 = l.front + (l.garage ? 0.1 : -2);
      ch.strip(l.drive - 1.6, l.drive + 1.6, side > 0 ? x0 : -x1, side > 0 ? x1 : -x0, -0.004, 0.05, PAL.driveway);
    }
    const door = doorS(l);
    ch.strip(door - 0.6, door + 0.6, side > 0 ? XS.walk1 : -l.front, side > 0 ? l.front : -XS.walk1, 0.0, 0.05, PAL.paver);
  }
}

/** Along-s position of a lot's front door (the front walk leads there). */
export function doorS(l: Lot): number {
  return l.hs + (l.side > 0 ? 1 : -1) * l.hw * 0.18;
}

/** Zebra crossing across the main road at s (stripes run along s). */
function zebra(ch: Chunks, s: number, half: number): void {
  for (let x = -XS.curb0 + 0.45; x < XS.curb0 - 0.3; x += 1.05) ch.strip(s - half, s + half, x, x + 0.55, PAINT_Y + 0.001, PAINT_H, PAL.laneWhite);
}
