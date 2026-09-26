// Floors of every room (one scenery mesh): oak planks with dark gaps, kitchen checker, bath and entry tiles,
// soft bedroom carpet. Tops sit exactly at y = 0.
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, hash01, shadeHex } from '../render/models/builder';
import { roomBounds, type Rect } from './layout';
import type { RoomId } from './types';

function planks(b: GeoBuilder, r: Rect, seed: number): void {
  b.box(r.x1 - r.x0, 0.04, r.z1 - r.z0, shadeHex(PAL.floorOakDark, 0.8), { at: [(r.x0 + r.x1) / 2, -0.03, (r.z0 + r.z1) / 2] });
  const W = 0.2;
  let row = 0;
  for (let z = r.z0; z < r.z1 - 1e-3; z += W, row++) {
    const z1 = Math.min(r.z1, z + W);
    let x = r.x0 - hash01(seed, row, 1) * 1.1;
    let k = 0;
    while (x < r.x1) {
      const len = 1.1 + hash01(seed, row, k, 2) * 1.2;
      const a = Math.max(r.x0, x);
      const e = Math.min(r.x1, x + len);
      if (e - a > 0.02) {
        const tone = 0.92 + hash01(seed, row, k, 3) * 0.14;
        const base = hash01(seed, row, k, 4) > 0.8 ? PAL.floorOakDark : PAL.floorOak;
        b.add(new THREE.PlaneGeometry(e - a - 0.012, z1 - z - 0.014), shadeHex(base, tone), { at: [(a + e) / 2, 0, (z + z1) / 2], rot: [-Math.PI / 2, 0, 0] });
      }
      x += len;
      k++;
    }
  }
}

function tiles(b: GeoBuilder, r: Rect, size: number, a: number, c: number, grout: number, gap: number): void {
  b.box(r.x1 - r.x0, 0.04, r.z1 - r.z0, grout, { at: [(r.x0 + r.x1) / 2, -0.03, (r.z0 + r.z1) / 2] });
  let i = 0;
  for (let x = r.x0; x < r.x1 - 1e-3; x += size, i++) {
    let j = 0;
    for (let z = r.z0; z < r.z1 - 1e-3; z += size, j++) {
      const x1 = Math.min(r.x1, x + size);
      const z1 = Math.min(r.z1, z + size);
      const col = (i + j) % 2 ? a : c;
      b.add(new THREE.PlaneGeometry(x1 - x - gap, z1 - z - gap), shadeHex(col, 0.97 + hash01(i, j, 7) * 0.05), { at: [(x + x1) / 2, 0, (z + z1) / 2], rot: [-Math.PI / 2, 0, 0] });
    }
  }
}

function carpet(b: GeoBuilder, r: Rect, color: number, seed: number): void {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const g = new THREE.PlaneGeometry(w, d, Math.ceil(w * 1.5), Math.ceil(d * 1.5));
  g.rotateX(-Math.PI / 2);
  b.add(g, color, { at: [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2], shade: 0.025, seed });
  b.box(w, 0.04, d, shadeHex(color, 0.8), { at: [(r.x0 + r.x1) / 2, -0.025, (r.z0 + r.z1) / 2] });
}

const FLOOR: Record<string, (b: GeoBuilder, r: Rect, id: RoomId) => void> = {
  oak: (b, r, id) => planks(b, r, id.length * 31 + 7),
  checker: (b, r) => tiles(b, r, 0.45, PAL.floorCheckA, PAL.floorCheckB, 0xc9c0ad, 0.012),
  bathTile: (b, r) => tiles(b, r, 0.3, PAL.tileWhite, PAL.floorTile, PAL.floorTileGrout, 0.014),
  warmTile: (b, r) => tiles(b, r, 0.42, PAL.floorTileWarm, PAL.floorTileWarmB, 0xb99a7c, 0.016),
};

export function buildFloors(): THREE.BufferGeometry {
  const b = new GeoBuilder(false, false);
  const kinds: [RoomId, string | number][] = [
    ['kitchen', 'checker'],
    ['living', 'oak'],
    ['hall', 'oak'],
    ['master', 'oak'],
    ['entry', 'warmTile'],
    ['bath', 'bathTile'],
    ['twins', PAL.carpetLavender],
    ['heidi', PAL.carpetBlush],
  ];
  for (const [id, kind] of kinds) {
    const r = roomBounds(id);
    if (typeof kind === 'number') carpet(b, r, kind, id.length);
    else FLOOR[kind]!(b, r, id);
  }
  return b.build();
}
