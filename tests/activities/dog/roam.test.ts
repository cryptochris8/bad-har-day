import { describe, expect, it } from 'vitest';
import { ChipBar, PromptSlot, ScriptRunner, Spots, canDom, firstFree, isIndoors, smooth01, threshold, yawToward, type Script } from '../../../src/activities/dog/roam';
import type { UiManager } from '../../../src/ui/types';
import type { World } from '../../../src/world/types';

function fakeWorld(markers: { adds: number; removes: number; moves: number }): World {
  return {
    roomAt: (x: number) => (x < 9 ? 'kitchen' : x < 20 ? 'yard' : null),
    free: (x: number) => x > 0,
    marker: () => {
      markers.adds++;
      return { move: () => void markers.moves++, remove: () => void markers.removes++ };
    },
  } as unknown as World;
}

describe('ScriptRunner', () => {
  it('runs timed beats frame by frame', () => {
    const log: string[] = [];
    function* s(): Script {
      log.push('a');
      yield 1;
      log.push('b');
      yield 0.5;
      log.push('c');
    }
    const r = new ScriptRunner();
    r.start(s());
    expect(log).toEqual(['a']);
    r.update(0.6);
    expect(log).toEqual(['a']);
    r.update(0.5);
    expect(log).toEqual(['a', 'b']);
    r.update(0.5);
    expect(log).toEqual(['a', 'b', 'c']);
    expect(r.running).toBe(false);
  });

  it('speed scales timed waits; conditions wait until true or time out', () => {
    let flag = false;
    const log: string[] = [];
    function* s(): Script {
      yield 2;
      log.push('fast');
      yield { until: () => flag, max: 5 };
      log.push('flag');
      yield { until: () => false, max: 1 };
      log.push('timeout');
    }
    const r = new ScriptRunner();
    r.start(s());
    r.update(1, 2);
    expect(log).toEqual(['fast']);
    r.update(1);
    expect(log).toEqual(['fast']);
    flag = true;
    r.update(0.1);
    expect(log).toEqual(['fast', 'flag']);
    r.update(0.6);
    r.update(0.6);
    expect(log).toEqual(['fast', 'flag', 'timeout']);
  });

  it('null / 0 continue at once; stop() ends a script; errors are contained', () => {
    const errors: unknown[] = [];
    const log: number[] = [];
    function* s(): Script {
      log.push(1);
      yield null;
      log.push(2);
      yield 0;
      log.push(3);
      yield 5;
      log.push(4);
    }
    const r = new ScriptRunner((e) => errors.push(e));
    r.start(s());
    expect(log).toEqual([1, 2, 3]);
    r.stop();
    r.update(10);
    expect(log).toEqual([1, 2, 3]);
    function* bad(): Script {
      yield 0.1;
      throw new Error('boom');
    }
    r.start(bad());
    expect(() => r.update(1)).not.toThrow();
    expect(errors.length).toBe(1);
    expect(r.running).toBe(false);
  });

  it('a script may replace itself from inside a step', () => {
    const r = new ScriptRunner();
    const log: string[] = [];
    function* second(): Script {
      log.push('second');
      yield 1;
    }
    function* first(): Script {
      log.push('first');
      r.start(second());
      log.push('never');
      yield 1;
    }
    r.start(first());
    // The replaced script finishes its current step, but is never resumed.
    expect(log).toEqual(['first', 'second', 'never']);
    expect(r.running).toBe(true);
    r.update(1);
    r.update(1);
    expect(log).toEqual(['first', 'second', 'never']);
    expect(r.running).toBe(false);
  });
});

describe('Spots (local interaction points)', () => {
  it('returns the nearest enabled spot in reach and manages markers', () => {
    const m = { adds: 0, removes: 0, moves: 0 };
    const spots = new Spots(fakeWorld(m));
    const a = spots.add('a', { x: 0, y: 0, z: 0 }, 'A', { radius: 1 });
    const b = spots.add('b', { x: 1.5, y: 0, z: 0 }, 'B', { radius: 1, marker: false });
    expect(spots.update(0.2, 0, true)).toBe(a);
    expect(spots.update(1.2, 0, true)).toBe(b);
    expect(spots.update(5, 0, true)).toBeNull();
    expect(spots.update(0.2, 0, false)).toBeNull();
    expect(m.adds).toBe(1);
    a.enabled = false;
    expect(spots.update(0.2, 0, true)).toBeNull();
    expect(m.removes).toBe(1);
    a.enabled = true;
    spots.update(0, 0, true);
    a.at = { x: 0.5, y: 0, z: 0 };
    spots.update(0, 0, true);
    expect(m.moves).toBe(1);
    spots.remove(a);
    spots.clear();
    expect(m.removes).toBe(2);
  });
});

describe('geometry helpers', () => {
  it('threshold: midpoint + outward normal of a door', () => {
    const t = threshold({ x: 8, y: 0, z: -4 }, { x: 10, y: 0, z: -4 });
    expect(t.x).toBe(9);
    expect(t.nx).toBeCloseTo(1);
    expect(t.nz).toBeCloseTo(0);
  });

  it('yawToward follows the yaw convention (0 = +Z)', () => {
    expect(yawToward(0, 0, 0, 1)).toBeCloseTo(0);
    expect(yawToward(0, 0, 1, 0)).toBeCloseTo(Math.PI / 2);
  });

  it('isIndoors / firstFree / smooth01', () => {
    const w = fakeWorld({ adds: 0, removes: 0, moves: 0 });
    expect(isIndoors(w, 5, 0)).toBe(true);
    expect(isIndoors(w, 12, 0)).toBe(false);
    expect(isIndoors(w, 30, 0)).toBe(false);
    const fb = { x: 9, y: 0, z: 9 };
    expect(firstFree(w, [{ x: -1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], 0.3, fb).x).toBe(2);
    expect(firstFree(w, [{ x: -1, y: 0, z: 0 }], 0.3, fb)).toBe(fb);
    expect(smooth01(-1)).toBe(0);
    expect(smooth01(0.5)).toBeCloseTo(0.5);
    expect(smooth01(2)).toBe(1);
  });
});

describe('headless safety', () => {
  it('ChipBar and PromptSlot work without a DOM', () => {
    expect(canDom({ textContent: '' })).toBe(false);
    const bar = new ChipBar({ textContent: '' }, [{ id: 'x', label: 'X', slot: 'primary' }]);
    expect(bar.el).toBeNull();
    expect(bar.takePressed('x')).toBe(false);
    expect(bar.isDown('x')).toBe(false);
    bar.setHot('x', true);
    bar.setVisible(false);
    bar.dispose();
    const calls: unknown[] = [];
    const ui = { prompt: (p: unknown) => void calls.push(p) } as unknown as UiManager;
    const slot = new PromptSlot(ui);
    slot.show('Do it', 'primary');
    slot.show('Do it', 'primary');
    slot.hide();
    slot.hide();
    expect(calls.length).toBe(2);
  });
});
