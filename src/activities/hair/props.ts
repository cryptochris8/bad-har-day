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

/** Per-stool brushing camera: which side it comes from and how far out (outer girls use their free side). */
export interface ShotSide {
  side: -1 | 1;
  ax: number;
  up: number;
  back: number;
}
export const SHOT_SIDES: readonly ShotSide[] = [
  { side: -1, ax: 0.68, up: 0.26, back: 0.92 }, // stool1 (left end): from her left
  { side: 1, ax: 0.42, up: 0.3, back: 1.02 }, // stool2 (middle): small right offset, the gap before her sister
  { side: 1, ax: 0.68, up: 0.26, back: 0.92 }, // stool3 (right end): from her right
];

/**
 * Brushing close-up for a girl seated at stool (sx, sz) (head centre height `headY`) facing −Z: a 3/4 back view
 * a little above her head, looking down at her hair. The lateral offset is chosen so her face shows in the
 * mirror beside her own head (not behind it, not behind a sister, not under the portrait row); solved offline
 * for the vanity layout. `minX`/`maxX` keep the camera inside the room.
 */
export function brushingShot(sx: number, sz: number, headY: number, s: ShotSide, minX: number, maxX: number, out: CameraGoal): CameraGoal {
  const cx = Math.max(minX, Math.min(maxX, sx + s.side * s.ax));
  const lean = (cx - sx) * 0.14;
  out.position = { x: cx, y: headY + s.up, z: sz + s.back };
  out.target = { x: sx + lean, y: headY - 0.33, z: sz - 0.25 };
  out.fov = 50;
  return out;
}

/** Mom's inspection: from the mirror side, looking back at the girl's face with Mom leaning in behind her. */
export function inspectShot(sx: number, sz: number, headY: number, out: CameraGoal): CameraGoal {
  out.position = { x: sx + 0.18, y: headY + 0.34, z: sz - 0.92 };
  out.target = { x: sx - 0.02, y: headY + 0.12, z: sz + 0.35 };
  out.fov = 52;
  return out;
}

/** Wide shot of the three stools + the mirror from behind (the scramble, Mom's entrance reverse). */
export function wideShot(vanityX: number, stoolZ: number): CameraGoal {
  return { position: { x: vanityX + 0.05, y: 1.85, z: stoolZ + 2.0 }, target: { x: vanityX, y: 1.02, z: stoolZ - 0.55 }, fov: 46 };
}
