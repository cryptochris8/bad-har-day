// Pure game logic for "Take the dog out" (no three.js, no DOM): the dog's attention rhythm (glance windows), call
// judgement, quirk timing, sniff-spot picking and scoring. Unit-tested in tests/activities/dog/.
import type { DogQuirk, Stars } from '../../plan/types';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ── attention ────────────────────────────────────────────────────────────────

export interface AttentionTuning {
  /** Seconds between glances at treat level 0 → 1. */
  interval: readonly [number, number];
  /** Glance window length at treat level 0 → 1. */
  window: readonly [number, number];
  /** Treat level gain per second while the bag is shaken / decay per second otherwise. */
  rise: number;
  decay: number;
  /** ± fraction of random jitter on each interval. */
  jitter: number;
  /** While shaking, the countdown runs this much faster at full treat level. */
  shakeHaste: number;
}

export const ATTENTION: Readonly<AttentionTuning> = {
  interval: [4.2, 1.7],
  window: [1.2, 2.1],
  rise: 0.42,
  decay: 0.055,
  jitter: 0.15,
  shakeHaste: 1.2,
};

export type AttentionEvent = 'open' | 'close' | null;

/**
 * The dog's glance-back rhythm. A countdown runs to the next glance; when it hits zero and the dog is free to
 * look (`canGlance`) a window opens for a moment (the only time a call brings it back). Shaking the treat bag
 * raises `level`: glances come sooner and last longer.
 */
export class Attention {
  level = 0;
  open = false;
  /** Seconds to the next glance (closed) or left in the window (open). */
  timer: number;
  /** Length of the current countdown / window (meter scale). */
  span: number;

  constructor(
    private readonly rand: () => number,
    firstDelay = 2.5,
    readonly t: Readonly<AttentionTuning> = ATTENTION,
  ) {
    this.timer = firstDelay;
    this.span = firstDelay;
  }

  nextInterval(): number {
    const base = lerp(this.t.interval[0], this.t.interval[1], this.level);
    return base * (1 + this.t.jitter * (this.rand() * 2 - 1));
  }

  windowLength(): number {
    return lerp(this.t.window[0], this.t.window[1], this.level);
  }

  update(dt: number, shaking: boolean, canGlance: boolean): AttentionEvent {
    if (!(dt > 0)) return null;
    this.level = clamp01(this.level + (shaking ? this.t.rise : -this.t.decay) * dt);
    if (this.open) {
      this.timer -= dt;
      if (this.timer <= 0 || !canGlance) {
        this.open = false;
        this.timer = this.span = this.nextInterval();
        return 'close';
      }
      return null;
    }
    const haste = shaking ? 1 + this.t.shakeHaste * this.level : 1;
    this.timer = Math.max(0, this.timer - dt * haste);
    if (this.timer <= 0 && canGlance) {
      this.open = true;
      this.timer = this.span = this.windowLength();
      return 'open';
    }
    return null;
  }

  /** Bring the next glance forward to at most `seconds` from now. */
  soon(seconds: number): void {
    if (this.open) return;
    if (this.timer > seconds) this.timer = seconds;
    this.span = Math.max(this.timer, 0.01);
  }

  /** End the current window early (the dog got called in / moved on). */
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.timer = this.span = this.nextInterval();
  }

  /** 0..1 for the HUD: fills up toward the next glance, full while the window is open. */
  meter(): number {
    if (this.open) return 1;
    return clamp01(1 - this.timer / Math.max(0.01, this.span)) * 0.92;
  }
}

// ── calls ────────────────────────────────────────────────────────────────────

export type CallOutcome =
  /** Window open, business done, not stubborn: the dog trots back inside. */
  | 'recall'
  /** Window open but the business isn't done: "Right — first things first!" → straight to the bush. */
  | 'businessFirst'
  /** Window open, business done, but comfy in the grass: a wag, not yet. */
  | 'stubborn'
  /** No window: head tilt + '?', carries on. */
  | 'ignored';

export function judgeCall(windowOpen: boolean, businessDone: boolean, stubbornLeft: number): CallOutcome {
  if (!windowOpen) return 'ignored';
  if (!businessDone) return 'businessFirst';
  if (stubbornLeft > 0) return 'stubborn';
  return 'recall';
}

/** Treat level at which a stubborn dog gives up and gets up. */
export const STUBBORN_TREAT_LEVEL = 0.6;

// ── quirks ───────────────────────────────────────────────────────────────────

/** Script speed-up from the treat bag before the business (the dog hurries up a bit when it hears treats). */
export function quirkHaste(level: number): number {
  return 1 + 1.3 * clamp01(level);
}

export const QUIRK_OBJECTIVE: Readonly<Record<DogQuirk, (name: string) => string>> = {
  stare: (n) => `${n} is staring at… nothing? Give it a moment.`,
  leaf: (n) => `A leaf! ${n} must defeat the leaf.`,
  sniffAll: (n) => `${n} is reading the morning news. Every. Blade. Of. Grass.`,
  zoomies: () => 'ZOOMIES! Nothing to do but wait (or shake the treats).',
  stubborn: (n) => `Let ${n} do the business first.`,
};

/** Par seconds (door open → successful call) per quirk: a relaxed, attentive run. */
export const QUIRK_PAR: Readonly<Record<DogQuirk, number>> = {
  stare: 24,
  leaf: 26,
  sniffAll: 28,
  zoomies: 24,
  stubborn: 28,
};

/**
 * Pick `count` spots around a centre (seeded), at least `minGap` apart and each accepted by `ok` (walkable, in the
 * yard). Falls back to fewer spots when the area is crowded — never loops forever.
 */
export function pickSpots(
  rand: () => number,
  cx: number,
  cz: number,
  radius: number,
  count: number,
  ok: (x: number, z: number) => boolean,
  minGap = 1.4,
): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let tries = 0; tries < count * 30 && out.length < count; tries++) {
    const a = rand() * Math.PI * 2;
    const r = radius * (0.35 + 0.65 * Math.sqrt(rand()));
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (!ok(x, z)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.z - z) < minGap)) continue;
    out.push({ x, y: 0, z });
  }
  return out;
}

// ── scoring ──────────────────────────────────────────────────────────────────

export interface DogTally {
  quirk: DogQuirk;
  /** Seconds from the door opening to the successful call. */
  seconds: number;
  /** Calls outside a glance window. */
  misses: number;
  /** Calls made after the business was done (the successful one included). */
  callsAfterBusiness: number;
  /** Used the treat bag at all. */
  treats: boolean;
}

/** 1..3 stars: fewer wasted calls and a quicker trip score more. Never 0 — the dog is never a failure. */
export function dogStars(t: DogTally): Stars {
  const par = QUIRK_PAR[t.quirk] ?? 26;
  const missPen = t.misses <= 1 ? 0 : t.misses <= 3 ? 1 : 2;
  const timePen = t.seconds <= par ? 0 : t.seconds <= par + 16 ? 1 : 2;
  const s = 3 - missPen - timePen;
  return (s >= 3 ? 3 : s <= 1 ? 1 : 2) as Stars;
}

/** Award hints: 'dog:fast' = back inside on the first call after the business, no wasted calls. */
export function dogFlags(t: DogTally): string[] {
  const flags: string[] = [];
  if (t.callsAfterBusiness === 1 && t.misses === 0) flags.push('dog:fast');
  if (t.treats) flags.push('dog:treats');
  return flags;
}
