// Shared free-roam helpers for the two Act I walk-around chores (dog + trash — same owner; trash imports this).
// The game's own interactables only fire between activities, so activities that let Chris walk around keep their
// own little interaction points, prompts, talk bubbles and DOM chip bar here. Everything is allocation-light per
// frame and safe to run headless (the node test UI has no DOM: every DOM call is guarded).
import * as THREE from 'three';
import type { Character, Dog } from '../../family/types';
import type { AudioEngine, BabbleMood, Voice } from '../../audio/types';
import type { Vec3Like } from '../../render/types';
import type { BubbleHandle, PromptSpec, UiManager } from '../../ui/types';
import type { RoomId, World } from '../../world/types';

export const OUTDOOR_ROOMS: ReadonlySet<RoomId> = new Set<RoomId>(['yard', 'side', 'driveway', 'front', 'street']);

/** True inside the house (any room that is not outdoors; null = off the lot → outdoors). */
export function isIndoors(world: World, x: number, z: number): boolean {
  const r = world.roomAt(x, z);
  return r !== null && !OUTDOOR_ROOMS.has(r);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smooth01(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}
export const dist2d = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** Yaw (0 = +Z) that faces from (fx, fz) toward (tx, tz). */
export function yawToward(fx: number, fz: number, tx: number, tz: number): number {
  return Math.atan2(tx - fx, tz - fz);
}

/** The world-space door "threshold": midpoint of the inside / outside anchors + unit normal pointing outside. */
export interface Threshold {
  x: number;
  z: number;
  nx: number;
  nz: number;
}
export function threshold(inside: Vec3Like, outside: Vec3Like): Threshold {
  const dx = outside.x - inside.x;
  const dz = outside.z - inside.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: (inside.x + outside.x) / 2, z: (inside.z + outside.z) / 2, nx: dx / l, nz: dz / l };
}

/** First free spot (radius r) among `candidates`, else the fallback. */
export function firstFree(world: World, candidates: readonly Vec3Like[], r: number, fallback: Vec3Like): Vec3Like {
  for (const c of candidates) if (world.free(c.x, c.z, r)) return c;
  return fallback;
}

// ── tiny coroutine runner (timed beats without promises) ─────────────────────

/** A script step: wait N seconds, wait until a condition (with a safety timeout), or continue at once (null/0). */
export type Wait = number | { until: () => boolean; max?: number } | null;
export type Script = Generator<Wait, void, void>;

/**
 * Runs one generator script with frame-based waits. Scripts are plain `function*` beats; `update(dt, speed)` advances
 * them. Robust: a throwing script is stopped (reported through `onError`), never rethrown.
 */
export class ScriptRunner {
  private it: Script | null = null;
  private t = 0;
  private until: (() => boolean) | null = null;
  private max = 0;

  constructor(private readonly onError: (e: unknown) => void = () => {}) {}

  get running(): boolean {
    return this.it !== null;
  }

  start(script: Script): void {
    this.stop();
    this.it = script;
    this.t = 0;
    this.until = null;
    this.advance();
  }

  stop(): void {
    const it = this.it;
    this.it = null;
    this.until = null;
    this.t = 0;
    if (it) {
      try {
        it.return(undefined);
      } catch {
        // A finally block threw while unwinding — nothing else to do.
      }
    }
  }

  update(dt: number, speed = 1): void {
    if (!this.it || !(dt > 0)) return;
    if (this.until) {
      this.max -= dt;
      let ok = false;
      try {
        ok = this.until();
      } catch {
        ok = true;
      }
      if (!ok && this.max > 0) return;
      this.until = null;
    } else if (this.t > 0) {
      this.t -= dt * speed;
      if (this.t > 0) return;
    }
    this.advance();
  }

  private advance(): void {
    for (let guard = 0; guard < 64; guard++) {
      const it = this.it;
      if (!it) return;
      let r: IteratorResult<Wait, void>;
      try {
        r = it.next();
      } catch (e) {
        if (this.it === it) this.it = null;
        this.onError(e);
        return;
      }
      // The script replaced or stopped itself from inside a step.
      if (this.it !== it) return;
      if (r.done) {
        this.it = null;
        return;
      }
      const w = r.value;
      if (w === null || w === 0) continue;
      if (typeof w === 'number') {
        this.t = w;
        return;
      }
      let now = true;
      try {
        now = w.until();
      } catch {
        now = true;
      }
      if (now) continue;
      this.until = w.until;
      this.max = w.max ?? 10;
      return;
    }
  }
}

// ── local interaction points ─────────────────────────────────────────────────

export interface Spot {
  readonly id: string;
  at: Vec3Like;
  label: string;
  radius: number;
  enabled: boolean;
  /** Draw the world marker while enabled. */
  marker: boolean;
}

interface SpotEntry {
  spot: Spot;
  handle: { move(at: Vec3Like): void; remove(): void } | null;
  mx: number;
  mz: number;
}

/** Interaction points for an activity that keeps free roam: nearest enabled one in reach + glowing markers. */
export class Spots {
  private readonly entries: SpotEntry[] = [];

  constructor(private readonly world: World) {}

  add(id: string, at: Vec3Like, label: string, opts: { radius?: number; marker?: boolean; enabled?: boolean } = {}): Spot {
    const spot: Spot = { id, at: { x: at.x, y: at.y ?? 0, z: at.z }, label, radius: opts.radius ?? 1.2, enabled: opts.enabled ?? true, marker: opts.marker ?? true };
    this.entries.push({ spot, handle: null, mx: NaN, mz: NaN });
    return spot;
  }

  remove(spot: Spot | null): void {
    if (!spot) return;
    const k = this.entries.findIndex((e) => e.spot === spot);
    if (k < 0) return;
    this.entries[k]!.handle?.remove();
    this.entries.splice(k, 1);
  }

  /** Per frame: sync markers and return the nearest enabled spot within reach of (px, pz). */
  update(px: number, pz: number, allowUse: boolean): Spot | null {
    let best: Spot | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      const s = e.spot;
      const want = s.enabled && s.marker;
      if (want && !e.handle) {
        e.handle = this.world.marker(s.at);
        e.mx = s.at.x;
        e.mz = s.at.z;
      } else if (!want && e.handle) {
        e.handle.remove();
        e.handle = null;
      } else if (e.handle && (e.mx !== s.at.x || e.mz !== s.at.z)) {
        e.handle.move(s.at);
        e.mx = s.at.x;
        e.mz = s.at.z;
      }
      if (!allowUse || !s.enabled) continue;
      const d = Math.hypot(s.at.x - px, s.at.z - pz);
      if (d <= s.radius && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  clear(): void {
    for (const e of this.entries) e.handle?.remove();
    this.entries.length = 0;
  }
}

// ── prompts ──────────────────────────────────────────────────────────────────

/** Dedupes ui.prompt calls (the UI copies the spec on every call). */
export class PromptSlot {
  private key = '';

  constructor(private readonly ui: UiManager) {}

  show(text: string, slot: PromptSpec['slot'], at?: Vec3Like | null, hold = false): void {
    const key = `${slot}|${hold ? 1 : 0}|${text}|${at ? `${at.x.toFixed(2)},${at.z.toFixed(2)}` : ''}`;
    if (key === this.key) return;
    this.key = key;
    this.ui.prompt({ text, slot, hold, at: at ? { x: at.x, y: (at.y ?? 0) + 1.9, z: at.z } : undefined });
  }

  hide(): void {
    if (this.key === '') return;
    this.key = '';
    this.ui.prompt(null);
  }
}

// ── speech ───────────────────────────────────────────────────────────────────

type Speaker = Character | Dog;

/** Speech bubbles that follow their speaker's overhead socket + babble voices. */
export class Talk {
  private readonly live: { who: Speaker; handle: BubbleHandle }[] = [];
  private readonly v = new THREE.Vector3();

  constructor(
    private readonly ui: UiManager,
    private readonly audio: AudioEngine,
  ) {}

  private overhead(who: Speaker): THREE.Vector3 {
    return who.socket('overhead').getWorldPosition(this.v);
  }

  say(who: Speaker, text: string, opts: { seconds?: number; style?: 'say' | 'think' | 'shout' | 'whisper'; mood?: BabbleMood; silent?: boolean } = {}): void {
    const speaker: Voice = 'setHold' in who ? who.id : 'dog';
    // One bubble per speaker at a time: the newest replaces the previous one.
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i]!.who === who) {
        this.live[i]!.handle.close();
        this.live.splice(i, 1);
      }
    }
    const handle = this.ui.bubble(this.overhead(who), text, { speaker, seconds: opts.seconds, style: opts.style });
    this.live.push({ who, handle });
    if (!opts.silent) this.audio.babble(speaker, text, opts.mood ?? 'normal');
  }

  /** Per frame: keep bubbles above their speakers. */
  update(): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i]!;
      if (!b.handle.open) {
        this.live.splice(i, 1);
        continue;
      }
      b.handle.move(this.overhead(b.who));
    }
  }

  closeAll(): void {
    for (const b of this.live) b.handle.close();
    this.live.length = 0;
  }
}

// ── DOM chip bar (glyph prompts that mouse users can click / hold) ───────────

export interface ChipDef {
  id: string;
  label: string;
  slot: 'primary' | 'secondary' | 'alt';
  /** Shows a HOLD tag; the chip reports "down" while the pointer holds it. */
  hold?: boolean;
}

interface ChipNode {
  el: HTMLElement;
  label: HTMLElement;
  text: string;
  down: boolean;
  pressed: boolean;
  released: boolean;
  hot: boolean;
}

/** True when a real DOM is available and `layer` is an element (the headless test UI returns a stub). */
export function canDom(layer: unknown): layer is HTMLElement {
  return typeof document !== 'undefined' && !!layer && typeof (layer as HTMLElement).appendChild === 'function';
}

/**
 * A bottom-centre row of `.bhd-chip[data-slot]` pills: the UI fills in the device glyph (keycap / pad button), and
 * mouse users can click / hold them. Hidden on touch (the touch overlay has the same buttons).
 */
export class ChipBar {
  readonly el: HTMLElement | null = null;
  private readonly chips = new Map<string, ChipNode>();
  private visible = true;
  private offs: (() => void)[] = [];

  constructor(layer: unknown, defs: readonly ChipDef[], bottom = 'calc(84px + env(safe-area-inset-bottom, 0px))') {
    if (!canDom(layer)) return;
    const row = document.createElement('div');
    row.className = 'bhd-row';
    row.style.cssText = `position:absolute;left:50%;bottom:${bottom};transform:translateX(-50%);gap:12px;pointer-events:none;`;
    for (const d of defs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bhd-chip bhd-pop';
      b.dataset.slot = d.slot;
      b.style.pointerEvents = 'auto';
      const label = document.createElement('span');
      label.textContent = d.label;
      b.appendChild(label);
      if (d.hold) {
        const tag = document.createElement('span');
        tag.className = 'bhd-tag bhd-tag--soft';
        tag.textContent = 'HOLD';
        b.appendChild(tag);
      }
      const node: ChipNode = { el: b, label, text: d.label, down: false, pressed: false, released: false, hot: false };
      const onDown = (e: Event) => {
        e.preventDefault();
        if (!node.down) node.pressed = true;
        node.down = true;
      };
      const onUp = () => {
        if (node.down) node.released = true;
        node.down = false;
      };
      b.addEventListener('pointerdown', onDown);
      b.addEventListener('pointerup', onUp);
      b.addEventListener('pointercancel', onUp);
      b.addEventListener('pointerleave', onUp);
      this.offs.push(() => {
        b.removeEventListener('pointerdown', onDown);
        b.removeEventListener('pointerup', onUp);
        b.removeEventListener('pointercancel', onUp);
        b.removeEventListener('pointerleave', onUp);
      });
      row.appendChild(b);
      this.chips.set(d.id, node);
    }
    layer.appendChild(row);
    this.el = row;
  }

  /** Consume a click/press edge. */
  takePressed(id: string): boolean {
    const n = this.chips.get(id);
    if (!n || !n.pressed) return false;
    n.pressed = false;
    return true;
  }

  takeReleased(id: string): boolean {
    const n = this.chips.get(id);
    if (!n || !n.released) return false;
    n.released = false;
    return true;
  }

  isDown(id: string): boolean {
    return this.chips.get(id)?.down ?? false;
  }

  setLabel(id: string, text: string): void {
    const n = this.chips.get(id);
    if (!n || n.text === text) return;
    n.text = text;
    n.label.textContent = text;
  }

  /** Highlight a chip (gentle wiggle + sunshine fill) — "now's the moment". */
  setHot(id: string, hot: boolean): void {
    const n = this.chips.get(id);
    if (!n || n.hot === hot) return;
    n.hot = hot;
    n.el.classList.toggle('bhd-wiggle', hot);
    n.el.style.background = hot ? 'var(--bhd-sunshine)' : '';
  }

  setVisible(v: boolean): void {
    if (!this.el || v === this.visible) return;
    this.visible = v;
    this.el.style.display = v ? '' : 'none';
    if (!v) for (const n of this.chips.values()) n.down = false;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.el?.remove();
    this.chips.clear();
  }
}
