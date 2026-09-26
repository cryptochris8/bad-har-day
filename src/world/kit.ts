// ─────────────────────────────────────────────────────────────────────────────
// Builder kit: a local placement frame on top of GeoBuilder (so furniture and
// wall decor can be authored facing +Z and dropped anywhere with a yaw) plus
// reusable toy-like shapes (rounded boxes, cushions, plants, frames, books).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PAL } from '../render/palette';
import { GeoBuilder, hash01, shadeHex, type PartOpts, type V3 } from '../render/models/builder';

export type LocalOpts = Omit<PartOpts, 'at' | 'rot'> & { rot?: V3 };

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);

/** Rounded box geometry (cached per size bucket is not needed: the builder consumes it). */
export function roundedBox(w: number, h: number, d: number, r: number, seg = 2): THREE.BufferGeometry {
  const rr = Math.max(0.002, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

/**
 * Placement frame: local x = right, y = up, z = forward (toward the viewer / out of a wall). `yaw` turns the
 * frame's +Z to face that direction (0 = +Z). Part rotations may use Y and Z only (X is not composable).
 */
export class Frame {
  private readonly c: number;
  private readonly s: number;
  constructor(
    readonly b: GeoBuilder,
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly yaw = 0,
    readonly role = 0,
  ) {
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }

  /** World position of a local point. */
  at(lx: number, ly: number, lz: number): V3 {
    return [this.ox + lx * this.c + lz * this.s, this.oy + ly, this.oz - lx * this.s + lz * this.c];
  }

  private opts(lx: number, ly: number, lz: number, o: LocalOpts = {}): PartOpts {
    const r = o.rot ?? [0, 0, 0];
    let rot: V3;
    if (r[0] === 0) rot = [0, r[1] + this.yaw, r[2]];
    else {
      // compose world yaw ∘ part rotation exactly
      _qa.setFromAxisAngle(_up, this.yaw);
      _qb.setFromEuler(_e.set(r[0], r[1], r[2], 'XYZ'));
      _e.setFromQuaternion(_qa.multiply(_qb), 'XYZ');
      rot = [_e.x, _e.y, _e.z];
    }
    return { ...o, at: this.at(lx, ly, lz), rot, role: o.role ?? this.role };
  }

  /** A child frame (offset + extra yaw) on the same builder. */
  sub(lx: number, ly: number, lz: number, yaw = 0, b: GeoBuilder = this.b): Frame {
    const p = this.at(lx, ly, lz);
    return new Frame(b, p[0], p[1], p[2], this.yaw + yaw, this.role);
  }

  /** Same frame, different builder (e.g. the lamp glow builder). */
  on(b: GeoBuilder): Frame {
    return new Frame(b, this.ox, this.oy, this.oz, this.yaw, this.role);
  }

  add(geo: THREE.BufferGeometry, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.add(geo, color, this.opts(lx, ly, lz, o));
    return this;
  }
  box(w: number, h: number, d: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.box(w, h, d, color, this.opts(lx, ly, lz, o));
    return this;
  }
  /** Box from its min corner-ish: x0..x1, y0..y1, z0..z1 in local coords. */
  span(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number, o?: LocalOpts): this {
    return this.box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }
  rbox(w: number, h: number, d: number, r: number, color: number, lx: number, ly: number, lz: number, o: LocalOpts = {}, seg = 1): this {
    this.b.add(roundedBox(w, h, d, r, seg), color, this.opts(lx, ly, lz, { smooth: true, ...o }));
    return this;
  }
  taper(w0: number, d0: number, w1: number, d1: number, h: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts & { sx?: number; sz?: number }): this {
    const { sx, sz, ...rest } = o ?? {};
    this.b.taper(w0, d0, w1, d1, h, color, { ...this.opts(lx, ly, lz, rest), ...(sx !== undefined ? { sx } : {}), ...(sz !== undefined ? { sz } : {}) });
    return this;
  }
  gable(w: number, h: number, d: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.gable(w, h, d, color, this.opts(lx, ly, lz, o));
    return this;
  }
  /** Flat quad in the local XY plane facing local +Z (2 triangles, no ink). */
  quad(x0: number, x1: number, y0: number, y1: number, z: number, color: number): this {
    if (x1 - x0 <= 1e-4 || y1 - y0 <= 1e-4) return this;
    this.b.add(new THREE.PlaneGeometry(x1 - x0, y1 - y0), color, this.opts((x0 + x1) / 2, (y0 + y1) / 2, z, { ink: false }));
    return this;
  }
  cyl(rt: number, rb: number, h: number, seg: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.cyl(rt, rb, h, seg, color, this.opts(lx, ly, lz, o));
    return this;
  }
  ball(r: number, detail: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.ball(r, detail, color, this.opts(lx, ly, lz, o));
    return this;
  }
  sphere(r: number, ws: number, hs: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.sphere(r, ws, hs, color, this.opts(lx, ly, lz, { smooth: true, ...o }));
    return this;
  }
  cone(r: number, h: number, seg: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.cone(r, h, seg, color, this.opts(lx, ly, lz, o));
    return this;
  }
  torus(r: number, tube: number, rs: number, ts: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts, arc = Math.PI * 2): this {
    this.b.torus(r, tube, rs, ts, color, this.opts(lx, ly, lz, o), arc);
    return this;
  }
  lathe(pts: readonly (readonly [number, number])[], seg: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.lathe(pts, seg, color, this.opts(lx, ly, lz, o));
    return this;
  }
  /** Extruded 2D outline in the local XY plane, `depth` along local Z (centred). */
  extrude(pts: readonly (readonly [number, number])[], depth: number, color: number, lx: number, ly: number, lz: number, o?: LocalOpts): this {
    this.b.extrude(pts, depth, color, this.opts(lx, ly, lz, o));
    return this;
  }
}

// ── reusable shapes (authored in a Frame facing +Z; y = 0 is the floor / mount point) ──

/** Potted plant: pot + leafy clumps. `h` = total height. */
export function plant(f: Frame, x: number, z: number, h: number, seed: number, pot: number = PAL.plantPot, leaf: number = PAL.plantGreen): void {
  const pr = Math.min(0.22, 0.1 + h * 0.08);
  const ph = Math.min(0.34, h * 0.28);
  f.lathe(
    [
      [0, 0],
      [pr * 0.72, 0],
      [pr * 0.84, ph * 0.1],
      [pr, ph * 0.9],
      [pr * 1.08, ph],
      [pr * 0.92, ph],
      [0, ph * 0.94],
    ],
    12,
    pot,
    x,
    0,
    z,
    { smooth: true },
  );
  f.cyl(pr * 0.9, pr * 0.9, 0.02, 10, PAL.dirtDark, x, ph * 0.93, z, { ink: false });
  const n = h > 0.9 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed;
    const rr = pr * (0.3 + 0.55 * hash01(seed * 7 + i, 3));
    const y = ph + (h - ph) * (0.35 + 0.5 * hash01(seed * 3 + i, 9));
    const s = (h - ph) * (0.26 + 0.16 * hash01(seed + i, 5));
    const col = i % 2 ? leaf : shadeHex(leaf, 0.86);
    f.ball(s, 1, col, x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, { scale: [1, 1.15, 1], smooth: true, jitter: s * 0.08, seed: seed + i });
  }
  f.ball((h - ph) * 0.3, 1, shadeHex(leaf, 1.08), x, h - (h - ph) * 0.18, z, { smooth: true });
}

/** Tall leafy "fiddle" plant with a stem. */
export function tallPlant(f: Frame, x: number, z: number, h: number, seed: number): void {
  const pr = 0.2;
  f.lathe(
    [
      [0, 0],
      [0.15, 0],
      [0.2, 0.3],
      [0.22, 0.34],
      [0, 0.33],
    ],
    12,
    PAL.plantPot,
    x,
    0,
    z,
    { smooth: true },
  );
  f.cyl(0.02, 0.025, h * 0.6, 5, PAL.treeTrunk, x, 0.34 + h * 0.3, z, { ink: false });
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39996 + seed;
    const y = 0.55 + (h - 0.6) * (i / 6);
    const rr = pr * (0.9 - (i / 7) * 0.4);
    f.ball(0.13 + 0.03 * hash01(seed, i), 1, i % 2 ? PAL.plantGreen : shadeHex(PAL.plantGreen, 0.85), x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, {
      scale: [1.3, 0.8, 0.9],
      rot: [0, a, 0.3],
      smooth: true,
    });
  }
}

/** Picture frame on a wall (local frame: wall face at z = 0, facing +Z). Inside: an abstract happy picture. */
export function pictureFrame(f: Frame, x: number, y: number, w: number, h: number, frameColor: number, kind: number): void {
  const t = 0.045;
  f.span(x - w / 2, x + w / 2, y - h / 2, y + h / 2, 0, 0.03, frameColor);
  const bg = [0xfff3dc, 0xdff0f7, 0xfbe3e8, 0xe7f3df, 0xf3e6fb][kind % 5]!;
  f.span(x - w / 2 + t, x + w / 2 - t, y - h / 2 + t, y + h / 2 - t, 0.03, 0.036, bg, { ink: false });
  const cx = x;
  const cy = y;
  const s = Math.min(w, h) - t * 2;
  const z = 0.04;
  switch (kind % 6) {
    case 0: // sunny hill
      f.box(w - t * 2 - 0.01, s * 0.3, 0.008, PAL.grassA, cx, cy - s * 0.28, z, { ink: false });
      f.cyl(s * 0.16, s * 0.16, 0.01, 12, PAL.flowerYellow, cx + s * 0.18, cy + s * 0.14, z, { rot: [Math.PI / 2, 0, 0], ink: false });
      break;
    case 1: // heart
      f.ball(s * 0.16, 1, PAL.heart, cx - s * 0.1, cy + s * 0.05, z, { scale: [1, 1, 0.25], ink: false });
      f.ball(s * 0.16, 1, PAL.heart, cx + s * 0.1, cy + s * 0.05, z, { scale: [1, 1, 0.25], ink: false });
      f.cone(s * 0.24, s * 0.3, 4, PAL.heart, cx, cy - s * 0.12, z, { rot: [0, 0, Math.PI], scale: [1.05, 1, 0.2], ink: false });
      break;
    case 2: // rainbow arcs
      for (let i = 0; i < 4; i++)
        f.torus(s * (0.34 - i * 0.07), s * 0.032, 4, 14, [PAL.confettiA, PAL.confettiB, PAL.confettiC, PAL.confettiE][i]!, cx, cy - s * 0.18, z, { ink: false }, Math.PI);
      break;
    case 3: // family of happy blobs (abstract — never likenesses)
      [PAL.chrisHoodie, PAL.ashleyRobe, PAL.addyMain, PAL.ellieMain, PAL.heidiMain].forEach((c, i) => {
        const hh = [0.36, 0.33, 0.25, 0.25, 0.21][i]! * s;
        const px = cx + (i - 2) * s * 0.17;
        f.box(s * 0.12, hh, 0.008, c, px, cy - s * 0.38 + hh / 2, z, { ink: false });
        f.ball(s * 0.07, 1, 0xf6d2b0, px, cy - s * 0.38 + hh + s * 0.06, z, { scale: [1, 1, 0.2], ink: false });
      });
      break;
    case 4: // flower
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        f.ball(s * 0.11, 1, PAL.flowerPink, cx + Math.cos(a) * s * 0.14, cy + 0.02 + Math.sin(a) * s * 0.14, z, { scale: [1, 1, 0.2], ink: false });
      }
      f.ball(s * 0.09, 1, PAL.flowerYellow, cx, cy + 0.02, z + 0.004, { scale: [1, 1, 0.2], ink: false });
      break;
    default: // boats on water
      f.box(w - t * 2 - 0.01, s * 0.3, 0.008, PAL.uiSky, cx, cy - s * 0.28, z, { ink: false });
      f.cone(s * 0.18, s * 0.34, 3, 0xffffff, cx, cy + s * 0.05, z, { scale: [1, 1, 0.2], ink: false });
  }
}

/** A row of books (on a shelf top at local y). */
export function books(f: Frame, x0: number, x1: number, y: number, z: number, depth: number, seed: number): void {
  let x = x0;
  let i = 0;
  const cols = [PAL.booksA, PAL.booksB, PAL.booksC, PAL.fabricSage, PAL.addyMain, PAL.heidiMain, PAL.ellieMain];
  while (x < x1 - 0.03) {
    const w = 0.035 + 0.03 * hash01(seed, i, 1);
    const h = 0.16 + 0.1 * hash01(seed, i, 2);
    if (x + w > x1) break;
    const lean = hash01(seed, i, 3) > 0.85 ? 0.18 : 0;
    f.box(w, h, depth, cols[Math.floor(hash01(seed, i, 4) * cols.length)]!, x + w / 2, y + h / 2, z, { rot: [0, 0, lean] });
    x += w + 0.004 + lean * 0.1;
    i++;
  }
}

/** Soft cushion (rounded, smooth). */
export function cushion(f: Frame, w: number, h: number, d: number, color: number, x: number, y: number, z: number, o: LocalOpts = {}): void {
  f.rbox(w, h, d, Math.min(w, h, d) * 0.42, color, x, y, z, o, 1);
}

/** Builders for glowing lamp parts, one per lamp group (their material's emissive follows the clock). */
export interface Glows {
  night: GeoBuilder;
  house: GeoBuilder;
  outdoor: GeoBuilder;
}
