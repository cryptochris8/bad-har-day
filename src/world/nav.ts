// ─────────────────────────────────────────────────────────────────────────────
// Navigation grid (0.25 m cells) + A* (8-way, no corner cutting) + string-pull
// smoothing. Built once from the collision world's static colliders (doors are
// not in it — closed doors count as open for paths). Adapted from Trash Panda's
// sim/world/nav.ts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Rect } from './layout';

export const NAV_CELL = 0.25;
/** Colliders are inflated by this when marking cells unwalkable (≈ character radius). */
export const NAV_INFLATE = 0.3;

export interface NavGrid {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  readonly ox: number;
  readonly oz: number;
  readonly walkable: Uint8Array;
}

export interface Pt {
  x: number;
  z: number;
}

export function buildNavGrid(
  bounds: Rect,
  forEach: (onRect: (x0: number, z0: number, x1: number, z1: number) => void, onCircle: (x: number, z: number, r: number) => void) => void,
  inflate = NAV_INFLATE,
  cell = NAV_CELL,
): NavGrid {
  const cols = Math.ceil((bounds.x1 - bounds.x0) / cell);
  const rows = Math.ceil((bounds.z1 - bounds.z0) / cell);
  const walkable = new Uint8Array(cols * rows).fill(1);
  const ox = bounds.x0;
  const oz = bounds.z0;
  const edge = Math.ceil(inflate / cell);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) if (c < edge || r < edge || c >= cols - edge || r >= rows - edge) walkable[r * cols + c] = 0;
  const mark = (x0: number, z0: number, x1: number, z1: number, test: (x: number, z: number) => boolean) => {
    const c0 = Math.max(0, Math.floor((x0 - inflate - ox) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x1 + inflate - ox) / cell));
    const r0 = Math.max(0, Math.floor((z0 - inflate - oz) / cell));
    const r1 = Math.min(rows - 1, Math.floor((z1 + inflate - oz) / cell));
    for (let r = r0; r <= r1; r++) {
      const z = oz + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        const x = ox + (c + 0.5) * cell;
        if (test(x, z)) walkable[r * cols + c] = 0;
      }
    }
  };
  forEach(
    (x0, z0, x1, z1) =>
      mark(x0, z0, x1, z1, (x, z) => {
        const cx = x < x0 ? x0 : x > x1 ? x1 : x;
        const cz = z < z0 ? z0 : z > z1 ? z1 : z;
        return (x - cx) ** 2 + (z - cz) ** 2 < inflate * inflate;
      }),
    (cx, cz, cr) => mark(cx - cr, cz - cr, cx + cr, cz + cr, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 < (cr + inflate) ** 2),
  );
  return { cell, cols, rows, ox, oz, walkable };
}

export function cellIndex(nav: NavGrid, x: number, z: number): number {
  const c = Math.floor((x - nav.ox) / nav.cell);
  const r = Math.floor((z - nav.oz) / nav.cell);
  if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) return -1;
  return r * nav.cols + c;
}

export function cellCenter(nav: NavGrid, idx: number): Pt {
  const c = idx % nav.cols;
  const r = (idx - c) / nav.cols;
  return { x: nav.ox + (c + 0.5) * nav.cell, z: nav.oz + (r + 0.5) * nav.cell };
}

export function isWalkable(nav: NavGrid, x: number, z: number): boolean {
  const i = cellIndex(nav, x, z);
  return i >= 0 && nav.walkable[i] === 1;
}

/** Nearest walkable cell centre within `maxR` metres (ring search), or null. */
export function nearestWalkable(nav: NavGrid, x: number, z: number, maxR = 3): Pt | null {
  const c0 = Math.floor((x - nav.ox) / nav.cell);
  const r0 = Math.floor((z - nav.oz) / nav.cell);
  const maxRing = Math.ceil(maxR / nav.cell);
  let best: Pt | null = null;
  let bestD = Infinity;
  for (let ring = 0; ring <= maxRing; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const cc = c0 + dc;
        const rr = r0 + dr;
        if (cc < 0 || rr < 0 || cc >= nav.cols || rr >= nav.rows) continue;
        const idx = rr * nav.cols + cc;
        if (nav.walkable[idx] !== 1) continue;
        const p = cellCenter(nav, idx);
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    // A ring further out can still hold a closer point only within ~1 cell; stop one ring after a hit.
    if (best && ring * nav.cell > Math.sqrt(bestD) + nav.cell) return best;
  }
  return best;
}

interface Scratch {
  g: Float32Array;
  f: Float32Array;
  parent: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  heap: Int32Array;
  gen: number;
}
const scratchCache = new WeakMap<NavGrid, Scratch>();
function scratchFor(nav: NavGrid): Scratch {
  let s = scratchCache.get(nav);
  if (!s) {
    const n = nav.cols * nav.rows;
    s = { g: new Float32Array(n), f: new Float32Array(n), parent: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), heap: new Int32Array(n * 2), gen: 0 };
    scratchCache.set(nav, s);
  }
  return s;
}

const SQRT2 = Math.SQRT2;
const DC = [1, -1, 0, 0, 1, 1, -1, -1];
const DR = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * A* from (sx, sz) to (gx, gz). Start/goal snap to the nearest walkable cell. Returns smoothed waypoints
 * (excluding the start, ending at the goal — the exact goal when it is walkable, else the nearest walkable
 * spot), [] when already there, or null when unreachable.
 */
export function findPath(nav: NavGrid, sx: number, sz: number, gx: number, gz: number, maxExpand = 40000): Pt[] | null {
  const cols = nav.cols;
  let start = cellIndex(nav, sx, sz);
  let startPt: Pt = { x: sx, z: sz };
  let snapped = false;
  if (start < 0 || nav.walkable[start] !== 1) {
    const p = nearestWalkable(nav, sx, sz, 2.5);
    if (!p) return null;
    start = cellIndex(nav, p.x, p.z);
    startPt = p;
    snapped = true;
  }
  let goal = cellIndex(nav, gx, gz);
  let goalPt: Pt = { x: gx, z: gz };
  if (goal < 0 || nav.walkable[goal] !== 1) {
    const p = nearestWalkable(nav, gx, gz, 3);
    if (!p) return null;
    goal = cellIndex(nav, p.x, p.z);
    goalPt = p;
  }
  if (start === goal) {
    if (startPt.x === goalPt.x && startPt.z === goalPt.z) return snapped ? [startPt] : [];
    return snapped ? [startPt, goalPt] : [goalPt];
  }
  const s = scratchFor(nav);
  s.gen = (s.gen + 1) >>> 0;
  if (s.gen === 0) {
    s.stamp.fill(0);
    s.closed.fill(0);
    s.gen = 1;
  }
  const gen = s.gen;
  const gc = goal % cols;
  const gr = (goal - gc) / cols;
  const cell = nav.cell;
  const h = (idx: number): number => {
    const c = idx % cols;
    const r = (idx - c) / cols;
    const dx = Math.abs(c - gc);
    const dz = Math.abs(r - gr);
    return (dx + dz + (SQRT2 - 2) * Math.min(dx, dz)) * cell;
  };
  let heapLen = 0;
  const push = (idx: number): void => {
    let i = heapLen++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (s.f[s.heap[p]!]! <= s.f[idx]!) break;
      s.heap[i] = s.heap[p]!;
      i = p;
    }
    s.heap[i] = idx;
  };
  const pop = (): number => {
    const top = s.heap[0]!;
    const last = s.heap[--heapLen]!;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= heapLen) break;
      const r = l + 1;
      const c = r < heapLen && s.f[s.heap[r]!]! < s.f[s.heap[l]!]! ? r : l;
      if (s.f[s.heap[c]!]! >= s.f[last]!) break;
      s.heap[i] = s.heap[c]!;
      i = c;
    }
    s.heap[i] = last;
    return top;
  };
  s.stamp[start] = gen;
  s.g[start] = 0;
  s.f[start] = h(start);
  s.parent[start] = -1;
  push(start);
  let found = false;
  let expanded = 0;
  while (heapLen > 0) {
    const cur = pop();
    if (s.closed[cur] === gen) continue;
    s.closed[cur] = gen;
    if (cur === goal) {
      found = true;
      break;
    }
    if (++expanded > maxExpand) break;
    const c = cur % cols;
    const r = (cur - c) / cols;
    for (let k = 0; k < 8; k++) {
      const nc = c + DC[k]!;
      const nr = r + DR[k]!;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= nav.rows) continue;
      const ni = nr * cols + nc;
      if (nav.walkable[ni] !== 1 || s.closed[ni] === gen) continue;
      if (k >= 4 && (nav.walkable[r * cols + nc] !== 1 || nav.walkable[nr * cols + c] !== 1)) continue;
      const ng = s.g[cur]! + (k >= 4 ? SQRT2 : 1) * cell;
      if (s.stamp[ni] === gen && ng >= s.g[ni]!) continue;
      s.stamp[ni] = gen;
      s.g[ni] = ng;
      s.f[ni] = ng + h(ni);
      s.parent[ni] = cur;
      if (heapLen < s.heap.length) push(ni);
    }
  }
  if (!found) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1 && i !== start; i = s.parent[i]!) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => cellCenter(nav, i));
  pts[pts.length - 1] = goalPt;
  const smooth = smoothPath(nav, startPt.x, startPt.z, pts);
  if (snapped) smooth.unshift(startPt);
  return smooth;
}

/** String pulling: keep only waypoints needed for clear straight walks. */
export function smoothPath(nav: NavGrid, sx: number, sz: number, pts: Pt[]): Pt[] {
  if (pts.length <= 1) return pts;
  const out: Pt[] = [];
  let ax = sx;
  let az = sz;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !walkLine(nav, ax, az, pts[j]!.x, pts[j]!.z)) j--;
    const p = pts[j]!;
    out.push(p);
    ax = p.x;
    az = p.z;
    i = j + 1;
  }
  return out;
}

/** True if every sample along the segment (every quarter cell, with a small side clearance) is walkable. */
export function walkLine(nav: NavGrid, ax: number, az: number, bx: number, bz: number): boolean {
  const len = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(len / (nav.cell * 0.25)));
  const nx = len > 0 ? (-(bz - az) / len) * 0.08 : 0;
  const nz = len > 0 ? ((bx - ax) / len) * 0.08 : 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (i === steps && !isWalkable(nav, x, z)) return false;
    if (i < steps && (!isWalkable(nav, x, z) || !isWalkable(nav, x + nx, z + nz) || !isWalkable(nav, x - nx, z - nz))) return false;
  }
  return true;
}
