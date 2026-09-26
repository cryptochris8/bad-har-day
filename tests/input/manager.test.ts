// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, NO_CONTROLS } from '../../src/input';
import { SCHEMES, createHarness, down, key, tap, up, type Harness } from './helpers';

let h: Harness;

beforeEach(() => {
  h = createHarness();
  h.input.setMode('gameplay');
});
afterEach(() => h.dispose());

describe('keyboard → GameControls', () => {
  it('WASD moves screen-relative with normalised diagonals', () => {
    down('KeyW');
    let f = h.step();
    expect(f.moveX).toBe(0);
    expect(f.moveY).toBe(1);
    down('KeyD');
    f = h.step();
    expect(f.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(f.moveY).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(f.moveX, f.moveY)).toBeCloseTo(1);
    up('KeyW');
    up('KeyD');
    f = h.step();
    expect(f.moveX).toBe(0);
    expect(f.moveY).toBe(0);
  });

  it('arrows work the same', () => {
    down('ArrowLeft');
    down('ArrowDown');
    const f = h.step();
    expect(f.moveX).toBeCloseTo(-Math.SQRT1_2);
    expect(f.moveY).toBeCloseTo(-Math.SQRT1_2);
  });

  it('primary (Space / J): held, pressed once, released once', () => {
    down('Space');
    let f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, true, false]);
    down('Space', { repeat: true });
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, false, false]);
    up('Space');
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([false, false, true]);
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([false, false, false]);
    down('KeyJ');
    expect(h.step().primaryPressed).toBe(true);
    expect(h.step().menu).toEqual([]); // Space/J are not 'confirm' in gameplay
  });

  it('secondary (E / K) and alt (Shift / L)', () => {
    down('KeyE');
    down('ShiftLeft');
    let f = h.step();
    expect(f.secondaryPressed).toBe(true);
    expect(f.altPressed).toBe(true);
    expect(f.alt).toBe(true);
    // K / L pressed before E / Shift let go: one continuous hold per slot, no extra edges.
    down('KeyK');
    down('KeyL');
    up('KeyE');
    up('ShiftLeft');
    f = h.step();
    expect([f.secondary, f.secondaryPressed, f.secondaryReleased]).toEqual([true, false, false]);
    expect([f.alt, f.altPressed, f.altReleased]).toEqual([true, false, false]);
    up('KeyK');
    up('KeyL');
    f = h.step();
    expect(f.secondaryReleased).toBe(true);
    expect(f.altReleased).toBe(true);
  });

  it('a tap within one frame is never lost: pressed AND released on the same frame', () => {
    tap('Space');
    let f = h.step();
    expect(f.primary).toBe(true);
    expect(f.primaryPressed).toBe(true);
    expect(f.primaryReleased).toBe(true);
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([false, false, false]);
  });

  it('Shift + WASD still steers (Shift is the alt key, not a browser modifier)', () => {
    down('ShiftLeft');
    const e = down('KeyD', { shiftKey: true });
    const f = h.step();
    expect(e.defaultPrevented).toBe(true);
    expect(f.moveX).toBe(1);
    expect(f.alt).toBe(true);
  });

  it('mapped keys are preventDefault-ed; unmapped keys and Ctrl/Alt/Meta combos are left alone', () => {
    for (const code of ['ArrowDown', 'Space', 'KeyW', 'ShiftLeft', 'KeyE', 'KeyJ', 'KeyK', 'KeyL', 'Escape', 'KeyP', 'KeyM', 'Enter', 'Tab', 'Backspace']) {
      expect(down(code).defaultPrevented).toBe(true);
      up(code);
    }
    expect(down('KeyX').defaultPrevented).toBe(false);
    expect(down('KeyR', { ctrlKey: true }).defaultPrevented).toBe(false); // Ctrl+R: browser's
    expect(down('KeyW', { ctrlKey: true }).defaultPrevented).toBe(false); // Ctrl+W: browser's
    expect(down('KeyD', { altKey: true }).defaultPrevented).toBe(false);
    expect(down('Tab', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('Esc / P pause and M mutes during gameplay', () => {
    down('Escape');
    expect(h.step().menu).toEqual(['pause']);
    down('KeyP');
    down('KeyM');
    expect(h.step().menu).toEqual(['pause', 'mute']);
  });

  it('getControls() returns the same object each frame', () => {
    h.input.update(0.016);
    const a = h.input.getControls();
    h.input.update(0.016);
    expect(h.input.getControls()).toBe(a);
  });
});

describe('menu mode', () => {
  beforeEach(() => h.input.setMode('menu'));

  it('produces MenuActions and neutral controls', () => {
    down('ArrowDown');
    down('Enter');
    down('Escape');
    down('Tab');
    down('Tab', { shiftKey: true });
    down('KeyM');
    const f = h.step();
    expect(f.menu).toEqual(['down', 'confirm', 'back', 'next', 'prev', 'mute']);
    const { menu: _m, ...controls } = f;
    expect(controls).toEqual({ ...NO_CONTROLS });
  });

  it('WASD, Space and Backspace navigate too', () => {
    tap('KeyW');
    tap('KeyA');
    tap('KeyS');
    tap('KeyD');
    tap('Space');
    tap('Backspace');
    expect(h.step().menu).toEqual(['up', 'left', 'down', 'right', 'confirm', 'back']);
  });

  it('held directions auto-repeat (~0.35 s, then ~0.1 s); OS repeats are ignored', () => {
    down('ArrowDown');
    expect(h.step(0.01).menu).toEqual(['down']);
    let fired = 0;
    for (let i = 0; i < 56; i++) {
      if (i % 3 === 0) down('ArrowDown', { repeat: true }); // OS repeat noise
      fired += h.step(0.01).menu.length;
    }
    expect(fired).toBe(3); // at 0.35 s, 0.45 s, 0.55 s
  });

  it('the confirm press that starts an event never leaks into gameplay as a jump', () => {
    down('Space');
    expect(h.step().menu).toEqual(['confirm']);
    h.input.setMode('gameplay');
    let f = h.step();
    expect(f.primary).toBe(false);
    expect(f.primaryPressed).toBe(false);
    down('Space', { repeat: true });
    f = h.step();
    expect(f.primary).toBe(false);
    up('Space');
    f = h.step();
    expect(f.primaryReleased).toBe(false);
    down('Space');
    expect(h.step().primaryPressed).toBe(true);
  });
});

describe('mode switching releases everything', () => {
  it('a held action key is released on pause and ignored on resume until re-pressed', () => {
    down('ShiftLeft');
    expect(h.step().alt).toBe(true);
    h.input.setMode('menu');
    expect(h.step().alt).toBe(false);
    h.input.setMode('gameplay');
    let f = h.step();
    expect(f.alt).toBe(false);
    expect(f.altPressed).toBe(false);
    up('ShiftLeft');
    f = h.step();
    expect(f.altReleased).toBe(false);
    down('ShiftLeft');
    expect(h.step().altPressed).toBe(true);
  });

  it('a key pressed right AFTER the switch is a real press', () => {
    h.input.setMode('menu');
    h.step();
    h.input.setMode('gameplay');
    down('Space');
    expect(h.step().primaryPressed).toBe(true);
  });

  it('edges queued in the old mode are dropped (except mute)', () => {
    h.input.setMode('menu');
    down('Enter');
    down('KeyM');
    h.input.setMode('gameplay'); // before the next update()
    expect(h.step().menu).toEqual(['mute']);
  });

  it('a direction held into a menu does not scroll it; movement resumes on return', () => {
    down('ArrowDown');
    h.step();
    h.input.setMode('menu');
    for (let i = 0; i < 40; i++) expect(h.step(0.05).menu).toEqual([]);
    h.input.setMode('gameplay');
    expect(h.step().moveY).toBe(-1);
  });

  it('setMode with the current mode is a no-op (does not drop a held key)', () => {
    down('Space');
    h.step();
    h.input.setMode('gameplay');
    expect(h.step().primary).toBe(true);
  });
});

describe('focus loss', () => {
  it('window blur releases held keys', () => {
    down('KeyW');
    down('ShiftLeft');
    down('Space');
    h.step();
    window.dispatchEvent(new Event('blur'));
    const f = h.step();
    expect(f.moveY).toBe(0);
    expect(f.alt).toBe(false);
    expect(f.primary).toBe(false);
  });

  it('tab hidden (visibilitychange) resets too', () => {
    down('KeyA');
    h.step();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    expect(h.step().moveX).toBe(0);
  });

  it('keys typed into a text field are not captured', () => {
    const inp = document.createElement('input');
    document.body.appendChild(inp);
    const e = key('keydown', 'KeyW', {}, inp);
    expect(e.defaultPrevented).toBe(false);
    expect(h.step().moveY).toBe(0);
    inp.remove();
  });

  it('keyTarget option: keys are read from that element only', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const input = createInput({ touchRoot: host, keyTarget: host });
    input.setMode('gameplay');
    down('KeyD'); // on window: ignored
    input.update(0.016);
    expect(input.getControls().moveX).toBe(0);
    key('keydown', 'KeyA', {}, host);
    input.update(0.016);
    expect(input.getControls().moveX).toBe(-1);
    input.dispose();
    host.remove();
    up('KeyD');
  });
});

describe('devices & gestures', () => {
  it('lastDevice follows the most recent input and notifies', () => {
    const cb = vi.fn();
    h.input.onDeviceChange(cb);
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(h.input.lastDevice).toBe('touch');
    down('KeyW');
    expect(h.input.lastDevice).toBe('keyboard');
    expect(cb.mock.calls.map((c) => c[0])).toEqual(['touch', 'keyboard']);
  });

  it('onFirstGesture fires once, only on an activating event (not Escape / modifiers / pointerdown)', () => {
    const cb = vi.fn();
    h.input.onFirstGesture(cb);
    down('Escape');
    down('ShiftLeft', { key: 'Shift' });
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    window.dispatchEvent(new Event('touchstart'));
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerup'));
    expect(cb).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('click'));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('touchend, click and keydown each count; unsubscribe works', () => {
    for (const fire of [
      () => window.dispatchEvent(new Event('touchend')),
      () => window.dispatchEvent(new Event('click')),
      () => down('Enter'),
    ]) {
      const cb = vi.fn();
      const off = h.input.onFirstGesture(cb);
      fire();
      expect(cb).toHaveBeenCalledTimes(1);
      off();
    }
    const cb = vi.fn();
    h.input.onFirstGesture(cb)();
    window.dispatchEvent(new Event('click'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('untrusted events never unlock when trust is required', () => {
    h.dispose();
    h = createHarness({ requireTrustedGesture: true });
    const cb = vi.fn();
    h.input.onFirstGesture(cb);
    window.dispatchEvent(new Event('pointerup'));
    expect(cb).not.toHaveBeenCalled();
  });

  it('createInput() works against the real jsdom window and disposes cleanly', () => {
    const root = document.createElement('div');
    const input = createInput({ touchRoot: root });
    expect(root.querySelector('.bhd-touch')).not.toBeNull();
    input.setMode('gameplay');
    input.setScheme(SCHEMES.soccer);
    down('KeyS');
    input.update(1 / 60);
    expect(input.getControls().moveY).toBe(-1);
    input.dispose();
    expect(root.querySelector('.bhd-touch')).toBeNull();
    up('KeyS');
    input.update(1 / 60); // no-op after dispose
  });
});

describe('phone vibration', () => {
  it('touch players get navigator.vibrate after the first gesture; honours the toggle and the gate', () => {
    const vibrate = vi.fn(() => true);
    h.dispose();
    h = createHarness({ prefersTouch: true, nav: { vibrate } as unknown as Navigator });
    h.input.rumble('heavy');
    expect(vibrate).not.toHaveBeenCalled(); // no gesture yet
    window.dispatchEvent(new Event('pointerup'));
    h.input.rumble('heavy');
    expect(vibrate).toHaveBeenCalledTimes(1);
    h.input.rumble('light'); // same instant, weaker: gated
    expect(vibrate).toHaveBeenCalledTimes(1);
    h.clock.t += 1000;
    h.input.setVibrationEnabled(false);
    h.input.rumble('heavy');
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

describe('prev / next edges (Q / R)', () => {
  it('Q and R report one-frame prev/next edges in gameplay only', () => {
    const h = createHarness();
    h.input.setMode('gameplay');
    h.step();
    down('KeyQ');
    let f = h.step();
    expect(f.prevPressed).toBe(true);
    expect(f.nextPressed).toBe(false);
    f = h.step();
    expect(f.prevPressed).toBe(false);
    up('KeyQ');
    down('KeyR');
    f = h.step();
    expect(f.nextPressed).toBe(true);
    up('KeyR');
    h.input.setMode('menu');
    down('KeyR');
    f = h.step();
    expect(f.nextPressed).toBe(false);
    up('KeyR');
    h.dispose();
  });
});
