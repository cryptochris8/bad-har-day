// ─────────────────────────────────────────────────────────────────────────────
// DriveSim (pure, deterministic, unit-tested): the whole school run as data —
// the car, the morning's events along the route, the traffic lights, stop lines,
// "Oops!" bumps, the drop-off bay and the arrival. The activity feeds it input
// every frame and turns its state + cues into 3D, sound and chatter. Tests run it
// headless with driving policies to calibrate the arrival time.
// ─────────────────────────────────────────────────────────────────────────────
import type { DriveEvent } from '../../plan/types';
import {
  Ball,
  CrossingGuard,
  DriveEventLogic,
  GarbageTruck,
  Geese,
  GreenLights,
  Jogger,
  Puddle,
  Sprinkler,
  type Cue,
  type CueType,
  type LightColor,
  type Obstacle,
  type ObstacleKind,
  type SimCtx,
} from './events';
import { CAR, TUNE, changeLane, kickWobble, lateralStep, laneCenter, neededDecel, newCar, speedStep, stopCap, wobbleStep, type CarState } from './model';
import type { Placed } from './placement';

export interface DriveInput {
  /** 0..1 */
  gas: number;
  /** 0..1 */
  brake: number;
  /** Lane change request this frame. */
  lane: -1 | 0 | 1;
  /** Honk pressed this frame. */
  honk: boolean;
}

export const NO_INPUT: Readonly<DriveInput> = Object.freeze({ gas: 0, brake: 0, lane: 0, honk: false });

export interface SimRoute {
  readonly length: number;
  readonly crosswalks: readonly number[];
  readonly lights: readonly number[];
  readonly dropoff: { readonly s0: number; readonly s1: number; readonly x: number };
  /** A car stops with its front this far before a crosswalk centre. */
  readonly crosswalkStop: number;
}

export interface DriveSummary {
  stopsOk: number;
  stopsTotal: number;
  bumps: number;
  greens: number;
  splashes: number;
  honked: boolean;
  guard: 'thanks' | 'tsk' | 'none';
  results: { kind: DriveEvent; result: string }[];
}

/** Where the car stops in the bay by itself (centre s) if the player doesn't brake earlier. */
export const bayStopS = (d: SimRoute['dropoff']): number => d.s0 + (d.s1 - d.s0) * 0.55;

export class DriveSim implements SimCtx {
  readonly car: CarState;
  readonly events: DriveEventLogic[];
  readonly lights: LightColor[];
  readonly cues: Cue[] = [];
  /** Drive time (s). */
  t = 0;
  bumps = 0;
  /** Late wrap-up: auto-gas, everything hurries. */
  hurry = false;
  /** Drive by itself (debug / clock cap safety). */
  autopilot = false;
  arrived = false;
  arrivedAt = 0;
  honked = false;
  brake = 0;
  honkPressed = false;
  private bayHinted = false;
  private bayAssisted = false;
  private seed: number;
  private readonly lightDirty: boolean[];

  constructor(
    readonly route: SimRoute,
    placed: readonly Placed[],
    seed: number,
    start: { s?: number; lane?: number; v?: number } = {},
  ) {
    this.seed = (seed | 0) ^ 0x2545f491;
    this.car = newCar(start.s ?? 0, start.lane ?? 1, start.v ?? 4);
    this.lights = route.lights.map(() => 'green' as LightColor);
    this.lightDirty = route.lights.map(() => true);
    this.events = placed.map((p, i) => this.makeEvent(p, i));
  }

  private makeEvent(p: Placed, i: number): DriveEventLogic {
    switch (p.kind) {
      case 'crossingGuard':
        return new CrossingGuard(i, p.s, this.route.crosswalkStop);
      case 'geese':
        return new Geese(i, p.s, 4 + Math.floor(this.rand() * 3), () => this.rand() - 0.5);
      case 'greenLights':
        return new GreenLights(i, p.light >= 0 ? (this.route.lights[p.light] ?? p.s) : p.s, Math.max(0, p.light));
      case 'sprinkler':
        return new Sprinkler(i, p.s);
      case 'jogger':
        return new Jogger(i, p.s);
      case 'garbageTruck':
        return new GarbageTruck(i, p.s);
      case 'ball':
        return new Ball(i, p.s, this.rand() < 0.5 ? 1 : -1);
      case 'puddle':
      default:
        return new Puddle(i, p.s);
    }
  }

  // ── SimCtx ──
  rand(): number {
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0;
    return ((this.seed >>> 8) & 0xffffff) / 16777216;
  }

  cue(type: CueType, ev: number, what?: ObstacleKind): void {
    this.cues.push(what ? { type, ev, what } : { type, ev });
    if (type === 'ballBonk') {
      this.bumps++;
      this.car.v *= 0.55;
      kickWobble(this.car, -1.8);
    }
  }

  setLight(index: number, color: LightColor): void {
    if (index < 0 || index >= this.lights.length) return;
    if (this.lights[index] !== color) this.lightDirty[index] = true;
    this.lights[index] = color;
  }

  /** Lights whose colour changed since the last call (the view mirrors them to the route). */
  takeLightChanges(out: number[]): number[] {
    out.length = 0;
    for (let i = 0; i < this.lightDirty.length; i++)
      if (this.lightDirty[i]) {
        this.lightDirty[i] = false;
        out.push(i);
      }
    return out;
  }

  get front(): number {
    return this.car.s + CAR.halfLen;
  }

  /** The drop-off bay can be entered now. */
  get bayOpen(): boolean {
    const d = this.route.dropoff;
    return this.car.s >= d.s0 - 8 && this.car.s <= d.s1 - 3;
  }

  /** Is `lane` clear of solid obstacles beside/just ahead of the car? */
  laneFree(lane: number): boolean {
    const c = this.car;
    const tx = laneCenter(lane, this.route.dropoff.x);
    for (const e of this.events)
      for (const o of e.obstacles) {
        if (!o.onRoad || !o.solid) continue;
        if (Math.abs(o.x - tx) >= CAR.halfWidth + o.hx + 0.1) continue;
        if (o.s + o.hs > c.s - CAR.halfLen - 1.2 && o.s - o.hs < c.s + CAR.halfLen + 1.5) return false;
      }
    return true;
  }

  /** The nearest solid obstacle ahead that overlaps the car's current lateral span. */
  blockingAhead(out: { o: Obstacle | null; ev: DriveEventLogic | null; gap: number }, x = this.car.x): typeof out {
    out.o = null;
    out.ev = null;
    out.gap = Number.POSITIVE_INFINITY;
    const f = this.front;
    for (const e of this.events)
      for (const o of e.obstacles) {
        if (!o.onRoad || !o.solid) continue;
        if (Math.abs(o.x - x) >= CAR.halfWidth + o.hx + 0.12) continue;
        const gap = o.s - o.hs - f;
        if (gap < -0.25 || gap >= out.gap) continue;
        out.o = o;
        out.ev = e;
        out.gap = gap;
      }
    return out;
  }

  /** Next unresolved event ahead (for the "next up" chip), or null. */
  nextEvent(): DriveEventLogic | null {
    for (const e of this.events) if (!e.done) return e;
    return null;
  }

  private readonly blk = { o: null as Obstacle | null, ev: null as DriveEventLogic | null, gap: 0 };

  update(dt: number, input: DriveInput): void {
    if (!(dt > 0)) return;
    const d = Math.min(0.1, dt);
    const c = this.car;
    c.ds = 0;
    wobbleStep(c, d);
    if (this.arrived) {
      c.v = 0;
      c.braking = true;
      lateralStep(c, laneCenter(c.lane, this.route.dropoff.x), d);
      return;
    }
    this.t += d;
    const inp = this.autopilot ? autoInput(this) : input;
    this.brake = inp.brake;
    this.honkPressed = inp.honk;
    if (inp.honk) this.honked = true;
    const gas = this.hurry && inp.brake < 0.05 ? 1 : inp.gas;
    const D = this.route.dropoff;

    // ── lanes ──
    const bay = this.bayOpen;
    if (!bay && c.lane > 1 && c.s < D.s0) c.lane = 1;
    if (inp.lane !== 0) {
      const nl = changeLane(c.lane, inp.lane, bay ? 2 : 1);
      if (nl !== c.lane) {
        if (this.laneFree(nl)) c.lane = nl;
        else this.cue('laneBlocked', -1);
      }
    }
    const f = this.front;
    if (!this.bayHinted && f >= D.s0 - 48) {
      this.bayHinted = true;
      this.cue('bayHint', -1);
    }
    if (c.lane < 2 && c.s >= D.s0 - 1.5 && c.s < D.s1 - 3) {
      c.lane = 2;
      if (!this.bayAssisted) {
        this.bayAssisted = true;
        this.cue('bayAssist', -1);
      }
    }

    // ── events ──
    for (const e of this.events) e.update(this, d);

    // ── speed ──
    const inBay = c.lane === 2;
    let v = speedStep(c.v, inBay ? 0 : gas, inp.brake, d, inBay ? TUNE.bayCap : TUNE.cruise);
    let cap = Number.POSITIVE_INFINITY;
    // gentle slow-down approaching the school, then the bay's own stop
    if (f >= D.s0 - 48) cap = Math.min(cap, TUNE.bayCap + Math.sqrt(2 * 2.4 * Math.max(0, D.s0 - c.s)));
    if (inBay) cap = Math.min(cap, stopCap(bayStopS(D) - c.s, 3.2));
    // stop lines (crossing guard, red lights)
    for (const e of this.events) {
      const line = e.stopLine();
      if (line === null) continue;
      const dist = line - f;
      if (dist < -0.3) continue;
      if (inp.brake > 0.2 && dist < 45) e.engaged = true;
      if (c.v < 0.4 && dist < 30 && !e.assisted) e.engaged = true;
      const capL = stopCap(dist, TUNE.assist);
      if (!e.engaged && !e.assisted && v > capL + 0.05) {
        e.assisted = true;
        kickWobble(c, 1.2);
        this.cue('assist', e.index);
      }
      cap = Math.min(cap, capL);
    }
    // obstacles (people, geese, vehicles): follow politely once the player reacted, else a soft "Oops!" stop
    const b = this.blockingAhead(this.blk);
    if (b.o && b.ev) {
      const o = b.o;
      const vo = Math.max(0, o.vs);
      if (!o.engaged && ((b.gap < 16 && v <= vo + 1.2) || (inp.brake > 0.2 && b.gap < 32))) o.engaged = true;
      if (o.engaged) cap = Math.min(cap, stopCap(b.gap - 2.0, TUNE.comfort, vo));
      else if (!c.hard && v - vo > 1.2 && neededDecel(v, vo, b.gap - 1.3) > TUNE.emergency) {
        c.hard = true;
        c.hardTo = vo;
        o.engaged = true;
        o.bumped = true;
        if (!b.ev.bumped) this.bumps++;
        b.ev.onBump(this, o);
        kickWobble(c, 2.6);
        this.cue('bump', b.ev.index, o.kind);
      }
      cap = Math.min(cap, stopCap(b.gap - 0.8, TUNE.hard, vo));
    }
    if (c.hard) {
      v = Math.max(c.hardTo, c.v - TUNE.hard * d);
      if (v <= c.hardTo + 0.05) c.hard = false;
    }
    const wanted = v;
    v = Math.max(0, Math.min(v, cap));
    c.braking = inp.brake > 0.05 || c.hard || wanted - v > 0.02 || (v < 0.2 && cap < 0.5);
    c.v = v;
    c.ds = v * d;
    c.s += c.ds;
    lateralStep(c, laneCenter(c.lane, D.x), d);

    // ── arrival ──
    if (inBay && Math.abs(c.x - D.x) < 0.6 && c.v < 0.2 && c.s >= D.s0 - 1 && c.s <= D.s1 + 1) {
      this.arrived = true;
      this.arrivedAt = this.t;
      c.v = 0;
      this.cue('arrived', -1);
    }
  }

  summary(): DriveSummary {
    let stopsOk = 0;
    let stopsTotal = 0;
    let greens = 0;
    let splashes = 0;
    let guard: DriveSummary['guard'] = 'none';
    for (const e of this.events) {
      if (e.isStop) {
        stopsTotal++;
        if (e.result !== 'missed') stopsOk++;
      }
      if (e.kind === 'greenLights' && e.result === 'great') greens++;
      if (e.result === 'fun') splashes++;
      if (e instanceof CrossingGuard && e.reaction !== 'none') guard = e.reaction;
    }
    return {
      stopsOk,
      stopsTotal,
      bumps: this.bumps,
      greens,
      splashes,
      honked: this.honked,
      guard,
      results: this.events.map((e) => ({ kind: e.kind, result: e.result })),
    };
  }
}

/**
 * A good, attentive driver (used by the autopilot and the calibration tests): GAS by default, brakes for stop
 * lines and for anything in the lane it can't steer around, honks at geese, changes lanes around slow traffic,
 * drives through sprinklers and puddles, pulls into the bay.
 */
export function autoInput(sim: DriveSim, opts: { gas?: number; honk?: boolean; lanes?: boolean; fun?: boolean } = {}): DriveInput {
  const c = sim.car;
  const f = sim.front;
  let brake = 0;
  let lane: -1 | 0 | 1 = 0;
  let honk = false;
  const gasWanted = opts.gas ?? 1;
  const stopDist = (v: number) => (v * v) / (2 * 7) + 2.5;
  for (const e of sim.events) {
    const line = e.stopLine();
    if (line !== null) {
      const dist = line - f;
      if (dist > -0.2 && dist < stopDist(c.v) + 4) brake = 1;
    }
    if (e instanceof GreenLights && e.color === 'yellow' && e.canStop && e.s - f > 0 && e.s - f < stopDist(c.v) + 6) brake = 1;
    if (e instanceof Geese && e.active && !e.hurried && (opts.honk ?? true) && e.s - f < 40 && e.s - f > 0) honk = true;
    if (e instanceof Ball && e.launched && !e.done && e.ball.onRoad && e.s - f < 30 && e.s - f > -1) brake = 1;
    if ((opts.fun ?? true) && (e instanceof Sprinkler || e instanceof Puddle) && !e.done && e.s - f < 45 && e.s - f > 0 && c.lane === 0 && sim.laneFree(1)) lane = 1;
  }
  const blk = sim.blockingAhead({ o: null, ev: null, gap: 0 });
  if (blk.o) {
    const o = blk.o;
    const vo = Math.max(0, o.vs);
    const other = c.lane === 1 ? 0 : 1;
    const canSwerve = (opts.lanes ?? true) && c.lane < 2 && (o.kind === 'jogger' || o.kind === 'truck') && sim.laneFree(other) && !sim.blockingAhead({ o: null, ev: null, gap: 0 }, laneCenter(other, sim.route.dropoff.x)).o;
    if (canSwerve && blk.gap < 40) lane = other > c.lane ? 1 : -1;
    else if (blk.gap < neededStop(c.v, vo) + 6) brake = 1;
  }
  if (sim.bayOpen && c.lane === 1) lane = 1;
  const gas = brake > 0 ? 0 : gasWanted;
  return { gas, brake, lane, honk };
}

function neededStop(v: number, vo: number): number {
  const dv = Math.max(0, v - vo);
  return (dv * dv) / (2 * 7) + 3;
}
