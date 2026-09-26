import { describe, expect, it, vi } from 'vitest';
import { ScriptHost, buttonScheme, roamScheme } from '../../../src/activities/wake/common';
import type { ActivityContext } from '../../../src/activities/types';

/** A minimal fake context: ctx.wait() timers advanced by hand, npcs.walkTo resolving on demand. */
function fakeCtx() {
  const timers: { left: number; resolve: () => void }[] = [];
  const walks: (() => void)[] = [];
  const ctx = {
    wait: (s: number) => new Promise<void>((resolve) => timers.push({ left: s, resolve })),
    npcs: { walkTo: () => new Promise<void>((resolve) => walks.push(resolve)) },
    walker: { walkTo: () => Promise.resolve() },
  } as unknown as ActivityContext;
  const advance = async (dt: number) => {
    for (let i = timers.length - 1; i >= 0; i--) {
      const t = timers[i]!;
      t.left -= dt;
      if (t.left <= 0) {
        timers.splice(i, 1);
        t.resolve();
      }
    }
    // let promise continuations run
    for (let k = 0; k < 5; k++) await Promise.resolve();
  };
  return { ctx, advance, walks };
}

describe('cancellable scripts', () => {
  it('a lane runs its steps in unpaused game time', async () => {
    const { ctx, advance } = fakeCtx();
    const host = new ScriptHost(ctx, 'test');
    const lane = host.lane();
    const log: string[] = [];
    lane.run(async (s) => {
      log.push('a');
      await s.wait(1);
      log.push('b');
    });
    expect(lane.running).toBe(true);
    await advance(0.5);
    expect(log).toEqual(['a']);
    await advance(0.6);
    expect(log).toEqual(['a', 'b']);
    await advance(0);
    expect(lane.running).toBe(false);
  });

  it('starting a new script on a lane stops the old one at its next await (no stray steps)', async () => {
    const { ctx, advance } = fakeCtx();
    const host = new ScriptHost(ctx, 'test');
    const lane = host.lane();
    const log: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    lane.run(async (s) => {
      await s.wait(1);
      log.push('old');
    });
    lane.run(async (s) => {
      await s.wait(2);
      log.push('new');
    });
    await advance(1.1);
    expect(log).toEqual([]);
    await advance(1);
    expect(log).toEqual(['new']);
    // cancellation is silent
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('kill() (skip / dispose) stops everything, even scripts waiting on a walk', async () => {
    const { ctx, advance, walks } = fakeCtx();
    const host = new ScriptHost(ctx, 'test');
    const a = host.lane();
    const b = host.lane();
    const log: string[] = [];
    a.run(async (s) => {
      await s.wait(1);
      log.push('a');
    });
    b.run(async (s) => {
      await s.walk({} as never, { x: 0, y: 0, z: 0 });
      log.push('b');
    });
    host.kill();
    await advance(2);
    walks.forEach((w) => w());
    await advance(0);
    expect(log).toEqual([]);
  });

  it('until() resolves on the frame its predicate holds (or times out)', async () => {
    const { ctx, advance } = fakeCtx();
    const host = new ScriptHost(ctx, 'test');
    let flag = false;
    const log: string[] = [];
    host.lane().run(async (s) => {
      await s.until(() => flag);
      log.push('flag');
      await s.until(() => false, 0.5);
      log.push('timeout');
    });
    host.tick(0.1);
    await advance(0);
    expect(log).toEqual([]);
    flag = true;
    host.tick(0.1);
    await advance(0);
    expect(log).toEqual(['flag']);
    host.tick(0.3);
    await advance(0);
    expect(log).toEqual(['flag']);
    host.tick(0.3);
    await advance(0);
    expect(log).toEqual(['flag', 'timeout']);
  });

  it('a script error is reported, not thrown', async () => {
    const { ctx, advance } = fakeCtx();
    const host = new ScriptHost(ctx, 'test');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    host.lane().run(async () => {
      throw new Error('boom');
    });
    await advance(0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('touch control schemes', () => {
  it('return the SAME object while unchanged (the game compares by identity)', () => {
    expect(roamScheme('WAKE', 'hand', true)).toBe(roamScheme('WAKE', 'hand', true));
    expect(roamScheme(null, 'hand', true)).toBe(roamScheme(null, 'hand', true));
    expect(roamScheme('WAKE', 'hand', true)).not.toBe(roamScheme('SING', 'hand', true));
    expect(buttonScheme('SING', 'music')).toBe(buttonScheme('SING', 'music'));
  });

  it('free roam: joystick + contextual primary + hold-to-hurry', () => {
    const s = roamScheme('LOOK', 'hand', true);
    expect(s.move).toBe('xy');
    expect(s.primary?.label).toBe('LOOK');
    expect(s.alt?.hold).toBe(true);
    expect(roamScheme(null, 'hand', false).primary).toBeNull();
    expect(roamScheme(null, 'hand', false).alt).toBeNull();
    expect(buttonScheme('SING', 'music').move).toBe('none');
  });
});
