// What the player is told right now (pure): one objective line for the HUD + one advice kind for the glyph
// prompt. Tests drive an "obedient" player straight from this, so whatever the game says must always lead to
// school. Rule: never suggest GAS while something is crossing / a stop is pending.
import { Ball, CrossingGuard, GarbageTruck, Geese, GreenLights, Jogger, Puddle, Sprinkler } from './events';
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
  for (const e of sim.events) {
    if (e instanceof CrossingGuard) {
      if (e.phase === 'clear' || e.phase === 'wait') continue;
      const toLine = e.line - f;
      if (toLine > e.spotAt() || toLine < -6) continue;
      if (e.phase === 'back') {
        out.objective = 'All clear — thank you, Ms. Rosa!';
        out.kind = car.v < 0.5 ? 'gas' : 'none';
      } else if (e.reaction === 'none') {
        const near = toLine <= GUARD_PROMPT_NEAR;
        out.objective = near ? 'Crossing guard! Stop at the line' : 'Crossing guard ahead — slow down';
        out.kind = near ? 'stopLine' : 'slow';
      } else {
        out.objective = e.reaction === 'thanks' ? 'Thank you for stopping! The kids are crossing…' : 'Oops! Wait while the kids cross…';
        out.kind = 'wait';
      }
      return out;
    }
    if (e.done) continue;
    // the jogger and the truck MOVE: judge them by where they are, not where they appeared
    const mover = e instanceof Jogger ? e.jogger : e instanceof GarbageTruck ? e.truck : null;
    const ahead = mover && mover.shown ? mover.s - mover.hs - f : e.s - f;
    if (ahead > e.spotAt() || ahead < (mover ? -(2 * mover.hs + 6) : -8)) continue;
    if (e instanceof Geese) {
      out.objective = e.hurried ? 'The geese are hurrying off — easy does it' : 'Geese crossing! Slow down and honk politely — or wait';
      out.kind = e.hurried ? (car.v < 0.5 ? 'wait' : 'slow') : 'honk';
    } else if (e instanceof GreenLights) {
      if (e.passedOn) continue;
      if (e.color === 'green') {
        out.objective = e.active ? 'Green light ahead — catch it!' : 'Traffic light ahead';
        out.kind = 'green';
      } else if (e.color === 'red' && car.v < 0.5 && e.stopLine() !== null) {
        out.objective = 'Red light — wait for green';
        out.kind = 'wait';
      } else {
        out.objective = e.color === 'red' ? 'Red light — stop at the line' : 'Yellow! Get ready to stop';
        out.kind = e.stopLine() !== null ? 'stopLine' : 'none';
      }
    } else if (e instanceof Sprinkler || e instanceof Puddle) {
      const inRight = car.lane >= 1;
      out.objective = e instanceof Sprinkler ? (inRight ? 'Sprinkler! Here we go — wheee!' : 'Sprinkler! Drive through it (right lane)') : inRight ? 'Big puddle! Splash time!' : 'Big puddle! Splash through it (right lane)';
      out.kind = inRight ? 'none' : 'splash';
    } else if (e instanceof Jogger || e instanceof GarbageTruck) {
      const o = e instanceof Jogger ? e.jogger : e.truck;
      const inLane = o.shown && o.onRoad && Math.abs(o.x - car.x) < 2.2 && o.s > car.s - 3;
      out.objective = e instanceof Jogger ? (inLane ? 'Jogger with a stroller — change lanes to pass' : 'Passing the jogger — wave hello!') : inLane ? 'Garbage truck! Change lanes to pass' : 'Passing the garbage truck!';
      out.kind = inLane ? 'lane' : 'none';
    } else if (e instanceof Ball) {
      out.objective = e.launched ? 'BALL! Brake!' : 'Kids playing ball — be ready to brake';
      out.kind = e.launched ? 'brake' : 'slow';
    }
    return out;
  }
  return out;
}
