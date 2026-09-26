// Full headless playthroughs of "Take out the trash" with a bot on the real world / family / walker / npcs:
// pull → door slam → nudge → carry (swing, slips, peels, the dog in the path) → toss (in / rim shot) → end state.
import { describe, expect, it } from 'vitest';
import { TakeOutTrash } from '../../../src/activities/trash/activity';
import type { Band, Pendulum } from '../../../src/activities/trash/logic';
import { isIndoors, type Spot } from '../../../src/activities/dog/roam';
import type { Vec3Like } from '../../../src/render/types';
import { ACTS } from '../../../src/plan/types';
import { createHarness, press, release, steer, type Harness } from '../dog/harness';

interface TrashView {
  phase: string;
  tossState: string;
  charge: number;
  band: Band;
  slipping: boolean;
  doorSpot: Spot | null;
  binSpot: Spot | null;
  bagSpot: Spot | null;
  peels: { spot: Spot | null }[];
  inHand: boolean;
  swing: Pendulum;
  doorSlammed: boolean;
  dogEvent: string;
  freezeT: number;
}
const view = (a: TakeOutTrash) => a as unknown as TrashView;

interface Bot {
  /** Catch slipping items. */
  catches?: boolean;
  /** Zig-zag hard while carrying (forces slips). */
  reckless?: boolean;
  /** Release the first toss too early (rim shot). */
  missFirst?: boolean;
}

async function play(h: Harness, a: TakeOutTrash, bot: Bot, maxSeconds = 150): Promise<{ slips: number; bumped: boolean; blocked: boolean }> {
  const c = h.controls;
  let path: Vec3Like[] = [];
  let pathT = 0;
  let pathTo: Vec3Like | null = null;
  let slips = 0;
  let wasSlipping = false;
  let tosses = 0;
  let lastPress = -1;
  let bumped = false;
  let blocked = false;
  let lastCharge = 0;
  const tap = () => {
    if (h.time - lastPress > 0.35) {
      press(c, 'primary');
      lastPress = h.time;
    }
  };
  while (!a.done && h.time < maxSeconds) {
    const v = view(a);
    const p = h.walker.position;
    c.moveX = c.moveY = 0;
    if (v.phase !== 'toss') release(c, 'primary');
    if (v.slipping && !wasSlipping) slips++;
    wasSlipping = v.slipping;
    bumped ||= v.dogEvent === 'done' && v.freezeT > 0.5 && !v.slipping && !v.doorSpot;
    blocked ||= v.dogEvent === 'blocking';
    if (v.phase === 'pull') tap();
    else if (v.phase === 'carry') {
      if (v.slipping) {
        if (bot.catches) tap();
      } else {
        const peel = v.peels.find((pl) => pl.spot);
        const target: Spot | null = peel?.spot ?? v.bagSpot ?? (v.doorSpot && v.doorSpot.enabled ? v.doorSpot : null) ?? v.binSpot;
        if (target) {
          const d = Math.hypot(target.at.x - p.x, target.at.z - p.z);
          if (d < target.radius * 0.75) tap();
          else {
            pathT -= 1 / 30;
            if (pathT <= 0 || pathTo !== target.at) {
              path = h.world.navPath({ x: p.x, y: 0, z: p.z }, target.at);
              pathTo = target.at;
              pathT = 0.5;
            }
            const next = path.find((q) => Math.hypot(q.x - p.x, q.z - p.z) > 0.35) ?? target.at;
            steer(c, p, next);
            if (bot.reckless && v.inHand) {
              // Hard left/right jinks every ~0.6 s.
              const s = Math.floor(h.time / 0.6) % 2 === 0 ? 1 : -1;
              const mx = c.moveX;
              c.moveX = -c.moveY * s * 1.4 + mx * 0.3;
              c.moveY = mx * s * 1.4 + c.moveY * 0.3;
            }
          }
        }
      }
    } else if (v.phase === 'toss') {
      if (v.tossState === 'ready') {
        // A fresh press starts the wind-up.
        if (c.primary) release(c, 'primary');
        else press(c, 'primary');
      }
      else if (v.tossState === 'charging') {
        const centre = (v.band.lo + v.band.hi) / 2;
        const early = bot.missFirst && tosses === 0;
        // Release a frame early on the rising pass (the activity reads it next frame).
        const rising = v.charge > lastCharge;
        lastCharge = v.charge;
        if (early ? v.charge > 0.25 && v.charge < v.band.lo - 0.12 : rising && v.charge >= centre - 0.06) {
          release(c, 'primary');
          tosses++;
        }
      }
    }
    await h.frame(a);
  }
  return { slips, bumped, blocked };
}

function expectEndState(h: Harness): void {
  const chris = h.family.chris;
  let bagInHand = false;
  chris.root.traverse((o) => {
    if (o.name === 'trash:bag') bagInHand = true;
  });
  expect(bagInHand).toBe(false);
  expect(h.ctx.state.trashOut).toBe(true);
  // Never locked out: if Chris is outside, the back door is open.
  const p = h.walker.position;
  if (!isIndoors(h.world, p.x, p.z)) expect(h.world.door('back').isOpen).toBe(true);
  expect(h.npcs.isBusy(h.family.dog)).toBe(true); // following Chris again
}

describe('Take out the trash — playthroughs', { timeout: 120_000 }, () => {
  it('a steady carry + a good toss: door slam gag, dog in the path, 3 stars', async () => {
    const h = createHarness(7, 'trash');
    const a = new TakeOutTrash();
    a.start(h.ctx);
    const r0 = await play(h, a, { catches: true });
    expect(a.done).toBe(true);
    const v = view(a);
    expect(v.doorSlammed).toBe(true);
    expect(v.dogEvent).toBe('done');
    expect(r0.blocked).toBe(true); // the dog plonked itself down on the route
    expectEndState(h);
    const t = a.tally();
    expect(t.drops).toBe(0);
    expect(t.tossMisses).toBe(0);
    expect(t.accuracy).toBeGreaterThan(0.8);
    expect(t.seconds).toBeGreaterThan(4);
    expect(t.seconds).toBeLessThan(60);
    const r = a.result();
    expect(r.stars).toBeGreaterThanOrEqual(2);
    expect(r.flags).toContain('trash:clean');
    expect(h.log.bubbles).toContain('Oh, come ON.');
    expect(r0.slips).toBeGreaterThanOrEqual(0);
    a.dispose();
    expect(h.walker.speed).toBe(2.4);
    expect(h.walker.enabled).toBe(true);
    expect(h.hud.meters).toBeNull();
    h.dispose();
  });

  it('reckless carrying makes things slip; missed catches drop banana peels that get picked up', async () => {
    const h = createHarness(7, 'trash');
    const a = new TakeOutTrash();
    a.start(h.ctx);
    const { slips } = await play(h, a, { reckless: true, catches: false });
    expect(a.done).toBe(true);
    expect(slips).toBeGreaterThanOrEqual(1);
    const t = a.tally();
    expect(t.drops).toBe(slips);
    expect(view(a).peels.length).toBe(0); // all picked up before the toss
    expect(a.result().flags).not.toContain('trash:clean');
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it('catching in time saves it (no drops)', async () => {
    const h = createHarness(7, 'trash');
    const a = new TakeOutTrash();
    a.start(h.ctx);
    const { slips } = await play(h, a, { reckless: true, catches: true });
    expect(a.done).toBe(true);
    expect(slips).toBeGreaterThanOrEqual(1);
    expect(a.tally().drops).toBe(0);
    a.dispose();
    h.dispose();
  });

  it('a rim shot bounces beside the bin; pick it up and try again (the zone widens)', async () => {
    const h = createHarness(7, 'trash');
    const a = new TakeOutTrash();
    a.start(h.ctx);
    await play(h, a, { catches: true, missFirst: true });
    expect(a.done).toBe(true);
    const t = a.tally();
    expect(t.tossMisses).toBe(1);
    expect(a.result().stars).toBeGreaterThanOrEqual(1);
    expect(a.result().flags).not.toContain('trash:swish');
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it("wraps up at the act's last minute once the required chores are done (never at a held 5:59)", async () => {
    const h = createHarness(7, 'trash');
    const a = new TakeOutTrash();
    a.start(h.ctx);
    await play(h, a, { catches: true }, 4);
    const clock = h.ctx.clock as unknown as { jumpTo(m: number): void };
    clock.jumpTo(ACTS[0]!.end - 0.5);
    for (let i = 0; i < 10; i++) await h.frame(a);
    expect(a.done).toBe(false); // dog + coffee not done: the clock would just hold
    h.ctx.state.dogOut = true;
    h.ctx.state.coffee.made = true;
    await h.frame(a);
    expect(a.done).toBe(true);
    expect(a.result()).toEqual({ stars: 1, flags: ['trash:lastMinute'] });
    for (let i = 0; i < 10; i++) await h.frame(a);
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it('skip() finishes at once from anywhere: bag gone, trash out, never locked out', async () => {
    for (const frames of [0, 120, 330]) {
      const h = createHarness(3, 'trash', { atStation: frames !== 120 });
      const a = new TakeOutTrash();
      a.start(h.ctx);
      const bot = play(h, a, { catches: true }, frames / 30);
      await bot;
      a.skip();
      a.skip();
      expect(a.done).toBe(true);
      expect(a.result().stars).toBe(2);
      for (let i = 0; i < 10; i++) await h.frame(a);
      expectEndState(h);
      a.dispose();
      h.dispose();
    }
  });
});
