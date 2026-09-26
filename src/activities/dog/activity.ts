// ─────────────────────────────────────────────────────────────────────────────
// TAKE THE DOG OUT (docs/GDD.md §4.1) — Act I free-roam chore.
//
// The dog gets excited, Chris opens the back door, the dog bolts into the yard and does its seeded QUIRK
// (stares at nothing · chases a leaf · sniffs everything · zoomies · lies down and gets comfy). Its business
// happens discreetly behind the bush (sparkle + ✓, nothing else). Chris roams freely; the dog glances back now
// and then (the attention window, also a HUD meter): CALL during a glance after the business → it trots back
// inside; calling at any other moment gets a head tilt and a "?" (comedy, a tiny time cost). HOLD the treat bag
// to raise attention (sooner, longer glances; it also hurries the quirk along). Both inside → the door closes,
// happy wag, heart, and the dog follows Chris again. Never fails; quicker + fewer wasted calls = more stars.
//
// Structure: a DIRECTOR script (intro → out → return) and a dog BRAIN script (quirk → business → idle) run as
// frame-driven generators (./roam.ts ScriptRunner). The brain pauses while the dog glances back.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import { ACTS, type ActivityResult, type DogQuirk } from '../../plan/types';
import type { ControlScheme, GameControls } from '../../input/types';
import type { Meter, TaskItem } from '../../ui/types';
import type { Vec3Like } from '../../render/types';
import type { Anchor } from '../../world/types';
import type { DogAction } from '../../family/types';
import { makeProp, type Prop } from '../../props';
import { PAL } from '../../render/palette';
import { Attention, STUBBORN_TREAT_LEVEL, QUIRK_OBJECTIVE, dogFlags, dogStars, judgeCall, pickSpots, quirkHaste, type DogTally } from './logic';
import { ChipBar, PromptSlot, ScriptRunner, Talk, clamp01, dist2d, firstFree, isIndoors, smooth01, threshold, type Script, type Threshold } from './roam';

type Phase = 'intro' | 'out' | 'return' | 'done';

const SCHEME_WAIT: ControlScheme = { move: 'none', moveLabel: '', primary: null, secondary: null, alt: null };
const SCHEME_OUT: ControlScheme = {
  move: 'xy',
  moveLabel: 'WALK',
  primary: { label: 'CALL', icon: 'whistle' },
  secondary: { label: 'TREATS', icon: 'treat', hold: true },
  alt: null,
};

const CALL_LINES: readonly ((n: string) => string)[] = [(n) => `${n}! Come on, buddy!`, (n) => `${n}! Inside!`, (n) => `Here, ${n}! Let's go!`, (n) => `${n}! Breakfast time!`];
const MISS_LINES: readonly string[] = ['Selective hearing. Classic.', '…Buddy?', 'Any day now…', 'I know you can hear me.'];
const RECALL_LINES: readonly ((n: string) => string)[] = [(n) => `Good job, ${n}! Inside!`, () => "That's my buddy! In we go!", () => 'Good dog! Come on in!'];

/** The yard's far strip (m from 'yardFar' toward the camera) hides behind the big tree / swing set. */
const VISIBLE_LAWN_MARGIN = 2.2;
/** Seconds of no input before Chris checks his watch. */
const IDLE_WATCH = 6;
/** After the business, a dog that still hasn't been called in wanders back by itself (never a fail). */
const SELF_RETURN_AFTER = 40;
/** Act I hard end: wrap up gracefully a minute before (activities contract). */
const ACT_END = ACTS[0]!.end;

interface Leaf {
  prop: Prop;
  mode: 'fall' | 'rest' | 'hop' | 'mouth';
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

interface Zoom {
  cx: number;
  cz: number;
  r: number;
  ang: number;
  dir: 1 | -1;
  t: number;
  dur: number;
  flipped: boolean;
  dust: number;
}

export class DogOut implements Activity {
  readonly id = 'dog' as const;
  private ctx!: ActivityContext;
  private phase: Phase = 'intro';
  private finished = false;
  private skipped = false;

  private readonly director = new ScriptRunner((e) => this.crash(e));
  private readonly brain = new ScriptRunner((e) => this.crash(e));
  private attention!: Attention;
  private talk!: Talk;
  private prompt!: PromptSlot;
  private chips: ChipBar | null = null;
  private quirk: DogQuirk = 'sniffAll';
  private name = 'Biscuit';

  // anchors / derived spots
  private doorIn!: Anchor;
  private door!: Threshold;
  private dogInside: Vec3Like = { x: 0, y: 0, z: 0 };
  private dogWait: Vec3Like = { x: 0, y: 0, z: 0 };

  // brain state
  private glanceable = false;
  private businessDone = false;
  private inBusiness = false;
  private stubborn = 0;
  private lying = false;
  private resumeAction: DogAction | null = null;
  private resumeFace: Vec3Like | null = null;
  private reactT = 0;
  private moveTok = 0;
  private zoom: Zoom | null = null;
  private leaf: Leaf | null = null;

  // Chris / input state
  private callCooldown = 0;
  private idleT = 0;
  private watchLines = 0;
  private shakeT = 0;
  private shakeIdle = 99;
  private shakeSfx = 0;
  private treatBag: Prop | null = null;
  private lastIdea = -99;
  private walkerArrived = true;
  private walkerTok = 0;

  // tally
  private time = 0;
  private outAt = -1;
  private recallAt = -1;
  private misses = 0;
  private calls = 0;
  private callsAfterBusiness = 0;
  private usedTreats = false;
  private missLine = 0;
  private callLine = 0;
  private businessAt = -1;
  private selfReturned = false;

  // presentation
  private camHelper = new THREE.Object3D();
  private readonly tasks: TaskItem[] = [];
  private readonly meter: Meter = { id: 'dog-attention', label: 'ATTENTION', value: 0, color: 'var(--bhd-sky)', icon: 'dog' };
  private readonly meters: Meter[] = [this.meter];
  private instructionT = 0;

  // scratch vectors (no per-frame allocation)
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.quirk = ctx.plan.dogQuirk;
    this.name = ctx.family.dog.name || 'Biscuit';
    this.attention = new Attention(() => ctx.rng.next(), 2.6);
    this.talk = new Talk(ctx.ui, ctx.audio);
    this.prompt = new PromptSlot(ctx.ui);
    const w = ctx.world;
    this.doorIn = w.anchor('backDoorIn');
    this.door = threshold(this.doorIn, w.anchor('backDoorOut'));
    const d = this.door;
    const px = -d.nz;
    const pz = d.nx;
    const a = this.doorIn;
    this.dogWait = firstFree(
      w,
      [
        { x: a.x + px * 0.75 - d.nx * 0.1, y: 0, z: a.z + pz * 0.75 - d.nz * 0.1 },
        { x: a.x - px * 0.75 - d.nx * 0.1, y: 0, z: a.z - pz * 0.75 - d.nz * 0.1 },
        { x: a.x - d.nx * 0.8, y: 0, z: a.z - d.nz * 0.8 },
      ],
      0.3,
      { x: a.x - d.nx * 0.8, y: 0, z: a.z - d.nz * 0.8 },
    );
    this.dogInside = firstFree(
      w,
      [
        { x: a.x - d.nx * 0.5 + px * 0.55, y: 0, z: a.z - d.nz * 0.5 + pz * 0.55 },
        { x: a.x - d.nx * 0.6 - px * 0.55, y: 0, z: a.z - d.nz * 0.6 - pz * 0.55 },
        { x: a.x - d.nx * 1.0, y: 0, z: a.z - d.nz * 1.0 },
      ],
      0.3,
      { x: a.x - d.nx * 1.0, y: 0, z: a.z - d.nz * 1.0 },
    );

    this.tasks.push(
      { id: 'dog-out', label: `Let ${this.name} out`, icon: 'dog', state: 'active' },
      { id: 'dog-business', label: 'Business, discreetly', icon: 'sparkle', state: 'todo' },
      { id: 'dog-call', label: `Call ${this.name} back in`, icon: 'whistle', state: 'todo' },
    );
    ctx.hud.tasks = this.tasks;
    ctx.hud.objective = `${this.name} really, really needs to go out.`;
    ctx.hud.meters = null;

    this.camHelper.name = 'dog-camera-focus';
    ctx.root.add(this.camHelper);
    this.camHelper.position.copy(ctx.walker.position);
    ctx.camera.follow(this.camHelper);

    this.chips = new ChipBar(ctx.ui.activityLayer(), [
      { id: 'call', label: `CALL ${this.name.toUpperCase()}`, slot: 'primary' },
      { id: 'treat', label: 'SHAKE THE TREATS', slot: 'secondary', hold: true },
    ]);
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
    return this.phase === 'out' ? SCHEME_OUT : SCHEME_WAIT;
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    if (this.skipped) return { stars: 2, flags: [] };
    const t = this.tally();
    if (this.selfReturned) return { stars: 1, flags: ['dog:self'] };
    return { stars: dogStars(t), flags: dogFlags(t) };
  }

  tally(): DogTally {
    const end = this.recallAt >= 0 ? this.recallAt : this.time;
    const start = this.outAt >= 0 ? this.outAt : 0;
    return { quirk: this.quirk, seconds: Math.max(0, end - start), misses: this.misses, callsAfterBusiness: this.callsAfterBusiness, treats: this.usedTreats };
  }

  skip(): void {
    if (this.finished || !this.ctx) return;
    const { ctx } = this;
    this.skipped = true;
    this.director.stop();
    this.brain.stop();
    this.zoom = null;
    this.hideLeaf();
    const w = ctx.walker;
    if (!isIndoors(ctx.world, w.position.x, w.position.z)) w.teleport(this.doorIn.x, this.doorIn.z, this.doorIn.yaw);
    else w.teleport(w.position.x, w.position.z, w.yaw); // cancels any scripted walk
    this.endState();
    ctx.world.door('back').close();
    this.finished = true;
    this.phase = 'done';
  }

  dispose(): void {
    if (!this.ctx) return;
    const { ctx } = this;
    this.director.stop();
    this.brain.stop();
    this.chips?.dispose();
    this.chips = null;
    this.prompt.hide();
    this.talk.closeAll();
    this.hideLeaf();
    if (this.treatBag) {
      this.treatBag.root.removeFromParent();
      this.treatBag.dispose();
      this.treatBag = null;
    }
    const chris = ctx.family.chris;
    chris.setHold('none');
    chris.setPose('stand');
    chris.lookAt(null);
    const dog = ctx.family.dog;
    dog.lookAt(null);
    dog.setMood('calm');
    if (dog.pose !== 'stand') dog.setPose('stand');
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

  /** Dog inside next to Chris, following him again; the morning knows the dog went out. */
  private endState(): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.zoom = null;
    dog.cancelAction();
    if (dog.pose !== 'stand') dog.setPose('stand');
    const c = ctx.walker.position;
    const inside = isIndoors(ctx.world, dog.root.position.x, dog.root.position.z);
    if (!inside) ctx.npcs.place(dog, dist2d(c.x, c.z, this.doorIn.x, this.doorIn.z) < 3 ? this.dogInside : { x: c.x, y: 0, z: c.z + 0.9 }, 0);
    ctx.npcs.follow(dog, ctx.family.chris.root, { distance: 1.2 });
    ctx.state.dogOut = true;
    for (const t of this.tasks) t.state = 'done';
  }

  private crash(e: unknown): void {
    console.error('[dog] recovered from an error', e);
    if (!this.finished) this.skip();
  }

  // ── per frame ────────────────────────────────────────────────────────────

  private tick(dt: number, c: GameControls): void {
    const { ctx } = this;
    this.time += dt;
    this.callCooldown = Math.max(0, this.callCooldown - dt);
    this.director.update(dt);

    if (this.phase === 'out') this.tickOut(dt, c);
    else {
      this.prompt.hide();
      this.chips?.setVisible(false);
      this.shakeT = 0;
      this.shakeIdle += dt;
    }

    // Brain (paused while glancing back / reacting to a call).
    if (this.reactT > 0) {
      this.reactT -= dt;
      if (this.reactT <= 0) this.resume();
    }
    const pausedBrain = this.attention.open || this.reactT > 0;
    if (!pausedBrain) this.brain.update(dt, this.businessDone ? 1 : quirkHaste(this.attention.level));
    this.tickZoom(dt);
    this.tickLeaf(dt);
    this.tickTreatBag(dt);
    this.tickCamera(dt);
    if (this.instructionT > 0) {
      this.instructionT -= dt;
      if (this.instructionT <= 0) ctx.ui.instruction(null);
    }
  }

  private tickOut(dt: number, c: GameControls): void {
    const { ctx } = this;
    const chips = this.chips;
    const touch = ctx.input.lastDevice === 'touch';
    chips?.setVisible(!touch);
    const callPressed = c.primaryPressed || (chips?.takePressed('call') ?? false);
    const shaking = c.secondary || (chips?.isDown('treat') ?? false);

    // Treat bag.
    if (shaking) {
      this.shakeT += dt;
      this.shakeIdle = 0;
      this.usedTreats = true;
      if (this.shakeT < dt * 1.5) this.onShakeStart();
    } else {
      this.shakeT = 0;
      this.shakeIdle += dt;
    }

    // Attention rhythm.
    const canGlance = this.glanceable && this.reactT <= 0 && !this.zoom && !this.inBusiness;
    const ev = this.attention.update(dt, shaking, canGlance);
    if (ev === 'open') this.onGlanceOpen();
    else if (ev === 'close') this.onGlanceClose();
    if (this.lying && this.stubborn > 0 && this.attention.level >= STUBBORN_TREAT_LEVEL) this.getUp(true);

    // Calls.
    if (callPressed && this.callCooldown <= 0) this.call();
    if (this.phase !== 'out') return;
    // Safety nets: a long wait after the business, or the act's last minute.
    const waited = this.businessDone && this.businessAt >= 0 && this.time - this.businessAt > SELF_RETURN_AFTER;
    if (waited || ctx.clock.minutes >= ACT_END - 1) {
      this.selfReturn();
      return;
    }

    // Idle → Chris checks his watch.
    const moving = Math.abs(c.moveX) > 0.1 || Math.abs(c.moveY) > 0.1;
    if (moving || shaking || callPressed) this.idleT = 0;
    else {
      this.idleT += dt;
      if (this.idleT > IDLE_WATCH) {
        this.idleT = 0;
        ctx.family.chris.play('checkWatch');
        if (this.watchLines < 2) {
          this.talk.say(ctx.family.chris, this.watchLines === 0 ? 'Any time now, buddy…' : 'Tick… tock…', { mood: 'sleepy', seconds: 2.2 });
          this.watchLines++;
        }
      }
    }

    // HUD meter + chip highlight.
    const open = this.attention.open;
    this.meter.value = this.lying && this.stubborn > 0 && !open ? Math.max(this.attention.meter() * 0.6, this.attention.level) : this.attention.meter();
    this.meter.label = open ? (this.businessDone ? 'LOOKING! CALL NOW!' : 'LOOKING!') : this.lying && this.stubborn > 0 ? 'COMFY… (TREATS?)' : this.inBusiness ? 'BUSY (PRIVACY!)' : 'ATTENTION';
    this.meter.color = open ? (this.businessDone ? 'var(--bhd-mint)' : 'var(--bhd-sunshine)') : shaking ? 'var(--bhd-lilac)' : 'var(--bhd-sky)';
    chips?.setHot('call', open);
    this.prompt.hide();
  }

  // ── camera ───────────────────────────────────────────────────────────────

  private tickCamera(dt: number): void {
    const { ctx } = this;
    const c = ctx.walker.position;
    const d = ctx.family.dog.root.position;
    let tx = c.x;
    let tz = c.z;
    if (this.phase !== 'intro') {
      const sep = dist2d(c.x, c.z, d.x, d.z);
      // Frame both; when they are very far apart, favour Chris (the player).
      const k = 0.5 * (1 - smooth01((sep - 8) / 8));
      tx = c.x + (d.x - c.x) * k;
      tz = c.z + (d.z - c.z) * k;
    }
    const f = 1 - Math.exp(-3.5 * dt);
    this.camHelper.position.x += (tx - this.camHelper.position.x) * f;
    this.camHelper.position.z += (tz - this.camHelper.position.z) * f;
  }

  // ── director scripts ─────────────────────────────────────────────────────

  private walkChris(to: Vec3Like, faceYaw?: number, speed?: number): { until: () => boolean; max: number } {
    const tok = ++this.walkerTok;
    this.walkerArrived = false;
    void this.ctx.walker.walkTo(to, { faceYaw, speed }).then(() => {
      if (tok === this.walkerTok) this.walkerArrived = true;
    });
    return { until: () => this.walkerArrived, max: 9 };
  }

  private *introScript(): Script {
    const { ctx } = this;
    const chris = ctx.family.chris;
    const dog = ctx.family.dog;
    const a = this.doorIn;
    ctx.walker.enabled = false;
    const p = ctx.walker.position;
    if (dist2d(p.x, p.z, a.x, a.z) > 3) {
      // Dev/e2e jump-in: start at the back door.
      ctx.walker.teleport(a.x, a.z, a.yaw);
      ctx.npcs.place(dog, this.dogWait, a.yaw);
      this.camHelper.position.set(a.x, 0, a.z);
      ctx.camera.follow(this.camHelper);
      ctx.camera.rig.snap();
    } else yield this.walkChris(a, a.yaw);
    ctx.walker.face(a.yaw);
    void ctx.npcs.walkTo(dog, this.dogWait, { speed: 2.4, faceYaw: a.yaw });
    dog.setMood('excited');
    yield 0.25;
    dog.play('jump');
    dog.emote('exclaim', 1.2);
    ctx.audio.play('dogBarkSmall');
    ctx.audio.play('dogCollar', { delay: 0.1 });
    yield 0.5;
    this.talk.say(chris, 'Okay, okay! Out you go!', { seconds: 2 });
    dog.play('wag', { duration: 1.2 });
    yield 0.7;
    chris.play('grab');
    yield 0.3;
    ctx.world.door('back').open();
    ctx.audio.play('doorOpen');
    yield 0.4;
    // Bolt!
    ctx.audio.play('dogBark');
    ctx.audio.play('dogPaws', { delay: 0.15 });
    dog.emote(null);
    this.tasks[0]!.state = 'done';
    this.tasks[1]!.state = 'active';
    ctx.hud.objective = QUIRK_OBJECTIVE[this.quirk](this.name);
    ctx.hud.meters = this.meters;
    this.phase = 'out';
    this.outAt = this.time;
    ctx.walker.enabled = true;
    if (ctx.settings.hints) {
      ctx.ui.instruction(`CALL when ${this.name} looks back!`, 'Watch for the “!” · hold TREATS to get attention');
      this.instructionT = 4.5;
    }
    this.brain.start(this.quirkScript());
  }

  private *returnScript(): Script {
    const { ctx } = this;
    const chris = ctx.family.chris;
    const dog = ctx.family.dog;
    const a = this.doorIn;
    ctx.walker.enabled = false;
    ctx.hud.meters = null;
    this.tasks[2]!.state = 'done';
    ctx.hud.objective = `${this.name} is coming in!`;
    if (dog.pose !== 'stand') dog.setPose('stand');
    this.lying = false;
    dog.lookAt(null);
    dog.cancelAction();
    dog.play('jump');
    dog.emote('heart', 1.6);
    ctx.audio.play('dogBarkSmall');
    this.talk.say(chris, RECALL_LINES[this.callLine % RECALL_LINES.length]!(this.name), { seconds: 2.2, mood: 'excited' });
    ctx.rumble('medium');
    yield 0.55;
    let dogIn = false;
    const tok = ++this.moveTok;
    void ctx.npcs.walkTo(dog, this.dogInside, { style: 'run', speed: 4.2 }).then(() => {
      if (tok === this.moveTok) dogIn = true;
    });
    ctx.audio.play('dogPaws');
    const cp = ctx.walker.position;
    const needWalk = !isIndoors(ctx.world, cp.x, cp.z) || dist2d(cp.x, cp.z, a.x, a.z) > 0.6;
    if (needWalk) {
      yield 0.35;
      yield this.walkChris(a, a.yaw, 3.1);
    } else ctx.walker.face(a.yaw);
    yield { until: () => dogIn, max: 8 };
    // Everybody's in: close the door.
    ctx.walker.face(a.yaw);
    yield 0.25;
    chris.play('grab');
    yield 0.25;
    ctx.world.door('back').close();
    ctx.audio.play('doorClose', { delay: 0.25 });
    ctx.state.dogOut = true;
    dog.setPose('sit');
    ctx.npcs.faceToward(dog, ctx.walker.position);
    yield 0.45;
    dog.play('wag', { duration: 1.4 });
    dog.emote('heart', 1.8);
    ctx.fx.burst('heart', this.v1.set(dog.root.position.x, 0.8, dog.root.position.z), { count: 6 });
    ctx.audio.play('heart');
    ctx.family.chris.setExpression('happy', 2);
    yield 1.5;
    dog.setPose('stand');
    dog.setMood('calm');
    ctx.npcs.follow(dog, chris.root, { distance: 1.2 });
    ctx.walker.enabled = true;
    this.phase = 'done';
    this.finished = true;
  }

  // ── calls & reactions ────────────────────────────────────────────────────

  private call(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    const dog = ctx.family.dog;
    this.callCooldown = 0.8;
    this.instructionT = Math.min(this.instructionT, 0.01);
    chris.play('point');
    ctx.audio.play('whistle');
    this.calls++;
    if (this.inBusiness) {
      // Mid-business: a polite apology, not a miss.
      this.talk.say(chris, `${this.name}! Oh — sorry, sorry. Privacy.`, { seconds: 2.2 });
      return;
    }
    const outcome = judgeCall(this.attention.open, this.businessDone, this.stubborn);
    if (this.businessDone) this.callsAfterBusiness++;
    this.talk.say(chris, CALL_LINES[this.callLine++ % CALL_LINES.length]!(this.name), { seconds: 1.6, mood: 'excited' });
    switch (outcome) {
      case 'recall':
        this.recall();
        break;
      case 'businessFirst':
        this.attention.close();
        this.onGlanceClose();
        dog.emote('idea', 1.4);
        this.talk.say(dog, 'Oh! Right. First things first.', { style: 'think', seconds: 2, silent: true });
        ctx.audio.play('dogBarkSmall');
        this.brain.start(this.businessThenIdle());
        break;
      case 'stubborn':
        this.stubborn--;
        this.attention.close();
        dog.emote('huff', 1.4);
        dog.play('wag', { duration: 1 });
        ctx.audio.play('dogWhine');
        if (this.stubborn > 0) {
          this.talk.say(dog, '…five more minutes.', { style: 'think', seconds: 2, silent: true });
          this.attention.soon(1.4);
        } else this.getUp(false);
        break;
      case 'ignored':
        this.misses++;
        this.reactIgnored();
        break;
    }
  }

  private recall(): void {
    this.recallAt = this.time;
    this.attention.close();
    this.brain.stop();
    this.zoom = null;
    this.glanceable = false;
    this.phase = 'return';
    this.chips?.setVisible(false);
    this.prompt.hide();
    this.director.start(this.returnScript());
  }

  /** Nobody landed the call (or the clock is up): the dog decides breakfast is more interesting. */
  private selfReturn(): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.selfReturned = true;
    this.inBusiness = false;
    this.businessDone = true;
    this.stubborn = 0;
    if (this.leaf?.mode === 'mouth') this.dropLeaf();
    this.talk.say(dog, '…is it breakfast yet?', { style: 'think', seconds: 2.2, silent: true });
    dog.emote('idea', 1.4);
    this.talk.say(ctx.family.chris, 'Oh, NOW you want to come in.', { seconds: 2.2, mood: 'sleepy' });
    this.callLine = 2;
    this.recall();
  }

  private reactIgnored(): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    dog.emote('question', 1.2);
    if (!this.zoom && !ctx.npcs.isBusy(dog) && !this.lying) {
      dog.play('tilt');
      ctx.npcs.faceToward(dog, ctx.walker.position);
    } else if (this.lying) dog.play('tilt');
    this.reactT = 1.0;
    if (this.misses % 2 === 0) {
      const chris = ctx.family.chris;
      chris.play('shrug');
      this.talk.say(chris, MISS_LINES[this.missLine++ % MISS_LINES.length]!, { seconds: 1.8, mood: 'sleepy' });
    }
  }

  /** Stubborn dog decides the grass can wait (treats, or asked nicely twice). */
  private getUp(treats: boolean): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.stubborn = 0;
    this.lying = false;
    dog.setPose('stand');
    dog.emote(treats ? 'idea' : 'exclaim', 1.4);
    ctx.audio.play('dogCollar');
    ctx.hud.objective = `${this.name} is up! Call during the next look-back.`;
    if (treats) this.talk.say(dog, 'Did somebody say… TREATS?', { style: 'think', seconds: 2, silent: true });
    this.attention.soon(1.1);
    this.brain.start(this.idleScript(true));
  }

  private onShakeStart(): void {
    const { ctx } = this;
    const chris = ctx.family.chris;
    if (!this.treatBag) {
      const bag = makeProp('treatBag');
      bag.root.name = 'dog:treat-bag';
      this.treatBag = bag;
    }
    const bag = this.treatBag;
    if (bag.root.parent !== chris.socket('handR')) {
      chris.socket('handR').add(bag.root);
      // A touch bigger than life with a soft rim so the rattle reads at dollhouse distance.
      bag.root.scale.setScalar(1.5);
      bag.root.position.copy(bag.grip.position).multiplyScalar(-1.5);
      bag.setHighlight(0.4);
    }
    bag.root.visible = true;
    chris.setHold('mug');
    const dog = ctx.family.dog;
    if (this.time - this.lastIdea > 3 && !this.attention.open && !this.inBusiness && !this.zoom) {
      this.lastIdea = this.time;
      dog.emote('idea', 1.1);
    }
  }

  private tickTreatBag(dt: number): void {
    const bag = this.treatBag;
    if (!bag || !bag.root.visible) return;
    const shaking = this.shakeIdle === 0;
    if (shaking) {
      const t = this.time;
      bag.root.rotation.set(Math.sin(t * 31) * 0.28, 0, Math.sin(t * 23) * 0.2);
      this.shakeSfx -= dt;
      if (this.shakeSfx <= 0) {
        this.shakeSfx = 0.32;
        this.ctx.audio.play('treatShake', { volume: 0.8 });
      }
    } else {
      bag.root.rotation.set(0, 0, 0);
      if (this.shakeIdle > 0.9) {
        bag.root.visible = false;
        this.ctx.family.chris.setHold('none');
      }
    }
  }

  // ── glances ──────────────────────────────────────────────────────────────

  private onGlanceOpen(): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    if (!this.zoom) ctx.npcs.stop(dog);
    this.moveTok++;
    if (dog.action && dog.action !== 'wag' && dog.action !== 'bark') dog.cancelAction();
    const chrisHead = ctx.family.chris.socket('head').getWorldPosition(this.v1);
    if (!this.lying) ctx.npcs.faceToward(dog, chrisHead);
    dog.lookAt(chrisHead);
    const len = this.attention.timer;
    dog.emote('exclaim', len);
    ctx.audio.play('dogCollar');
    ctx.fx.ring(this.v2.set(dog.root.position.x, 0.03, dog.root.position.z), this.businessDone ? PAL.good : PAL.interact, 0.75, len);
    ctx.rumble('light');
  }

  private onGlanceClose(): void {
    const dog = this.ctx.family.dog;
    dog.lookAt(null);
    this.resume();
  }

  /** Back to what the dog was doing before a glance / reaction. */
  private resume(): void {
    const { ctx } = this;
    const dog = ctx.family.dog;
    if (this.zoom) return;
    if (this.resumeAction) dog.play(this.resumeAction, { loop: true });
    if (this.resumeFace) ctx.npcs.faceToward(dog, this.resumeFace);
  }

  // ── brain scripts ────────────────────────────────────────────────────────

  private runTo(to: Vec3Like, style: 'walk' | 'run', speed?: number, faceYaw?: number): { until: () => boolean; max: number } {
    const tok = ++this.moveTok;
    let arrived = false;
    void this.ctx.npcs.walkTo(this.ctx.family.dog, to, { style, speed, faceYaw }).then(() => {
      if (tok === this.moveTok) arrived = true;
    });
    // A glance stops the walk (moveTok bumps) — treat that as "arrived" so the beat moves on.
    return { until: () => arrived || tok !== this.moveTok, max: 9 };
  }

  /**
   * A walkable lawn spot the dollhouse camera can actually see: the yard's far strip (by 'yardFar') sits behind
   * the big tree and the swing set, so quirks stay on the camera side of it (+Z is toward the camera).
   */
  private inYard(x: number, z: number): boolean {
    const w = this.ctx.world;
    return w.roomAt(x, z) === 'yard' && w.free(x, z, 0.35) && z >= w.anchor('yardFar').z + VISIBLE_LAWN_MARGIN;
  }

  /** Where the dog stares into the distance: toward the far corner, from where the camera can see it. */
  private stareSpot(): Vec3Like {
    const far = this.ctx.world.anchor('yardFar');
    const c = this.ctx.world.anchor('yardCenter');
    for (const dz of [VISIBLE_LAWN_MARGIN + 0.8, VISIBLE_LAWN_MARGIN + 0.3, VISIBLE_LAWN_MARGIN + 1.4]) {
      for (const k of [0, 0.2, 0.35, 0.5]) {
        const x = far.x + (c.x - far.x) * k;
        const z = far.z + dz;
        if (this.inYard(x, z) && dist2d(x, z, this.ctx.world.anchor('yardBush').x, this.ctx.world.anchor('yardBush').z) > 1.8) return { x, y: 0, z };
      }
    }
    return this.yardPoint(c.x, c.z, 3);
  }

  private yardPoint(cx: number, cz: number, radius: number, minFrom?: Vec3Like): Vec3Like {
    const r = () => this.ctx.rng.next();
    const pts = pickSpots(r, cx, cz, radius, 4, (x, z) => this.inYard(x, z) && (!minFrom || dist2d(x, z, minFrom.x, minFrom.z) > 1.2));
    return pts[0] ?? this.ctx.world.anchor('yardCenter');
  }

  private *quirkScript(): Script {
    switch (this.quirk) {
      case 'stare':
        yield* this.stareQuirk();
        break;
      case 'leaf':
        yield* this.leafQuirk();
        break;
      case 'zoomies':
        yield* this.zoomiesQuirk();
        break;
      case 'stubborn':
        yield* this.stubbornQuirk();
        return;
      default:
        yield* this.sniffQuirk();
    }
    yield* this.businessThenIdle();
  }

  private *businessThenIdle(): Script {
    if (!this.businessDone) yield* this.business();
    yield* this.idleScript(false);
  }

  /** `glanceAfter` false: the next beat decides when the dog may look back (the stubborn dog lies down first). */
  private *business(glanceAfter = true): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.glanceable = false;
    this.resumeAction = null;
    this.resumeFace = null;
    if (this.leaf?.mode === 'mouth') this.dropLeaf();
    const b = ctx.world.anchor('yardBush');
    const far = dist2d(dog.root.position.x, dog.root.position.z, b.x, b.z) > 4;
    this.inBusiness = true;
    yield this.runTo(b, far ? 'run' : 'walk', far ? 3.4 : 1.8, b.yaw);
    ctx.npcs.faceToward(dog, { x: b.x + Math.sin(b.yaw), y: 0, z: b.z + Math.cos(b.yaw) });
    yield 0.45;
    dog.play('pee');
    yield 3.4;
    this.inBusiness = false;
    this.businessDone = true;
    this.businessAt = this.time;
    ctx.fx.burst('sparkle', this.v1.set(dog.root.position.x, 0.9, dog.root.position.z), { count: 14 });
    dog.emote('check', 1.8);
    ctx.audio.play('sparkle');
    this.tasks[1]!.state = 'done';
    this.tasks[2]!.state = 'active';
    ctx.hud.objective = this.quirk === 'stubborn' ? `${this.name} is done! Now… getting comfy?` : `All done! Call ${this.name} when the “!” pops up.`;
    if (!glanceAfter) return;
    this.glanceable = true;
    this.attention.soon(1.2);
    yield 0.8;
  }

  private *idleScript(fresh: boolean): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.glanceable = true;
    this.resumeAction = null;
    this.resumeFace = null;
    if (fresh) {
      dog.play('shake');
      yield 1.0;
    }
    const center = ctx.world.anchor('yardCenter');
    for (let n = 0; n < 200; n++) {
      const p = dog.root.position;
      // Drift toward the middle of the yard (closer to the house) while pottering about.
      const cx = (p.x + center.x) / 2;
      const cz = (p.z + center.z) / 2;
      const to = this.yardPoint(cx, cz, 2.6, p);
      yield this.runTo(to, 'walk', 1.25);
      const k = ctx.rng.next();
      if (k < 0.45) {
        dog.play('sniff');
        ctx.audio.play('sniff', { volume: 0.7 });
        yield 1.8;
      } else if (k < 0.7) {
        dog.play('wag');
        yield 1.4;
      } else if (k < 0.85) {
        dog.play('scratch');
        yield 1.9;
      } else {
        dog.play('yawn');
        yield 1.6;
      }
    }
  }

  // Quirks ───────────────────────────────────────────────────────────────────

  private *stareQuirk(): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    const far = ctx.world.anchor('yardFar');
    const spot = this.stareSpot();
    this.glanceable = false;
    yield this.runTo(spot, 'run', 3.6);
    // Staring past the far corner, at… nothing.
    this.resumeFace = { x: far.x + Math.sin(far.yaw) * 4, y: 0, z: far.z + Math.cos(far.yaw) * 4 };
    ctx.npcs.faceToward(dog, this.resumeFace);
    yield 0.4;
    dog.play('stare', { loop: true });
    this.resumeAction = 'stare';
    this.talk.say(dog, '…', { style: 'think', seconds: 3, silent: true });
    yield 2.2;
    this.talk.say(ctx.family.chris, 'What are you looking at, buddy?', { seconds: 2.4 });
    this.glanceable = true;
    yield 2.4;
    this.talk.say(dog, '…………', { style: 'think', seconds: 2.4, silent: true });
    yield 2.4;
    this.resumeAction = null;
    this.resumeFace = null;
    dog.cancelAction();
    dog.play('shake');
    ctx.audio.play('dogCollar');
    yield 1.0;
  }

  private *sniffQuirk(): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    const c = ctx.world.anchor('yardCenter');
    const spots = pickSpots(() => ctx.rng.next(), c.x, c.z, 4.2, 5, (x, z) => this.inYard(x, z), 1.8);
    if (spots.length === 0) spots.push({ x: c.x, y: 0, z: c.z });
    for (let i = 0; i < spots.length; i++) {
      this.glanceable = false;
      this.resumeAction = null;
      yield this.runTo(spots[i]!, i === 0 ? 'run' : 'walk', i === 0 ? 3.4 : 2.0);
      this.glanceable = true;
      dog.play('sniff', { loop: true });
      this.resumeAction = 'sniff';
      ctx.audio.play('sniff');
      if (i === 2) this.talk.say(ctx.family.chris, 'Every. Single. Blade.', { seconds: 2, mood: 'sleepy' });
      yield 1.7;
      this.resumeAction = null;
      dog.cancelAction();
    }
  }

  private *leafQuirk(): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    const c = ctx.world.anchor('yardCenter');
    this.glanceable = false;
    yield this.runTo(c, 'run', 3.4);
    this.glanceable = true;
    dog.play('sniff', { loop: true });
    this.resumeAction = 'sniff';
    yield 1.4;
    this.resumeAction = null;
    // A leaf flutters down…
    const p1 = this.yardPoint(dog.root.position.x, dog.root.position.z, 2.6, dog.root.position);
    this.spawnLeaf(p1);
    this.glanceable = false;
    yield 0.5;
    dog.cancelAction();
    dog.lookAt(this.leaf ? this.leaf.prop.root.position : null);
    dog.emote('exclaim', 1.2);
    ctx.audio.play('dogBarkSmall');
    yield { until: () => this.leaf?.mode === 'rest', max: 3 };
    dog.lookAt(null);
    // Pounce #1 — and the wind takes it.
    yield this.runTo(this.approach(p1), 'run', 4.0);
    ctx.npcs.faceToward(dog, p1);
    dog.play('pounce');
    yield 0.7;
    const p2 = this.yardPoint(p1.x, p1.z, 3.0, p1);
    this.hopLeaf(p2);
    ctx.audio.play('whoosh');
    this.talk.say(ctx.family.chris, 'Get it, buddy!', { seconds: 1.6, mood: 'excited' });
    yield 0.75;
    yield this.runTo(this.approach(p2), 'run', 4.4);
    ctx.npcs.faceToward(dog, p2);
    dog.play('pounce');
    yield 0.75;
    // Caught! Proud.
    this.leafToMouth();
    dog.emote('star', 1.6);
    ctx.fx.burst('sparkle', this.v1.set(dog.root.position.x, 0.6, dog.root.position.z), { count: 8 });
    ctx.audio.play('pop');
    this.glanceable = true;
    dog.play('wag', { duration: 1.4 });
    yield 1.5;
  }

  private *zoomiesQuirk(): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    const c = ctx.world.anchor('yardCenter');
    // Largest clear lap around the yard centre.
    let r = 2.6;
    for (; r > 1.3; r -= 0.3) {
      let ok = true;
      for (let i = 0; i < 16 && ok; i++) {
        const a = (i / 16) * Math.PI * 2;
        ok = this.inYard(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
      }
      if (ok) break;
    }
    this.glanceable = false;
    yield this.runTo({ x: c.x + r, y: 0, z: c.z }, 'run', 3.6);
    dog.play('zoomies');
    ctx.audio.play('dogBark');
    yield 1.2;
    this.talk.say(ctx.family.chris, 'Oh no. Zoomies.', { seconds: 1.8, mood: 'sleepy' });
    ctx.npcs.release(dog);
    this.moveTok++;
    this.zoom = { cx: c.x, cz: c.z, r, ang: Math.atan2(dog.root.position.z - c.z, dog.root.position.x - c.x), dir: 1, t: 0, dur: 6.5, flipped: false, dust: 0 };
    yield { until: () => this.zoom === null, max: 14 };
    dog.setMotion(0);
    dog.play('shake');
    ctx.audio.play('dogPant');
    dog.emote('sweat', 1.4);
    yield 1.1;
    this.glanceable = true;
    dog.play('wag', { duration: 1.2 });
    yield 1.2;
  }

  private *stubbornQuirk(): Script {
    const { ctx } = this;
    const dog = ctx.family.dog;
    this.stubborn = 2;
    yield* this.business(false);
    const c = ctx.world.anchor('yardCenter');
    const b = ctx.world.anchor('yardBush');
    const to = this.yardPoint((c.x + b.x) / 2, (c.z + b.z) / 2, 1.8, dog.root.position);
    yield this.runTo(to, 'walk', 1.5);
    dog.play('roll');
    ctx.audio.play('dogPant', { volume: 0.7 });
    yield 2.0;
    dog.setPose('lie');
    this.lying = true;
    this.talk.say(ctx.family.chris, "Oh, we're doing this today?", { seconds: 2.4, mood: 'sleepy' });
    ctx.hud.objective = `${this.name} got comfy. Call twice — or shake the treats!`;
    this.glanceable = true;
    this.attention.soon(1.6);
    // Lies there contentedly (glances back now and then) until coaxed up.
    for (let n = 0; n < 400; n++) {
      yield 2.2;
      if (ctx.rng.next() < 0.4) dog.play('yawn');
    }
  }

  /** A point just short of `p` on the dog's side (so the pounce lands on it). */
  private approach(p: Vec3Like): Vec3Like {
    const d = this.ctx.family.dog.root.position;
    const dx = p.x - d.x;
    const dz = p.z - d.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.5) return { x: d.x, y: 0, z: d.z };
    return { x: p.x - (dx / l) * 0.45, y: 0, z: p.z - (dz / l) * 0.45 };
  }

  // ── zoomies (manual root control) ────────────────────────────────────────

  private tickZoom(dt: number): void {
    const z = this.zoom;
    if (!z) return;
    const { ctx } = this;
    const dog = ctx.family.dog;
    const haste = quirkHaste(this.attention.level);
    z.t += dt * haste;
    const speed = 6.2;
    if (!z.flipped && z.t > z.dur * 0.55) {
      z.flipped = true;
      z.dir = -1;
      ctx.fx.burst('dust', this.v1.set(dog.root.position.x, 0.1, dog.root.position.z), { count: 10 });
      ctx.audio.play('dogBarkSmall');
    }
    z.ang += (z.dir * speed * dt) / z.r;
    const x = z.cx + Math.cos(z.ang) * z.r;
    const zz = z.cz + Math.sin(z.ang) * z.r;
    // Tangent direction of travel.
    const tx = -Math.sin(z.ang) * z.dir;
    const tz = Math.cos(z.ang) * z.dir;
    dog.root.position.set(x, 0, zz);
    dog.root.rotation.y = Math.atan2(tx, tz);
    dog.setMotion(speed);
    z.dust -= dt;
    if (z.dust <= 0) {
      z.dust = 0.28;
      ctx.fx.burst('dust', this.v1.set(x, 0.05, zz), { count: 3, size: 0.8 });
      ctx.audio.play('dogPaws', { volume: 0.6 });
    }
    if (z.t >= z.dur) {
      this.zoom = null;
      dog.setMotion(0);
      // Hand the root back to the director with the current heading.
      ctx.npcs.place(dog, { x, y: 0, z: zz }, dog.root.rotation.y);
    }
  }

  // ── the leaf ─────────────────────────────────────────────────────────────

  private spawnLeaf(at: Vec3Like): void {
    const { ctx } = this;
    this.hideLeaf();
    const prop = makeProp('leaf');
    prop.root.name = 'dog:leaf';
    prop.root.scale.setScalar(2.4);
    prop.setHighlight(0.35);
    ctx.root.add(prop.root);
    const from = new THREE.Vector3(at.x - 0.6, 2.9, at.z - 0.3);
    const to = new THREE.Vector3(at.x, 0.02, at.z);
    prop.root.position.copy(from);
    this.leaf = { prop, mode: 'fall', t: 0, dur: 2.2, from, to };
    ctx.fx.burst('leaf', from, { count: 5 });
  }

  private hopLeaf(to: Vec3Like): void {
    const l = this.leaf;
    if (!l) return;
    l.from.copy(l.prop.root.position);
    l.to.set(to.x, 0.02, to.z);
    l.mode = 'hop';
    l.t = 0;
    l.dur = 0.8;
    this.ctx.fx.burst('leaf', l.from, { count: 4 });
  }

  private leafToMouth(): void {
    const l = this.leaf;
    if (!l) return;
    const mouth = this.ctx.family.dog.socket('mouth');
    mouth.add(l.prop.root);
    l.prop.root.position.set(0, -0.02, 0.03);
    l.prop.root.rotation.set(-1.2, 0, 0.3);
    l.prop.root.scale.setScalar(1.6);
    l.mode = 'mouth';
  }

  private dropLeaf(): void {
    const l = this.leaf;
    if (!l) return;
    const { ctx } = this;
    const d = ctx.family.dog.root.position;
    ctx.root.add(l.prop.root);
    l.prop.root.position.set(d.x + Math.sin(ctx.family.dog.root.rotation.y) * 0.5, 0.02, d.z + Math.cos(ctx.family.dog.root.rotation.y) * 0.5);
    l.prop.root.rotation.set(0, 0.7, 0);
    l.prop.root.scale.setScalar(2.4);
    l.mode = 'rest';
  }

  private hideLeaf(): void {
    const l = this.leaf;
    if (!l) return;
    l.prop.root.removeFromParent();
    l.prop.dispose();
    this.leaf = null;
  }

  private tickLeaf(dt: number): void {
    const l = this.leaf;
    if (!l || l.mode === 'rest' || l.mode === 'mouth') return;
    l.t += dt;
    const u = clamp01(l.t / l.dur);
    const r = l.prop.root;
    if (l.mode === 'fall') {
      // Flutter: sway side to side while sinking, rocking as it goes.
      const sway = Math.sin(l.t * 4.2) * 0.45 * (1 - u);
      r.position.set(l.from.x + (l.to.x - l.from.x) * u + sway, l.from.y + (l.to.y - l.from.y) * u, l.from.z + (l.to.z - l.from.z) * u);
      r.rotation.set(Math.sin(l.t * 5) * 0.8 * (1 - u), l.t * 2.2, Math.cos(l.t * 4.2) * 0.6 * (1 - u));
    } else {
      const h = 0.9 * 4 * u * (1 - u);
      r.position.set(l.from.x + (l.to.x - l.from.x) * u, l.from.y + (l.to.y - l.from.y) * u + h, l.from.z + (l.to.z - l.from.z) * u);
      r.rotation.set(Math.sin(l.t * 9) * 0.9 * (1 - u), l.t * 5, 0);
    }
    if (u >= 1) {
      r.position.copy(l.to);
      r.rotation.set(0, r.rotation.y, 0);
      l.mode = 'rest';
    }
  }
}
