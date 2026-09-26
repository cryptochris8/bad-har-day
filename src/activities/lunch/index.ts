// ─────────────────────────────────────────────────────────────────────────────
// LUNCH — "Pack the lunchboxes" (docs/GDD.md §4.3). Close-up of the lunch counter: three open lunchboxes
// (Addy lavender, Ellie mint, Heidi coral) with name tags + each girl's favourite (a heart, never a rule), and a
// spread of 13–14 foods + 1–2 love notes. Pick a food → it follows the pointer → drop it on a box: it snaps into
// the compartment for its category (full → a gentle bounce back). A love note tucks under the lid (♥).
// All boxes full → lids snap shut one by one. The three packed, CLOSED boxes stay in ctx.persist
// ('lunchbox:addy' | 'lunchbox:ellie' | 'lunchbox:heidi', root.userData.prop = the LunchboxProp) for Act IV.
// Inputs: mouse (click-click or drag), touch (tap-tap or drag), keyboard / gamepad (virtual cursor with a
// gentle magnet + primary to pick / drop). Stars: favourites packed per girl + pace. Never fails.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import type { ControlScheme, GameControls } from '../../input/types';
import { ACTS, type ActivityResult } from '../../plan/types';
import { DISPLAY_NAME, GIRLS, type GirlId } from '../../family/types';
import { FOOD_CATEGORY, FOOD_NAME, type FoodKind, type LunchCategory } from '../../props/types';
import { GIRL_COLORS, fitInSlot, makeFood, makeLunchbox, type LunchboxProp, type Prop } from '../../props';
import { COUNTER_H } from '../../world';
import { COUNTER_D } from '../../world/layout';
import type { TaskItem } from '../../ui/types';
import { approach, clamp01, yawToward, type PickSphere } from '../station/logic';
import { PointerRay, Shot, StationChris, SurfaceProbe, Tweens, say, shortScreen } from '../station/runtime';
import { StationUi, css, h, type WorldTag } from '../station/ui';
import { exposeStation } from '../station/debug';
import { CATS, allDone, autoPack, boxDone, buildSpread, favoritesPacked, fullLine, lunchStars, newPacking, packedCount, place, spreadCells, type Packing } from './logic';

type Phase = 'intro' | 'pack' | 'finale' | 'done';

const TOUCH: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: null, alt: null };
const PICK: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'PICK', icon: 'hand' }, secondary: null, alt: null };
const DROP: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'PACK', icon: 'drop' }, secondary: null, alt: null };
const NONE: ControlScheme = TOUCH;

const CAT_INDEX: Readonly<Record<LunchCategory, number>> = { main: 0, snack: 1, drink: 2, fruit: 3 };
/** Columns / rows of the spread on the counter. */
const COLS = 8;
const CELL_W = 0.178;
/** Height the held food floats at above the counter. */
const LIFT = 0.16;

interface Food {
  kind: FoodKind;
  prop: Prop;
  home: THREE.Vector3;
  homeYaw: number;
  homeScale: number;
  packed: boolean;
  sphere: PickSphere;
}

interface BoxView {
  girl: GirlId;
  prop: LunchboxProp;
  pos: THREE.Vector3;
  sphere: PickSphere;
  tag: WorldTag;
  tagAt: THREE.Vector3;
  fav: HTMLElement;
  open: number;
  openTarget: number;
}

class LunchActivity implements Activity {
  readonly id = 'lunch' as const;
  private ctx: ActivityContext | null = null;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private finished = false;
  private stars: 1 | 2 | 3 = 2;
  private packT = 0;
  private wrapping = false;

  private ui: StationUi | null = null;
  private chris: StationChris | null = null;
  private ray: PointerRay | null = null;
  private readonly tweens = new Tweens();
  private readonly shot = new Shot();

  private readonly foods: Food[] = [];
  private readonly boxes: BoxView[] = [];
  private packing: Packing = newPacking();
  private favorites: Record<GirlId, FoodKind> = { addy: 'grapes', ellie: 'pretzels', heidi: 'banana' };
  private held: Food | null = null;
  private hover: Food | null = null;
  private target: BoxView | null = null;
  private pressX = 0;
  private pressY = 0;
  private pressT = 0;
  private dragging = false;
  private counterY = COUNTER_H;
  private readonly bounds = { x0: 0, x1: 0, z0: 0, z1: 0 };
  private readonly fridgeAt = new THREE.Vector3();
  private fridgeOpen = 0;
  private fridgeTarget = 0;
  private readonly heldAt = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly foodSpheres: (PickSphere | null)[] = [];
  private readonly boxSpheres: (PickSphere | null)[] = [];
  private readonly beats: { left: number; fn: () => void }[] = [];
  private tasks: TaskItem[] = [];
  private notes = 0;
  private lastPrompt = '';
  private closing = 0;
  private lastSource: string = '';
  private compact = false;
  private skipped = false;

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.favorites = { ...ctx.plan.lunchFavorites };
    const f = ctx.world.fixtures;
    this.ui = new StationUi(ctx.ui.activityLayer());
    this.chris = new StationChris(ctx);
    this.ray = new PointerRay(ctx);
    ctx.pointer.enable({ virtual: 'auto', speed: 1.05 });
    const probe = new SurfaceProbe(ctx.world.root);

    const c = f.lunchCounter.root.getWorldPosition(new THREE.Vector3());
    const back = c.z - COUNTER_D / 2;
    const front = c.z + COUNTER_D / 2;
    this.counterY = probe.heightAt(c.x, front - 0.1, COUNTER_H + 0.3, COUNTER_H);
    this.bounds.x0 = c.x - 0.72;
    this.bounds.x1 = c.x + 0.72;
    this.bounds.z0 = back + 0.05;
    this.bounds.z1 = front - 0.02;
    f.fridge.root.getWorldPosition(this.fridgeAt);
    this.fridgeAt.set(this.fridgeAt.x + 0.45, 1.05, this.fridgeAt.z + 0.35);

    // ── lunchboxes along the back (lids lean on the wall when open) ──
    GIRLS.forEach((g, i) => {
      const prop = makeLunchbox(GIRL_COLORS[g]);
      const x = c.x + (i - 1) * 0.47;
      const z = back + 0.2;
      let y = this.counterY;
      for (const [dx, dz] of [
        [-0.12, -0.08],
        [0.12, -0.08],
        [-0.12, 0.08],
        [0.12, 0.08],
      ] as const)
        y = Math.max(y, probe.heightAt(x + dx, z + dz, COUNTER_H + 0.3, this.counterY));
      const pos = new THREE.Vector3(x, y, z);
      prop.root.position.copy(pos);
      prop.root.scale.setScalar(1e-3);
      prop.setOpen(0);
      ctx.root.add(prop.root);
      this.tweens.hop(prop.root, pos, 0.4 + i * 0.12, 0.06, { scale: 1, back: true });
      const tagAt = new THREE.Vector3(x, y + 0.34, z + 0.02);
      const tag = this.ui!.tag(tagAt);
      const name = h('div', 'bhd-st-name', DISPLAY_NAME[g].toUpperCase());
      name.style.background = css(GIRL_COLORS[g]);
      const fav = h('div', 'bhd-st-fav');
      const heart = h('b', '', '♥');
      fav.append(heart, document.createTextNode(FOOD_NAME[this.favorites[g]] ?? ''));
      tag.el.append(name, fav);
      const sphere = { x, y: y + 0.08, z, r: 0.2 };
      this.boxes.push({ girl: g, prop, pos, sphere, tag, tagAt, fav, open: 0, openTarget: 0 });
      this.boxSpheres.push(sphere);
    });

    // ── the spread (grouped by category, two rows in front of the boxes) ──
    const spread = buildSpread(() => ctx.rng.next(), this.favorites);
    const heights = new Map<FoodKind, number>();
    const probeProps = new Map<FoodKind, Prop>();
    const kinds = [...spread.foods, 'loveNote' as FoodKind];
    for (const k of kinds) {
      if (!probeProps.has(k)) {
        const p = makeFood(k);
        probeProps.set(k, p);
        heights.set(k, p.height);
      }
    }
    for (const p of probeProps.values()) p.dispose();
    const cells = spreadCells(spread, (k) => heights.get(k) ?? 0.05);
    const x0 = c.x - (CELL_W * (COLS - 1)) / 2;
    const rowZ = [front - 0.215, front - 0.08];
    cells.forEach((cell, i) => {
      const prop = makeFood(cell.kind);
      const bb = prop.root.userData.bounds as THREE.Box3 | undefined;
      const w = bb ? bb.max.x - bb.min.x : prop.radius * 2;
      const d = bb ? bb.max.z - bb.min.z : prop.radius * 2;
      const scale = Math.min(1, (CELL_W - 0.02) / w, 0.125 / d);
      const x = x0 + cell.col * CELL_W + (ctx.rng.next() - 0.5) * 0.02;
      const z = rowZ[cell.row]! + (ctx.rng.next() - 0.5) * 0.015;
      const y = probe.heightAt(x, z, COUNTER_H + 0.3, this.counterY);
      const home = new THREE.Vector3(x, y, z);
      const yaw = (ctx.rng.next() - 0.5) * 0.35;
      prop.root.position.copy(this.fridgeAt);
      prop.root.rotation.y = yaw;
      prop.root.scale.setScalar(1e-3);
      prop.root.visible = false;
      ctx.root.add(prop.root);
      const sphere = { x, y: y + Math.min(0.08, prop.height * scale * 0.5), z, r: 0.085 };
      const food: Food = { kind: cell.kind, prop, home, homeYaw: yaw, homeScale: scale, packed: false, sphere };
      this.foods.push(food);
      this.foodSpheres.push(sphere);
      this.after(0.55 + i * 0.07, () => {
        prop.root.visible = true;
        this.tweens.hop(prop.root, home, 0.42, 0.22, { scale, back: true });
        ctx.audio.play('itemPlace', { volume: 0.35, pitch: 0.9 + (i % 5) * 0.06 });
      });
    });
    this.fridgeTarget = 1;
    ctx.audio.play('fridgeOpen', { volume: 0.7 });
    this.after(0.55 + cells.length * 0.07 + 0.35, () => {
      this.fridgeTarget = 0;
      ctx.audio.play('doorClose', { volume: 0.35, pitch: 1.3 });
    });
    this.boxes.forEach((b, i) =>
      this.after(0.9 + i * 0.25, () => {
        b.openTarget = 1;
        ctx.audio.play('lunchSnap', { volume: 0.6, pitch: 1.15 });
      }),
    );

    // ── Chris at the right end of the counter, the camera over the spread ──
    const a = ctx.world.anchor('lunchCounter');
    const sx = this.bounds.x1 + 0.95;
    const sz = a.z - 0.05;
    this.chris.goTo(sx, sz, yawToward(sx, sz, c.x + 0.2, c.z));
    this.shot.look(c.x + 0.06, this.counterY + 0.1, c.z - 0.04, 0.04, 1.78, 1.36, 37).apply(ctx, 2.6);

    this.tasks = GIRLS.map((g) => ({ id: 'lunch:' + g, label: `${DISPLAY_NAME[g]}'s lunch`, icon: 'lunch', state: 'todo' }));
    this.compact = shortScreen(ctx);
    // Short phones: the name tags + ✓s carry the progress; keep the HUD column off the counter.
    ctx.hud.tasks = this.compact ? [] : this.tasks;
    ctx.hud.objective = this.compact ? '' : 'A main, a snack, a drink and a fruit for each girl.';
    ctx.ui.instruction('Pack the lunchboxes!', 'Drop each food into a box — ♥ = her favourite');
    exposeStation({ id: 'lunch', phase: () => this.phase, info: () => this.info() });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  update(dt: number, controls: GameControls): void {
    const ctx = this.ctx;
    if (!ctx || this.finished || dt <= 0) return;
    try {
      this.step(ctx, dt, controls);
    } catch (e) {
      console.warn('[lunch] recovered from an error; packing the rest', e);
      this.finishNow();
    }
  }

  controls(): ControlScheme | null {
    if (this.phase !== 'pack' || this.wrapping) return NONE;
    if (this.ctx?.input.lastDevice === 'touch') return TOUCH;
    return this.held ? DROP : PICK;
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    const flags: string[] = [];
    const favs = favoritesPacked(this.packing, this.favorites);
    if (GIRLS.every((g) => favs[g]) && !this.skipped && !this.wrapping) flags.push('lunch:favorites');
    if (this.notes > 0) flags.push('lunch:notes');
    return { stars: this.stars, flags };
  }

  skip(): void {
    if (this.finished || !this.ctx) return;
    this.finishNow();
  }

  dispose(): void {
    exposeStation(null);
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      ctx.world.fixtures.fridge.setDoor(0);
    } catch {
      /* ignore */
    }
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    ctx.hud.tasks = null;
    ctx.hud.objective = null;
    this.chris?.restore();
    this.ray?.dispose();
    this.ui?.dispose();
    this.ui = null;
  }

  // ── the chore ─────────────────────────────────────────────────────────────

  private after(seconds: number, fn: () => void): void {
    this.beats.push({ left: seconds, fn });
  }

  private step(ctx: ActivityContext, dt: number, c: GameControls): void {
    this.phaseT += dt;
    this.tweens.update(dt);
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const b = this.beats[i]!;
      b.left -= dt;
      if (b.left <= 0) {
        this.beats.splice(i, 1);
        b.fn();
      }
    }
    // Fridge door + lids ease toward their targets.
    this.fridgeOpen = approach(this.fridgeOpen, this.fridgeTarget, 7, dt);
    ctx.world.fixtures.fridge.setDoor(this.fridgeOpen);
    for (const b of this.boxes) {
      const k = b.openTarget > b.open ? 9 : 14;
      b.open = approach(b.open, b.openTarget, k, dt);
      b.prop.setOpen(b.open);
    }

    if (this.phase === 'intro') {
      if (this.phaseT > 0.55 + this.foods.length * 0.07 + 0.5 && this.beats.length === 0) {
        this.phase = 'pack';
        this.phaseT = 0;
        if (ctx.pointer.source === 'virtual') this.warpTo(this.foods[0]?.sphere ?? null, 1);
      }
    } else if (this.phase === 'pack') {
      this.packT += dt;
      // The name tags live where the instruction card sits: let it go once play is under way.
      if (this.packT > 4 && this.packT - dt <= 4 && !this.wrapping) ctx.ui.instruction(null);
      if (!this.wrapping && ctx.clock.minutes >= ACTS[0]!.end - 1) this.wrapUp(ctx);
      if (!this.wrapping) this.interact(ctx, dt, c);
      if (!this.wrapping && allDone(this.packing) && !this.held && !this.tweens.any) this.startFinale(ctx);
    } else if (this.phase === 'finale') {
      if (this.phaseT > 0.4 + this.closing * 0.32 + 1.4) this.complete(ctx);
    }
    this.ui!.update(ctx.projector);
  }

  private interact(ctx: ActivityContext, dt: number, c: GameControls): void {
    const ptr = ctx.pointer;
    const ray = this.ray!;
    // The virtual cursor (keys / pad) starts wherever the mouse last was — often a corner: bring it to the food.
    if (ptr.source === 'virtual' && this.lastSource !== 'virtual') {
      const food = this.foods.find((f) => !f.packed && f.kind !== 'loveNote');
      this.warpTo((this.held ? this.boxes[1]?.sphere : food?.sphere) ?? null, 1);
    }
    this.lastSource = ptr.source;
    ray.update();
    this.updatePrompt(ctx);

    if (!this.held) {
      // ── hover + pick ──
      for (let i = 0; i < this.foods.length; i++) this.foodSpheres[i] = this.foods[i]!.packed || this.tweens.busy(this.foods[i]!.prop.root) ? null : this.foods[i]!.sphere;
      const hi = ptr.active || ptr.source === 'virtual' ? ray.pick(this.foodSpheres, 1.2) : -1;
      const hov = hi >= 0 ? this.foods[hi]! : null;
      if (hov !== this.hover) {
        this.hover?.prop.setHighlight(0);
        this.hover = hov;
        if (hov) ctx.audio.play('uiMove', { volume: 0.25, pitch: 1.3 });
      }
      if (hov) hov.prop.setHighlight(0.85);
      if (ptr.source === 'virtual') this.magnet(ctx, dt, c, this.foodSpheres);
      if (ptr.pressed) {
        // Pick at the exact press point (a quick drag may already have moved the pointer this frame).
        ray.update(true);
        const pi = ray.pick(this.foodSpheres, 1.2);
        const at = pi >= 0 ? this.foods[pi]! : hov;
        if (at) this.pickUp(ctx, at);
        ray.update();
      }
      return;
    }

    // ── carrying ──
    const f = this.held;
    const hit = ray.onPlaneY(this.counterY + LIFT, this.tmp);
    if (hit) {
      this.heldAt.set(
        Math.min(this.bounds.x1, Math.max(this.bounds.x0, hit.x)),
        this.counterY + LIFT,
        Math.min(this.bounds.z1 + 0.05, Math.max(this.bounds.z0, hit.z)),
      );
    }
    const p = f.prop.root.position;
    p.x = approach(p.x, this.heldAt.x, 22, dt);
    p.y = approach(p.y, this.heldAt.y + Math.sin(this.phaseT * 6) * 0.008, 22, dt);
    p.z = approach(p.z, this.heldAt.z, 22, dt);
    f.prop.root.rotation.z = approach(f.prop.root.rotation.z, clamp01(Math.abs(ptr.vx) / 900) * Math.sign(-ptr.vx) * 0.35, 8, dt);
    // Target box: the one under the pointer (where the food is heading), else the one the ray passes through.
    let tgt: BoxView | null = null;
    const q = this.heldAt;
    for (const b of this.boxes) {
      if (Math.abs(q.x - b.pos.x) < 0.22 && q.z < b.pos.z + 0.19) {
        tgt = b;
        break;
      }
    }
    if (!tgt) {
      const bi = ray.pick(this.boxSpheres, 1.1);
      tgt = bi >= 0 ? this.boxes[bi]! : null;
    }
    if (tgt !== this.target) {
      this.target?.prop.setHighlight(0);
      this.target = tgt;
    }
    if (tgt) tgt.prop.setHighlight(0.7);
    if (ptr.source === 'virtual') this.magnet(ctx, dt, c, this.boxSpheres);

    if (Math.hypot(ptr.x - this.pressX, ptr.y - this.pressY) > 14 && ptr.down) this.dragging = true;
    const dragDrop = ptr.released && (this.dragging || this.phaseT - this.pressT > 0.35);
    // A second press drops; so does letting go at the end of a drag.
    if ((ptr.pressed && this.phaseT - this.pressT > 0.05) || dragDrop) this.drop(ctx, tgt);
  }

  private pickUp(ctx: ActivityContext, f: Food): void {
    const ptr = ctx.pointer;
    this.held = f;
    f.prop.setHighlight(0.35);
    this.hover = null;
    this.pressX = ptr.x;
    this.pressY = ptr.y;
    this.pressT = this.phaseT;
    this.dragging = false;
    this.tweens.cancel(f.prop.root);
    this.heldAt.set(f.home.x, this.counterY + LIFT, f.home.z);
    f.prop.root.scale.setScalar(Math.min(1, f.homeScale * 1.12));
    ctx.audio.play('itemPick', { pitch: 0.95 + Math.random() * 0.1 });
    ctx.walker.character.lookAt(f.home);
    if (ptr.source === 'virtual') {
      // Keys / pad: hop the cursor to a box that still needs this (her favourite first).
      const cat = FOOD_CATEGORY[f.kind];
      const needs = (b: BoxView): boolean => (cat === 'extra' ? !this.packing[b.girl].note : this.packing[b.girl][cat] === null);
      const box = this.boxes.find((b) => needs(b) && this.favorites[b.girl] === f.kind) ?? this.boxes.find(needs) ?? this.boxes[1] ?? null;
      if (box) this.warpTo(box.sphere, 1);
    }
  }

  private drop(ctx: ActivityContext, box: BoxView | null): void {
    const f = this.held;
    if (!f) return;
    this.held = null;
    this.dragging = false;
    f.prop.setHighlight(0);
    f.prop.root.rotation.z = 0;
    this.target?.prop.setHighlight(0);
    this.target = null;
    if (!box) {
      this.sendHome(f);
      ctx.audio.play('itemPlace', { volume: 0.4 });
      return;
    }
    const r = place(this.packing, box.girl, f.kind);
    if (r === 'full' || r === 'noteFull') {
      this.sendHome(f);
      ctx.audio.play('boing', { volume: 0.35, pitch: 1.25 });
      ctx.ui.bubble(new THREE.Vector3(box.pos.x, box.pos.y + 0.5, box.pos.z + 0.05), fullLine(f.kind), { speaker: 'chris', seconds: 1.8 });
      box.prop.root.rotation.z = 0;
      this.wobble(box);
      return;
    }
    this.packInto(ctx, f, box, r === 'note');
    if (ctx.pointer.source === 'virtual') {
      // …and back to the nearest food still on the counter.
      let best: Food | null = null;
      let bd = Infinity;
      for (const o of this.foods) {
        if (o.packed) continue;
        const d = Math.hypot(o.home.x - f.home.x, o.home.z - f.home.z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      if (best) this.warpTo(best.sphere, 1);
    }
  }

  /** Move a food into its compartment (or the note slot) with a quick hop; hearts for favourites. */
  private packInto(ctx: ActivityContext, f: Food, box: BoxView, note: boolean, quick = false): void {
    f.packed = true;
    const cat = FOOD_CATEGORY[f.kind];
    const slot = note ? box.prop.noteSlot : box.prop.slots[cat === 'extra' ? 0 : CAT_INDEX[cat]]!;
    const wp = f.prop.root.getWorldPosition(this.tmp2);
    const sStart = f.prop.root.scale.x;
    const fit = fitInSlot(f.prop, slot);
    const endPos = f.prop.root.position.clone();
    slot.worldToLocal(wp);
    f.prop.root.position.copy(wp);
    f.prop.root.scale.setScalar(sStart);
    this.tweens.hop(f.prop.root, endPos, quick ? 0.16 : 0.22, note || quick ? 0.02 : 0.05, { scale: fit.scale });
    const top = this.tmp.copy(box.pos).setY(box.pos.y + 0.12);
    ctx.audio.play('itemPlace', { pitch: 0.95 + packedCount(this.packing[box.girl]) * 0.07 });
    ctx.audio.play('pop', { volume: 0.4, pitch: 1.2, delay: 0.12 });
    if (note) {
      this.notes++;
      ctx.state.lunches.notes = this.notes;
      ctx.fx.burst('heart', top, { count: 8 });
      ctx.audio.play('heart', { delay: 0.1 });
    } else if (this.favorites[box.girl] === f.kind) {
      ctx.fx.burst('heart', top, { count: 6 });
      ctx.audio.play('heart', { volume: 0.8, delay: 0.1 });
      box.fav.classList.add('is-done');
      if (!quick) ctx.rumble('light');
    } else ctx.fx.burst('sparkle', top, { count: 5, size: 0.6 });
    const task = this.tasks.find((t) => t.id === 'lunch:' + box.girl);
    if (task) task.state = boxDone(this.packing[box.girl]) ? 'done' : 'active';
    if (!quick && boxDone(this.packing[box.girl])) ctx.audio.play('taskDone', { volume: 0.5 });
    if (!this.compact) ctx.hud.tasks = this.tasks.slice();
  }

  private sendHome(f: Food): void {
    this.tweens.hop(f.prop.root, f.home, 0.3, 0.07, { scale: f.homeScale });
    f.prop.root.rotation.set(0, f.homeYaw, 0);
    if (this.ctx?.pointer.source === 'virtual') this.warpTo(f.sphere, 1);
  }

  private wobble(b: BoxView): void {
    // a tiny "nope" shimmy of the box
    const base = b.pos.x;
    this.after(0.05, () => (b.prop.root.position.x = base + 0.01));
    this.after(0.12, () => (b.prop.root.position.x = base - 0.01));
    this.after(0.19, () => (b.prop.root.position.x = base + 0.006));
    this.after(0.26, () => (b.prop.root.position.x = base));
  }

  /** Keyboard/gamepad cursor: drift onto the nearest target when the stick is at rest. */
  private magnet(ctx: ActivityContext, dt: number, c: GameControls, targets: readonly (PickSphere | null)[]): void {
    if (Math.hypot(c.moveX, c.moveY) > 0.1) return;
    const ptr = ctx.pointer;
    const cam = ctx.camera.camera;
    let best: PickSphere | null = null;
    let bestD = 0.22;
    for (const t of targets) {
      if (!t) continue;
      this.tmp.set(t.x, t.y, t.z).project(cam);
      const d = Math.hypot(this.tmp.x - ptr.ndcX, (this.tmp.y - ptr.ndcY) * 0.6);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) this.warpTo(best, Math.min(1, dt * 9));
  }

  private warpTo(t: PickSphere | null, k: number): void {
    const ctx = this.ctx!;
    if (!t) return;
    this.tmp.set(t.x, t.y, t.z).project(ctx.camera.camera);
    const p = ctx.pointer;
    ctx.pointer.warp(p.ndcX + (this.tmp.x - p.ndcX) * k, p.ndcY + (this.tmp.y - p.ndcY) * k);
  }

  private updatePrompt(ctx: ActivityContext): void {
    const dev = ctx.input.lastDevice;
    const key = dev === 'touch' || ctx.pointer.source !== 'virtual' ? (this.held ? 'p-drop' : 'p-pick') : this.held ? 'k-drop' : 'k-pick';
    if (key === this.lastPrompt) return;
    this.lastPrompt = key;
    if (key === 'p-pick') ctx.ui.prompt({ text: 'Grab a food', slot: 'pointer' });
    else if (key === 'p-drop') ctx.ui.prompt({ text: 'Drop it in a lunchbox', slot: 'pointer' });
    else if (key === 'k-pick') ctx.ui.prompt({ text: 'Pick up', slot: 'primary' });
    else ctx.ui.prompt({ text: 'Pack it', slot: 'primary' });
  }

  // ── wrap-up / finale ──────────────────────────────────────────────────────

  /** Clock ran out (or skip): Chris packs the rest in a speedy montage. */
  private wrapUp(ctx: ActivityContext): void {
    this.wrapping = true;
    if (this.held) {
      const f = this.held;
      this.held = null;
      f.prop.setHighlight(0);
      this.sendHome(f);
    }
    ctx.ui.prompt(null);
    ctx.ui.instruction('Speed packing!', 'The clock says 6:00 — Chris finishes up');
    const avail: FoodKind[] = [];
    const idx: number[] = [];
    this.foods.forEach((f, i) => {
      if (!f.packed && f.kind !== 'loveNote') {
        avail.push(f.kind);
        idx.push(i);
      }
    });
    const moves = autoPack(this.packing, avail, this.favorites);
    moves.forEach((m, k) => {
      this.after(0.15 + k * 0.14, () => {
        const f = this.foods[idx[m.index]!]!;
        const box = this.boxes.find((b) => b.girl === m.girl)!;
        if (place(this.packing, m.girl, m.kind) === 'placed') this.packInto(ctx, f, box, false, true);
      });
    });
    this.after(0.3 + moves.length * 0.14, () => this.startFinale(ctx));
  }

  private startFinale(ctx: ActivityContext): void {
    if (this.phase === 'finale' || this.phase === 'done') return;
    this.phase = 'finale';
    this.phaseT = 0;
    ctx.ui.prompt(null);
    ctx.ui.instruction('Lunches: packed!', 'Snap, snap, snap.');
    this.hover?.prop.setHighlight(0);
    for (const b of this.boxes) b.prop.setHighlight(0);
    this.closing = this.boxes.length;
    this.boxes.forEach((b, i) =>
      this.after(0.4 + i * 0.32, () => {
        b.openTarget = 0;
        this.after(0.12, () => {
          ctx.audio.play('lunchSnap', { pitch: 1 + i * 0.08 });
          ctx.fx.burst('sparkle', this.tmp.copy(b.pos).setY(b.pos.y + 0.2), { count: 10 });
          ctx.rumble('light');
        });
      }),
    );
    // Leftovers go back to the fridge (a quick hop + shrink).
    let n = 0;
    for (const f of this.foods) {
      if (f.packed) continue;
      const k = n++;
      this.after(0.3 + k * 0.06, () => this.tweens.hop(f.prop.root, this.fridgeAt, 0.35, 0.15, { scale: 0.001, done: () => (f.prop.root.visible = false) }));
    }
    const chris = ctx.walker.character;
    chris.play('cheer');
    chris.setExpression('proud', 2.5);
    const favs = favoritesPacked(this.packing, this.favorites);
    const nFav = GIRLS.filter((g) => favs[g]).length;
    const mid = this.boxes[1]?.pos ?? this.boxes[0]!.pos;
    say(ctx, nFav === 3 ? 'Three happy lunches. ♥' : 'Lunches: done!', 2.2, 'normal', { x: mid.x, y: mid.y + 0.02, z: mid.z + 0.3 });
  }

  private complete(ctx: ActivityContext): void {
    if (this.finished) return;
    this.tweens.flush();
    // Lids shut, nothing pokes out, the boxes stay on the counter for Act IV.
    for (const b of this.boxes) {
      b.open = b.openTarget = 0;
      b.prop.setOpen(0);
      b.prop.setHighlight(0);
      b.prop.root.position.copy(b.pos);
      b.prop.root.scale.setScalar(1);
      b.prop.root.rotation.set(0, 0, 0);
      this.tuckIn(b);
      b.prop.root.name = 'lunchbox:' + b.girl;
      b.prop.root.userData.prop = b.prop;
      b.prop.root.userData.girl = b.girl;
      b.prop.root.userData.contents = { ...this.packing[b.girl] };
      ctx.persist.attach(b.prop.root);
    }
    for (const f of this.foods) if (!f.packed) f.prop.root.visible = false;
    ctx.state.lunches.packed = true;
    ctx.state.lunches.notes = this.notes;
    const favs = favoritesPacked(this.packing, this.favorites);
    const nFav = GIRLS.filter((g) => favs[g]).length;
    this.stars = lunchStars(nFav, this.packT);
    // Chris finished it for you (clock ran out / skip): a fine lunch, not a legendary one.
    if (this.wrapping || this.skipped) this.stars = Math.min(this.stars, 2) as 1 | 2;
    this.phase = 'done';
    this.finished = true;
  }

  /** Clamp packed items under the closed lid (props may peek over the rim when open). */
  private tuckIn(b: BoxView): void {
    const maxTop = 0.085 + 0.034; // base height + most of the lid's inner height (LUNCHBOX.baseH / lidH)
    for (const slot of b.prop.slots) {
      for (const ch of slot.children) {
        const box = new THREE.Box3().setFromObject(ch);
        const localTop = box.max.y - b.prop.root.position.y;
        if (localTop > maxTop && localTop > 0) {
          const k = Math.max(0.5, (maxTop - slot.position.y) / Math.max(1e-3, localTop - slot.position.y));
          ch.scale.multiplyScalar(k);
        }
      }
    }
  }

  /** Skip / error path: pack everything now, close the lids, same side effects. */
  private finishNow(): void {
    const ctx = this.ctx!;
    this.skipped = true;
    this.beats.length = 0;
    this.tweens.flush();
    this.chris?.cancel();
    if (this.held) {
      this.held.prop.setHighlight(0);
      this.held.prop.root.position.copy(this.held.home);
      this.held = null;
    }
    const avail: FoodKind[] = [];
    const idx: number[] = [];
    this.foods.forEach((f, i) => {
      if (!f.packed && f.kind !== 'loveNote') {
        avail.push(f.kind);
        idx.push(i);
      }
    });
    for (const m of autoPack(this.packing, avail, this.favorites)) {
      const f = this.foods[idx[m.index]!]!;
      const box = this.boxes.find((b) => b.girl === m.girl)!;
      if (place(this.packing, m.girl, m.kind) === 'placed') {
        f.packed = true;
        const cat = FOOD_CATEGORY[m.kind];
        if (cat !== 'extra') fitInSlot(f.prop, box.prop.slots[CAT_INDEX[cat]]!);
      }
    }
    for (const f of this.foods) {
      if (f.packed) {
        f.prop.root.visible = true;
        f.prop.setHighlight(0);
      }
    }
    if (this.packT === 0) this.packT = 60;
    this.complete(ctx);
  }

  private screenOf(v: { x: number; y: number; z: number }): [number, number] {
    const o = { x: 0, y: 0, visible: false };
    this.ctx!.projector.project(v, o);
    return [Math.round(o.x), Math.round(o.y)];
  }

  private info(): Record<string, unknown> {
    return {
      screen: {
        foods: this.foods.map((f) => ({ kind: f.kind, packed: f.packed, at: this.screenOf(f.sphere) })),
        boxes: this.boxes.map((b) => ({ girl: b.girl, at: this.screenOf(b.sphere) })),
      },
      phase: this.phase,
      favorites: this.favorites,
      packing: this.packing,
      held: this.held?.kind ?? null,
      hover: this.hover?.kind ?? null,
      target: this.target?.girl ?? null,
      foods: this.foods.map((f) => f.kind),
      packT: +this.packT.toFixed(1),
      notes: this.notes,
      stars: this.stars,
      cats: CATS,
    };
  }
}

export const create = (): Activity => new LunchActivity();
