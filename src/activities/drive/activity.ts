// ─────────────────────────────────────────────────────────────────────────────
// ACT V — THE SCHOOL RUN (docs/GDD.md §8). Load the girls into the minivan
// (click-click-click), cut to the neighbourhood road, drive to Maple Grove
// Elementary through the morning's wholesome events (DriveSim), pull into the
// drop-off lane — the clock HOLDS: that's the arrival time — the girls hop out,
// run to the door, turn and wave "BYE! LOVE YOU!", confetti + bell + fireworks,
// and the end card: "Somehow, everybody makes it out the door."
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import type { LoopHandle } from '../../audio/types';
import { GIRLS, type Character, type GirlId } from '../../family/types';
import type { ControlScheme, GameControls } from '../../input/types';
import type { ActivityResult } from '../../plan/types';
import type { BubbleHandle, PromptSpec } from '../../ui/types';
import type { CarHandle, World } from '../../world/types';
import { clockLabel } from '../../game/clock';
import { routeBuilder, type RouteWithExtras } from '../../world/route';
import { CROSSWALKS, CROSSWALK_STOP, EVENT_S0, EVENT_S1, INTERSECTIONS, LIGHTS } from '../../world/route/layout';
import { ARRIVE_LINE, CHRIS_BYE, CUE_LINES, Chatter, HURRY_LINE, IDLE_LINES, SPOT_LINES, START_LINES, type Line } from './chatter';
import { Ball, CrossingGuard, GarbageTruck, Geese, GreenLights, Jogger, Puddle, Sprinkler, type Cue } from './events';
import { DriveHud } from './hud';
import { TUNE, headingOf, steerOf } from './model';
import { placeEvents, type Placed } from './placement';
import { DRIVE_RATE, HURRY_AT, LOAD_RATE, SKIP_ARRIVAL, scoreDrive } from './scoring';
import { DriveSim, bayStopS, type DriveInput } from './sim';
import { DriveView } from './view';

type Phase = 'load' | 'cut' | 'drive' | 'arrive' | 'done';

const SCHEME_DRIVE: ControlScheme = {
  move: 'x',
  moveLabel: 'STEER',
  primary: { label: 'GAS', icon: 'gas', hold: true },
  secondary: { label: 'BRAKE', icon: 'brake', hold: true },
  alt: { label: 'HONK', icon: 'honk' },
};

// prompts (constant objects: the UI is only told when the reference changes)
const P_GAS: PromptSpec = { text: 'Hold for GAS — faster!', slot: 'primary', hold: true };
const P_BRAKE_LINE: PromptSpec = { text: 'BRAKE — stop at the line', slot: 'secondary', hold: true };
const P_BRAKE: PromptSpec = { text: 'BRAKE!', slot: 'secondary', hold: true };
const P_HONK: PromptSpec = { text: 'Honk politely (or wait)', slot: 'alt' };
const P_LANE: PromptSpec = { text: 'Change lanes to pass', slot: 'move' };
const P_SPLASH: PromptSpec = { text: 'Steer into the right lane!', slot: 'move' };
const P_BAY: PromptSpec = { text: 'Steer right into the DROP-OFF lane', slot: 'move' };
const P_STOP_SCHOOL: PromptSpec = { text: 'BRAKE by the school door', slot: 'secondary', hold: true };
const P_GREEN: PromptSpec = { text: 'Hold GAS to catch the green!', slot: 'primary', hold: true };

/** Routes are cached per world (the minivan stays parked on it behind the report card). */
const ROUTES = new WeakMap<World, RouteWithExtras>();

interface Tween {
  t: number;
  dur: number;
  step: (k: number) => void;
  done?: () => void;
}

interface Walker {
  c: Character;
  pts: THREE.Vector3[];
  i: number;
  speed: number;
  faceAtEnd: THREE.Vector3 | null;
  arrived: boolean;
}

/** Chris is tall: sink him a little into the driver's seat so his hair clears the van's roof. */
const CHRIS_SINK = 0.16;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class DriveActivity implements Activity {
  readonly id = 'drive' as const;
  private c: ActivityContext | null = null;
  private phase: Phase = 'load';
  private finished = false;
  private skipped = false;
  private phaseT = 0;
  // route + sim
  private route: RouteWithExtras | null = null;
  private builder: Generator<number, RouteWithExtras, void> | null = null;
  private sim: DriveSim | null = null;
  private placed: Placed[] = [];
  private view: DriveView | null = null;
  private hud: DriveHud | null = null;
  private chatter: Chatter | null = null;
  // car + family
  private car: CarHandle | null = null;
  private readonly seatA = new THREE.Group();
  private readonly seatB = new THREE.Group();
  private chrisSpot = { x: 0, z: 0 };
  private chrisAttached = false;
  private chrisBoarding = false;
  private chrisArrived = false;
  private chrisParent: THREE.Object3D | null = null;
  private readonly girlState = new Map<GirlId, 'walk' | 'arrived' | 'boarding' | 'seated' | 'out'>();
  private readonly girlSeat = new Map<GirlId, number>();
  private boardOrder = 0;
  private slideOpen = 0;
  private slideOpened = false;
  private slideTarget = 0;
  private driverDoor = 0;
  private driverDoorTarget = 0;
  private readonly tweens: Tween[] = [];
  private readonly walkers: Walker[] = [];
  private readonly bubbles: { h: BubbleHandle; obj: THREE.Object3D }[] = [];
  private readonly shadowCasters = new Map<THREE.Mesh, boolean>();
  private lastLine: BubbleHandle | null = null;
  private engine: LoopHandle | null = null;
  private readyT = -1;
  // driving
  private laneArmed = true;
  private honkCooldown = 0;
  private lastSpeech = -10;
  private idleT = 6;
  private idleI = 0;
  private lastLane = 1;
  private prompt: PromptSpec | null = null;
  private hurryShown = false;
  private readonly input: DriveInput = { gas: 0, brake: 0, lane: 0, honk: false };
  private readonly resolved: boolean[] = [];
  private brakeSqueakT = 0;
  private narrow: boolean | null = null;
  // arrival
  private arrival = 0;
  private arriveStep = 0;
  private loadSeconds = 0;
  private driveSeconds = 0;
  private readonly camGoal = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 55 };

  // ── Activity ───────────────────────────────────────────────────────────────

  start(ctx: ActivityContext): void {
    this.c = ctx;
    const { world, family, npcs, walker, clock } = ctx;
    this.chatter = new Chatter(ctx.rng);
    this.car = world.car('minivan');
    walker.enabled = false;
    clock.mode = 'run';
    clock.rate = LOAD_RATE;
    // events along the route (the route layout is fixed; houses/colours vary with the seed)
    this.placed = placeEvents(ctx.plan.drive, {
      crosswalks: CROSSWALKS,
      lights: LIGHTS,
      intersections: INTERSECTIONS,
      s0: EVENT_S0,
      s1: EVENT_S1,
      guardMax: 470,
    });
    // reuse / (re)build the route incrementally during the loading cutscene
    const seed = (ctx.plan.cosmeticSeed ^ 0x5eed) >>> 0;
    const cached = ROUTES.get(world);
    if (cached && cached.extras.seed === seed) {
      this.route = cached;
      cached.root.visible = true;
    } else {
      if (cached) {
        if (this.car.root.parent && isUnder(this.car.root, cached.root)) world.root.add(this.car.root);
        cached.dispose();
        ROUTES.delete(world);
      }
      this.builder = routeBuilder(world, seed);
    }
    // family setup for the school run
    family.chris.setOutfit('day');
    family.chris.setHold('none');
    family.chris.setPose('stand');
    family.chris.emote(null);
    for (const g of GIRLS) {
      const girl = family.girl(g);
      girl.setOutfit('day');
      girl.setPose('stand');
      girl.emote(null);
      girl.setExpression('happy');
      this.girlState.set(g, 'walk');
    }
    // doors, camera
    world.door('front').open();
    ctx.camera.shot({ position: { x: -9.3, y: 3.7, z: 11.2 }, target: { x: -11.5, y: 1.0, z: 2.7 }, fov: 48 }, 3);
    this.installDebug();
    // walk everybody to the van
    const side = world.anchor('carSide');
    const order = [...GIRLS].sort((a, b) => dist2(family.girl(a).root.position, side) - dist2(family.girl(b).root.position, side));
    order.forEach((g, i) => {
      const girl = family.girl(g);
      const spot = { x: side.x + 0.35 * i, y: 0, z: side.z + 0.8 * i };
      void npcs.walkTo(girl, spot, { style: 'run', speed: 2.8, faceYaw: side.yaw }).then(() => {
        if (this.girlState.get(g) === 'walk' && this.phase === 'load') this.girlState.set(g, 'arrived');
      });
    });
    const drv = world.anchor('carDriver');
    void walker.walkTo(drv, { speed: 2.9, faceYaw: drv.yaw }).then(() => {
      this.chrisArrived = true;
    });
    // the dog comes out to say goodbye
    const dog = family.dog;
    npcs.stop(dog);
    const ds = world.anchor('drivewayEnd');
    void npcs.walkTo(dog, { x: ds.x + 2.2, y: 0, z: ds.z - 3.2 }, { speed: 2.6 }).then(() => {
      if (this.phase !== 'load') return;
      npcs.faceToward(dog, world.anchor('carSide'));
      dog.setPose('sit');
      dog.play('wag', { loop: true });
    });
    this.hud = typeof document !== 'undefined' ? new DriveHud(ctx.ui.activityLayer()) : null;
    ctx.hud.objective = 'Everybody into the van!';
    ctx.hud.tasks = null;
    ctx.hud.meters = null;
  }

  controls(): ControlScheme | null {
    return this.phase === 'drive' ? SCHEME_DRIVE : null;
  }

  get done(): boolean {
    return this.finished;
  }

  update(dt: number, controls: GameControls): void {
    const c = this.c;
    if (!c || this.finished) return;
    try {
      this.step(c, dt, controls);
    } catch (e) {
      // never throw from update: finish gracefully
      console.error('[drive] update failed, wrapping up', e);
      this.skip();
    }
  }

  result(): ActivityResult {
    if (this.skipped || !this.sim) return { stars: 2, flags: ['drive:clean', 'drive:guard'] };
    try {
      const sc = scoreDrive(this.sim.summary(), this.arrival);
      return { stars: sc.stars, flags: sc.flags };
    } catch {
      return { stars: 2, flags: [] };
    }
  }

  skip(): void {
    const c = this.c;
    if (!c || this.finished) return;
    try {
      this.finishRouteNow();
      const route = this.route!;
      const car = this.car!;
      // car parked in the drop-off bay
      route.root.add(car.root);
      car.root.position.set(route.dropoff.x, 0, -bayStopS(route.dropoff));
      car.root.rotation.set(0, Math.PI, 0, 'YXZ');
      for (const d of [0, 1, 2, 3] as const) car.setDoor(d, 0);
      car.setBrakeLights(true);
      if (!this.chrisAttached) this.attachChris(true);
      this.snapChrisSeat();
      // girls at the school door, waving
      const door = route.extras.schoolDoor;
      GIRLS.forEach((g, i) => {
        const girl = c.family.girl(g);
        c.npcs.release(girl);
        if (girl.root.parent !== c.scene) c.scene.attach(girl.root);
        girl.setPose('stand');
        girl.setMotion(0);
        route.pointAt(door.s - 1.4 + i * 1.4, door.x - 0.6, tmpV);
        girl.root.position.copy(tmpV);
        girl.root.rotation.set(0, -Math.PI / 2, 0);
        this.setCasting(girl.root, true);
        this.girlState.set(g, 'out');
      });
      if (c.clock.minutes < SKIP_ARRIVAL) c.clock.advance(SKIP_ARRIVAL - c.clock.minutes);
      c.clock.mode = 'hold';
      this.arrival = c.clock.minutes;
    } catch (e) {
      console.error('[drive] skip failed', e);
    }
    this.tweens.length = 0;
    this.walkers.length = 0;
    this.skipped = true;
    this.phase = 'done';
    this.finished = true;
  }

  dispose(): void {
    const c = this.c;
    if (!c) return;
    this.engine?.stop();
    this.engine = null;
    for (const b of this.bubbles) b.h.close();
    this.bubbles.length = 0;
    try {
      this.finishRouteNow();
    } catch {
      /* ignore */
    }
    for (const m of this.shadowCasters.keys()) m.castShadow = true;
    this.shadowCasters.clear();
    this.view?.dispose();
    this.view = null;
    this.hud?.dispose();
    this.hud = null;
    const { family, walker, world, npcs } = c;
    // Chris back on his own feet at home (the report card follows; the next morning resets everything)
    const chris = family.chris;
    if (this.chrisAttached) {
      (this.chrisParent ?? c.scene).add(chris.root);
      this.chrisAttached = false;
    }
    this.seatA.removeFromParent();
    chris.cancelAction();
    chris.setPose('stand');
    chris.setHold('none');
    const drv = world.anchor('carDriver');
    walker.teleport(drv.x, drv.z + 0.6, 0);
    c.camera.rig.snap();
    // girls stay at school (never left parented to the car)
    for (const g of GIRLS) {
      const girl = family.girl(g);
      if (this.car && isUnder(girl.root, this.car.root)) c.scene.attach(girl.root);
      girl.cancelAction();
      if (girl.pose !== 'stand') girl.setPose('stand');
      girl.setMotion(0);
    }
    // the dog trots back to Chris
    family.dog.cancelAction();
    family.dog.setPose('stand');
    npcs.follow(family.dog, chris.root, { distance: 1.2 });
    world.door('front').close();
    if (this.route) {
      for (let i = 0; i < this.route.lights.length; i++) this.route.setLight(i, 'green');
      ROUTES.set(world, this.route);
    }
    c.hud.objective = null;
    c.ui.prompt(null);
    try {
      if (typeof window !== 'undefined') delete (window as unknown as { __BHD_DRIVE__?: unknown }).__BHD_DRIVE__;
    } catch {
      /* ignore */
    }
  }

  /** Test mode only (?test=1): a tiny handle for walkthroughs / e2e. */
  private installDebug(): void {
    try {
      if (typeof window === 'undefined' || !/[?&]test=1/.test(window.location.search)) return;
      (window as unknown as { __BHD_DRIVE__?: unknown }).__BHD_DRIVE__ = {
        phase: () => this.phase,
        s: () => this.sim?.car.s ?? -1,
        v: () => this.sim?.car.v ?? 0,
        lane: () => this.sim?.car.lane ?? -1,
        bumps: () => this.sim?.bumps ?? 0,
        events: () => this.sim?.events.map((e) => `${e.kind}@${Math.round(e.s)}:${e.result}`) ?? this.placed.map((p) => `${p.kind}@${Math.round(p.s)}`),
        autopilot: (on = true) => {
          if (this.sim) this.sim.autopilot = on;
          return !!this.sim;
        },
        /** Jump the van to s (metres) — for screenshots. */
        warp: (s: number) => {
          if (!this.sim || !Number.isFinite(s)) return false;
          this.sim.car.s = s;
          return true;
        },
        arrival: () => this.arrival,
        state: () => ({
          t: +this.phaseT.toFixed(2),
          girls: GIRLS.map((g) => `${g}:${this.girlState.get(g)}`).join(' '),
          slide: +this.slideOpen.toFixed(2),
          chris: { arrived: this.chrisArrived, attached: this.chrisAttached, boarding: this.chrisBoarding },
          readyT: this.readyT,
          built: !this.builder,
          tweens: this.tweens.length,
        }),
      };
    } catch {
      /* debug only */
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  private step(c: ActivityContext, dt: number, controls: GameControls): void {
    if (!(dt > 0)) return;
    this.phaseT += dt;
    this.runTweens(dt);
    this.runWalkers(dt);
    this.updateBubbles();
    if (this.car) {
      this.slideOpen = approach(this.slideOpen, this.slideTarget, dt / 0.75);
      this.car.setDoor(2, this.slideOpen);
      this.driverDoor = approach(this.driverDoor, this.driverDoorTarget, dt / 0.35);
      this.car.setDoor(0, this.driverDoor);
    }
    if (this.chrisAttached) this.keepChrisSpotFree(c);
    this.hud?.setTouch(c.input.lastDevice === 'touch', this.phase === 'drive');
    switch (this.phase) {
      case 'load':
        this.stepLoad(c, dt);
        break;
      case 'cut':
        this.stepCut(c, dt);
        break;
      case 'drive':
        this.stepDrive(c, dt, controls);
        break;
      case 'arrive':
        this.stepArrive(c, dt);
        break;
      default:
        break;
    }
    if (this.route && this.phase !== 'load') this.route.update(dt, c.camera.camera);
  }

  // ── loading at the house ───────────────────────────────────────────────────

  private stepLoad(c: ActivityContext, dt: number): void {
    const t = this.phaseT;
    this.loadSeconds += dt;
    // build a slice of the route each frame
    if (this.builder) {
      const r = this.builder.next();
      if (r.done) {
        this.route = r.value;
        this.builder = null;
      }
    }
    if (t > 0.5 && !this.slideOpened) {
      this.slideOpened = true;
      this.slideTarget = 1;
      c.audio.play('slidingDoor');
    }
    // stragglers get a gentle teleport after a while (never stuck)
    if (t > 7.5) {
      const side = c.world.anchor('carSide');
      for (const g of GIRLS)
        if (this.girlState.get(g) === 'walk') {
          c.npcs.place(c.family.girl(g), { x: side.x, y: 0, z: side.z + 0.6 }, side.yaw);
          this.girlState.set(g, 'arrived');
        }
      if (!this.chrisArrived) {
        const d = c.world.anchor('carDriver');
        c.walker.teleport(d.x, d.z, d.yaw);
        this.chrisArrived = true;
      }
    }
    // girls hop in one at a time once the door is open
    if (this.slideOpen > 0.9 && !GIRLS.some((g) => this.girlState.get(g) === 'boarding'))
      for (const g of GIRLS)
        if (this.girlState.get(g) === 'arrived') {
          this.boardGirl(c, g);
          break;
        }
    // Chris gets in
    if (this.chrisArrived && !this.chrisAttached && !this.chrisBoarding) {
      this.chrisBoarding = true;
      this.driverDoorTarget = 1;
      c.audio.play('carDoor');
      this.tweens.push({ t: 0, dur: 0.3, step: () => {}, done: () => this.attachChris(false) });
    }
    const allIn = GIRLS.every((g) => this.girlState.get(g) === 'seated');
    const chrisIn = this.chrisAttached && !this.chrisBoarding;
    if (allIn && this.slideTarget === 1 && this.slideOpen > 0.99) {
      this.slideTarget = 0;
      c.audio.play('slidingDoor', { delay: 0.1 });
    }
    if (allIn && chrisIn && this.slideOpen < 0.02 && this.readyT < 0) {
      this.readyT = t;
      c.audio.play('carStart');
      c.family.dog.cancelAction();
      c.family.dog.play('bark');
      c.audio.play('dogBark', { delay: 0.15 });
      this.bubbleOn(c.family.dog.socket('overhead'), 'Woof! (Bye!)', 'dog', 'shout', 1.6);
      for (const g of GIRLS) c.family.girl(g).play('wave');
    }
    if (this.readyT >= 0 && t - this.readyT > 1.3) {
      // finish the route build if the frames ran out
      this.finishRouteNow();
      this.phase = 'cut';
      this.phaseT = 0;
      c.clock.mode = 'hold';
      this.hud?.setFade(1);
    }
  }

  private boardGirl(c: ActivityContext, g: GirlId): void {
    const car = this.car!;
    const girl = c.family.girl(g);
    const seatIndex = 2 + this.boardOrder++;
    this.girlSeat.set(g, seatIndex);
    this.girlState.set(g, 'boarding');
    c.npcs.release(girl);
    car.root.attach(girl.root);
    const seat = car.seats[seatIndex] ?? car.seats[2]!;
    const from = girl.root.position.clone();
    const yaw0 = girl.root.rotation.y;
    girl.play('jump');
    c.audio.play('whoosh', { volume: 0.4, pitch: 1.3 });
    this.tweens.push({
      t: 0,
      dur: 0.6,
      step: (k) => {
        const e = k * k * (3 - 2 * k);
        girl.root.position.set(from.x + (seat.x - from.x) * e, from.y + (seat.y - from.y) * e + Math.sin(Math.PI * k) * 0.45, from.z + (seat.z - from.z) * e);
        girl.root.rotation.set(0, yaw0 + wrap(0 - yaw0) * e, 0);
      },
      done: () => {
        girl.root.position.set(seat.x, seat.y, seat.z);
        girl.root.rotation.set(0, 0, 0);
        girl.setPose('sit', { seatHeight: seat.seatHeight });
        girl.setExpression('joy', 1.2);
        this.setCasting(girl.root, false);
        this.girlState.set(g, 'seated');
        c.audio.play('seatbelt', { delay: 0.15, pitch: 0.95 + seatIndex * 0.05 });
        this.bubbleOn(girl.socket('overhead'), 'click!', g, 'shout', 0.9);
      },
    });
  }

  /** Chris into the driver's seat (walker-safe: see keepChrisSpotFree). */
  private attachChris(instant: boolean): void {
    const c = this.c!;
    const car = this.car!;
    const chris = c.family.chris;
    this.chrisParent = chris.root.parent;
    this.pickChrisSpot(c);
    car.root.add(this.seatA);
    this.seatA.add(this.seatB);
    // start where he stands, in car space
    chris.root.getWorldPosition(tmpV);
    car.root.worldToLocal(tmpV);
    this.seatA.position.copy(tmpV);
    const carYaw = car.root.getWorldQuaternion(new THREE.Quaternion());
    const chrisQ = chris.root.getWorldQuaternion(new THREE.Quaternion());
    const localYaw = new THREE.Euler().setFromQuaternion(carYaw.invert().multiply(chrisQ), 'YXZ').y;
    this.seatA.rotation.set(0, localYaw, 0);
    this.seatB.position.set(-this.chrisSpot.x, 0, -this.chrisSpot.z);
    this.seatB.add(chris.root);
    c.walker.teleport(this.chrisSpot.x, this.chrisSpot.z, 0);
    this.chrisAttached = true;
    const seat = car.seats[0]!;
    const from = this.seatA.position.clone();
    const yaw0 = localYaw;
    const finish = () => {
      this.snapChrisSeat();
      this.chrisBoarding = false;
      this.driverDoorTarget = 0;
      c.audio.play('carDoor', { delay: 0.25, pitch: 0.95 });
    };
    if (instant) {
      finish();
      return;
    }
    this.tweens.push({
      t: 0,
      dur: 0.55,
      step: (k) => {
        const e = k * k * (3 - 2 * k);
        this.seatA.position.set(from.x + (seat.x - from.x) * e, from.y + (seat.y - CHRIS_SINK - from.y) * e + Math.sin(Math.PI * k) * 0.15, from.z + (seat.z - from.z) * e);
        this.seatA.rotation.y = yaw0 + wrap(0 - yaw0) * e;
      },
      done: finish,
    });
  }

  private snapChrisSeat(): void {
    const c = this.c!;
    const seat = this.car!.seats[0]!;
    this.seatA.position.set(seat.x, seat.y - CHRIS_SINK, seat.z);
    this.seatA.rotation.set(0, 0, 0);
    c.family.chris.setPose('drive', { seatHeight: seat.seatHeight });
    c.family.chris.setExpression('happy');
    this.setCasting(c.family.chris.root, false);
  }

  /**
   * The walker keeps writing Chris's root (x, z, yaw) every frame and pushes it out of house colliders. While he
   * sits in the van his root is parked at a FREE house-space spot P inside seatB (offset −P), so the walker's
   * writes are no-ops and he stays in the seat.
   */
  private pickChrisSpot(c: ActivityContext): void {
    const cands: [number, number][] = [];
    const de = c.world.anchor('drivewayEnd');
    cands.push([de.x, de.z], [de.x + 3, de.z + 1], [0, 11.5], [4, 11.8], [-4, 11.8], [8, 9]);
    for (const [x, z] of cands)
      if (c.world.free(x, z, 0.45)) {
        this.chrisSpot = { x, z };
        return;
      }
    this.chrisSpot = { x: de.x, z: de.z };
  }

  private keepChrisSpotFree(c: ActivityContext): void {
    const p = this.chrisSpot;
    if (c.world.free(p.x, p.z, 0.36)) return;
    this.pickChrisSpot(c);
    this.seatB.position.set(-this.chrisSpot.x, 0, -this.chrisSpot.z);
    c.walker.teleport(this.chrisSpot.x, this.chrisSpot.z, 0);
  }

  /** Seated passengers don't need to cast shadows (they're under the van's roof) — saves a lot of triangles. */
  private setCasting(root: THREE.Object3D, on: boolean): void {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!on) {
        if (!this.shadowCasters.has(m) && m.castShadow) this.shadowCasters.set(m, true);
        m.castShadow = false;
      } else if (this.shadowCasters.has(m)) {
        m.castShadow = true;
        this.shadowCasters.delete(m);
      }
    });
  }

  private finishRouteNow(): void {
    if (this.builder) {
      for (;;) {
        const r = this.builder.next();
        if (r.done) {
          this.route = r.value;
          break;
        }
      }
      this.builder = null;
    }
    if (this.route && this.c) ROUTES.set(this.c.world, this.route);
  }

  // ── the cut to the road ────────────────────────────────────────────────────

  private stepCut(c: ActivityContext, _dt: number): void {
    if (this.phaseT < 0.32) return;
    if (!this.sim) {
      const route = this.route!;
      const car = this.car!;
      c.world.door('front').close();
      route.root.add(car.root);
      car.root.rotation.order = 'YXZ';
      this.sim = new DriveSim(
        { length: route.length, crosswalks: route.crosswalks, lights: route.lights, dropoff: route.dropoff, crosswalkStop: CROSSWALK_STOP },
        this.placed,
        c.plan.seed,
        { s: 0, lane: 1, v: 5 },
      );
      for (let i = 0; i < route.lights.length; i++) route.setLight(i, 'green');
      this.view = new DriveView(c.root, route, this.sim, c.plan.cosmeticSeed | 0);
      this.resolved.length = this.sim.events.length;
      const span = route.dropoff.s0 + 10;
      this.hud?.setPins(this.sim.events.map((e) => ({ kind: e.kind, at: e.s / span })));
      this.syncCar(0);
      this.chaseCam(c, true);
      c.camera.rig.snap();
      c.audio.play('whoosh', { volume: 0.5 });
      this.engine = c.audio.loop('engine');
      this.engine.set(0.35, 0.9);
      this.hud?.setFade(1);
    }
    if (this.phaseT > 0.55) {
      this.hud?.setFade(0);
      this.hud?.setDriving(true);
      this.phase = 'drive';
      this.phaseT = 0;
      c.clock.rate = DRIVE_RATE;
      c.clock.mode = 'run';
      const l = this.chatter!.pick(START_LINES);
      if (l) this.say(c, l);
    }
  }

  // ── driving ────────────────────────────────────────────────────────────────

  private stepDrive(c: ActivityContext, dt: number, ctl: GameControls): void {
    const sim = this.sim!;
    const hud = this.hud;
    this.driveSeconds += dt;
    // input: keys / stick / touch / mouse dashboard
    const inp = this.input;
    const up = ctl.moveY > 0.35 ? Math.min(1, (ctl.moveY - 0.2) / 0.6) : 0;
    const down = ctl.moveY < -0.35 ? Math.min(1, (-ctl.moveY - 0.2) / 0.6) : 0;
    inp.gas = Math.max(ctl.primary ? 1 : 0, up, hud?.gasHeld ? 1 : 0);
    inp.brake = Math.max(ctl.secondary ? 1 : 0, down, hud?.brakeHeld ? 1 : 0);
    let lane: -1 | 0 | 1 = hud ? hud.takeLane() : 0;
    if (this.laneArmed && Math.abs(ctl.moveX) > 0.55) {
      lane = ctl.moveX > 0 ? 1 : -1;
      this.laneArmed = false;
    } else if (Math.abs(ctl.moveX) < 0.3) this.laneArmed = true;
    inp.lane = lane;
    this.honkCooldown -= dt;
    const honk = (ctl.altPressed || (hud?.takeHonk() ?? false)) && this.honkCooldown <= 0;
    inp.honk = honk;
    if (honk) {
      this.honkCooldown = 0.35;
      c.audio.play('carHorn');
      c.rumble('light');
    }
    // late wrap-up: everybody hurries so we're never later than 8:05
    sim.hurry = c.clock.minutes >= HURRY_AT;
    if (sim.hurry && !this.hurryShown) {
      this.hurryShown = true;
      this.say(c, HURRY_LINE, true);
    }
    if (c.clock.minutes >= 485 - 1e-3) sim.autopilot = true;
    const wasBraking = this.car ? sim.car.braking : false;
    const v0 = sim.car.v;
    sim.update(dt, inp);
    // lane change tick
    if (sim.car.lane !== this.lastLane) {
      this.lastLane = sim.car.lane;
      c.audio.play('turnSignal', { volume: 0.6 });
    }
    // a soft squeak when braking hard from speed
    this.brakeSqueakT -= dt;
    if (!wasBraking && sim.car.braking && v0 > 7 && inp.brake > 0.5 && this.brakeSqueakT <= 0) {
      this.brakeSqueakT = 2;
      c.audio.play('brake', { volume: 0.5 });
    }
    this.handleCues(c, sim.cues);
    sim.cues.length = 0;
    // mirror the traffic lights
    const route = this.route!;
    for (const i of sim.takeLightChanges(lightScratch)) route.setLight(i, sim.lights[i]!);
    this.syncCar(dt);
    this.view?.update(dt, sim);
    this.chaseCam(c, false);
    // engine
    const vk = sim.car.v / TUNE.max;
    this.engine?.set(0.3 + vk * 0.35, 0.75 + vk * 0.75 + inp.gas * 0.08);
    // HUD
    for (let i = 0; i < sim.events.length; i++) this.resolved[i] = sim.events[i]!.done;
    const span = route.dropoff.s0 + 10;
    const nxt = sim.nextEvent();
    if (hud) {
      hud.update(sim.car.s / span, nxt ? `NEXT: ${nxt.label()}` : 'NEXT: Maple Grove Elementary!', this.resolved);
      const narrow = typeof window !== 'undefined' && window.innerWidth < 760;
      if (narrow !== this.narrow) {
        this.narrow = narrow;
        hud.layout(narrow);
      }
    }
    this.guide(c, sim);
    // idle chatter / sing-along
    this.idleT -= dt;
    if (this.idleT <= 0 && this.driveSeconds - this.lastSpeech > 5) {
      this.idleT = 10 + c.rng.next() * 5;
      const l = IDLE_LINES[this.idleI++ % IDLE_LINES.length]!;
      this.say(c, l);
    }
    // arrived in the bay → the clock stops HERE
    if (sim.arrived) this.beginArrival(c);
  }

  private syncCar(dt: number): void {
    const sim = this.sim!;
    const car = this.car!;
    const s = sim.car;
    car.root.position.set(s.x, 0, -s.s);
    car.root.rotation.set(s.wobble * 0.07, Math.PI - headingOf(s), -s.xv * 0.015, 'YXZ');
    car.roll(s.ds, steerOf(s));
    car.setBrakeLights(s.braking);
    void dt;
  }

  private chaseCam(c: ActivityContext, snap: boolean): void {
    const sim = this.sim!;
    const route = this.route!;
    const s = sim.car;
    const vk = s.v / TUNE.max;
    const g = this.camGoal;
    // portrait phones: higher and a little closer, looking further down the road (less sky, more street)
    const tall = c.camera.camera.aspect < 1 ? 1 : 0;
    route.pointAt(s.s - 8.6 - vk * 1.4 + tall * 1.2, s.x * 0.55, tmpV);
    g.position.x = tmpV.x;
    g.position.y = 4.2 + vk * 0.3 + tall * 2.6;
    g.position.z = tmpV.z;
    route.pointAt(s.s + 7 + vk * 4 + tall * 3, s.x * 0.8, tmpV2);
    g.target.x = tmpV2.x;
    g.target.y = 1.2 - tall * 0.9;
    g.target.z = tmpV2.z;
    g.fov = 54 + vk * 6 - tall * 4;
    c.camera.shot(g, snap ? 100 : 5.5);
  }

  /** Objective line + glyph prompt for what's ahead. */
  private guide(c: ActivityContext, sim: DriveSim): void {
    const car = sim.car;
    const f = sim.front;
    const D = sim.route.dropoff;
    let obj = 'Drive to school — GAS to go faster, BRAKE to stop';
    let p: PromptSpec = P_GAS;
    if (f >= D.s0 - 48) {
      obj = 'Maple Grove Elementary! Pull into the drop-off lane';
      p = sim.bayOpen && car.lane < 2 ? P_BAY : car.lane === 2 ? P_STOP_SCHOOL : P_GAS;
    } else {
      for (const e of sim.events) {
        if (e.done && !(e instanceof CrossingGuard && e.phase !== 'clear')) continue;
        const ahead = e.s - f;
        if (ahead > e.spotAt() || ahead < -8) continue;
        if (e instanceof CrossingGuard) {
          if (e.phase === 'wait') break;
          obj = e.reaction === 'none' ? 'Crossing guard! Stop at the line' : 'Wait while the kids cross';
          p = e.reaction === 'none' ? P_BRAKE_LINE : P_GAS;
        } else if (e instanceof Geese) {
          obj = 'Geese crossing! Wait — or honk politely';
          p = P_HONK;
        } else if (e instanceof GreenLights) {
          if (e.color === 'green' && !e.passedOn) {
            obj = 'Green light ahead — catch it!';
            p = P_GREEN;
          } else if (!e.passedOn) {
            obj = e.color === 'red' ? 'Red light — stop at the line' : 'Yellow! Get ready to stop';
            p = P_BRAKE_LINE;
          }
        } else if (e instanceof Sprinkler || e instanceof Puddle) {
          const inRight = car.lane >= 1;
          obj = e instanceof Sprinkler ? (inRight ? 'Sprinkler! Here we go — wheee!' : 'Sprinkler! Drive through it (right lane)') : inRight ? 'Big puddle! Splash time!' : 'Big puddle! Splash through it (right lane)';
          p = inRight ? P_GAS : P_SPLASH;
        } else if (e instanceof Jogger || e instanceof GarbageTruck) {
          const o = e instanceof Jogger ? e.jogger : e.truck;
          const inLane = o.onRoad && Math.abs(o.x - car.x) < 2.2 && o.s > car.s - 3;
          obj = e instanceof Jogger ? (inLane ? 'Jogger with a stroller — change lanes to pass' : 'Passing the jogger — wave hello!') : inLane ? 'Garbage truck! Change lanes to pass' : 'Passing the garbage truck!';
          p = inLane ? P_LANE : P_GAS;
        } else if (e instanceof Ball) {
          obj = e.launched ? 'BALL! Brake!' : 'Kids playing ball — careful';
          p = e.launched ? P_BRAKE : P_GAS;
        }
        break;
      }
    }
    c.hud.objective = obj;
    if (p !== this.prompt) {
      this.prompt = p;
      c.ui.prompt(p);
    }
  }

  private handleCues(c: ActivityContext, cues: readonly Cue[]): void {
    const sim = this.sim!;
    const view = this.view;
    for (const q of cues) {
      const ev = q.ev >= 0 ? sim.events[q.ev] : undefined;
      switch (q.type) {
        case 'spot':
          if (ev) {
            const l = this.chatter!.pick(SPOT_LINES[ev.kind]);
            if (l) this.say(c, l, true);
            if (ev.kind === 'crossingGuard' || ev.kind === 'garbageTruck' || ev.kind === 'geese') this.pointAll(c);
          }
          break;
        case 'guardOut':
          if (view?.guardChar) this.bubbleOn(view.guardChar.socket('overhead'), 'STOP! Kids crossing!', 'extra', 'shout', 2.2);
          break;
        case 'kidsCross':
          for (const k of view?.guardKids ?? []) k.play('wave');
          break;
        case 'guardThanks': {
          const g = view?.guardChar;
          if (g) {
            g.play('wave');
            g.setExpression('joy', 2);
            g.emote('heart', 1.6);
            this.bubbleOn(g.socket('overhead'), 'Thank you!', 'extra', 'say', 2);
            c.fx.burst('star', g.socket('overhead').getWorldPosition(tmpV), { count: 12 });
          }
          c.audio.play('star', { pitch: 1.2 });
          this.girlsWave(c);
          this.sayCue(c, 'guardThanks');
          c.rumble('light');
          break;
        }
        case 'guardTsk': {
          const g = view?.guardChar;
          if (g) {
            g.play('shakeHead');
            g.setExpression('smug', 2);
            this.bubbleOn(g.socket('overhead'), 'Tsk tsk! Stop at the line, please!', 'extra', 'say', 2.4);
          }
          this.sayCue(c, 'guardTsk');
          break;
        }
        case 'guardBack': {
          const g = view?.guardChar;
          if (g) {
            g.play('wave');
            this.bubbleOn(g.socket('overhead'), 'Have a great day!', 'extra', 'say', 1.8);
          }
          break;
        }
        case 'geeseGo':
          c.audio.play('honkGoose', { volume: 0.6 });
          break;
        case 'geeseHurry':
          view?.flapGeese(2.4);
          c.audio.play('honkGoose');
          c.audio.play('honkGoose', { delay: 0.25, pitch: 1.2 });
          this.gooseBubble(c, 'HONK! HONK!');
          this.sayCue(c, 'geeseHurry');
          break;
        case 'geeseHonkBack':
          view?.flapGeese(1);
          c.audio.play('honkGoose', { pitch: 0.9 });
          this.gooseBubble(c, 'HONK?!');
          break;
        case 'geeseFlap':
          view?.flapGeese(1.4);
          c.audio.play('honkGoose', { pitch: 1.15 });
          this.gooseBubble(c, 'HONK!');
          this.sayCue(c, 'geeseFlap');
          break;
        case 'lightYellow':
          break;
        case 'lightRed':
          break;
        case 'lightGreen':
          if (sim.car.v < 0.5) this.say(c, { who: 'girls', text: 'GREEN! Go go go!', mood: 'excited', style: 'shout' }, true);
          break;
        case 'greenBonus':
          c.audio.play('taskDone');
          c.rumble('light');
          this.sayCue(c, 'greenBonus');
          this.cheerSeats(c);
          break;
        case 'redWait':
          this.sayCue(c, 'redWait');
          break;
        case 'sprinklerSplash':
          this.splashCar(c, 'splash');
          this.sayCue(c, 'sprinklerSplash');
          this.cheerSeats(c);
          break;
        case 'puddleSplash':
          this.splashCar(c, 'splash');
          this.sayCue(c, 'puddleSplash');
          this.cheerSeats(c);
          break;
        case 'sprinklerMiss':
          this.sayCue(c, 'sprinklerMiss');
          break;
        case 'puddleMiss':
          this.sayCue(c, 'puddleMiss');
          break;
        case 'joggerPass': {
          const j = view?.joggerChar;
          if (j) {
            j.play('wave');
            this.bubbleOn(j.socket('overhead'), 'Morning! Hee hee!', 'extra', 'say', 1.8);
          }
          this.girlsWave(c);
          this.sayCue(c, 'joggerPass');
          break;
        }
        case 'joggerBye':
          view?.joggerChar?.play('wave');
          this.sayCue(c, 'joggerBye');
          break;
        case 'truckBin':
          if (Math.abs((ev?.s ?? 0) - sim.car.s) < 60) c.audio.play('binThud', { volume: 0.5 });
          break;
        case 'truckPass': {
          c.audio.play('carHorn', { pitch: 0.55, volume: 0.9 });
          c.audio.play('carHorn', { pitch: 0.55, volume: 0.9, delay: 0.28 });
          c.audio.play('kidsYay', { delay: 0.2 });
          const at = view?.truckPos(tmpV);
          if (at) {
            const h = c.ui.bubble(at, 'HONK HONK! Have a great day!', { speaker: 'extra', style: 'shout', seconds: 1.8 });
            void h;
          }
          this.sayCue(c, 'truckPass');
          this.cheerSeats(c);
          break;
        }
        case 'truckPullOver':
          break;
        case 'ballGo':
          c.audio.play('boing', { volume: 0.5, pitch: 1.3 });
          view?.ballKid?.play('gasp');
          if (view?.ballKid) this.bubbleOn(view.ballKid.socket('overhead'), 'My ball!', 'extra', 'shout', 1.4);
          break;
        case 'ballSaved':
          view?.ballKid?.play('thumbsUp');
          if (view?.ballKid) this.bubbleOn(view.ballKid.socket('overhead'), 'Thanks for stopping!', 'extra', 'say', 1.8);
          this.sayCue(c, 'ballSaved');
          break;
        case 'ballBonk':
          c.audio.play('boing');
          c.camera.rig.shake(0.2);
          c.rumble('medium');
          view?.ballKid?.play('cheer');
          if (view?.ballKid) this.bubbleOn(view.ballKid.socket('overhead'), 'Oops! Sorry!', 'extra', 'say', 1.6);
          this.sayCue(c, 'ballBonk');
          break;
        case 'bump':
          c.audio.play('brake');
          c.audio.play('boing', { delay: 0.12, volume: 0.6 });
          c.camera.rig.shake(0.3);
          c.rumble('medium');
          this.oops(c);
          if (q.what === 'goose') {
            view?.flapGeese(1.8);
            c.audio.play('honkGoose', { delay: 0.2 });
            this.gooseBubble(c, 'HONK!!');
          }
          this.sayCue(c, 'bump', true);
          break;
        case 'assist':
          c.audio.play('brake', { volume: 0.6 });
          c.camera.rig.shake(0.12);
          break;
        case 'laneBlocked':
          c.audio.play('turnSignal', { volume: 0.4, pitch: 0.8 });
          this.sayCue(c, 'laneBlocked');
          break;
        case 'bayHint':
          this.sayCue(c, 'bayHint', true);
          this.pointAll(c);
          break;
        case 'bayAssist':
          this.sayCue(c, 'bayAssist');
          break;
        case 'closePass':
        case 'arrived':
        default:
          break;
      }
    }
  }

  // ── arrival + goodbye ──────────────────────────────────────────────────────

  private beginArrival(c: ActivityContext): void {
    if (this.phase === 'arrive') return;
    // the arrival time is the clock right now
    c.clock.mode = 'hold';
    this.arrival = c.clock.minutes;
    this.phase = 'arrive';
    this.phaseT = 0;
    this.arriveStep = 0;
    if (this.lastLine?.open) this.lastLine.close();
    this.hud?.setDriving(false);
    c.ui.prompt(null);
    this.prompt = null;
    c.hud.objective = 'Drop-off time!';
    this.engine?.set(0.22, 0.7);
    this.car!.setBrakeLights(true);
    c.rumble('score');
    const view = this.view;
    if (view) {
      view.teacher.play('wave');
      this.bubbleOn(view.teacher.socket('overhead'), 'Good morning, girls!', 'extra', 'say', 2.2);
    }
  }

  private stepArrive(c: ActivityContext, dt: number): void {
    const t = this.phaseT;
    const route = this.route!;
    const car = this.car!;
    this.view?.update(dt, this.sim!);
    this.syncCar(dt);
    // camera: from the road, looking at the van's door and the school entrance
    const cs = this.sim!.car.s;
    const tall = c.camera.camera.aspect < 1;
    const wide = t > 5.2;
    if (tall) {
      // portrait: look across the van at the school door, from the far side of the street
      route.pointAt(cs - (wide ? 6 : 4), wide ? -2.6 : -2.2, tmpV);
      route.pointAt(cs + 0.5, wide ? 10.5 : 9.5, tmpV2);
    } else if (wide) {
      route.pointAt(cs - 15, -1.5, tmpV);
      route.pointAt(cs + 1.5, 12, tmpV2);
    } else {
      route.pointAt(cs - 7.8, 0.4, tmpV);
      route.pointAt(cs + 1.8, 11.5, tmpV2);
    }
    const g = this.camGoal;
    g.position.x = tmpV.x;
    g.position.y = tall ? (wide ? 7.4 : 5.6) : wide ? 5.2 : 3.4;
    g.position.z = tmpV.z;
    g.target.x = tmpV2.x;
    g.target.y = tall ? 2.2 : wide ? 3.6 : 1.6;
    g.target.z = tmpV2.z;
    g.fov = tall ? 50 : wide ? 58 : 52;
    c.camera.shot(g, wide ? 1.6 : 3);
    if (this.arriveStep === 0 && t > 0.25) {
      this.arriveStep = 1;
      this.slideTarget = 1;
      c.audio.play('slidingDoor');
    }
    // girls hop out one by one and run to the door
    if (this.arriveStep >= 1 && this.arriveStep <= 3 && t > 0.9 + (this.arriveStep - 1) * 0.55 && this.slideOpen > 0.85) {
      const g2 = [...GIRLS].sort((a, b) => (this.girlSeat.get(b) ?? 0) - (this.girlSeat.get(a) ?? 0))[this.arriveStep - 1]!;
      this.hopOut(c, g2, this.arriveStep - 1);
      this.arriveStep++;
    }
    const allThere = this.walkers.length > 0 && this.walkers.every((w) => w.arrived);
    if (this.arriveStep === 4 && (allThere || t > 7.5)) {
      this.arriveStep = 5;
      this.slideTarget = 0;
      c.audio.play('slidingDoor', { delay: 0.3, volume: 0.7 });
      // BYE! LOVE YOU!
      GIRLS.forEach((g2, i) => {
        const girl = c.family.girl(g2);
        girl.cancelAction();
        girl.play('wave', { loop: true });
        girl.setExpression('joy');
        this.tweens.push({ t: 0, dur: 0.3 + i * 0.35, step: () => {}, done: () => this.say(c, { ...ARRIVE_LINE, who: g2 }, true) });
      });
      c.audio.play('kidsYay', { delay: 0.2 });
      c.audio.play('schoolBell', { delay: 0.6 });
      const door = route.extras.schoolDoor;
      route.pointAt(door.s, door.x - 0.5, tmpV);
      tmpV.y = 2.4;
      c.fx.confetti(tmpV, 3.2, 1);
      c.fx.burst('heart', tmpV, { count: 14 });
      this.tweens.push({
        t: 0,
        dur: 1.3,
        step: () => {},
        done: () => {
          c.family.chris.play('wave');
          this.say(c, CHRIS_BYE, true);
          c.fx.fireworks(3, tmpV2.copy(route.extras.flagTop).setY(4));
          c.audio.play('cheer', { delay: 0.3 });
        },
      });
    }
    if (this.arriveStep === 5 && t > 9.2) {
      this.arriveStep = 6;
      this.hud?.showEndCard(clockLabel(this.arrival));
      c.audio.play('banner');
      c.fx.fireworks(4, tmpV2.copy(route.extras.flagTop).setY(5));
    }
    if (this.arriveStep === 6 && t > 12.4) {
      this.phase = 'done';
      this.finished = true;
    }
    void car;
  }

  private hopOut(c: ActivityContext, g: GirlId, i: number): void {
    const girl = c.family.girl(g);
    const route = this.route!;
    const car = this.car!;
    c.scene.attach(girl.root);
    girl.setPose('stand');
    girl.play('jump');
    this.setCasting(girl.root, true);
    this.girlState.set(g, 'out');
    // out through the sliding door (car right side = route +x), onto the sidewalk, up the walk to the door
    car.root.localToWorld(tmpV.set(-1.7, 0, -0.3 + i * 0.1));
    const pts: THREE.Vector3[] = [];
    const door = route.extras.schoolDoor;
    const lane = (i - 1) * 1.1;
    const cs = this.sim?.car.s ?? door.s;
    pts.push(route.pointAt(cs - 0.5 + lane * 0.5, route.dropoff.x + 3.5, new THREE.Vector3()));
    pts.push(route.pointAt(door.s + lane * 0.8, door.x - 1.2, new THREE.Vector3()));
    pts.push(route.pointAt(door.s + lane, door.x - 0.35, new THREE.Vector3()));
    const from = girl.root.position.clone();
    const to = tmpV.clone();
    this.tweens.push({
      t: 0,
      dur: 0.45,
      step: (k) => {
        girl.root.position.set(from.x + (to.x - from.x) * k, Math.max(0, from.y + (to.y - from.y) * k + Math.sin(Math.PI * k) * 0.35), from.z + (to.z - from.z) * k);
      },
      done: () => {
        girl.root.position.y = 0;
        this.walkers.push({ c: girl, pts, i: 0, speed: 2.4, faceAtEnd: car.root.getWorldPosition(new THREE.Vector3()), arrived: false });
      },
    });
    c.audio.play('whoosh', { volume: 0.35, pitch: 1.2 + i * 0.1 });
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private runTweens(dt: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]!;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(k);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
  }

  private runWalkers(dt: number): void {
    for (const w of this.walkers) {
      if (w.arrived) continue;
      const root = w.c.root;
      let left = w.speed * dt;
      let moved = 0;
      while (left > 1e-4 && w.i < w.pts.length) {
        const p = w.pts[w.i]!;
        const dx = p.x - root.position.x;
        const dz = p.z - root.position.z;
        const d = Math.hypot(dx, dz);
        if (d <= left) {
          root.position.x = p.x;
          root.position.z = p.z;
          left -= d;
          moved += d;
          w.i++;
        } else {
          root.position.x += (dx / d) * left;
          root.position.z += (dz / d) * left;
          root.rotation.y = turn(root.rotation.y, Math.atan2(dx, dz), 10 * dt);
          moved += left;
          left = 0;
        }
      }
      w.c.setMotion(moved / Math.max(1e-4, dt));
      if (w.i >= w.pts.length) {
        w.arrived = true;
        w.c.setMotion(0);
        if (w.faceAtEnd) root.rotation.y = Math.atan2(w.faceAtEnd.x - root.position.x, w.faceAtEnd.z - root.position.z);
      }
    }
  }

  private bubbleOn(obj: THREE.Object3D, text: string, speaker: 'addy' | 'ellie' | 'heidi' | 'chris' | 'dog' | 'extra', style: 'say' | 'shout' | 'sing' | 'whisper', seconds: number): BubbleHandle {
    const c = this.c!;
    const h = c.ui.bubble(obj.getWorldPosition(tmpV), text, { speaker, style, seconds });
    this.bubbles.push({ h, obj });
    return h;
  }

  private updateBubbles(): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i]!;
      if (!b.h.open) {
        this.bubbles.splice(i, 1);
        continue;
      }
      b.h.move(b.obj.getWorldPosition(tmpV));
    }
  }

  private say(c: ActivityContext, l: Line, important = false): void {
    if (!important && this.driveSeconds - this.lastSpeech < 2.2 && this.phase === 'drive') return;
    this.lastSpeech = this.driveSeconds;
    const who = this.chatter!.speaker(l);
    const ch = who === 'chris' ? c.family.chris : c.family.girl(who);
    if (this.phase === 'drive' && this.lastLine?.open) this.lastLine.close();
    this.lastLine = this.bubbleOn(ch.socket('overhead'), l.text, who, l.style ?? 'say', l.style === 'sing' ? 3 : 2.1);
    c.audio.babble(who, l.text, l.mood);
  }

  private sayCue(c: ActivityContext, type: keyof typeof CUE_LINES, important = false): void {
    const l = this.chatter!.pick(CUE_LINES[type]);
    if (l) this.say(c, l, important);
  }

  private girlsWave(c: ActivityContext): void {
    for (const g of GIRLS) c.family.girl(g).play('wave');
  }

  private cheerSeats(c: ActivityContext): void {
    for (const g of GIRLS) {
      const girl = c.family.girl(g);
      girl.play('cheer');
      girl.setExpression('joy', 1.4);
    }
  }

  private pointAll(c: ActivityContext): void {
    const g = GIRLS[Math.floor(c.rng.next() * 3)]!;
    c.family.girl(g).play('point');
  }

  private oops(c: ActivityContext): void {
    for (const g of GIRLS) {
      const girl = c.family.girl(g);
      girl.play('gasp');
      girl.setExpression('surprised', 1);
    }
    c.family.chris.setExpression('eek', 1.2);
    c.family.chris.emote('sweat', 1.4);
  }

  private gooseBubble(c: ActivityContext, text: string): void {
    const at = this.view?.gooseHead(tmpV);
    if (at) c.ui.bubble(at, text, { speaker: 'extra', style: 'shout', seconds: 1.1 });
  }

  private splashCar(c: ActivityContext, sfx: 'splash'): void {
    const sim = this.sim!;
    const route = this.route!;
    c.audio.play(sfx);
    c.rumble('light');
    for (const dx of [-1.1, 1.1]) {
      route.pointAt(sim.car.s - 0.8, sim.car.x + dx, tmpV);
      tmpV.y = 0.4;
      c.fx.burst('splash', tmpV, { count: 26, speed: 1.4, size: 1.3 });
    }
    route.pointAt(sim.car.s + 1.5, sim.car.x, tmpV);
    tmpV.y = 1.8;
    c.fx.burst('splash', tmpV, { count: 16, size: 1.1 });
  }
}

const lightScratch: number[] = [];

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function turn(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max;
}

function dist2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
}

function isUnder(o: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

