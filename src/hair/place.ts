// Brush placement on the hair (for the brushing activity + dev page).
// Puts a brush (origin = grip, head along +Y, bristles +Z) so its paddle's bristle tips rest ON the hair
// surface at (u, v), bristles pointing into the hair, the head pointing up the lock and leaning toward
// screen-left (u → 0) like a right hand brushing from behind.
import * as THREE from 'three';
import type { HairRig } from './types';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3();
const _a = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Distance from the brush origin to the paddle centre along +Y (≈ all paddle brushes). */
export const BRUSH_HEAD_OFFSET = 0.116;
/** Bristle tip depth along +Z. */
export const BRUSH_TIP_DEPTH = 0.028;

export interface BrushPoseOpts {
  /** Lean of the head toward u → 0 (rad, default 0.55). */
  lean?: number;
  /** Extra lift off the surface (m) — e.g. hovering before pressing in. */
  lift?: number;
}

/**
 * World pose for a brush touching the hair at (u, v). Writes position + quaternion (world). If the brush's
 * parent is transformed, convert with parent.worldToLocal / the parent's inverse world quaternion.
 */
export function brushPoseOnHair(rig: HairRig, u: number, v: number, position: THREE.Vector3, quaternion: THREE.Quaternion, o: BrushPoseOpts = {}): void {
  const lean = o.lean ?? 0.55;
  rig.surfacePoint(u, v, _p);
  rig.surfaceNormal(u, v, _n);
  // Up the lock: from (u, v + dv) to (u, v − dv).
  rig.surfacePoint(u, Math.max(0, v - 0.04), _up);
  rig.surfacePoint(u, Math.min(1, v + 0.04), _a);
  _up.sub(_a);
  // Toward u → 0 (screen-left from behind).
  rig.surfacePoint(Math.max(0, u - 0.05), v, _a);
  rig.surfacePoint(Math.min(1, u + 0.05), v, _x);
  _a.sub(_x);
  _z.copy(_n).negate(); // bristles into the hair
  _y.copy(_up).normalize().multiplyScalar(Math.cos(lean)).addScaledVector(_a.normalize(), Math.sin(lean));
  _y.addScaledVector(_z, -_y.dot(_z)).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  quaternion.setFromRotationMatrix(_m);
  position.copy(_p).addScaledVector(_n, BRUSH_TIP_DEPTH + (o.lift ?? 0)).addScaledVector(_y, -BRUSH_HEAD_OFFSET);
}
