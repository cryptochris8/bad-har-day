// ─────────────────────────────────────────────────────────────────────────────
// Dollhouse cut-away selection (pure, unit-tested). Decides per wall segment
// whether it stands full height (1) or drops to the cut height (0).
//
// 'dollhouse': the camera is the fixed DOLLHOUSE_VIEW rig looking −Z at the focus.
//   The "neighbourhood" we must see = the focus room (inside) or a square around
//   the focus (outside, clipped so it never reaches into the house). A wall is cut
//   when the ground strip it hides from the camera overlaps that neighbourhood.
//   Result: the focus room's south wall + everything in front of it goes down,
//   its north and side walls stay up as a cosy backdrop.
// 'closeup': only walls crossing the camera → focus line (ground projection) drop.
// ─────────────────────────────────────────────────────────────────────────────
import { DOLLHOUSE_VIEW } from './types';
import { HOUSE, WALL_H, roomAt, roomBounds, roomDef, type Rect, type WallDef } from './layout';

const DEG = Math.PI / 180;
/** Horizontal camera offset (m, +Z of the focus) and camera height above the floor for the dollhouse rig. */
export const DOLL_CAM_D = DOLLHOUSE_VIEW.distance * Math.cos(DOLLHOUSE_VIEW.pitchDeg * DEG);
export const DOLL_CAM_H = DOLLHOUSE_VIEW.distance * Math.sin(DOLLHOUSE_VIEW.pitchDeg * DEG) + DOLLHOUSE_VIEW.focusY;

export interface CutView {
  mode: 'dollhouse' | 'closeup';
  fx: number;
  fz: number;
  camX: number;
  camY: number;
  camZ: number;
}

export interface MutRect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Neighbourhood that must stay visible around the focus (see header). */
export function focusNeighbourhood(fx: number, fz: number, out: MutRect): MutRect {
  const room = roomAt(fx, fz);
  if (room && roomDef(room).inside) {
    const b = roomBounds(room);
    out.x0 = b.x0;
    out.z0 = b.z0;
    out.x1 = b.x1;
    out.z1 = b.z1;
    return out;
  }
  const R = 2.8;
  out.x0 = fx - R;
  out.x1 = fx + R;
  out.z0 = fz - R;
  out.z1 = fz + R;
  const insideX = fx > HOUSE.x0 && fx < HOUSE.x1;
  const insideZ = fz > HOUSE.z0 && fz < HOUSE.z1;
  // Outside the house: never reach into it (the facade stays up as a backdrop).
  if (fz >= HOUSE.z1 && insideX) out.z0 = Math.max(out.z0, HOUSE.z1 + 0.15);
  else if (fz <= HOUSE.z0 && insideX) out.z1 = Math.min(out.z1, HOUSE.z0 - 0.15);
  else if (fx >= HOUSE.x1 && insideZ) out.x0 = Math.max(out.x0, HOUSE.x1 + 0.15);
  else if (fx <= HOUSE.x0 && insideZ) out.x1 = Math.min(out.x1, HOUSE.x0 - 0.15);
  else if (!insideX && !insideZ) {
    // diagonal: keep out of the house footprint on the nearer axis
    const dx = fx < HOUSE.x0 ? HOUSE.x0 - fx : fx - HOUSE.x1;
    const dz = fz < HOUSE.z0 ? HOUSE.z0 - fz : fz - HOUSE.z1;
    if (dx >= dz) {
      if (fx < HOUSE.x0) out.x1 = Math.min(out.x1, HOUSE.x0 - 0.15);
      else out.x0 = Math.max(out.x0, HOUSE.x1 + 0.15);
    } else if (fz > HOUSE.z1) out.z0 = Math.max(out.z0, HOUSE.z1 + 0.15);
    else out.z1 = Math.min(out.z1, HOUSE.z0 - 0.15);
  }
  return out;
}

const overlap = (a0: number, a1: number, b0: number, b1: number, eps = 0.06): boolean => Math.min(a1, b1) - Math.max(a0, b0) > eps;

/**
 * Ground region hidden by a full-height wall seen from a camera at (camX, camY, camZ) (camera assumed south,
 * +Z, of the wall). Written to `out`; returns false when the wall hides nothing relevant (camera behind it).
 */
export function hiddenRegion(w: WallDef, camX: number, camY: number, camZ: number, out: MutRect): boolean {
  const h = WALL_H;
  const lift = camY - h;
  if (lift <= 0.2) return false;
  if (w.axis === 'x') {
    const d = camZ - w.c;
    if (d <= 0) return false;
    const reach = (h * d) / lift;
    out.z0 = w.c - reach;
    out.z1 = w.c;
    // perspective spread at the ends
    const sa = (h * (w.a - camX)) / lift;
    const sb = (h * (w.b - camX)) / lift;
    out.x0 = Math.min(w.a, w.a + sa);
    out.x1 = Math.max(w.b, w.b + sb);
    return true;
  }
  // N-S wall: hides a strip on the side away from the camera, and pushes north by the reach at its south end
  const d = camZ - w.a;
  if (d <= 0) return false;
  const reach = (h * d) / lift;
  const side = (h * (w.c - camX)) / lift;
  out.x0 = Math.min(w.c, w.c + side);
  out.x1 = Math.max(w.c, w.c + side);
  out.z0 = w.a - reach;
  out.z1 = w.b;
  return true;
}

/** 2D segment (ax,az)→(bx,bz) vs axis-aligned rect intersection (slab test). */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: MutRect | Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - r.x0) && clip(dx, r.x1 - ax) && clip(-dz, az - r.z0) && clip(dz, r.z1 - az) && t0 <= t1;
}

const nb: MutRect = { x0: 0, z0: 0, x1: 0, z1: 0 };
const hid: MutRect = { x0: 0, z0: 0, x1: 0, z1: 0 };
const wr: MutRect = { x0: 0, z0: 0, x1: 0, z1: 0 };

/**
 * Fill `out[w.id]` with the target level (1 = full height, 0 = cut) for every wall. `out[0]` = 1 (never cut).
 * Allocation-free.
 */
export function computeCutTargets(walls: readonly WallDef[], v: CutView, out: Float32Array): void {
  out[0] = 1;
  if (v.mode === 'dollhouse') {
    focusNeighbourhood(v.fx, v.fz, nb);
    const camX = v.fx;
    const camY = DOLL_CAM_H;
    const camZ = v.fz + DOLL_CAM_D;
    // lateral window: the view is ≈ 16 m wide at the focus
    const lx0 = v.fx - 9.5;
    const lx1 = v.fx + 9.5;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i]!;
      let cut = false;
      if (hiddenRegion(w, camX, camY, camZ, hid)) {
        cut = overlap(hid.x0, hid.x1, nb.x0, nb.x1) && overlap(hid.z0, hid.z1, nb.z0, nb.z1);
        if (cut) {
          const wx0 = w.axis === 'x' ? w.a : w.c;
          const wx1 = w.axis === 'x' ? w.b : w.c;
          if (wx1 < lx0 || wx0 > lx1) cut = false;
        }
      }
      out[w.id] = cut ? 0 : 1;
    }
    return;
  }
  // close-up: walls crossing the camera → focus ground line (padded) drop
  const pad = 0.22;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i]!;
    const h = w.t / 2 + pad;
    if (w.axis === 'x') {
      wr.x0 = w.a - 0.05;
      wr.x1 = w.b + 0.05;
      wr.z0 = w.c - h;
      wr.z1 = w.c + h;
    } else {
      wr.x0 = w.c - h;
      wr.x1 = w.c + h;
      wr.z0 = w.a - 0.05;
      wr.z1 = w.b + 0.05;
    }
    // the focus itself sits against a wall (stations): ignore the last 0.45 m of the line
    const dx = v.fx - v.camX;
    const dz = v.fz - v.camZ;
    const len = Math.hypot(dx, dz);
    const k = len > 0.5 ? (len - 0.45) / len : 0;
    const hit = k > 0 && segmentHitsRect(v.camX, v.camZ, v.camX + dx * k, v.camZ + dz * k, wr);
    out[w.id] = hit ? 0 : 1;
  }
}
