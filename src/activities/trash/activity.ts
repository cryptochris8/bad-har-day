// ─────────────────────────────────────────────────────────────────────────────
// TAKE OUT THE TRASH (docs/GDD.md §4.4) — Act I free-roam chore.
//
// "Door first — pro move": Chris props the back door open, tugs the (vacuum-sealed, obviously) bag out of the
// kitchen can and carries it to the outdoor bin at walking pace. The bag is a pendulum on his hand: hard stops,
// reversals and sharp turns build the swing (HUD meter); past the threshold something peeks out — "CATCH!" within
// 0.8 s (grab + relieved sweat drop) or a banana peel drops and must be picked up (a sigh, a moment). The door
// swings shut right as he gets to it ("Oh, come ON.") → nudge it open. The dog trots into the path once ("Sorry,
// buddy!"). At the bin: hold to wind up, release in the sweet zone → the bag arcs in (lid clunk, dust); outside the
// zone it bounces off the rim onto the ground → pick it up, try again (the zone widens). Never fails.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import { ACTS, type ActivityResult } from '../../plan/types';
import type { ControlScheme, GameControls } from '../../input/types';
import type { Meter, TaskItem } from '../../ui/types';
import type { Vec3Like } from '../../render/types';
import type { Anchor } from '../../world/types';
import { makeProp, makeTrashBag, type Prop, type TrashBagProp } from '../../props';
import { ChipBar, PromptSlot, ScriptRunner, Spots, Talk, canDom, clamp01, dist2d, firstFree, isIndoors, threshold, type Script, type Spot, type Threshold } from '../dog/roam';
import { CATCH_WINDOW, Pendulum, TOSS, arcPoint, judgeToss, pointAlong, slipThreshold, toLocalSwing, tossAccuracy, tossBand, tossCharge, trashFlags, trashStars, type Band, type TossJudge, type TrashTally } from './logic';

type Phase = 'intro' | 'pull' | 'carry' | 'toss' | 'outro' | 'done';

const SCHEME_WAIT: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: null, alt: null };
const SCHEME_PULL: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'PULL', icon: 'hand' }, secondary: null, alt: null };
const SCHEME_CARRY: ControlScheme = { move: 'xy', moveLabel: 'WALK', primary: { label: 'USE', icon: 'hand' }, secondary: null, alt: null };
const SCHEME_CATCH: ControlScheme = { move: 'xy', moveLabel: 'WALK', primary: { label: 'CATCH!', icon: 'catch' }, secondary: null, alt: null };
const SCHEME_TOSS: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'TOSS', icon: 'toss', hold: true }, secondary: null, alt: null };

const CARRY_SPEED = 1.9;
/** Act I hard end: wrap up gracefully a minute before (activities contract). */
const ACT_END = ACTS[0]!.end;
/** The bag reads a little bigger than life (and gets a soft gold rim) so it pops in the dark dollhouse view. */
const BAG_SCALE = 1.3;
const BAG_GLOW = 0.22;
/** Things on the ground to pick up glow brighter. */
const GROUND_GLOW = 0.65;
/** Metres ahead on the route where the dog may plonk itself down (first free one wins). */
const DOG_AHEAD: readonly number[] = [2.2, 2.0, 2.6, 1.6, 3.0];

interface Flight {
  from: THREE.Vector3;
  to: THREE.Vector3;
  h: number;
  t: number;
  dur: number;
  spin: number;
  onLand: () => void;
}

interface Peel {
  prop: Prop;
  spot: Spot | null;
  flight: Flight | null;
  /** Seconds until the picked-up peel vanishes into the bag (−1 = still on the ground). */
  pickT: number;
}

export class TakeOutTrash implements Activity {
  readonly id = 'trash' as const;
  private ctx!: ActivityContext;
  private phase: Phase = 'intro';
  private finished = false;
  private skipped = false;

  private readonly director = new ScriptRunner((e) => this.crash(e));
  /** Finished by the act's clock running out (the bag still makes it — just). */
  private wrapped = false;
  private talk!: Talk;
  private prompt!: PromptSlot;
  private spots!: Spots;
  private chips: ChipBar | null = null;

  // anchors
  private can!: Anchor;
  private doorIn!: Anchor;
  private door!: Threshold;
  private binA!: Anchor;
  private readonly mouth = new THREE.Vector3();

  // the bag
  private bag: TrashBagProp | null = null;
  private readonly pivot = new THREE.Group();
  private readonly swing = new Pendulum();
  private readonly lastVel = new THREE.Vector3();
  private peekNow = 0;
  private peekTarget = 0;
  private bagFlight: Flight | null = null;
  private bagSpot: Spot | null = null;
  private inHand = false;

  // events
  private tugs = 0;
  private freezeT = 0;
  private slipping = false;
  private slipT = 0;
  private slipCooldown = 1.5;
  private doorSlammed = false;
  private doorSpot: Spot | null = null;
  private binSpot: Spot | null = null;
  private readonly peels: Peel[] = [];
  private dogEvent: 'pending' | 'blocking' | 'done' = 'pending';
  private dogT = 0;
  private dogSpotAt: Vec3Like | null = null;
  private canLid = 0;
  private canLidTarget = 0;
  private canWiggle = 0;
  private binLid = 0;
  private binLidTarget = 0;

  // toss
  private tossState: 'walk' | 'ready' | 'charging' | 'thrown' = 'walk';
  private chargeT = 0;
  private charge = 0;
  private band: Band = tossBand(0);
  private gauge: HTMLElement | null = null;
  private gaugeLabel: HTMLElement | null = null;

  // tally
  private time = 0;
  private pulledAt = -1;
  private inAt = -1;
  private drops = 0;
  private saves = 0;
  private tossMisses = 0;
  private accuracy = 0;
  private walkerArrived = true;
  private walkerTok = 0;

  // presentation
  private readonly tasks: TaskItem[] = [];
  private readonly meter: Meter = { id: 'trash-swing', label: 'BAG SWING', value: 0, color: 'var(--bhd-mint)', icon: 'trash' };
  private readonly meters: Meter[] = [this.meter];
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly q1 = new THREE.Quaternion();

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.talk = new Talk(ctx.ui, ctx.audio);
    this.prompt = new PromptSlot(ctx.ui);
    this.spots = new Spots(ctx.world);
    const w = ctx.world;
    this.can = w.anchor('kitchenTrash');
    this.doorIn = w.anchor('backDoorIn');
    this.door = threshold(this.doorIn, w.anchor('backDoorOut'));
    this.binA = w.anchor('outdoorBin');
    w.fixtures.outdoorBin.mouth.getWorldPosition(this.mouth);
    this.pivot.name = 'trash:bag-pivot';

    this.tasks.push(
      { id: 'trash-pull', label: 'Pull the bag', icon: 'trash', state: 'active' },
      { id: 'trash-carry', label: 'Carry it out (steady!)', icon: 'hand', state: 'todo' },
      { id: 'trash-toss', label: 'Toss it in the bin', icon: 'star', state: 'todo' },
    );
    ctx.hud.tasks = this.tasks;
    ctx.hud.objective = 'Take the trash out to the bin on the side path.';
    ctx.hud.meters = null;
    this.chips = new ChipBar(ctx.ui.activityLayer(), [{ id: 'act', label: 'PULL', slot: 'primary' }]);
    this.chips.setVisible(false);
    this.director.start(this.introScript());
  }

  // ── lifecycle ────────────────────────────────────────────────────────────

  update(dt: number, controls: GameControls): void {
    if (this.finished || !this.ctx) return;
    try {
      this.talk.update();
      if (dt <= 0) return;
      this.tick(dt, controls);
    } catch (e) {
      this.crash(e);
    }
  }

  controls(): ControlScheme | null {
    switch (this.phase) {
      case 'pull':
        return this.tugs < 2 ? SCHEME_PULL : SCHEME_WAIT;
      case 'carry':
        return this.slipping ? SCHEME_CATCH : SCHEME_CARRY;
      case 'toss':
        return this.tossState === 'ready' || this.tossState === 'charging' ? SCHEME_TOSS : SCHEME_WAIT;
      default:
        return SCHEME_WAIT;
    }
  }

  get done(): boolean {
    return this.finished;
  }

  tally(): TrashTally {
    const start = this.pulledAt >= 0 ? this.pulledAt : 0;
    const end = this.inAt >= 0 ? this.inAt : this.time;
    return { seconds: Math.max(0, end - start), drops: this.drops, tossMisses: this.tossMisses, accuracy: this.accuracy };
  }

  result(): ActivityResult {
    if (this.skipped) return { stars: 2, flags: [] };
    if (this.wrapped) return { stars: 1, flags: ['trash:lastMinute'] };
    const t = this.tally();
    return { stars: trashStars(t), flags: trashFlags(t) };
  }

  skip(): void {
    if (this.finished || !this.ctx) return;
    const { ctx } = this;
    this.skipped = true;
    this.director.stop();
    const w = ctx.walker;
    w.teleport(w.position.x, w.position.z, w.yaw); // cancels any scripted walk
    this.removeBag();
    this.clearPeels();
    const f = ctx.world.fixtures;
    f.kitchenTrash.setBag(false);
    f.kitchenTrash.setLid(0);
    f.outdoorBin.setLid(0);
    // Never lock Chris out: if he is outside, the back door stays open.
    if (!isIndoors(ctx.world, w.position.x, w.position.z)) ctx.world.door('back').open();
    this.endState();
    this.finished = true;
    this.phase = 'done';
  }

  dispose(): void {
    if (!this.ctx) return;
    const { ctx } = this;
    this.director.stop();
    this.chips?.dispose();
    this.chips = null;
    this.gauge?.remove();
    this.gauge = null;
    this.prompt.hide();
    this.talk.closeAll();
    this.spots.clear();
    this.removeBag();
    this.clearPeels();
    const chris = ctx.family.chris;
    chris.setHold('none');
    chris.setPose('stand');
    if (!this.finished) this.endState();
    if (!this.walkerArrived) ctx.walker.teleport(ctx.walker.position.x, ctx.walker.position.z, ctx.walker.yaw);
    ctx.walker.enabled = true;
    ctx.walker.speed = 2.4;
    ctx.camera.follow(null);
    ctx.hud.tasks = null;
    ctx.hud.objective = null;
    ctx.hud.meters = null;
    ctx.ui.instruction(null);
  }

  private endState(): void {
    const { ctx } = this;
    ctx.state.trashOut = true;
    const dog = ctx.family.dog;
    if (dog.pose !== 'stand') dog.setPose('stand');
    ctx.npcs.follow(dog, ctx.family.chris.root, { distance: 1.2 });
    for (const t of this.tasks) t.state = 'done';
  }

  private crash(e: unknown): void {
    console.error('[trash] recovered from an error', e);
    if (!this.finished) this.skip();
  }

  // ── per frame ────────────────────────────────────────────────────────────

  private tick(dt: number, c: GameControls): void {
    const { ctx } = this;
    this.time += dt;
    // Only when the act can really end (the required chores are done; otherwise the clock just holds at 5:59).
    if (this.phase !== 'outro' && ctx.clock.minutes >= ACT_END - 1 && ctx.state.dogOut && ctx.state.coffee.made) {
      // Out of time: Chris hustles the bag out. Same end state as a skip, one star, a smile.
      this.talk.say(ctx.family.chris, 'Made it! …Mostly.', { seconds: 2, mood: 'excited' });
      this.skip();
      this.skipped = false;
      this.wrapped = true;
      return;
    }
    this.director.update(dt);
    const touch = ctx.input.lastDevice === 'touch';
    const chipPressed = this.chips?.takePressed('act') ?? false;
    const chipReleased = this.chips?.takeReleased('act') ?? false;
    const pressed = c.primaryPressed || chipPressed;
    const held = c.primary || (this.chips?.isDown('act') ?? false);
    const released = c.primaryReleased || chipReleased;

    if (this.freezeT > 0) {
      this.freezeT -= dt;
      if (this.freezeT <= 0 && (this.phase === 'carry' || this.phase === 'pull')) ctx.walker.enabled = this.phase === 'carry';
    }

    let chipLabel: string | null = null;
    if (this.phase === 'pull') chipLabel = this.tickPull(pressed);
    else if (this.phase === 'carry') chipLabel = this.tickCarry(dt, pressed);
    else if (this.phase === 'toss') chipLabel = this.tickToss(dt, pressed, held, released);
    else this.prompt.hide();

    if (chipLabel) this.chips?.setLabel('act', chipLabel);
    this.chips?.setVisible(!!chipLabel && !touch);
    this.chips?.setHot('act', this.slipping);

    this.tickBag(dt);
    this.tickFlights(dt);
    this.tickPeels(dt);
    this.tickLids(dt);
  }

  // ── intro + pull ─────────────────────────────────────────────────────────

  private walkChris(to: Vec3Like, faceYaw?: number, speed?: number): { until: () => boolean; max: number } {
    const tok = ++this.walkerTok;
    this.walkerArrived = false;
    void this.ctx.walker.walkTo(to, { faceYaw, speed }).then(() => {
      if (tok === this.walkerTok) this.walkerArrived = true;
    });
    return { until: () => this.walkerArrived, max: 8 };
  }

  private *introScript(): Script {
    const { ctx } = this;
    const chris = ctx.family.chris;
    const d = this.doorIn;
    ctx.walker.enabled = false;
    const p = ctx.walker.position;
    if (dist2d(p.x, p.z, this.can.x, this.can.z) > 3) {
      // Dev/e2e jump-in: start in the kitchen.
      ctx.walker.teleport(d.x, d.z, d.yaw);
      ctx.npcs.place(ctx.family.dog, { x: d.x - this.door.nx * 1.2, y: 0, z: d.z - this.door.nz * 1.2 + 0.4 }, 0);
      ctx.npcs.follow(ctx.family.dog, chris.root, { distance: 1.2 });
      ctx.camera.follow(null);
      ctx.camera.rig.snap();
    } else yield this.walkChris(d, d.yaw);
    ctx.walker.face(d.yaw);
    yield 0.2;
    chris.play('grab');
    yield 0.3;
    ctx.world.door('back').open();
    ctx.audio.play('doorOpen');
    this.talk.say(chris, 'Door first. Pro move.', { seconds: 2, mood: 'sleepy' });
    yield 0.7;
    yield this.walkChris(this.can, this.can.yaw);
    ctx.walker.face(this.can.yaw);
    this.phase = 'pull';
  }

  private tickPull(pressed: boolean): string | null {
    const { ctx } = this;
    if (this.tugs >= 2) {
      this.prompt.hide();
      return null;
    }
    this.prompt.show(this.tugs === 0 ? 'Pull the trash bag' : 'Pull harder!', 'primary');
    if (pressed) this.tug();
    return 'PULL';
  }

  private tug(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    const f = ctx.world.fixtures.kitchenTrash;
    this.tugs++;
    chris.play('grab');
    ctx.audio.play('trashRustle');
    if (this.tugs === 1) {
      // Vacuum-sealed, obviously.
      this.canLidTarget = 1;
      this.canWiggle = 0.5;
      chris.emote('sweat', 1.2);
      chris.setExpression('determined', 1.2);
      this.talk.say(chris, 'Hnnngh— it’s stuck!', { seconds: 1.6 });
      ctx.rumble('light');
      return;
    }
    // Pop!
    f.setBag(false);
    this.canWiggle = 0.35;
    ctx.audio.play('pop');
    ctx.fx.burst('dust', f.root.getWorldPosition(this.v1).setY(0.7), { count: 6 });
    ctx.rumble('medium');
    this.giveBag();
    this.swing.vz = -2.2; // it comes out with a little swing
    this.pulledAt = this.time;
    chris.setExpression('proud', 1.5);
    this.talk.say(chris, 'Got it!', { seconds: 1.2, mood: 'excited' });
    this.prompt.hide();
    this.tasks[0]!.state = 'done';
    this.tasks[1]!.state = 'active';
    ctx.hud.objective = 'Carry it out the back door to the bin. Easy on the turns!';
    ctx.hud.meters = this.meters;
    this.director.start(this.startCarry());
  }

  private *startCarry(): Script {
    const { ctx } = this;
    yield 0.45;
    this.canLidTarget = 0;
    ctx.audio.play('thud', { volume: 0.4, delay: 0.15 });
    this.phase = 'carry';
    ctx.walker.speed = CARRY_SPEED;
    ctx.walker.enabled = true;
    this.binSpot = this.spots.add('bin', this.binA, 'Toss the bag in the bin', { radius: 1.25 });
  }

  // ── bag in hand ──────────────────────────────────────────────────────────

  private giveBag(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    if (!this.bag) {
      this.bag = makeTrashBag();
      this.bag.root.name = 'trash:bag';
    }
    const bag = this.bag;
    chris.socket('handR').add(this.pivot);
    this.pivot.position.set(0, 0, 0);
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.add(bag.root);
    bag.root.position.copy(bag.grip.position).multiplyScalar(-BAG_SCALE);
    bag.root.rotation.set(0, 0, 0);
    bag.root.scale.setScalar(BAG_SCALE);
    bag.setHighlight(BAG_GLOW);
    chris.setHold('bag');
    this.inHand = true;
    this.lastVel.copy(ctx.walker.velocity);
    this.swing.reset();
    this.peekTarget = 0;
  }

  /** Move the bag from the hand into the scene (keeping its world transform) for a flight. */
  private releaseBag(): THREE.Vector3 {
    const { ctx } = this;
    const bag = this.bag!;
    const pos = bag.root.getWorldPosition(new THREE.Vector3());
    bag.root.getWorldQuaternion(this.q1);
    ctx.root.add(bag.root);
    bag.root.position.copy(pos);
    bag.root.quaternion.copy(this.q1);
    this.pivot.removeFromParent();
    ctx.family.chris.setHold('none');
    this.inHand = false;
    return pos;
  }

  private removeBag(): void {
    this.pivot.removeFromParent();
    if (this.bag) {
      this.bag.root.removeFromParent();
      this.bag.dispose();
      this.bag = null;
    }
    this.inHand = false;
  }

  private tickBag(dt: number): void {
    const bag = this.bag;
    if (!bag) return;
    // Peek eases in fast, out gently.
    const k = this.peekTarget > this.peekNow ? 1 - Math.exp(-14 * dt) : 1 - Math.exp(-6 * dt);
    this.peekNow += (this.peekTarget - this.peekNow) * k;
    bag.setPeek(this.peekNow < 0.02 ? 0 : this.peekNow);
    if (!this.inHand) return;
    const w = this.ctx.walker;
    const v = w.velocity;
    let accX = (v.x - this.lastVel.x) / dt;
    let accZ = (v.z - this.lastVel.z) / dt;
    this.lastVel.copy(v);
    if (!Number.isFinite(accX) || !Number.isFinite(accZ)) accX = accZ = 0;
    if (this.phase === 'toss') {
      // Wind-up: the bag swings back with the charge (forward = Chris's +Z).
      const back = this.tossState === 'charging' ? -1.15 * this.charge : 0;
      this.pivot.rotation.x += (-back - this.pivot.rotation.x) * (1 - Math.exp(-18 * dt));
      this.pivot.rotation.z *= 0.9;
      return;
    }
    this.swing.step(dt, accX, accZ);
    const l = toLocalSwing(this.swing.ax, this.swing.az, w.yaw);
    // Don't swing into Chris's own leg (the right hand is at local −X; inward = +X).
    const side = Math.min(l.side, 0.18);
    this.pivot.rotation.set(-l.fwd, 0, side);
  }

  // ── carrying ─────────────────────────────────────────────────────────────

  private tickCarry(dt: number, pressed: boolean): string | null {
    const { ctx } = this;
    const w = ctx.walker;
    const p = w.position;
    this.slipCooldown = Math.max(0, this.slipCooldown - dt);
    const amp = this.swing.amplitude();
    const thr = slipThreshold(this.drops);
    const r = amp / thr;
    this.meter.value = clamp01(r);
    this.meter.color = r < 0.6 ? 'var(--bhd-mint)' : r < 0.85 ? 'var(--bhd-sunshine)' : 'var(--bhd-coral)';
    this.meter.label = r < 0.6 ? 'BAG SWING' : r < 0.85 ? 'BAG SWING — EASY…' : 'BAG SWING — WHOA!';

    // The back door swings shut right as Chris gets to it (the first time).
    const door = ctx.world.door('back');
    if (!this.doorSlammed && this.inHand && door.isOpen && isIndoors(ctx.world, p.x, p.z)) {
      // Walking toward the doorway, a step away from it.
      const toX = this.door.x - p.x;
      const toZ = this.door.z - p.z;
      const d = Math.hypot(toX, toZ);
      const v = w.velocity;
      const toward = d > 1e-3 ? (v.x * toX + v.z * toZ) / d : 0;
      if (d < 0.95 && toward > 0.4) this.slamDoor();
    }
    if (this.doorSpot) this.doorSpot.enabled = !door.isOpen;

    // Something's slipping!
    if (this.slipping) {
      this.slipT -= dt;
      if (pressed) {
        this.catchIt();
        pressed = false;
      } else if (this.slipT <= 0) this.dropPeel();
    } else if (this.inHand && this.slipCooldown <= 0 && this.freezeT <= 0 && amp > thr) this.startSlip();

    this.tickDogEvent(dt);

    // Bin lid opens when Chris comes near with the bag.
    const nearBin = dist2d(p.x, p.z, this.binA.x, this.binA.z) < 2.3 && this.inHand;
    this.binLidTarget = nearBin ? 1 : 0;
    // Any peel still falling, lying there or being picked up keeps the bin waiting.
    const peelDown = this.peels.length > 0;
    if (this.binSpot) this.binSpot.enabled = this.inHand && !peelDown;
    ctx.hud.objective = peelDown ? 'Pick up the banana peel.' : !this.inHand ? 'Pick the bag back up.' : door.isOpen || !isIndoors(ctx.world, p.x, p.z) ? 'Carry it to the bin. Easy on the turns!' : 'The door! Nudge it open.';

    if (this.slipping) {
      this.prompt.show('Something’s slipping! CATCH IT!', 'primary');
      return 'CATCH!';
    }
    const spot = this.spots.update(p.x, p.z, w.enabled && this.freezeT <= 0);
    if (!spot) {
      this.prompt.hide();
      return null;
    }
    this.prompt.show(spot.label, 'primary', spot.at);
    if (pressed) this.useSpot(spot);
    return spot.id === 'bin' ? 'TOSS IT' : 'USE';
  }

  private useSpot(spot: Spot): void {
    if (spot === this.doorSpot) this.nudgeDoor();
    else if (spot === this.binSpot) this.goToss();
    else if (spot === this.bagSpot) this.pickUpBag();
    else {
      const peel = this.peels.find((pl) => pl.spot === spot);
      if (peel) this.pickUpPeel(peel);
    }
  }

  private freeze(seconds: number): void {
    const w = this.ctx.walker;
    w.enabled = false;
    this.freezeT = Math.max(this.freezeT, seconds);
  }

  private slamDoor(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    this.doorSlammed = true;
    ctx.world.door('back').close();
    ctx.audio.play('doorClose');
    ctx.audio.play('thud', { delay: 0.12, volume: 0.7 });
    ctx.camera.rig.shake(0.18);
    ctx.walker.velocity.multiplyScalar(0.3);
    this.freeze(0.6);
    chris.play('gasp');
    chris.emote('sweat', 1.4);
    this.talk.say(chris, 'Oh, come ON.', { seconds: 1.8 });
    const at = { x: this.doorIn.x, y: 0, z: this.doorIn.z };
    this.doorSpot = this.spots.add('door', at, 'Nudge the door open', { radius: 1.25 });
  }

  private nudgeDoor(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    ctx.walker.face(this.doorIn.yaw);
    this.freeze(0.55);
    chris.play('grab');
    ctx.world.door('back').open();
    ctx.audio.play('doorOpen', { delay: 0.15 });
    this.talk.say(chris, 'Stay. Open.', { seconds: 1.4 });
    this.spots.remove(this.doorSpot);
    this.doorSpot = null;
  }

  private startSlip(): void {
    const { ctx } = this;
    this.slipping = true;
    this.slipT = CATCH_WINDOW;
    this.peekTarget = 1;
    this.bag?.setHighlight(1);
    ctx.family.chris.emote('exclaim', CATCH_WINDOW);
    ctx.audio.play('whoosh', { pitch: 1.3 });
    ctx.rumble('light');
  }

  private catchIt(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    this.slipping = false;
    this.saves++;
    this.peekTarget = 0;
    this.bag?.setHighlight(BAG_GLOW);
    this.swing.damp(0.25);
    this.slipCooldown = 2.2;
    chris.play('grab');
    chris.emote('sweat', 1.4);
    chris.setExpression('joy', 1.2);
    ctx.audio.play('pickup');
    this.talk.say(chris, this.saves > 1 ? 'Gotcha. Again.' : 'Phew! Saved it.', { seconds: 1.5 });
    ctx.rumble('light');
  }

  private dropPeel(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    this.slipping = false;
    this.drops++;
    this.peekTarget = 0;
    this.bag?.setHighlight(BAG_GLOW);
    this.swing.damp(0.3);
    this.slipCooldown = 3;
    const from = this.bag ? this.bag.root.getWorldPosition(new THREE.Vector3()) : ctx.walker.position.clone().setY(0.6);
    from.y += 0.35;
    const p = ctx.walker.position;
    // Lands a step behind Chris, on free ground.
    const bx = -Math.sin(ctx.walker.yaw);
    const bz = -Math.cos(ctx.walker.yaw);
    const land = firstFree(
      ctx.world,
      [
        { x: p.x + bx * 0.7, y: 0, z: p.z + bz * 0.7 },
        { x: p.x + bx * 0.4 + bz * 0.5, y: 0, z: p.z + bz * 0.4 - bx * 0.5 },
        { x: p.x - bz * 0.6, y: 0, z: p.z + bx * 0.6 },
      ],
      0.2,
      { x: p.x, y: 0, z: p.z },
    );
    const prop = makeProp('bananaPeel');
    prop.root.name = 'trash:banana-peel';
    prop.root.scale.setScalar(1.6);
    prop.setHighlight(GROUND_GLOW);
    ctx.root.add(prop.root);
    prop.root.position.copy(from);
    const peel: Peel = { prop, spot: null, flight: null, pickT: -1 };
    peel.flight = {
      from,
      to: new THREE.Vector3(land.x, 0.01, land.z),
      h: 0.25,
      t: 0,
      dur: 0.5,
      spin: 7,
      onLand: () => {
        ctx.audio.play('thud', { volume: 0.5 });
        ctx.fx.burst('dust', this.v2.set(land.x, 0.05, land.z), { count: 4, size: 0.7 });
        prop.root.rotation.set(0, prop.root.rotation.y, 0);
        peel.spot = this.spots.add(`peel${this.drops}`, { x: land.x, y: 0, z: land.z }, 'Pick up the banana peel', { radius: 1.05 });
      },
    };
    this.peels.push(peel);
    ctx.audio.play('boing', { volume: 0.6 });
    chris.play('shakeHead');
    this.talk.say(chris, this.drops > 1 ? '…Of course.' : '…Sigh.', { seconds: 1.5, mood: 'sleepy' });
  }

  private pickUpPeel(peel: Peel): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    this.freeze(1.25);
    ctx.walker.face(Math.atan2(peel.prop.root.position.x - ctx.walker.position.x, peel.prop.root.position.z - ctx.walker.position.z));
    chris.play('pickUpLow');
    this.spots.remove(peel.spot);
    peel.spot = null;
    peel.pickT = 0.6;
  }

  /** Picked-up peels vanish into the bag a moment into Chris's bend. */
  private tickPeels(dt: number): void {
    for (let i = this.peels.length - 1; i >= 0; i--) {
      const pl = this.peels[i]!;
      if (pl.pickT < 0) continue;
      pl.pickT -= dt;
      if (pl.pickT > 0) continue;
      pl.prop.root.removeFromParent();
      pl.prop.dispose();
      this.peels.splice(i, 1);
      this.ctx.audio.play('pickup');
      this.talk.say(this.ctx.family.chris, 'Back in you go.', { seconds: 1.3, mood: 'sleepy' });
    }
  }

  private clearPeels(): void {
    for (const pl of this.peels) {
      this.spots.remove(pl.spot);
      pl.prop.root.removeFromParent();
      pl.prop.dispose();
    }
    this.peels.length = 0;
  }

  // ── the dog wanders into the path (once) ─────────────────────────────────

  private tickDogEvent(dt: number): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    const p = ctx.walker.position;
    if (this.dogEvent === 'pending') {
      if (!this.inHand || isIndoors(ctx.world, p.x, p.z) || ctx.world.roomAt(p.x, p.z) !== 'yard') return;
      if (dist2d(p.x, p.z, this.door.x, this.door.z) < 1.4) return;
      // navPath starts at its first waypoint — measure "ahead" from where Chris stands.
      const path = [{ x: p.x, y: 0, z: p.z }, ...ctx.world.navPath({ x: p.x, y: 0, z: p.z }, this.binA)];
      this.dogEvent = 'done';
      let at: Vec3Like | null = null;
      for (const d of DOG_AHEAD) {
        const q = pointAlong(path, d);
        if (q && ctx.world.free(q.x, q.z, 0.28) && dist2d(q.x, q.z, this.binA.x, this.binA.z) > 1.2) {
          at = q;
          break;
        }
      }
      if (!at) return;
      this.dogEvent = 'blocking';
      this.dogT = 0;
      this.dogSpotAt = at;
      void ctx.npcs.walkTo(dog, at, { style: 'run', speed: 4.2 }).then(() => {
        if (this.dogEvent !== 'blocking') return;
        dog.setPose('sit');
        ctx.npcs.faceToward(dog, ctx.walker.position);
        dog.play('wag');
        dog.emote('heart', 1.2);
      });
      ctx.audio.play('dogPaws');
      ctx.audio.play('dogBarkSmall', { delay: 0.3 });
      return;
    }
    if (this.dogEvent !== 'blocking') return;
    this.dogT += dt;
    const d = dog.root.position;
    const near = dist2d(p.x, p.z, d.x, d.z);
    const speed = Math.hypot(ctx.walker.velocity.x, ctx.walker.velocity.z);
    if (near < 0.62 && speed > 0.4 && this.freezeT <= 0) {
      // Bump!
      const chris = ctx.family.chris;
      ctx.walker.velocity.set(0, 0, 0);
      this.freeze(0.9);
      chris.play('gasp');
      this.talk.say(chris, 'Whoa— sorry, buddy!', { seconds: 1.6 });
      dog.setPose('stand');
      dog.play('tilt');
      dog.emote('question', 1.2);
      ctx.audio.play('boing', { volume: 0.5 });
      ctx.audio.play('dogBarkSmall', { delay: 0.25 });
      ctx.rumble('light');
      this.endDogEvent(0.8);
      return;
    }
    // Walked around it, or waited it out.
    const at = this.dogSpotAt;
    const passed = at ? dist2d(p.x, p.z, this.binA.x, this.binA.z) + 0.4 < dist2d(at.x, at.z, this.binA.x, this.binA.z) : true;
    if (passed || this.dogT > 7) this.endDogEvent(0);
  }

  private endDogEvent(delay: number): void {
    this.dogEvent = 'done';
    this.dogSpotAt = null;
    const { ctx } = this;
    const dog = ctx.family.dog;
    const go = () => {
      if (dog.pose !== 'stand') dog.setPose('stand');
      ctx.npcs.follow(dog, ctx.family.chris.root, { distance: 1.3 });
    };
    if (delay <= 0) go();
    else void ctx.wait(delay).then(go);
  }

  // ── the toss ─────────────────────────────────────────────────────────────

  private goToss(): void {
    const { ctx } = this;
    this.phase = 'toss';
    this.tossState = 'walk';
    this.charge = 0;
    this.band = tossBand(this.tossMisses);
    ctx.walker.enabled = false;
    ctx.hud.meters = null;
    this.prompt.hide();
    // The bin's station marker would glow around Chris's feet during the close-up.
    if (this.binSpot) this.binSpot.enabled = false;
    this.spots.update(ctx.walker.position.x, ctx.walker.position.z, false);
    this.director.start(this.tossIntro());
  }

  private *tossIntro(): Script {
    const { ctx } = this;
    const b = this.binA;
    this.binLidTarget = 1;
    yield this.walkChris(b, b.yaw, 1.6);
    ctx.walker.face(b.yaw);
    // Over Chris's shoulder: from behind him (away from the bin) and a little toward the street, so the
    // recycling bin next door doesn't hide the trash bin's mouth.
    const bx = b.x - this.mouth.x;
    const bz = b.z - this.mouth.z;
    const bl = Math.hypot(bx, bz) || 1;
    const mx = (b.x + this.mouth.x) / 2;
    const mz = (b.z + this.mouth.z) / 2;
    ctx.camera.shot(
      { position: { x: b.x + (bx / bl) * 1.9, y: 2.7, z: b.z + (bz / bl) * 1.9 + 2.1 }, target: { x: mx - (bx / bl) * 0.15, y: 0.75, z: mz }, fov: 44 },
      2.6,
    );
    this.showGauge();
    yield 0.35;
    this.tossState = 'ready';
    this.tasks[1]!.state = 'done';
    this.tasks[2]!.state = 'active';
  }

  private tickToss(dt: number, pressed: boolean, held: boolean, released: boolean): string | null {
    const { ctx } = this;
    this.binLidTarget = 1;
    if (this.tossState === 'walk' || this.tossState === 'thrown') {
      this.prompt.hide();
      return null;
    }
    if (this.tossState === 'ready') {
      this.prompt.show('Hold to wind up — let go in the zone!', 'primary', null, true);
      ctx.hud.objective = 'Hold, then release in the gold zone.';
      if (pressed) {
        this.tossState = 'charging';
        this.chargeT = 0;
        ctx.audio.play('trashRustle', { volume: 0.6 });
      }
    }
    if (this.tossState === 'charging') {
      this.chargeT += dt;
      this.charge = tossCharge(this.chargeT);
      this.prompt.show('…and let go in the zone!', 'primary', null, true);
      if (released || !held) {
        if (this.chargeT < 0.12 || this.charge < TOSS.minCharge) {
          // A tap, not a throw.
          this.tossState = 'ready';
          this.charge = 0;
          this.talk.say(ctx.family.chris, 'Wind up first — hold it!', { seconds: 1.6 });
        } else this.throwBag(this.charge);
      }
    }
    this.updateGauge();
    return 'TOSS';
  }

  private throwBag(v: number): void {
    const { ctx } = this;
    const judge = judgeToss(v, this.band);
    const acc = tossAccuracy(v, this.band);
    this.tossState = 'thrown';
    this.prompt.hide();
    ctx.family.chris.play('toss', { duration: 0.75 });
    ctx.audio.play('whoosh');
    this.director.start(this.flight(judge, acc));
  }

  private *flight(judge: TossJudge, acc: number): Script {
    const { ctx } = this;
    yield 0.3;
    if (!this.bag) return;
    const from = this.releaseBag();
    let landed = false;
    const m = this.mouth;
    if (judge === 'in') {
      this.bagFlight = { from, to: new THREE.Vector3(m.x, m.y + 0.05, m.z), h: 0.85, t: 0, dur: 0.62, spin: 5, onLand: () => void (landed = true) };
      yield { until: () => landed, max: 2 };
      // …and down it goes, below the rim.
      landed = false;
      this.bagFlight = { from: new THREE.Vector3(m.x, m.y + 0.05, m.z), to: new THREE.Vector3(m.x, m.y - 0.7, m.z), h: 0, t: 0, dur: 0.22, spin: 0, onLand: () => void (landed = true) };
      yield { until: () => landed, max: 1 };
      this.bag.root.visible = false;
      this.inAt = this.time;
      this.accuracy = acc;
      ctx.audio.play('binThud');
      ctx.fx.burst('dust', m, { count: 10 });
      ctx.fx.burst('star', this.v1.copy(m).setY(m.y + 0.4), { count: acc >= 0.85 ? 10 : 5 });
      ctx.rumble('score');
      yield 0.22;
      this.binLidTarget = 0;
      yield 0.18;
      ctx.audio.play('binLid');
      ctx.state.trashOut = true;
      this.tasks[2]!.state = 'done';
      this.hideGauge();
      this.director.start(this.outro(acc));
      return;
    }
    // Rim shot: clonk off the edge, flop onto the ground beside the bin.
    const b = this.binA;
    const toward = judge === 'short' ? 0.25 : -0.15;
    const rim = new THREE.Vector3(m.x + (b.x - m.x) * toward, m.y + 0.02, m.z + (judge === 'short' ? 0.18 : -0.22));
    this.bagFlight = { from, to: rim, h: judge === 'short' ? 0.45 : 1.0, t: 0, dur: 0.5, spin: 6, onLand: () => void (landed = true) };
    yield { until: () => landed, max: 2 };
    ctx.audio.play('boing');
    ctx.audio.play('binLid', { volume: 0.5 });
    const side = judge === 'short' ? 1 : -1;
    const ground = firstFree(
      ctx.world,
      [
        { x: b.x - Math.sin(b.yaw) * 0.1 + side * 0.0, y: 0, z: b.z + side * 0.75 },
        { x: b.x + 0.35, y: 0, z: b.z - side * 0.75 },
        { x: b.x + 0.6, y: 0, z: b.z },
      ],
      0.25,
      { x: b.x + 0.6, y: 0, z: b.z },
    );
    landed = false;
    this.bagFlight = { from: rim.clone(), to: new THREE.Vector3(ground.x, 0, ground.z), h: 0.5, t: 0, dur: 0.55, spin: 4, onLand: () => void (landed = true) };
    yield { until: () => landed, max: 2 };
    this.bag.root.rotation.set(0, this.bag.root.rotation.y, 0.35);
    this.bag.setHighlight(GROUND_GLOW);
    ctx.audio.play('thud');
    ctx.fx.burst('dust', this.v1.set(ground.x, 0.05, ground.z), { count: 6 });
    this.tossMisses++;
    this.band = tossBand(this.tossMisses);
    const chris = ctx.family.chris;
    chris.play('facepalm');
    this.talk.say(chris, judge === 'short' ? 'So close!' : 'Too much arm!', { seconds: 1.6 });
    yield 0.9;
    this.hideGauge();
    this.binLidTarget = 0;
    ctx.camera.follow(null);
    this.phase = 'carry';
    this.tossState = 'walk';
    ctx.walker.enabled = true;
    ctx.hud.meters = this.meters;
    this.bagSpot =this.spots.add('bag', { x: ground.x, y: 0, z: ground.z }, 'Pick up the bag', { radius: 1.15 });
  }

  private pickUpBag(): void {
    const { ctx } = this;
    this.freeze(1.2);
    const b = this.bag;
    if (b) ctx.walker.face(Math.atan2(b.root.position.x - ctx.walker.position.x, b.root.position.z - ctx.walker.position.z));
    ctx.family.chris.play('pickUpLow');
    this.spots.remove(this.bagSpot);
    this.bagSpot = null;
    this.director.start(this.afterBagPickup());
  }

  private *afterBagPickup(): Script {
    const { ctx } = this;
    yield 0.6;
    if (this.bag) this.bag.root.visible = true;
    this.giveBag();
    ctx.audio.play('trashRustle', { volume: 0.7 });
    this.talk.say(ctx.family.chris, 'One more time.', { seconds: 1.3 });
  }

  private *outro(acc: number): Script {
    const { ctx } = this;
    const chris = ctx.family.chris;
    yield 0.2;
    chris.play(acc >= 0.85 && this.tossMisses === 0 ? 'cheer' : 'thumbsUp');
    this.talk.say(chris, acc >= 0.85 && this.tossMisses === 0 ? 'Nothing but bin!' : 'And STAY in there.', { seconds: 2, mood: 'excited' });
    ctx.audio.play('cheer', { volume: 0.5 });
    const dog = ctx.family.dog;
    if (dog.pose !== 'stand') dog.setPose('stand');
    ctx.npcs.follow(dog, chris.root, { distance: 1.2 });
    dog.play('wag');
    this.removeBag();
    yield 1.1;
    ctx.camera.follow(null);
    yield 0.9;
    this.phase = 'done';
    this.finished = true;
  }

  // ── gauge (DOM) ──────────────────────────────────────────────────────────

  private showGauge(): void {
    const layer = this.ctx.ui.activityLayer();
    if (this.gauge || !canDom(layer)) return;
    const wrap = document.createElement('div');
    wrap.className = 'bhd-panel bhd-panel--sm bhd-pop';
    wrap.style.cssText = 'position:absolute;right:calc(18px + env(safe-area-inset-right, 0px));top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 10px 8px;';
    const label = document.createElement('span');
    label.className = 'bhd-tag';
    label.textContent = 'TOSS';
    const g = document.createElement('div');
    g.className = 'bhd-gauge';
    g.style.setProperty('--color', 'var(--bhd-coral)');
    wrap.append(label, g);
    layer.appendChild(wrap);
    this.gauge = wrap;
    this.gaugeLabel = label;
    this.updateGauge();
  }

  private updateGauge(): void {
    const w = this.gauge;
    if (!w) return;
    const g = w.lastElementChild as HTMLElement | null;
    if (!g) return;
    g.style.setProperty('--value', this.charge.toFixed(3));
    g.style.setProperty('--band-lo', this.band.lo.toFixed(3));
    g.style.setProperty('--band-hi', this.band.hi.toFixed(3));
    const inZone = this.charge >= this.band.lo && this.charge <= this.band.hi;
    g.style.setProperty('--color', inZone ? 'var(--bhd-mint)' : 'var(--bhd-coral)');
    if (this.gaugeLabel) this.gaugeLabel.textContent = inZone ? 'NOW!' : 'TOSS';
  }

  private hideGauge(): void {
    this.gauge?.remove();
    this.gauge = null;
    this.gaugeLabel = null;
  }

  // ── flights, lids ────────────────────────────────────────────────────────

  private tickFlights(dt: number): void {
    const f = this.bagFlight;
    if (f && this.bag) {
      if (this.stepFlight(f, this.bag.root, dt)) {
        this.bagFlight = null;
        f.onLand();
      }
    }
    for (const pl of this.peels) {
      const pf = pl.flight;
      if (pf && this.stepFlight(pf, pl.prop.root, dt)) {
        pl.flight = null;
        pf.onLand();
      }
    }
  }

  private stepFlight(f: Flight, obj: THREE.Object3D, dt: number): boolean {
    f.t += dt;
    const u = clamp01(f.t / f.dur);
    arcPoint(f.from, f.to, f.h, u, obj.position);
    obj.rotation.x += f.spin * dt * 0.6;
    obj.rotation.z += f.spin * dt;
    if (u >= 1) {
      obj.position.copy(f.to);
      obj.rotation.x = 0;
      return true;
    }
    return false;
  }

  private tickLids(dt: number): void {
    const f = this.ctx.world.fixtures;
    // Kitchen can: lid eases, with a comic wiggle on the tug.
    this.canWiggle = Math.max(0, this.canWiggle - dt);
    const cTarget = this.canLidTarget + (this.canWiggle > 0 ? 0.12 * Math.sin(this.time * 38) : 0);
    const nc = this.canLid + (cTarget - this.canLid) * (1 - Math.exp(-12 * dt));
    if (Math.abs(nc - this.canLid) > 1e-4) {
      this.canLid = nc;
      f.kitchenTrash.setLid(clamp01(nc));
    }
    const was = this.binLid;
    const nb = this.binLid + (this.binLidTarget - this.binLid) * (1 - Math.exp(-9 * dt));
    if (Math.abs(nb - this.binLid) > 1e-4) {
      this.binLid = nb;
      f.outdoorBin.setLid(clamp01(nb));
      if (was < 0.05 && nb >= 0.05 && this.binLidTarget > 0.5) this.ctx.audio.play('binLid', { volume: 0.7 });
    }
  }
}
