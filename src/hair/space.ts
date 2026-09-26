// ─────────────────────────────────────────────────────────────────────────────
// Hair space + tangle-field helpers (pure, no three.js).
//
// Hair space is the brushable 2D field seen from BEHIND the girl:
//   u ∈ [0, 1] across the back (0 = screen-left when the camera is behind her = head-space +X),
//   v ∈ [0, 1] along the length (0 = crown, 1 = tips).
// The field is `cols` locks × `rows` sections; cell (col, row) covers
//   u ∈ [col/cols, (col+1)/cols), v ∈ [row/rows, (row+1)/rows); index = row * cols + col.
// These helpers are shared by the rig (visuals) and the brushing activity (gameplay).
// ─────────────────────────────────────────────────────────────────────────────

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Column of a u coordinate (u = 1 belongs to the last column). */
export function colOf(u: number, cols: number): number {
  const c = Math.floor(clamp01(u) * cols);
  return c >= cols ? cols - 1 : c;
}

/** Row of a v coordinate (v = 1 belongs to the last row). */
export function rowOf(v: number, rows: number): number {
  const r = Math.floor(clamp01(v) * rows);
  return r >= rows ? rows - 1 : r;
}

/** Field index of a cell. */
export function cellIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/** Field index of the cell containing (u, v). */
export function cellAt(u: number, v: number, cols: number, rows: number): number {
  return rowOf(v, rows) * cols + colOf(u, cols);
}

/** Centre of a cell in hair space. */
export function cellCenter(col: number, row: number, cols: number, rows: number, out: { u: number; v: number }): { u: number; v: number } {
  out.u = (col + 0.5) / cols;
  out.v = (row + 0.5) / rows;
  return out;
}

/**
 * Tangle value for a lock at `u` (exact column) and length position `v` (smooth between row centres).
 * This is what the rig displays: a lock shows exactly its own column, sections blend softly along the length.
 */
export function sampleLock(field: ArrayLike<number>, cols: number, rows: number, u: number, v: number): number {
  const col = colOf(u, cols);
  const fr = clamp01(v) * rows - 0.5;
  let r0 = Math.floor(fr);
  let t = fr - r0;
  if (r0 < 0) {
    r0 = 0;
    t = 0;
  }
  let r1 = r0 + 1;
  if (r1 > rows - 1) {
    r1 = rows - 1;
    if (r0 > rows - 1) r0 = rows - 1;
  }
  const s = t * t * (3 - 2 * t);
  const a = field[r0 * cols + col] ?? 0;
  const b = field[r1 * cols + col] ?? 0;
  return a + (b - a) * s;
}

/** Bilinear sample between cell centres (both axes smooth). */
export function sampleBilinear(field: ArrayLike<number>, cols: number, rows: number, u: number, v: number): number {
  const fc = clamp01(u) * cols - 0.5;
  const fr = clamp01(v) * rows - 0.5;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(fc)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(fr)));
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const tc = Math.max(0, Math.min(1, fc - c0));
  const tr = Math.max(0, Math.min(1, fr - r0));
  const a = field[r0 * cols + c0] ?? 0;
  const b = field[r0 * cols + c1] ?? 0;
  const c = field[r1 * cols + c0] ?? 0;
  const d = field[r1 * cols + c1] ?? 0;
  const top = a + (b - a) * tc;
  const bot = c + (d - c) * tc;
  return top + (bot - top) * tr;
}

/** Mean value of a field (0 for an empty field). */
export function fieldMean(field: ArrayLike<number>): number {
  if (field.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < field.length; i++) s += field[i]!;
  return s / field.length;
}

/** Largest value in a field. */
export function fieldMax(field: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < field.length; i++) if (field[i]! > m) m = field[i]!;
  return m;
}

/** Fraction of cells at or below `threshold` (the "smooth %" Mom checks). */
export function smoothFraction(field: ArrayLike<number>, threshold = 0.15): number {
  if (field.length === 0) return 1;
  let n = 0;
  for (let i = 0; i < field.length; i++) if (field[i]! <= threshold) n++;
  return n / field.length;
}

/**
 * Visit every cell swept by a brush of half-width `halfWidth` (u units) moving from (u0, v0) to (u1, v1).
 * `visit(col, row, coverage)` gets each touched cell once with coverage 0..1 (how centrally the brush crossed it).
 * Returns the number of cells visited. Allocation-free.
 */
export function sweepCells(
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  halfWidth: number,
  cols: number,
  rows: number,
  visit: (col: number, row: number, coverage: number) => void,
): number {
  const vMin = clamp01(Math.min(v0, v1));
  const vMax = clamp01(Math.max(v0, v1));
  const rA = rowOf(vMin, rows);
  const rB = rowOf(vMax, rows);
  let n = 0;
  for (let row = rA; row <= rB; row++) {
    // Brush centre u where the stroke crosses this row's middle (clamped to the stroke).
    const vMid = (row + 0.5) / rows;
    const span = v1 - v0;
    const t = Math.abs(span) < 1e-9 ? 0.5 : clamp01((vMid - v0) / span);
    const uc = u0 + (u1 - u0) * t;
    const cA = colOf(uc - halfWidth, cols);
    const cB = colOf(uc + halfWidth, cols);
    for (let col = cA; col <= cB; col++) {
      const cu = (col + 0.5) / cols;
      const d = Math.abs(cu - uc);
      const reach = halfWidth + 0.5 / cols;
      const coverage = reach <= 0 ? 1 : clamp01(1 - d / reach);
      if (coverage <= 0) continue;
      visit(col, row, coverage);
      n++;
    }
  }
  return n;
}

/**
 * Brush influence across the hair (u): 1 under the middle of the brush, smooth falloff to 0 at the brush edge.
 * `du` = |u − brush centre|, `halfWidth` = brush half-width in u.
 */
export function brushFalloffU(du: number, halfWidth: number): number {
  if (halfWidth <= 0) return 0;
  const x = Math.abs(du) / halfWidth;
  if (x >= 1) return 0;
  const t = 1 - x * x;
  return t * t;
}

/**
 * Brush influence along the lock (v): the brush flattens a short band around its centre; the band trails
 * further BELOW the brush (hair combed down) than above it. `dv` = v − brush centre (positive = toward the tips).
 */
export function brushFalloffV(dv: number, above = 0.07, below = 0.16): number {
  const r = dv >= 0 ? below : above;
  if (r <= 0) return 0;
  const x = Math.abs(dv) / r;
  if (x >= 1) return 0;
  return 1 - x * x * (3 - 2 * x);
}

/**
 * Parting profile across the brush: locks just outside the brush edge get pushed sideways (away from the
 * brush centre). Returns a signed push in [-1, 1] for a lock at signed offset `du` from the brush centre.
 */
export function brushPartPush(du: number, halfWidth: number): number {
  if (halfWidth <= 0) return 0;
  const x = du / halfWidth;
  const ax = Math.abs(x);
  if (ax >= 1.8) return 0;
  // Rises through the brush (combed apart), peaks just outside the edge, fades out.
  const bump = ax < 1 ? ax * ax * 0.6 : 0.6 + 0.4 * Math.sin(((ax - 1) / 0.8) * Math.PI) * (1 - (ax - 1) / 0.8);
  const fade = ax < 1.2 ? 1 : 1 - (ax - 1.2) / 0.6;
  return Math.sign(x) * Math.max(0, bump) * Math.max(0, fade);
}

/** Snag wobble envelope: amplitude 0..1 for the time since the snag (s). */
export function snagEnvelope(t: number, duration = 0.55): number {
  if (t < 0 || t >= duration) return 0;
  const k = 1 - t / duration;
  return k * k;
}
