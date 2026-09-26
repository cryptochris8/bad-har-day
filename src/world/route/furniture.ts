// Street furniture: maple street trees in the planting strips, lamp posts, parked cars, hydrants, the
// traffic-signal masts (the bulbs are a separate dynamic mesh, see signals.ts), sign posts and the little
// decorative lawn sprinkler.
import { PAL } from '../../render/palette';
import { hash01 } from '../../render/models/builder';
import { faceRoadYaw, type Chunks } from './chunks';
import { BAY, CROSS_HALF, DROPOFF, INTERSECTIONS, S_MIN, T_JUNCTION, XS, inIntersection, nearCrosswalk, parkedCars, streetTrees, type Lot } from './layout';
import { LEAF_SETS, hydrant, lampPost, parkedCar, roundTree } from './shapes';

/** Signal mast geometry shared with signals.ts: heads hang over each lane at this height / s offset. */
export const SIGNAL = { poleX: 6.3, armY: 5.9, headY: 5.15, headS: CROSS_HALF + 1.2, headXs: [-1.8, 1.8] as const } as const;

export function buildFurniture(ch: Chunks, lots: readonly Lot[], seed: number): void {
  // street trees (a row of maples with a seasonal mix of colours)
  const leafRng = (k: number) => LEAF_SETS[Math.floor(k * LEAF_SETS.length) % LEAF_SETS.length]!;
  for (const t of streetTrees(lots, seed)) {
    const f = ch.frame(t.s, t.side * 5.9, 0);
    const h = 5.4 + t.k * 1.4;
    const r = 1.55 + t.k * 0.35;
    roundTree(f, 0, 0, h, r, Math.round(t.s * 13) + (t.side > 0 ? 1 : 2), leafRng(hash01(seed, Math.round(t.s), t.side)));
    ch.proxyTree(t.s, t.side * 5.9, h, r);
  }
  // lamp posts, alternating sides
  let k = 0;
  for (let s = S_MIN + 20; s < T_JUNCTION - 10; s += 44, k++) {
    if (inIntersection(s, 4) || nearCrosswalk(s, 3)) continue;
    const side: 1 | -1 = k % 2 ? 1 : -1;
    if (side > 0 && s > DROPOFF.s0 - BAY.taperIn - 3 && s < DROPOFF.s1 + BAY.taperOut + 7) continue;
    if (lots.some((l) => l.side === side && l.drive !== null && Math.abs(l.drive - s) < 3)) continue;
    const f = ch.frame(s, side * 5.75, faceRoadYaw(side));
    lampPost(f, 0, 0, 1);
  }
  // parked cars (both parking strips; the street is one-way, so they all face the same way)
  for (const c of parkedCars(lots, seed)) {
    const f = ch.frame(c.s, c.side * XS.parkX, Math.PI);
    parkedCar(f, 0, 0, c.color, Math.round(c.s * 7));
  }
  // hydrants near each intersection
  for (const c of INTERSECTIONS) {
    hydrant(ch.frame(c - CROSS_HALF - 4.5, 5.9, 0), 0, 0);
    hydrant(ch.frame(c + CROSS_HALF + 5.5, -5.9, 0), 0, 0);
  }
  // traffic-signal masts: pole on the far right corner, arm across both lanes
  for (const c of INTERSECTIONS) {
    const s = c + SIGNAL.headS;
    const f = ch.frame(s, 0, 0);
    f.cyl(0.13, 0.16, SIGNAL.armY + 0.3, 8, PAL.signalBox, SIGNAL.poleX, (SIGNAL.armY + 0.3) / 2, 0);
    f.cyl(0.24, 0.28, 0.4, 8, PAL.signalBox, SIGNAL.poleX, 0.2, 0);
    f.cyl(0.07, 0.09, SIGNAL.poleX + 3.2, 6, PAL.signalBox, (SIGNAL.poleX - 3.2) / 2, SIGNAL.armY, 0, { rot: [0, 0, Math.PI / 2] });
    for (const hx of SIGNAL.headXs) {
      f.box(0.05, SIGNAL.armY - SIGNAL.headY - 0.55, 0.05, PAL.signalBox, hx, (SIGNAL.armY + SIGNAL.headY + 0.55) / 2, 0, { ink: false });
      f.rbox(0.46, 1.22, 0.34, 0.08, PAL.signalBox, hx, SIGNAL.headY, 0, {}, 1);
      f.rbox(0.62, 1.38, 0.05, 0.05, PAL.signalBox, hx, SIGNAL.headY, -0.2, {}, 1);
      for (let i = 0; i < 3; i++) f.box(0.34, 0.05, 0.16, PAL.signalBox, hx, SIGNAL.headY + 0.38 - i * 0.37 + 0.16, 0.24, { rot: [0.4, 0, 0], ink: false });
    }
    // pedestrian push-button post + a second small head on the near right corner
    const n = ch.frame(c - CROSS_HALF - 1.8, 0, 0);
    n.cyl(0.08, 0.1, 3.4, 7, PAL.signalBox, 6.2, 1.7, 0);
  }
}
