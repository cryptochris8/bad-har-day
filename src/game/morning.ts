// One school morning (docs/GDD.md §3): acts, the clock, Act I free roam with chore stations, the activity
// runner (services, HUD, banners, results), and the report card. Pure game-flow — rendering, input polling
// and screens belong to the App.
import * as THREE from 'three';
import { ACTIVITIES, SKIP_QUIPS } from '../activities/registry';
import type { Activity, ActivityContext, ActivityHud, MorningState } from '../activities/types';
import type { AudioEngine, MusicId } from '../audio/types';
import { Rng, hashInts, hashString } from '../core/rng';
import { GIRLS, type Family, type GirlId } from '../family/types';
import { NO_CONTROLS, type ControlScheme, type GameControls, type InputManager, type PointerInput } from '../input/types';
import { ACTS, SCHOOL_DEADLINE, buildReport, type ActNumber, type ActivityId, type ActivityRecord, type ActivityResult, type ChoreId, type DayPlan, type MorningReport, type Stars } from '../plan';
import { disposeTree } from '../render/models/common';
import type { Fx, Projector } from '../render/types';
import type { Settings } from '../storage/types';
import type { ActCard, TaskItem, UiManager } from '../ui/types';
import type { World } from '../world/types';
import type { CameraDirectorImpl } from './cameraDirector';
import type { GameClockImpl } from './clock';
import type { InteractionsImpl } from './interactions';
import type { NpcsImpl } from './npcs';
import type { WalkerImpl } from './walker';

export interface MorningDeps {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  projector: Projector;
  world: World;
  family: Family;
  fx: Fx;
  audio: AudioEngine;
  ui: UiManager;
  input: InputManager;
  pointer: PointerInput;
  camera: CameraDirectorImpl;
  walker: WalkerImpl;
  npcs: NpcsImpl;
  interactions: InteractionsImpl;
  clock: GameClockImpl;
  settings: () => Readonly<Settings>;
  dogName: () => string;
  bestArrival: () => number | null;
  rumble: (kind: 'light' | 'medium' | 'heavy' | 'score') => void;
  /** First-time hints (persisted). */
  seen: (key: string) => boolean;
  markSeen: (key: string) => void;
}

/** Mattress top height used to lay sleepers in bed (world beds). */
export const MATTRESS_H = 0.5;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'] as const;
const MOODS: Record<ActNumber, ActCard['mood']> = { 1: 'predawn', 2: 'sunrise', 3: 'morning', 4: 'bright', 5: 'bright' };
const MUSIC: Record<ActNumber, MusicId> = { 1: 'predawn', 2: 'wake', 3: 'brushing', 4: 'rush', 5: 'drive' };
const REQUIRED: readonly ChoreId[] = ['dog', 'coffee'];

const ROAM_IDLE: ControlScheme = { move: 'xy', moveLabel: 'WALK', primary: null, secondary: null, alt: null };
const ROAM_USE: ControlScheme = { move: 'xy', moveLabel: 'WALK', primary: { label: 'USE', icon: 'hand' }, secondary: null, alt: null };

export function freshState(): MorningState {
  const hair = {} as MorningState['hair'];
  const girlsUp = {} as Record<GirlId, boolean>;
  for (const g of GIRLS) {
    hair[g] = { smooth: 0, momFinished: false, blackBrushSeconds: 0, solo: false };
    girlsUp[g] = false;
  }
  return {
    coffee: { made: false, stars: 0, mug: null, liquid: 0x5a3a24 },
    lunches: { packed: false, notes: 0 },
    dogOut: false,
    trashOut: false,
    dishesDone: false,
    loud: 0,
    girlsUp,
    hair,
    itemsFound: 0,
    ashleyLeft: false,
    flags: new Set(),
  };
}

interface Running {
  id: ActivityId;
  activity: Activity;
  ctx: ActivityContext;
  hud: ActivityHud;
  failed: boolean;
  /** Seconds since start (autopilot). */
  age: number;
}

export class Morning {
  readonly state = freshState();
  readonly records: ActivityRecord[] = [];
  act: ActNumber = 1;
  report: MorningReport | null = null;
  /** Set when the morning finished (report ready). */
  done = false;
  private current: Running | null = null;
  private tasks: TaskItem[] = [];
  private objective = '';
  private readonly timers: { left: number; resolve: () => void }[] = [];
  private readonly waiters: { pred: () => boolean; resolve: () => void }[] = [];
  private modal = 0;
  private realSeconds = 0;
  private frameClicks: string[] = [];
  private scheme: ControlScheme | null = null;
  private prompt: ReturnType<InteractionsImpl['update']> = null;
  private disposed = false;
  private inGirlRoom: string | null = null;
  private readonly ui: UiManager;
  /** Dev/e2e: plays the whole morning by itself (starts chores, skips each activity after a moment). */
  autopilot = false;
  private readonly choreStarters = new Map<ChoreId, () => void>();

  constructor(
    private readonly d: MorningDeps,
    readonly plan: DayPlan,
  ) {
    // Activities get a UI whose modal calls flip input to menu navigation, and whose takeClicks() returns the
    // clicks the game did not consume this frame.
    const base = d.ui;
    const modalWrap = <T>(p: Promise<T>): Promise<T> => {
      this.modal++;
      return p.finally(() => {
        this.modal = Math.max(0, this.modal - 1);
      });
    };
    // Explicit delegation (never prototype tricks: the UI may be a class with private fields).
    this.ui = {
      showScreen: (id, data) => base.showScreen(id, data),
      get screen() {
        return base.screen;
      },
      onCommand: (cb) => base.onCommand(cb),
      handleMenuActions: (a) => base.handleMenuActions(a),
      setInputDevice: (dev, style) => base.setInputDevice(dev, style),
      boot: () => base.boot(),
      actCard: (card) => modalWrap(base.actCard(card)),
      banner: (text, style, opts) => base.banner(text, style, opts),
      bossIntro: (name, title) => modalWrap(base.bossIntro(name, title)),
      bubble: (at, text, opts) => base.bubble(at, text, opts),
      toast: (text, icon, seconds) => base.toast(text, icon, seconds),
      choice: (title, options, opts) => modalWrap(base.choice(title, options, opts)),
      setHud: () => {
        // The game owns the HUD: activities write ctx.hud instead.
      },
      prompt: (p) => base.prompt(p),
      instruction: (text, sub) => base.instruction(text, sub),
      activityLayer: () => base.activityLayer(),
      portraits: (row) => base.portraits(row),
      takeClicks: () => {
        const c = this.frameClicks;
        this.frameClicks = [];
        return c;
      },
      update: () => {
        // The App updates the real UI once per frame.
      },
      dispose: () => {
        // Owned by the App.
      },
    };
  }

  // ── public ────────────────────────────────────────────────────────────────

  get inputMode(): 'menu' | 'gameplay' {
    return this.modal > 0 ? 'menu' : 'gameplay';
  }

  get activityId(): ActivityId | null {
    return this.current?.id ?? null;
  }

  get controlScheme(): ControlScheme | null {
    return this.scheme;
  }

  /** Start the morning (from Act I), or jump to an act / play a single activity (dev + e2e). */
  start(opts: { act?: ActNumber | null; activity?: ActivityId | null } = {}): void {
    const flow = opts.activity ? this.runSingle(opts.activity) : this.run(opts.act ?? 1);
    void flow.catch((e: unknown) => {
      console.error('[morning] flow crashed', e);
      this.finish();
    });
  }

  /** Debug / e2e: finish the running activity now. */
  skipActivity(): void {
    const c = this.current;
    if (!c) return;
    if (c.activity.skip) c.activity.skip();
    else c.failed = true;
  }

  update(dt: number, controls: GameControls, clicks: readonly string[]): void {
    if (this.disposed) return;
    const d = this.d;
    this.frameClicks = clicks.slice();
    this.realSeconds += dt;
    const ctl = this.modal > 0 ? NO_CONTROLS : controls;
    if (dt > 0) {
      d.clock.update(dt);
      for (let i = this.timers.length - 1; i >= 0; i--) {
        const t = this.timers[i]!;
        t.left -= dt;
        if (t.left <= 0) {
          this.timers.splice(i, 1);
          t.resolve();
        }
      }
    }
    d.world.setClock(d.clock.minutes);

    const cur = this.current;
    if (this.autopilot && dt > 0) {
      if (cur) {
        cur.age += dt;
        if (cur.age > 0.6) this.skipActivity();
      } else if (this.act === 1 && this.choreStarters.size > 0 && this.modal === 0) {
        const first = this.choreStarters.values().next().value;
        first?.();
      }
    }
    if (cur && !cur.failed) {
      try {
        cur.activity.update(dt, ctl);
      } catch (e) {
        console.error(`[morning] activity '${cur.id}' crashed in update`, e);
        cur.failed = true;
      }
    }

    d.walker.update(dt, ctl);
    d.npcs.update(dt);
    d.camera.update(dt);

    const canUse = this.modal === 0 && d.walker.enabled && !d.walker.busy && !this.current;
    const p = d.walker.position;
    this.prompt = d.interactions.update(p.x, p.z, ctl, canUse && dt > 0);
    if (!this.current) d.ui.prompt(this.prompt);
    this.quietCheck();

    this.scheme = cur ? safeScheme(cur.activity) : this.modal > 0 ? null : this.prompt ? ROAM_USE : ROAM_IDLE;
    this.updateHud();

    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]!;
      if (w.pred()) {
        this.waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    const c = this.current;
    if (c) this.cleanupActivity(c);
    this.d.interactions.clear();
    this.d.npcs.clear();
    this.timers.length = 0;
    this.waiters.length = 0;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private wait(seconds: number): Promise<void> {
    return new Promise((resolve) => this.timers.push({ left: seconds, resolve }));
  }

  private waitUntil(pred: () => boolean): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push({ pred, resolve }));
  }

  private updateHud(): void {
    const d = this.d;
    const info = ACTS[this.act - 1]!;
    const h = this.current?.hud;
    d.ui.setHud({
      clock: d.clock.minutes,
      clockBlink: d.clock.atCap && d.clock.mode === 'run',
      actLabel: `ACT ${ROMAN[this.act]} · ${info.title}`,
      tasks: h?.tasks ?? this.tasks,
      objective: h?.objective ?? this.objective,
      meters: h?.meters ?? undefined,
      pauseButton: d.input.lastDevice === 'touch',
    });
  }

  /** Act I flavour: tiptoeing into a sleeping girl's room earns a "shh". */
  private quietCheck(): void {
    if (this.act !== 1 || this.current) return;
    const p = this.d.walker.position;
    const room = this.d.world.roomAt(p.x, p.z);
    const girlRoom = room === 'twins' || room === 'heidi' ? room : null;
    if (girlRoom && girlRoom !== this.inGirlRoom) {
      this.state.loud++;
      this.d.audio.play('bedCreak', { volume: 0.6 });
      this.d.family.chris.play('shh');
      const sleeper = girlRoom === 'heidi' ? this.d.family.heidi : this.d.family.addy;
      this.d.ui.bubble(this.d.family.chris.socket('overhead').getWorldPosition(new THREE.Vector3()), 'Shh… tiptoe, tiptoe…', {
        speaker: 'chris',
        style: 'whisper',
        seconds: 2,
      });
      sleeper.emote('zzz');
    }
    this.inGirlRoom = girlRoom;
  }

  private async actCard(n: ActNumber): Promise<void> {
    const d = this.d;
    const info = ACTS[n - 1]!;
    this.act = n;
    // Every act starts at its scheduled time: finishing early fast-forwards the clock ("time flies"); the
    // arrival time at school comes from the school run itself (docs/GDD.md §3).
    d.clock.jumpTo(info.start);
    d.clock.mode = 'hold';
    d.clock.rate = info.rate;
    d.clock.cap = info.end;
    d.world.setClock(d.clock.minutes);
    d.audio.duck(0.7, 3.2);
    d.audio.play('actCard');
    this.modal++;
    try {
      await d.ui.actCard({ time: d.clock.label(), act: `ACT ${ROMAN[n]}`, title: info.title, subtitle: info.subtitle, mood: MOODS[n] });
    } finally {
      this.modal = Math.max(0, this.modal - 1);
    }
    d.audio.setMusic(MUSIC[n]);
    d.clock.mode = 'run';
  }

  private async run(from: ActNumber): Promise<void> {
    this.setupScene();
    if (from <= 1) await this.actI();
    else this.skipTo(from);
    if (from <= 2) {
      this.d.audio.play('alarm');
      await this.actCard(2);
      await this.runActivity('wake');
    }
    if (from <= 3) {
      await this.actCard(3);
      await this.runActivity('hair');
    }
    if (from <= 4) {
      await this.actCard(4);
      await this.runActivity('rush');
    }
    await this.actCard(5);
    await this.runActivity('drive');
    this.finish();
  }

  /** Dev/e2e: play one activity in its act's setting, then finish with a report. */
  private async runSingle(id: ActivityId): Promise<void> {
    this.setupScene();
    const act: ActNumber = id === 'wake' ? 2 : id === 'hair' ? 3 : id === 'rush' ? 4 : id === 'drive' ? 5 : 1;
    if (act > 1) this.skipTo(act);
    const info = ACTS[act - 1]!;
    this.act = act;
    this.d.clock.jumpTo(info.start);
    this.d.clock.rate = info.rate;
    this.d.clock.cap = info.end;
    this.d.clock.mode = 'run';
    this.d.audio.setMusic(MUSIC[act]);
    await this.runActivity(id);
    this.finish();
  }

  /** Dev/e2e: fast-forward the story state to the start of an act. */
  private skipTo(act: ActNumber): void {
    const d = this.d;
    const { family, world, npcs } = d;
    this.state.coffee.made = true;
    this.state.coffee.stars = 2;
    this.state.coffee.mug = 'sunflower';
    this.state.dogOut = true;
    d.clock.jumpTo(ACTS[act - 1]!.start);
    if (act < 3) return; // Act II starts from the beds
    for (const g of GIRLS) {
      const c = family.girl(g);
      this.state.girlsUp[g] = true;
      c.emote(null);
      c.setPose('stand');
      c.setExpression('happy');
      world.bed(g).setBlanket('thrown');
      if (act >= 4) {
        c.setOutfit('day');
        c.hair?.setBedhead(0);
        this.state.hair[g].smooth = 1;
      }
      npcs.placeAt(c, act >= 4 ? (g === 'addy' ? 'entryGather1' : g === 'ellie' ? 'entryGather2' : 'entryGather3') : g === 'addy' ? 'seatAddy' : g === 'ellie' ? 'seatEllie' : 'seatHeidi');
    }
    const ashley = family.ashley;
    ashley.emote(null);
    ashley.setPose('stand');
    ashley.setExpression('happy');
    ashley.setOutfit(act >= 4 ? 'day' : 'sleep');
    world.bed('master').setBlanket('made');
    npcs.placeAt(ashley, 'ashleySpot');
    family.chris.setSleepiness(0);
    if (act >= 5) {
      family.chris.setOutfit('day');
      this.state.ashleyLeft = true;
      npcs.place(ashley, { x: 0, y: 0, z: -60 }, 0);
      const s = world.anchor('frontDoorOut');
      d.walker.teleport(s.x, s.z, s.yaw);
    } else {
      const k = world.anchor('coffeeMaker');
      d.walker.teleport(k.x, k.z + 0.8, 0);
    }
    d.camera.snap();
  }

  /** 5:15 AM: everybody else is asleep. */
  setupScene(): void {
    const { world, family, npcs, walker, clock, camera } = this.d;
    world.setWeather(this.plan.weather);
    world.setClock(clock.minutes);
    for (const id of ['ashley', 'addy', 'ellie', 'heidi'] as const) {
      const c = family.member(id);
      const anchor = world.anchor(id === 'ashley' ? 'masterBedAshley' : id === 'addy' ? 'bedAddy' : id === 'ellie' ? 'bedEllie' : 'bedHeidi');
      npcs.release(c);
      c.root.position.set(anchor.x, anchor.y, anchor.z);
      c.root.rotation.y = anchor.yaw;
      c.setOutfit('sleep');
      c.setPose('lie', { seatHeight: MATTRESS_H, side: id === 'heidi' ? 1 : id === 'ellie' ? -0.6 : 0.4 });
      c.setExpression('asleep');
      c.emote('zzz');
      c.hair?.setBedhead(1);
    }
    for (const g of GIRLS) world.bed(g).setBlanket('tucked');
    world.bed('master').setBlanket('tucked');
    const chris = family.chris;
    chris.setOutfit('sleep');
    chris.setPose('stand');
    chris.setHold('none');
    chris.setSleepiness(0.55);
    const s = world.anchor('chrisStart');
    walker.teleport(s.x, s.z, s.yaw);
    walker.enabled = true;
    npcs.placeAt(family.dog, 'dogBed');
    family.dog.setPose('stand');
    npcs.follow(family.dog, chris.root, { distance: 1.2 });
    camera.follow(null);
    camera.snap();
  }

  private async actI(): Promise<void> {
    const d = this.d;
    await this.actCard(1);
    d.family.chris.play('stretch');
    d.family.dog.play('wag');
    d.family.dog.emote('heart', 2);
    if (d.settings().hints && !d.seen('hint:roam')) {
      d.markSeen('hint:roam');
      d.ui.instruction('Walk to a glowing spot to start a chore', 'Everyone else is asleep — tiptoe!');
      void this.wait(5).then(() => {
        if (!this.current) d.ui.instruction(null);
      });
    }
    this.tasks = this.plan.chores.map((id) => ({ id, label: ACTIVITIES[id].label, icon: ACTIVITIES[id].icon, state: 'todo' }));
    this.objective = 'Get the morning chores done before the house wakes up.';
    const actEnd = ACTS[0]!.end;
    const remaining = new Set<ChoreId>(this.plan.chores);
    const requiredLeft = () => REQUIRED.some((r) => remaining.has(r));
    const offs: (() => void)[] = [];
    for (const id of this.plan.chores) {
      const info = ACTIVITIES[id];
      const a = d.world.anchor(info.station!);
      offs.push(
        d.interactions.add({
          id: `chore:${id}`,
          at: a,
          radius: 1.35,
          label: info.prompt,
          marker: true,
          enabled: () => remaining.has(id) && !this.current,
          onUse: () => this.startChore(id, remaining, requiredLeft, actEnd),
        }),
      );
    }
    for (const id of this.plan.chores)
      this.choreStarters.set(id, () => {
        const task = this.tasks.find((t) => t.id === id);
        if (task && task.state === 'todo') this.startChore(id, remaining, requiredLeft, actEnd);
      });
    d.clock.cap = requiredLeft() ? actEnd - 1 : actEnd;
    await this.waitUntil(() => !this.current && (remaining.size === 0 || (!requiredLeft() && d.clock.minutes >= actEnd - 1e-6)));
    for (const off of offs) off();
    this.choreStarters.clear();

    if (remaining.size === 0 && d.clock.minutes < actEnd - 1) {
      // Finished early: Chris gets a few whole minutes of peace on the couch.
      const mins = Math.max(1, Math.round(actEnd - d.clock.minutes));
      this.state.flags.add('act1:early');
      this.objective = 'Enjoy the quiet…';
      d.walker.enabled = false;
      const couch = d.world.anchor('couch');
      await d.walker.walkTo(couch, { faceYaw: couch.yaw });
      d.family.chris.setPose('sit', { seatHeight: 0.45 });
      d.family.chris.setExpression('proud');
      d.ui.bubble(d.family.chris.socket('overhead').getWorldPosition(new THREE.Vector3()), `${mins} whole minute${mins === 1 ? '' : 's'} of peace.`, {
        speaker: 'chris',
        seconds: 3,
      });
      d.audio.babble('chris', 'peace and quiet', 'sleepy');
      await this.wait(3.2);
      d.clock.rate = Math.max(2, mins / 2.2);
      await this.waitUntil(() => d.clock.minutes >= actEnd - 1e-6);
      d.family.chris.setPose('stand');
      d.walker.enabled = true;
    } else {
      for (const id of remaining) {
        const task = this.tasks.find((t) => t.id === id);
        if (task) task.state = 'skipped';
        this.records.push({ id, label: ACTIVITIES[id].label, stars: 0, flags: ['skipped'] });
        const quip = SKIP_QUIPS[id];
        if (quip) d.ui.toast(quip, ACTIVITIES[id].icon, 3);
      }
    }
    this.tasks = [];
    this.objective = '';
  }

  private startChore(id: ChoreId, remaining: Set<ChoreId>, requiredLeft: () => boolean, actEnd: number): void {
    if (this.current) return;
    this.choreStarters.delete(id);
    const task = this.tasks.find((t) => t.id === id);
    if (task) task.state = 'active';
    void this.runActivity(id).then((r) => {
      remaining.delete(id);
      if (task) {
        task.state = 'done';
        task.stars = r.stars;
      }
      this.d.clock.cap = requiredLeft() ? actEnd - 1 : actEnd;
    });
  }

  private makeCtx(id: ActivityId, root: THREE.Group, hud: ActivityHud): ActivityContext {
    const d = this.d;
    return {
      scene: d.scene,
      root,
      world: d.world,
      family: d.family,
      fx: d.fx,
      audio: d.audio,
      ui: this.ui,
      hud,
      input: d.input,
      pointer: d.pointer,
      camera: d.camera,
      walker: d.walker,
      npcs: d.npcs,
      interact: d.interactions,
      clock: d.clock,
      plan: this.plan,
      state: this.state,
      rng: new Rng(hashInts(this.plan.seed, hashString(id))),
      settings: d.settings(),
      projector: d.projector,
      renderer: d.renderer,
      wait: (s) => this.wait(s),
      rumble: d.rumble,
    };
  }

  private cleanupActivity(c: Running): void {
    const d = this.d;
    try {
      c.activity.dispose();
    } catch (e) {
      console.error(`[morning] activity '${c.id}' crashed in dispose`, e);
    }
    disposeTree(c.ctx.root);
    d.pointer.disable();
    d.ui.prompt(null);
    d.ui.instruction(null);
    d.ui.portraits(null);
    d.ui.activityLayer().textContent = '';
    d.walker.enabled = true;
    d.walker.speed = 2.4;
    d.camera.follow(null);
  }

  private async runActivity(id: ActivityId): Promise<ActivityResult> {
    const d = this.d;
    const info = ACTIVITIES[id];
    const root = new THREE.Group();
    root.name = `activity:${id}`;
    d.scene.add(root);
    const hud: ActivityHud = { tasks: null, objective: null, meters: null };
    const ctx = this.makeCtx(id, root, hud);
    const run: Running = { id, activity: info.create(), ctx, hud, failed: false, age: 0 };
    this.current = run;
    d.ui.prompt(null);
    try {
      run.activity.start(ctx);
    } catch (e) {
      console.error(`[morning] activity '${id}' crashed in start`, e);
      run.failed = true;
    }
    await this.waitUntil(() => run.failed || run.activity.done);
    let result: ActivityResult = { stars: 2, flags: [] };
    if (!run.failed) {
      try {
        const r = run.activity.result();
        result = { stars: clampStars(r.stars), flags: Array.isArray(r.flags) ? r.flags.slice(0, 32) : [] };
      } catch (e) {
        console.error(`[morning] activity '${id}' crashed in result`, e);
      }
    }
    this.cleanupActivity(run);
    this.current = null;
    this.records.push({ id, label: info.label, stars: result.stars, flags: result.flags });
    for (const f of result.flags) this.state.flags.add(f);
    if (info.banner) {
      d.ui.banner(info.banner, 'secured', { icon: info.icon });
      d.audio.play('taskDone');
    }
    return result;
  }

  private finish(): void {
    if (this.done) return;
    const d = this.d;
    const arrival = Math.min(SCHOOL_DEADLINE, d.clock.minutes);
    d.clock.mode = 'hold';
    this.report = buildReport({
      plan: this.plan,
      records: this.records,
      arrival,
      playSeconds: this.realSeconds,
      flags: [...this.state.flags],
      hair: this.state.hair,
      loud: this.state.loud,
      dogName: d.dogName(),
      bestArrival: d.bestArrival(),
    });
    this.done = true;
  }
}

function clampStars(s: unknown): Stars {
  const n = typeof s === 'number' && Number.isFinite(s) ? Math.round(s) : 2;
  return (n <= 1 ? 1 : n >= 3 ? 3 : 2) as Stars;
}

function safeScheme(a: Activity): ControlScheme | null {
  try {
    return a.controls();
  } catch {
    return null;
  }
}
