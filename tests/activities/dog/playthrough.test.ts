// Full headless playthroughs of "Take the dog out" with a bot on the real world / family / walker / npcs:
// every seeded quirk, the call timing rules, the stubborn dog + treats, skip(), and the end state.
import { describe, expect, it } from 'vitest';
import { DogOut } from '../../../src/activities/dog/activity';
import type { Attention } from '../../../src/activities/dog/logic';
import { isIndoors } from '../../../src/activities/dog/roam';
import { generatePlan } from '../../../src/plan';
import { ACTS, type DogQuirk } from '../../../src/plan/types';
import { createHarness, press, release, steer, type Harness } from './harness';


/** First seed whose plan has each quirk (searched, so plan-generator changes never break these tests). */
const SEED = Object.fromEntries(
  (['stubborn', 'sniffAll', 'stare', 'zoomies', 'leaf'] as DogQuirk[]).map((q) => {
    for (let s = 1; s < 500; s++) if (generatePlan(s).dogQuirk === q) return [q, s];
    throw new Error('no seed with quirk ' + q);
  }),
) as Record<DogQuirk, number>;

interface DogView {
  attention: Attention;
  businessDone: boolean;
  phase: string;
  misses: number;
  lying: boolean;
  stubborn: number;
  leaf: unknown;
  zoom: unknown;
}
const view = (a: DogOut) => a as unknown as DogView;

interface Bot {
  /** Walk out into the yard first. */
  walkOut?: boolean;
  /** Make one call outside a window after the business. */
  missOnce?: boolean;
  /** Hold the treat bag whenever the dog is lying down. */
  treats?: boolean;
}

async function play(h: Harness, a: DogOut, bot: Bot, maxSeconds = 150): Promise<{ sawLeaf: boolean; sawZoom: boolean; sawLying: boolean }> {
  const c = h.controls;
  let missed = false;
  let sawLeaf = false;
  let sawZoom = false;
  let sawLying = false;
  const yard = h.world.anchor('yardCenter');
  while (!a.done && h.time < maxSeconds) {
    const v = view(a);
    sawLeaf ||= !!v.leaf;
    sawZoom ||= !!v.zoom;
    sawLying ||= v.lying;
    c.moveX = c.moveY = 0;
    release(c, 'primary');
    if (v.phase === 'out') {
      if (bot.walkOut && h.time < 12) steer(c, h.walker.position, { x: yard.x - 2, z: yard.z + 2 });
      if (bot.treats && v.lying && v.stubborn > 0) {
        if (!c.secondary) press(c, 'secondary');
      } else release(c, 'secondary');
      if (bot.missOnce && !missed) {
        // Let the first look-back pass, then call at a bad moment.
        if (v.businessDone && !v.attention.open && v.attention.timer > 0.4) {
          press(c, 'primary');
          missed = true;
        }
      } else if (v.attention.open && (v.businessDone || bot.walkOut)) press(c, 'primary');
    }
    await h.frame(a);
  }
  return { sawLeaf, sawZoom, sawLying };
}

function expectEndState(h: Harness): void {
  const dog = h.family.dog.root.position;
  const chris = h.walker.position;
  expect(h.ctx.state.dogOut).toBe(true);
  expect(isIndoors(h.world, dog.x, dog.z)).toBe(true);
  expect(isIndoors(h.world, chris.x, chris.z)).toBe(true);
  expect(h.npcs.isBusy(h.family.dog)).toBe(true); // following Chris again
  expect(h.world.door('back').isOpen).toBe(false);
}

describe('Take the dog out — playthroughs', { timeout: 120_000 }, () => {
  for (const q of Object.keys(SEED) as DogQuirk[]) {
    it(`quirk '${q}': the dog goes out, does its thing, and comes back in on a well-timed call`, async () => {
      const h = createHarness(SEED[q], 'dog');
      expect(h.ctx.plan.dogQuirk).toBe(q);
      const a = new DogOut();
      a.start(h.ctx);
      const seen = await play(h, a, { treats: true });
      expect(a.done).toBe(true);
      // Let the door finish swinging shut.
      for (let i = 0; i < 20; i++) await h.frame(a);
      expectEndState(h);
      const r = a.result();
      expect(r.stars).toBeGreaterThanOrEqual(1);
      expect(r.stars).toBeLessThanOrEqual(3);
      const t = a.tally();
      expect(t.misses).toBe(0);
      expect(t.seconds).toBeGreaterThan(5);
      expect(t.seconds).toBeLessThan(75);
      if (q === 'leaf') expect(seen.sawLeaf).toBe(true);
      if (q === 'zoomies') expect(seen.sawZoom).toBe(true);
      if (q === 'stubborn') {
        expect(seen.sawLying).toBe(true);
        expect(r.flags).toContain('dog:treats');
      } else expect(r.flags).toContain('dog:fast');
      expect(h.log.bubbles.length).toBeGreaterThan(1);
      a.dispose();
      expect(h.walker.speed).toBe(2.4);
      expect(h.walker.enabled).toBe(true);
      expect(h.hud.tasks).toBeNull();
      expect(h.ctx.root.children.length).toBeLessThanOrEqual(1); // only the camera focus helper remains (disposed by the game)
      h.dispose();
    });
  }

  it('a call outside the glance window gets a head tilt and counts as a miss (no Dog Whisperer)', async () => {
    const h = createHarness(SEED.sniffAll, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    await play(h, a, { missOnce: true });
    expect(a.done).toBe(true);
    expect(a.tally().misses).toBe(1);
    expect(a.result().flags).not.toContain('dog:fast');
    expect(h.log.bubbles.some((b) => b.includes('Biscuit!'))).toBe(true);
    a.dispose();
    h.dispose();
  });

  it('a stubborn dog can be coaxed up by calling during glances (no treats needed)', async () => {
    const h = createHarness(SEED.stubborn, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    const seen = await play(h, a, {});
    expect(seen.sawLying).toBe(true);
    expect(a.done).toBe(true);
    expect(a.tally().callsAfterBusiness).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 20; i++) await h.frame(a);
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it('Chris can roam the yard; calling from out there walks him back in before the door closes', async () => {
    const h = createHarness(SEED.stare, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    await play(h, a, { walkOut: true });
    expect(a.done).toBe(true);
    for (let i = 0; i < 20; i++) await h.frame(a);
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it('dev jump-in: starting far from the back door puts Chris and the dog there', async () => {
    const h = createHarness(SEED.zoomies, 'dog', { atStation: false });
    const a = new DogOut();
    a.start(h.ctx);
    for (let i = 0; i < 10; i++) await h.frame(a);
    const d = h.world.anchor('backDoorIn');
    expect(Math.hypot(h.walker.position.x - d.x, h.walker.position.z - d.z)).toBeLessThan(0.5);
    a.dispose();
    h.dispose();
  });

  it('skip() finishes at once with the same end state, from anywhere in the flow', async () => {
    for (const frames of [0, 90, 400]) {
      const h = createHarness(SEED.leaf, 'dog');
      const a = new DogOut();
      a.start(h.ctx);
      const c = h.controls;
      for (let i = 0; i < frames; i++) {
        if (view(a).phase === 'out' && i < 300) steer(c, h.walker.position, h.world.anchor('yardCenter'));
        else c.moveX = c.moveY = 0;
        await h.frame(a);
      }
      c.moveX = c.moveY = 0;
      a.skip();
      a.skip(); // idempotent
      expect(a.done).toBe(true);
      expect(a.result().stars).toBe(2);
      for (let i = 0; i < 30; i++) await h.frame(a);
      expectEndState(h);
      a.dispose();
      expect(h.family.dog.root.parent).not.toBeNull();
      h.dispose();
    }
  });

  it('never a fail: a dog nobody calls wanders back in by itself (1 star, no drama)', async () => {
    const h = createHarness(SEED.sniffAll, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    while (!a.done && h.time < 150) await h.frame(a); // the bot never calls
    expect(a.done).toBe(true);
    expect(a.result()).toEqual({ stars: 1, flags: ['dog:self'] });
    for (let i = 0; i < 20; i++) await h.frame(a);
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it("wraps up gracefully at the act's last minute", async () => {
    const h = createHarness(SEED.stare, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    for (let i = 0; i < 120; i++) await h.frame(a);
    expect(view(a).phase).toBe('out');
    (h.ctx.clock as unknown as { jumpTo(m: number): void }).jumpTo(ACTS[0]!.end - 0.5);
    for (let i = 0; i < 400 && !a.done; i++) await h.frame(a);
    expect(a.done).toBe(true);
    expect(a.result().flags).toContain('dog:self');
    for (let i = 0; i < 20; i++) await h.frame(a);
    expectEndState(h);
    a.dispose();
    h.dispose();
  });

  it('update() never throws, even with a broken context', async () => {
    const h = createHarness(SEED.sniffAll, 'dog');
    const a = new DogOut();
    a.start(h.ctx);
    // Sabotage: the dog's npcs orders start throwing.
    const npcs = h.ctx.npcs as unknown as { walkTo: () => never };
    npcs.walkTo = () => {
      throw new Error('boom');
    };
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => void errors.push(args);
    try {
      for (let i = 0; i < 200 && !a.done; i++) await h.frame(a);
    } finally {
      console.error = orig;
    }
    expect(a.done).toBe(true); // recovered by skipping
    expect(errors.length).toBeGreaterThan(0);
    a.dispose();
    h.dispose();
  });
});
