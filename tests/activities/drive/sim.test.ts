import { describe, expect, it } from 'vitest';
import { Ball, CrossingGuard, GarbageTruck, Geese, GreenLights, Jogger, LIGHT_TIMES, type Cue } from '../../../src/activities/drive/events';
import { CAR } from '../../../src/activities/drive/model';
import type { Placed } from '../../../src/activities/drive/placement';
import { DriveSim, NO_INPUT, autoInput, bayStopS, type DriveInput } from '../../../src/activities/drive/sim';
import { obedient } from './policies';
import type { DriveEvent } from '../../../src/plan/types';
import { CROSSWALKS, CROSSWALK_STOP, DROPOFF, LIGHTS, ROUTE_LENGTH } from '../../../src/world/route/layout';

const ROUTE = { length: ROUTE_LENGTH, crosswalks: CROSSWALKS, lights: LIGHTS, dropoff: DROPOFF, crosswalkStop: CROSSWALK_STOP };
const DT = 1 / 30;

function sim(events: [DriveEvent, number, number?][], seed = 3, v = 8): DriveSim {
  const placed: Placed[] = events.map(([kind, s, light]) => ({ kind, s, light: light ?? -1, crosswalk: -1 }));
  return new DriveSim(ROUTE, placed, seed, { s: 0, lane: 1, v });
}

type Policy = (s: DriveSim) => DriveInput;
const passive: Policy = () => NO_INPUT;

/** Run until `until` or a time limit; collects cues. */
function run(s: DriveSim, policy: Policy, until: (s: DriveSim) => boolean, limit = 200): Cue[] {
  const cues: Cue[] = [];
  for (let t = 0; t < limit && !until(s); t += DT) {
    s.update(DT, policy(s));
    cues.push(...s.cues);
    s.cues.length = 0;
  }
  return cues;
}


describe('crossing guard', () => {
  it('stopping at the line earns her thank-you wave (and the car never enters the crosswalk)', () => {
    const s = sim([['crossingGuard', 205]]);
    const g = s.events[0] as CrossingGuard;
    let maxFront = 0;
    let passedWhileHeld = false;
    const cues = run(s, (x) => {
      maxFront = Math.max(maxFront, x.front);
      if ((g.phase === 'out' || g.phase === 'hold') && x.front > g.line + 0.35) passedWhileHeld = true;
      return autoInput(x, { gas: 0 });
    }, (x) => x.car.s > 240);
    expect(passedWhileHeld).toBe(false);
    expect(cues.some((c) => c.type === 'guardThanks')).toBe(true);
    expect(g.reaction).toBe('thanks');
    expect(g.result).toBe('good');
    expect(s.summary().guard).toBe('thanks');
    expect(s.bumps).toBe(0);
    expect(g.line).toBe(205 - CROSSWALK_STOP);
    expect(maxFront).toBeGreaterThan(240);
  });

  it('rolling up without braking gets the playful "tsk" (assisted stop, never a crash)', () => {
    const s = sim([['crossingGuard', 205]]);
    const g = s.events[0] as CrossingGuard;
    let passedWhileHeld = false;
    const cues = run(s, (x) => {
      if ((g.phase === 'out' || g.phase === 'hold') && x.front > g.line + 0.35) passedWhileHeld = true;
      return NO_INPUT;
    }, (x) => x.car.s > 240);
    expect(passedWhileHeld).toBe(false);
    expect(cues.some((c) => c.type === 'assist')).toBe(true);
    expect(cues.some((c) => c.type === 'guardTsk')).toBe(true);
    expect(g.result).toBe('missed');
    // the kids were never touched
    expect(s.bumps).toBe(0);
    expect(s.car.s).toBeGreaterThan(240);
  });
});

describe('crossing guard, obedient early stop (QA P1)', () => {
  it('stopping far short of the line (braking the moment "Slow down" shows) still gets her thank-you, then the crossing finishes and the van goes on', () => {
    const s = sim([['crossingGuard', 205]]);
    const g = s.events[0] as CrossingGuard;
    let stoppedAt = -1;
    let tStop = 0;
    const cues = run(s, (x) => {
      const r = obedient(x);
      if (stoppedAt < 0 && x.car.v < 0.1 && g.phase !== 'wait') {
        stoppedAt = g.line - x.front;
        tStop = x.t;
      }
      return r;
    }, (x) => x.car.s > 230, 120);
    expect(stoppedAt).toBeGreaterThan(30); // an obedient driver stops well short of the line…
    expect(cues.some((c) => c.type === 'guardThanks')).toBe(true); // …and it counts
    expect(g.reaction).toBe('thanks');
    expect(g.result).toBe('good');
    expect(cues.some((c) => c.type === 'guardBack')).toBe(true);
    expect(s.car.s).toBeGreaterThan(230);
    expect(s.t - tStop).toBeLessThan(25); // no stall until the late wrap-up
    expect(cues.some((c) => c.type === 'assist')).toBe(false);
  });

  it('the guard is already out when the girls spot her (so a stop at the first prompt is never "too early")', () => {
    const s = sim([['crossingGuard', 282]]);
    const g = s.events[0] as CrossingGuard;
    run(s, passive, (x) => x.events[0]!.spotted, 60);
    expect(g.phase).not.toBe('wait');
  });
});

describe('geese', () => {
  it('a polite honk while still holding GAS clears them in time — no Oops (QA P2)', () => {
    for (const seed of [2, 3, 4, 9]) {
      const s = sim([['geese', 150]], seed);
      let honked = false;
      const cues = run(s, (x) => {
        const honk = !honked && 150 - x.front < 30;
        if (honk) honked = true;
        return { gas: 1, brake: 0, lane: 0, honk };
      }, (x) => x.car.s > 190);
      expect(cues.some((c) => c.type === 'geeseHurry')).toBe(true);
      expect(cues.some((c) => c.type === 'bump')).toBe(false);
      expect(s.events[0]!.result).toBe('good');
    }
  });

  it('a polite honk makes them hurry; waiting works too; no bumps', () => {
    const honk = sim([['geese', 150]]);
    const cuesH = run(honk, (x) => autoInput(x), (x) => x.car.s > 190);
    expect(cuesH.some((c) => c.type === 'geeseHurry')).toBe(true);
    expect(honk.events[0]!.result).toBe('good');
    expect(honk.bumps).toBe(0);
    const wait = sim([['geese', 150]]);
    run(wait, (x) => autoInput(x, { honk: false }), (x) => x.car.s > 190);
    expect(wait.events[0]!.result).toBe('good');
    expect(wait.bumps).toBe(0);
  });

  it('ignoring them is an "Oops!" (a soft stop short of the geese), then they hurry off', () => {
    const s = sim([['geese', 150]]);
    const gz = s.events[0] as Geese;
    let minGap = Number.POSITIVE_INFINITY;
    const cues = run(s, (x) => {
      for (const o of gz.geese) if (o.onRoad && Math.abs(o.x - x.car.x) < CAR.halfWidth + o.hx) minGap = Math.min(minGap, o.s - o.hs - x.front);
      return NO_INPUT;
    }, (x) => x.car.s > 190);
    expect(cues.some((c) => c.type === 'bump' && c.what === 'goose')).toBe(true);
    expect(s.bumps).toBe(1);
    expect(gz.result).toBe('missed');
    expect(gz.hurried).toBe(true);
    expect(minGap).toBeGreaterThan(-0.3); // never ran into them
  });
});

describe('green lights', () => {
  it('cycles green → yellow → red → green on schedule once the car approaches', () => {
    const s = sim([['greenLights', LIGHTS[1]!, 1]], 3, 0);
    const gl = s.events[0] as GreenLights;
    // park the car 110 m before the line
    s.car.s = LIGHTS[1]! - 110;
    const colors: string[] = [];
    for (let t = 0; t < 20; t += DT) {
      s.update(DT, { gas: 0, brake: 1, lane: 0, honk: false });
      colors.push(gl.color);
    }
    const at = (sec: number) => colors[Math.floor(sec / DT)];
    expect(at(LIGHT_TIMES.yellow - 0.3)).toBe('green');
    expect(at(LIGHT_TIMES.yellow + 0.3)).toBe('yellow');
    expect(at(LIGHT_TIMES.red + 0.3)).toBe('red');
    expect(at(LIGHT_TIMES.green + 0.3)).toBe('green');
    expect(s.lights[1]).toBe('green');
  });

  it('GAS catches the green (bonus); cruising stops at the red (good), running it is assisted (missed)', () => {
    const fast = sim([['greenLights', LIGHTS[0]!, 0]]);
    const cf = run(fast, (x) => autoInput(x), (x) => x.car.s > LIGHTS[0]! + 20);
    expect(cf.some((c) => c.type === 'greenBonus')).toBe(true);
    expect(fast.events[0]!.result).toBe('great');
    const slow = sim([['greenLights', LIGHTS[0]!, 0]]);
    run(slow, (x) => autoInput(x, { gas: 0 }), (x) => x.car.s > LIGHTS[0]! + 20);
    expect(slow.events[0]!.result).toBe('good');
    const reckless = sim([['greenLights', LIGHTS[0]!, 0]]);
    let ranRed = false;
    run(reckless, (x) => {
      const gl = x.events[0] as GreenLights;
      if (gl.color === 'red' && x.front > gl.s + 0.4 && gl.passedOn === null) ranRed = true;
      return NO_INPUT;
    }, (x) => x.car.s > LIGHTS[0]! + 20);
    expect(ranRed).toBe(false);
    expect(reckless.events[0]!.result).toBe('missed');
  });
});

describe('sprinkler + puddle (just for fun)', () => {
  it('right lane splashes, left lane misses; no penalties', () => {
    const r = sim([['sprinkler', 120], ['puddle', 220]]);
    const cr = run(r, passive, (x) => x.car.s > 240);
    expect(cr.some((c) => c.type === 'sprinklerSplash')).toBe(true);
    expect(cr.some((c) => c.type === 'puddleSplash')).toBe(true);
    expect(r.summary().splashes).toBe(2);
    const l = sim([['sprinkler', 120], ['puddle', 220]]);
    const cl = run(l, (x) => ({ gas: 0, brake: 0, lane: x.car.lane > 0 ? -1 : 0, honk: false }), (x) => x.car.s > 240);
    expect(cl.some((c) => c.type === 'sprinklerMiss')).toBe(true);
    expect(cl.some((c) => c.type === 'puddleMiss')).toBe(true);
    expect(l.summary().stopsTotal).toBe(0);
  });
});

describe('jogger + garbage truck (change lanes)', () => {
  it('changing lanes passes them cleanly', () => {
    const s = sim([['jogger', 120], ['garbageTruck', 260]]);
    const cues = run(s, (x) => autoInput(x), (x) => x.car.s > 360);
    expect(cues.some((c) => c.type === 'joggerPass')).toBe(true);
    expect(cues.some((c) => c.type === 'truckPass')).toBe(true);
    expect(s.bumps).toBe(0);
    expect(s.events.map((e) => e.result)).toEqual(['good', 'good']);
  });

  it('staying in lane behind them is safe and they eventually move over', () => {
    const s = sim([['garbageTruck', 120]]);
    const tr = s.events[0] as GarbageTruck;
    let minGap = Number.POSITIVE_INFINITY;
    const cues = run(s, (x) => {
      if (tr.truck.onRoad && Math.abs(tr.truck.x - x.car.x) < 2) minGap = Math.min(minGap, tr.truck.s - tr.truck.hs - x.front);
      // a careful driver: taps the brake when catching up, then lets the van follow
      const b = x.blockingAhead({ o: null, ev: null, gap: 0 });
      return { gas: 0, brake: b.o && b.gap < 25 && x.car.v > b.o.vs + 1 ? 1 : 0, lane: 0, honk: false };
    }, (x) => x.car.s > 260, 120);
    expect(cues.some((c) => c.type === 'truckPullOver')).toBe(true);
    expect(minGap).toBeGreaterThan(0.5);
    expect(tr.result === 'ok' || tr.result === 'good').toBe(true);
    expect(s.car.s).toBeGreaterThan(260);
  });

  it('lane changes are refused while the other lane is occupied right beside the van', () => {
    const s = sim([['jogger', 60]]);
    const j = s.events[0] as Jogger;
    run(s, passive, () => j.active, 20);
    // put the jogger right beside us in the left lane
    j.jogger.x = -1.8;
    j.jogger.s = s.car.s;
    j.jogger.onRoad = true;
    expect(s.laneFree(0)).toBe(false);
    s.update(DT, { gas: 0, brake: 0, lane: -1, honk: false });
    expect(s.car.lane).toBe(1);
    expect(s.cues.some((c) => c.type === 'laneBlocked')).toBe(true);
  });
});

describe('ball', () => {
  it('braking lets the ball roll across (good); not braking is a funny BOING (a bump, never a crash)', () => {
    const good = sim([['ball', 200]]);
    run(good, (x) => autoInput(x), (x) => x.car.s > 240);
    expect(good.events[0]!.result).toBe('good');
    expect(good.bumps).toBe(0);
    const bonk = sim([['ball', 200]], 5);
    const cues = run(bonk, passive, (x) => x.car.s > 240);
    const b = bonk.events[0] as Ball;
    expect(cues.some((c) => c.type === 'ballBonk')).toBe(true);
    expect(b.result).toBe('missed');
    expect(bonk.bumps).toBe(1);
  });
});

describe('drop-off', () => {
  it('always ends stopped in the bay (auto pull-in + auto stop), with the right-lane car', () => {
    for (const lane of [0, 1]) {
      const s = new DriveSim(ROUTE, [], 1, { s: 380, lane, v: 8 });
      const cues = run(s, passive, (x) => x.arrived, 120);
      expect(s.arrived).toBe(true);
      expect(s.car.lane).toBe(2);
      expect(s.car.s).toBeGreaterThanOrEqual(DROPOFF.s0 - 1);
      expect(s.car.s).toBeLessThanOrEqual(DROPOFF.s1 + 1);
      expect(Math.abs(s.car.s - bayStopS(DROPOFF))).toBeLessThan(1);
      expect(cues.some((c) => c.type === 'bayHint')).toBe(true);
      expect(cues.some((c) => c.type === 'arrived')).toBe(true);
    }
  });

  it('stopping early inside the bay arrives right there', () => {
    const s = new DriveSim(ROUTE, [], 1, { s: 470, lane: 1, v: 6 });
    run(s, (x) => ({ gas: 0, brake: x.car.lane === 2 && x.car.s > DROPOFF.s0 + 2 ? 1 : 0, lane: x.bayOpen ? 1 : 0, honk: false }), (x) => x.arrived, 60);
    expect(s.arrived).toBe(true);
    expect(s.car.s).toBeLessThan(bayStopS(DROPOFF));
  });

  it('holding the brake forever never breaks anything; autopilot finishes the run', () => {
    const s = sim([['crossingGuard', 72], ['geese', 150]]);
    run(s, () => ({ gas: 0, brake: 1, lane: 0, honk: false }), () => false, 10);
    expect(s.car.v).toBe(0);
    s.autopilot = true;
    run(s, passive, (x) => x.arrived, 200);
    expect(s.arrived).toBe(true);
    expect(s.bumps).toBe(0);
  });
});

describe('determinism', () => {
  it('same seed + same inputs → same drive', () => {
    const a = sim([['geese', 120], ['ball', 260], ['crossingGuard', 412]], 9);
    const b = sim([['geese', 120], ['ball', 260], ['crossingGuard', 412]], 9);
    run(a, passive, (x) => x.arrived, 200);
    run(b, passive, (x) => x.arrived, 200);
    expect(a.t).toBeCloseTo(b.t, 9);
    expect(a.summary()).toEqual(b.summary());
  });
});
