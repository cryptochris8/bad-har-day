// ─────────────────────────────────────────────────────────────────────────────
// The wholesome drive events (pure state machines, unit-tested): crossing guard,
// geese, green lights, sprinkler, jogger with stroller, garbage truck, ball,
// puddle. Each event owns its road "obstacles" (route-space boxes the car must
// not run into), an optional stop line, a result, and emits cues for the view
// (animations, sounds, girls' lines). Nothing here touches Three.js or the DOM.
// ─────────────────────────────────────────────────────────────────────────────
import type { DriveEvent } from '../../plan/types';
import { LANE_X } from '../../world/types';
import { CAR, type CarState } from './model';

export type ObstacleKind = 'guard' | 'kid' | 'goose' | 'jogger' | 'truck' | 'ball';

export interface Obstacle {
  readonly kind: ObstacleKind;
  /** Route-space centre, half extents. */
  s: number;
  x: number;
  hs: number;
  hx: number;
  /** Velocity along s / x (m/s). */
  vs: number;
  vx: number;
  /** Height (the ball bounces) and vertical speed. */
  y: number;
  vy: number;
  /** People, animals and vehicles: the car stops short ("Oops!") instead of touching. The ball bonks. */
  readonly solid: boolean;
  /** On the road this frame (blocks the car). */
  onRoad: boolean;
  /** The car is following behind it at a comfortable distance (the player reacted). */
  engaged: boolean;
  /** Already counted as a bump. */
  bumped: boolean;
  /** Visible at all (spawned). */
  shown: boolean;
}

export type EventResult = 'pending' | 'great' | 'good' | 'ok' | 'missed' | 'fun' | 'meh';

export type CueType =
  | 'spot' // the girls notice the event ahead
  | 'guardOut'
  | 'kidsCross'
  | 'guardThanks'
  | 'guardTsk'
  | 'guardBack'
  | 'geeseGo'
  | 'geeseHurry'
  | 'geeseHonkBack'
  | 'geeseFlap'
  | 'lightYellow'
  | 'lightRed'
  | 'lightGreen'
  | 'greenBonus'
  | 'redWait'
  | 'sprinklerSplash'
  | 'sprinklerMiss'
  | 'joggerPass'
  | 'joggerBye'
  | 'truckBin'
  | 'truckPass'
  | 'truckPullOver'
  | 'ballGo'
  | 'ballBonk'
  | 'ballSaved'
  | 'puddleSplash'
  | 'puddleMiss'
  | 'bump'
  | 'assist'
  | 'laneBlocked'
  | 'bayHint'
  | 'bayAssist'
  | 'closePass'
  | 'arrived';

export interface Cue {
  type: CueType;
  /** Event index (−1 = none). */
  ev: number;
  /** Obstacle kind (bumps). */
  what?: ObstacleKind;
}

/** What an event can see / do in the simulation. */
export interface SimCtx {
  readonly car: CarState;
  /** Player input this frame. */
  readonly brake: number;
  readonly honkPressed: boolean;
  /** Late wrap-up: everything hurries. */
  readonly hurry: boolean;
  cue(type: CueType, ev: number, what?: ObstacleKind): void;
  /** Route traffic-light colours (the greenLights event drives one of them). */
  setLight(index: number, color: LightColor): void;
  rand(): number;
}

export type LightColor = 'red' | 'yellow' | 'green';

const front = (c: CarState): number => c.s + CAR.halfLen;

/** The crossing guard steps out when the van's nose is this far from her stop line… */
export const GUARD_WAKE = 110;
/** …and a stop anywhere this close before the line counts as stopping for her. */
export const GUARD_ZONE = 100;
const rear = (c: CarState): number => c.s - CAR.halfLen;

/** The road surface is |x| < this (parking strip included): obstacles beyond it never block. */
export const ROAD_EDGE = 5.1;

export function makeObstacle(kind: ObstacleKind, s: number, x: number, hs: number, hx: number, solid = true): Obstacle {
  return { kind, s, x, hs, hx, vs: 0, vx: 0, y: 0, vy: 0, solid, onRoad: false, engaged: false, bumped: false, shown: false };
}

export abstract class DriveEventLogic {
  abstract readonly kind: DriveEvent;
  /** Counts toward "stops obeyed" in the scoring. */
  abstract readonly isStop: boolean;
  readonly obstacles: Obstacle[] = [];
  result: EventResult = 'pending';
  active = false;
  /** Seconds since activation. */
  t = 0;
  /** Stop-line bookkeeping (managed by the sim). */
  engaged = false;
  assisted = false;
  bumped = false;
  /** Seconds the car has been standing near this event's stop line. */
  standing = 0;
  spotted = false;

  constructor(
    readonly index: number,
    readonly s: number,
  ) {}

  /** Front must stay behind this s while the line is on (null = no line now). */
  stopLine(): number | null {
    return null;
  }

  /** The distance ahead (front → s) at which the girls call it out. */
  spotAt(): number {
    return 60;
  }

  abstract update(sim: SimCtx, dt: number): void;

  /** Resolved (the result is decided); the event keeps animating while the car is near. */
  get done(): boolean {
    return this.result !== 'pending';
  }

  /** A solid obstacle made the car stop short / the ball bonked. */
  onBump(sim: SimCtx, _o: Obstacle): void {
    this.bumped = true;
    void sim;
  }

  /** Short label for the "next up" chip. */
  abstract label(): string;

  protected spot(sim: SimCtx): void {
    if (!this.spotted && this.s - front(sim.car) <= this.spotAt()) {
      this.spotted = true;
      sim.cue('spot', this.index);
    }
  }
}

// ── Crossing guard ───────────────────────────────────────────────────────────

export class CrossingGuard extends DriveEventLogic {
  readonly kind = 'crossingGuard' as const;
  readonly isStop = true;
  /** 'wait' → 'out' (walking into the road) → 'hold' (sign up, kids cross) → 'back' → 'clear'. */
  phase: 'wait' | 'out' | 'hold' | 'back' | 'clear' = 'wait';
  readonly guard: Obstacle;
  readonly kids: Obstacle[];
  /** Reaction shown ('thanks' | 'tsk'), once. */
  reaction: 'none' | 'thanks' | 'tsk' = 'none';
  private kidsStarted = false;
  private kidsT = 0;
  readonly line: number;

  constructor(index: number, s: number, stopBack: number) {
    super(index, s);
    this.line = s - stopBack;
    this.guard = makeObstacle('guard', s + 0.35, 7.3, 0.4, 0.4);
    this.guard.shown = true;
    this.kids = [makeObstacle('kid', s - 0.55, 6.9, 0.35, 0.35), makeObstacle('kid', s + 1.15, 7.5, 0.35, 0.35)];
    for (const k of this.kids) k.shown = true;
    this.obstacles.push(this.guard, ...this.kids);
  }

  label(): string {
    return 'Crossing guard';
  }

  override spotAt(): number {
    return 75;
  }

  override stopLine(): number | null {
    if (this.phase === 'out' || this.phase === 'hold') return this.line;
    if (this.phase === 'back' && this.guard.x < 3.9) return this.line;
    return null;
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const f = front(car);
    this.spot(sim);
    if (this.phase === 'wait') {
      if (f >= this.line - GUARD_WAKE) {
        this.phase = 'out';
        this.active = true;
        sim.cue('guardOut', this.index);
      }
      return;
    }
    this.t += dt;
    const g = this.guard;
    const hurry = sim.hurry ? 1.7 : 1;
    if (this.phase === 'out') {
      g.x = Math.max(0.5, g.x - 2.1 * hurry * dt);
      if (g.x <= 0.5) this.phase = 'hold';
    }
    // kids cross behind her once she is in the road
    if (!this.kidsStarted && (this.phase === 'hold' || g.x < 5.5)) {
      this.kidsStarted = true;
      this.kidsT = this.t;
      sim.cue('kidsCross', this.index);
    }
    if (this.kidsStarted)
      for (let i = 0; i < this.kids.length; i++) {
        const k = this.kids[i]!;
        if (this.t < this.kidsT + 0.3 + i * 0.6) continue;
        k.vx = -2.4 * hurry;
        if (k.x > -9.5) k.x += k.vx * dt;
        else k.vx = 0;
      }
    const kidsDone = this.kidsStarted && this.kids.every((k) => k.x <= -6.2);
    // Stopping ANYWHERE before the line counts (an obedient driver may stop well short of it).
    const beforeLine = f >= this.line - GUARD_ZONE && f <= this.line + 0.6;
    if (car.v < 0.3 && beforeLine) this.standing += dt;
    else if (car.v > 1) this.standing = 0;
    if ((this.phase === 'out' || this.phase === 'hold') && this.reaction === 'none' && car.v < 0.3 && beforeLine) {
      if (this.assisted && !this.engaged) {
        this.reaction = 'tsk';
        this.result = 'missed';
        sim.cue('guardTsk', this.index);
      } else {
        this.reaction = 'thanks';
        this.result = 'good';
        // the player reacted: rolling up to the line afterwards is never an "assist"
        this.engaged = true;
        sim.cue('guardThanks', this.index);
      }
    }
    if (this.phase === 'hold' && kidsDone && (this.standing > 0.6 || sim.hurry)) {
      this.phase = 'back';
      sim.cue('guardBack', this.index);
    }
    // The car can't reach the line without stopping — but if it somehow passes (skip / teleport), wrap up.
    if ((this.phase === 'out' || this.phase === 'hold') && rear(car) > this.s + 2) {
      this.phase = 'back';
      if (this.result === 'pending') this.result = 'good';
    }
    if (this.phase === 'back') {
      g.x = Math.min(7.3, g.x + 2.8 * hurry * dt);
      if (g.x >= 7.3) this.phase = 'clear';
    }
    for (const o of this.obstacles) o.onRoad = Math.abs(o.x) < ROAD_EDGE;
    if (this.phase === 'clear' && this.result === 'pending' && rear(car) > this.s + 3) this.result = 'good';
  }
}

// ── Geese ────────────────────────────────────────────────────────────────────

export class Geese extends DriveEventLogic {
  readonly kind = 'geese' as const;
  readonly isStop = true;
  readonly geese: Obstacle[] = [];
  speed = 1.1;
  /** Flap-run speed after a honk. */
  static readonly SCATTER = 5.2;
  /** Per goose: 0 = not scattering yet, ±1 = the curb it runs to. */
  private readonly scatter: number[] = [];
  /** Seconds the van has been waiting for them before they set off. */
  private waitT = 0;
  hurried = false;
  started = false;
  private honkBackT = 0;
  private closeCued = false;

  constructor(index: number, s: number, count: number, jitter: (i: number) => number) {
    super(index, s);
    const n = Math.max(3, Math.min(7, Math.round(count)));
    for (let i = 0; i < n; i++) {
      const o = makeObstacle('goose', s + jitter(i) * 0.8, -5.7 - i * 0.85, 0.32, 0.3);
      this.geese.push(o);
      this.scatter.push(0);
      this.obstacles.push(o);
    }
  }

  label(): string {
    return 'Geese crossing';
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const f = front(car);
    this.spot(sim);
    if (!this.started) {
      const ahead = this.s - f;
      const tta = ahead / Math.max(car.v, 4);
      // they set off when the van is ~6 s away — or when it has slowed / stopped for them, or honked politely
      if (car.v < 2 && ahead < 70) this.waitT += dt;
      const honked = sim.honkPressed && ahead < 60;
      if (tta <= 6.5 || ahead <= 30 || this.waitT > 0.8 || honked) {
        this.started = true;
        this.active = true;
        for (const gz of this.geese) gz.shown = true;
        sim.cue('geeseGo', this.index);
      } else return;
    }
    this.t += dt;
    const onRoadLeft = this.geese.some((gz) => gz.x < 3.9);
    if (sim.honkPressed && this.s - f < 60 && this.s - f > -2) {
      if (!this.hurried && onRoadLeft) {
        this.hurried = true;
        sim.cue('geeseHurry', this.index);
      } else if (this.honkBackT <= 0) {
        this.honkBackT = 0.8;
        sim.cue('geeseHonkBack', this.index);
      }
    }
    if (this.honkBackT > 0) this.honkBackT -= dt;
    if (sim.hurry && !this.hurried) this.hurried = true;
    let allOff = true;
    for (let i = 0; i < this.geese.length; i++) {
      const gz = this.geese[i]!;
      if (this.hurried) {
        // a polite honk: they flap-run to the NEAREST curb (the ones still on the left lawn stay there)
        if (this.scatter[i] === 0) this.scatter[i] = gz.x >= 0 ? 1 : -1;
        const dir = this.scatter[i]!;
        const target = dir > 0 ? 8.4 : -8.2;
        gz.vx = Math.abs(target - gz.x) < 0.05 ? 0 : dir * Geese.SCATTER;
        gz.x += gz.vx * dt;
        if (dir > 0 ? gz.x > target : gz.x < target) {
          gz.x = target;
          gz.vx = 0;
        }
      } else {
        gz.vx = gz.x < 9.5 ? this.speed : 0;
        gz.x += gz.vx * dt;
      }
      gz.onRoad = Math.abs(gz.x) < ROAD_EDGE;
      // done when every goose is across (or, after a honk, off the road on either side)
      if (this.hurried ? Math.abs(gz.x) < ROAD_EDGE + 0.3 : gz.x < ROAD_EDGE + 0.3) allOff = false;
    }
    // A cheeky close pass (the car zooms past right in front of them): they flap, no penalty.
    if (!this.closeCued && car.v > 6 && Math.abs(car.s - this.s) < 3 && this.geese.some((gz) => gz.onRoad && Math.abs(gz.x - car.x) < 2.2)) {
      this.closeCued = true;
      sim.cue('geeseFlap', this.index);
    }
    if (this.result === 'pending' && (allOff || rear(car) > this.s + 6)) this.result = this.bumped ? 'missed' : 'good';
  }

  override onBump(sim: SimCtx, o: Obstacle): void {
    super.onBump(sim, o);
    this.hurried = true;
    this.result = 'missed';
  }
}

// ── Green lights ─────────────────────────────────────────────────────────────

export const LIGHT_TIMES = { yellow: 10.2, red: 12.7, green: 18.2 } as const;

export class GreenLights extends DriveEventLogic {
  readonly kind = 'greenLights' as const;
  readonly isStop = true;
  color: LightColor = 'green';
  /** At yellow onset: could the car still stop comfortably? (If not, it may pass.) */
  canStop = true;
  passedOn: LightColor | null = null;
  stoppedAtRed = false;
  private cycled = false;

  constructor(
    index: number,
    s: number,
    readonly light: number,
  ) {
    super(index, s);
  }

  label(): string {
    return 'Traffic light';
  }

  override spotAt(): number {
    return 115;
  }

  override stopLine(): number | null {
    if (this.passedOn) return null;
    if (this.color === 'red' || (this.color === 'yellow' && this.canStop)) return this.s;
    return null;
  }

  private set(sim: SimCtx, c: LightColor): void {
    if (this.color === c) return;
    this.color = c;
    sim.setLight(this.light, c);
    sim.cue(c === 'yellow' ? 'lightYellow' : c === 'red' ? 'lightRed' : 'lightGreen', this.index);
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const f = front(car);
    this.spot(sim);
    if (!this.active) {
      if (f >= this.s - 120) {
        this.active = true;
        sim.setLight(this.light, 'green');
      } else return;
    }
    this.t += dt;
    const T = LIGHT_TIMES;
    const hurryRed = sim.hurry && this.t >= T.red;
    if (!this.cycled) {
      if (this.t >= T.green || hurryRed) {
        this.cycled = true;
        this.set(sim, 'green');
      } else if (this.t >= T.red) this.set(sim, 'red');
      else if (this.t >= T.yellow) {
        if (this.color === 'green') {
          const dist = this.s - f;
          this.canStop = dist >= (car.v * car.v) / (2 * 6) + 0.5;
        }
        this.set(sim, 'yellow');
      }
    }
    if (this.color === 'red' && car.v < 0.3 && f >= this.s - 30 && f <= this.s + 0.5) {
      if (!this.stoppedAtRed) sim.cue('redWait', this.index);
      this.stoppedAtRed = true;
    }
    if (!this.passedOn && f > this.s + 0.2) {
      this.passedOn = this.color;
      if (this.stoppedAtRed) this.result = this.assisted && !this.engaged ? 'missed' : 'good';
      else if (this.color === 'green' && !this.cycled) {
        this.result = 'great';
        sim.cue('greenBonus', this.index);
      } else this.result = this.assisted && !this.engaged ? 'missed' : 'ok';
    }
  }
}

// ── Sprinkler ────────────────────────────────────────────────────────────────

/** The sprinkler sprays over the right lane (x > SPRINKLER_X0) around its s. */
export const SPRINKLER_X0 = 0.3;

export class Sprinkler extends DriveEventLogic {
  readonly kind = 'sprinkler' as const;
  readonly isStop = false;
  label(): string {
    return 'Sprinkler!';
  }
  update(sim: SimCtx, _dt: number): void {
    const car = sim.car;
    this.spot(sim);
    if (!this.active && front(car) >= this.s - 60) this.active = true;
    if (this.active && this.result === 'pending' && car.s >= this.s) {
      const through = car.x + CAR.halfWidth > SPRINKLER_X0 + 0.6;
      this.result = through ? 'fun' : 'meh';
      sim.cue(through ? 'sprinklerSplash' : 'sprinklerMiss', this.index);
    }
  }
}

// ── Jogger with a stroller ───────────────────────────────────────────────────

export class Jogger extends DriveEventLogic {
  readonly kind = 'jogger' as const;
  readonly isStop = false;
  readonly jogger: Obstacle;
  lane = 1;
  private offroad = false;
  static readonly SPEED = 3.0;
  static readonly RUN = 85;

  constructor(index: number, s: number) {
    super(index, s);
    // the obstacle box covers the jogger AND the stroller in front of her
    this.jogger = makeObstacle('jogger', s + 0.45, LANE_X[1]!, 1.0, 0.5);
    this.obstacles.push(this.jogger);
  }

  label(): string {
    return 'Jogger ahead';
  }

  override spotAt(): number {
    return 75;
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const j = this.jogger;
    this.spot(sim);
    if (!this.active) {
      if (front(car) >= this.s - 78) {
        this.active = true;
        this.lane = car.lane >= 1 ? 1 : 0;
        j.x = (LANE_X[this.lane] ?? 1.8) + (this.lane === 1 ? 0.55 : -0.55);
        j.shown = true;
      } else return;
    }
    this.t += dt;
    j.vs = Jogger.SPEED;
    j.s += j.vs * dt;
    if (!this.offroad && j.s >= this.s + Jogger.RUN) {
      this.offroad = true;
      if (this.result === 'pending') {
        this.result = this.bumped ? 'missed' : 'ok';
        sim.cue('joggerBye', this.index);
      }
    }
    if (this.offroad) {
      const tx = this.lane === 1 ? 7.4 : -7.4;
      j.vx = Math.sign(tx - j.x) * 1.4;
      if (Math.abs(tx - j.x) < 0.05) j.vx = 0;
      j.x += j.vx * dt;
    }
    j.onRoad = Math.abs(j.x) < 4.0;
    if (this.result === 'pending' && rear(car) > j.s + j.hs) {
      this.result = this.bumped ? 'missed' : 'good';
      sim.cue('joggerPass', this.index);
    }
  }
}

// ── Garbage truck ────────────────────────────────────────────────────────────

export class GarbageTruck extends DriveEventLogic {
  readonly kind = 'garbageTruck' as const;
  readonly isStop = false;
  readonly truck: Obstacle;
  lane = 1;
  /** 'drive' | 'bin' (stopped at a bin, arm lifting) | 'pull' (pulling over) | 'parked'. */
  mode: 'drive' | 'bin' | 'pull' | 'parked' = 'drive';
  modeT = 0;
  /** Arm lift 0..1 (visual). */
  arm = 0;
  static readonly SPEED = 2.4;
  static readonly RUN = 70;

  constructor(index: number, s: number) {
    super(index, s);
    this.truck = makeObstacle('truck', s, LANE_X[1]!, 3.9, 1.15);
    this.obstacles.push(this.truck);
  }

  label(): string {
    return 'Garbage truck';
  }

  override spotAt(): number {
    return 85;
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const tr = this.truck;
    this.spot(sim);
    if (!this.active) {
      if (front(car) >= this.s - 85) {
        this.active = true;
        this.lane = car.lane >= 1 ? 1 : 0;
        tr.x = LANE_X[this.lane] ?? 1.8;
        tr.shown = true;
      } else return;
    }
    this.t += dt;
    this.modeT += dt;
    if (this.mode === 'drive') {
      tr.vs = GarbageTruck.SPEED;
      if (tr.s >= this.s + GarbageTruck.RUN) {
        this.mode = 'pull';
        this.modeT = 0;
        sim.cue('truckPullOver', this.index);
      } else if (this.modeT > 5.5) {
        this.mode = 'bin';
        this.modeT = 0;
        sim.cue('truckBin', this.index);
      }
    } else if (this.mode === 'bin') {
      tr.vs = 0;
      this.arm = Math.sin(Math.min(1, this.modeT / 2.2) * Math.PI);
      if (this.modeT > 2.2) {
        this.arm = 0;
        this.mode = 'drive';
        this.modeT = 0;
      }
    } else if (this.mode === 'pull') {
      tr.vs = 1.6;
      const tx = this.lane === 1 ? 4.3 : -4.3;
      tr.vx = Math.sign(tx - tr.x) * 1.5;
      if (Math.abs(tx - tr.x) < 0.04) {
        tr.x = tx;
        tr.vx = 0;
        this.mode = 'parked';
        this.modeT = 0;
      }
      tr.x += tr.vx * dt;
    } else {
      tr.vs = 0;
      tr.vx = 0;
    }
    tr.s += tr.vs * dt;
    tr.onRoad = Math.abs(tr.x) < 3.95;
    if (this.result === 'pending') {
      if (rear(car) > tr.s + tr.hs) {
        this.result = this.bumped ? 'missed' : 'good';
        sim.cue('truckPass', this.index);
      } else if (this.mode === 'parked' && !tr.onRoad) this.result = this.bumped ? 'missed' : 'ok';
    }
  }
}

// ── Ball ─────────────────────────────────────────────────────────────────────

export class Ball extends DriveEventLogic {
  readonly kind = 'ball' as const;
  readonly isStop = true;
  readonly ball: Obstacle;
  launched = false;
  bonked = false;
  private waitT = 0;
  /** Which lawn the kids play on (+1 right, −1 left). */
  constructor(
    index: number,
    s: number,
    readonly side: 1 | -1,
  ) {
    super(index, s);
    this.ball = makeObstacle('ball', s, side * 9.2, 0.3, 0.3, false);
    this.ball.shown = true;
    this.ball.y = 0.3;
    this.obstacles.push(this.ball);
  }

  label(): string {
    return 'Kids playing';
  }

  override spotAt(): number {
    return 45;
  }

  update(sim: SimCtx, dt: number): void {
    const car = sim.car;
    const b = this.ball;
    const f = front(car);
    this.spot(sim);
    if (!this.launched) {
      // bouncing on the lawn beside the kid until the car gets close (or has slowed right down for them)
      b.y = 0.3 + Math.abs(Math.sin(this.t * 3.4)) * 0.5;
      this.t += dt;
      const trigger = Math.max(12, car.v * 1.75 + 3);
      if (car.v < 3 && this.s - f < 60) this.waitT += dt;
      const waited = this.waitT > 0.6;
      if (this.s - f <= trigger || waited) {
        this.launched = true;
        this.active = true;
        this.t = 0;
        const x0 = this.side * 6.8;
        const tArr = Math.max(0.6, (this.s - f) / Math.max(car.v, 2));
        // (a van that already stopped for the kids sees the ball bounce straight across)
        const sp = Math.max(waited ? 4.5 : 2.4, Math.min(7, Math.abs(x0 - car.x) / tArr));
        b.x = x0;
        b.vx = -this.side * sp;
        b.vy = 2.6;
        b.y = 0.35;
        sim.cue('ballGo', this.index);
      }
      return;
    }
    this.t += dt;
    // bounce
    b.vy -= 14 * dt;
    b.y += b.vy * dt;
    if (b.y < 0.3) {
      b.y = 0.3;
      b.vy = Math.abs(b.vy) * 0.62;
      if (b.vy < 0.8) b.vy = 0;
    }
    // rolls freely across the smooth road, slows down on the grass
    if (Math.abs(b.x) > 8.4) b.vx -= Math.sign(b.vx) * Math.min(Math.abs(b.vx), 2.6 * dt);
    else if (Math.abs(b.vx) < 1.6) b.vx = (b.vx < 0 || (b.vx === 0 && b.x > 0) ? -1 : 1) * 1.6;
    b.vs -= Math.sign(b.vs) * Math.min(Math.abs(b.vs), 2.5 * dt);
    b.x += b.vx * dt;
    b.s += b.vs * dt;
    b.onRoad = Math.abs(b.x) < ROAD_EDGE;
    // contact with the car (a soft cartoon "boing")
    if (!this.bonked && b.onRoad && Math.abs(b.x - car.x) < CAR.halfWidth + b.hx && f >= b.s - b.hs && rear(car) <= b.s + b.hs) {
      this.bonked = true;
      this.bumped = true;
      this.result = 'missed';
      b.vx = this.side * 4.2;
      b.vs = car.v * 0.5 + 1;
      b.vy = 4.5;
      sim.cue('ballBonk', this.index, 'ball');
    }
    if (this.result === 'pending') {
      const crossed = this.side > 0 ? b.x < -ROAD_EDGE - 0.3 : b.x > ROAD_EDGE + 0.3;
      if (crossed || rear(car) > b.s + 2) {
        this.result = 'good';
        sim.cue('ballSaved', this.index);
      }
    }
  }
}

// ── Puddle ───────────────────────────────────────────────────────────────────

export const PUDDLE = { x: 1.9, hx: 1.5, hs: 3.2 } as const;

export class Puddle extends DriveEventLogic {
  readonly kind = 'puddle' as const;
  readonly isStop = false;
  label(): string {
    return 'Big puddle!';
  }
  override spotAt(): number {
    return 55;
  }
  update(sim: SimCtx, _dt: number): void {
    const car = sim.car;
    this.spot(sim);
    if (!this.active && front(car) >= this.s - 60) this.active = true;
    if (this.active && this.result === 'pending' && car.s >= this.s) {
      const through = Math.abs(car.x - PUDDLE.x) < PUDDLE.hx + 0.3;
      this.result = through ? 'fun' : 'meh';
      sim.cue(through ? 'puddleSplash' : 'puddleMiss', this.index);
    }
  }
}
