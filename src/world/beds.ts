// ─────────────────────────────────────────────────────────────────────────────
// Bed blankets (contract `Bed`): four states per bed — 'made' (neat, empty),
// 'tucked' (up to the sleeper's chin, with a body lump), 'burrito' (a big lump
// over everything that wiggles) and 'thrown' (bunched at the foot). Frames,
// mattresses (top = BED_MATTRESS_H) and pillows are part of the room furniture.
// Bed local frame: headboard at z = 0 (north wall), foot toward +Z.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, shadeHex } from '../render/models/builder';
import { modelMaterial } from '../render/models/materials';
import { Frame } from './kit';
import { BED_MATTRESS_H, FURN, type Furn } from './layout';
import type { Bed } from './types';

type BlanketState = 'tucked' | 'burrito' | 'thrown' | 'made';
type BedId = Bed['id'];

interface BedStyle {
  furn: Furn;
  main: number;
  accent: number;
  pattern: 'stripes' | 'dots' | 'stars' | 'quilt';
  /** Distance of the blanket's top edge from the headboard when tucked (chin line). */
  chin: number;
  /** Sleeper lumps (x offsets) for 'tucked'. */
  lumps: number[];
}

const STYLES: Record<BedId, BedStyle> = {
  addy: { furn: FURN.bedAddy, main: PAL.addyMain, accent: 0xf3eefe, pattern: 'stripes', chin: 0.62, lumps: [0] },
  ellie: { furn: FURN.bedEllie, main: PAL.ellieMain, accent: 0xffffff, pattern: 'dots', chin: 0.62, lumps: [0] },
  heidi: { furn: FURN.heidiBed, main: PAL.heidiMain, accent: PAL.starPrint, pattern: 'stars', chin: 0.62, lumps: [0] },
  master: { furn: FURN.masterBed, main: PAL.fabricSage, accent: 0xf6efe0, pattern: 'quilt', chin: 0.5, lumps: [-0.43, 0.43] },
};

function pattern(f: Frame, s: BedStyle, w: number, z0: number, z1: number, y: number): void {
  const len = z1 - z0;
  switch (s.pattern) {
    case 'stripes':
      for (let i = 0; i < 4; i++) f.box(w + 0.005, 0.012, 0.09, shadeHex(s.main, 0.82), 0, y, z0 + len * (0.2 + i * 0.2), { ink: false });
      break;
    case 'dots':
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) f.cyl(0.035, 0.035, 0.012, 8, s.accent, -w / 2 + w * ((c + 0.5 + (r % 2) * 0.5) / 4.5), y, z0 + len * ((r + 0.5) / 4), { ink: false });
      break;
    case 'stars':
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 3; c++) {
          const pts: [number, number][] = [];
          for (let i = 0; i < 10; i++) {
            const a = Math.PI / 2 + (i * Math.PI) / 5;
            const rr = i % 2 ? 0.022 : 0.05;
            pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
          }
          f.extrude(pts, 0.012, s.accent, -w / 2 + w * ((c + 0.5 + (r % 2) * 0.3) / 3.3), y, z0 + len * ((r + 0.5) / 4), { rot: [-Math.PI / 2, 0, 0], ink: false });
        }
      break;
    case 'quilt':
      for (let r = 0; r < 5; r++)
        for (let c = 0; c < 4; c++)
          if ((r + c) % 2) f.box(w / 4 - 0.02, 0.012, len / 5 - 0.02, s.accent, -w / 2 + w * ((c + 0.5) / 4), y, z0 + len * ((r + 0.5) / 5), { ink: false });
  }
}

/** Build one blanket state geometry in bed-local coordinates. */
function blanketGeometry(s: BedStyle, state: BlanketState): THREE.BufferGeometry {
  const b = new GeoBuilder(true, true);
  const f = new Frame(b, 0, 0, 0, 0);
  const w = s.furn.r.x1 - s.furn.r.x0;
  const L = s.furn.r.z1 - s.furn.r.z0;
  const m = BED_MATTRESS_H;
  const side = (z0: number, z1: number, y: number) => {
    for (const sx of [-1, 1]) f.rbox(0.05, 0.24, z1 - z0, 0.025, s.main, sx * (w / 2 + 0.035), y - 0.1, (z0 + z1) / 2);
    f.rbox(w + 0.1, 0.24, 0.05, 0.025, s.main, 0, y - 0.1, z1 + 0.02);
  };
  switch (state) {
    case 'made': {
      const z0 = 0.52;
      f.rbox(w + 0.1, 0.05, L - z0 + 0.03, 0.025, s.main, 0, m + 0.03, (z0 + L) / 2 + 0.01);
      side(z0, L, m + 0.03);
      f.rbox(w + 0.1, 0.06, 0.16, 0.03, s.accent === 0xffffff ? PAL.bedWhite : s.accent, 0, m + 0.06, z0 + 0.08);
      pattern(f, s, w - 0.05, z0 + 0.2, L - 0.05, m + 0.058);
      break;
    }
    case 'tucked': {
      const z0 = s.chin;
      f.rbox(w + 0.1, 0.05, L - z0 + 0.03, 0.025, s.main, 0, m + 0.03, (z0 + L) / 2 + 0.01);
      side(z0, L, m + 0.03);
      const len = L - z0 - 0.12;
      for (const lx of s.lumps) {
        f.rbox(Math.min(0.62, w * 0.62), 0.2, len, 0.1, s.main, lx, m + 0.12, z0 + 0.06 + len / 2, {}, 2);
        f.rbox(Math.min(0.5, w * 0.5), 0.14, 0.3, 0.07, s.main, lx, m + 0.14, L - 0.25, {}, 2);
      }
      f.rbox(w + 0.08, 0.07, 0.14, 0.035, PAL.bedWhite, 0, m + 0.08, z0 + 0.05, {}, 2);
      pattern(f, s, w - 0.08, z0 + 0.25, L - 0.1, m + 0.058);
      break;
    }
    case 'burrito': {
      const bw = Math.min(w * 0.82, 1.3);
      f.rbox(w + 0.1, 0.05, L - 0.1, 0.025, s.main, 0, m + 0.03, L / 2 + 0.05);
      f.rbox(bw, 0.44, L - 0.32, 0.2, s.main, 0, m + 0.24, 0.16 + (L - 0.32) / 2, {}, 2);
      f.rbox(bw * 0.8, 0.28, 0.5, 0.13, shadeHex(s.main, 1.06), 0, m + 0.42, 0.55, { rot: [0.1, 0, 0] }, 2);
      for (let i = 0; i < 3; i++) f.torus(bw * 0.46, 0.022, 5, 16, shadeHex(s.main, 0.86), 0, m + 0.12, 0.7 + i * 0.35, { scale: [1, 0.95, 0.6], ink: false }, Math.PI);
      side(0.1, L, m + 0.03);
      break;
    }
    case 'thrown': {
      f.rbox(w + 0.12, 0.2, 0.5, 0.1, s.main, 0, m + 0.1, L - 0.28, { rot: [0.12, 0, 0] }, 3);
      f.rbox(w + 0.02, 0.14, 0.34, 0.07, shadeHex(s.main, 1.08), 0.02, m + 0.2, L - 0.52, { rot: [-0.25, 0.04, 0] }, 2);
      for (const sx of [-1, 1]) f.rbox(0.05, 0.26, 0.5, 0.025, s.main, sx * (w / 2 + 0.05), m - 0.06, L - 0.28);
      break;
    }
  }
  return b.build();
}

export interface BedSet {
  readonly group: THREE.Group;
  bed(id: BedId): Bed;
  update(dt: number): void;
  dispose(): void;
}

export function buildBeds(): BedSet {
  const group = new THREE.Group();
  group.name = 'beds';
  const handles = new Map<BedId, Bed>();
  const tickers: ((dt: number) => void)[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const states: BlanketState[] = ['made', 'tucked', 'burrito', 'thrown'];
  const initial: Record<BedId, BlanketState> = { addy: 'tucked', ellie: 'tucked', heidi: 'tucked', master: 'tucked' };
  for (const id of ['addy', 'ellie', 'heidi', 'master'] as const) {
    const s = STYLES[id];
    const root = new THREE.Group();
    root.name = 'bed:' + id;
    root.position.set((s.furn.r.x0 + s.furn.r.x1) / 2, 0, s.furn.r.z0);
    group.add(root);
    const meshes = {} as Record<BlanketState, THREE.Mesh>;
    for (const st of states) {
      const g = blanketGeometry(s, st);
      geos.push(g);
      const mesh = new THREE.Mesh(g, modelMaterial());
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.visible = st === initial[id];
      mesh.name = `blanket:${id}:${st}`;
      root.add(mesh);
      meshes[st] = mesh;
    }
    let current: BlanketState = initial[id];
    let wiggleAmp = 0;
    let t = 0;
    let poof = 0;
    const L = s.furn.r.z1 - s.furn.r.z0;
    const burrito = meshes.burrito;
    // wiggle pivots around the lump's base centre
    const pivotZ = L / 2;
    const handle: Bed = {
      id,
      setBlanket(state) {
        if (state === current) return;
        meshes[current].visible = false;
        meshes[state].visible = true;
        current = state;
        poof = 1;
      },
      wiggle(amount: number) {
        wiggleAmp = Math.max(wiggleAmp, Math.max(0, Math.min(1, amount)));
      },
    };
    handles.set(id, handle);
    tickers.push((dt) => {
      t += dt;
      wiggleAmp = Math.max(0, wiggleAmp - dt / 0.6);
      poof = Math.max(0, poof - dt * 4);
      const cur = meshes[current];
      const k = poof * poof;
      cur.scale.set(1 + 0.04 * k, 1 - 0.12 * k, 1 + 0.02 * k);
      if (current === 'burrito') {
        const a = wiggleAmp;
        burrito.rotation.z = Math.sin(t * 17) * 0.06 * a;
        burrito.rotation.x = Math.sin(t * 11 + 1) * 0.02 * a;
        burrito.position.x = Math.sin(t * 13) * 0.03 * a;
        burrito.scale.y = (1 - 0.12 * k) * (1 + Math.sin(t * 21) * 0.07 * a);
        burrito.position.z = -pivotZ * (burrito.scale.z - 1);
      }
    });
  }
  return {
    group,
    bed: (id) => handles.get(id)!,
    update(dt) {
      for (let i = 0; i < tickers.length; i++) tickers[i]!(dt);
    },
    dispose() {
      for (const g of geos) g.dispose();
      group.removeFromParent();
    },
  };
}
