// ─────────────────────────────────────────────────────────────────────────────
// Shadow proxies: detailed furniture / props only RECEIVE shadows; these cheap,
// invisible stand-ins (derived from the layout footprints) CAST them. Keeps the
// shadow pass to a few thousand triangles. Proxies are inset a few cm so the
// real surfaces stay outside them (no self-shadowing).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GeoBuilder } from '../render/models/builder';
import { BED_MATTRESS_H, CHAIR_SEAT_H, COUCH_SEAT_H, FURN, OUT, TABLE_H, type Furn, type FurnId } from './layout';

type OutId = keyof typeof OUT;

const cx = (f: Furn) => (f.r.x0 + f.r.x1) / 2;
const cz = (f: Furn) => (f.r.z0 + f.r.z1) / 2;

/** Box from a footprint (inset) between two heights. */
export function proxyBox(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, inset = 0.04): void {
  const w = x1 - x0 - inset * 2;
  const d = z1 - z0 - inset * 2;
  const h = y1 - y0;
  if (w <= 0.01 || d <= 0.01 || h <= 0.01) return;
  b.box(w, h, d, 0xffffff, { at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], ink: false });
}

const slab = (b: GeoBuilder, f: Furn, y0: number, y1: number, inset = 0.03) => proxyBox(b, f.r.x0, f.r.z0, f.r.x1, f.r.z1, y0, y1, inset);

/** Furniture proxies for every solid footprint in the house. */
export function furnitureProxies(b: GeoBuilder): void {
  for (const id of Object.keys(FURN) as FurnId[]) {
    const f: Furn = FURN[id];
    if (!f.solid) continue;
    const h = f.h;
    if (id.startsWith('chair')) {
      slab(b, f, CHAIR_SEAT_H - 0.06, CHAIR_SEAT_H, 0.04);
      continue;
    }
    switch (id) {
      case 'table':
        slab(b, f, TABLE_H - 0.06, TABLE_H - 0.01, 0.03);
        continue;
      case 'coffeeTable':
        slab(b, f, 0.37, 0.42, 0.03);
        continue;
      case 'twinsDesk':
        slab(b, f, 0.68, 0.72, 0.03);
        continue;
      case 'couch':
        slab(b, f, 0.1, COUCH_SEAT_H, 0.05);
        proxyBox(b, f.r.x0, f.r.z0, f.r.x1, f.r.z0 + 0.3, 0.1, h - 0.05, 0.05);
        continue;
      case 'masterBed':
      case 'bedAddy':
      case 'bedEllie':
      case 'heidiBed':
        slab(b, f, 0.12, BED_MATTRESS_H + 0.1, 0.06);
        proxyBox(b, f.r.x0, f.r.z0, f.r.x1, f.r.z0 + 0.1, 0.12, h - 0.06, 0.05);
        continue;
      case 'floorLamp':
        proxyBox(b, cx(f) - 0.03, cz(f) - 0.03, cx(f) + 0.03, cz(f) + 0.03, 0.05, 1.3, 0);
        proxyBox(b, cx(f) - 0.16, cz(f) - 0.16, cx(f) + 0.16, cz(f) + 0.16, 1.35, 1.6, 0);
        continue;
      case 'stool1':
      case 'stool2':
      case 'stool3':
        slab(b, f, 0.43, 0.52, 0.02);
        continue;
      case 'sideTable':
        slab(b, f, 0.5, 0.55, 0.03);
        continue;
      case 'armchair':
      case 'masterChair':
        slab(b, f, 0.12, 0.45, 0.06);
        continue;
      default:
        break;
    }
    if (f.circle !== undefined) {
      // plants / round things: a squarish core inside the circle
      const r = f.circle * 0.62;
      proxyBox(b, cx(f) - r, cz(f) - r, cx(f) + r, cz(f) + r, h > 0.8 ? h * 0.3 : 0.02, h * 0.92, 0);
      continue;
    }
    slab(b, f, 0.02, h - 0.02, 0.04);
  }
}

/** Outdoor proxies for the footprint-based props (trees, bush, swing set, bins, patio, mailbox). */
export function outdoorProxies(b: GeoBuilder): void {
  for (const id of Object.keys(OUT) as OutId[]) {
    const f: Furn = OUT[id];
    switch (id) {
      case 'yardTree':
        proxyBox(b, cx(f) - 0.18, cz(f) - 0.18, cx(f) + 0.18, cz(f) + 0.18, 0, 3.0, 0);
        b.ball(1.55, 0, 0xffffff, { at: [cx(f), 3.9, cz(f)], scale: [1.1, 0.8, 1.1], ink: false });
        continue;
      case 'yardTreeSmall':
        proxyBox(b, cx(f) - 0.12, cz(f) - 0.12, cx(f) + 0.12, cz(f) + 0.12, 0, 2.1, 0);
        b.ball(0.95, 0, 0xffffff, { at: [cx(f), 2.75, cz(f)], scale: [1.1, 0.8, 1.1], ink: false });
        continue;
      case 'frontTree':
        proxyBox(b, cx(f) - 0.14, cz(f) - 0.14, cx(f) + 0.14, cz(f) + 0.14, 0, 2.4, 0);
        b.ball(1.2, 0, 0xffffff, { at: [cx(f), 3.1, cz(f)], scale: [1.1, 0.8, 1.1], ink: false });
        continue;
      case 'yardBush':
        b.ball(0.68, 0, 0xffffff, { at: [cx(f), 0.55, cz(f)], scale: [1.1, 0.8, 1.05], ink: false });
        continue;
      case 'swingSet':
        proxyBox(b, f.r.x0, cz(f) - 0.06, f.r.x1, cz(f) + 0.06, 2.12, 2.28, 0);
        for (const x of [f.r.x0 + 0.1, f.r.x1 - 0.1]) proxyBox(b, x - 0.05, f.r.z0, x + 0.05, f.r.z1, 0, 2.2, 0.1);
        continue;
      case 'patioTable':
        proxyBox(b, cx(f) - 0.36, cz(f) - 0.36, cx(f) + 0.36, cz(f) + 0.36, 0.68, 0.74, 0);
        continue;
      case 'mailbox':
        proxyBox(b, cx(f) - 0.1, cz(f) - 0.22, cx(f) + 0.1, cz(f) + 0.2, 0.98, 1.2, 0);
        proxyBox(b, cx(f) - 0.03, cz(f) - 0.03, cx(f) + 0.03, cz(f) + 0.03, 0, 1.0, 0);
        continue;
      default:
        if (f.circle !== undefined) {
          const r = f.circle * 0.65;
          proxyBox(b, cx(f) - r, cz(f) - r, cx(f) + r, cz(f) + r, 0.02, f.h * 0.9, 0);
        } else proxyBox(b, f.r.x0, f.r.z0, f.r.x1, f.r.z1, 0.02, f.h - 0.03, 0.04);
    }
  }
}

let proxyMat: THREE.MeshBasicMaterial | null = null;
/** Invisible material for shadow proxies (casts via the depth pass, draws nothing). */
export function proxyMaterial(): THREE.MeshBasicMaterial {
  if (!proxyMat) {
    proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    proxyMat.name = 'bhd-shadow-proxy';
  }
  return proxyMat;
}

export function proxyMesh(geo: THREE.BufferGeometry, name: string, depth?: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(geo, proxyMaterial());
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = false;
  if (depth) m.customDepthMaterial = depth;
  m.renderOrder = -20;
  return m;
}
