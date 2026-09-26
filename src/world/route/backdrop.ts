// The neighbourhood's ground (one vertex-coloured lawn plane under the whole route) and the distant backdrop:
// rows of soft tree clumps and gentle hills that close the horizon on both sides and at both ends.
import * as THREE from 'three';
import { PAL } from '../../render/palette';
import { hash01, linear, shadeHex } from '../../render/models/builder';
import type { Chunks } from './chunks';
import { PARK, S_MAX, S_MIN, SCHOOL, XS } from './layout';

export function groundGeometry(): THREE.BufferGeometry {
  const W = XS.ground * 2;
  const s0 = S_MIN - 60;
  const s1 = S_MAX + 70;
  const D = s1 - s0;
  const g = new THREE.PlaneGeometry(W, D, 24, Math.ceil(D / 14));
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.035, -(s0 + s1) / 2);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  const a = linear(PAL.grassA);
  const b = linear(PAL.grassB);
  const far = linear(shadeHex(PAL.grassB, 0.93));
  const lawnSchool = linear(shadeHex(PAL.grassA, 1.05));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const s = -p.getZ(i);
    const n = 0.5 + 0.25 * Math.sin(x * 0.23 + s * 0.11) + 0.25 * Math.sin(x * 0.06 - s * 0.17 + 1.3);
    const d = Math.min(1, Math.max(0, (Math.abs(x) - 30) / 50));
    const school = x > 9 && x < 40 && s > SCHOOL.s0 && s < SCHOOL.s1 ? 0.6 : 0;
    const park = x < -9 && x > -45 && s > PARK.s0 && s < PARK.s1 ? 0.35 : 0;
    for (let k = 0; k < 3; k++) {
      let v = a[k]! + (b[k]! - a[k]!) * n;
      v = v + (lawnSchool[k]! - v) * (school + park);
      col[i * 3 + k] = v + (far[k]! - v) * d;
    }
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Distant tree clumps + hills (scenery builder, no ink). */
export function buildBackdrop(ch: Chunks, seed: number): void {
  const clump = (x: number, s: number, r: number, k: number) => {
    const b = ch.far;
    const c = hash01(seed, k) > 0.5 ? PAL.distantTree : shadeHex(PAL.treeLeafDark, 0.95 + hash01(seed, k, 3) * 0.1);
    b.cyl(r * 0.12, r * 0.16, r * 0.9, 4, PAL.treeTrunk, { at: [x, r * 0.45, -s] });
    b.dodeca(r, c, { at: [x, r * 1.25, -s], scale: [1, 1.15, 1], shade: 0.08, seed: k });
    if (hash01(seed, k, 11) > 0.5) b.dodeca(r * 0.7, shadeHex(c, 1.08), { at: [x + r * 0.45, r * 1.75, -s + r * 0.2], shade: 0.08, seed: k + 1 });
  };
  let k = 0;
  // side rows behind the back yards
  for (const side of [-1, 1] as const)
    for (let s = S_MIN - 40; s < S_MAX + 50; s += 16 + hash01(seed, side, Math.round(s)) * 10) {
      const x = side * (34 + hash01(seed, k, 1) * 14);
      clump(x, s, 2.4 + hash01(seed, k, 2) * 1.8, k++);
      if (hash01(seed, k, 5) > 0.6) clump(side * (52 + hash01(seed, k, 6) * 20), s + 4, 3.2 + hash01(seed, k, 7) * 2, k++);
    }
  // far end (past the T-junction houses) and behind the start
  for (let x = -XS.ground + 4; x < XS.ground; x += 11 + hash01(seed, k, 9) * 6) {
    clump(x, S_MAX + 18 + hash01(seed, k, 4) * 14, 3 + hash01(seed, k, 8) * 2, k++);
    clump(x + 3, S_MIN - 25 - hash01(seed, k, 4) * 10, 3 + hash01(seed, k, 8) * 2, k++);
  }
  // soft hills on the horizon
  for (const side of [-1, 1] as const)
    for (let s = S_MIN; s < S_MAX + 60; s += 70) {
      const r = 40 + hash01(seed, side, s) * 25;
      ch.far.sphere(r, 12, 6, hash01(seed, s, side) > 0.5 ? PAL.distantHill : PAL.distantHillFar, { at: [side * (XS.ground + r * 0.35), -r * 0.78, -s], scale: [1, 0.55, 1.1] });
    }
  for (let x = -XS.ground; x <= XS.ground; x += 60) {
    const r = 45 + hash01(seed, x) * 20;
    ch.far.sphere(r, 12, 6, PAL.distantHillFar, { at: [x, -r * 0.8, -(S_MAX + 70)], scale: [1.3, 0.55, 1] });
  }
}
