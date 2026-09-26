// ─────────────────────────────────────────────────────────────────────────────
// HAIR CONTRACT — the girls' long, thick, brushable stylised hair + the brushes
// (incl. THE BLACK BRUSH). The signature visual of the game: it must look
// beautiful in the dollhouse view AND in the close-up brushing camera.
//
// Owner: hair module (src/hair/*). The family module calls createGirlHair() and
// parents `rig.root` to the girl's 'head' socket. The brushing activity
// (src/activities/hair/*) owns the gameplay state and writes it into the rig.
// SHARED CONTRACT (frozen): changes go through the integrator.
//
// HAIR SPACE — the brushable part of the hair is a 2D field seen from BEHIND:
//   u ∈ [0, 1] across the back, 0 = the girl's RIGHT side (= screen-left when the camera is behind her),
//              1 = her LEFT side (screen-right). (Seen from behind, screen-left == her right.)
//   v ∈ [0, 1] along the length, 0 = scalp/crown, 1 = the tips.
// The field is `cols` locks × `rows` sections; cell (col, row) covers
//   u ∈ [col/cols, (col+1)/cols), v ∈ [row/rows, (row+1)/rows). Index = row * cols + col.
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';

/** Head/body measurements the hair drapes over, in HEAD SPACE (origin = head centre, +Y up, +Z = face forward). */
export interface HairFit {
  /** Head ellipsoid radii (m). */
  rx: number;
  ry: number;
  rz: number;
  /** Shoulder line height relative to the head centre (negative, m). */
  shoulderY: number;
  /** Half the shoulder width (m). */
  shoulderHalfWidth: number;
  /** Z of the upper back surface at shoulder height (negative, m). Hair must stay behind this. */
  backZ: number;
  /** Where the neck meets the head (negative y, m). */
  neckY: number;
}

export interface HairBuildOpts {
  fit: HairFit;
  /** Hair colour (hex). The rig derives darker roots, lighter sheen, underside shade. */
  color: number;
  /** Length from crown to tips (m). Twins ≈ 0.55, Heidi ≈ 0.48 (long, thick, mid-back). */
  length: number;
  /** Cosmetic seed (lock variation, part side, flyaways). */
  seed: number;
  /** Field resolution (defaults: cols 9, rows 4). 'Extra-long morning' uses rows 5. */
  cols?: number;
  rows?: number;
}

export interface BrushContact {
  /** Hair-space position of the brush centre. */
  u: number;
  v: number;
  /** 0..1 how firmly the brush is pressed in (visual: locks part + flatten under it). */
  pressure: number;
  /** Brush width in u units (≈ 0.22 normal, ≈ 0.29 the black brush). */
  width: number;
  /** Stroke velocity in hair space (u/s, v/s) — the rig drags the locks slightly along it. */
  du: number;
  dv: number;
}

export interface HairRig {
  /** Parented to the head socket by the family module. */
  readonly root: THREE.Object3D;
  readonly cols: number;
  readonly rows: number;
  /**
   * Tangle per cell, 0 = smooth … 1 = heavily knotted. OWNED by gameplay: write values, then commit().
   * Visuals: twisted/frizzed lock sections, small tangled clusters, dull colour where tangled.
   */
  readonly tangle: Float32Array;
  /** Upload `tangle` after writing it (cheap; call at most once per frame). */
  commit(): void;
  /**
   * Global bedhead 0..1: sleep-mess volume, crown flyaways, a cowlick, lifted ends. The dollhouse-view read of
   * "hasn't brushed yet". Gameplay drives it (e.g. = mean tangle during brushing, 0 after).
   */
  setBedhead(v: number): void;
  /** Global shine 0..1: glossy highlight band + sparkle glints (brushed hair ≈ 1). */
  setShine(v: number): void;
  /** Show soft swirl knot markers on cells with tangle > 0.15 (close-up only). `inspect` tints them red (Mom's check). */
  setKnotMarkers(mode: 'off' | 'soft' | 'inspect'): void;
  /** Brush contact for the local deformation, null = not touching. */
  setBrush(contact: BrushContact | null): void;
  /** A brief "snag" wobble at a cell (the brush caught a knot). */
  snag(col: number, row: number): void;
  /**
   * Invisible hit-test mesh covering the brushable back surface; its geometry `uv` attribute IS hair space
   * (uv.x = u, uv.y = v). Raycast it with the pointer ray. It follows the head (child of `root`).
   */
  readonly proxy: THREE.Mesh;
  /** World position on the hair surface at (u, v) — for the brush placement and particles. */
  surfacePoint(u: number, v: number, out: THREE.Vector3): THREE.Vector3;
  /** Outward surface normal (world) at (u, v). */
  surfaceNormal(u: number, v: number, out: THREE.Vector3): THREE.Vector3;
  /**
   * Animate. The rig derives sway from its own world-space motion between frames (walking, turning, hair flips),
   * so no motion input is needed.
   */
  update(dt: number): void;
  dispose(): void;
}

// ── Brushes ──────────────────────────────────────────────────────────────────

export type BrushKind = 'black' | 'purple' | 'pink' | 'teal';

export const BRUSH_NAMES: Readonly<Record<BrushKind, string>> = {
  black: 'THE BLACK BRUSH',
  purple: 'Purple Paddle',
  pink: 'Pink Round',
  teal: 'Teal Detangler',
};

export interface Brush {
  readonly kind: BrushKind;
  /**
   * Origin = centre of the grip (where a hand holds it). The head extends along local +Y (handle below, head
   * above, total ≈ 0.24 m); bristles point toward local +Z. Attach to a 'handR' socket directly.
   */
  readonly root: THREE.Group;
  /** Legendary treatment 0..1 (black brush reveal): rim glow + sheen sweep + sparkle glints. Harmless on others. */
  setGlow(v: number): void;
  update(dt: number): void;
  dispose(): void;
}

/*
 * src/hair/index.ts exports:
 *   export function createGirlHair(opts: HairBuildOpts): HairRig;
 *   export function createBrush(kind: BrushKind): Brush;
 */
