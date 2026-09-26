// What the player is told right now (pure): one objective line for the HUD + one advice kind for the glyph
// prompt. Tests drive an "obedient" player straight from this, so whatever the game says must always lead to
// school. Rule: never suggest GAS while something is crossing / a stop is pending.
import { Ball, CrossingGuard, GarbageTruck, Geese, GreenLights, Jogger, Puddle, Sprinkler } from './events';
import { CAR } from './model';
import type { DriveSim } from './sim';

export type AdviceKind =
  | 'gas' // hold GAS (open road)
  | 'green' // hold GAS to catch the green light
  | 'slow' // slow down (something ahead)
  | 'stopLine' // stop at the line (guard / red light)
  | 'brake' // BRAKE now (ball!)
  | 'honk' // slow down + honk politely (geese)
  | 'lane' // change lanes to pass
  | 'splash' // steer into the right lane (sprinkler / puddle)
  | 'bay' // steer into the drop-off lane
  | 'stopSchool' // brake by the school door
  | 'wait' // stopped for something — just wait (no prompt)
  | 'none'; // nothing to do (no prompt)

export interface Advice {
  kind: AdviceKind;
  objective: string;
}

/** The crossing guard's line: the "stop at the line" prompt starts this close; further out it says "slow down". */
export const GUARD_PROMPT_NEAR = 45;

/** Higher wins when several events are in range: a pending stop always beats passing / splashing / GAS. */
const PRIORITY: Readonly<Record<AdviceKind, number>> = {
  brake: 9,
  stopLine: 8,
  wait: 8,
  honk: 7,
  slow: 6,
  lane: 4,
  splash: 3,
  green: 2,
  stopSchool: 2,
  bay: 2,
  gas: 1,
  none: 0,
};

/** A jogger / truck on the road in the right lane, between the van and `until`. */
function rightLaneBusy(sim: DriveSim, until: number): boolean {
  const c = sim.car;
  for (const e of sim.events) {
    const m = e instanceof Jogger ? e.jogger : e instanceof GarbageTruck ? e.truck : null;
    if (!m || !m.shown || !m.onRoad || m.x < 0.2) continue;
    if (m.s + m.hs > c.s - CAR.halfLen - 3 && m.s - m.hs < until) return true;
  }
  return false;
}

/** Advice for one event, or false when it's out of range / irrelevant. Writes into `o` (no shared state). */
function adviceFor(sim: DriveSim, e: DriveSim['events'][number], o: Advice): boolean {
  const car = sim.car;
  const f = sim.front;
  if (e instanceof CrossingGuard) {
    if (e.phase === 'clear' || e.phase === 'wait') return false;
    const toLine = e.line - f;
    if (toLine > e.spotAt() || toLine < -6) return false;
    if (e.phase === 'back') {
      o.objective = 'All clear — thank you, Ms. Rosa!';
      o.kind = car.v < 0.5 ? 'gas' : 'none';
    } else if (e.reaction === 'none') {
      const near = toLine <= GUARD_PROMPT_NEAR;
      o.objective = near ? 'Crossing guard! Stop at the line' : 'Crossing guard ahead — slow down';
      o.kind = near ? 'stopLine' : 'slow';
    } else {
      o.objective = e.reaction === 'thanks' ? 'Thank you for stopping! The kids are crossing…' : 'Oops! Wait while the kids cross…';
      o.kind = 'wait';
    }
    return true;
  }
  if (e.done) return false;
  // the jogger and the truck MOVE: judge them by where they are, not where they appeared
  const mover = e instanceof Jogger ? e.jogger : e instanceof GarbageTruck ? e.truck : null;
  const ahead = mover && mover.shown ? mover.s - mover.hs - f : e.s - f;
  if (ahead > e.spotAt() || ahead < (mover ? -(2 * mover.hs + 6) : -8)) return false;
  if (e instanceof Geese) {
    o.objective = e.hurried ? 'The geese are hurrying off — easy does it' : 'Geese crossing! Slow down and honk politely — or wait';
    o.kind = e.hurried ? (car.v < 0.5 ? 'wait' : 'slow') : 'honk';
  } else if (e instanceof GreenLights) {
    if (e.passedOn) return false;
    if (e.color === 'green') {
      o.objective = e.active ? 'Green light ahead — catch it!' : 'Traffic light ahead';
      o.kind = 'green';
    } else if (e.color === 'red' && car.v < 0.5 && e.stopLine() !== null) {
      o.objective = 'Red light — wait for green';
      o.kind = 'wait';
    } else {
      o.objective = e.color === 'red' ? 'Red light — stop at the line' : 'Yellow! Get ready to stop';
      o.kind = e.stopLine() !== null ? 'stopLine' : 'none';
    }
  } else if (e instanceof Sprinkler || e instanceof Puddle) {
    const inRight = car.lane >= 1;
    // never send the van into the right lane behind a slow truck / jogger (pass it first)
    if (!inRight && rightLaneBusy(sim, e.s)) {
      o.objective = e instanceof Sprinkler ? 'Sprinkler ahead — pass first, then splash!' : 'Puddle ahead — pass first, then splash!';
      o.kind = 'none';
      return true;
    }
    o.objective = e instanceof Sprinkler ? (inRight ? 'Sprinkler! Here we go — wheee!' : 'Sprinkler! Drive through it (right lane)') : inRight ? 'Big puddle! Splash time!' : 'Big puddle! Splash through it (right lane)';
    o.kind = inRight ? 'none' : 'splash';
  } else if (e instanceof Jogger || e instanceof GarbageTruck) {
    const m = e instanceof Jogger ? e.jogger : e.truck;
    const inLane = m.shown && m.onRoad && Math.abs(m.x - car.x) < 2.2 && m.s > car.s - 3;
    o.objective = e instanceof Jogger ? (inLane ? 'Jogger with a stroller — change lanes to pass' : 'Passing the jogger — wave hello!') : inLane ? 'Garbage truck! Change lanes to pass' : 'Passing the garbage truck!';
    o.kind = inLane ? 'lane' : 'none';
  } else if (e instanceof Ball) {
    o.objective = e.launched ? 'BALL! Brake!' : 'Kids playing ball — be ready to brake';
    o.kind = e.launched ? 'brake' : 'slow';
  } else return false;
  return true;
}

/**
 * What to tell the player now. Every event in range proposes advice; the highest priority wins (ties: the
 * nearer event, i.e. the earlier one in route order) — so a stop for the guard / geese / ball / a red light is
 * announced as soon as its zone is in range, even while passing a truck or a jogger.
 */
export function advise(sim: DriveSim, out: Advice = { kind: 'gas', objective: '' }): Advice {
  const car = sim.car;
  const f = sim.front;
  const D = sim.route.dropoff;
  out.kind = sim.t < 10 ? 'gas' : 'none';
  out.objective = 'Drive to school — GAS to go faster, BRAKE to stop';
  if (f >= D.s0 - 48) {
    out.objective = 'Maple Grove Elementary! Pull into the drop-off lane';
    // "stop by the door" only once the van is really in the bay (a stop there always counts as arriving)
    out.kind = car.lane === 2 ? (car.s >= D.s0 + 2 ? 'stopSchool' : 'none') : sim.bayOpen ? 'bay' : 'none';
    return out;
  }
  const cand: Advice = { kind: 'none', objective: '' };
  let best = -1;
  for (const e of sim.events) {
    if (!adviceFor(sim, e, cand)) continue;
    const p = PRIORITY[cand.kind];
    if (p > best) {
      best = p;
      out.kind = cand.kind;
      out.objective = cand.objective;
    }
  }
  return out;
}
