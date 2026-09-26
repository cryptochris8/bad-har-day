// ACT IV — "OUT THE DOOR" (docs/GDD.md §7). 7:15 AM: the girls are dressed and waiting at the front door, each
// with an "I need my …!" — 3–5 missing things are hidden around the house (a faint sparkle, no big markers:
// searching is the game). Chris looks in hide spots, carries one thing at a time and delivers it to its owner (the
// items wear the girls' colours; colour rings show who still needs something). The dog helps when you're stuck.
// At 7:45 — or as soon as everything is delivered — Ashley leaves for work: coffee, hugs, "Love you! Have a great
// day!", "You've got this!", out the door, and her car backs down the driveway and drives off. Anything still
// missing at 7:49 "turns up" (the whole time!). Chris ends in his day clothes by the front door.
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import { DISPLAY_NAME, GIRLS, type Character, type GirlId } from '../../family/types';
import type { ControlScheme, GameControls } from '../../input/types';
import { ACTS, type ActivityResult } from '../../plan/types';
import { GIRL_COLORS, makeItem, makeMug, type Prop } from '../../props';
import { PAL } from '../../render/palette';
import type { PortraitRow, TaskItem } from '../../ui/types';
import type { Anchor, AnchorId, HideSpot, RoomId } from '../../world/types';
import {
  GlyphHint,
  HURRY_SPEED,
  Hotspots,
  HurryHint,
  TEST_HOOKS,
  testWindow,
  ScriptHost,
  Talk,
  WALK_SPEED,
  buttonScheme,
  dist2,
  freeSpotNear,
  holdProp,
  insideHouse,
  roamScheme,
  setDown,
  wearBackpack,
  yawTo,
  type Lane,
  type Step,
} from '../wake/common';
import {
  DEPART_SKIP_AFTER,
  DogHelper,
  HUG_RING,
  ITEM_ICON,
  ITEM_NAME,
  RushBook,
  THANKS,
  ashleyShouldLeave,
  bezier,
  bezierTangent,
  emptyQuip,
  foundLine,
  forwardYaw,
  LEAD_HOP,
  LEAD_WAIT,
  needLine,
  pathLength,
  pickHint,
  pointAlong,
  reverseYaw,
  rushFlags,
  rushStars,
  stepAlong,
  turnsUpLine,
  type P2,
  type RushItem,
} from './logic';

const ACT = ACTS[3]!;
const GATHER: Record<GirlId, AnchorId> = { addy: 'entryGather1', ellie: 'entryGather2', heidi: 'entryGather3' };
const CSS_COLOR: Record<GirlId, string> = { addy: 'var(--bhd-addy)', ellie: 'var(--bhd-ellie)', heidi: 'var(--bhd-heidi)' };

interface ItemRt {
  it: RushItem;
  prop: Prop;
  spot: HideSpot;
  sparkleIn: number;
  task: TaskItem;
}

interface CarAnim {
  stage: 'reverse' | 'pause' | 'forward' | 'gone';
  u: number;
  speed: number;
  t: number;
  p0: P2;
  c: P2;
  p2: P2;
  away: number;
}

type Phase = 'intro' | 'play' | 'depart' | 'finish' | 'done';

/** Ashley's friendly time cues while the rush is on. */
const TIME_CUES: readonly (readonly [number, string])[] = [
  [ACT.start + 15, 'Seven-thirty! Fifteen minutes, team!'],
  [ACT.start + 25, 'Five more minutes, my loves!'],
];

const v1 = new THREE.Vector3();
const tmpP: P2 = { x: 0, z: 0 };
const tmpT: P2 = { x: 0, z: 0 };

class RushActivity implements Activity {
  readonly id = 'rush' as const;
  private ctx: ActivityContext | null = null;
  private host!: ScriptHost;
  private talk!: Talk;
  private spots!: Hotspots;
  private hurry: HurryHint | null = null;
  private main!: Lane;
  private ashLane!: Lane;
  private dogLane!: Lane;
  private book!: RushBook;
  private items: ItemRt[] = [];
  private tasks: TaskItem[] = [];
  private phase: Phase = 'intro';
  private finished = false;
  private skipped = false;
  private busy = false;
  private playT = 0;
  private endT = -1;
  private allBeforeAshley = false;
  private ashleyGone = false;
  private dog = new DogHelper();
  private dogHinting = false;
  private lunches = false;
  private mug: THREE.Object3D | null = null;
  private mugHeld = false;
  private ashleyCarParent: THREE.Object3D | null = null;
  private car: CarAnim | null = null;
  private doorAnim = -1;
  private emptyIdx = 0;
  private thanksIdx = 0;
  private remindIn = 12;
  private cueDone = new Set<number>();
  private portraitsDirty = true;
  private attached: { root: THREE.Object3D; who: Character }[] = [];
  private readonly out = { x: 0, z: 0 };
  private useLane!: Lane;
  private instrLeft = 0;
  /** Watchdog: a pick-up / hand-off never keeps Chris busy for long (e.g. if its script was cut short). */
  private busyT = 0;
  /** Seconds into Ashley's departure (PRIMARY / tap skips it after DEPART_SKIP_AFTER). */
  private departT = 0;
  private skipHint: GlyphHint | null = null;
  private readonly lead: P2 = { x: 0, z: 0 };

  // ── lifecycle ─────────────────────────────────────────────────────────────

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.host = new ScriptHost(ctx, 'rush');
    this.talk = new Talk(ctx);
    this.spots = new Hotspots(ctx, rushWalkable);
    this.hurry = new HurryHint(ctx.ui.activityLayer());
    this.skipHint = new GlyphHint(ctx.ui.activityLayer(), 'primary', 'Skip', 'right');
    this.main = this.host.lane();
    this.ashLane = this.host.lane();
    this.dogLane = this.host.lane();
    this.useLane = this.host.lane();
    this.book = new RushBook(ctx.plan.missing);
    const { family, world, state } = ctx;

    // Chris (still in his morning hoodie until the very end).
    const chris = family.chris;
    chris.cancelAction();
    chris.setHold('none');
    chris.setPose('stand');
    chris.setSleepiness(0);
    chris.emote(null);
    ctx.walker.speed = WALK_SPEED;
    ctx.pointer.enable({ virtual: 'off', cursor: 'none' });

    // The girls "got dressed" — at the front door in their school clothes, hair done.
    for (const g of GIRLS) {
      const c = family.girl(g);
      ctx.npcs.release(c);
      c.cancelAction();
      c.setHold('none');
      c.setPose('stand');
      c.setOutfit('day');
      c.hair?.setBedhead(0);
      c.setSleepiness(0);
      c.setExpression('happy');
      c.emote(null);
      c.root.visible = true;
      ctx.npcs.placeAt(c, GATHER[g]);
      c.root.position.y = 0;
      state.girlsUp[g] = true;
    }

    // Ashley: work outfit, in the kitchen near her coffee (on the floor — never on the table top).
    const a = family.ashley;
    ctx.npcs.release(a);
    a.cancelAction();
    a.setHold('none');
    a.setPose('stand');
    a.setOutfit('day');
    a.setSleepiness(0);
    a.setExpression('happy');
    a.emote(null);
    a.root.visible = true;
    const spot = world.anchor('ashleySpot');
    freeSpotNear((x, z, r) => world.free(x, z, r), spot.x, spot.z, Math.PI / 2, this.out, [0.6, 0.8, 1.0, 1.3]);
    ctx.npcs.place(a, { x: this.out.x, y: 0, z: this.out.z }, yawTo(this.out.x, this.out.z, spot.x, spot.z));

    // Her coffee (made in Act I; a stand-in when a dev jump says it was made).
    this.mug = ctx.persist.getObjectByName('ashleys-coffee') ?? null;
    if (!this.mug && state.coffee.made) {
      const m = makeMug(state.coffee.mug ?? 'sunflower');
      m.setFill(0.7);
      m.setLiquid(state.coffee.liquid);
      m.root.name = 'ashleys-coffee';
      m.root.userData.prop = m;
      setDown(m.root, ctx.persist, spot, spot.yaw);
      this.mug = m.root;
    }

    // The dog tags along until it "helps".
    family.dog.setPose('stand');
    ctx.npcs.follow(family.dog, chris.root, { distance: 1.2 });

    // Ashley's car at home, doors shut.
    const car = world.car('ashley');
    car.root.visible = true;
    car.setDoor(0, 0);
    world.door('front').close();
    // The back door stays open all act: the backyard is one of the hide spots (keyboard / pad walk out through it).
    world.door('back').open();

    // The missing things, each tinted with its owner's colour.
    for (const it of this.book.items) {
      const hs = world.hideSpot(it.spot);
      const prop = makeItem(it.item, GIRL_COLORS[it.girl]);
      prop.root.name = `rush-item:${it.item}`;
      setDown(prop.root, ctx.root, hs.item, ctx.rng.range(-0.9, 0.9));
      const task: TaskItem = { id: `rush:${it.index}`, label: `${DISPLAY_NAME[it.girl]}’s ${ITEM_NAME[it.item]}`, icon: ITEM_ICON[it.item], state: 'todo' };
      this.items.push({ it, prop, spot: hs, sparkleIn: ctx.rng.range(0.2, 1.4), task });
      this.tasks.push(task);
    }
    ctx.hud.tasks = this.tasks;
    ctx.hud.objective = 'Find the missing things — bring each one to its owner at the front door.';

    this.addHotspots();
    this.intro();
    if (TEST_HOOKS) testWindow().__BHD_ACT__ = () => this.debugInfo();
  }

  /** ?test=1: state for the walkthrough bots. */
  private debugInfo() {
    return {
      phase: this.phase,
      busy: this.busy,
      playT: this.playT,
      carried: this.book.carried ? { item: this.book.carried.item, girl: this.book.carried.girl } : null,
      items: this.book.items.map((i) => ({ item: i.item, girl: i.girl, spot: i.spot, state: i.state })),
      ashleyGone: this.ashleyGone,
      car: this.car ? this.car.stage : null,
      departT: this.departT,
      dogHints: this.dog.hints,
      stars: this.finished ? this.result() : null,
    };
  }

  update(dt: number, controls: GameControls): void {
    if (!this.ctx || this.finished) return;
    try {
      this.step(dt, controls);
    } catch (e) {
      console.warn('[rush] update', e);
    }
  }

  controls(): ControlScheme | null {
    if (this.phase === 'depart' && !this.finished) return this.departT >= DEPART_SKIP_AFTER ? buttonScheme('SKIP', 'go') : null;
    if (this.finished || this.phase !== 'play') return null;
    // Keep the overlay steady through the short pick-up / hand-off animations (no primary meanwhile).
    return this.busy ? roamScheme(null, 'hand', true) : roamScheme(this.spots.button, this.spots.icon, true);
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    // skip() (debug / e2e autopilot) = a plausible, middle-of-the-road morning.
    if (this.skipped) return { stars: 2, flags: [] };
    const input = this.scoreInput();
    return { stars: rushStars(input), flags: rushFlags(input, { dogHints: this.dog.hints, lunches: this.lunches }) };
  }

  skip(): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    this.skipped = true;
    this.host.kill();
    this.talk.closeAll();
    this.spots.clear();
    this.hurry?.dispose();
    this.hurry = null;
    this.skipHint?.dispose();
    this.skipHint = null;
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    // Everything delivered, Ashley gone, Chris dressed by the door.
    for (const r of this.items) {
      if (r.it.state === 'hidden' || r.it.state === 'carried') r.it.state = 'delivered';
      r.task.state = 'done';
    }
    this.book.carried = null;
    this.detachAll();
    for (const r of this.items) r.prop.root.visible = false;
    this.hideLunchboxes();
    this.departNow();
    this.endPose();
    ctx.state.itemsFound = this.book.items.length;
    if (this.endT < 0) this.endT = this.playT;
    if (!this.ashleyGone) this.allBeforeAshley = true;
    this.finished = true;
    this.phase = 'done';
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.host.kill();
    this.talk.closeAll();
    this.spots.clear();
    this.hurry?.dispose();
    this.hurry = null;
    this.skipHint?.dispose();
    this.skipHint = null;
    this.detachAll();
    const { family } = ctx;
    const chris = family.chris;
    chris.cancelAction();
    chris.setHold('none');
    chris.setPose('stand');
    for (const g of GIRLS) {
      const c = family.girl(g);
      c.cancelAction();
      c.setHold('none');
    }
    const a = family.ashley;
    if (a.root.parent !== ctx.scene && this.ashleyCarParent) {
      ctx.scene.add(a.root);
      a.setPose('stand');
    }
    a.cancelAction();
    a.setHold('none');
    const car = ctx.world.car('ashley');
    car.setDoor(0, 0);
    car.setBrakeLights(false);
    ctx.npcs.follow(family.dog, chris.root, { distance: 1.2 });
    ctx.clock.mode = 'run';
    if (TEST_HOOKS) delete testWindow().__BHD_ACT__;
    this.ctx = null;
  }

  // ── per frame ─────────────────────────────────────────────────────────────

  private step(dt: number, controls: GameControls): void {
    const ctx = this.ctx!;
    this.host.tick(dt);
    this.talk.update();
    if (this.phase === 'play') this.playT += dt;
    if (this.instrLeft > 0) {
      this.instrLeft -= dt;
      if (this.instrLeft <= 0) ctx.ui.instruction(null);
    }
    if (this.busy && this.phase === 'play' && !this.useLane.running) {
      this.busyT += dt;
      if (this.busyT > 0.5) this.busy = false;
    } else this.busyT = 0;
    const cutscene = this.phase === 'intro' || this.phase === 'depart';
    ctx.clock.mode = cutscene ? 'hold' : 'run';
    ctx.walker.enabled = this.phase === 'play' && !this.busy;
    ctx.walker.speed = controls.alt ? HURRY_SPEED : WALK_SPEED;

    this.updateCar(dt);
    this.updateDoor(dt);
    this.updateItems(dt);
    let skippedNow = false;
    if (this.phase === 'depart') {
      this.departT += dt;
      const p = ctx.pointer;
      const tap = p.enabled && p.pressed && p.source !== 'virtual';
      if (dt > 0 && this.departT >= DEPART_SKIP_AFTER && (controls.primaryPressed || tap)) {
        this.skipDeparture();
        skippedNow = true; // the skipping press must not also use a hotspot this frame
      }
    }
    this.skipHint?.update(this.phase === 'depart' && this.departT >= DEPART_SKIP_AFTER, ctx.input.lastDevice);
    this.spots.update(controls, this.phase === 'play' && !this.busy && !skippedNow, this.phase === 'play');
    this.hurry?.update(this.phase === 'play', ctx.input.lastDevice);

    // Portrait taps: that girl reminds you what she needs.
    const clicks = ctx.ui.takeClicks();
    for (const id of clicks) if ((GIRLS as readonly string[]).includes(id)) this.remind(id as GirlId);

    if (this.phase !== 'play') {
      if (this.portraitsDirty) this.updatePortraits();
      return;
    }

    // The dog helps after a while without progress.
    if (this.dog.update(dt, this.book.hiddenCount > 0, !this.dogHinting && !this.busy)) this.dogHint();

    // Friendly time cues from Ashley + reminders from the girls.
    this.timeCues();
    this.remindIn -= dt;
    if (this.remindIn <= 0) {
      this.remindIn = 13 + ctx.rng.range(0, 5);
      const needy = GIRLS.filter((g) => this.book.needs(g).some((i) => i.state === 'hidden'));
      if (needy.length > 0) this.remind(needy[ctx.rng.int(0, needy.length - 1)]!);
      // The ones who are all set do a little happy wiggle while they wait.
      for (const g of GIRLS) if (this.book.needs(g).length === 0 && ctx.rng.chance(0.6)) ctx.family.girl(g).play('dance');
    }

    // Ashley leaves at 7:45 or when everything's delivered.
    if (!this.ashleyGone && ashleyShouldLeave(ctx.clock.minutes, this.book.allDone, false, this.busy)) {
      if (this.book.allDone) {
        this.allBeforeAshley = true;
        if (this.endT < 0) this.endT = this.playT;
      }
      this.depart();
      return;
    }
    if (this.ashleyGone && this.book.allDone && !this.busy) {
      if (this.endT < 0) this.endT = this.playT;
      this.finish();
      return;
    }
    // The clock's up: whatever is still missing turns up.
    if (this.ashleyGone && !this.busy && ctx.clock.minutes >= ACT.end - 1) this.finish();
    if (this.portraitsDirty) this.updatePortraits();
  }

  private updateItems(dt: number): void {
    const ctx = this.ctx!;
    const w = ctx.walker.position;
    for (const r of this.items) {
      if (r.it.state !== 'hidden') continue;
      // A faint sparkle now and then (brighter when Chris is close).
      r.sparkleIn -= dt;
      const d = Math.hypot(r.spot.item.x - w.x, r.spot.item.z - w.z);
      if (r.sparkleIn <= 0) {
        r.sparkleIn = d < 3 ? 0.9 : 1.6;
        v1.set(r.spot.item.x, r.spot.item.y + 0.18, r.spot.item.z);
        ctx.fx.burst('sparkle', v1, { count: d < 3 ? 4 : 2, size: 0.7 });
      }
      r.prop.setHighlight(d < 1.6 ? 0.35 + 0.2 * Math.sin(this.playT * 6) : 0);
    }
  }

  // ── intro ─────────────────────────────────────────────────────────────────

  private intro(): void {
    const ctx = this.ctx!;
    this.phase = 'intro';
    this.main.run(async (s) => {
      const g2 = ctx.world.anchor('entryGather2');
      ctx.camera.shot({ position: { x: g2.x + 0.4, y: 2.6, z: g2.z + 4.2 }, target: { x: g2.x + 0.2, y: 0.85, z: g2.z - 0.2 }, fov: 44 }, 3.5);
      await s.wait(0.5);
      // Poof! Dressed.
      for (const g of GIRLS) {
        const c = ctx.family.girl(g);
        c.socket('overhead').getWorldPosition(v1);
        v1.y -= 0.6;
        ctx.fx.burst('sparkle', v1, { count: 14, color: GIRL_COLORS[g] });
        c.play('hairFlip');
      }
      ctx.audio.play('pop');
      ctx.audio.play('sparkle', { delay: 0.1 });
      await s.wait(0.9);
      for (const g of GIRLS) {
        const c = ctx.family.girl(g);
        const want = this.book.wants(g).map((i) => i.item);
        if (want.length === 0) continue;
        c.play(want.length > 1 ? 'bounce' : 'point');
        this.talk.say(c, needLine(want), { style: 'shout', mood: 'excited', seconds: 3.2 });
        await s.wait(0.75);
      }
      await s.wait(0.9);
      if (ctx.state.lunches.packed) {
        const a = ctx.family.ashley;
        this.talk.say(a, 'Lunches in the backpacks!', { mood: 'excited', seconds: 2.4 });
        this.hideLunchboxes();
        this.lunches = true;
        ctx.audio.play('zipper');
        await s.wait(1.2);
      }
      this.phase = 'play';
      this.portraitsDirty = true;
      ctx.camera.follow(null);
      this.instr('Find the missing things!', 'Look around the house — they sparkle a little', 3);
    });
  }

  /** A big centred instruction for a few seconds (cleared by update, whatever script is running). */
  private instr(text: string, sub: string, seconds: number): void {
    this.ctx!.ui.instruction(text, sub);
    this.instrLeft = seconds;
  }

  private hideLunchboxes(): void {
    const ctx = this.ctx!;
    for (const g of GIRLS) {
      const lb = ctx.persist.getObjectByName(`lunchbox:${g}`);
      if (!lb || !lb.visible) continue;
      lb.getWorldPosition(v1);
      ctx.fx.burst('sparkle', v1, { count: 8 });
      lb.visible = false;
    }
  }

  // ── hotspots ──────────────────────────────────────────────────────────────

  private addHotspots(): void {
    const ctx = this.ctx!;
    for (const hs of ctx.world.hideSpots) {
      this.spots.add({
        id: `look:${hs.id}`,
        at: () => hs.stand,
        radius: 1.15,
        label: () => `Look ${hs.label}`,
        button: 'LOOK',
        icon: 'hand',
        enabled: () => this.phase === 'play' && this.book.canLook(hs.id),
        onUse: () => this.look(hs),
      });
    }
    for (const g of GIRLS) {
      const c = ctx.family.girl(g);
      const pos = { x: 0, y: 0, z: 0 };
      this.spots.add({
        id: `give:${g}`,
        at: () => {
          pos.x = c.root.position.x;
          pos.z = c.root.position.z;
          return pos;
        },
        radius: 1.25,
        label: () => {
          const it = this.book.carried;
          if (!it) return '';
          if (it.girl !== g) return `That’s ${DISPLAY_NAME[it.girl]}’s — take it to ${DISPLAY_NAME[it.girl]}`;
          return `Give ${DISPLAY_NAME[g]} her ${ITEM_NAME[it.item]}`;
        },
        // Above her speech bubbles (they sit at 'overhead').
        promptY: c.height + 1.4,
        button: 'GIVE',
        icon: 'hand',
        enabled: () => this.phase === 'play' && this.book.carried !== null,
        marker: () => (this.book.needs(g).length > 0 ? GIRL_COLORS[g] : null),
        onUse: () => this.give(g),
      });
    }
  }

  private itemRt(it: RushItem): ItemRt | undefined {
    return this.items.find((r) => r.it === it);
  }

  private look(hs: HideSpot): void {
    const ctx = this.ctx!;
    if (this.busy || !this.book.canLook(hs.id)) return;
    const res = this.book.look(hs.id);
    this.busy = true;
    const chris = ctx.family.chris;
    const w = ctx.walker.position;
    ctx.walker.face(yawTo(w.x, w.z, hs.item.x, hs.item.z));
    this.useLane.run(async (s) => {
      if (res.kind === 'found') {
        const r = this.itemRt(res.item)!;
        chris.play('pickUpLow');
        ctx.audio.play('found');
        v1.set(hs.item.x, hs.item.y + 0.2, hs.item.z);
        ctx.fx.burst('sparkle', v1, { count: 16 });
        ctx.fx.burst('star', v1, { count: 8 });
        ctx.rumble('medium');
        await s.wait(0.6);
        r.prop.setHighlight(0);
        holdProp(r.prop.root, chris, 'handR');
        this.attached.push({ root: r.prop.root, who: chris });
        chris.setHold('box');
        ctx.audio.play('itemPick');
        r.task.state = 'active';
        ctx.state.itemsFound = this.book.found;
        this.dog.progress();
        this.portraitsDirty = true;
        const name = DISPLAY_NAME[res.item.girl];
        this.talk.say(chris, foundLine(res.item.item, name, hs.id, ctx.family.dog.name), { mood: 'excited', seconds: 2.2 });
        const owner = ctx.family.girl(res.item.girl);
        owner.emote('exclaim', 1.5);
        if (this.dogHinting && ctx.family.dog) this.dogDone();
        await s.wait(0.7);
      } else {
        chris.play(this.emptyIdx % 3 === 2 ? 'facepalm' : 'shrug');
        ctx.audio.play('boing', { volume: 0.4 });
        this.talk.say(chris, emptyQuip(this.emptyIdx++ + ctx.plan.seed), { seconds: 1.9 });
        await s.wait(1.0);
      }
      this.busy = false;
    });
  }

  private give(g: GirlId): void {
    const ctx = this.ctx!;
    if (this.busy) return;
    const res = this.book.give(g);
    const c = ctx.family.girl(g);
    const chris = ctx.family.chris;
    if (res.kind === 'emptyHands') return;
    if (res.kind === 'notHers') {
      // The prompt already says whose it is: she shakes her head and points at her sister, who bounces.
      const oc = ctx.family.girl(res.owner);
      ctx.npcs.faceToward(c, oc.root.position);
      c.play('point');
      oc.emote('exclaim', 1.4);
      oc.play('bounce');
      ctx.audio.play('boing', { volume: 0.35 });
      return;
    }
    this.busy = true;
    const r = this.itemRt(res.item)!;
    const w = ctx.walker.position;
    ctx.walker.face(yawTo(w.x, w.z, c.root.position.x, c.root.position.z));
    ctx.npcs.faceToward(c, w);
    this.useLane.run(async (s) => {
      chris.play('handOff');
      await s.wait(0.5);
      chris.setHold('none');
      this.detach(r.prop.root);
      const backpack = res.item.item === 'backpack';
      if (backpack) wearBackpack(r.prop.root, c);
      else holdProp(r.prop.root, c, 'handR');
      this.attached.push({ root: r.prop.root, who: c });
      if (!backpack) c.setHold('box');
      ctx.audio.play('deliver');
      c.socket('overhead').getWorldPosition(v1);
      ctx.fx.burst('star', v1, { count: 12 });
      ctx.rumble('light');
      r.task.state = 'done';
      this.dog.progress();
      this.portraitsDirty = true;
      c.play('cheer');
      c.setExpression('joy', 1.8);
      this.talk.say(c, THANKS[this.thanksIdx++ % THANKS.length]!, { style: 'shout', mood: 'excited', seconds: 1.8 });
      await s.wait(0.9);
      if (!backpack) {
        // Tucked away (in the backpack / on her feet): a little sparkle poof.
        r.prop.root.getWorldPosition(v1);
        ctx.fx.burst('sparkle', v1, { count: 8, color: GIRL_COLORS[g] });
        ctx.audio.play(res.item.item === 'shoe' ? 'pop' : 'zipper', { volume: 0.7 });
        this.detach(r.prop.root);
        r.prop.root.visible = false;
        c.setHold('none');
      }
      if (res.girlDone) {
        await s.wait(0.3);
        c.play('jump');
        c.emote('check', 2);
        this.talk.say(c, 'I’m ready!', { style: 'shout', mood: 'excited', seconds: 1.6 });
      }
      await s.wait(0.3);
      const home = ctx.world.anchor(GATHER[g]);
      ctx.npcs.faceToward(c, { x: home.x, y: 0, z: home.z + 3 });
      this.busy = false;
    });
  }

  private detach(root: THREE.Object3D): void {
    const k = this.attached.findIndex((a) => a.root === root);
    if (k >= 0) this.attached.splice(k, 1);
    if (this.ctx) this.ctx.root.add(root);
  }

  private detachAll(): void {
    const ctx = this.ctx!;
    for (const a of this.attached) {
      ctx.root.add(a.root);
      a.root.visible = false;
    }
    this.attached.length = 0;
    if (this.mugHeld && this.mug) {
      ctx.root.add(this.mug);
      this.mug.visible = false;
      this.mugHeld = false;
    }
  }

  private remind(g: GirlId): void {
    const ctx = this.ctx!;
    const need = this.book.needs(g).map((i) => i.item);
    const c = ctx.family.girl(g);
    if (need.length === 0) {
      c.play('dance');
      return;
    }
    c.play('bounce');
    this.talk.say(c, need.length === 1 ? `My ${ITEM_NAME[need[0]!]}!` : needLine(need), { mood: 'excited', seconds: 2 });
  }

  private timeCues(): void {
    const ctx = this.ctx!;
    const m = ctx.clock.minutes;
    const a = ctx.family.ashley;
    for (let i = 0; i < TIME_CUES.length; i++) {
      const [at, text] = TIME_CUES[i]!;
      if (m >= at && !this.cueDone.has(i)) {
        this.cueDone.add(i);
        if (this.book.allDone) continue;
        this.talk.say(a, text, { style: 'shout', mood: 'excited', seconds: 2.4 });
        a.play('checkWatch');
      }
    }
  }

  private updatePortraits(): void {
    const ctx = this.ctx!;
    this.portraitsDirty = false;
    if (this.phase !== 'play') {
      ctx.ui.portraits(null);
      return;
    }
    const row: PortraitRow = {
      items: GIRLS.map((g) => {
        const wants = this.book.wants(g);
        const needs = this.book.needs(g);
        const done = wants.length - needs.length;
        return {
          id: g,
          name: DISPLAY_NAME[g],
          color: CSS_COLOR[g],
          progress: wants.length > 0 ? done / wants.length : 1,
          status: needs.length === 0 ? 'Ready!' : `Needs: ${needs.map((i) => ITEM_NAME[i.item]).join(', ')}`,
          badge: needs.length === 0 ? 'check' : null,
          mood: needs.length === 0 ? 'proud' : 'neutral',
        };
      }),
    };
    ctx.ui.portraits(row);
  }

  // ── the dog helps ─────────────────────────────────────────────────────────

  private dogHint(): void {
    const ctx = this.ctx!;
    const cands = this.book.undiscovered().map((it) => {
      const hs = ctx.world.hideSpot(it.spot);
      return { it, x: hs.item.x, z: hs.item.z, hs };
    });
    const w0 = ctx.walker.position;
    const pick = pickHint(cands, w0.x, w0.z);
    if (!pick) return;
    this.dogHinting = true;
    const dog = ctx.family.dog;
    const chrisPos = ctx.walker.position;
    const still = () => pick.it.state === 'hidden';
    this.dogLane.run(async (s) => {
      dog.setPose('stand');
      // 1) Trot up beside Chris (on camera), bark: "follow me!"
      const side = { x: 0, z: 0 };
      freeSpotNear((x, z, r) => ctx.world.free(x, z, r), chrisPos.x, chrisPos.z, yawTo(chrisPos.x, chrisPos.z, pick.x, pick.z), side, [0.8, 1.0, 1.2], 0.25);
      await s.walk(dog, { x: side.x, y: 0, z: side.z }, { style: 'run', speed: 3.6 });
      ctx.npcs.faceToward(dog, { x: pick.x, y: 0, z: pick.z });
      dog.play('bark');
      dog.emote('exclaim', 1.4);
      ctx.audio.play('dogBark');
      this.talk.woof(dog.socket('overhead'), 'Woof! (follow me!)', 2);
      await s.wait(1.0);
      // 2) Lead the way in short hops, waiting (and barking) until Chris catches up.
      const dig = { x: 0, z: 0 };
      freeSpotNear((x, z, r) => ctx.world.free(x, z, r), pick.x, pick.z, yawTo(pick.x, pick.z, pick.hs.stand.x, pick.hs.stand.z), dig, [0.35, 0.55, 0.8, 1.0], 0.25);
      for (let hop = 0; hop < 14 && still(); hop++) {
        const dp = dog.root.position;
        const path = ctx.world.navPath({ x: dp.x, y: 0, z: dp.z }, { x: dig.x, y: 0, z: dig.z });
        const remain = pathLength(path);
        if (remain < 0.4) break;
        pointAlong(path, Math.min(LEAD_HOP, remain), this.lead);
        await s.walk(dog, { x: this.lead.x, y: 0, z: this.lead.z }, { style: 'run', speed: 2.8 });
        if (remain <= LEAD_HOP) break;
        for (let k = 0; k < 4 && still() && dist2(chrisPos, dog.root.position) > LEAD_WAIT; k++) {
          ctx.npcs.faceToward(dog, chrisPos);
          dog.play('bark');
          ctx.audio.play('dogBarkSmall', { volume: 0.8 });
          await s.until(() => !still() || dist2(chrisPos, dog.root.position) <= LEAD_WAIT, 1.8);
        }
      }
      // 3) There: dig + bark until Chris finds it (or gives up for now).
      ctx.npcs.faceToward(dog, { x: pick.x, y: 0, z: pick.z });
      for (let k = 0; k < 6 && still(); k++) {
        dog.play(k % 2 === 0 ? 'dig' : 'bark');
        dog.emote('exclaim', 1.2);
        ctx.audio.play(k % 2 === 0 ? 'dogPaws' : 'dogBark', { volume: 0.8 });
        v1.set(pick.x, pick.hs.item.y + 0.2, pick.z);
        ctx.fx.burst('sparkle', v1, { count: 6 });
        if (k === 0) this.talk.woof(dog.socket('overhead'), 'Woof! (right here!)', 2);
        await s.wait(1.6);
      }
      this.dogDone();
    });
  }

  private dogDone(): void {
    const ctx = this.ctx!;
    this.dogHinting = false;
    this.dogLane.stop();
    ctx.npcs.follow(ctx.family.dog, ctx.family.chris.root, { distance: 1.2 });
  }

  // ── Ashley leaves for work ────────────────────────────────────────────────

  /** Ashley leaves for work (~18 s, skippable with PRIMARY / a tap): coffee, a group hug, out the door, off she drives. */
  private depart(): void {
    const ctx = this.ctx!;
    this.phase = 'depart';
    this.departT = 0;
    this.portraitsDirty = true;
    this.spots.cancelWalk();
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    this.instrLeft = 0;
    if (this.dogHinting) this.dogDone();
    const a = ctx.family.ashley;
    const chris = ctx.family.chris;
    ctx.hud.objective = 'Ashley’s off to work — time for hugs!';
    this.ashLane.run(async (s) => {
      ctx.camera.follow(a.root);
      a.emote('exclaim', 1.2);
      this.talk.say(a, this.book.allDone ? 'Everybody’s ready? Look at you!' : 'Oh! Look at the time!', { mood: 'excited', seconds: 1.8 });
      // Coffee for the road (she's standing right by it).
      const mug = this.mug;
      if (mug && mug.parent && mug.visible) {
        mug.getWorldPosition(v1);
        ctx.npcs.faceToward(a, v1);
        a.play('grab');
        await s.wait(0.4);
        holdProp(mug, a, 'handR');
        this.mugHeld = true;
        a.setHold('mug');
        ctx.audio.play('mugPick');
        if (ctx.state.coffee.made) {
          a.emote('heart', 1.6);
          a.socket('overhead').getWorldPosition(v1);
          ctx.fx.burst('heart', v1, { count: 8 });
          ctx.audio.play('heart');
        }
      }
      // A group hug in front of the girls, on the door side; Chris steps in behind them.
      const hug = this.hugSpot();
      const behind = this.behindGirls();
      void ctx.walker.walkTo({ x: behind.x, y: 0, z: behind.z }, { speed: 3, faceYaw: 0 });
      const walking = s.walk(a, { x: hug.x, y: 0, z: hug.z }, { speed: 3.1, faceYaw: Math.PI });
      walking.catch(() => undefined); // if skipped before we await it, its Cancelled must not go unhandled
      await s.until(() => dist2(a.root.position, { x: hug.x, y: 0, z: hug.z }) < 3.2, 8);
      GIRLS.forEach((g, gi) => {
        const o = HUG_RING[gi]!;
        const c = ctx.family.girl(g);
        c.cancelAction();
        c.setHold('none');
        void ctx.npcs.walkTo(c, { x: hug.x + o.x, y: 0, z: hug.z + o.z }, { speed: 2.4, faceYaw: yawTo(hug.x + o.x, hug.z + o.z, hug.x, hug.z) });
      });
      await walking;
      await s.until(() => GIRLS.every((g) => !ctx.npcs.isBusy(ctx.family.girl(g))), 2.5);
      a.play('hug', { duration: 2 });
      this.talk.say(a, 'Love you! Have a great day!', { style: 'shout', mood: 'excited', seconds: 2.4 });
      for (const g of GIRLS) {
        const c = ctx.family.girl(g);
        c.play('hug', { duration: 1.8 });
        await s.wait(0.22);
        ctx.audio.play('kiss');
        c.socket('head').getWorldPosition(v1);
        v1.y += 0.2;
        ctx.fx.burst('heart', v1, { count: 6 });
        c.setExpression('love', 1.8);
      }
      await s.wait(0.9);
      this.talk.say(ctx.family.girl(GIRLS[ctx.rng.int(0, 2)]!), 'LOVE YOU, MOM!', { style: 'shout', mood: 'excited', seconds: 1.6 });
      ctx.npcs.faceToward(a, chris.root.position);
      await s.wait(0.35);
      a.play('thumbsUp');
      this.talk.say(a, 'You’ve got this!', { mood: 'normal', seconds: 1.8 });
      await s.wait(0.35);
      chris.play('thumbsUp');
      await s.wait(0.9);
      // Out the front door (the girls wave and go back to their spots)…
      ctx.world.door('front').open();
      ctx.audio.play('doorOpen');
      for (const g of GIRLS) {
        const c = ctx.family.girl(g);
        c.play('wave');
        const home = ctx.world.anchor(GATHER[g]);
        void ctx.npcs.walkTo(c, home, { speed: 1.8, faceYaw: 0 });
      }
      await s.walk(a, ctx.world.anchor('frontDoorOut'), { speed: 2.8 });
      this.doorAnim = 0.4;
      // …cut to her car.
      await this.driveOff(s);
      this.endDeparture();
    });
  }

  /** Where Ashley stands for the group hug: in front of the girls (the door side), clear of furniture. */
  private hugSpot(): P2 {
    const ctx = this.ctx!;
    let x = 0;
    let z = -Infinity;
    for (const g of GIRLS) {
      const an = ctx.world.anchor(GATHER[g]);
      x += an.x / GIRLS.length;
      z = Math.max(z, an.z);
    }
    const out = { x, z: z + 0.75 };
    if (!ctx.world.free(out.x, out.z, 0.3)) freeSpotNear((px, pz, r) => ctx.world.free(px, pz, r), out.x, out.z, 0, out, [0.3, 0.5, 0.7]);
    return out;
  }

  /** Where Chris watches from: behind the girls (away from the door, out of Ashley's way). */
  private behindGirls(): P2 {
    const ctx = this.ctx!;
    let x = 0;
    let z = Infinity;
    for (const g of GIRLS) {
      const an = ctx.world.anchor(GATHER[g]);
      x += an.x / GIRLS.length;
      z = Math.min(z, an.z);
    }
    const out = { x, z: z - 1.2 };
    if (!ctx.world.free(out.x, out.z, 0.3)) freeSpotNear((px, pz, r) => ctx.world.free(px, pz, r), out.x, out.z, Math.PI, out, [0.3, 0.5, 0.7, 0.9]);
    return out;
  }

  private async driveOff(s: Step): Promise<void> {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    const car = ctx.world.car('ashley');
    const carA = ctx.world.anchor('ashleyCar');
    ctx.npcs.place(a, carA, carA.yaw);
    ctx.camera.follow(car.root);
    ctx.camera.snap();
    car.setDoor(0, 1);
    ctx.audio.play('carDoor');
    await s.wait(0.35);
    this.getInCar();
    await s.wait(0.2);
    car.setDoor(0, 0);
    ctx.audio.play('carDoor', { pitch: 0.9 });
    ctx.audio.play('carStart', { delay: 0.1 });
    await s.wait(0.35);
    this.startCar();
    await s.until(() => this.car === null || this.car.stage === 'gone', 10);
  }

  /** The departure is over (played out or skipped): Ashley + her car gone, everyone back, play on. */
  private endDeparture(): void {
    const ctx = this.ctx!;
    if (!this.ashleyGone) this.departNow();
    ctx.world.door('front').close();
    this.doorAnim = -1;
    for (const g of GIRLS) {
      const c = ctx.family.girl(g);
      const home = ctx.world.anchor(GATHER[g]);
      if (dist2(c.root.position, home) > 0.3 && !ctx.npcs.isBusy(c)) void ctx.npcs.walkTo(c, home, { speed: 1.8, faceYaw: 0 });
    }
    if (ctx.walker.busy) ctx.walker.teleport(ctx.walker.position.x, ctx.walker.position.z, ctx.walker.yaw);
    ctx.camera.follow(null);
    ctx.camera.snap();
    this.portraitsDirty = true;
    if (this.book.allDone) {
      this.finish(true);
      return;
    }
    this.phase = 'play';
    ctx.hud.objective = 'Still missing things — keep looking! The school run leaves at 7:50.';
    this.instr('Keep looking!', `${this.book.remaining} still missing`, 2.4);
  }

  /** PRIMARY / tap during the departure: jump to its end. */
  private skipDeparture(): void {
    const ctx = this.ctx!;
    this.ashLane.stop();
    this.talk.closeAll();
    for (const g of GIRLS) {
      const c = ctx.family.girl(g);
      c.cancelAction();
      const home = ctx.world.anchor(GATHER[g]);
      if (dist2(c.root.position, home) > 0.3) ctx.npcs.placeAt(c, GATHER[g]);
    }
    this.endDeparture();
  }

  private getInCar(): void {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    const car = ctx.world.car('ashley');
    ctx.npcs.release(a);
    if (this.mugHeld && this.mug) {
      // In the cup holder.
      ctx.root.add(this.mug);
      this.mug.visible = false;
      this.mugHeld = false;
    }
    a.setHold('none');
    a.cancelAction();
    this.ashleyCarParent = a.root.parent ?? ctx.scene;
    const seat = car.seats[0]!;
    car.root.add(a.root);
    // Ashley's little car has a low roof: sink her into the seat so her head stays under it.
    a.root.position.set(seat.x, seat.y - 0.3, seat.z);
    a.root.rotation.set(0, 0, 0);
    a.setPose('drive', { seatHeight: seat.seatHeight });
  }

  private startCar(): void {
    const ctx = this.ctx!;
    const car = ctx.world.car('ashley');
    const end = ctx.world.anchor('drivewayEnd');
    const p = car.root.position;
    const p0 = { x: p.x, z: p.z };
    // Reverse straight back, then swing the tail toward the house side into the street; drive off away from it.
    const street = { x: end.x, z: end.z + 3.2 };
    const c = { x: p0.x, z: street.z };
    car.setBrakeLights(true);
    ctx.camera.follow(car.root);
    this.car = { stage: 'reverse', u: 0, speed: 0, t: 0, p0, c, p2: street, away: 0 };
  }

  private updateCar(dt: number): void {
    const ctx = this.ctx;
    const k = this.car;
    if (!ctx || !k || dt <= 0) return;
    const car = ctx.world.car('ashley');
    const root = car.root;
    k.t += dt;
    if (k.stage === 'reverse') {
      k.speed = Math.min(4.6, k.speed + dt * 4);
      const du = stepAlong(k.p0, k.c, k.p2, k.u, k.speed * dt, tmpT);
      k.u = du;
      bezier(k.p0, k.c, k.p2, k.u, tmpP);
      bezierTangent(k.p0, k.c, k.p2, k.u, tmpT);
      root.position.x = tmpP.x;
      root.position.z = tmpP.z;
      root.rotation.y = reverseYaw(tmpT.x, tmpT.z);
      car.roll(-k.speed * dt, k.u > 0.45 ? -0.45 : 0);
      if (k.u >= 1) {
        k.stage = 'pause';
        k.t = 0;
        k.speed = 0;
        car.setBrakeLights(true);
      }
    } else if (k.stage === 'pause') {
      car.roll(0, 0);
      if (k.t > 0.3) {
        k.stage = 'forward';
        k.t = 0;
        car.setBrakeLights(false);
        ctx.audio.play('carHorn', { volume: 0.7 });
        this.talk.say(ctx.family.ashley, 'Beep beep! Bye!', { style: 'shout', mood: 'excited', seconds: 1.8 });
      }
    } else if (k.stage === 'forward') {
      k.speed = Math.min(11, k.speed + dt * 7);
      // Drive off along the street, nose away from the house (the direction the tail swung from).
      const dir = Math.sign(k.p2.x - k.c.x) || 1;
      const dx = -dir * k.speed * dt;
      root.position.x += dx;
      root.rotation.y = forwardYaw(-dir, 0);
      car.roll(k.speed * dt, 0);
      k.away += k.speed * dt;
      if (k.away > 26) k.stage = 'gone';
    }
  }

  private updateDoor(dt: number): void {
    if (this.doorAnim < 0 || !this.ctx) return;
    this.doorAnim -= dt;
    if (this.doorAnim <= 0) {
      this.doorAnim = -1;
      this.ctx.world.door('front').close();
      this.ctx.audio.play('doorClose');
    }
  }

  /** Ashley and her car are gone (hidden far away). */
  private ashleyLeaves(): void {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    const car = ctx.world.car('ashley');
    car.setBrakeLights(false);
    car.root.visible = false;
    car.root.position.set(car.root.position.x - 400, 0, car.root.position.z);
    ctx.scene.add(a.root);
    a.setPose('stand');
    a.setHold('none');
    ctx.npcs.place(a, { x: 0, y: 0, z: -60 }, 0);
    this.car = null;
    this.ashleyGone = true;
    ctx.state.ashleyLeft = true;
  }

  /** skip(): Ashley's already gone. */
  private departNow(): void {
    const ctx = this.ctx!;
    if (this.ashleyGone) return;
    const a = ctx.family.ashley;
    if (this.mugHeld && this.mug) {
      ctx.root.add(this.mug);
      this.mug.visible = false;
      this.mugHeld = false;
    } else if (this.mug && this.mug.parent === ctx.persist) {
      this.mug.visible = false;
    }
    a.cancelAction();
    a.setOutfit('day');
    ctx.world.door('front').close();
    this.doorAnim = -1;
    ctx.world.car('ashley').setDoor(0, 0);
    this.ashleyLeaves();
  }

  // ── wrap-up ───────────────────────────────────────────────────────────────

  private finish(allDelivered = false): void {
    const ctx = this.ctx!;
    if (this.phase === 'finish' && !allDelivered) return;
    this.phase = 'finish';
    this.busy = true;
    this.portraitsDirty = true;
    ctx.hud.objective = this.book.allDone ? 'Everybody’s ready — out the door we go!' : 'Time’s up — last-minute finds, then out the door!';
    this.spots.cancelWalk();
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    this.main.run(async (s) => {
      const chris = ctx.family.chris;
      const door = ctx.world.anchor('frontDoorIn');
      // Whatever Chris is carrying: he hurries it over (it WAS found — no "the whole time" joke for it).
      const carried = this.book.carried;
      if (carried) {
        await s.walkChris(door, { speed: HURRY_SPEED, faceYaw: door.yaw });
        const c = ctx.family.girl(carried.girl);
        ctx.walker.face(yawTo(chris.root.position.x, chris.root.position.z, c.root.position.x, c.root.position.z));
        chris.play('handOff');
        await s.wait(0.45);
        this.book.deliverCarried();
        const r = this.itemRt(carried);
        chris.setHold('none');
        if (r) {
          this.detach(r.prop.root);
          if (carried.item === 'backpack') {
            wearBackpack(r.prop.root, c);
            this.attached.push({ root: r.prop.root, who: c });
          } else r.prop.root.visible = false;
          r.task.state = 'done';
        }
        ctx.audio.play('deliver');
        c.socket('overhead').getWorldPosition(v1);
        ctx.fx.burst('star', v1, { count: 12 });
        c.play('cheer');
        this.talk.say(c, 'Just in time!', { style: 'shout', mood: 'excited', seconds: 1.6 });
        this.portraitsDirty = true;
        await s.wait(1.2);
      }
      const turned = this.book.turnUpAll();
      if (turned.length > 0) {
        for (const it of turned) {
          const r = this.itemRt(it);
          if (r) {
            this.detach(r.prop.root);
            r.prop.root.visible = false;
            r.task.state = 'done';
          }
        }
        for (const it of turned) {
          const c = ctx.family.girl(it.girl);
          c.play('facepalm');
          c.emote('idea', 1.6);
          const line = turnsUpLine(it.item, DISPLAY_NAME[it.girl]);
          ctx.ui.toast(line, ITEM_ICON[it.item], 3.4);
          this.talk.say(c, 'Oh! Found it!', { mood: 'excited', seconds: 1.8 });
          ctx.audio.play('found', { volume: 0.7 });
          await s.wait(2.2);
        }
      }
      // Chris: jacket, sneakers, keys — by the front door.
      await s.walkChris(door, { speed: HURRY_SPEED, faceYaw: door.yaw });
      chris.socket('overhead').getWorldPosition(v1);
      v1.y -= 0.9;
      ctx.fx.burst('sparkle', v1, { count: 16, color: PAL.chrisJacket });
      ctx.audio.play('pop');
      ctx.audio.play('zipper', { delay: 0.15 });
      chris.setOutfit('day');
      chris.play('cheer');
      this.talk.say(chris, 'Jacket. Keys. Let’s roll!', { mood: 'excited', seconds: 2.2 });
      for (const g of GIRLS) {
        const c = ctx.family.girl(g);
        ctx.npcs.faceToward(c, chris.root.position);
        c.play('cheer');
      }
      ctx.audio.play('kidsYay', { volume: 0.8, delay: 0.3 });
      await s.wait(2.2);
      this.endPose();
      this.finished = true;
      this.phase = 'done';
    });
  }

  /** The end state Act V assumes: girls in day clothes at the entry, Chris dressed by the front door. */
  private endPose(): void {
    const ctx = this.ctx!;
    for (const g of GIRLS) {
      const c = ctx.family.girl(g);
      c.setOutfit('day');
      c.hair?.setBedhead(0);
      c.cancelAction();
      c.setHold('none');
      c.setPose('stand');
      if (dist2(c.root.position, ctx.world.anchor(GATHER[g])) > 1.5) ctx.npcs.placeAt(c, GATHER[g]);
      c.root.position.y = 0;
    }
    const chris = ctx.family.chris;
    chris.setOutfit('day');
    chris.setHold('none');
    const door: Anchor = ctx.world.anchor('frontDoorIn');
    if (dist2(ctx.walker.position, door) > 1.2) ctx.walker.teleport(door.x, door.z, door.yaw);
    ctx.world.door('back').close();
    ctx.clock.mode = 'run';
    ctx.ui.portraits(null);
  }

  private scoreInput() {
    return {
      total: this.book.items.length,
      delivered: this.book.delivered,
      allBeforeAshley: this.allBeforeAshley,
      seconds: this.endT >= 0 ? this.endT : this.playT,
    };
  }
}

/** Tap-to-walk targets in Act IV: the house + the backyard (its door stays open all act). */
function rushWalkable(room: RoomId | null): boolean {
  return room === 'yard' || insideHouse(room);
}

export function createRush(): Activity {
  return new RushActivity();
}

