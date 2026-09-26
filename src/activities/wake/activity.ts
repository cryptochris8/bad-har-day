// ACT II — "WAKE UP, GIRLS!" (docs/GDD.md §5). 6:00 AM: Ashley wakes and finds the coffee Chris made in Act I
// (the payoff), then sets out cereal. Chris wakes each girl in her seeded style — pop-up, blanket burrito (curtains
// + the 4-beat wake-up song) or sleepwalker (catch up and guide her to the kitchen) — and when all three sit at the
// table: a short breakfast montage. Free roam with keyboard / pad / touch joystick, hotspot prompts with device
// glyphs, mouse/touch tap-to-walk, and a beat track that takes PRIMARY / taps / clicks.
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import { DISPLAY_NAME, GIRLS, type Character, type GirlId } from '../../family/types';
import type { ControlScheme, GameControls } from '../../input/types';
import { ACTS, type ActivityResult, type WakeStyle } from '../../plan/types';
import { GIRL_COLORS, makeMug, makeProp, type MugProp, type Prop } from '../../props';
import { PAL } from '../../render/palette';
import type { TaskItem, Meter } from '../../ui/types';
import { BED_MATTRESS_H, CHAIR_SEAT_H } from '../../world';
import type { Anchor, AnchorId } from '../../world/types';
import {
  HURRY_SPEED,
  Hotspots,
  HurryHint,
  TEST_HOOKS,
  testWindow,
  ScriptHost,
  Talk,
  WALK_SPEED,
  ahead,
  bedExitSpot,
  bedRoot,
  buttonScheme,
  dist2,
  freeSpotNear,
  holdProp,
  layInBed,
  roamScheme,
  setDown,
  yawTo,
  type Lane,
  type Step,
} from './common';
import {
  ASHLEY_GREETINGS,
  BeatPhrase,
  DriftWatch,
  GUIDE,
  SLEEP_TALK,
  SONG,
  SONG_PITCH,
  SONG_TRIES,
  WRONG_SPOTS,
  arrivedAtTable,
  bedsideLabel,
  bedsideUsable,
  canCatch,
  guideCloseness,
  isUp,
  songSucceeded,
  taskState,
  wakeFlags,
  wakeNext,
  wakeObjective,
  wakeStars,
  type Grade,
  type WakeEvent,
  type WakePhase,
} from './logic';
import { SongView } from './song';

const ACT = ACTS[1]!;
const CSS_COLOR: Record<GirlId, string> = { addy: 'var(--bhd-addy)', ellie: 'var(--bhd-ellie)', heidi: 'var(--bhd-heidi)' };
const BED_ANCHOR: Record<GirlId, AnchorId> = { addy: 'bedAddy', ellie: 'bedEllie', heidi: 'bedHeidi' };
const BEDSIDE: Record<GirlId, AnchorId> = { addy: 'bedsideAddy', ellie: 'bedsideEllie', heidi: 'bedsideHeidi' };
const SEAT: Record<GirlId, AnchorId> = { addy: 'seatAddy', ellie: 'seatEllie', heidi: 'seatHeidi' };
const SLEEP_SIDE: Record<GirlId, number> = { addy: 0.4, ellie: -0.6, heidi: 1 };

interface GirlRt {
  id: GirlId;
  name: string;
  c: Character;
  style: WakeStyle;
  phase: WakePhase;
  lane: Lane;
  bed: Anchor;
  bedside: Anchor;
  seat: Anchor;
  room: 'twins' | 'heidi';
  wrong: Anchor;
  drift: DriftWatch;
  drifts: number;
  upAt: number;
  guideEnd: number;
  talkIn: number;
  talkIdx: number;
  wiggleIn: number;
  bowl: Prop | null;
  task: TaskItem;
}

interface SongRun {
  g: GirlRt;
  phrase: BeatPhrase;
  tries: number;
  view: SongView;
  state: 'phrase' | 'between' | 'outro';
  pause: number;
  ticks: number;
}

type Phase = 'intro' | 'play' | 'montage' | 'done';

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

class WakeActivity implements Activity {
  readonly id = 'wake' as const;
  private ctx: ActivityContext | null = null;
  private host!: ScriptHost;
  private talk!: Talk;
  private spots!: Hotspots;
  private hurry: HurryHint | null = null;
  private main!: Lane;
  private ashLane!: Lane;
  private girls: GirlRt[] = [];
  private byId = new Map<GirlId, GirlRt>();
  private phase: Phase = 'intro';
  private finished = false;
  private skipped = false;
  private playT = 0;
  private allSeatedAt = -1;
  private song: SongRun | null = null;
  private cutIn = false;
  private rescued = 0;
  private rescueDone = false;
  private songAcc: number | null = null;
  private songTries = 0;
  private coffeePayoff = false;
  /** ?test=1 telemetry: how/when the coffee payoff played. */
  private payoffLog: { at: number; cut: boolean; where: 'kitchen' | 'montage'; singing: boolean } | null = null;
  private mug: THREE.Object3D | null = null;
  private mugProp: MugProp | null = null;
  private mugHome: { parent: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private mugHeld = false;
  private box: Prop | null = null;
  private boxHeld = false;
  private ashleyReady = false;
  private greetIdx = 0;
  private tasks: TaskItem[] = [];
  private objectiveDirty = true;
  private readonly guideMeter: Meter = { id: 'guide', label: 'Gentle guiding', value: 1, color: 'var(--bhd-mint)', icon: 'hand' };
  private readonly meters: Meter[] = [this.guideMeter];
  private instrLeft = 0;
  private readonly exitOut = { x: 0, z: 0 };

  // ── lifecycle ─────────────────────────────────────────────────────────────

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    this.host = new ScriptHost(ctx, 'wake');
    this.talk = new Talk(ctx);
    this.spots = new Hotspots(ctx);
    this.hurry = new HurryHint(ctx.ui.activityLayer());
    this.main = this.host.lane();
    this.ashLane = this.host.lane();
    const { family, world, plan, state } = ctx;

    // Chris: out of Act I, a little less sleepy now; free-roam defaults.
    const chris = family.chris;
    chris.cancelAction();
    chris.setHold('none');
    chris.setPose('stand');
    chris.setSleepiness(0.2);
    chris.emote(null);
    ctx.walker.speed = WALK_SPEED;
    ctx.pointer.enable({ virtual: 'off', cursor: 'none' });
    // The dog tags along (the dog chore may have left it in the yard).
    family.dog.setPose('stand');
    ctx.npcs.follow(family.dog, chris.root, { distance: 1.2 });

    // Ashley: asleep in the master bed (continuity for dev jumps / a previous activity).
    const ashley = family.ashley;
    ctx.npcs.release(ashley);
    ashley.cancelAction();
    ashley.setHold('none');
    ashley.setOutfit('sleep');
    layInBed(ashley, world.anchor('masterBedAshley'), 0.4);
    ashley.setExpression('asleep');
    ashley.setSleepiness(0);
    ashley.emote('zzz');
    ashley.root.visible = true;
    world.bed('master').setBlanket('tucked');

    // The girls: asleep in their beds (unless somehow already up → straight to the table).
    const wrongPick = ctx.rng.int(0, WRONG_SPOTS.length - 1);
    for (const id of GIRLS) {
      const c = family.girl(id);
      const bed = world.anchor(BED_ANCHOR[id]);
      const task: TaskItem = { id: `wake:${id}`, label: `Wake ${DISPLAY_NAME[id]}`, icon: 'bed', state: 'todo' };
      const g: GirlRt = {
        id,
        name: DISPLAY_NAME[id],
        c,
        style: plan.wake[id] ?? 'popUp',
        phase: 'asleep',
        lane: this.host.lane(),
        bed,
        bedside: world.anchor(BEDSIDE[id]),
        seat: world.anchor(SEAT[id]),
        room: bed.room === 'heidi' ? 'heidi' : 'twins',
        wrong: world.anchor(WRONG_SPOTS[(wrongPick + GIRLS.indexOf(id)) % WRONG_SPOTS.length]!),
        drift: new DriftWatch(),
        drifts: 0,
        upAt: -1,
        guideEnd: -1,
        talkIn: 2 + ctx.rng.range(0, 2),
        talkIdx: ctx.rng.int(0, SLEEP_TALK.length - 1),
        wiggleIn: 1.5,
        bowl: null,
        task,
      };
      this.girls.push(g);
      this.byId.set(id, g);
      ctx.npcs.release(c);
      c.cancelAction();
      c.setHold('none');
      c.root.visible = true;
      c.setSleepiness(0);
      if (state.girlsUp[id]) {
        this.sit(g, true);
        continue;
      }
      c.setOutfit('sleep');
      layInBed(c, bed, SLEEP_SIDE[id]);
      c.setExpression('asleep');
      c.emote('zzz');
      c.hair?.setBedhead(1);
      world.bed(id).setBlanket('tucked');
    }
    this.tasks = [...this.girls.map((g) => g.task), { id: 'wake:breakfast', label: 'Everyone to breakfast', icon: 'sun', state: 'todo' }];
    ctx.hud.tasks = this.tasks;
    ctx.hud.objective = 'Wake the girls — every one wakes up her own way.';

    this.prepareMug();
    this.addHotspots();
    this.intro();
    if (TEST_HOOKS) testWindow().__BHD_ACT__ = () => this.debugInfo();
  }

  /** ?test=1: state for the walkthrough bots. */
  private debugInfo() {
    const sg = this.song;
    return {
      phase: this.phase,
      playT: this.playT,
      cutIn: this.cutIn,
      coffeePayoff: this.coffeePayoff,
      payoff: this.payoffLog,
      ashleyReady: this.ashleyReady,
      rescued: this.rescued,
      girls: this.girls.map((g) => ({ id: g.id, style: g.style, phase: g.phase, drifts: g.drifts, x: g.c.root.position.x, z: g.c.root.position.z })),
      song: sg ? { state: sg.state, t: sg.phrase.t, tries: sg.tries, times: sg.phrase.times, grades: sg.phrase.grades } : null,
      stars: this.finished ? this.result() : null,
    };
  }

  update(dt: number, controls: GameControls): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    try {
      this.step(dt, controls);
    } catch (e) {
      console.warn('[wake] update', e);
    }
  }

  controls(): ControlScheme | null {
    if (this.finished || this.phase !== 'play' || this.cutIn) return null;
    if (this.song) return this.song.state === 'outro' ? null : buttonScheme('SING', 'music');
    return roamScheme(this.spots.button, this.spots.icon, true);
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    // skip() (debug / e2e autopilot) = a plausible, middle-of-the-road morning.
    if (this.skipped) return { stars: 2, flags: [] };
    const input = this.scoreInput();
    return { stars: wakeStars(input), flags: wakeFlags(input, this.coffeePayoff) };
  }

  skip(): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    this.skipped = true;
    this.host.kill();
    this.closeSong();
    this.talk.closeAll();
    this.spots.clear();
    this.hurry?.dispose();
    this.hurry = null;
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    this.endState();
    this.finished = true;
    this.phase = 'done';
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.host.kill();
    this.closeSong();
    this.talk.closeAll();
    this.spots.clear();
    this.hurry?.dispose();
    this.hurry = null;
    const { family } = ctx;
    const chris = family.chris;
    chris.cancelAction();
    chris.setHold('none');
    chris.setPose('stand');
    const ashley = family.ashley;
    if (this.mugHeld) this.mugBack();
    if (this.boxHeld && this.box) {
      setDown(this.box.root, ctx.root, ashley.root.position, 0);
      this.boxHeld = false;
    }
    ashley.cancelAction();
    ashley.setHold('none');
    ashley.lookAt(null);
    for (const g of this.girls) {
      g.c.cancelAction();
      g.c.root.visible = true;
    }
    ctx.npcs.follow(family.dog, chris.root, { distance: 1.2 });
    ctx.clock.mode = 'run';
    ctx.hud.meters = null;
    if (TEST_HOOKS) delete testWindow().__BHD_ACT__;
    this.ctx = null;
  }

  // ── per frame ─────────────────────────────────────────────────────────────

  private step(dt: number, controls: GameControls): void {
    const ctx = this.ctx!;
    this.host.tick(dt);
    this.talk.update();
    this.mugProp?.update(dt);
    if (this.phase === 'play') this.playT += dt;
    // The clock holds during the intro, cut-ins and the montage (cutscenes).
    ctx.clock.mode = this.phase === 'play' && !this.cutIn ? 'run' : 'hold';

    if (this.instrLeft > 0) {
      this.instrLeft -= dt;
      if (this.instrLeft <= 0) ctx.ui.instruction(null);
    }

    const guiding = this.guiding();
    ctx.walker.enabled = this.phase === 'play' && !this.song && !this.cutIn;
    ctx.walker.speed = controls.alt ? HURRY_SPEED : guiding ? GUIDE.chrisSpeed : WALK_SPEED;

    if (this.song) this.updateSong(dt, controls);
    for (const g of this.girls) this.updateGirl(g, dt);

    const canUse = this.phase === 'play' && !this.song && !this.cutIn;
    this.spots.update(controls, canUse);
    this.hurry?.update(canUse, ctx.input.lastDevice);

    // HUD (one pass, no per-frame closures)
    let changed = false;
    let allSeated = true;
    let anyHeading = false;
    let anyLane = false;
    let guided: GirlRt | null = null;
    for (const g of this.girls) {
      const st = taskState(g.style, g.phase);
      if (g.task.state !== st) {
        g.task.state = st;
        changed = true;
      }
      if (isUp(g.phase)) ctx.state.girlsUp[g.id] = true;
      if (g.phase !== 'seated') allSeated = false;
      if (g.phase === 'toSeat' || g.phase === 'seated') anyHeading = true;
      if (g.phase === 'guided') guided = g;
      if (g.lane.running) anyLane = true;
    }
    const bf = this.tasks[this.tasks.length - 1]!;
    const bfState = allSeated ? 'done' : anyHeading ? 'active' : 'todo';
    if (bf.state !== bfState) bf.state = bfState;
    if (changed || this.objectiveDirty) {
      this.objectiveDirty = false;
      ctx.hud.objective = wakeObjective(this.girls);
    }
    if (guided) {
      this.guideMeter.label = `Guiding ${guided.name}`;
      this.guideMeter.value = guideCloseness(dist2(ctx.walker.position, guided.c.root.position));
      ctx.hud.meters = this.meters;
    } else if (ctx.hud.meters) ctx.hud.meters = null;

    // Graceful wrap-up at the act's last minute: everybody gets up by themselves.
    if (this.phase === 'play' && !this.rescueDone && ctx.clock.minutes >= ACT.end - 1) this.rescue();

    // Everybody at the table (and done with their little moments) → breakfast montage.
    if (this.phase === 'play' && allSeated && !anyLane && !this.cutIn) this.montage();
  }

  private guiding(): boolean {
    for (const g of this.girls) if (g.phase === 'guided') return true;
    return false;
  }

  private updateGirl(g: GirlRt, dt: number): void {
    const ctx = this.ctx!;
    const c = g.c;
    if (g.phase === 'burrito' || g.phase === 'sunny') {
      g.wiggleIn -= dt;
      if (g.wiggleIn <= 0) {
        g.wiggleIn = 2.2 + ctx.rng.range(0, 1.6);
        ctx.world.bed(g.id).wiggle(0.55);
        if (ctx.rng.chance(0.3)) ctx.audio.play('blanketRustle', { volume: 0.4 });
      }
    }
    if (g.phase === 'sleepwalking' || g.phase === 'guided') {
      g.talkIn -= dt;
      if (g.talkIn <= 0) {
        g.talkIn = 5.5 + ctx.rng.range(0, 2.5);
        g.talkIdx = (g.talkIdx + 1) % SLEEP_TALK.length;
        this.talk.say(c, SLEEP_TALK[g.talkIdx]!, { style: 'whisper', mood: 'sleepy', seconds: 2.2 });
      }
    }
    if (g.phase === 'guided') {
      const d = dist2(ctx.walker.position, c.root.position);
      const inKitchen = ctx.world.roomAt(c.root.position.x, c.root.position.z) === 'kitchen';
      if (arrivedAtTable(inKitchen, dist2(c.root.position, g.seat))) this.arrive(g);
      else if (g.drift.update(d, dt)) this.driftOff(g);
    }
  }

  // ── intro + Ashley ────────────────────────────────────────────────────────

  private intro(): void {
    const ctx = this.ctx!;
    this.phase = 'intro';
    this.main.run(async (s) => {
      const a = ctx.family.ashley;
      const bed = ctx.world.anchor('masterBedAshley');
      const br = bedRoot(bed, a.height);
      ctx.camera.shot({ position: { x: br.x + 0.2, y: 3.3, z: br.z + 4.6 }, target: { x: br.x + 0.3, y: 0.6, z: br.z + 0.3 }, fov: 42 }, 3);
      await s.wait(0.6);
      a.emote(null);
      a.setExpression('sleepy');
      a.setPose('lie', { seatHeight: BED_MATTRESS_H, side: 0 });
      a.play('stretch');
      ctx.audio.play('blanketRustle', { volume: 0.7 });
      this.talk.say(a, 'Mmm… good morning!', { mood: 'sleepy', seconds: 1.9 });
      await s.wait(1.9);
      ctx.world.bed('master').setBlanket('thrown');
      bedExitSpot(ctx.world, bed, this.exitOut);
      ctx.npcs.place(a, { x: this.exitOut.x, y: 0, z: this.exitOut.z }, 0);
      a.setPose('stand');
      a.setExpression('happy');
      ctx.audio.play('bedCreak', { volume: 0.6 });
      a.play('yawn');
      await s.wait(1.5);
      this.talk.say(a, 'Rise and shine, sleepyheads!', { style: 'shout', mood: 'excited', seconds: 2 });
      a.play('wave');
      await s.wait(1.2);
      this.phase = 'play';
      ctx.camera.follow(null);
      this.instr('Wake up the girls!', 'Every girl wakes up her own way', 3.2);
      this.runAshley();
    });
  }

  /** The mug Chris made in Act I (or a stand-in when a dev jump says it was made). */
  private prepareMug(): void {
    const ctx = this.ctx!;
    let mug = ctx.persist.getObjectByName('ashleys-coffee') ?? null;
    if (!mug && ctx.state.coffee.made) {
      const m = makeMug(ctx.state.coffee.mug ?? 'sunflower');
      m.setFill(0.82);
      m.setLiquid(ctx.state.coffee.liquid);
      m.setSteam(true);
      m.root.name = 'ashleys-coffee';
      m.root.userData.prop = m;
      const spot = ctx.world.anchor('ashleySpot');
      setDown(m.root, ctx.persist, spot, spot.yaw);
      this.mugProp = m;
      mug = m.root;
    }
    this.mug = mug;
  }

  private rememberMugHome(mug: THREE.Object3D): void {
    this.mugHome = { parent: mug.parent ?? this.ctx!.persist, pos: mug.position.clone(), quat: mug.quaternion.clone() };
  }

  private mugBack(): void {
    const mug = this.mug;
    const home = this.mugHome;
    if (!mug) return;
    if (home) {
      home.parent.add(mug);
      mug.position.copy(home.pos);
      mug.quaternion.copy(home.quat);
    } else {
      const spot = this.ctx!.world.anchor('ashleySpot');
      setDown(mug, this.ctx!.persist, spot, spot.yaw);
    }
    this.mugHeld = false;
  }

  /** A girl's big moment (pop-up, emerging, waking at the table…) is on screen until this play time. */
  private momentUntil = 0;

  private moment(seconds: number): void {
    this.momentUntil = Math.max(this.momentUntil, this.playT + seconds);
  }

  private canCutIn(): boolean {
    return this.phase === 'play' && !this.song && !this.cutIn && !this.guiding() && !this.spots.walking && this.playT >= this.momentUntil;
  }

  /** A hard cut to Ashley (never a glide through the house's walls) and back. */
  private beginCutIn(at: THREE.Vector3): void {
    const ctx = this.ctx!;
    this.cutIn = true;
    this.spots.cancelWalk();
    ctx.walker.enabled = false;
    ctx.camera.shot({ position: { x: at.x + 1.1, y: at.y + 2.7, z: at.z + 4.1 }, target: { x: at.x - 0.15, y: at.y + 0.95, z: at.z - 0.15 }, fov: 40 }, 4);
    ctx.camera.snap();
  }

  private endCutIn(): void {
    if (!this.cutIn) return;
    this.cutIn = false;
    if (this.phase === 'play' && !this.song) {
      this.ctx!.camera.follow(null);
      this.ctx!.camera.snap();
    }
  }

  private runAshley(): void {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    this.ashLane.run(async (s) => {
      const mug = this.mug;
      if (mug) {
        // ── the Act I payoff: she finds her coffee… ──
        mug.getWorldPosition(v1);
        freeSpotNear((x, z, r) => ctx.world.free(x, z, r), v1.x, v1.z, Math.PI / 2, this.exitOut, [0.55, 0.7, 0.85, 1.0]);
        const stand = { x: this.exitOut.x, y: 0, z: this.exitOut.z };
        await s.walk(a, stand, { faceYaw: yawTo(stand.x, stand.z, v1.x, v1.z) });
        a.lookAt(v1);
        // …and waits for a calm moment to enjoy it (never mid-song, mid-guide or over a girl's big moment). If the
        // girls beat her to the table, the payoff happens during the breakfast montage instead.
        await s.until(() => this.phase !== 'play' || this.canCutIn());
        if (this.phase !== 'play') return;
        // A short camera cut-in only when Chris is elsewhere (in the kitchen he sees it anyway).
        const cut = dist2(ctx.walker.position, a.root.position) > 5;
        this.payoffLog = { at: this.playT, cut, where: 'kitchen', singing: !!this.song };
        if (cut) this.beginCutIn(a.root.position);
        await s.wait(cut ? 0.5 : 0);
        await this.coffeeBeat(s, mug, !cut);
        this.endCutIn();
        await s.wait(0.4);
      } else {
        await this.ashleyMakesCoffee(s);
      }
      await this.ashleyCereal(s);
    });
  }

  /** Ashley picks up the coffee Chris made, sips — heart — "you're the best", thumbs up; puts it back down. */
  private async coffeeBeat(s: Step, mug: THREE.Object3D, chrisSees: boolean): Promise<void> {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    a.play('grab');
    await s.wait(0.35);
    this.rememberMugHome(mug);
    holdProp(mug, a, 'handR');
    this.mugHeld = true;
    a.setHold('mug');
    a.lookAt(null);
    ctx.audio.play('mugPick');
    await s.wait(0.5);
    const d = a.play('sip');
    await s.wait(d * 0.55);
    if (ctx.state.coffee.made) {
      a.emote('heart', 2.4);
      a.setExpression('love', 2.6);
      a.socket('overhead').getWorldPosition(v2);
      ctx.fx.burst('heart', v2, { count: 10 });
      ctx.audio.play('heart');
      this.talk.say(a, 'Mmm… you’re the best.', { mood: 'normal', seconds: 2.4 });
      this.coffeePayoff = true;
      await s.wait(1.4);
      ctx.npcs.faceToward(a, ctx.family.chris.root.position);
      await s.wait(0.45);
      a.play('thumbsUp');
      if (chrisSees) ctx.family.chris.emote('heart', 1.5);
      await s.wait(1.4);
    } else {
      this.talk.say(a, 'Mmm. Coffee.', { seconds: 1.6 });
      await s.wait(1.4);
    }
    a.setHold('none');
    this.mugBack();
    ctx.audio.play('mugPlace', { volume: 0.7 });
  }

  /** No coffee this morning (coffee chore skipped): a playful "where's my coffee?" and she makes it herself. */
  private async ashleyMakesCoffee(s: Step): Promise<void> {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    const cm = ctx.world.anchor('coffeeMaker');
    await s.walk(a, cm, { faceYaw: cm.yaw });
    a.emote('question', 1.8);
    this.talk.say(a, 'Coffee… where’s my coffee?', { mood: 'normal', seconds: 2.2 });
    a.play('shrug');
    await s.wait(1.8);
    this.talk.say(a, 'No problem — I’ve got this!', { mood: 'excited', seconds: 1.8 });
    ctx.world.fixtures.coffeeMaker.setBrewing(true);
    ctx.audio.play('brewStart');
    await s.wait(2.4);
    ctx.world.fixtures.coffeeMaker.setBrewing(false);
    const m = makeMug(ctx.state.coffee.mug ?? 'sunflower');
    m.setFill(0.82);
    m.setLiquid(ctx.state.coffee.liquid);
    m.setSteam(true);
    m.root.name = 'ashleys-coffee';
      m.root.userData.prop = m;
    ctx.persist.add(m.root);
    this.mugProp = m;
    this.mug = m.root;
    holdProp(m.root, a, 'handR');
    this.mugHeld = true;
    a.setHold('mug');
    ctx.audio.play('mugPick');
    await s.wait(0.4);
    const d = a.play('sip');
    await s.wait(d * 0.6);
    a.emote('heart', 1.6);
    this.talk.say(a, 'Ahh. Much better.', { seconds: 1.6 });
    await s.wait(1.2);
    // Set it at her spot on the table on the way (rush finds it there later).
    const spot = ctx.world.anchor('ashleySpot');
    await s.walk(a, this.tableStand(), { faceYaw: -Math.PI / 2 });
    a.setHold('none');
    setDown(m.root, ctx.persist, spot, spot.yaw);
    this.mugHeld = false;
    this.mugHome = null;
    ctx.audio.play('mugPlace', { volume: 0.7 });
    await s.wait(0.3);
  }

  /** Where Ashley stands by the table (beside her chair). */
  private tableStand(): { x: number; y: number; z: number } {
    const ctx = this.ctx!;
    const seat = ctx.world.anchor('seatAshley');
    const out = { x: 0, z: 0 };
    freeSpotNear((x, z, r) => ctx.world.free(x, z, r), seat.x, seat.z, 0, out, [0.55, 0.7, 0.9]);
    return { x: out.x, y: 0, z: out.z };
  }

  private tableTop(out: THREE.Vector3): THREE.Vector3 {
    return this.ctx!.world.fixtures.table.top.getWorldPosition(out);
  }

  private async ashleyCereal(s: Step): Promise<void> {
    const ctx = this.ctx!;
    const a = ctx.family.ashley;
    const counter = ctx.world.anchor('lunchCounter');
    await s.walk(a, counter, { faceYaw: counter.yaw });
    a.play('grab');
    await s.wait(0.4);
    const box = makeProp('cerealBox');
    ctx.root.add(box.root);
    holdProp(box.root, a, 'handR');
    this.box = box;
    this.boxHeld = true;
    a.setHold('box');
    ctx.audio.play('itemPick', { volume: 0.7 });
    await s.wait(0.3);
    const stand = this.tableStand();
    this.tableTop(v1);
    await s.walk(a, stand, { faceYaw: yawTo(stand.x, stand.z, v1.x, v1.z) });
    a.play('handOff');
    await s.wait(0.45);
    this.placeBox();
    a.setHold('none');
    ctx.audio.play('itemPlace', { volume: 0.8 });
    for (const g of this.girls) {
      if (g.bowl) continue;
      await s.wait(0.35);
      a.play('handOff');
      await s.wait(0.4);
      this.placeBowl(g);
    }
    this.ashleyReady = true;
    const seat = ctx.world.anchor('seatAddy');
    ctx.npcs.faceToward(a, seat);
  }

  private placeBox(): void {
    const ctx = this.ctx!;
    if (!this.box) {
      this.box = makeProp('cerealBox');
      ctx.root.add(this.box.root);
    }
    this.tableTop(v1);
    const spot = ctx.world.anchor('ashleySpot');
    setDown(this.box.root, ctx.root, { x: v1.x + (spot.x - v1.x) * 0.5, y: v1.y, z: v1.z + 0.14 }, -0.35);
    this.boxHeld = false;
  }

  private placeBowl(g: GirlRt): void {
    const ctx = this.ctx!;
    if (g.bowl) return;
    const bowl = makeProp('cerealBowl');
    this.tableTop(v1);
    const p = ahead(g.seat, 0.42);
    setDown(bowl.root, ctx.root, { x: p.x, y: v1.y, z: p.z }, g.seat.yaw);
    g.bowl = bowl;
    ctx.audio.play('dishClink', { volume: 0.6, pitch: 1 + 0.1 * GIRLS.indexOf(g.id) });
  }

  // ── hotspots ──────────────────────────────────────────────────────────────

  private addHotspots(): void {
    const ctx = this.ctx!;
    for (const g of this.girls) {
      this.spots.add({
        id: `bed:${g.id}`,
        at: () => g.bedside,
        radius: 1.3,
        label: () => bedsideLabel(g.phase, g.name),
        button: () => (g.phase === 'sunny' ? 'SING' : 'WAKE'),
        icon: 'hand',
        enabled: () => bedsideUsable(g.phase),
        marker: () => PAL.interact,
        onUse: () => this.useBedside(g),
      });
      const pos = { x: 0, y: 0, z: 0 };
      this.spots.add({
        id: `guide:${g.id}`,
        at: () => {
          pos.x = g.c.root.position.x;
          pos.z = g.c.root.position.z;
          return pos;
        },
        radius: GUIDE.catchDist,
        label: () => `Guide ${g.name} to breakfast`,
        button: 'GUIDE',
        icon: 'hand',
        enabled: () => g.phase === 'sleepwalking',
        marker: () => GIRL_COLORS[g.id],
        onUse: () => this.catchSleepwalker(g),
      });
    }
    for (const room of ['twins', 'heidi'] as const) {
      const anchor = ctx.world.anchor(room === 'twins' ? 'curtainTwins' : 'curtainHeidi');
      this.spots.add({
        id: `curtain:${room}`,
        at: () => anchor,
        radius: 1.3,
        label: () => 'Open the curtains',
        button: 'OPEN',
        icon: 'hand',
        enabled: () => this.girls.some((g) => g.room === room && g.phase === 'burrito'),
        marker: () => PAL.interact,
        onUse: () => this.openCurtains(room),
      });
    }
  }

  private setPhase(g: GirlRt, ev: WakeEvent): void {
    const next = wakeNext(g.style, g.phase, ev);
    if (next !== g.phase) {
      g.phase = next;
      this.objectiveDirty = true;
    }
  }

  private useBedside(g: GirlRt): void {
    if (g.phase === 'sunny') {
      this.startSong(g);
      return;
    }
    if (g.phase !== 'asleep') return;
    const ctx = this.ctx!;
    ctx.walker.face(yawTo(ctx.walker.position.x, ctx.walker.position.z, g.bed.x, g.bed.z));
    if (g.style === 'popUp') this.popUp(g);
    else if (g.style === 'burrito') this.burrito(g);
    else this.sleepwalker(g);
  }

  // ── getting out of bed + to the table ─────────────────────────────────────

  /** Hop out past the foot of the bed, facing Chris. */
  private getOut(g: GirlRt): void {
    const ctx = this.ctx!;
    const c = g.c;
    bedExitSpot(ctx.world, g.bed, this.exitOut);
    c.root.visible = true;
    c.setPose('stand');
    const w = ctx.walker.position;
    ctx.npcs.place(c, { x: this.exitOut.x, y: 0, z: this.exitOut.z }, yawTo(this.exitOut.x, this.exitOut.z, w.x, w.z));
    ctx.world.bed(g.id).setBlanket('thrown');
    ctx.audio.play('blanketRustle', { volume: 0.8 });
  }

  private async toSeat(g: GirlRt, s: Step, style: 'walk' | 'run', speed?: number): Promise<void> {
    await s.walk(g.c, g.seat, speed ? { style, speed } : { style });
    this.sit(g, false);
  }

  /** Sit her at her breakfast seat (pose 'sit' on the chair). */
  private sit(g: GirlRt, quiet: boolean): void {
    const ctx = this.ctx!;
    const c = g.c;
    ctx.npcs.release(c);
    c.cancelAction();
    c.setHold('none');
    c.root.visible = true;
    c.root.position.set(g.seat.x, 0, g.seat.z);
    c.root.rotation.y = g.seat.yaw;
    c.setPose('sit', { seatHeight: CHAIR_SEAT_H });
    if (g.phase !== 'seated') {
      g.phase = 'seated';
      this.objectiveDirty = true;
    }
    ctx.state.girlsUp[g.id] = true;
    if (quiet) return;
    ctx.audio.play('thud', { volume: 0.35 });
    const a = ctx.family.ashley;
    if (this.ashleyReady && !this.cutIn && this.phase === 'play') {
      ctx.npcs.faceToward(a, c.root.position);
      this.talk.say(a, ASHLEY_GREETINGS[this.greetIdx++ % ASHLEY_GREETINGS.length]!, { seconds: 1.8 });
      a.emote('heart', 1.4);
    }
  }

  // ── pop-up ────────────────────────────────────────────────────────────────

  private popUp(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'use');
    g.upAt = this.playT;
    this.moment(3.5);
    ctx.family.chris.play('wave');
    g.lane.run(async (s) => {
      const c = g.c;
      c.emote(null);
      c.setSleepiness(0);
      c.setExpression('joy', 2.6);
      this.getOut(g);
      c.play('jump');
      ctx.audio.play('boing');
      ctx.audio.play('kidsYay', { volume: 0.55, delay: 0.1 });
      c.socket('overhead').getWorldPosition(v1);
      ctx.fx.burst('star', v1, { count: 14 });
      ctx.fx.confetti(v1, 0.7, 0.55);
      ctx.rumble('light');
      this.talk.say(c, 'GOOD MORNING!!!', { style: 'shout', mood: 'excited', seconds: 2 });
      await s.wait(0.9);
      c.play('cheer');
      await s.wait(1.4);
      c.setExpression('happy');
      await this.toSeat(g, s, 'run');
    });
  }

  // ── blanket burrito ───────────────────────────────────────────────────────

  private burrito(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'use');
    this.moment(4.2);
    const bed = ctx.world.bed(g.id);
    bed.setBlanket('burrito');
    bed.wiggle(1);
    ctx.audio.play('blanketRustle');
    g.c.emote(null);
    g.wiggleIn = 1.8;
    this.talk.say(g.c, 'five more minutes…', { style: 'whisper', mood: 'sleepy', seconds: 2.4 });
    const chris = ctx.family.chris;
    g.lane.run(async (s) => {
      await s.wait(1.3);
      chris.play('shrug');
      this.talk.say(chris, 'Okay… plan B: sunshine!', { style: 'think', seconds: 2.2 });
      this.instr('Let the sunshine in!', 'Open the curtains', 3);
    });
  }

  private openCurtains(room: 'twins' | 'heidi'): void {
    const ctx = this.ctx!;
    this.moment(2.5);
    const curtains = ctx.world.curtains(room);
    curtains.open();
    ctx.audio.play('curtain');
    const chris = ctx.family.chris;
    chris.play('grab');
    const anchor = ctx.world.anchor(room === 'twins' ? 'curtainTwins' : 'curtainHeidi');
    ctx.fx.burst('sparkle', { x: anchor.x, y: 1.5, z: anchor.z - 0.5 }, { count: 16, color: PAL.sunbeam });
    for (const g of this.girls) {
      if (g.room !== room || g.phase !== 'burrito') continue;
      this.setPhase(g, 'curtains');
      ctx.world.bed(g.id).wiggle(0.9);
      g.lane.run(async (s) => {
        await s.wait(0.7);
        this.talk.say(g.c, 'Nnngh… too bright…', { style: 'whisper', mood: 'sleepy', seconds: 2 });
        await s.wait(1.2);
        this.instr('Now: the wake-up song!', `Go back to ${g.name}'s bed and sing`, 3);
      });
    }
  }

  private startSong(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'songStart');
    this.spots.cancelWalk();
    ctx.ui.prompt(null);
    ctx.ui.instruction(null);
    this.instrLeft = 0;
    const view = new SongView(ctx.ui.activityLayer(), CSS_COLOR[g.id], g.name, SONG.notes);
    this.song = { g, phrase: new BeatPhrase(SONG), tries: 1, view, state: 'phrase', pause: 0, ticks: 0 };
    view.setTry(1, SONG_TRIES);
    const chris = ctx.family.chris;
    const w = ctx.walker.position;
    ctx.walker.face(yawTo(w.x, w.z, g.bed.x, g.bed.z));
    const br = bedRoot(g.bed, g.c.height);
    ctx.camera.shot({ position: { x: (br.x + w.x) / 2 + 0.3, y: 2.5, z: Math.max(br.z, w.z) + 3.2 }, target: { x: (br.x + w.x) / 2, y: 0.75, z: br.z + 0.3 }, fov: 42 }, 4);
    chris.play('dance', { loop: true });
    this.talk.say(chris, '♪ Wake up, wake up, sleepyhead… ♪', { style: 'sing', mood: 'sing', seconds: 2.6 });
  }

  private updateSong(dt: number, controls: GameControls): void {
    const ctx = this.ctx!;
    const sg = this.song!;
    const taps = sg.view.takeTaps();
    if (dt <= 0 || sg.state === 'outro') return; // paused: taps on the panel don't count
    if (sg.state === 'between') {
      sg.pause -= dt;
      if (sg.pause <= 0) {
        sg.phrase = new BeatPhrase(SONG);
        sg.state = 'phrase';
        sg.ticks = 0;
        sg.view.reset();
        sg.view.setTry(sg.tries, SONG_TRIES);
        sg.view.message('Tap on the beat!');
      }
      return;
    }
    const ph = sg.phrase;
    ph.advance(dt);
    while (sg.ticks < ph.ticks.length && ph.t >= ph.ticks[sg.ticks]!) {
      sg.ticks++;
      ctx.audio.play('clockTick', { volume: 0.55, pitch: sg.ticks === ph.ticks.length ? 1.2 : 1 });
      sg.view.tick();
      sg.view.message(sg.ticks === 1 ? 'Ready…' : 'Sing!');
    }
    let presses = taps + (controls.primaryPressed ? 1 : 0);
    const p = ctx.pointer;
    if (p.enabled && p.pressed && p.source !== 'virtual') presses++;
    for (; presses > 0; presses--) {
      const r = ph.press();
      if (r) this.judged(sg, r.index, r.grade);
    }
    for (const i of ph.sweep()) this.judged(sg, i, 'miss');
    sg.view.render(ph, dt);
    if (!ph.finished) return;
    const passed = ph.passed();
    this.songAcc = ph.accuracy;
    this.songTries = sg.tries;
    if (songSucceeded(passed, sg.tries)) {
      this.songDone(sg, passed);
      return;
    }
    sg.tries++;
    sg.state = 'between';
    sg.pause = 1.3;
    sg.view.message(ph.hits > 0 ? 'Almost! One more time…' : 'Let’s try that again!');
    this.talk.say(ctx.family.chris, ph.hits > 0 ? 'Almost! Again!' : 'From the top!', { style: 'sing', mood: 'sing', seconds: 1.4 });
    ctx.world.bed(sg.g.id).wiggle(0.4);
  }

  private judged(sg: SongRun, i: number, grade: Grade): void {
    const ctx = this.ctx!;
    sg.view.judged(i, grade);
    const bed = ctx.world.bed(sg.g.id);
    if (grade === 'miss') {
      ctx.audio.play('boing', { volume: 0.3, pitch: 0.8 });
      return;
    }
    ctx.audio.play('pop', { pitch: SONG_PITCH[i] ?? 1, volume: grade === 'perfect' ? 1 : 0.8 });
    bed.wiggle(grade === 'perfect' ? 1 : 0.75);
    const br = bedRoot(sg.g.bed, sg.g.c.height);
    ctx.fx.burst('sparkle', { x: br.x, y: 0.85, z: br.z }, { count: grade === 'perfect' ? 8 : 5 });
    ctx.family.chris.emote('music', 0.7);
    if (grade === 'perfect') ctx.rumble('light');
  }

  private songDone(sg: SongRun, passed: boolean): void {
    const ctx = this.ctx!;
    sg.state = 'outro';
    this.moment(4.5);
    sg.view.message(passed ? 'She’s waking up!' : 'That did it!');
    const g = sg.g;
    this.setPhase(g, 'songDone');
    g.upAt = this.playT;
    const chris = ctx.family.chris;
    chris.cancelAction();
    g.lane.run(async (s) => {
      await s.wait(0.7);
      this.closeSong();
      const c = g.c;
      c.emote(null);
      c.setSleepiness(0.45);
      c.hair?.setBedhead(1);
      this.getOut(g);
      ctx.audio.play('boing');
      c.play('stretch');
      c.socket('overhead').getWorldPosition(v1);
      ctx.fx.confetti(v1, 0.6, 0.45);
      this.talk.say(c, 'Okaaay… I’m up! I’m up!', { mood: 'sleepy', seconds: 2.2 });
      chris.play('cheer');
      await s.wait(2.3);
      if (this.song === null && this.phase === 'play' && !this.cutIn) ctx.camera.follow(null);
      c.play('yawn');
      c.setSleepiness(0);
      c.setExpression('happy');
      await s.wait(1.2);
      await this.toSeat(g, s, 'walk');
    });
  }

  private closeSong(): void {
    const sg = this.song;
    if (!sg) return;
    sg.view.close();
    this.song = null;
    this.objectiveDirty = true;
    this.ctx?.family.chris.cancelAction();
  }

  // ── sleepwalker ───────────────────────────────────────────────────────────

  private sleepwalker(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'use');
    this.moment(3);
    g.upAt = this.playT;
    const c = g.c;
    const chris = ctx.family.chris;
    g.lane.run(async (s) => {
      c.setSleepiness(1);
      c.setExpression('sleepy');
      c.emote('zzz');
      this.getOut(g);
      await s.wait(0.7);
      chris.play('gasp');
      this.talk.say(chris, 'Uh-oh. Sleepwalker!', { seconds: 1.8 });
      this.instr('Sleepwalker!', 'Catch up, then gently guide her to the kitchen', 3.2);
      await this.wander(g, s);
    });
  }

  private async wander(g: GirlRt, s: Step): Promise<void> {
    const c = g.c;
    g.talkIn = Math.min(g.talkIn, 1.5);
    await s.walk(c, g.wrong, { style: 'sleepwalk' });
    if (g.phase !== 'sleepwalking') return;
    c.play('sleepwalk', { loop: true });
    c.emote('zzz');
  }

  private catchSleepwalker(g: GirlRt): void {
    const ctx = this.ctx!;
    if (g.phase !== 'sleepwalking') return;
    const d = dist2(ctx.walker.position, g.c.root.position);
    if (!canCatch(d)) return;
    this.setPhase(g, 'catch');
    g.lane.stop();
    g.drift.reset();
    const c = g.c;
    ctx.npcs.follow(c, ctx.family.chris.root, { distance: GUIDE.followDist, speed: GUIDE.followSpeed });
    c.play('sleepwalk', { loop: true });
    c.emote(null);
    ctx.audio.play('pop', { volume: 0.5, pitch: 1.3 });
    this.talk.say(ctx.family.chris, 'This way, sweetie…', { style: 'whisper', seconds: 2 });
    this.instr('Walk her to the kitchen', 'Nice and gently — no hurrying!', 2.8);
  }

  private driftOff(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'drift');
    g.drifts++;
    this.talk.say(ctx.family.chris, 'Whoa — too fast! She’s drifting off…', { seconds: 2 });
    ctx.family.chris.play('facepalm');
    g.lane.run(async (s) => {
      g.c.emote('zzz');
      await this.wander(g, s);
    });
  }

  private arrive(g: GirlRt): void {
    const ctx = this.ctx!;
    this.setPhase(g, 'arrive');
    this.moment(5);
    g.lane.run(async (s) => {
      const c = g.c;
      await s.walk(c, g.seat, { style: 'sleepwalk', speed: 1.0 });
      this.sit(g, true);
      g.guideEnd = this.playT;
      await s.wait(0.5);
      c.setSleepiness(0);
      c.setExpression('surprised', 1.3);
      c.emote('exclaim', 1.3);
      ctx.audio.play('boing');
      await s.wait(1.1);
      c.setExpression('happy');
      c.play('giggle');
      this.talk.say(c, 'Wait… how did I get here?!', { mood: 'excited', seconds: 2.2 });
      ctx.family.chris.play('thumbsUp');
      await s.wait(1.6);
      const a = ctx.family.ashley;
      if (this.ashleyReady) {
        ctx.npcs.faceToward(a, c.root.position);
        this.talk.say(a, 'Good morning, sleepwalker!', { seconds: 1.8 });
        a.emote('heart', 1.4);
        await s.wait(1.2);
      }
    });
  }

  // ── wrap-up + montage ─────────────────────────────────────────────────────

  /** 6:29: the clock's up — Ashley calls everyone to breakfast and the rest get up by themselves. */
  private rescue(): void {
    const ctx = this.ctx!;
    this.rescueDone = true;
    const a = ctx.family.ashley;
    this.talk.say(a, 'Breakfast, girls! Everybody up!', { style: 'shout', mood: 'excited', seconds: 2.4 });
    if (this.song) {
      this.closeSong();
      ctx.camera.follow(null);
    }
    for (const g of this.girls) {
      if (g.phase === 'seated' || g.phase === 'toSeat') continue;
      const inBed = g.phase === 'asleep' || g.phase === 'burrito' || g.phase === 'sunny' || g.phase === 'singing';
      this.rescued++;
      this.setPhase(g, 'rescue');
      if (g.upAt < 0) g.upAt = this.playT;
      g.lane.run(async (s) => {
        const c = g.c;
        c.emote(null);
        if (inBed) {
          this.getOut(g);
          c.play('stretch');
        } else {
          ctx.npcs.stop(c);
          c.cancelAction();
          c.setExpression('surprised', 1);
          c.emote('exclaim', 1);
        }
        c.setSleepiness(0);
        await s.wait(1.2);
        c.setExpression('happy');
        await this.toSeat(g, s, 'run');
      });
    }
  }

  private montage(): void {
    const ctx = this.ctx!;
    this.phase = 'montage';
    this.allSeatedAt = this.playT;
    this.spots.cancelWalk();
    ctx.ui.prompt(null);
    ctx.hud.meters = null;
    ctx.clock.advance(4);
    this.ashLane.stop();
    this.main.run(async (s) => {
      const a = ctx.family.ashley;
      if (this.mugHeld) {
        a.setHold('none');
        this.mugBack();
      }
      if (this.boxHeld || !this.box || this.box.root.parent !== ctx.root) this.placeBox();
      a.setHold('none');
      for (const g of this.girls) this.placeBowl(g);
      const top = this.tableTop(new THREE.Vector3());
      const payoffDue = !this.coffeePayoff && ctx.state.coffee.made && !!this.mug;
      ctx.camera.shot({ position: { x: top.x + 0.2, y: top.y + 2.1, z: top.z + 4.3 }, target: { x: top.x, y: top.y + 0.3, z: top.z - 0.35 }, fov: 44 }, 3);
      const stand = this.tableStand();
      if (dist2(a.root.position, stand) > 0.4) void ctx.npcs.walkTo(a, stand, { faceYaw: yawTo(stand.x, stand.z, top.x, top.z), style: 'run' });
      else ctx.npcs.faceToward(a, top);
      // Chris joins them (a hard cut when he's far away), the dog begs.
      const cs = ctx.world.anchor('seatChris');
      const out = { x: 0, z: 0 };
      freeSpotNear((x, z, r) => ctx.world.free(x, z, r), cs.x, cs.z, 0, out, [0.6, 0.8, 1.0]);
      const dog = ctx.family.dog;
      const heidi = this.byId.get('heidi')!;
      const dogSpot = { x: 0, z: 0 };
      freeSpotNear((x, z, r) => ctx.world.free(x, z, r), heidi.seat.x, heidi.seat.z, Math.PI / 2, dogSpot, [0.55, 0.75, 0.95], 0.25);
      const chrisFace = yawTo(out.x, out.z, top.x, top.z);
      if (dist2(ctx.walker.position, { x: out.x, y: 0, z: out.z }) > 6) {
        ctx.walker.teleport(out.x, out.z, chrisFace);
        ctx.npcs.place(dog, { x: dogSpot.x + 0.6, y: 0, z: dogSpot.z + 0.4 }, 0);
        ctx.camera.snap();
      } else ctx.walker.face(yawTo(ctx.walker.position.x, ctx.walker.position.z, top.x, top.z)); // already here: no walking across the shot
      void ctx.npcs.walkTo(dog, { x: dogSpot.x, y: 0, z: dogSpot.z }, { style: 'run' }).then(() => {
        if (!this.host.alive) return;
        ctx.npcs.faceToward(dog, heidi.c.root.position);
        dog.play('beg');
        dog.emote('heart', 2);
        ctx.audio.play('dogWhine', { volume: 0.5 });
      });
      this.instr('Breakfast time!', 'Crunch, crunch, giggle.', 1.5);
      ctx.audio.play('cheer', { volume: 0.6 });
      if (payoffDue) {
        // She never got a quiet moment with her coffee: she enjoys it now, at the table.
        const mug = this.mug!;
        this.payoffLog = { at: this.playT, cut: false, where: 'montage', singing: false };
        await s.until(() => !ctx.npcs.isBusy(a), 3);
        mug.getWorldPosition(v1);
        ctx.npcs.faceToward(a, v1);
        await s.wait(0.4);
        await this.coffeeBeat(s, mug, true);
      }
      await s.wait(payoffDue ? 0 : 1.4);
      for (let k = 0; k < 7; k++) {
        const g = this.girls[k % 3]!;
        ctx.audio.play('crunch', { pitch: 0.85 + ((k * 37) % 10) / 25, volume: 0.9 });
        if (g.bowl) {
          g.bowl.root.getWorldPosition(v1);
          v1.y += 0.08;
          ctx.fx.burst('crumb', v1, { count: 5 });
        }
        if (k === 1 || k === 4) g.c.play('giggle');
        if (k === 2) g.c.setExpression('joy', 1.5);
        if (k === 3) this.talk.say(a, 'Eat up, my loves!', { seconds: 1.8 });
        if (k === 5) this.talk.say(this.girls[1]!.c, 'Crunchy!', { mood: 'excited', seconds: 1.4 });
        await s.wait(0.68);
      }
      await s.wait(0.4);
      ctx.ui.instruction(null);
      this.instrLeft = 0;
      this.finished = true;
      this.phase = 'done';
    });
  }

  // ── end state (skip / fallbacks) ──────────────────────────────────────────

  /** Everyone up and seated, Ashley up by the table, her coffee on the table, bowls out. */
  private endState(): void {
    const ctx = this.ctx!;
    for (const g of this.girls) {
      const c = g.c;
      c.emote(null);
      c.setSleepiness(0);
      c.setExpression('happy');
      c.setOutfit('sleep');
      ctx.world.bed(g.id).setBlanket('thrown');
      this.sit(g, true);
      g.phase = 'seated';
      g.task.state = 'done';
      ctx.state.girlsUp[g.id] = true;
      this.placeBowl(g);
    }
    const last = this.tasks[this.tasks.length - 1];
    if (last) last.state = 'done';
    const a = ctx.family.ashley;
    if (this.mugHeld) this.mugBack();
    if (!this.mug) this.prepareMug();
    if (this.boxHeld || !this.box) this.placeBox();
    a.cancelAction();
    a.setHold('none');
    a.emote(null);
    a.setSleepiness(0);
    a.setExpression('happy');
    a.setPose('stand');
    a.root.visible = true;
    ctx.world.bed('master').setBlanket('thrown');
    const stand = this.tableStand();
    this.tableTop(v1);
    ctx.npcs.place(a, stand, yawTo(stand.x, stand.z, v1.x, v1.z));
    ctx.family.chris.cancelAction();
    ctx.clock.mode = 'run';
    ctx.hud.meters = null;
    if (this.allSeatedAt < 0) this.allSeatedAt = this.playT;
  }

  private scoreInput() {
    const sleep = this.girls.find((g) => g.style === 'sleepwalker');
    const burrito = this.girls.find((g) => g.style === 'burrito');
    const guideSeconds = sleep && sleep.upAt >= 0 && sleep.guideEnd >= 0 ? sleep.guideEnd - sleep.upAt : sleep && this.rescued === 0 ? 30 : null;
    return {
      seconds: this.allSeatedAt >= 0 ? this.allSeatedAt : this.playT,
      songAccuracy: burrito ? (this.songAcc ?? 0.6) : null,
      songTries: Math.max(1, this.songTries),
      guideSeconds: sleep ? guideSeconds : null,
      drifts: sleep?.drifts ?? 0,
      rescued: this.rescued,
    };
  }

  private instr(text: string, sub: string, seconds: number): void {
    const ctx = this.ctx!;
    if (this.song) return;
    ctx.ui.instruction(text, sub);
    this.instrLeft = seconds;
  }
}

export function createWake(): Activity {
  return new WakeActivity();
}
