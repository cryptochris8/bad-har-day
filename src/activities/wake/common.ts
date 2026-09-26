// Shared helpers for the two story activities in the house (ACT II wake + ACT IV rush):
//  • ScriptHost / Lane — cancellable async cutscene scripts (stop cleanly when the activity ends or is skipped)
//  • Talk — speech bubbles that follow their speaker + babble
//  • Hotspots — free-roam interaction points WHILE AN ACTIVITY RUNS (the game's ctx.interact prompts only work
//    between activities): nearest-in-reach prompt with device glyphs, PRIMARY to use, optional world markers, and
//    mouse / touch tap-to-walk (click a spot or a person → Chris walks there and uses it)
//  • hand / set-down helpers for props, free-spot search, bed helpers, touch control schemes
import * as THREE from 'three';
import type { ActivityContext, Mover } from '../types';
import type { BabbleMood } from '../../audio/types';
import type { Character, MemberId } from '../../family/types';
import type { ButtonSpec, ControlIcon, ControlScheme, GameControls } from '../../input/types';
import type { Vec3Like } from '../../render/types';
import type { BubbleHandle, BubbleOpts, PromptSpec } from '../../ui/types';
import type { Anchor, AnchorId, World } from '../../world/types';
import { BED_MATTRESS_H } from '../../world';
import { bedRoot, freeSpotNear, nearestInReach, nearestOnScreen } from './geo';

export { ahead, bedRoot, freeSpotNear, nearestInReach, nearestOnScreen, yawTo } from './geo';

// ── test hooks (?test=1 only) ───────────────────────────────────────────────

/** Walkthrough bots read `window.__BHD_SPOTS__` / `window.__BHD_ACT__` with ?test=1 (never in normal play). */
export const TEST_HOOKS = typeof location !== 'undefined' && /[?&](test|debug)=1\b/.test(location.search);

// `any`: a dev-only bag of loosely-typed hooks on window, read by the Playwright bots.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function testWindow(): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return window as unknown as Record<string, any>;
}

// ── cancellable scripts ─────────────────────────────────────────────────────

export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

export interface Step {
  /** Unpaused game seconds. */
  wait(seconds: number): Promise<void>;
  /** npcs.walkTo and wait for arrival. */
  walk(who: Mover, to: Vec3Like, opts?: { speed?: number; faceYaw?: number; style?: 'walk' | 'run' | 'sleepwalk' }): Promise<void>;
  /** Chris's scripted walk. */
  walkChris(to: Vec3Like, opts?: { speed?: number; faceYaw?: number }): Promise<void>;
  /** Resolve once `pred` is true (checked every frame), or after `timeout` seconds. */
  until(pred: () => boolean, timeout?: number): Promise<void>;
  /** Throws Cancelled when this script was superseded. */
  check(): void;
}

interface Waiter {
  pred: () => boolean;
  left: number;
  resolve: () => void;
}

/** Owns the scripts of one activity. tick() every frame; kill() on skip/dispose. */
export class ScriptHost {
  alive = true;
  private readonly waiters: Waiter[] = [];

  constructor(
    readonly ctx: ActivityContext,
    private readonly tag: string,
  ) {}

  lane(): Lane {
    return new Lane(this);
  }

  /** Internal: a frame-polled wait. */
  poll(pred: () => boolean, timeout: number): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ pred, left: timeout, resolve }));
  }

  tick(dt: number): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]!;
      w.left -= dt;
      let ok = false;
      try {
        ok = w.pred() || w.left <= 0;
      } catch {
        ok = true;
      }
      if (ok) {
        this.waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  kill(): void {
    this.alive = false;
    this.waiters.length = 0;
  }

  report(e: unknown): void {
    if (e instanceof Cancelled) return;
    console.warn(`[${this.tag}] script stopped`, e);
  }
}

/** One cancellable script at a time (one per character / thread of the story). */
export class Lane {
  private gen = 0;
  private active = false;

  constructor(private readonly host: ScriptHost) {}

  get running(): boolean {
    return this.active;
  }

  /** Start `fn`; a previous script on this lane stops at its next await. */
  run(fn: (s: Step) => Promise<void>): void {
    const my = ++this.gen;
    const host = this.host;
    const ok = (): void => {
      if (my !== this.gen || !host.alive) throw new Cancelled();
    };
    const s: Step = {
      wait: async (sec) => {
        await host.ctx.wait(Math.max(0, sec));
        ok();
      },
      walk: async (who, to, opts) => {
        await host.ctx.npcs.walkTo(who, to, opts);
        ok();
      },
      walkChris: async (to, opts) => {
        await host.ctx.walker.walkTo(to, opts);
        ok();
      },
      until: async (pred, timeout = Infinity) => {
        await host.poll(pred, timeout);
        ok();
      },
      check: ok,
    };
    this.active = true;
    fn(s)
      .catch((e: unknown) => host.report(e))
      .finally(() => {
        if (my === this.gen) this.active = false;
      });
  }

  stop(): void {
    this.gen++;
    this.active = false;
  }
}

// ── speech bubbles that follow their speaker ────────────────────────────────

const tmpV = new THREE.Vector3();

export class Talk {
  private readonly live: { h: BubbleHandle; who: THREE.Object3D }[] = [];

  constructor(private readonly ctx: ActivityContext) {}

  /** A line from a family member: bubble (follows them) + babble voice. */
  say(who: Character, text: string, o: { style?: BubbleOpts['style']; mood?: BabbleMood; seconds?: number; silent?: boolean } = {}): BubbleHandle {
    const head = who.socket('overhead');
    const speaker = who.id === 'extra' ? 'extra' : who.id;
    const h = this.ctx.ui.bubble(head.getWorldPosition(tmpV), text, { speaker, style: o.style ?? 'say', ...(o.seconds ? { seconds: o.seconds } : {}) });
    if (!o.silent && who.id !== 'extra') this.ctx.audio.babble(who.id as MemberId, text, o.mood ?? (o.style === 'whisper' ? 'whisper' : o.style === 'shout' ? 'excited' : o.style === 'sing' ? 'sing' : 'normal'));
    this.live.push({ h, who: head });
    return h;
  }

  /** The dog "says" something (its name tag comes from the UI; textContent only). */
  woof(overhead: THREE.Object3D, text: string, seconds = 2): void {
    const h = this.ctx.ui.bubble(overhead.getWorldPosition(tmpV), text, { speaker: 'dog', style: 'shout', seconds });
    this.live.push({ h, who: overhead });
  }

  update(): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i]!;
      if (!b.h.open) {
        this.live.splice(i, 1);
        continue;
      }
      b.h.move(b.who.getWorldPosition(tmpV));
    }
  }

  closeAll(): void {
    for (const b of this.live) b.h.close();
    this.live.length = 0;
  }
}

// ── hotspots (interaction points while an activity runs) ────────────────────

export interface HotspotDef {
  id: string;
  /** Feet-level world position of the thing (read every frame — may move). */
  at: () => Vec3Like;
  /** Reach (m), default 1.2. */
  radius?: number;
  label: () => string;
  /** Touch button label ('WAKE', 'LOOK'…). */
  button: string | (() => string);
  icon?: ControlIcon;
  enabled: () => boolean;
  /** World marker colour while enabled (null / omitted = no marker — searching is the game). */
  marker?: () => number | null;
  /** Prompt height above `at` (m), default 1.9. */
  promptY?: number;
  onUse: () => void;
}

interface HotEntry {
  def: HotspotDef;
  enabled: boolean;
  x: number;
  z: number;
  y: number;
  markerColor: number | null;
  marker: { move(at: Vec3Like): void; remove(): void } | null;
}

export class Hotspots {
  private readonly items: HotEntry[] = [];
  private readonly view: { x: number; z: number; r: number; enabled: boolean }[] = [];
  private readonly screen: { x: number; y: number; ok: boolean }[] = [];
  private current: HotEntry | null = null;
  private shownText = '';
  private shownX = NaN;
  private shownZ = NaN;
  private readonly spec: PromptSpec = { text: '', slot: 'primary', at: { x: 0, y: 0, z: 0 } };
  private tapTarget: HotEntry | null = null;
  private tapWalking = false;
  private tapGen = 0;
  private chases = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hit = new THREE.Vector3();
  private readonly ndc = new THREE.Vector2();
  private readonly proj = { x: 0, y: 0, visible: false };
  private readonly pv = { x: 0, y: 0, z: 0 };

  constructor(private readonly ctx: ActivityContext) {
    if (TEST_HOOKS) testWindow().__BHD_SPOTS__ = this.testApi();
  }

  /** ?test=1 only: lets the e2e/walkthrough bots find hotspots (screen point, nav path) and drive real inputs. */
  private testApi() {
    const find = (id: string) => this.items.find((e) => e.def.id === id) ?? null;
    return {
      ids: () => this.items.filter((e) => e.enabled).map((e) => e.def.id),
      current: () => this.current?.def.id ?? null,
      label: (id: string) => find(id)?.def.label() ?? null,
      world: (id: string) => {
        const e = find(id);
        return e ? { x: e.x, z: e.z, enabled: e.enabled } : null;
      },
      screen: (id: string) => {
        const e = find(id);
        if (!e) return null;
        const out = { x: 0, y: 0, visible: false };
        this.ctx.projector.project({ x: e.x, y: e.y + 0.7, z: e.z }, out);
        return out;
      },
      path: (id: string) => {
        const e = find(id);
        if (!e) return null;
        const w = this.ctx.walker.position;
        return this.ctx.world.navPath({ x: w.x, y: 0, z: w.z }, { x: e.x, y: 0, z: e.z }).map((p) => ({ x: p.x, z: p.z }));
      },
      walker: () => ({ x: this.ctx.walker.position.x, z: this.ctx.walker.position.z, enabled: this.ctx.walker.enabled }),
      /** Park Chris next to a hotspot (scripted walk) so a bot can test the real PRIMARY press on it. */
      walkNear: (id: string) => {
        const e = find(id);
        if (!e) return false;
        void this.ctx.walker.walkTo({ x: e.x, y: 0, z: e.z });
        return true;
      },
      walkAnchor: (id: string) => {
        const a = this.ctx.world.anchor(id as AnchorId);
        if (a) void this.ctx.walker.walkTo({ x: a.x, y: 0, z: a.z });
        return !!a;
      },
      anchor: (id: string) => {
        const a = this.ctx.world.anchor(id as AnchorId);
        return a ? { x: a.x, z: a.z } : null;
      },
      anchorPath: (id: string) => {
        const a = this.ctx.world.anchor(id as AnchorId);
        const w = this.ctx.walker.position;
        return a ? this.ctx.world.navPath({ x: w.x, y: 0, z: w.z }, { x: a.x, y: 0, z: a.z }).map((p) => ({ x: p.x, z: p.z })) : null;
      },
    };
  }

  add(def: HotspotDef): () => void {
    const e: HotEntry = { def, enabled: false, x: 0, z: 0, y: 0, markerColor: null, marker: null };
    this.items.push(e);
    return () => {
      const k = this.items.indexOf(e);
      if (k >= 0) this.items.splice(k, 1);
      e.marker?.remove();
      e.marker = null;
      if (this.current === e) this.current = null;
      if (this.tapTarget === e) this.tapTarget = null;
    };
  }

  /** Touch button label of the hotspot in reach (null = none). */
  get button(): string | null {
    const b = this.current?.def.button;
    return b === undefined ? null : typeof b === 'function' ? b() : b;
  }

  get icon(): ControlIcon {
    return this.current?.def.icon ?? 'hand';
  }

  /** A tap-to-walk is moving Chris. */
  get walking(): boolean {
    return this.tapWalking;
  }

  /** Stop a tap-to-walk (Chris stays where he is). */
  cancelWalk(): void {
    if (!this.tapWalking) return;
    this.tapGen++;
    this.tapWalking = false;
    this.tapTarget = null;
    const w = this.ctx.walker;
    w.teleport(w.position.x, w.position.z, w.yaw);
  }

  /**
   * Per frame. `canUse` false hides the prompt and ignores input (cutscenes, mini-games). Markers follow each
   * hotspot's enabled state regardless.
   */
  update(controls: GameControls, canUse: boolean, showMarkers = canUse): void {
    const ctx = this.ctx;
    const n = this.items.length;
    this.view.length = n;
    for (let i = 0; i < n; i++) {
      const e = this.items[i]!;
      let en = false;
      try {
        en = e.def.enabled();
      } catch {
        en = false;
      }
      e.enabled = en;
      const at = e.def.at();
      e.x = at.x;
      e.y = at.y;
      e.z = at.z;
      const want = showMarkers && en && e.def.marker ? e.def.marker() : null;
      if (want !== e.markerColor) {
        e.marker?.remove();
        e.marker = want !== null ? ctx.world.marker({ x: at.x, y: 0, z: at.z }, want) : null;
        e.markerColor = want;
      } else if (e.marker) {
        this.pv.x = at.x;
        this.pv.z = at.z;
        e.marker.move(this.pv);
      }
      let v = this.view[i];
      if (!v) {
        v = { x: 0, z: 0, r: 1.2, enabled: false };
        this.view[i] = v;
      }
      v.x = at.x;
      v.z = at.z;
      v.r = e.def.radius ?? 1.2;
      v.enabled = en;
    }

    if (!canUse) {
      if (this.tapWalking) this.cancelWalk();
      this.tapTarget = null;
      this.setCurrent(null);
      return;
    }

    // Mouse / touch: tap a person or a spot → walk there and use it; tap the floor → walk there.
    const p = ctx.pointer;
    if (p.enabled && p.pressed && p.source !== 'virtual') this.onTap(p.x, p.y, p.ndcX, p.ndcY);
    if (this.tapWalking && Math.hypot(controls.moveX, controls.moveY) > 0.25) this.cancelWalk();

    const w = ctx.walker.position;
    const idx = nearestInReach(w.x, w.z, this.view);
    const cur = idx >= 0 ? this.items[idx]! : null;
    this.setCurrent(cur);

    if (this.tapTarget && this.tapTarget.enabled) {
      const t = this.tapTarget;
      const d = Math.hypot(t.x - w.x, t.z - w.z);
      if (d <= (t.def.radius ?? 1.2) * 0.85) {
        this.cancelWalk();
        this.use(t);
        return;
      }
      // A moving target (a shuffling sleepwalker): arrived where she was → chase her a few more times.
      if (!this.tapWalking) {
        if (this.chases++ < 5) this.walkTo(t.x, t.z);
        else this.tapTarget = null;
      }
    } else if (this.tapTarget && !this.tapTarget.enabled) this.tapTarget = null;

    if (cur && controls.primaryPressed) {
      if (this.tapWalking) this.cancelWalk();
      this.use(cur);
    }
  }

  private use(e: HotEntry): void {
    this.setCurrent(null);
    try {
      e.def.onUse();
    } catch (err) {
      console.warn('[hotspot] use failed', e.def.id, err);
    }
  }

  private setCurrent(e: HotEntry | null): void {
    const ui = this.ctx.ui;
    if (!e) {
      if (this.current || this.shownText) {
        this.current = null;
        this.shownText = '';
        ui.prompt(null);
      }
      return;
    }
    const text = e.def.label();
    const moved = Math.abs(e.x - this.shownX) > 0.03 || Math.abs(e.z - this.shownZ) > 0.03;
    if (e !== this.current || text !== this.shownText || moved) {
      this.current = e;
      this.shownText = text;
      this.shownX = e.x;
      this.shownZ = e.z;
      this.spec.text = text;
      const at = this.spec.at!;
      at.x = e.x;
      at.y = e.y + (e.def.promptY ?? 1.9);
      at.z = e.z;
      if (text) ui.prompt(this.spec);
      else ui.prompt(null);
    }
  }

  private onTap(px: number, py: number, ndcX: number, ndcY: number): void {
    const ctx = this.ctx;
    // 1) a hotspot near the tap on screen (people and spots are tall-ish: test their mid height)
    this.screen.length = this.items.length;
    for (let i = 0; i < this.items.length; i++) {
      const e = this.items[i]!;
      let s = this.screen[i];
      if (!s) {
        s = { x: 0, y: 0, ok: false };
        this.screen[i] = s;
      }
      this.pv.x = e.x;
      this.pv.y = e.y + 0.7;
      this.pv.z = e.z;
      ctx.projector.project(this.pv, this.proj);
      s.x = this.proj.x;
      s.y = this.proj.y;
      s.ok = e.enabled && this.proj.visible;
    }
    const k = nearestOnScreen(px, py, this.screen, 70);
    const w = ctx.walker;
    if (k >= 0) {
      const e = this.items[k]!;
      const d = Math.hypot(e.x - w.position.x, e.z - w.position.z);
      if (d <= (e.def.radius ?? 1.2) * 0.85) {
        this.use(e);
        return;
      }
      this.tapTarget = e;
      this.chases = 0;
      this.walkTo(e.x, e.z);
      return;
    }
    // 2) the floor
    this.ndc.set(ndcX, ndcY);
    this.ray.setFromCamera(this.ndc, ctx.camera.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return;
    if (ctx.world.roomAt(this.hit.x, this.hit.z) === null) return;
    this.tapTarget = null;
    this.walkTo(this.hit.x, this.hit.z);
  }

  private walkTo(x: number, z: number): void {
    const my = ++this.tapGen;
    this.tapWalking = true;
    void this.ctx.walker.walkTo({ x, y: 0, z }).then(() => {
      if (my === this.tapGen) this.tapWalking = false;
    });
  }

  clear(): void {
    if (TEST_HOOKS) delete testWindow().__BHD_SPOTS__;
    for (const e of this.items) e.marker?.remove();
    this.items.length = 0;
    this.current = null;
    this.tapTarget = null;
    this.tapWalking = false;
    this.tapGen++;
    this.shownText = '';
  }
}

// ── props in hands ──────────────────────────────────────────────────────────

/** Parent a prop root to a character socket at −grip (props expose their grip as a child named 'grip'). */
export function holdProp(root: THREE.Object3D, who: Character, socket: 'handR' | 'handL' | 'back' = 'handR'): void {
  const s = who.socket(socket);
  s.add(root);
  root.rotation.set(0, 0, 0);
  const grip = root.getObjectByName('grip');
  if (grip && grip !== root) root.position.copy(grip.position).multiplyScalar(-1);
  else root.position.set(0, 0, 0);
  root.visible = true;
}

/** Wear a backpack prop on the 'back' socket (straps toward her, the pocket facing out, hanging from the shoulders). */
export function wearBackpack(root: THREE.Object3D, who: Character): void {
  const s = who.socket('back');
  s.add(root);
  root.rotation.set(0, Math.PI, 0);
  // Well behind the back surface so it sits OVER the long hair (not buried in it).
  root.position.set(0, -0.3, -0.17);
  root.visible = true;
}

/** Put a prop down at a world point (yaw) under `parent`. */
export function setDown(root: THREE.Object3D, parent: THREE.Object3D, at: Vec3Like, yaw = 0): void {
  parent.add(root);
  parent.updateMatrixWorld(true);
  tmpV.set(at.x, at.y, at.z);
  parent.worldToLocal(tmpV);
  root.position.copy(tmpV);
  root.rotation.set(0, yaw, 0);
}

// ── places ──────────────────────────────────────────────────────────────────

/** Lay a character in bed (same convention as the game's setupScene). */
export function layInBed(c: Character, anchor: Anchor, side = 0): void {
  const p = bedRoot(anchor, c.height);
  c.root.position.set(p.x, anchor.y, p.z);
  c.root.rotation.y = anchor.yaw;
  c.setPose('lie', { seatHeight: BED_MATTRESS_H, side });
}

/** A free standing spot just past the foot of a bed (where a sleeper hops out). */
export function bedExitSpot(world: World, anchor: Anchor, out: { x: number; z: number }): void {
  const fx = Math.sin(anchor.yaw);
  const fz = Math.cos(anchor.yaw);
  for (const d of [0.62, 0.75, 0.9, 1.05]) {
    const x = anchor.x + fx * d;
    const z = anchor.z + fz * d;
    if (world.free(x, z, 0.26)) {
      out.x = x;
      out.z = z;
      return;
    }
  }
  freeSpotNear((x, z, r) => world.free(x, z, r), anchor.x + fx * 0.7, anchor.z + fz * 0.7, anchor.yaw, out, [0.4, 0.7, 1.0], 0.26);
}

/** Planar distance between a mover's root and a point. */
export function dist2(a: Vec3Like, b: Vec3Like): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// ── the "hold to hurry" hint (keyboard / pad: touch players get a HURRY button) ─

export class HurryHint {
  private readonly el: HTMLElement;
  private shown = false;

  constructor(layer: HTMLElement) {
    const el = document.createElement('span');
    el.className = 'bhd-glyph';
    el.setAttribute('data-slot', 'alt');
    el.textContent = 'Hold to hurry';
    el.style.cssText = 'position:absolute;left:calc(14px + var(--bhd-safe-l));bottom:calc(14px + var(--bhd-safe-b));opacity:.92;display:none;pointer-events:none;';
    layer.appendChild(el);
    this.el = el;
  }

  /** Per frame (cheap: only touches the DOM on change). */
  update(show: boolean, device: string): void {
    const want = show && device !== 'touch';
    if (want === this.shown) return;
    this.shown = want;
    this.el.style.display = want ? '' : 'none';
  }

  dispose(): void {
    this.el.remove();
  }
}

// ── touch control schemes (same object while unchanged) ─────────────────────

const SCHEMES = new Map<string, ControlScheme>();

/** Free-roam scheme: joystick + optional PRIMARY (the hotspot in reach) + optional hold-to-hurry on ALT. */
export function roamScheme(button: string | null, icon: ControlIcon, hurry: boolean): ControlScheme {
  const key = `${button ?? ''}|${icon}|${hurry ? 1 : 0}`;
  let s = SCHEMES.get(key);
  if (!s) {
    const primary: ButtonSpec | null = button ? { label: button, icon } : null;
    s = { move: 'xy', moveLabel: 'WALK', primary, secondary: null, alt: hurry ? { label: 'HURRY', icon: 'run', hold: true } : null };
    SCHEMES.set(key, s);
  }
  return s;
}

/** A single big button, no joystick (mini-games). */
export function buttonScheme(label: string, icon: ControlIcon): ControlScheme {
  const key = `btn|${label}|${icon}`;
  let s = SCHEMES.get(key);
  if (!s) {
    s = { move: 'none', moveLabel: '', primary: { label, icon }, secondary: null, alt: null };
    SCHEMES.set(key, s);
  }
  return s;
}

/** Walker speeds (m/s). */
export const WALK_SPEED = 2.4;
export const HURRY_SPEED = 3.5;
