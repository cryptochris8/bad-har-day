// ─────────────────────────────────────────────────────────────────────────────
// COFFEE — "Make Ashley's coffee" (docs/GDD.md §4.2). A close-up station chore:
//   1 PICK her mug (the sunflower one) from the shelf · 2 BREW: hold to fill, release in the gold zone
//   (overfill = a comedic spill + a quick wipe) · 3 CREAMER per her order: pour until the colour matches the
//   swatch (Lab ΔE), + one spoon of sugar and a stir for "cream & sugar" · 4 carry it to Ashley's spot.
// Leaves the finished, steaming mug in ctx.persist as 'ashleys-coffee' (root.userData.prop = the MugProp).
// Inputs: mouse/touch (hover/tap the mugs, hold anywhere or the HOLD button, circle to stir), keyboard/gamepad
// (←/→ choose, primary picks / hold to pour, mash to stir). Never fails: mistakes cost a moment or a star.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import type { ControlScheme, GameControls } from '../../input/types';
import type { ActivityResult, CoffeeOrder } from '../../plan/types';
import { makeMug, makeProp, type MugProp, type Prop } from '../../props';
import type { MugDesign } from '../../props/types';
import { PAL } from '../../render/palette';
import { cachedGeo, plain } from '../../render/models/common';
import { modelMaterial } from '../../render/models/materials';
import { COUNTER_H, TABLE_H } from '../../world';
import { CircleAccumulator, FlickDetector, approach, yawToward } from '../station/logic';
import { PointerRay, Shot, StationChris, SurfaceProbe, Tweens, holdIn, say } from '../station/runtime';
import { StationUi, css, glyph, h, setVar, type WorldTag } from '../station/ui';
import { exposeStation } from '../station/debug';
import {
  BREW_BAND,
  CREAM_RATE,
  HER_MUG,
  MUG_NAME,
  ORDER_COLOR,
  ORDER_NAME,
  OVERFLOW,
  brewStep,
  coffeeStars,
  creamColor,
  creamVerdict,
  fillVerdict,
  mugLineup,
  type CoffeeRun,
  type FillVerdict,
} from './logic';

type Phase = 'intro' | 'pick' | 'wrong' | 'toMachine' | 'brew' | 'spill' | 'wipe' | 'cream' | 'beat' | 'sugar' | 'stir' | 'served' | 'carry' | 'setDown' | 'finale' | 'done';

const NONE: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: null, alt: null };
const PICK: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'PICK', icon: 'hand' }, secondary: null, alt: null };
const BREW: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'BREW', icon: 'pour', hold: true }, secondary: null, alt: null };
const POUR: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'POUR', icon: 'pour', hold: true }, secondary: null, alt: null };
const SUGAR: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'SUGAR', icon: 'hand' }, secondary: null, alt: null };
const STIR: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'STIR', icon: 'go' }, secondary: null, alt: null };
const WIPE: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'WIPE', icon: 'hand' }, secondary: null, alt: null };

const WIPES = 3;
const STIRS = 3;
/** Swept pointer angle that counts as one stir. */
const STIR_ANGLE = Math.PI * 1.3;

class CoffeeActivity implements Activity {
  readonly id = 'coffee' as const;
  private ctx: ActivityContext | null = null;
  private phase: Phase = 'intro';
  private phaseT = 0;
  private finished = false;
  private stars: 1 | 2 | 3 = 2;
  private order: CoffeeOrder = 'splash';

  // scene
  private readonly mugs: MugProp[] = [];
  private designs: MugDesign[] = [];
  private readonly slotPos: THREE.Vector3[] = [];
  private her: MugProp | null = null;
  private creamer: Prop | null = null;
  private sugarJar: Prop | null = null;
  private spoon: Prop | null = null;
  private puddle: THREE.Mesh | null = null;
  private stream: THREE.Mesh | null = null;
  private readonly spot = new THREE.Vector3();
  private readonly creamerHome = new THREE.Vector3();
  private readonly creamerPour = new THREE.Vector3();
  private readonly rest = new THREE.Vector3();
  private readonly stand = new THREE.Vector3();
  private standYaw = 0;
  private persisted = false;

  // helpers
  private ui: StationUi | null = null;
  private chris: StationChris | null = null;
  private ray: PointerRay | null = null;
  private readonly tweens = new Tweens();
  private readonly flick = new FlickDetector();
  private readonly circle = new CircleAccumulator(14);
  private readonly shotShelf = new Shot();
  private readonly shotMug = new Shot();
  private readonly shotTable = new Shot();
  private readonly shotCarry = new Shot();
  private carryRefresh = 0;
  private brewLoop: ReturnType<ActivityContext['audio']['loop']> | null = null;
  private pourLoop: ReturnType<ActivityContext['audio']['loop']> | null = null;

  // play state
  private sel = 0;
  private hoverLock = 0;
  private wrongPicks = 0;
  private level = 0;
  private heldT = 0;
  private holding = false;
  private canvasHold = false;
  private fill: FillVerdict | null = null;
  private cream = 0;
  private creamResult: CoffeeRun['cream'] | null = null;
  private wipes = 0;
  private stirs = 0;
  private stirAnim = 0;
  private liquid = 0;
  private fxT = 0;
  private hintShown = false;

  // DOM
  private nameTag: WorldTag | null = null;
  private readonly tagAt = new THREE.Vector3();
  private card: HTMLElement | null = null;
  private gauge: HTMLElement | null = null;
  private liveSw: HTMLElement | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly screen = { x: 0, y: 0, visible: false };
  private readonly sphere = [] as ({ x: number; y: number; z: number; r: number } | null)[];
  private readonly beats: { left: number; fn: () => void }[] = [];
  private readonly voiceAt = new THREE.Vector3();

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.order = devOrder() ?? ctx.plan.coffeeOrder ?? 'splash';
    this.liquid = ORDER_COLOR.black;
    const f = ctx.world.fixtures;
    this.ui = new StationUi(ctx.ui.activityLayer());
    this.chris = new StationChris(ctx);
    this.ray = new PointerRay(ctx);
    ctx.pointer.enable({ virtual: 'off' });

    const probe = new SurfaceProbe(ctx.world.root);
    const machine = f.coffeeMaker.root.getWorldPosition(new THREE.Vector3());
    f.coffeeMaker.mugSpot.getWorldPosition(this.spot);
    const a = ctx.world.anchor('coffeeMaker');

    // ── mugs on the shelf ──
    this.designs = mugLineup(() => ctx.rng.next());
    const slots = f.mugShelf.slots;
    const shelfC = new THREE.Vector3();
    for (let i = 0; i < this.designs.length && i < slots.length; i++) {
      const p = slots[i]!.getWorldPosition(new THREE.Vector3());
      shelfC.add(p);
      this.slotPos.push(p);
      const m = makeMug(this.designs[i]!);
      m.root.position.copy(p);
      m.root.scale.setScalar(1e-3);
      ctx.root.add(m.root);
      this.mugs.push(m);
      this.tweens.hop(m.root, p, 0.45 + i * 0.09, 0.05, { scale: 1, back: true });
      this.sphere.push({ x: p.x + 0.02, y: p.y + 0.065, z: p.z, r: 0.1 });
    }
    if (this.slotPos.length) shelfC.multiplyScalar(1 / this.slotPos.length);
    else shelfC.set(machine.x + 0.25, machine.y + 0.55, machine.z);
    const herIdx = this.designs.indexOf(HER_MUG);
    this.sel = herIdx === 0 ? 1 : 0;

    // ── creamer / sugar on the counter beside the drip tray ──
    const counterY = (x: number, z: number) => probe.heightAt(x, z, COUNTER_H + 0.3, COUNTER_H);
    if (this.order !== 'black') {
      const c = makeProp('creamer');
      this.creamerHome.set(this.spot.x + 0.24, 0, this.spot.z + 0.08);
      this.creamerHome.y = counterY(this.creamerHome.x, this.creamerHome.z);
      c.root.position.copy(this.creamerHome);
      c.root.rotation.y = -0.4;
      c.root.visible = false;
      ctx.root.add(c.root);
      this.creamer = c;
      this.creamerPour.set(this.spot.x + 0.1, this.spot.y + 0.16, this.spot.z + 0.02);
      const s = new THREE.Mesh(
        cachedGeo('station|creamStream', () => plain().cyl(0.0055, 0.0045, 1, 8, PAL.creamPour, { at: [0, -0.5, 0] }).build()),
        modelMaterial(),
      );
      s.visible = false;
      ctx.root.add(s);
      this.stream = s;
    }
    if (this.order === 'creamSugar') {
      const j = makeProp('sugarJar');
      const x = this.spot.x - 0.2;
      const z = this.spot.z + 0.1;
      j.root.position.set(x, counterY(x, z), z);
      j.root.visible = false;
      ctx.root.add(j.root);
      this.sugarJar = j;
      const sp = makeProp('spoon');
      sp.root.visible = false;
      ctx.root.add(sp.root);
      this.spoon = sp;
    }
    const pud = new THREE.Mesh(cachedGeo('station|puddle', () => plain().cyl(0.1, 0.1, 0.004, 22, PAL.coffeeSpill, { at: [0, 0.002, 0] }).build()), modelMaterial());
    pud.position.set(this.spot.x, this.spot.y - 0.002, this.spot.z + 0.02);
    pud.scale.set(0.01, 1, 0.01);
    pud.visible = false;
    ctx.root.add(pud);
    this.puddle = pud;

    // ── where the finished mug goes (Ashley's spot) + where Chris stands to set it down ──
    this.findRestSpot(probe);

    // ── Chris beside the machine, the camera over the counter ──
    // Side-on to the counter at the right edge of the frame (we see his profile against the window; his head
    // turns to follow the mugs).
    const sx = machine.x + 1.02;
    const sz = a.z - 0.12;
    this.chris.goTo(sx, sz, yawToward(sx, sz, this.spot.x, sz - 0.35));
    this.voiceAt.set(Math.max(machine.x, shelfC.x) + 0.2, shelfC.y + 0.3, machine.z + 0.25);
    const tx = (machine.x + shelfC.x) / 2 - 0.12;
    const ty = shelfC.y - 0.2;
    this.shotShelf.look(tx, ty, machine.z + 0.04, 0.12, 0.95, 3.4, 27).apply(ctx, 2.6);
    this.shotMug.look(this.spot.x + 0.04, this.spot.y + 0.12, this.spot.z, 0.14, 0.42, 1.2, 34);

    this.nameTag = this.ui.tag(this.tagAt, '', true);
    this.nameTag.el.appendChild(h('span', 'bhd-st-label', ''));
    this.nameTag.hidden = true;

    ctx.hud.objective = "Make Ashley's coffee — just how she likes it.";
    ctx.ui.instruction("Find Ashley's mug", "Her favourite: the sunflower mug");
    ctx.walker.character.setExpression('sleepy');
    exposeStation({ id: 'coffee', phase: () => this.phase, info: () => this.info() });
    this.setPhase('intro');
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  update(dt: number, controls: GameControls): void {
    const ctx = this.ctx;
    if (!ctx || this.finished || dt <= 0) return;
    try {
      this.step(ctx, dt, controls);
    } catch (e) {
      console.warn('[coffee] recovered from an error; finishing the chore', e);
      this.finishNow();
    }
  }

  controls(): ControlScheme | null {
    switch (this.phase) {
      case 'pick':
        return PICK;
      case 'brew':
        return BREW;
      case 'cream':
        return this.order === 'black' ? NONE : POUR;
      case 'sugar':
        return SUGAR;
      case 'stir':
        return STIR;
      case 'wipe':
        return WIPE;
      default:
        return NONE;
    }
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    return { stars: this.stars, flags: this.stars === 3 ? ['coffee:perfect'] : [] };
  }

  skip(): void {
    if (this.finished || !this.ctx) return;
    this.finishNow();
  }

  dispose(): void {
    const ctx = this.ctx;
    exposeStation(null);
    this.stopLoops();
    if (!ctx) return;
    try {
      ctx.world.fixtures.coffeeMaker.setBrewing(false);
    } catch {
      /* ignore */
    }
    // A mug still in Chris's hand (crash path) must not stay parented to him.
    if (this.her && !this.persisted && this.her.root.parent && this.her.root.parent !== ctx.root) ctx.root.attach(this.her.root);
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    ctx.hud.objective = null;
    ctx.hud.meters = null;
    this.chris?.restore();
    this.ray?.dispose();
    ctx.walker.character.setExpression('neutral');
    this.ui?.dispose();
    this.ui = null;
  }

  // ── the chore ─────────────────────────────────────────────────────────────

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    this.ui?.clearInput();
    this.flick.reset();
  }

  private step(ctx: ActivityContext, dt: number, c: GameControls): void {
    this.phaseT += dt;
    this.tweens.update(dt);
    this.tickBeats(dt);
    this.her?.update(dt);
    const ptr = ctx.pointer;
    const taps = this.ui!.takeTaps();
    const tapped = taps.length > 0;
    const chris = ctx.walker.character;

    switch (this.phase) {
      case 'intro': {
        // Let the camera glide in before the mugs take input.
        if (this.phaseT > 1.2 && (this.chris!.arrived || this.phaseT > 2.4)) {
          this.setPhase('pick');
          ctx.ui.prompt({ text: 'Pick this mug', slot: 'primary' });
        }
        break;
      }

      case 'pick': {
        this.ray!.update();
        const hovered = ptr.active ? this.ray!.pick(this.sphere, 1.15) : -1;
        const moved = Math.abs(ptr.vx) + Math.abs(ptr.vy) > 30;
        if (hovered >= 0 && (moved || ptr.pressed) && this.hoverLock <= 0) this.sel = hovered;
        this.hoverLock = Math.max(0, this.hoverLock - dt);
        const d = this.flick.update(c.moveX, c.moveY);
        if (d === 'left' || d === 'right') {
          const n = this.mugs.length;
          this.sel = (this.sel + (d === 'right' ? 1 : -1) + n) % n;
          this.hoverLock = 0.6;
          ctx.audio.play('uiMove', { volume: 0.5 });
        }
        this.showSelection(ctx, dt);
        if (ptr.pressed) {
          this.ray!.update(true);
          const at = this.ray!.pick(this.sphere, 1.15);
          if (at >= 0) this.choose(ctx, at);
        } else if (c.primaryPressed) this.choose(ctx, this.sel);
        break;
      }

      case 'wrong': {
        this.showSelection(ctx, dt);
        if (this.phaseT > 1.25) {
          this.setPhase('pick');
          ctx.ui.prompt({ text: 'Pick this mug', slot: 'primary' });
        }
        break;
      }

      case 'toMachine':
      case 'beat':
        break;

      case 'brew': {
        this.trackCanvasHold(ptr);
        const hold = c.primary || this.canvasHold || this.ui!.held('hold');
        if (hold) {
          if (!this.holding) {
            this.holding = true;
            ctx.world.fixtures.coffeeMaker.setBrewing(true);
            ctx.audio.play('brewStart', { volume: 0.8 });
            chris.lookAt(this.spot);
          }
          this.level = brewStep(this.level, dt, this.heldT);
          this.heldT += dt;
          this.brewLoop ??= ctx.audio.loop('brew');
          this.brewLoop.set(0.7, 0.9 + this.level * 0.25);
          this.puffSteam(ctx, dt);
          if (this.level >= OVERFLOW) this.overflow(ctx);
        } else if (this.holding) {
          this.holding = false;
          this.heldT = 0;
          ctx.world.fixtures.coffeeMaker.setBrewing(false);
          this.brewLoop?.set(0);
          const v = fillVerdict(this.level);
          if (v === 'low') {
            if (this.level > 0.05) ctx.ui.instruction('A little more…', 'Hold to fill up to the gold line');
          } else this.brewDone(ctx, v);
        }
        this.her?.setFill(this.level);
        this.her?.setSteam(this.level > 0.15);
        if (this.gauge) setVar(this.gauge, 'value', this.level);
        break;
      }

      case 'spill': {
        if (this.puddle) {
          const k = Math.min(1.25, 0.2 + this.phaseT * 1.6);
          this.puddle.scale.set(k, 1, k * 0.85);
        }
        if (this.phaseT > 1.0) {
          this.setPhase('wipe');
          ctx.ui.instruction('Oops! Wipe it up!', `Tap ${WIPES} times`);
          ctx.ui.prompt({ text: 'Wipe', slot: 'primary' });
          this.showCard(ctx, 'wipe');
        }
        break;
      }

      case 'wipe': {
        if (c.primaryPressed || ptr.pressed || tapped) {
          this.wipes++;
          chris.play('grab', { duration: 0.35 });
          ctx.audio.play('suds', { volume: 0.7, pitch: 0.9 + this.wipes * 0.1 });
          ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.02, this.spot.z + 0.05), { count: 6, size: 0.6 });
          if (this.puddle) {
            const k = Math.max(0.01, 1.25 * (1 - this.wipes / WIPES));
            this.puddle.scale.set(k, 1, k * 0.85);
          }
          if (this.wipes >= WIPES) {
            if (this.puddle) this.puddle.visible = false;
            this.level = 0.9;
            this.her?.setFill(this.level);
            this.talk(ctx, 'Good as new.', 1.6);
            this.afterBrew(ctx);
          }
        }
        break;
      }

      case 'cream': {
        if (this.order === 'black') {
          if (this.phaseT > 1.6) this.afterCream(ctx);
          break;
        }
        this.trackCanvasHold(ptr);
        const hold = this.phaseT > 0.45 && (c.primary || this.canvasHold || this.ui!.held('hold'));
        const cr = this.creamer;
        if (hold) {
          if (!this.holding) {
            this.holding = true;
            ctx.audio.play('pour', { volume: 0.6 });
          }
          this.cream = Math.min(1, this.cream + CREAM_RATE * dt);
          this.liquid = creamColor(this.cream);
          this.her?.setLiquid(this.liquid);
          this.pourLoop ??= ctx.audio.loop('pourStream');
          this.pourLoop.set(0.6, 0.9 + this.cream * 0.3);
          if (this.cream >= 1) this.creamDone(ctx);
        } else if (this.holding) {
          this.holding = false;
          this.pourLoop?.set(0);
          const v = creamVerdict(this.cream, this.order);
          if (v === 'under') ctx.ui.instruction('A bit more cream…', 'Match the swatch — hold to pour');
          else this.creamDone(ctx);
        }
        if (cr) {
          // Lift over the mug and tip while pouring.
          const tip = this.holding ? 1.25 : 0.35;
          cr.root.rotation.z = approach(cr.root.rotation.z, tip, 10, dt);
        }
        this.updateStream(dt);
        this.updateSwatch(ctx);
        break;
      }

      case 'sugar': {
        const jar = this.sugarJar;
        let go = c.primaryPressed || tapped;
        if (ptr.pressed && jar) {
          this.ray!.update(true);
          const p = jar.root.position;
          if (this.ray!.pick([{ x: p.x, y: p.y + 0.06, z: p.z, r: 0.12 }], 1.3) === 0) go = true;
        }
        if (jar) jar.setHighlight(0.55 + 0.35 * Math.sin(this.phaseT * 6));
        if (go && this.phaseT > 0.3) this.addSugar(ctx);
        break;
      }

      case 'stir': {
        const sp = this.spoon;
        let add = 0;
        if (c.primaryPressed || tapped || ptr.pressed) add += 1;
        if (ptr.active) {
          ctx.projector.project(this.tmp.set(this.spot.x, this.spot.y + 0.1, this.spot.z), this.screen);
          if (this.screen.visible) {
            const before = this.circle.total;
            this.circle.update(ptr.x, ptr.y, this.screen.x, this.screen.y);
            if (Math.floor(this.circle.total / STIR_ANGLE) > Math.floor(before / STIR_ANGLE)) add += 1;
          }
        }
        if (add > 0 && this.phaseT > 0.25) {
          this.stirs += add;
          this.stirAnim = 1;
          ctx.audio.play('stir', { pitch: 0.95 + this.stirs * 0.08 });
          ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.12, this.spot.z), { count: 4, size: 0.5 });
          if (this.stirs >= STIRS) {
            this.talk(ctx, 'Mmm. Sweet.', 1.4);
            this.stirAnim = 0.5;
            this.setPhase('served');
          }
        }
        if (sp) this.placeSpoon(dt);
        break;
      }

      case 'served': {
        if (this.spoon && this.phaseT > 0.5 && this.spoon.root.visible) {
          this.spoon.root.visible = false;
          ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.15, this.spot.z), { count: 8 });
        } else if (this.spoon && this.spoon.root.visible) this.placeSpoon(dt);
        if (this.phaseT > 0.9) this.pickUpMug(ctx);
        break;
      }

      case 'carry': {
        const p = chris.root.position;
        this.shotCarry.look(p.x, 0.9, p.z - 0.3, 0.25, 3.3, 3.5, 44);
        this.carryRefresh -= dt;
        if (this.carryRefresh <= 0) {
          this.carryRefresh = 0.3;
          this.shotCarry.apply(ctx, 3.4);
        } else ctx.camera.rig.setGoal(this.shotCarry.goal, 3.4);
        if (this.chris!.arrived || this.phaseT > 9) this.setDown(ctx);
        break;
      }

      case 'setDown':
        break;

      case 'finale': {
        if (this.phaseT > 1.6) this.complete(ctx);
        break;
      }

      case 'done':
        break;
    }
    this.ui!.update(ctx.projector);
  }

  // ── pick ──────────────────────────────────────────────────────────────────

  private showSelection(ctx: ActivityContext, dt: number): void {
    const hint = this.wrongPicks >= 2 ? this.designs.indexOf(HER_MUG) : -1;
    for (let i = 0; i < this.mugs.length; i++) {
      const m = this.mugs[i]!;
      if (this.tweens.busy(m.root) || m === this.her) continue;
      const on = i === this.sel && this.phase === 'pick';
      const want = on ? 1 : i === hint ? 0.45 + 0.35 * Math.sin(this.phaseT * 7) : 0;
      m.setHighlight(want);
      const base = this.slotPos[i]!;
      m.root.position.y = approach(m.root.position.y, base.y + (on ? 0.022 + Math.sin(this.phaseT * 5) * 0.006 : 0), 14, dt);
    }
    const sel = this.mugs[this.sel];
    if (sel && this.nameTag && this.phase === 'pick') {
      this.tagAt.copy(this.slotPos[this.sel]!);
      this.tagAt.y -= 0.05;
      this.tagAt.z += 0.08;
      const label = this.nameTag.el.firstElementChild as HTMLElement;
      const name = MUG_NAME[this.designs[this.sel]!];
      if (label.textContent !== name) label.textContent = name;
      this.nameTag.hidden = false;
      ctx.walker.character.lookAt(this.tagAt);
    } else if (this.nameTag) this.nameTag.hidden = true;
  }

  private choose(ctx: ActivityContext, i: number): void {
    const m = this.mugs[i];
    const design = this.designs[i];
    if (!m || !design || this.tweens.busy(m.root)) return;
    this.sel = i;
    const chris = ctx.walker.character;
    if (design === HER_MUG) {
      this.her = m;
      m.setHighlight(0);
      if (this.nameTag) this.nameTag.hidden = true;
      ctx.ui.prompt(null);
      ctx.audio.play('mugPick');
      chris.play('grab', { duration: 0.5 });
      chris.setExpression('happy', 2);
      this.setPhase('toMachine');
      this.tweens.hop(m.root, this.spot, 0.6, 0.16, {
        done: () => {
          ctx.audio.play('mugPlace');
          ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.12, this.spot.z), { count: 10 });
          this.enterBrew(ctx);
        },
      });
      if (this.wrongPicks === 0) this.talk(ctx, 'The sunflower one. Obviously.', 1.8);
      return;
    }
    // Wrong mug: a gentle head-shake, the mug hops back. Costs a moment (and a little of the stars).
    this.wrongPicks++;
    ctx.audio.play('boing', { volume: 0.45, pitch: 1.2 });
    chris.play('shakeHead');
    chris.setExpression('worried', 1.4);
    this.talk(ctx, this.wrongPicks >= 2 ? "The SUNFLOWER one. Coffee first, then brain." : 'Hmm… she likes the sunflower one.', 2);
    const p = this.slotPos[i]!;
    m.setHighlight(0);
    this.tweens.hop(m.root, p, 0.55, 0.09, { spin: Math.PI * 2 });
    if (this.wrongPicks >= 2 && !this.hintShown) {
      this.hintShown = true;
      ctx.ui.instruction("Find Ashley's mug", 'Look for the yellow sunflower ✿');
    }
    this.setPhase('wrong');
  }

  // ── brew ──────────────────────────────────────────────────────────────────

  private enterBrew(ctx: ActivityContext): void {
    this.shotMug.apply(ctx, 3);
    this.voiceAt.set(this.spot.x + 0.24, this.spot.y + 0.36, this.spot.z);
    this.level = 0;
    this.her?.setFill(0);
    this.her?.setLiquid(ORDER_COLOR.black);
    this.showCard(ctx, 'brew');
    ctx.ui.instruction('Brew it!', 'Hold — let go in the gold zone');
    ctx.ui.prompt({ text: 'Hold to brew', slot: 'primary', hold: true });
    this.setPhase('brew');
  }

  private brewDone(ctx: ActivityContext, v: FillVerdict): void {
    this.fill = v;
    if (v === 'perfect') {
      ctx.audio.play('sparkle');
      ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.13, this.spot.z), { count: 12 });
      this.talk(ctx, 'Perfect fill!', 1.5, 'excited');
      ctx.rumble('light');
    } else this.talk(ctx, 'Full to the brim!', 1.5);
    this.afterBrew(ctx);
  }

  private overflow(ctx: ActivityContext): void {
    this.fill = 'overflow';
    this.holding = false;
    this.canvasHold = false;
    this.level = 1;
    ctx.world.fixtures.coffeeMaker.setBrewing(false);
    this.brewLoop?.set(0);
    ctx.audio.play('splash', { volume: 0.7, pitch: 0.8 });
    ctx.fx.burst('splash', this.tmp.set(this.spot.x, this.spot.y + 0.12, this.spot.z), { color: PAL.coffeeSpill, count: 14, speed: 0.6, size: 0.7 });
    ctx.walker.character.play('gasp');
    ctx.walker.character.setExpression('surprised', 1.5);
    this.talk(ctx, 'Whoa whoa whoa!', 1.6, 'excited');
    ctx.rumble('medium');
    if (this.puddle) this.puddle.visible = true;
    ctx.ui.prompt(null);
    this.setPhase('spill');
  }

  private afterBrew(ctx: ActivityContext): void {
    ctx.ui.prompt(null);
    this.her?.setSteam(true);
    this.enterCream(ctx);
  }

  // ── creamer / sugar / stir ────────────────────────────────────────────────

  private enterCream(ctx: ActivityContext): void {
    this.setPhase('cream');
    this.holding = false;
    this.canvasHold = false;
    if (this.order === 'black') {
      this.creamResult = 'black';
      this.clearCard();
      ctx.ui.instruction('Black. Just how she likes it.', 'No cream, no sugar — done!');
      ctx.walker.character.play('thumbsUp');
      return;
    }
    this.showCard(ctx, 'cream');
    ctx.ui.instruction('Add the creamer', `${ORDER_NAME[this.order]} — match the swatch!`);
    ctx.ui.prompt({ text: 'Hold to pour', slot: 'primary', hold: true });
    const cr = this.creamer;
    if (cr) {
      cr.root.visible = true;
      cr.root.scale.setScalar(1e-3);
      this.tweens.hop(cr.root, this.creamerPour, 0.45, 0.08, { scale: 1, back: true });
      ctx.audio.play('itemPick', { volume: 0.7 });
    }
  }

  private creamDone(ctx: ActivityContext): void {
    this.holding = false;
    this.canvasHold = false;
    this.pourLoop?.set(0);
    const v = creamVerdict(this.cream, this.order);
    this.creamResult = v === 'match' ? 'match' : 'over';
    if (v === 'match') {
      ctx.audio.play('sparkle');
      ctx.fx.burst('sparkle', this.tmp.set(this.spot.x, this.spot.y + 0.14, this.spot.z), { count: 12 });
      this.talk(ctx, "That's the one!", 1.5, 'excited');
      ctx.rumble('light');
      this.liveSw?.classList.add('is-selected');
    } else this.talk(ctx, "Extra creamy! She'll love it anyway.", 2);
    const cr = this.creamer;
    if (cr) {
      this.tweens.hop(cr.root, this.creamerHome, 0.4, 0.06);
      cr.root.rotation.z = 0;
    }
    if (this.stream) this.stream.visible = false;
    ctx.ui.prompt(null);
    this.setPhase('beat');
    this.after(0.9, () => this.afterCream(ctx));
  }

  private afterCream(ctx: ActivityContext): void {
    if (this.order === 'creamSugar') {
      this.setPhase('sugar');
      this.clearCard();
      ctx.ui.instruction('One spoon of sugar', 'Tap the sugar jar');
      ctx.ui.prompt({ text: 'Add sugar', slot: 'primary' });
      const j = this.sugarJar;
      if (j) {
        const to = j.root.position.clone();
        j.root.visible = true;
        j.root.scale.setScalar(1e-3);
        this.tweens.hop(j.root, to, 0.4, 0.05, { scale: 1, back: true });
      }
      return;
    }
    this.clearCard();
    this.setPhase('served');
  }

  private addSugar(ctx: ActivityContext): void {
    const j = this.sugarJar;
    const sp = this.spoon;
    ctx.ui.prompt(null);
    ctx.audio.play('pop');
    if (j) j.setHighlight(0);
    if (sp && j) {
      sp.root.visible = true;
      sp.root.position.set(j.root.position.x, j.root.position.y + 0.14, j.root.position.z);
      sp.root.rotation.set(0, 0, -Math.PI / 2 + 0.25);
      this.tweens.hop(sp.root, this.tmp2.set(this.spot.x, this.spot.y + 0.09, this.spot.z), 0.45, 0.1, {
        done: () => {
          ctx.fx.burst('crumb', this.tmp.set(this.spot.x, this.spot.y + 0.12, this.spot.z), { color: PAL.sugar, count: 10, size: 0.5 });
          ctx.audio.play('stir', { volume: 0.6 });
        },
      });
    }
    this.circle.reset();
    this.setPhase('stir');
    ctx.ui.instruction('Stir it!', 'Circle around the mug — or tap 3×');
    ctx.ui.prompt({ text: 'Stir', slot: 'primary' });
  }

  private placeSpoon(dt: number): void {
    const sp = this.spoon;
    if (!sp || this.tweens.busy(sp.root)) return;
    this.stirAnim = Math.max(0, this.stirAnim - dt * 1.8);
    const a = this.phaseT * 3 + (1 - this.stirAnim) * Math.PI * 4 * this.stirs;
    const r = 0.018;
    sp.root.position.set(this.spot.x + Math.cos(a) * r, this.spot.y + 0.085, this.spot.z + Math.sin(a) * r);
    sp.root.rotation.set(0, -a, -Math.PI / 2 + 0.3);
  }

  // ── carry + set down ──────────────────────────────────────────────────────

  private pickUpMug(ctx: ActivityContext): void {
    const m = this.her;
    const chris = ctx.walker.character;
    if (!m) {
      this.complete(ctx);
      return;
    }
    this.clearCard();
    ctx.ui.instruction(null);
    ctx.ui.prompt(null);
    chris.setHold('mug');
    holdIn(m, chris.socket('handR'));
    m.setSteam(true);
    ctx.audio.play('mugPick');
    chris.setExpression('happy');
    chris.lookAt(null);
    ctx.hud.objective = "Take it to Ashley's spot";
    this.chris!.walk(this.stand, this.standYaw);
    this.carryRefresh = 0;
    this.setPhase('carry');
  }

  private setDown(ctx: ActivityContext): void {
    const m = this.her;
    const chris = ctx.walker.character;
    this.setPhase('setDown');
    ctx.walker.face(this.standYaw);
    this.shotTable.apply(ctx, 2.8);
    if (!m) {
      this.complete(ctx);
      return;
    }
    chris.play('handOff', { duration: 0.6 });
    ctx.root.attach(m.root);
    m.root.rotation.set(0, 0, 0);
    this.tweens.hop(m.root, this.rest, 0.45, 0.06, {
      done: () => {
        chris.setHold('none');
        ctx.audio.play('mugPlace');
        ctx.fx.burst('heart', this.tmp.set(this.rest.x, this.rest.y + 0.2, this.rest.z), { count: 6 });
        this.persistMug(ctx);
        chris.play('thumbsUp');
        chris.setExpression('proud', 2);
        this.talk(ctx, 'For Ashley. ♥', 1.8);
        this.setPhase('finale');
      },
    });
  }

  private findRestSpot(probe: SurfaceProbe): void {
    const ctx = this.ctx!;
    const a = ctx.world.anchor('ashleySpot');
    const onFurniture = a.y > 0.3;
    // The anchor is either the spot ON the table (y = table height) or where Chris stands (y = 0): then the mug
    // goes a little in front of it, in its facing direction.
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    const mx = onFurniture ? a.x : a.x + fx * 0.42;
    const mz = onFurniture ? a.z : a.z + fz * 0.42;
    const guess = onFurniture ? a.y : TABLE_H;
    this.rest.set(mx, probe.heightAt(mx, mz, guess + 0.35, guess, 0.8), mz);
    if (!onFurniture && ctx.world.free(a.x, a.z, 0.3)) {
      this.stand.set(a.x, 0, a.z);
      this.standYaw = a.yaw;
    } else {
      const cands: [number, number][] = [
        [0.62, 0.62],
        [-0.62, 0.62],
        [0, 0.85],
        [0.85, 0],
        [-0.85, 0],
        [0.95, 0.5],
        [-0.95, 0.5],
        [0, 1.1],
        [0.62, -0.62],
        [-0.62, -0.62],
      ];
      let found = false;
      for (const [dx, dz] of cands) {
        const x = mx + dx;
        const z = mz + dz;
        if (ctx.world.free(x, z, 0.33)) {
          this.stand.set(x, 0, z);
          found = true;
          break;
        }
      }
      if (!found) this.stand.set(mx, 0, mz + 0.9);
      this.standYaw = yawToward(this.stand.x, this.stand.z, mx, mz);
    }
    // Table close-up from the side away from Chris so he never hides the mug.
    const side = this.stand.x >= mx ? -1 : 1;
    this.shotTable.look(mx - side * 0.2, this.rest.y + 0.25, mz + 0.25, side * 1.05, 1.55, 2.7, 38);
  }

  private persistMug(ctx: ActivityContext): void {
    const m = this.her;
    if (!m || this.persisted) return;
    this.persisted = true;
    m.setHighlight(0);
    m.setSteam(true);
    m.root.name = 'ashleys-coffee';
    m.root.userData.prop = m;
    m.root.userData.design = HER_MUG;
    m.root.userData.liquid = this.liquid;
    ctx.persist.attach(m.root);
    m.root.position.copy(this.rest);
    m.root.rotation.set(0, 0.35, 0);
    m.root.scale.setScalar(1);
    keepSteaming(m);
  }

  private complete(ctx: ActivityContext): void {
    if (this.finished) return;
    this.persistMug(ctx);
    const run: CoffeeRun = {
      wrongPicks: this.wrongPicks,
      fill: this.fill ?? 'brim',
      cream: this.creamResult ?? (this.order === 'black' ? 'black' : 'match'),
    };
    this.stars = coffeeStars(run);
    ctx.state.coffee = { made: true, stars: this.stars, mug: HER_MUG, liquid: this.liquid };
    if (this.stars === 3) ctx.state.flags.add('coffee:perfect');
    this.setPhase('done');
    this.finished = true;
  }

  /** Skip / error path: the finished coffee appears at Ashley's spot with the same side effects. */
  private finishNow(): void {
    const ctx = this.ctx!;
    this.tweens.flush();
    this.beats.length = 0;
    this.stopLoops();
    this.chris?.cancel();
    try {
      ctx.world.fixtures.coffeeMaker.setBrewing(false);
    } catch {
      /* ignore */
    }
    if (!this.her) {
      const idx = this.designs.indexOf(HER_MUG);
      this.her = this.mugs[idx] ?? null;
      if (!this.her) {
        this.her = makeMug(HER_MUG);
        ctx.root.add(this.her.root);
      }
    }
    if (!this.fill) this.fill = 'brim';
    if (!this.creamResult) {
      this.creamResult = this.order === 'black' ? 'black' : 'match';
      this.liquid = ORDER_COLOR[this.order];
    }
    const m = this.her;
    m.setFill(Math.max(this.level, 0.86));
    m.setLiquid(this.liquid);
    ctx.walker.character.setHold('none');
    if (m.root.parent !== ctx.root) ctx.root.attach(m.root);
    if (this.puddle) this.puddle.visible = false;
    if (this.stream) this.stream.visible = false;
    if (this.spoon) this.spoon.root.visible = false;
    this.complete(ctx);
  }

  // ── bits ──────────────────────────────────────────────────────────────────

  /** Chris's line, anchored on-screen near the station during close-ups (he stands at the frame edge). */
  private talk(ctx: ActivityContext, text: string, seconds = 2, mood: 'normal' | 'excited' = 'normal'): void {
    say(ctx, text, seconds, mood, this.phase === 'carry' || this.phase === 'setDown' || this.phase === 'finale' ? null : this.voiceAt);
  }

  private trackCanvasHold(ptr: ActivityContext['pointer']): void {
    if (ptr.pressed) this.canvasHold = true;
    if (!ptr.down) this.canvasHold = false;
  }

  private puffSteam(ctx: ActivityContext, dt: number): void {
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.4;
    ctx.fx.burst('steam', this.tmp.set(this.spot.x, this.spot.y + 0.13, this.spot.z), { count: 2, size: 0.5 });
  }

  private updateStream(dt: number): void {
    const s = this.stream;
    const cr = this.creamer;
    if (!s || !cr) return;
    const on = this.holding && cr.root.rotation.z > 0.9;
    s.visible = on;
    if (!on) return;
    // From the creamer's spout (its −X lip when tipped) down to the coffee surface.
    const top = this.tmp.set(-0.05, 0.1, 0).applyMatrix4(cr.root.matrixWorld);
    const surf = this.spot.y + 0.012 + this.level * 0.09;
    s.position.set(top.x, top.y, top.z);
    s.scale.set(1 + Math.sin(this.phaseT * 40) * 0.12, Math.max(0.01, top.y - surf), 1);
    void dt;
  }

  private updateSwatch(ctx: ActivityContext): void {
    if (!this.liveSw) return;
    const col = css(this.liquid);
    if (this.liveSw.dataset.c !== col) {
      this.liveSw.dataset.c = col;
      this.liveSw.style.setProperty('--sw', col);
    }
    const match = creamVerdict(this.cream, this.order) === 'match';
    this.liveSw.classList.toggle('is-selected', match);
    void ctx;
  }

  private showCard(ctx: ActivityContext, kind: 'brew' | 'cream' | 'wipe'): void {
    this.clearCard();
    const ui = this.ui!;
    if (kind === 'brew') {
      const card = ui.card('Fill');
      const row = h('div', 'bhd-st-gauge-row');
      const g = h('div', 'bhd-gauge');
      g.style.setProperty('--band-lo', String(BREW_BAND.lo));
      g.style.setProperty('--band-hi', String(BREW_BAND.hi));
      g.style.setProperty('--color', css(0x8a5a3a));
      setVar(g, 'value', this.level);
      row.appendChild(g);
      card.appendChild(row);
      ui.button(card, 'hold', 'bhd-st-hold', [glyph('primary', 'Hold')]);
      this.gauge = g;
      this.card = card;
    } else if (kind === 'cream') {
      const card = ui.card('Match it');
      const sws = h('div', 'bhd-st-swatches');
      const target = h('div', 'bhd-st-sw');
      const t = h('span', 'bhd-swatch');
      t.style.setProperty('--sw', css(ORDER_COLOR[this.order]));
      target.append(t, h('span', '', 'SHE LIKES'));
      const live = h('div', 'bhd-st-sw');
      const l = h('span', 'bhd-swatch');
      l.style.setProperty('--sw', css(this.liquid));
      live.append(l, h('span', '', 'NOW'));
      sws.append(target, live);
      card.append(sws, h('div', 'bhd-st-sub', ORDER_NAME[this.order]));
      ui.button(card, 'hold', 'bhd-st-hold', [glyph('primary', 'Pour')]);
      this.liveSw = l;
      this.card = card;
    } else {
      const card = ui.card('Spill!');
      ui.button(card, 'wipe', 'bhd-st-hold', [glyph('primary', 'Wipe')]);
      this.card = card;
    }
    void ctx;
  }

  private clearCard(): void {
    this.card?.remove();
    this.card = null;
    this.gauge = null;
    this.liveSw = null;
  }

  private stopLoops(): void {
    try {
      this.brewLoop?.stop();
      this.pourLoop?.stop();
    } catch {
      /* ignore */
    }
    this.brewLoop = null;
    this.pourLoop = null;
  }

  private info(): Record<string, unknown> {
    const o = { x: 0, y: 0, visible: false };
    const mugs = this.sphere.map((sp) => {
      if (!sp || !this.ctx) return null;
      this.ctx.projector.project(sp, o);
      return [Math.round(o.x), Math.round(o.y)];
    });
    return {
      screen: { mugs },
      phase: this.phase,
      order: this.order,
      designs: this.designs,
      sel: this.sel,
      wrongPicks: this.wrongPicks,
      level: +this.level.toFixed(3),
      fill: this.fill,
      cream: +this.cream.toFixed(3),
      creamResult: this.creamResult,
      stirs: this.stirs,
      wipes: this.wipes,
      stars: this.stars,
      persisted: this.persisted,
    };
  }

  /** Run `fn` after `seconds` of (unpaused) activity time. */
  private after(seconds: number, fn: () => void): void {
    this.beats.push({ left: seconds, fn });
  }

  private tickBeats(dt: number): void {
    for (let i = this.beats.length - 1; i >= 0; i--) {
      const b = this.beats[i]!;
      b.left -= dt;
      if (b.left <= 0) {
        this.beats.splice(i, 1);
        b.fn();
      }
    }
  }
}

/**
 * Keep a persisted mug's steam animating after the activity ends (nobody calls MugProp.update then): advance it
 * from the body mesh's onBeforeRender with the real frame time. Cheap and self-contained.
 */
function keepSteaming(m: MugProp): void {
  let body: THREE.Mesh | null = null;
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!body && mesh.isMesh && o.name !== 'liquid' && o.name !== 'steam' && o.name !== 'highlight') body = mesh;
  });
  if (!body) return;
  let last = -1;
  (body as THREE.Mesh).onBeforeRender = () => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = last < 0 ? 0 : Math.min(0.1, (now - last) / 1000);
    if (now !== last) m.update(dt);
    last = now;
  };
}

/** Dev/e2e only (?test=1&coffee=black|splash|creamSugar|latte): try another order without FAMILY SETUP. */
function devOrder(): CoffeeOrder | null {
  try {
    if (typeof location === 'undefined' || !/[?&]test=1/.test(location.search)) return null;
    const o = new URLSearchParams(location.search).get('coffee');
    return o === 'black' || o === 'splash' || o === 'creamSugar' || o === 'latte' ? o : null;
  } catch {
    return null;
  }
}

export const create = (): Activity => new CoffeeActivity();
