// Test drivers (not a test file). `obedient` does exactly what the game's prompt says, the moment it says it.
import { advise, type Advice } from '../../../src/activities/drive/guide';
import { GarbageTruck, Jogger } from '../../../src/activities/drive/events';
import { NO_INPUT, type DriveInput, type DriveSim } from '../../../src/activities/drive/sim';

const scratch: Advice = { kind: 'none', objective: '' };

export function obedient(s: DriveSim): DriveInput {
  const a = advise(s, scratch);
  const c = s.car;
  switch (a.kind) {
    case 'gas':
    case 'green':
      return { gas: 1, brake: 0, lane: 0, honk: false };
    case 'slow':
    case 'stopLine':
    case 'brake':
    case 'wait':
    case 'stopSchool':
      return { gas: 0, brake: 1, lane: 0, honk: false };
    case 'honk':
      // "Slow down and honk politely"
      return { gas: 0, brake: 1, lane: 0, honk: true };
    case 'lane': {
      const e = s.events.find((x) => (x instanceof Jogger || x instanceof GarbageTruck) && !x.done) as Jogger | GarbageTruck | undefined;
      const o = e ? (e instanceof Jogger ? e.jogger : e.truck) : null;
      const want = o ? (o.x > 0 ? 0 : 1) : c.lane;
      return { gas: 0, brake: 0, lane: want < c.lane ? -1 : want > c.lane ? 1 : 0, honk: false };
    }
    case 'splash':
    case 'bay':
      return { gas: 0, brake: 0, lane: 1, honk: false };
    case 'none':
    default:
      return NO_INPUT;
  }
}
