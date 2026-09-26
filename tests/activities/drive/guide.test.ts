import { describe, expect, it } from 'vitest';
import { GUARD_PROMPT_NEAR, advise } from '../../../src/activities/drive/guide';
import type { Placed } from '../../../src/activities/drive/placement';
import { DriveSim, NO_INPUT } from '../../../src/activities/drive/sim';
import type { DriveEvent } from '../../../src/plan/types';
import { CROSSWALKS, CROSSWALK_STOP, DROPOFF, LIGHTS, ROUTE_LENGTH } from '../../../src/world/route/layout';
import { obedient } from './policies';

const ROUTE = { length: ROUTE_LENGTH, crosswalks: CROSSWALKS, lights: LIGHTS, dropoff: DROPOFF, crosswalkStop: CROSSWALK_STOP };
const make = (events: [DriveEvent, number, number?][]) =>
  new DriveSim(ROUTE, events.map(([kind, s, light]): Placed => ({ kind, s, light: light ?? -1, crosswalk: -1 })), 5, { s: 0, lane: 1, v: 8 });

describe('advise (what the player is told)', () => {
  it('never suggests GAS while a stop / crossing is pending', () => {
    for (const events of [
      [['crossingGuard', 205]],
      [['geese', 150]],
      [['ball', 200]],
      [['greenLights', LIGHTS[0]!, 0]],
    ] as [DriveEvent, number, number?][][]) {
      for (const policy of [obedient, () => NO_INPUT]) {
        const s = make(events);
        for (let t = 0; t < 120 && !s.arrived; t += 1 / 30) {
          const a = advise(s);
          const e = s.events[0]!;
          const pending = !e.done && e.kind !== 'greenLights';
          const guardHolding = e.kind === 'crossingGuard' && ['out', 'hold'].includes((e as unknown as { phase: string }).phase);
          if ((pending || guardHolding) && e.s - s.front < e.spotAt() && e.s - s.front > 0) expect(a.kind === 'gas').toBe(false);
          s.update(1 / 30, policy(s));
          s.cues.length = 0;
        }
        expect(s.arrived).toBe(true);
      }
    }
  });

  it('crossing guard: "slow down" far out, "stop at the line" close, "wait" once stopped, GAS when all clear', () => {
    const s = make([['crossingGuard', 205]]);
    const kinds = new Set<string>();
    let nearKind = '';
    for (let t = 0; t < 120 && s.car.s < 230; t += 1 / 30) {
      const a = advise(s);
      kinds.add(a.kind);
      const g = s.events[0] as unknown as { line: number; reaction: string };
      if (g.reaction === 'none' && g.line - s.front < GUARD_PROMPT_NEAR - 2 && g.line - s.front > 0) nearKind = a.kind;
      s.update(1 / 30, { gas: 0, brake: g.line - s.front < 20 ? 1 : 0, lane: 0, honk: false });
      s.cues.length = 0;
    }
    expect(kinds).toContain('slow');
    expect(nearKind).toBe('stopLine');
    expect(kinds).toContain('wait');
  });

  it('prompts fit a phone: the texts behind every advice are short', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/activities/drive/activity.ts', 'utf8'));
    const block = src.slice(src.indexOf('const PROMPTS'), src.indexOf('};', src.indexOf('const PROMPTS')));
    const texts = [...block.matchAll(/text: '([^']+)'/g)].map((m) => m[1]!);
    expect(texts.length).toBeGreaterThanOrEqual(10);
    for (const t of texts) expect(t.length).toBeLessThanOrEqual(18);
  });
});
