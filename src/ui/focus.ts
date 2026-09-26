// Menu focus navigation for keyboard / gamepad (via MenuActions) and pointer. (Adapted from
// ATHLETE MAYHEM's src/ui/focus.ts.)
//
// A screen hands its focusable items to a FocusGroup as rows (reading order). Two navigation modes:
//   'spatial' (default) — up/down/left/right pick the nearest item in that direction using the live
//                         layout (a row of cards that stacks into a column on a phone just works);
//                         up/down wrap around. Falls back to 'grid' when there is no layout (jsdom,
//                         hidden screen).
//   'grid'              — up/down move between rows (wrapping), left/right within a row.
// If the focused item is adjustable (slider / toggle / swatch row), left/right adjust it instead.
// Activation happens ONLY through 'confirm' or a real pointer click/tap, never native Enter.
// Mouse hover moves focus only after the mouse really moved since the menu appeared.
import { onClick } from './dom';

export type NavDir = 'up' | 'down' | 'left' | 'right';
export type NavStep = 'next' | 'prev';
export type NavMode = 'spatial' | 'grid';

export interface FocusPos {
  row: number;
  col: number;
}

/** Pure grid navigation over row sizes. Empty rows are skipped; rows wrap, columns clamp. */
export function moveFocus(rowSizes: readonly number[], pos: FocusPos, dir: NavDir): FocusPos {
  const n = rowSizes.length;
  if (n === 0) return pos;
  if (dir === 'left' || dir === 'right') {
    const size = rowSizes[pos.row] ?? 0;
    if (size === 0) return pos;
    const col = Math.min(size - 1, Math.max(0, pos.col + (dir === 'left' ? -1 : 1)));
    return { row: pos.row, col };
  }
  const step = dir === 'up' ? -1 : 1;
  let row = pos.row;
  for (let i = 0; i < n; i++) {
    row = (((row + step) % n) + n) % n;
    const size = rowSizes[row] ?? 0;
    if (size > 0) return { row, col: Math.min(pos.col, size - 1) };
  }
  return pos;
}

/** Pure linear (reading-order) step over row sizes, wrapping. Empty rows are skipped. */
export function stepFocus(rowSizes: readonly number[], pos: FocusPos, step: NavStep): FocusPos {
  const total = rowSizes.reduce((a, n) => a + Math.max(0, n), 0);
  if (total === 0) return pos;
  let flat = 0;
  for (let r = 0; r < pos.row && r < rowSizes.length; r++) flat += Math.max(0, rowSizes[r] ?? 0);
  flat += Math.max(0, Math.min(pos.col, (rowSizes[pos.row] ?? 1) - 1));
  flat = (((flat + (step === 'next' ? 1 : -1)) % total) + total) % total;
  for (let r = 0; r < rowSizes.length; r++) {
    const n = Math.max(0, rowSizes[r] ?? 0);
    if (flat < n) return { row: r, col: flat };
    flat -= n;
  }
  return pos;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function rangeGap(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

/**
 * Pure spatial navigation: index of the best item from `from` in direction `dir`, or −1.
 * Items overlapping on the cross axis (same row / column) always win; then the score is the edge gap
 * along the axis plus 2 × the orthogonal gap. With `wrap` (vertical only), running off the
 * top/bottom picks the item at the far end nearest horizontally.
 */
export function spatialPick(rects: readonly Rect[], from: number, dir: NavDir, wrap = true): number {
  const cur = rects[from];
  if (!cur) return -1;
  const cx = cur.left + cur.width / 2;
  const cy = cur.top + cur.height / 2;
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i]!;
    if (r.width <= 0 && r.height <= 0) continue;
    const rx = r.left + r.width / 2;
    const ry = r.top + r.height / 2;
    const along = horizontal ? (rx - cx) * sign : (ry - cy) * sign;
    if (along <= 2) continue;
    const edge = horizontal
      ? Math.max(0, sign > 0 ? r.left - (cur.left + cur.width) : cur.left - (r.left + r.width))
      : Math.max(0, sign > 0 ? r.top - (cur.top + cur.height) : cur.top - (r.top + r.height));
    const ortho = horizontal
      ? rangeGap(cur.top, cur.top + cur.height, r.top, r.top + r.height)
      : rangeGap(cur.left, cur.left + cur.width, r.left, r.left + r.width);
    const orthoCentre = horizontal ? Math.abs(ry - cy) : Math.abs(rx - cx);
    const score = edge + along * 0.25 + ortho * 2 + (ortho > 0 ? 10000 : 0) + orthoCentre * 0.05;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0 || !wrap || horizontal) return best;
  let far = -Infinity;
  for (let i = 0; i < rects.length; i++) {
    if (i === from) continue;
    const r = rects[i]!;
    if (r.width <= 0 && r.height <= 0) continue;
    const ry = (r.top + r.height / 2) * -sign;
    const rx = r.left + r.width / 2;
    const score = ry * 1000 - Math.abs(rx - cx);
    if (score > far + 1e-6) {
      far = score;
      best = i;
    }
  }
  return best;
}

export interface FocusItem {
  el: HTMLElement;
  /** Called on confirm / click / tap. */
  activate?: () => void;
  /** Left/right on this item adjusts it instead of moving focus. Return true if the value changed. */
  adjust?: (dir: -1 | 1) => boolean;
  /** UI sound for activation (default 'confirm'; back buttons use 'back'; 'none' = the item plays its own). */
  sound?: 'confirm' | 'back' | 'none';
  /** Pointer clicks on this element are handled by the item itself (swatch rows, sliders). */
  noClick?: boolean;
}

export type FocusResult = 'moved' | 'adjusted' | 'activated' | 'none';

/** Counts real mouse movements (pointermove with changed coordinates). */
export class HoverTracker {
  private x = Number.NaN;
  private y = Number.NaN;
  private count = 0;
  observe(pointerType: string, x: number, y: number): void {
    if (pointerType !== 'mouse') return;
    if (x === this.x && y === this.y) return;
    this.x = x;
    this.y = y;
    this.count++;
  }
  get moves(): number {
    return this.count;
  }
}

let sharedHover: HoverTracker | null = null;
/** The page-wide tracker (installs one capture-phase pointermove listener on first use). */
export function hoverTracker(): HoverTracker {
  if (sharedHover) return sharedHover;
  const t = new HoverTracker();
  sharedHover = t;
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(
      'pointermove',
      (e) => {
        const pe = e as PointerEvent;
        t.observe(pe.pointerType ?? 'mouse', pe.clientX ?? 0, pe.clientY ?? 0);
      },
      { capture: true, passive: true },
    );
  }
  return t;
}

export interface FocusOptions {
  mode?: NavMode;
  hover?: HoverTracker;
}

/**
 * DOM-side focus state for one screen. Marks the focused element with `.is-focused` (the CSS draws
 * the ring) and wires hover/click/tap on every item.
 */
export class FocusGroup {
  private rows: FocusItem[][] = [];
  private pos: FocusPos = { row: 0, col: 0 };
  private goalCol = 0;
  private focusedEl: HTMLElement | null = null;
  private readonly wired = new WeakSet<HTMLElement>();
  private readonly hover: HoverTracker;
  private hoverArmedAt = -1;
  private staleEnter: HTMLElement | null = null;
  mode: NavMode;
  /** Optional gate for pointer activation (e.g. the report card ignores taps while it counts up). */
  gate: (() => boolean) | null = null;
  /** Called whenever the focused element changes (keyboard, gamepad, hover or click). */
  onChange: ((el: HTMLElement | null) => void) | null = null;

  constructor(
    private readonly onPointer: (result: FocusResult, item: FocusItem) => void = () => {},
    opts: FocusOptions = {},
  ) {
    this.hover = opts.hover ?? hoverTracker();
    this.mode = opts.mode ?? 'spatial';
  }

  /** The menu just appeared: ignore hover until the mouse moves. */
  freezeHover(): void {
    this.hoverArmedAt = this.hover.moves;
    this.staleEnter = null;
  }

  /** Replace the items. Focus goes to `initial` if given (and present), else stays near the old position. */
  setRows(rows: FocusItem[][], initial?: HTMLElement | null): void {
    this.rows = rows.filter((r) => r.length > 0);
    for (const row of this.rows) for (const item of row) this.wire(item);
    const at = initial ? this.find(initial) : null;
    if (at) this.pos = at;
    else {
      const row = Math.min(this.pos.row, Math.max(0, this.rows.length - 1));
      this.pos = { row, col: Math.min(this.pos.col, Math.max(0, (this.rows[row]?.length ?? 1) - 1)) };
    }
    this.goalCol = this.pos.col;
    this.focusedEl?.classList.remove('is-focused');
    this.focusedEl = null;
    this.paint();
    this.freezeHover();
  }

  get current(): FocusItem | null {
    return this.rows[this.pos.row]?.[this.pos.col] ?? null;
  }

  get position(): FocusPos {
    return { row: this.pos.row, col: this.pos.col };
  }

  get items(): readonly FocusItem[] {
    return this.rows.flat();
  }

  focus(el: HTMLElement): boolean {
    const at = this.find(el);
    if (!at) return false;
    const changed = at.row !== this.pos.row || at.col !== this.pos.col;
    this.pos = at;
    this.goalCol = at.col;
    this.paint();
    return changed;
  }

  /** Handle a navigation/confirm action. */
  handle(action: NavDir | NavStep | 'confirm'): FocusResult {
    const item = this.current;
    if (action === 'confirm') {
      if (!item?.activate) return 'none';
      item.activate();
      return 'activated';
    }
    if (action === 'next' || action === 'prev') {
      const next = stepFocus(
        this.rows.map((r) => r.length),
        this.pos,
        action,
      );
      return this.moveTo(next, true);
    }
    if ((action === 'left' || action === 'right') && item?.adjust) {
      return item.adjust(action === 'left' ? -1 : 1) ? 'adjusted' : 'none';
    }
    if (this.mode === 'spatial') {
      const flat = this.rows.flat();
      const rects = flat.map((it) => it.el.getBoundingClientRect());
      if (rects.some((r) => r.width > 0 || r.height > 0)) {
        const from = flat.indexOf(item as FocusItem);
        const idx = spatialPick(rects, from, action);
        if (idx < 0 || idx === from) return 'none';
        const at = this.find(flat[idx]!.el);
        return at ? this.moveTo(at, true) : 'none';
      }
    }
    const vertical = action === 'up' || action === 'down';
    const next = moveFocus(
      this.rows.map((r) => r.length),
      vertical ? { row: this.pos.row, col: this.goalCol } : this.pos,
      action,
    );
    return this.moveTo(next, !vertical);
  }

  private moveTo(next: FocusPos, setGoal: boolean): FocusResult {
    if (next.row === this.pos.row && next.col === this.pos.col) return 'none';
    this.pos = next;
    if (setGoal) this.goalCol = next.col;
    this.paint();
    return 'moved';
  }

  private find(el: HTMLElement): FocusPos | null {
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r]!.findIndex((it) => it.el === el);
      if (c >= 0) return { row: r, col: c };
    }
    return null;
  }

  private paint(): void {
    const el = this.current?.el ?? null;
    if (el === this.focusedEl) return;
    this.focusedEl?.classList.remove('is-focused');
    el?.classList.add('is-focused');
    this.focusedEl = el;
    this.onChange?.(el);
  }

  /** Paint the ring on the current item again (screen re-entered after blur()). */
  repaint(): void {
    this.paint();
  }

  /** Drop the ring (screen left). The next setRows/focus/repaint paints it again. */
  blur(): void {
    this.focusedEl?.classList.remove('is-focused');
    this.focusedEl = null;
  }

  private wire(item: FocusItem): void {
    if (this.wired.has(item.el)) return;
    this.wired.add(item.el);
    const isMouse = (e: PointerEvent): boolean => (e.pointerType ?? 'mouse') === 'mouse';
    item.el.addEventListener('pointerenter', (e) => {
      if (!isMouse(e)) return;
      if (this.hover.moves === this.hoverArmedAt) {
        this.staleEnter = item.el;
        return;
      }
      this.staleEnter = null;
      if (this.focus(item.el)) this.onPointer('moved', item);
    });
    item.el.addEventListener('pointermove', (e) => {
      if (this.staleEnter !== item.el || !isMouse(e) || this.hover.moves === this.hoverArmedAt) return;
      this.staleEnter = null;
      if (this.focus(item.el)) this.onPointer('moved', item);
    });
    item.el.addEventListener('pointerleave', () => {
      if (this.staleEnter === item.el) this.staleEnter = null;
    });
    onClick(item.el, () => {
      if (this.gate && !this.gate()) return;
      if (!this.find(item.el)) return;
      this.focus(item.el);
      const it = this.current;
      if (it?.el === item.el && it.activate && !it.noClick) {
        this.onPointer('activated', it);
        it.activate();
      }
    });
  }
}
