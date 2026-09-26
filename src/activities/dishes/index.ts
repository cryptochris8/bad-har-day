// ─────────────────────────────────────────────────────────────────────────────
// DISHES — "Do the dishes" (docs/GDD.md §4.5). Close-up of the sink + dishwasher: the door drops, the racks
// slide out, and a seeded queue of 9–12 dishes rises from the sink one at a time. Sort each one:
//   plates / bowls / pan → BOTTOM rack (LEFT) · cups / glasses / sippy → TOP rack (UP) · cutlery → BASKET (RIGHT)
// with arrows / WASD / D-pad / stick flicks, the three big zone buttons, or a swipe of the dish. Sticky dishes
// need a quick RINSE first (hold secondary, the RINSE button, or hold on the dish). Wrong zone → the dish wobbles
// back with a gentle hint and the streak resets. Placed dishes stand neatly in the racks; at the end the racks
// slide in and the door shuts. Stars: accuracy + best streak + time. Never fails.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import type { ControlScheme, GameControls } from '../../input/types';
import { ACTS, type ActivityResult } from '../../plan/types';
import { makeDish, type DishProp } from '../../props';
import type { DishKind } from '../../props/types';
import { PAL } from '../../render/palette';
import { FlickDetector, approach, swipeDir, yawToward, type Dir } from '../station/logic';
import { PointerRay, Shot, StationChris, Tweens, narrowPortrait, say, shortScreen } from '../station/runtime';
import { ARROW_SVG, StationUi, glyph, h, type WorldTag } from '../station/ui';
import { exposeStation } from '../station/debug';
import { DishTally, ZONE_LABEL, ZONE_OF, ZONE_SUB, buildQueue, clinkPitch, dishesStars, rackSlot, wrongHint, zoneForDir, type DishSpec, type DishZone } from './logic';

type Phase = 'intro' | 'sort' | 'close' | 'done';

const SORT: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: null, alt: null };
const RINSE: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: { label: 'RINSE', icon: 'rinse', hold: true }, alt: null };
const NONE = SORT;

/** Seconds of rinsing a sticky dish needs. */
const RINSE_TIME = 0.6;
/** The dish being sorted is shown a little bigger so it reads. */
const PRESENT_SCALE = 1.3;
const DISH_COLORS = [PAL.dishBlue, PAL.addyMain, PAL.ellieMain, PAL.heidiMain] as const;

interface Dish {
  spec: DishSpec;
  prop: DishProp;
  dirty: number;
  placed: boolean;
}

class DishesActivity implements Activity {
  readonly id = 'dishes' as const;
  private ctx: ActivityContext | null = null;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private finished = false;
  private stars: 1 | 2 | 3 = 2;
  private sortT = 0;
  private wrapping = false;
  private skipped = false;

  private ui: StationUi | null = null;
  private chris: StationChris | null = null;
  private ray: PointerRay | null = null;
  private readonly tweens = new Tweens();
  private readonly flick = new FlickDetector();
  private readonly shot = new Shot();
  private readonly tally = new DishTally();
  private readonly beats: { left: number; fn: () => void }[] = [];

  private readonly dishes: Dish[] = [];
  private cur = -1;
  private curReady = false;
  private readonly present = new THREE.Vector3();
  private readonly rinseAt = new THREE.Vector3();
  private readonly basinAt = new THREE.Vector3();
  private readonly counts: Record<DishZone, number> = { bottom: 0, top: 0, basket: 0 };
  private door = 0;
  private doorTarget = 0;
  private racks = 0;
  private racksTarget = 0;
  private rinsing = false;
  private waterLoop: ReturnType<ActivityContext['audio']['loop']> | null = null;
  private bubbleT = 0;
  private bubbleSplash = 0;
  private wobbleT = 0;
  private wobbleDir: Dir | null = null;

  // pointer drag on the dish
  private grabbing = false;
  private grabX = 0;
  private grabY = 0;
  private grabT = 0;
  private stillHold = false;

  // DOM
  private zoneEls: Record<DishZone, HTMLElement> | null = null;
  private streakEl: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private hintEl: HTMLElement | null = null;
  private stickyTag: WorldTag | null = null;
  private readonly stickyAt = new THREE.Vector3();
  private lastPrompt = '';
  private readonly tmp = new THREE.Vector3();
  private readonly sphere = [{ x: 0, y: 0, z: 0, r: 0.2 }];

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    const f = ctx.world.fixtures;
    this.ui = new StationUi(ctx.ui.activityLayer());
    this.chris = new StationChris(ctx);
    this.ray = new PointerRay(ctx);
    ctx.pointer.enable({ virtual: 'off' });

    f.sink.basin.getWorldPosition(this.basinAt);
    // Dishes rise out of the basin and float just in front of the counter edge (clear of the faucet).
    this.present.set(this.basinAt.x + 0.12, this.basinAt.y + 0.18, this.basinAt.z + 0.4);
    this.rinseAt.set(this.basinAt.x, this.basinAt.y + 0.16, this.basinAt.z - 0.02);
    const dw = f.dishwasher.root.getWorldPosition(new THREE.Vector3());

    for (const spec of buildQueue(() => ctx.rng.next(), DISH_COLORS.length)) {
      const prop = makeDish(spec.kind, DISH_COLORS[spec.color] ?? PAL.dishBlue);
      prop.root.visible = false;
      prop.setDirty(spec.dirty ? 1 : 0);
      ctx.root.add(prop.root);
      this.dishes.push({ spec, prop, dirty: spec.dirty ? 1 : 0, placed: false });
    }

    // Chris beside the sink (left), the camera over sink + open dishwasher.
    const a = ctx.world.anchor('sink');
    // Chris stands at the sink's left, just out of the close-up (his lines are anchored by the dish).
    const sx = this.basinAt.x - 1.45;
    const sz = a.z - 0.1;
    this.chris.goTo(sx, sz, yawToward(sx, sz, this.basinAt.x, this.basinAt.z));
    const tx = (this.basinAt.x + dw.x) / 2 + 0.16;
    this.shot.look(tx, 0.64, dw.z + 0.15, -0.3, 1.32, 2.5, 42).portrait({ zoom: 0.8, lift: 0.2, left: 0 }).apply(ctx, 2.6);

    this.buildDom(ctx);
    this.doorTarget = 1;
    ctx.audio.play('doorOpen', { volume: 0.5, pitch: 1.3 });
    this.after(0.45, () => {
      this.racksTarget = 1;
      ctx.audio.play('dishClink', { volume: 0.4, pitch: 0.8 });
    });
    const compact = shortScreen(ctx) || narrowPortrait(ctx);
    ctx.hud.objective = compact ? '' : 'Plates below, cups on top, cutlery in the basket.';
    if (compact) ctx.hud.tasks = [];
    // Short / portrait phones: the side card's "3 / 9" carries progress; the HUD meter would sit on the instruction.
    ctx.hud.meters = shortScreen(ctx) || narrowPortrait(ctx) ? null : [{ id: 'dishes', label: 'Dishes', value: 0, color: 'var(--bhd-sky)', icon: 'dishes' }];
    ctx.ui.instruction('Load the dishwasher!', '◀ bottom rack · ▲ top rack · basket ▶');
    exposeStation({ id: 'dishes', phase: () => this.phase, info: () => this.info() });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  update(dt: number, controls: GameControls): void {
    const ctx = this.ctx;
    if (!ctx || this.finished || dt <= 0) return;
    try {
      this.step(ctx, dt, controls);
    } catch (e) {
      console.warn('[dishes] recovered from an error; finishing up', e);
      this.finishNow();
    }
  }

  controls(): ControlScheme | null {
    if (this.phase !== 'sort' || this.wrapping) return NONE;
    const d = this.dishes[this.cur];
    return d && this.curReady && d.dirty > 0 ? RINSE : SORT;
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    const flags: string[] = [];
    if (this.tally.mistakes === 0 && this.tally.correct === this.dishes.length) flags.push('dishes:perfect');
    return { stars: this.stars, flags };
  }

  skip(): void {
    if (this.finished || !this.ctx) return;
    this.finishNow();
  }

  dispose(): void {
    exposeStation(null);
    const ctx = this.ctx;
    this.stopWater();
    if (!ctx) return;
    // Dishes parented to the dishwasher racks belong to this activity: take them out (the door is shut anyway).
    for (const d of this.dishes) {
      if (d.prop.root.parent && d.prop.root.parent !== ctx.root) ctx.root.add(d.prop.root);
    }
    try {
      const f = ctx.world.fixtures;
      f.sink.setWater(false);
      f.dishwasher.setRacks(0);
      f.dishwasher.setDoor(0);
    } catch {
      /* ignore */
    }
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    ctx.hud.objective = null;
    ctx.hud.meters = null;
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
    this.shot.refresh(ctx);
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const b = this.beats[i]!;
      b.left -= dt;
      if (b.left <= 0) {
        this.beats.splice(i, 1);
        b.fn();
      }
    }
    const dwf = ctx.world.fixtures.dishwasher;
    this.door = approach(this.door, this.doorTarget, this.doorTarget > this.door ? 6 : 9, dt);
    this.racks = approach(this.racks, this.racksTarget, 7, dt);
    dwf.setDoor(this.door);
    dwf.setRacks(this.racks);

    const taps = this.ui!.takeTaps();
    if (this.phase === 'intro') {
      if (this.phaseT > 1.1) {
        this.phase = 'sort';
        this.phaseT = 0;
        this.next(ctx);
      }
    } else if (this.phase === 'sort') {
      this.sortT += dt;
      if (this.sortT > 3.5 && this.sortT - dt <= 3.5 && !this.wrapping) ctx.ui.instruction(null);
      if (!this.wrapping && ctx.clock.minutes >= ACTS[0]!.end - 1) this.wrapUp(ctx);
      if (!this.wrapping) this.sortInput(ctx, dt, c, taps);
    } else if (this.phase === 'close') {
      if (this.phaseT > 2.2) this.complete(ctx);
    }
    this.presentIdle(dt);
    this.ui!.update(ctx.projector);
  }

  /** Bring up the next dish from the sink. */
  private next(ctx: ActivityContext): void {
    this.cur = this.dishes.findIndex((d) => !d.placed);
    this.curReady = false;
    this.rinsing = false;
    this.grabbing = false;
    this.flick.reset();
    if (this.stickyTag) this.stickyTag.hidden = true;
    if (this.cur < 0) {
      this.closeUp(ctx);
      return;
    }
    const d = this.dishes[this.cur]!;
    const r = d.prop.root;
    r.visible = true;
    r.position.set(this.basinAt.x, this.basinAt.y - 0.02, this.basinAt.z);
    r.rotation.set(this.presentTilt(d.spec.kind), 0, 0);
    r.scale.setScalar(0.5);
    ctx.audio.play('suds', { volume: 0.35, pitch: 1.2 });
    ctx.fx.burst('bubble', this.tmp.set(this.basinAt.x, this.basinAt.y + 0.05, this.basinAt.z), { count: 5, color: PAL.soapBubble, size: 0.6 });
    this.tweens.hop(r, this.present, 0.28, 0.05, {
      scale: PRESENT_SCALE,
      done: () => {
        this.curReady = true;
        // A soft warm rim so the dish reads against the dark pre-dawn kitchen.
        d.prop.setHighlight(0.4);
        if (d.dirty > 0 && this.stickyTag) this.stickyTag.hidden = false;
      },
    });
  }

  private presentTilt(kind: DishKind): number {
    // Flat things tip toward the camera so they read.
    return kind === 'plate' || kind === 'pan' ? 0.95 : kind === 'bowl' ? 0.55 : kind === 'fork' || kind === 'spoon' || kind === 'butterKnife' ? 0.6 : 0.1;
  }

  private presentIdle(dt: number): void {
    const d = this.dishes[this.cur];
    if (!d || d.placed || !this.curReady || this.phase !== 'sort') return;
    const r = d.prop.root;
    this.wobbleT = Math.max(0, this.wobbleT - dt);
    let ox = 0;
    let oy = 0;
    if (this.wobbleT > 0 && this.wobbleDir) {
      // A little lunge toward the wrong / blocked zone, then back.
      const k = Math.sin((1 - this.wobbleT / 0.45) * Math.PI) * 0.09;
      ox = this.wobbleDir === 'left' ? -k : this.wobbleDir === 'right' ? k : 0;
      oy = this.wobbleDir === 'up' ? k : 0;
      r.rotation.z = Math.sin(this.wobbleT * 40) * 0.12;
    } else r.rotation.z = approach(r.rotation.z, 0, 10, dt);
    if (!this.grabbing || this.rinsing) {
      // While rinsing the dish ducks under the faucet stream.
      const home = this.rinsing ? this.rinseAt : this.present;
      const k = this.rinsing ? 12 : 18;
      r.position.x = approach(r.position.x, home.x + ox, k, dt);
      r.position.y = approach(r.position.y, home.y + oy + Math.sin(this.sortT * 3) * 0.008, k, dt);
      r.position.z = approach(r.position.z, home.z, k, dt);
    }
    r.rotation.y += dt * 0.5;
  }

  private sortInput(ctx: ActivityContext, dt: number, c: GameControls, taps: readonly string[]): void {
    const d = this.dishes[this.cur];
    this.updatePrompt(ctx, d);
    if (!d || !this.curReady || d.placed) return;
    const ptr = ctx.pointer;

    // ── pointer: grab the dish → swipe to sort, or hold still to rinse ──
    if (ptr.pressed) {
      this.ray!.update(true);
      const p = d.prop.root.position;
      this.sphere[0]!.x = p.x;
      this.sphere[0]!.y = p.y + 0.04;
      this.sphere[0]!.z = p.z;
      if (this.ray!.pick(this.sphere, 1.4) === 0) {
        this.grabbing = true;
        this.grabX = ptr.x;
        this.grabY = ptr.y;
        this.grabT = 0;
        this.stillHold = true;
      }
    }
    let attempt: DishZone | null = null;
    if (this.grabbing) {
      this.grabT += dt;
      const dx = ptr.x - this.grabX;
      const dy = ptr.y - this.grabY;
      if (Math.hypot(dx, dy) > 16) this.stillHold = false;
      // The dish leans after the finger a little.
      const r = d.prop.root;
      if (!this.rinsing) r.position.x = approach(r.position.x, this.present.x + Math.max(-0.16, Math.min(0.16, dx * 0.0012)), 20, dt);
      if (!this.rinsing) r.position.y = approach(r.position.y, this.present.y + Math.max(-0.08, Math.min(0.14, -dy * 0.0012)), 20, dt);
      if (!ptr.down || ptr.released) {
        this.grabbing = false;
        attempt = zoneForDir(swipeDir(dx, dy, 34));
      }
    }

    // ── rinse (hold) ──
    const holdRinse = c.secondary || this.ui!.held('rinse') || (this.grabbing && this.stillHold && this.grabT > 0.18);
    if (d.dirty > 0) {
      if (holdRinse) {
        if (!this.rinsing) {
          this.rinsing = true;
          ctx.world.fixtures.sink.setWater(true);
          ctx.audio.play('rinse');
          this.waterLoop ??= ctx.audio.loop('water');
          this.waterLoop.set(0.5);
          ctx.walker.character.play('grab', { duration: 0.4 });
        }
        d.dirty = Math.max(0, d.dirty - dt / RINSE_TIME);
        d.prop.setDirty(d.dirty);
        this.bubbleT -= dt;
        if (this.bubbleT <= 0) {
          this.bubbleT = 0.12;
          const p = d.prop.root.position;
          ctx.fx.burst('bubble', this.tmp.set(p.x, p.y + 0.05, p.z), { count: 3, color: PAL.soapBubble, size: 0.55 });
          if (this.bubbleSplash++ % 3 === 0) ctx.fx.burst('splash', this.tmp.set(p.x, p.y + 0.02, p.z), { count: 2, size: 0.3, speed: 0.35 });
        }
        if (d.dirty <= 0) {
          this.tally.rinses++;
          ctx.audio.play('sparkle', { volume: 0.7 });
          ctx.fx.burst('sparkle', this.tmp.copy(d.prop.root.position).setY(d.prop.root.position.y + 0.06), { count: 10 });
          if (this.stickyTag) this.stickyTag.hidden = true;
          this.stopWater();
          if (this.grabbing) this.stillHold = false;
        }
      } else if (this.rinsing) this.stopWater();
    } else if (this.rinsing) this.stopWater();

    // ── keys / pad / buttons ──
    const dir = this.flick.update(c.moveX, c.moveY);
    if (!attempt) attempt = zoneForDir(dir);
    for (const t of taps) if (t === 'zone:bottom' || t === 'zone:top' || t === 'zone:basket') attempt = t.slice(5) as DishZone;
    if (attempt) this.tryZone(ctx, d, attempt);
  }

  private tryZone(ctx: ActivityContext, d: Dish, zone: DishZone): void {
    const dir: Dir = zone === 'bottom' ? 'left' : zone === 'top' ? 'up' : 'right';
    if (d.dirty > 0) {
      // Sticky: not a mistake, just a nudge.
      this.wobbleT = 0.45;
      this.wobbleDir = dir;
      ctx.audio.play('boing', { volume: 0.3, pitch: 1.4 });
      say(ctx, 'Sticky! Rinse it first.', 1.6, 'normal', this.voice());
      if (this.stickyTag) {
        this.stickyTag.hidden = false;
        this.stickyTag.el.classList.remove('bhd-pop');
        void this.stickyTag.el.offsetWidth;
        this.stickyTag.el.classList.add('bhd-pop');
      }
      return;
    }
    const right = ZONE_OF[d.spec.kind];
    if (zone !== right) {
      this.tally.record(false);
      this.wobbleT = 0.45;
      this.wobbleDir = dir;
      ctx.audio.play('boing', { volume: 0.4, pitch: 1.1 });
      ctx.walker.character.play('shakeHead', { duration: 0.8 });
      say(ctx, wrongHint(d.spec.kind), 1.8, 'normal', this.voice());
      this.flashZone(zone, 'is-bad', 0.45);
      this.flashZone(right, 'is-hot', 1.0);
      this.refreshStreak(false);
      ctx.rumble('light');
      return;
    }
    this.tally.record(true);
    this.place(ctx, d, zone, false);
    this.flashZone(zone, 'is-good', 0.3);
    this.refreshStreak(true);
    this.after(0.08, () => this.next(ctx));
  }

  /** Fly a dish into its rack slot (parented to the rack so it rides the rack in). */
  private place(ctx: ActivityContext, d: Dish, zone: DishZone, quick: boolean): void {
    const f = ctx.world.fixtures.dishwasher;
    const parent = zone === 'top' ? f.topRack : zone === 'basket' ? f.basket : f.bottomRack;
    const idx = this.counts[zone]++;
    const slot = rackSlot(zone, zone === 'bottom' ? this.bottomIndex(d.spec.kind, idx) : idx, d.spec.kind);
    const r = d.prop.root;
    d.placed = true;
    d.prop.setHighlight(0);
    this.tweens.cancel(r);
    parent.attach(r);
    const b = r.userData.bounds as THREE.Box3 | undefined;
    const hgt = b ? b.max.y : d.prop.height;
    const k = zone === 'basket' ? 0.8 : 0.82;
    let y = 0.012;
    if (slot.pose === 'upright') {
      r.rotation.set(Math.PI / 2 - 0.22, 0, 0);
      y += 0.125 * k;
    } else if (slot.pose === 'tilted') {
      if (d.spec.kind === 'pan') {
        // Upright at the back, handle pointing up.
        r.rotation.set(Math.PI / 2 - 0.25, 0, Math.PI / 2);
        y += 0.135 * k;
      } else {
        r.rotation.set(Math.PI / 2 - 0.55, 0, 0);
        y += 0.07;
      }
    } else if (slot.pose === 'inverted') {
      r.rotation.set(Math.PI, 0, 0);
      y += hgt * k;
    } else {
      r.rotation.set(0, (idx % 3) * 0.5, Math.PI / 2 + ((idx % 2) - 0.5) * 0.2);
      y += 0.1;
    }
    const to = this.tmp.set(slot.x, y, slot.z);
    this.tweens.hop(r, to, quick ? 0.16 : 0.3, quick ? 0.05 : 0.12, { scale: k });
    const pitch = clinkPitch(this.tally.streak);
    const sfx = zone === 'basket' ? 'cutlery' : zone === 'top' ? 'glassClink' : 'dishClink';
    ctx.audio.play(sfx, { pitch, delay: quick ? 0.1 : 0.22, volume: quick ? 0.5 : 0.9 });
    const placed = this.dishes.filter((x) => x.placed).length;
    const m = ctx.hud.meters?.[0];
    if (m) ctx.hud.meters = [{ ...m, value: placed / this.dishes.length }];
    if (this.countEl) this.countEl.textContent = `${placed} / ${this.dishes.length}`;
  }

  /** Bottom rack: plates/bowls share the rows; the pan has its own spot at the back. */
  private bottomIndex(kind: DishKind, idx: number): number {
    if (kind === 'pan') return 0;
    return idx - this.dishes.filter((x) => x.placed && x.spec.kind === 'pan').length;
  }

  private closeUp(ctx: ActivityContext): void {
    if (this.phase === 'close') return;
    this.phase = 'close';
    this.phaseT = 0;
    this.stopWater();
    ctx.ui.prompt(null);
    ctx.ui.instruction('All loaded!', 'Racks in… door shut… ahhh.');
    this.after(0.35, () => {
      this.racksTarget = 0;
      ctx.audio.play('dishClink', { volume: 0.5, pitch: 0.7 });
    });
    this.after(1.0, () => {
      this.doorTarget = 0;
    });
    this.after(1.3, () => {
      ctx.audio.play('dishwasherShut');
      const dw = ctx.world.fixtures.dishwasher.root.getWorldPosition(this.tmp);
      ctx.fx.burst('sparkle', dw.setY(0.7), { count: 14 });
      ctx.rumble('medium');
      const chris = ctx.walker.character;
      chris.play('thumbsUp');
      chris.setExpression('proud', 2);
      say(ctx, this.tally.mistakes === 0 ? 'Dishwasher Tetris: mastered.' : 'Clean dishes by lunch!', 2.2, 'normal', this.voice());
    });
  }

  private wrapUp(ctx: ActivityContext): void {
    this.wrapping = true;
    this.stopWater();
    if (this.stickyTag) this.stickyTag.hidden = true;
    ctx.ui.prompt(null);
    ctx.ui.instruction('Speed round!', 'Chris zips the rest in');
    let k = 0;
    for (const d of this.dishes) {
      if (d.placed) continue;
      const n = k++;
      this.after(0.1 + n * 0.14, () => {
        d.dirty = 0;
        d.prop.setDirty(0);
        d.prop.root.visible = true;
        if (d.prop.root.parent !== ctx.root) ctx.root.attach(d.prop.root);
        d.prop.root.position.copy(this.present);
        this.place(ctx, d, ZONE_OF[d.spec.kind], true);
      });
    }
    this.after(0.3 + k * 0.14, () => this.closeUp(ctx));
  }

  private complete(ctx: ActivityContext): void {
    if (this.finished) return;
    this.tweens.flush();
    const f = ctx.world.fixtures.dishwasher;
    f.setRacks(0);
    f.setDoor(0);
    ctx.world.fixtures.sink.setWater(false);
    ctx.state.dishesDone = true;
    this.stars = dishesStars(this.tally, this.dishes.length, this.sortT);
    // Auto-loaded (clock ran out / skip): a plausible middle result.
    if (this.skipped || this.wrapping) this.stars = Math.min(this.stars, 2) as 1 | 2;
    this.phase = 'done';
    this.finished = true;
  }

  /** Skip / error path: everything goes into the racks now, door shut, same side effects. */
  private finishNow(): void {
    const ctx = this.ctx!;
    this.beats.length = 0;
    this.tweens.flush();
    this.chris?.cancel();
    this.stopWater();
    for (const d of this.dishes) {
      if (d.placed) continue;
      d.dirty = 0;
      d.prop.setDirty(0);
      d.prop.root.visible = true;
      this.place(ctx, d, ZONE_OF[d.spec.kind], true);
    }
    this.tweens.flush();
    this.skipped = true;
    this.complete(ctx);
  }

  // ── bits ──────────────────────────────────────────────────────────────────

  /** On-screen anchor for Chris's lines (he stands just outside the close-up). */
  private voice(): { x: number; y: number; z: number } {
    return { x: this.present.x - 0.3, y: this.present.y + 0.3, z: this.present.z };
  }

  private stopWater(): void {
    this.rinsing = false;
    try {
      this.ctx?.world.fixtures.sink.setWater(false);
      this.waterLoop?.stop();
    } catch {
      /* ignore */
    }
    this.waterLoop = null;
  }

  private buildDom(ctx: ActivityContext): void {
    const ui = this.ui!;
    const card = ui.card();
    const streak = h('div', 'bhd-st-streak', '');
    const count = h('div', 'bhd-st-sub', `0 / ${this.dishes.length}`);
    const hint = h('div', 'bhd-st-hint');
    card.append(streak, count, hint);
    this.hintEl = hint;
    this.streakEl = streak;
    this.countEl = count;
    this.refreshStreak(false);
    const row = h('div', 'bhd-st-zones');
    ui.root.appendChild(row);
    const mk = (zone: DishZone, dir: 'left' | 'up' | 'right'): HTMLElement => {
      const ico = h('span', '');
      ico.innerHTML = ARROW_SVG[dir];
      const lab = h('span', 'bhd-btn__label', ZONE_LABEL[zone]);
      const sub = h('span', 'bhd-btn__sub', ZONE_SUB[zone]);
      return ui.button(row, 'zone:' + zone, 'bhd-st-zone' + (dir === 'up' ? ' bhd-st-zone--up' : ''), [ico, lab, sub]);
    };
    this.zoneEls = { bottom: mk('bottom', 'left'), top: mk('top', 'up'), basket: mk('basket', 'right') };
    // "Sticky!" tag over the presented dish, with the rinse hold button inside.
    this.stickyAt.copy(this.present).setY(this.present.y + 0.2);
    const tag = ui.tag(this.stickyAt);
    const b = ui.button(tag.el, 'rinse', 'bhd-btn--primary', [glyph('secondary', 'Hold to rinse')]);
    b.style.pointerEvents = 'auto';
    tag.el.prepend(h('span', 'bhd-st-label', 'Sticky!'));
    tag.hidden = true;
    this.stickyTag = tag;
    void ctx;
  }

  private refreshStreak(pop: boolean): void {
    const el = this.streakEl;
    if (!el) return;
    el.textContent = '';
    el.append(document.createTextNode('STREAK '), h('b', '', '×' + this.tally.streak));
    if (pop) {
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
    }
  }

  private flashZone(zone: DishZone, cls: string, seconds: number): void {
    const el = this.zoneEls?.[zone];
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    this.after(seconds, () => el.classList.remove(cls));
  }

  /** The zone buttons (bottom centre) replace the prompt bar; the hint line in the side card follows the device. */
  private updatePrompt(ctx: ActivityContext, d: Dish | undefined): void {
    const touch = ctx.input.lastDevice === 'touch';
    const dirty = !!d && d.dirty > 0 && this.curReady;
    const key = (touch ? 't' : 'k') + (dirty ? 'd' : 'c');
    if (key === this.lastPrompt || !this.hintEl) return;
    this.lastPrompt = key;
    this.hintEl.textContent = '';
    if (dirty) this.hintEl.append(glyph(touch ? 'pointer' : 'secondary', touch ? 'Hold the dish to rinse' : 'Hold to rinse'));
    else this.hintEl.append(glyph(touch ? 'pointer' : 'move', touch ? 'Swipe or tap a rack' : 'Sort'));
  }

  private info(): Record<string, unknown> {
    const d = this.dishes[this.cur];
    const o = { x: 0, y: 0, visible: false };
    if (d && this.ctx) this.ctx.projector.project(d.prop.root.position, o);
    return {
      screen: { dish: [Math.round(o.x), Math.round(o.y)] },
      phase: this.phase,
      queue: this.dishes.map((x) => (x.spec.dirty ? '*' : '') + x.spec.kind),
      cur: this.cur,
      kind: d?.spec.kind ?? null,
      zone: d ? ZONE_OF[d.spec.kind] : null,
      dirty: d ? +d.dirty.toFixed(2) : null,
      ready: this.curReady,
      correct: this.tally.correct,
      mistakes: this.tally.mistakes,
      streak: this.tally.streak,
      best: this.tally.best,
      sortT: +this.sortT.toFixed(1),
      stars: this.stars,
      door: +this.door.toFixed(2),
      racks: +this.racks.toFixed(2),
    };
  }
}

export const create = (): Activity => new DishesActivity();

