// ─────────────────────────────────────────────────────────────────────────────
// Station helpers — runtime (Three.js) side shared by coffee / lunch / dishes:
//   • PointerRay    pointer NDC → world ray (THREE.Raycaster), forgiving sphere picking, plane hits
//   • SurfaceProbe  "how high is the counter/table right here?" (downward raycast against the house)
//   • Tweens        pooled prop hops (position arc + optional scale / spin), allocation-free per frame
//   • StationChris  walk-or-teleport Chris to a stand spot, face things, restore his pose/hold
//   • closeShot     camera.shot() with a reusable goal
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { ActivityContext } from '../types';
import type { Vec3Like } from '../../render/types';
import { effectiveFov } from '../../render/camera';
import { clamp01, easeOutBack, hop, pickOnRay, portraitAmount, portraitGoal, smooth, type PickSphere, type PortraitFraming } from './logic';

// ── pointer ray ──────────────────────────────────────────────────────────────

export class PointerRay {
  readonly ray = new THREE.Ray();
  private readonly rc = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** Exact NDC of the last real pointerdown on the canvas (a fast flick may move before the next frame). */
  private readonly downNdc = new THREE.Vector2();
  private downFresh = false;
  private readonly canvas: HTMLElement | null;

  constructor(private readonly ctx: ActivityContext) {
    const el = (ctx.renderer as { domElement?: HTMLElement } | undefined)?.domElement ?? null;
    this.canvas = el && typeof el.addEventListener === 'function' ? el : null;
    this.canvas?.addEventListener('pointerdown', this.onDown);
  }

  private readonly onDown = (e: PointerEvent): void => {
    const r = this.canvas!.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.downNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
    this.downFresh = true;
  };

  /** Refresh from the pointer (call once per frame before picking). `atPress`: use the exact press point. */
  update(atPress = false): THREE.Ray {
    const p = this.ctx.pointer;
    if (atPress && this.downFresh && p.source !== 'virtual') this.ndc.copy(this.downNdc);
    else this.ndc.set(Number.isFinite(p.ndcX) ? p.ndcX : 0, Number.isFinite(p.ndcY) ? p.ndcY : 0);
    if (atPress) this.downFresh = false;
    this.rc.setFromCamera(this.ndc, this.ctx.camera.camera);
    this.ray.copy(this.rc.ray);
    return this.ray;
  }

  dispose(): void {
    this.canvas?.removeEventListener('pointerdown', this.onDown);
  }

  /** Index of the picked sphere (−1 = none). */
  pick(targets: readonly (PickSphere | null)[], slack = 1): number {
    const o = this.ray.origin;
    const d = this.ray.direction;
    return pickOnRay(o.x, o.y, o.z, d.x, d.y, d.z, targets, slack);
  }

  /** Where the ray meets the horizontal plane y = h (null when parallel / behind). */
  onPlaneY(h: number, out: THREE.Vector3): THREE.Vector3 | null {
    this.plane.constant = -h;
    return this.ray.intersectPlane(this.plane, out);
  }
}

// ── surface probe ────────────────────────────────────────────────────────────

/**
 * Finds the top surface under a point by casting a ray straight down against the visible house meshes (counters,
 * the table, a cutting board…) — so props sit on whatever is really there instead of hardcoded heights.
 * Only meshes are tested (no sprites/points/lines); shadow proxies and markers are skipped.
 */
export class SurfaceProbe {
  private readonly meshes: THREE.Mesh[] = [];
  private readonly boxes: THREE.Box3[] = [];
  private readonly rc = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly from = new THREE.Vector3();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly n = new THREE.Vector3();

  /** `root`: the world root (only its 'house' group is probed when present) — built once per activity. */
  constructor(root: THREE.Object3D) {
    const house = root.getObjectByName('house') ?? root;
    house.updateMatrixWorld(true);
    const walk = (o: THREE.Object3D): void => {
      if (!o.visible) return;
      if (/shadow|proxy|marker|sky|rain|glass/i.test(o.name)) return;
      const m = o as THREE.Mesh;
      const inst = (o as THREE.InstancedMesh).isInstancedMesh;
      if (m.isMesh && !inst && m.geometry) {
        const g = m.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        if (g.boundingBox) {
          this.meshes.push(m);
          this.boxes.push(g.boundingBox.clone().applyMatrix4(m.matrixWorld));
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(house);
  }

  /** Surface height under (x, z) searching down from `fromY` (≤ `maxDrop` below it); `fallback` if nothing. */
  heightAt(x: number, z: number, fromY: number, fallback: number, maxDrop = 0.6): number {
    this.from.set(x, fromY, z);
    this.rc.set(this.from, this.down);
    this.rc.near = 0;
    this.rc.far = maxDrop;
    this.hits.length = 0;
    try {
      for (let i = 0; i < this.meshes.length; i++) {
        const b = this.boxes[i]!;
        if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z || b.min.y > fromY || b.max.y < fromY - maxDrop) continue;
        this.meshes[i]!.raycast(this.rc, this.hits);
      }
    } catch {
      return fallback;
    }
    this.hits.sort((a, b) => a.distance - b.distance);
    for (const h of this.hits) {
      const mat = (h.object as THREE.Mesh).material as THREE.Material | THREE.Material[];
      const m0 = Array.isArray(mat) ? mat[0] : mat;
      if (m0 && m0.transparent && m0.opacity < 0.5) continue;
      if (h.face) {
        // Near-vertical faces (a wall or cabinet edge) are not a surface to set things on.
        this.n.copy(h.face.normal).transformDirection(h.object.matrixWorld);
        if (Math.abs(this.n.y) < 0.5) continue;
      }
      return h.point.y;
    }
    return fallback;
  }
}

// ── tweens ───────────────────────────────────────────────────────────────────

interface TweenSlot {
  obj: THREE.Object3D | null;
  from: THREE.Vector3;
  to: THREE.Vector3;
  s0: number;
  s1: number;
  spin: number;
  rot0: number;
  t: number;
  dur: number;
  h: number;
  back: boolean;
  done: (() => void) | null;
}

/** Pooled hops: move objects (in their parent's space) along an arc, optionally scaling / spinning. */
export class Tweens {
  private readonly slots: TweenSlot[] = [];

  /** Hop `obj` from its current position to `to` in `dur` s with arc height `h`. Replaces its running tween. */
  hop(
    obj: THREE.Object3D,
    to: Vec3Like,
    dur: number,
    h: number,
    opts: { scale?: number; spin?: number; back?: boolean; done?: () => void } = {},
  ): void {
    let s = this.slots.find((x) => x.obj === obj) ?? this.slots.find((x) => x.obj === null);
    if (!s) {
      s = { obj: null, from: new THREE.Vector3(), to: new THREE.Vector3(), s0: 1, s1: 1, spin: 0, rot0: 0, t: 0, dur: 1, h: 0, back: false, done: null };
      this.slots.push(s);
    }
    s.obj = obj;
    s.from.copy(obj.position);
    s.to.set(to.x, to.y, to.z);
    s.s0 = obj.scale.x;
    s.s1 = opts.scale ?? obj.scale.x;
    s.spin = opts.spin ?? 0;
    s.rot0 = obj.rotation.y;
    s.t = 0;
    s.dur = Math.max(0.01, dur);
    s.h = h;
    s.back = !!opts.back;
    s.done = opts.done ?? null;
  }

  busy(obj: THREE.Object3D): boolean {
    return this.slots.some((s) => s.obj === obj);
  }

  get any(): boolean {
    return this.slots.some((s) => s.obj !== null);
  }

  /** Finish every running tween now (skip). */
  flush(): void {
    for (const s of this.slots) if (s.obj) this.finish(s);
  }

  cancel(obj: THREE.Object3D): void {
    for (const s of this.slots) if (s.obj === obj) s.obj = null;
  }

  update(dt: number): void {
    for (const s of this.slots) {
      const o = s.obj;
      if (!o) continue;
      s.t += dt;
      const k = clamp01(s.t / s.dur);
      if (k >= 1) {
        this.finish(s);
        continue;
      }
      const e = smooth(k);
      o.position.lerpVectors(s.from, s.to, e);
      o.position.y += hop(k, s.h);
      const sk = s.back ? easeOutBack(k) : e;
      o.scale.setScalar(Math.max(1e-4, s.s0 + (s.s1 - s.s0) * sk));
      if (s.spin !== 0) o.rotation.y = s.rot0 + s.spin * e;
    }
  }

  private finish(s: TweenSlot): void {
    const o = s.obj!;
    o.position.copy(s.to);
    o.scale.setScalar(Math.max(1e-4, s.s1));
    if (s.spin !== 0) o.rotation.y = s.rot0 + s.spin;
    s.obj = null;
    const cb = s.done;
    s.done = null;
    cb?.();
  }
}

// ── Chris ────────────────────────────────────────────────────────────────────

/** Chris at a station: gets him there, points his face, and puts him back the way he was. */
export class StationChris {
  private token = 0;
  arrived = false;

  constructor(private readonly ctx: ActivityContext) {}

  /** Walk to (x, z) if he is near, else teleport (single-activity dev runs start him in the bedroom). */
  goTo(x: number, z: number, yaw: number, maxWalk = 3.2): void {
    const w = this.ctx.walker;
    w.enabled = false;
    this.arrived = false;
    const tok = ++this.token;
    const d = Math.hypot(w.position.x - x, w.position.z - z);
    if (d > maxWalk) {
      w.teleport(x, z, yaw);
      this.arrived = true;
      return;
    }
    void w.walkTo({ x, y: 0, z }, { faceYaw: yaw }).then(() => {
      if (tok !== this.token) return;
      this.arrived = true;
      w.face(yaw);
    });
  }

  /** Scripted walk that reports arrival through `arrived`. */
  walk(to: Vec3Like, faceYaw: number): void {
    this.arrived = false;
    const tok = ++this.token;
    void this.ctx.walker.walkTo(to, { faceYaw }).then(() => {
      if (tok !== this.token) return;
      this.arrived = true;
    });
  }

  /** Stop listening to a pending walk (skip / dispose). */
  cancel(): void {
    this.token++;
  }

  restore(): void {
    this.cancel();
    const c = this.ctx.walker.character;
    try {
      c.cancelAction();
      c.setHold('none');
      c.setPose('stand');
      c.lookAt(null);
    } catch {
      // never throw from cleanup
    }
  }
}

// ── camera ───────────────────────────────────────────────────────────────────

/** A reusable camera goal (no per-call allocation from the activity's side). */
export class Shot {
  readonly goal = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 40 };
  /** The goal actually sent to the camera (portrait-adapted). */
  private readonly out = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 40 };
  private framing: PortraitFraming | null = null;
  private lastAspect = 0;
  private lastStiff = 3.2;
  private live = false;

  /** How to re-frame this shot on tall (portrait) screens. */
  portrait(f: PortraitFraming): this {
    this.framing = f;
    return this;
  }

  set(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov: number): this {
    const g = this.goal;
    g.position.x = px;
    g.position.y = py;
    g.position.z = pz;
    g.target.x = tx;
    g.target.y = ty;
    g.target.z = tz;
    g.fov = fov;
    return this;
  }

  /** Look at (tx,ty,tz) from an offset (dx,dy,dz). */
  look(tx: number, ty: number, tz: number, dx: number, dy: number, dz: number, fov: number): this {
    return this.set(tx + dx, ty + dy, tz + dz, tx, ty, tz, fov);
  }

  apply(ctx: ActivityContext, stiffness = 3.2): void {
    const cam = ctx.camera.camera;
    const aspect = cam.aspect > 0 ? cam.aspect : 16 / 9;
    this.lastAspect = aspect;
    this.lastStiff = stiffness;
    this.live = true;
    const g = this.goal;
    const o = this.out;
    o.fov = g.fov;
    if (this.framing && portraitAmount(aspect) > 0) portraitGoal(g, aspect, effectiveFov(g.fov, aspect), this.framing, o);
    else {
      o.position.x = g.position.x;
      o.position.y = g.position.y;
      o.position.z = g.position.z;
      o.target.x = g.target.x;
      o.target.y = g.target.y;
      o.target.z = g.target.z;
    }
    ctx.camera.shot(o, stiffness);
  }

  /** Re-apply when the screen was rotated / resized while this shot is the active one. */
  refresh(ctx: ActivityContext): void {
    if (!this.live) return;
    const a = ctx.camera.camera.aspect;
    if (a > 0 && Math.abs(a - this.lastAspect) > 0.04) this.apply(ctx, this.lastStiff);
  }

  /** Another shot took over. */
  release(): void {
    this.live = false;
  }
}

/** Narrow portrait (phones held upright): the UI lifts its centred prompt bar above the thumbs — right onto the
 * close-up subject. Stations drop that prompt there (touch buttons + the side card carry the glyphs). */
export function narrowPortrait(ctx: ActivityContext): boolean {
  const a = ctx.camera.camera.aspect;
  return a > 0 && a < 0.8;
}

/** ctx.ui.prompt, except on narrow portrait screens where it would sit on top of the station. */
export function stationPrompt(ctx: ActivityContext, p: Parameters<ActivityContext['ui']['prompt']>[0]): void {
  ctx.ui.prompt(p && narrowPortrait(ctx) ? null : p);
}

// ── small helpers ────────────────────────────────────────────────────────────

const _v = new THREE.Vector3();

/** World position of an object into `out`. */
export function worldOf(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  return o.getWorldPosition(out);
}

/** Overhead bubble anchor for a character (fresh vector: the UI keeps it). */
export function overhead(ctx: ActivityContext, who = ctx.walker.character): THREE.Vector3 {
  return who.socket('overhead').getWorldPosition(new THREE.Vector3());
}

/** Short landscape phones: the HUD column covers the left of the close-up, so stations trim their HUD there. */
export function shortScreen(ctx: ActivityContext): boolean {
  try {
    const el = (ctx.renderer as { domElement?: HTMLElement } | undefined)?.domElement;
    const h = el?.clientHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 720);
    return h > 0 && h < 520;
  } catch {
    return false;
  }
}

/** Chris says something (bubble + babble), never throws. */
export function say(
  ctx: ActivityContext,
  text: string,
  seconds = 2.2,
  mood: 'normal' | 'excited' | 'sleepy' | 'dramatic' | 'whisper' = 'normal',
  at: Vec3Like | null = null,
): void {
  try {
    // Close-ups often keep Chris at the frame edge: activities pass an on-screen anchor near the station.
    const pos = at ? new THREE.Vector3(at.x, at.y, at.z) : overhead(ctx);
    ctx.ui.bubble(pos, text, { speaker: 'chris', seconds, style: mood === 'whisper' ? 'whisper' : mood === 'excited' ? 'shout' : 'say' });
    ctx.audio.babble('chris', text, mood);
  } catch {
    // presentation only
  }
}

/** Parent `prop` to `socket` held naturally (at −grip). */
export function holdIn(prop: { root: THREE.Object3D; grip: THREE.Object3D }, socket: THREE.Object3D): void {
  socket.add(prop.root);
  prop.root.position.copy(prop.grip.position).multiplyScalar(-1);
  prop.root.rotation.set(0, 0, 0);
  prop.root.scale.setScalar(1);
}

/** Re-parent keeping the world transform. */
export function reparent(obj: THREE.Object3D, parent: THREE.Object3D): void {
  parent.attach(obj);
}

/** Temp vector for callers that need a scratch world point once. */
export function scratch(): THREE.Vector3 {
  return _v;
}
