// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { GameClockImpl, clockLabel } from '../../src/game/clock';
import { PointerImpl, stepVirtual, toNdc } from '../../src/game/pointer';
import { NO_CONTROLS, type GameControls } from '../../src/input/types';

describe('clock', () => {
  it('formats 12-hour labels', () => {
    expect(clockLabel(315)).toBe('5:15 AM');
    expect(clockLabel(360)).toBe('6:00 AM');
    expect(clockLabel(485.9)).toBe('8:05 AM');
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(12 * 60 + 5)).toBe('12:05 PM');
  });

  it('runs only in run mode, respects the cap, never goes back', () => {
    const c = new GameClockImpl(315);
    c.rate = 1;
    c.update(10);
    expect(c.minutes).toBe(315);
    c.mode = 'run';
    c.update(10);
    expect(c.minutes).toBe(325);
    c.cap = 330;
    c.update(100);
    expect(c.minutes).toBe(330);
    expect(c.atCap).toBe(true);
    c.advance(5);
    expect(c.minutes).toBe(330);
    c.cap = Number.POSITIVE_INFINITY;
    c.jumpTo(300);
    expect(c.minutes).toBe(330);
    c.jumpTo(360);
    expect(c.minutes).toBe(360);
    expect(c.label()).toBe('6:00 AM');
  });
});

describe('pointer math', () => {
  it('maps px to NDC', () => {
    expect(toNdc(0, 0, 200, 100)).toEqual({ x: -1, y: 1 });
    expect(toNdc(200, 100, 200, 100)).toEqual({ x: 1, y: -1 });
    expect(toNdc(100, 50, 200, 100)).toEqual({ x: 0, y: 0 });
  });

  it('moves the virtual cursor with the stick and clamps', () => {
    const p = stepVirtual(100, 100, 1, 0, 1, 0.5, 400, 200);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBe(100);
    const up = stepVirtual(100, 100, 0, 1, 1, 0.1, 400, 200);
    expect(up.y).toBeLessThan(100);
    expect(stepVirtual(390, 5, 1, 1, 5, 1, 400, 200)).toEqual({ x: 400, y: 0 });
    const soft = stepVirtual(100, 100, 0.3, 0, 1, 0.1, 400, 200);
    expect(soft.x - 100).toBeLessThan(0.3 * 200 * 0.1);
  });
});

function fakeCanvas() {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

function ptr(type: string, x: number, y: number, pointerType = 'mouse', id = 1): Event {
  const e = new Event(type) as Event & Record<string, unknown>;
  Object.assign(e, { clientX: x, clientY: y, pointerType, pointerId: id });
  return e;
}

const ctl = (over: Partial<GameControls> = {}): GameControls => ({ ...NO_CONTROLS, ...over });

describe('PointerImpl', () => {
  it('tracks the mouse with press/release edges', () => {
    const el = fakeCanvas();
    const p = new PointerImpl(el, el);
    p.enable();
    el.dispatchEvent(ptr('pointermove', 100, 50));
    p.update(1 / 60, ctl(), 'keyboard');
    expect(p.active).toBe(true);
    expect(p.source).toBe('mouse');
    expect(p.ndcX).toBeCloseTo(-0.5);
    expect(p.ndcY).toBeCloseTo(0.5);
    el.dispatchEvent(ptr('pointerdown', 100, 50));
    p.update(1 / 60, ctl(), 'keyboard');
    expect(p.pressed && p.down).toBe(true);
    p.update(1 / 60, ctl(), 'keyboard');
    expect(p.pressed).toBe(false);
    expect(p.down).toBe(true);
    el.dispatchEvent(ptr('pointerup', 120, 60));
    p.update(1 / 60, ctl(), 'keyboard');
    expect(p.released).toBe(true);
    expect(p.down).toBe(false);
    p.dispose();
  });

  it('a sub-frame tap reports pressed, released and down', () => {
    const el = fakeCanvas();
    const p = new PointerImpl(el, el);
    p.enable();
    el.dispatchEvent(ptr('pointerdown', 10, 10, 'touch'));
    el.dispatchEvent(ptr('pointerup', 10, 10, 'touch'));
    p.update(1 / 60, ctl(), 'touch');
    expect(p.pressed && p.released && p.down).toBe(true);
    expect(p.source).toBe('touch');
    p.dispose();
  });

  it('switches to the virtual cursor with the stick; primary is the button', () => {
    const el = fakeCanvas();
    const p = new PointerImpl(el, el);
    p.enable();
    p.update(1, ctl(), 'gamepad'); // let "recent real input" expire
    const x0 = p.x;
    p.update(0.1, ctl({ moveX: 1 }), 'gamepad');
    expect(p.source).toBe('virtual');
    expect(p.x).toBeGreaterThan(x0);
    p.update(0.016, ctl({ primary: true, primaryPressed: true }), 'gamepad');
    expect(p.pressed && p.down).toBe(true);
    p.update(0.016, ctl({ primaryReleased: true }), 'gamepad');
    expect(p.released).toBe(true);
    expect(p.down).toBe(false);
    // A real mouse move takes over again.
    el.dispatchEvent(ptr('pointermove', 5, 5));
    p.update(0.016, ctl(), 'keyboard');
    expect(p.source).toBe('mouse');
    expect(p.x).toBe(5);
    p.dispose();
  });

  it('is neutral while disabled', () => {
    const el = fakeCanvas();
    const p = new PointerImpl(el, el);
    el.dispatchEvent(ptr('pointerdown', 10, 10));
    p.update(0.016, ctl(), 'keyboard');
    expect(p.pressed).toBe(false);
    expect(p.enabled).toBe(false);
    p.dispose();
  });
});

describe('PointerImpl — virtual start', () => {
  it('stays centred before any real input and warp() activates the virtual cursor', () => {
    const el = fakeCanvas();
    const p = new PointerImpl(el, el);
    p.enable();
    p.update(0.016, ctl(), 'gamepad');
    expect(p.x).toBe(200);
    expect(p.y).toBe(100);
    expect(p.pressed || p.down).toBe(false);
    p.warp(0, -0.5);
    expect(p.active).toBe(true);
    expect(p.source).toBe('virtual');
    expect(p.ndcY).toBeCloseTo(-0.5);
    p.update(0.016, ctl({ primary: true, primaryPressed: true }), 'gamepad');
    expect(p.down && p.pressed).toBe(true);
    expect(p.y).toBeCloseTo(150);
    p.dispose();
  });
});
