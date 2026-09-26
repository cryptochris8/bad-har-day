import { describe, expect, it } from 'vitest';
import { MENU_REPEAT_DELAY, MENU_REPEAT_INTERVAL, MenuRepeat, type MenuDir } from '../../src/input/menuRepeat';

/** Hold `dir` for `frames` steps of `dt`, returning the step indices that emitted. */
function hold(r: MenuRepeat, dir: MenuDir, frames: number, dt: number): number[] {
  const hits: number[] = [];
  for (let i = 0; i < frames; i++) if (r.step(dir, dt) !== null) hits.push(i);
  return hits;
}

describe('MenuRepeat', () => {
  it('console timing: 350 ms delay, then every 100 ms', () => {
    expect(MENU_REPEAT_DELAY).toBeCloseTo(0.35, 9);
    expect(MENU_REPEAT_INTERVAL).toBeCloseTo(0.1, 9);
  });

  it('fires on press, after the delay, then at the interval (10 ms steps)', () => {
    const r = new MenuRepeat();
    // step 0 = press (held 0), step k = held k*10ms
    expect(hold(r, 'down', 76, 0.01)).toEqual([0, 35, 45, 55, 65, 75]);
  });

  it('~8 moves per second of holding at 60 fps', () => {
    const r = new MenuRepeat();
    expect(hold(r, 'up', 60, 1 / 60)).toHaveLength(8);
  });

  it('releasing stops it; pressing again fires immediately', () => {
    const r = new MenuRepeat();
    expect(r.step('left', 0.016)).toBe('left');
    expect(r.step('left', 0.016)).toBeNull();
    expect(r.step(null, 0.016)).toBeNull();
    expect(r.step('left', 0.016)).toBe('left');
  });

  it('changing direction fires immediately and restarts the delay', () => {
    const r = new MenuRepeat();
    hold(r, 'down', 30, 0.01);
    expect(r.step('right', 0.01)).toBe('right');
    expect(hold(r, 'right', 34, 0.01)).toEqual([]);
    expect(r.step('right', 0.01)).toBe('right');
  });

  it('never bursts after a long frame', () => {
    const r = new MenuRepeat();
    r.step('down', 0);
    expect(r.step('down', 2)).toBe('down');
    expect(r.step('down', 0.01)).toBeNull();
  });

  it('reset() forgets the held direction', () => {
    const r = new MenuRepeat();
    r.step('up', 0);
    r.reset();
    expect(r.step('up', 0.01)).toBe('up');
  });
});
