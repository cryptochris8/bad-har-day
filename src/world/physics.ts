// ─────────────────────────────────────────────────────────────────────────────
// Collision world + navigation grid assembled from the pure layout (no three.js).
// Walls (windows are solid), furniture, yard fence, hedges → static colliders.
// Closed doors and the parked cars → dynamic rects (doors toggle, cars follow
// their roots). The nav grid ignores doors (closed doors count as open).
// ─────────────────────────────────────────────────────────────────────────────
import { CollisionWorld, type CircleShape, type DynRect } from './collision';
import {
  BOUNDS,
  CAR_PARK,
  DOORS,
  FENCES,
  FENCE_T,
  FURN,
  OUT,
  WALLS,
  box,
  doorRect,
  rect,
  solidPieces,
  wallRect,
  type Furn,
  type Rect,
} from './layout';
import { buildNavGrid, findPath, isWalkable, nearestWalkable, type NavGrid } from './nav';

export interface WorldPhysics {
  readonly col: CollisionWorld;
  readonly nav: NavGrid;
  readonly doors: Record<'front' | 'back', DynRect>;
  readonly cars: Record<'minivan' | 'ashley', DynRect>;
}

export const HEDGE_T = 0.7;

export function staticColliders(): { rects: Rect[]; circles: CircleShape[] } {
  const rects: Rect[] = [];
  const circles: CircleShape[] = [];
  for (const w of WALLS) for (const [a, b] of solidPieces(w)) rects.push(wallRect(w, a, b));
  const addFurn = (f: Furn) => {
    if (!f.solid) return;
    if (f.circle !== undefined) circles.push({ x: (f.r.x0 + f.r.x1) / 2, z: (f.r.z0 + f.r.z1) / 2, r: f.circle });
    else rects.push(f.r);
  };
  for (const f of Object.values(FURN) as Furn[]) addFurn(f);
  for (const f of Object.values(OUT) as Furn[]) addFurn(f);
  for (const fr of FENCES) {
    const t = (fr.kind === 'hedge' ? HEDGE_T : FENCE_T) / 2;
    rects.push(rect(Math.min(fr.x0, fr.x1) - t, Math.min(fr.z0, fr.z1) - t, Math.max(fr.x0, fr.x1) + t, Math.max(fr.z0, fr.z1) + t));
  }
  return { rects, circles };
}

/** Axis-aligned footprint of a parked car (yaw ≈ 0 or π). */
export function carRect(x: number, z: number, yaw: number, w: number, l: number): Rect {
  const along = Math.abs(Math.cos(yaw)) > 0.7;
  return along ? box(x, z, w, l) : box(x, z, l, w);
}

export function buildPhysics(): WorldPhysics {
  const { rects, circles } = staticColliders();
  const col = new CollisionWorld(BOUNDS, rects, circles);
  const doors = {
    front: col.addDynamic(doorRect(DOORS[0]!), true),
    back: col.addDynamic(doorRect(DOORS[1]!), true),
  };
  const mv = CAR_PARK.minivan;
  const ac = CAR_PARK.ashley;
  const cars = {
    minivan: col.addDynamic(carRect(mv.x, mv.z, mv.yaw, mv.w, mv.l), true),
    ashley: col.addDynamic(carRect(ac.x, ac.z, ac.yaw, ac.w, ac.l), true),
  };
  const carStatic = [carRect(mv.x, mv.z, mv.yaw, mv.w, mv.l), carRect(ac.x, ac.z, ac.yaw, ac.w, ac.l)];
  const nav = buildNavGrid(BOUNDS, (onRect, onCircle) => {
    col.forEachStatic(onRect, onCircle);
    for (const c of carStatic) onRect(c.x0, c.z0, c.x1, c.z1);
  });
  return { col, nav, doors, cars };
}

export interface GroundPt {
  x: number;
  y: number;
  z: number;
}

/** World navPath: ground points (y = 0) ending at `to` (or the nearest walkable spot). Never null: falls back to [to]. */
export function navPathOn(nav: NavGrid, fx: number, fz: number, tx: number, tz: number): GroundPt[] {
  const pts = findPath(nav, fx, fz, tx, tz);
  if (!pts) {
    const p = isWalkable(nav, tx, tz) ? { x: tx, z: tz } : (nearestWalkable(nav, tx, tz, 3) ?? { x: tx, z: tz });
    return [{ x: p.x, y: 0, z: p.z }];
  }
  if (pts.length === 0) return [{ x: tx, y: 0, z: tz }];
  return pts.map((p) => ({ x: p.x, y: 0, z: p.z }));
}
