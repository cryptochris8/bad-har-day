// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MENU_REPEAT_DELAY, MENU_REPEAT_INTERVAL } from '../../src/input/menuRepeat';
import { RUMBLE_MIN_INTERVAL } from '../../src/input/rumble';
import {
  DS4_FIREFOX_ID,
  DS4_LINUX_ID,
  STD,
  SWITCH_PRO_ID,
  XBOX_ID,
  createHarness,
  down,
  makePad,
  type FakePad,
  type Harness,
} from './helpers';

let h: Harness;
let pad: FakePad;

/** Harness with a DS4 (Chrome, standard mapping) connected before the first poll. */
beforeEach(() => {
  h = createHarness();
  pad = makePad();
  h.pads.push(pad);
  h.step(); // first poll: pad discovered (primed)
  h.input.setMode('gameplay');
});
afterEach(() => h.dispose());

describe('DS4 standard mapping → gameplay', () => {
  it('left stick moves (up = +y), resting drift ignored, magnitude ≤ 1', () => {
    pad.axes[0] = 0.08;
    pad.axes[1] = -0.1;
    let f = h.step();
    expect(f.moveX).toBe(0);
    expect(f.moveY).toBe(0);
    pad.axes[0] = 0;
    pad.axes[1] = -1;
    f = h.step();
    expect(f.moveY).toBeCloseTo(1);
    pad.axes[0] = 1;
    pad.axes[1] = -1;
    f = h.step();
    expect(Math.hypot(f.moveX, f.moveY)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('D-pad moves at full speed', () => {
    pad.press(STD.LEFT);
    expect(h.step().moveX).toBe(-1);
  });

  it('Cross = primary: pressed once, held, released once', () => {
    pad.press(STD.CROSS);
    let f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, true, false]);
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, false, false]);
    pad.release(STD.CROSS);
    f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([false, false, true]);
  });

  it('Circle or Square = secondary', () => {
    pad.press(STD.CIRCLE);
    expect(h.step().secondaryPressed).toBe(true);
    pad.release(STD.CIRCLE);
    h.step();
    pad.press(STD.SQUARE);
    expect(h.step().secondaryPressed).toBe(true);
  });

  it('R2 (analog past ~0.35) = alt; L1 / R1 = prev / next edges', () => {
    pad.press(STD.R2, 0.2);
    expect(h.step().alt).toBe(false);
    pad.press(STD.R2, 0.5);
    let f = h.step();
    expect(f.alt).toBe(true);
    expect(f.altPressed).toBe(true);
    pad.press(STD.R2, 0.3); // inside the hysteresis band: still held
    expect(h.step().alt).toBe(true);
    pad.release(STD.R2);
    expect(h.step().altReleased).toBe(true);
    pad.press(STD.R1);
    f = h.step();
    expect(f.altPressed).toBe(false);
    expect(f.nextPressed).toBe(true);
    expect(h.step().nextPressed).toBe(false); // edge: exactly one frame
    pad.release(STD.R1);
    h.step();
    pad.press(STD.L1);
    f = h.step();
    expect(f.prevPressed).toBe(true);
    expect(f.nextPressed).toBe(false);
  });

  it('Options pauses; Triangle / L2 do nothing in gameplay', () => {
    pad.press(STD.TRIANGLE);
    pad.press(STD.L2, 1);
    let f = h.step();
    expect(f.menu).toEqual([]);
    expect(f.primary || f.secondary || f.alt).toBe(false);
    pad.press(STD.OPTIONS);
    f = h.step();
    expect(f.menu).toEqual(['pause']);
  });

  it('keyboard and pad coexist: the bigger deflection wins, no drift from a resting stick', () => {
    pad.axes[0] = 0.12; // inside the dead zone
    down('KeyA');
    const f = h.step();
    expect(f.moveX).toBe(-1);
    expect(f.moveY).toBe(0);
  });

  it('keyboard + pad holding the same slot is one continuous hold', () => {
    pad.press(STD.CROSS);
    h.step();
    down('Space');
    expect(h.step().primaryPressed).toBe(false);
    pad.release(STD.CROSS);
    const f = h.step();
    expect(f.primary).toBe(true);
    expect(f.primaryReleased).toBe(false);
  });
});

describe('menus with a pad', () => {
  beforeEach(() => {
    h.input.setMode('menu');
    h.step();
  });

  it('D-pad / stick navigate with console auto-repeat; Cross confirms, Circle backs, L1/R1 prev/next, Options pause', () => {
    pad.press(STD.DOWN);
    expect(h.step().menu).toEqual(['down']);
    const dt = 0.01;
    let fired = 0;
    const frames = Math.round((MENU_REPEAT_DELAY + MENU_REPEAT_INTERVAL * 2) / dt) + 1;
    for (let i = 0; i < frames; i++) fired += h.step(dt).menu.length;
    expect(fired).toBe(3);
    pad.release(STD.DOWN);
    h.step();
    pad.axes[0] = 0.9; // stick right
    expect(h.step().menu).toEqual(['right']);
    pad.axes[0] = 0;
    h.step();
    pad.press(STD.CROSS);
    pad.press(STD.CIRCLE);
    pad.press(STD.L1);
    pad.press(STD.R1);
    pad.press(STD.OPTIONS);
    expect(h.step().menu).toEqual(['confirm', 'back', 'prev', 'next', 'pause']);
  });

  it('the Cross press that starts an event never becomes a jump (no leak)', () => {
    pad.press(STD.CROSS);
    expect(h.step().menu).toEqual(['confirm']);
    h.input.setMode('gameplay');
    let f = h.step();
    expect(f.primary).toBe(false);
    expect(f.primaryPressed).toBe(false);
    pad.release(STD.CROSS);
    f = h.step();
    expect(f.primaryReleased).toBe(false);
    pad.press(STD.CROSS);
    expect(h.step().primaryPressed).toBe(true);
  });

  it('a button pressed right AFTER the switch (before the next poll) is a real press', () => {
    h.input.setMode('gameplay');
    pad.press(STD.CROSS);
    expect(h.step().primaryPressed).toBe(true);
  });

  it('R2 held across a resume is latched until released', () => {
    pad.press(STD.R2, 1);
    h.step();
    h.input.setMode('gameplay');
    expect(h.step().alt).toBe(false);
    pad.release(STD.R2);
    h.step();
    pad.press(STD.R2, 1);
    expect(h.step().altPressed).toBe(true);
  });

  it('a stick / D-pad already held when a menu opens never scrolls it, even after the repeat delay', () => {
    h.input.setMode('gameplay');
    pad.axes[1] = 1;
    h.step();
    h.input.setMode('menu');
    for (let i = 0; i < 40; i++) expect(h.step(0.05).menu).toEqual([]);
    pad.axes[1] = 0; // released → next push works
    h.step();
    pad.axes[1] = 1;
    expect(h.step().menu).toEqual(['down']);
  });

  it('a gameplay button held into a menu does not confirm', () => {
    h.input.setMode('gameplay');
    pad.press(STD.CROSS);
    h.step();
    h.input.setMode('menu');
    expect(h.step().menu).toEqual([]);
  });
});

describe('connections', () => {
  it('reports style, disconnect (wasActive) and reconnection; prompts fall back to keyboard', () => {
    const events: string[] = [];
    h.input.onGamepadConnection((c, info, wasActive?: boolean) =>
      events.push(`${c ? '+' : '-'}${info.style}:${String(wasActive)}`),
    );
    pad.press(STD.CROSS);
    h.step();
    expect(h.input.lastDevice).toBe('gamepad');
    expect(h.input.gamepad()).toMatchObject({ connected: true, style: 'playstation' });
    h.pads.length = 0; // unplugged (no event: polling notices)
    h.step();
    expect(h.input.gamepad().connected).toBe(false);
    expect(h.input.lastDevice).toBe('keyboard');
    const again = makePad();
    again.press(STD.CROSS); // Chrome exposes a pad after a press: that press counts
    h.pads.push(again);
    const f = h.step();
    expect(f.primaryPressed).toBe(true);
    expect(h.input.lastDevice).toBe('gamepad');
    expect(events).toEqual(['-playstation:true', '+playstation:true']);
  });

  it('gamepadconnected / gamepaddisconnected events are honoured too', () => {
    const events: string[] = [];
    h.input.onGamepadConnection((c, info) => events.push(`${c ? '+' : '-'}${info.style}`));
    const xbox = makePad({ id: XBOX_ID, index: 1 });
    const ev = new Event('gamepadconnected') as Event & { gamepad?: unknown };
    ev.gamepad = xbox;
    window.dispatchEvent(ev);
    const dv = new Event('gamepaddisconnected') as Event & { gamepad?: unknown };
    dv.gamepad = pad;
    window.dispatchEvent(dv);
    expect(events).toEqual(['+xbox', '-playstation']);
  });

  it('follows the most recently used pad (DS4 + Xbox); style change notifies device listeners', () => {
    const xbox = makePad({ id: XBOX_ID, index: 1 });
    h.pads.push(xbox);
    h.step();
    pad.press(STD.CROSS);
    h.step();
    pad.release(STD.CROSS);
    h.step();
    const devCb = vi.fn();
    h.input.onDeviceChange(devCb);
    xbox.press(STD.CROSS);
    h.step();
    expect(h.input.gamepad().style).toBe('xbox');
    expect(devCb).toHaveBeenCalledWith('gamepad');
    xbox.release(STD.CROSS);
    xbox.axes[0] = 1;
    expect(h.step().moveX).toBeCloseTo(1);
  });

  it('an idle second pad powering off is not the active pad', () => {
    const xbox = makePad({ id: XBOX_ID, index: 1 });
    h.pads.push(xbox);
    h.step();
    pad.press(STD.CROSS);
    h.step();
    const gone: boolean[] = [];
    h.input.onGamepadConnection((c, _i, wasActive?: boolean) => {
      if (!c) gone.push(!!wasActive);
    });
    h.pads.splice(1, 1);
    h.step();
    expect(gone).toEqual([false]);
    expect(h.input.gamepad().style).toBe('playstation');
  });

  it('Switch Pro reports the nintendo style; the bottom button is still primary (positional)', () => {
    h.pads[0] = makePad({ id: SWITCH_PRO_ID });
    h.step();
    h.pads[0]!.press(STD.CROSS);
    expect(h.step().primaryPressed).toBe(true);
    expect(h.input.gamepad().style).toBe('nintendo');
  });

  it('non-standard DS4 layouts drive the game (Linux evdev, Windows Firefox HID)', () => {
    const lin = makePad({ id: DS4_LINUX_ID, mapping: '', buttons: 13, axes: 8, index: 0 });
    h.pads[0] = lin;
    h.step();
    lin.press(0); // Cross
    lin.axes[1] = -1;
    let f = h.step();
    expect(f.primaryPressed).toBe(true);
    expect(f.moveY).toBeCloseTo(1);

    const win = makePad({ id: DS4_FIREFOX_ID, mapping: '', buttons: 18, axes: 6, index: 0 });
    h.pads[0] = win;
    h.step();
    win.press(0); // Square in HID order → secondary
    win.press(14 + 3); // appended D-pad right
    f = h.step();
    expect(f.secondaryPressed).toBe(true);
    expect(f.moveX).toBeCloseTo(1);
  });

  it('a non-standard generic device with garbage axes / stuck buttons does nothing', () => {
    h.pads.length = 0;
    h.step();
    const junk = makePad({ id: 'Weird HID Device', mapping: '', buttons: 6, axes: 6, index: 2 });
    junk.axes[0] = 1;
    junk.axes[1] = -1;
    junk.axes[2] = Number.NaN;
    junk.press(0); // stuck
    h.pads.push(junk);
    for (let i = 0; i < 10; i++) {
      const f = h.step();
      expect(f.moveX).toBe(0);
      expect(f.moveY).toBe(0);
      expect(f.primaryPressed).toBe(false);
    }
    h.input.setMode('menu');
    for (let i = 0; i < 20; i++) expect(h.step(0.05).menu).toEqual([]);
  });

  it('getGamepads throwing (insecure context) is survivable', () => {
    h.dispose();
    h = createHarness({
      getGamepads: () => {
        throw new Error('SecurityError');
      },
    });
    h.input.setMode('gameplay');
    expect(() => h.step()).not.toThrow();
    expect(h.input.gamepad().connected).toBe(false);
  });
});

describe('rumble', () => {
  it('rumbles the active pad when it is the last device; honours the toggle', () => {
    pad.press(STD.CROSS);
    h.step();
    h.input.rumble('heavy');
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledWith(
      'dual-rumble',
      expect.objectContaining({ strongMagnitude: 1 }),
    );
    pad.vibrationActuator!.playEffect.mockClear();
    h.clock.t += 5000;
    h.input.setVibrationEnabled(false);
    h.input.rumble('light');
    expect(pad.vibrationActuator!.playEffect).not.toHaveBeenCalled();
    h.input.setVibrationEnabled(true);
    h.input.rumble('light');
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledTimes(1);
  });

  it('does not spam: repeated calls inside the min interval are dropped', () => {
    pad.press(STD.CROSS);
    h.step();
    for (let i = 0; i < 10; i++) {
      h.input.rumble('medium');
      h.clock.t += 10;
    }
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledTimes(Math.ceil(100 / RUMBLE_MIN_INTERVAL));
  });

  it('keyboard players are never rumbled', () => {
    down('KeyW');
    h.input.rumble('score');
    expect(pad.vibrationActuator!.playEffect).not.toHaveBeenCalled();
  });

  it('focus loss: a button still held on return is not a new press', () => {
    pad.press(STD.CROSS);
    h.step();
    window.dispatchEvent(new Event('blur'));
    const f = h.step();
    expect(f.primary).toBe(false);
    expect(f.primaryPressed).toBe(false);
  });
});
