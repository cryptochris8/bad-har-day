// Pure geometry helpers shared by the wake + rush activities (no three.js, no DOM) — tested in tests/activities/wake.

/** Index of the nearest enabled item within its reach (−1 = none). */
export function nearestInReach(px: number, pz: number, items: readonly { x: number; z: number; r: number; enabled: boolean }[]): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!it.enabled) continue;
    const d = Math.hypot(it.x - px, it.z - pz);
    if (d <= it.r && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/** Index of the item whose screen point is nearest the tap within `maxPx` (−1 = none). */
export function nearestOnScreen(tx: number, ty: number, pts: readonly { x: number; y: number; ok: boolean }[], maxPx: number): number {
  let best = -1;
  let bestD = maxPx;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    if (!p.ok) continue;
    const d = Math.hypot(p.x - tx, p.y - ty);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

/**
 * First free spot around (cx, cz): tries each radius, 16 directions ordered by closeness to the preferred direction
 * (radians, 0 = +Z). Writes `out`; false when nothing fits (out = centre).
 */
export function freeSpotNear(
  free: (x: number, z: number, r: number) => boolean,
  cx: number,
  cz: number,
  preferYaw: number,
  out: { x: number; z: number },
  radii: readonly number[] = [0.6, 0.8, 1.0, 1.3, 1.6],
  r = 0.3,
): boolean {
  for (const rad of radii) {
    for (let k = 0; k < 16; k++) {
      // 0, +1, −1, +2, −2 … steps of 22.5° away from the preferred direction
      const step = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2);
      const a = preferYaw + step * (Math.PI / 8);
      const x = cx + Math.sin(a) * rad;
      const z = cz + Math.cos(a) * rad;
      if (free(x, z, r)) {
        out.x = x;
        out.z = z;
        return true;
      }
    }
  }
  out.x = cx;
  out.z = cz;
  return false;
}

/** Yaw that faces from (fx, fz) toward (tx, tz) (0 = +Z). */
export function yawTo(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, tz - fz);
}

/**
 * The root position for a sleeper in bed. Bed anchors mark the sleeper's FEET (yaw = head toward local −Z); the
 * 'lie' pose centres the body on the root, so it goes half a body-height toward the headboard.
 */
export function bedRoot(anchor: { x: number; z: number; yaw: number }, height: number): { x: number; z: number } {
  const h = height / 2;
  return { x: anchor.x - Math.sin(anchor.yaw) * h, z: anchor.z - Math.cos(anchor.yaw) * h };
}

/** A point `d` metres in front of an anchor along its yaw (e.g. a bowl's place in front of a seat). */
export function ahead(a: { x: number; z: number; yaw: number }, d: number): { x: number; z: number } {
  return { x: a.x + Math.sin(a.yaw) * d, z: a.z + Math.cos(a.yaw) * d };
}
