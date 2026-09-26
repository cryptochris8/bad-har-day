// ─────────────────────────────────────────────────────────────────────────────
// The brushing session (pure bookkeeping, no three.js): each girl's tangle field and brush, who holds THE BLACK
// BRUSH (and for how long), passing it, focus, the unfocused girls brushing themselves, "I'M DONE!" declarations.
// ─────────────────────────────────────────────────────────────────────────────
import type { GirlId } from '../../family/types';
import type { BrushKind } from '../../hair/types';
import type { GirlHairPlan, HairCondition } from '../../plan/types';
import { CONDITION_INFO, initialTangle } from './conditions';
import { BRUSH_SPECS, SELF_RATE, applyStroke, selfBrush, smoothness, type BrushSpec, type StrokeResult } from './rules';

/** A girl only says "I'M DONE!" by herself after this much brushing time (s). */
export const DECLARE_GRACE = 12;

export interface GirlSession {
  readonly id: GirlId;
  readonly field: Float32Array;
  readonly condition: HairCondition;
  readonly doneAt: number;
  readonly rateMul: number;
  readonly perfectNeeded: boolean;
  /** Mean tangle at the start (bedhead easing reference). */
  readonly startMean: number;
  brush: BrushKind;
  declared: boolean;
  /** Declared by the player (DONE) rather than by herself. */
  declaredByPlayer: boolean;
  perfect: boolean;
  blackSeconds: number;
  /** Cell she is brushing herself (−1 = none). */
  working: number;
}

export interface PassResult {
  from: GirlId;
  to: GirlId;
  /** The brush the previous holder gets instead (the receiver's old one). */
  fromGets: BrushKind;
}

export interface TickEvents {
  declared: GirlId[];
  perfect: GirlId[];
}

export interface SessionOpts {
  girls: readonly GirlId[];
  plan: Readonly<Record<GirlId, GirlHairPlan>>;
  holder: GirlId;
  backup: Readonly<Record<GirlId, Exclude<BrushKind, 'black'>>>;
  cols: number;
  rows: number;
}

export class HairSession {
  readonly girls: readonly GirlId[];
  readonly cols: number;
  readonly rows: number;
  readonly g: Record<GirlId, GirlSession>;
  holder: GirlId;
  focus: GirlId;
  passes = 0;
  /** Seconds of brushing so far (girls only declare themselves done after DECLARE_GRACE). */
  elapsed = 0;

  constructor(o: SessionOpts) {
    this.girls = o.girls.slice();
    this.cols = o.cols;
    this.rows = o.rows;
    this.holder = o.holder;
    this.focus = o.holder;
    this.g = {} as Record<GirlId, GirlSession>;
    for (const id of this.girls) {
      const p = o.plan[id];
      const field = initialTangle(p.condition, p.seed, o.cols, o.rows);
      const info = CONDITION_INFO[p.condition];
      this.g[id] = {
        id,
        field,
        condition: p.condition,
        doneAt: Math.max(0.5, Math.min(0.99, p.doneAt)),
        rateMul: info.rate,
        perfectNeeded: info.perfect,
        startMean: 1 - smoothness(field),
        brush: id === o.holder ? 'black' : o.backup[id],
        declared: false,
        declaredByPlayer: false,
        perfect: false,
        blackSeconds: 0,
        working: -1,
      };
    }
  }

  brushOf(id: GirlId): BrushKind {
    return this.g[id].brush;
  }

  spec(id: GirlId): BrushSpec {
    return BRUSH_SPECS[this.g[id].brush];
  }

  smooth(id: GirlId): number {
    return smoothness(this.g[id].field);
  }

  meanTangle(id: GirlId): number {
    return 1 - this.smooth(id);
  }

  get allDeclared(): boolean {
    return this.girls.every((id) => this.g[id].declared);
  }

  setFocus(id: GirlId): boolean {
    if (!this.girls.includes(id) || id === this.focus) return false;
    this.focus = id;
    return true;
  }

  /** Cycle focus (+1 next, −1 previous). */
  cycleFocus(dir: 1 | -1): GirlId {
    const i = this.girls.indexOf(this.focus);
    const n = this.girls.length;
    this.focus = this.girls[(((i + dir) % n) + n) % n]!;
    return this.focus;
  }

  /** Hand THE BLACK BRUSH to `to`; the previous holder takes `to`'s brush. Null if `to` already has it. */
  pass(to: GirlId): PassResult | null {
    if (!this.girls.includes(to) || to === this.holder) return null;
    const from = this.holder;
    const fromGets = this.g[to].brush;
    this.g[to].brush = 'black';
    this.g[from].brush = fromGets;
    this.holder = to;
    this.passes++;
    return { from, to, fromGets };
  }

  /** The player brushes the focused girl. */
  stroke(id: GirlId, u0: number, v0: number, u1: number, v1: number, dt: number, strokeStartV: number): StrokeResult {
    const s = this.g[id];
    return applyStroke(s.field, this.cols, this.rows, u0, v0, u1, v1, dt, strokeStartV, BRUSH_SPECS[s.brush], s.rateMul);
  }

  /** Mark a girl done (she says "I'M DONE!" / the player pressed DONE). False if she already was. */
  declare(id: GirlId, byPlayer = false): boolean {
    const s = this.g[id];
    if (s.declared) return false;
    s.declared = true;
    s.declaredByPlayer = byPlayer;
    return true;
  }

  /**
   * Advance the brushing phase: unfocused, not-yet-done girls brush themselves (faster with the black brush),
   * the holder's black-brush time accrues, and girls declare "I'M DONE!" when they reach their threshold.
   */
  tick(dt: number, focusActive = true): TickEvents {
    const ev: TickEvents = { declared: [], perfect: [] };
    if (!(dt > 0)) return ev;
    this.elapsed += dt;
    this.g[this.holder].blackSeconds += dt;
    for (const id of this.girls) {
      const s = this.g[id];
      if (!s.declared && (id !== this.focus || !focusActive)) {
        s.working = selfBrush(s.field, this.cols, this.rows, dt, SELF_RATE * BRUSH_SPECS[s.brush].self * s.rateMul);
      } else s.working = -1;
      const sm = smoothness(s.field);
      if (!s.declared && sm >= s.doneAt && this.elapsed >= DECLARE_GRACE) {
        s.declared = true;
        ev.declared.push(id);
      }
      if (s.perfectNeeded && !s.perfect && sm >= 0.999) {
        s.perfect = true;
        ev.perfect.push(id);
      }
    }
    return ev;
  }
}
