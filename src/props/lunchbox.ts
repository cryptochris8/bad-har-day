// ─────────────────────────────────────────────────────────────────────────────
// Lunchbox: a soft rounded bento box in the girl's colour with a lid hinged at the
// back, a carry handle, a latch and a sticker (Addy ★, Ellie ✿, Heidi ♥). Inside:
// a cream liner with dividers → four compartments (main, snack, drink, fruit)
// exposed as `slots` (empties on each compartment floor, userData.size = {w, d, h})
// and a `noteSlot` on the underside of the lid for the love note.
// fitInSlot() scales/orients any prop so it sits nicely in a compartment.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { mixHex, shadeHex } from '../render/models/builder';
import { inked } from '../render/models/common';
import { BaseProp, propGeo } from './base';
import type { LunchboxProp, Prop } from './types';
import { circlePts, heartPts, roundRectLathe, roundRectPts, slab, smoothPath, starPts, tube } from './shapes';

export const LUNCHBOX = {
  w: 0.3,
  d: 0.22,
  r: 0.05,
  baseH: 0.085,
  lidH: 0.042,
  wall: 0.014,
  floorY: 0.012,
  /** Lid angle (rad) when fully open. */
  openAngle: 1.95,
} as const;

/** Compartment size (m) stored on each slot's userData.size. */
export interface SlotSize {
  w: number;
  d: number;
  h: number;
}

type Sticker = 'star' | 'flower' | 'heart';
function stickerFor(color: number): Sticker {
  if (color === PAL.ellieMain || color === PAL.ellieDark) return 'flower';
  if (color === PAL.heidiMain || color === PAL.heidiDark) return 'heart';
  return 'star';
}

function baseGeo(color: number): THREE.BufferGeometry {
  const { w, d, r, baseH, wall, floorY } = LUNCHBOX;
  const b = inked();
  b.add(
    roundRectLathe(w, d, r, [
      [d / 2 - 0.001, 0],
      [0.014, 0],
      [0.004, 0.006],
      [0, 0.022],
      [0, baseH - 0.004],
      [0.006, baseH],
      [wall, baseH - 0.001],
    ]),
    color,
    { smooth: true },
  );
  const liner = PAL.plasticWhite;
  b.add(
    roundRectLathe(
      w,
      d,
      r,
      [
        [wall, baseH - 0.001],
        [wall, floorY],
      ],
      3,
      true,
    ),
    shadeHex(liner, 0.93),
    { smooth: true, ink: false },
  );
  slab(b, roundRectPts(w - 2 * wall, d - 2 * wall, r - wall, 3), floorY - 0.002, 0.002, liner, { ink: false });
  // Dividers → 2 × 2 compartments.
  const iw = w - 2 * wall;
  const id = d - 2 * wall;
  const dh = 0.05;
  b.box(iw - 0.004, dh, 0.006, liner, { at: [0, floorY + dh / 2, 0] });
  b.box(0.006, dh, id - 0.004, liner, { at: [0, floorY + dh / 2, 0] });
  // Soft darker band around the base (two-tone plastic).
  b.add(
    roundRectLathe(w + 0.002, d + 0.002, r + 0.001, [
      [0, 0.03],
      [0, 0.036],
    ]),
    shadeHex(color, 0.84),
    { ink: false, smooth: true },
  );
  return b.build();
}

function lidGeo(color: number): THREE.BufferGeometry {
  const { w, d, r, lidH } = LUNCHBOX;
  const b = inked();
  const dark = shadeHex(color, 0.8);
  const cz = d / 2; // lid centre in hinge space
  b.add(
    roundRectLathe(w, d, r, [
      [0, 0],
      [0, 0.012],
    ]),
    dark,
    { smooth: true, at: [0, 0, cz] },
  );
  b.add(
    roundRectLathe(w, d, r, [
      [0, 0.012],
      [0.004, 0.024],
      [0.014, 0.034],
      [0.03, 0.04],
      [d / 2 - 0.001, lidH],
    ]),
    mixHex(color, 0xffffff, 0.12),
    { smooth: true, at: [0, 0, cz] },
  );
  // Underside liner (seen when open; the love note sits here).
  slab(b, roundRectPts(w - 0.012, d - 0.012, r - 0.006, 3), 0.0005, 0.002, PAL.plasticWhite, { ink: false, at: [0, 0, cz] });
  // Carry handle across the top.
  tube(
    b,
    smoothPath(
      [
        [-0.05, lidH - 0.002, cz],
        [-0.04, lidH + 0.024, cz],
        [0, lidH + 0.032, cz],
        [0.04, lidH + 0.024, cz],
        [0.05, lidH - 0.002, cz],
      ],
      8,
    ),
    0.0075,
    dark,
    {},
    5,
  );
  for (const s of [-1, 1]) b.taper(0.024, 0.028, 0.018, 0.022, 0.01, dark, { at: [s * 0.05, lidH + 0.002, cz] });
  // Latch tab on the front, overlapping the base.
  b.box(0.042, 0.034, 0.01, dark, { at: [0, -0.004, d + 0.002] });
  b.add(new THREE.CircleGeometry(0.005, 8), mixHex(color, 0xffffff, 0.6), { at: [0, -0.01, d + 0.0072], ink: false });
  // Sticker on the lid (front-right of the handle).
  const sx = 0.085;
  const sz = cz + 0.045;
  const sy = lidH + 0.0003;
  const kind = stickerFor(color);
  if (kind === 'star') slab(b, starPts(0.028, 0.013), sy, 0.002, PAL.great, { at: [sx, 0, sz] });
  else if (kind === 'heart') slab(b, heartPts(0.046, 18).map(([x, y]) => [x, -y] as const), sy, 0.002, PAL.paper, { at: [sx, 0, sz] });
  else {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      slab(b, circlePts(0.01, 8, Math.cos(a) * 0.012, Math.sin(a) * 0.012), sy, 0.002, PAL.paper, { at: [sx, 0, sz], ink: i === 0 });
    }
    slab(b, circlePts(0.008, 10), sy + 0.0006, 0.002, PAL.great, { at: [sx, 0, sz], ink: false });
  }
  return b.build();
}

/** Compartment layout: centre (x, z) + size, in main / snack / drink / fruit order. */
export function slotLayout(): { x: number; z: number; size: SlotSize }[] {
  const { w, d, wall, baseH, floorY } = LUNCHBOX;
  const cw = (w - 2 * wall - 0.006) / 2;
  const cd = (d - 2 * wall - 0.006) / 2;
  const cx = cw / 2 + 0.003;
  const cz = cd / 2 + 0.003;
  const size: SlotSize = { w: cw, d: cd, h: baseH - floorY };
  return [
    { x: -cx, z: -cz, size }, // main (back-left)
    { x: cx, z: -cz, size }, // snack (back-right)
    { x: -cx, z: cz, size }, // drink (front-left)
    { x: cx, z: cz, size }, // fruit (front-right)
  ];
}

export class Lunchbox extends BaseProp implements LunchboxProp {
  readonly slots: readonly THREE.Object3D[];
  readonly noteSlot: THREE.Object3D;
  readonly color: number;
  private readonly hinge: THREE.Group;
  private open = 0;

  constructor(color: number) {
    super('lunchbox');
    this.color = color;
    const { d, baseH, floorY } = LUNCHBOX;
    const key = color.toString(16);
    this.addPart(propGeo('lunch|base|' + key, () => baseGeo(color)));
    this.hinge = new THREE.Group();
    this.hinge.name = 'lidHinge';
    this.hinge.position.set(0, baseH, -d / 2);
    this.root.add(this.hinge);
    this.addPart(propGeo('lunch|lid|' + key, () => lidGeo(color)), this.hinge);
    const names = ['main', 'snack', 'drink', 'fruit'];
    this.slots = slotLayout().map((s, i) => {
      const o = new THREE.Object3D();
      o.name = 'slot:' + names[i];
      o.position.set(s.x, floorY, s.z);
      o.userData.size = { ...s.size };
      this.root.add(o);
      return o;
    });
    this.noteSlot = new THREE.Object3D();
    this.noteSlot.name = 'noteSlot';
    // On the lid's underside, flipped π about X: a prop's +Y points out of the lid's inner face and
    // its back (−Z) edge points toward the lid's free edge, so it reads upright when the lid is open.
    this.noteSlot.position.set(0, -0.0005, d / 2 + 0.012);
    this.noteSlot.rotation.set(Math.PI, 0, 0);
    this.noteSlot.userData.size = { w: 0.12, d: 0.08, h: 0.02 };
    this.hinge.add(this.noteSlot);
    this.setGrip(0, baseH + LUNCHBOX.lidH + 0.03, 0);
    this.measure();
  }

  /** Lid 0 = closed … 1 = open. */
  get openAmount(): number {
    return this.open;
  }

  setOpen(v: number): void {
    this.open = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.hinge.rotation.x = -this.open * LUNCHBOX.openAngle;
  }
}

// ── fitting props into compartments ─────────────────────────────────────────

export interface SlotFit {
  /** Uniform scale applied to the prop (≤ 1). */
  scale: number;
  /** 'up' as built, 'side' = lying on its side (height along X, front still +Z), 'back' = lying on its back (front up). */
  pose: 'up' | 'side' | 'back';
}

/** Extents of a prop's footprint: [width X, height Y, depth Z]. */
export type Extents = readonly [number, number, number];

/**
 * Choose the pose + scale that fits `ext` inside a compartment of `size` (with a margin).
 * Prefers upright unless lying down lets the item stay ≥ 15 % bigger. Pure.
 */
export function slotFit(ext: Extents, size: SlotSize, margin = 0.92): SlotFit {
  const [ex, ey, ez] = ext.map((v) => Math.max(1e-4, v)) as [number, number, number];
  const W = size.w * margin;
  const D = size.d * margin;
  const H = Math.max(size.h * 1.35, 0.02); // items may peek a little over the rim
  const up = Math.min(1, W / ex, D / ez, H / ey);
  const side = Math.min(1, W / ey, D / ez, H / ex);
  const back = Math.min(1, W / ex, D / ey, H / ez);
  let best: SlotFit = { scale: up, pose: 'up' };
  if (side > best.scale * 1.15) best = { scale: side, pose: 'side' };
  if (back > best.scale * 1.15) best = { scale: back, pose: 'back' };
  return best;
}

/** Footprint extents of a prop (uses the bounds measured at build time when available). */
export function propExtents(p: Prop): Extents {
  const bb = p.root.userData.bounds as THREE.Box3 | undefined;
  if (bb && !bb.isEmpty()) return [bb.max.x - bb.min.x, bb.max.y, bb.max.z - bb.min.z];
  return [p.radius * 2, p.height, p.radius * 2];
}

/**
 * Parent `prop` to a lunchbox slot (or the note slot) and scale/orient it to fit the
 * compartment. Returns the fit that was applied.
 */
export function fitInSlot(prop: Prop, slot: THREE.Object3D, margin = 0.92): SlotFit {
  const size = (slot.userData.size as SlotSize | undefined) ?? { w: 0.13, d: 0.09, h: 0.07 };
  const ext = propExtents(prop);
  const fit = slotFit(ext, size, margin);
  const k = fit.scale;
  const bb = prop.root.userData.bounds as THREE.Box3 | undefined;
  const cx = bb ? (bb.min.x + bb.max.x) / 2 : 0;
  const cz = bb ? (bb.min.z + bb.max.z) / 2 : 0;
  const r = prop.root;
  r.scale.setScalar(k);
  if (fit.pose === 'up') {
    r.rotation.set(0, 0, 0);
    r.position.set(-cx * k, 0, -cz * k);
  } else if (fit.pose === 'side') {
    // +Y → −X: the prop lies on its right side, top pointing left; front still faces +Z.
    r.rotation.set(0, 0, Math.PI / 2);
    const minX = bb ? bb.min.x : -ext[0] / 2;
    r.position.set((ext[1] / 2) * k, -minX * k, -cz * k);
  } else {
    // Lying on its back: +Y → −Z (top toward the back), front (+Z) → up.
    r.rotation.set(-Math.PI / 2, 0, 0);
    const minZ = bb ? bb.min.z : -ext[2] / 2;
    r.position.set(-cx * k, -minZ * k, (ext[1] / 2) * k);
  }
  slot.add(r);
  return fit;
}
