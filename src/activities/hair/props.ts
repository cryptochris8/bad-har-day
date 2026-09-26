// Small props + staging math for the hair activity (the magnifying glass, brush layout, camera framings).
import * as THREE from 'three';
import type { BrushKind } from '../../hair/types';
import { GeoBuilder } from '../../render/models/builder';
import { cachedGeo } from '../../render/models/common';
import { modelMaterial } from '../../render/models/materials';
import { PAL } from '../../render/palette';
import type { CameraGoal } from '../../render/types';

/** Mom's magnifying glass (origin at the lens centre, lens facing +Z, handle down −Y). */
export function magnifier(): THREE.Mesh {
  const geo = cachedGeo('bhd-hair|magnifier', () => {
    const b = new GeoBuilder(true, true);
    b.torus(0.07, 0.011, 8, 22, PAL.goldTrim, { smooth: true });
    b.cyl(0.066, 0.066, 0.006, 20, PAL.glass, { rot: [Math.PI / 2, 0, 0], ink: false, glow: 0 });
    b.cyl(0.013, 0.016, 0.12, 8, PAL.woodDark, { at: [0, -0.135, 0], smooth: true });
    b.cyl(0.017, 0.017, 0.016, 8, PAL.goldTrim, { at: [0, -0.078, 0], smooth: true });
    return b.build();
  });
  const m = new THREE.Mesh(geo, modelMaterial());
  m.name = 'magnifier';
  return m;
}

/** Brush layout on the vanity counter (x offset from the counter centre), THE BLACK BRUSH in the middle. */
export const COUNTER_LAYOUT: readonly { kind: BrushKind; dx: number; yaw: number }[] = [
  { kind: 'purple', dx: -0.46, yaw: 0.18 },
  { kind: 'pink', dx: -0.22, yaw: -0.12 },
  { kind: 'black', dx: 0.02, yaw: 0.05 },
  { kind: 'teal', dx: 0.27, yaw: -0.2 },
];

/** Per-stool brushing camera, RELATIVE TO HER SEATED HEAD (solved offline against the vanity mirror, the
 *  neighbours and the UI band, with the measured seated rig: head ≈ stool + (0, 0.67, 0.2), hair tips ≈ 0.26 m
 *  further back). */
export interface ShotSide {
  /** −1 = camera to her left (−x), +1 = to her right. */
  side: -1 | 1;
  /** Lateral offset, height above her head centre, distance behind her head (m). */
  ax: number;
  up: number;
  back: number;
  /** Look-at point: lateral offset (× side), height relative to her head centre (0.35 m in front of her head). */
  tx: number;
  ty: number;
  fov: number;
}
export const SHOT_SIDES: readonly ShotSide[] = [
  // stool1 (left end): from her free left side.
  { side: -1, ax: 0.44, up: 0.12, back: 1.08, tx: -0.14, ty: -0.17, fov: 50 },
  // stool2 (middle): from her right, looking a little left past her.
  { side: 1, ax: 0.44, up: 0.14, back: 1.1, tx: -0.14, ty: -0.17, fov: 50 },
  // stool3 (right end): from her free right side.
  { side: 1, ax: 0.52, up: 0.12, back: 1.0, tx: 0.03, ty: -0.17, fov: 52 },
];

/**
 * Distance multiplier for narrow screens: pull the camera back only as far as needed for her whole head of hair
 * (≈ 0.66 m across incl. a margin, seen from ≈ 1.1 m) to fit the screen width. `tanHalfV` = tan(effective vertical
 * FOV / 2) — the camera rig already widens the FOV on portrait screens, so this is often 1.
 */
export function fitScale(aspect: number, tanHalfV: number): number {
  if (!(aspect > 0) || !(tanHalfV > 0)) return 1;
  const tanH = tanHalfV * aspect;
  return Math.max(1, Math.min(2.2, 0.33 / (tanH * 1.1)));
}

/**
 * Brushing close-up for a girl whose seated head centre is (hx, hy, hz), facing −Z. Her face shows in the
 * mirror in the middle band of the frame; the top ~22 % stays free for the portrait row. `scale` > 1 pulls the
 * camera back (portrait phones). `minX`/`maxX` keep the camera inside the room.
 */
export function brushingShot(hx: number, hy: number, hz: number, s: ShotSide, minX: number, maxX: number, out: CameraGoal, scale = 1): CameraGoal {
  const cx = Math.max(minX, Math.min(maxX, hx + s.side * s.ax));
  const tgt = { x: hx + s.side * s.tx, y: hy + s.ty, z: hz - 0.35 };
  const k = Math.max(1, scale);
  out.position = { x: tgt.x + (cx - tgt.x) * k, y: tgt.y + (hy + s.up - tgt.y) * k, z: tgt.z + (hz + s.back - tgt.z) * k };
  out.target = tgt;
  out.fov = s.fov;
  return out;
}

/**
 * Mom's inspection from behind (the knots are on the back of the hair): the girl's brushing view pulled back a
 * little and raised, so Mom — leaning in on the far side — and the magnifying glass are in frame too.
 */
export function inspectBackShot(hx: number, hy: number, hz: number, s: ShotSide, minX: number, maxX: number, out: CameraGoal, scale = 1): CameraGoal {
  brushingShot(hx, hy, hz, s, minX, maxX, out, scale * 1.15);
  out.position = { x: out.position.x, y: out.position.y + 0.2, z: out.position.z };
  out.target = { x: hx - s.side * 0.12, y: hy - 0.1, z: hz - 0.1 };
  out.fov = 56;
  return out;
}

/**
 * Mom's verdict, face to face: from the mirror side, a little to her side and higher, far enough back that Mom
 * (leaning in beside her) and the girl are both in frame — and low enough in the frame to stay clear of banners.
 */
export function inspectShot(sx: number, sz: number, headY: number, out: CameraGoal, side: -1 | 1 = 1): CameraGoal {
  out.position = { x: sx + 0.35 * side, y: headY + 0.42, z: sz - 1.02 };
  out.target = { x: sx + 0.08 * side, y: headY + 0.02, z: sz + 0.3 };
  out.fov = 56;
  return out;
}

/** Wide shot of the three stools + the mirror from behind (the scramble, Mom's entrance reverse). */
export function wideShot(vanityX: number, stoolZ: number): CameraGoal {
  return { position: { x: vanityX + 0.05, y: 1.85, z: stoolZ + 2.0 }, target: { x: vanityX, y: 1.02, z: stoolZ - 0.55 }, fov: 46 };
}
