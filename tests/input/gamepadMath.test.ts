import { describe, expect, it } from 'vitest';
import {
  PB,
  SLOT_ALT,
  SLOT_ALT_TRIGGER,
  SLOT_PRIMARY,
  SLOT_SECONDARY,
  STICK_DEADZONE,
  TRIGGER_PRESS,
  TRIGGER_RELEASE,
  createCalib,
  createSnapshot,
  decodeHat,
  detectPadStyle,
  menuDirection,
  padMove,
  padSlots,
  parseVendorProduct,
  radialDeadzone,
  readPad,
  resolveLayout,
  type PadMove,
} from '../../src/input/gamepad';
import {
  DS4_CHROME_ID,
  DS4_FIREFOX_ID,
  DS4_LINUX_ID,
  DUALSENSE_CHROME_ID,
  SWITCH_PRO_ID,
  XBOX_FIREFOX_ID,
  XBOX_ID,
  makePad,
} from './helpers';

const move = (): PadMove => ({ moveX: 0, moveY: 0 });

describe('pad style detection', () => {
  it('Sony: vendor 054c, "Wireless Controller", DualShock, DualSense → playstation', () => {
    expect(detectPadStyle(DS4_CHROME_ID)).toBe('playstation');
    expect(detectPadStyle(DUALSENSE_CHROME_ID)).toBe('playstation');
    expect(detectPadStyle(DS4_FIREFOX_ID)).toBe('playstation');
    expect(detectPadStyle('Wireless Controller')).toBe('playstation');
    expect(detectPadStyle('DUALSHOCK 4 Wireless Controller')).toBe('playstation');
    expect(detectPadStyle('DualSense Edge')).toBe('playstation');
  });

  it('Microsoft: vendor 045e / "Xbox" → xbox (even though it is also a "Wireless Controller")', () => {
    expect(detectPadStyle(XBOX_ID)).toBe('xbox');
    expect(detectPadStyle(XBOX_FIREFOX_ID)).toBe('xbox');
    expect(detectPadStyle('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
  });

  it('Nintendo: vendor 057e / "Nintendo" / "Pro Controller" → nintendo', () => {
    expect(detectPadStyle(SWITCH_PRO_ID)).toBe('nintendo');
    expect(detectPadStyle('Nintendo Switch Pro Controller')).toBe('nintendo');
    expect(detectPadStyle('57e-2009-Pro Controller')).toBe('nintendo');
  });

  it('anything else → generic', () => {
    expect(detectPadStyle('Generic USB Joystick (Vendor: 0079 Product: 0006)')).toBe('generic');
    expect(detectPadStyle('')).toBe('generic');
  });

  it('parses Chrome and Firefox vendor/product formats', () => {
    expect(parseVendorProduct(DS4_CHROME_ID)).toEqual({ vendor: '054c', product: '09cc' });
    expect(parseVendorProduct('54c-9cc-Wireless Controller')).toEqual({ vendor: '054c', product: '09cc' });
    expect(parseVendorProduct('Some Pad')).toBeNull();
  });

  it('picks the layout: standard / ps-evdev (13 buttons) / ps-hid / generic', () => {
    expect(resolveLayout(makePad())).toBe('standard');
    expect(resolveLayout(makePad({ id: DS4_LINUX_ID, mapping: '', buttons: 13, axes: 8 }))).toBe('ps-evdev');
    expect(resolveLayout(makePad({ id: DS4_FIREFOX_ID, mapping: '', buttons: 18, axes: 6 }))).toBe('ps-hid');
    expect(resolveLayout(makePad({ id: 'Some Pad', mapping: '' }))).toBe('generic');
  });
});

describe('readPad', () => {
  it('standard mapping: buttons, stick, analog R2', () => {
    const pad = makePad();
    pad.press(0);
    pad.press(7, 0.8);
    pad.axes[0] = 0.5;
    pad.axes[1] = -0.2;
    const s = createSnapshot();
    readPad(pad, 'standard', s, createCalib());
    expect(s.buttons & PB.SOUTH).toBeTruthy();
    expect(s.r2).toBeCloseTo(0.8);
    expect(s.lx).toBeCloseTo(0.5);
    expect(s.ly).toBeCloseTo(-0.2);
  });

  it('garbage axes are sanitised (NaN / out of range)', () => {
    const pad = makePad();
    pad.axes[0] = Number.NaN;
    pad.axes[1] = 7;
    const s = createSnapshot();
    readPad(pad, 'standard', s, createCalib());
    expect(s.lx).toBe(0);
    expect(s.ly).toBe(1);
  });

  it('generic (non-standard) pads: an axis pinned at ±1 from the start is never trusted', () => {
    const pad = makePad({ id: 'USB Throttle Quadrant', mapping: '', axes: 4 });
    pad.axes[1] = -1; // a throttle resting at full
    const s = createSnapshot();
    const calib = createCalib();
    for (let i = 0; i < 5; i++) readPad(pad, 'generic', s, calib);
    expect(s.ly).toBe(0);
    expect(s.buttons & (PB.STICK_UP | PB.STICK_DOWN)).toBe(0);
    // Once it has been seen near centre it is a real stick.
    pad.axes[1] = 0.05;
    readPad(pad, 'generic', s, calib);
    pad.axes[1] = -1;
    readPad(pad, 'generic', s, calib);
    expect(s.ly).toBe(-1);
  });

  it('ps-evdev (Linux Firefox DS4): Cross first, hat on 6/7, R2 axis', () => {
    const pad = makePad({ id: DS4_LINUX_ID, mapping: '', buttons: 13, axes: 8 });
    pad.press(0); // Cross
    pad.press(3); // Square (evdev order: ✕ ○ △ □)
    pad.axes[7] = -1; // hat up
    pad.axes[5] = 1; // R2 full
    const s = createSnapshot();
    readPad(pad, 'ps-evdev', s, createCalib());
    expect(s.buttons & PB.SOUTH).toBeTruthy();
    expect(s.buttons & PB.WEST).toBeTruthy();
    expect(s.buttons & PB.UP).toBeTruthy();
    expect(s.r2).toBeCloseTo(1);
  });

  it('ps-hid (Windows Firefox DS4): Square first, hat appended as 4 buttons, R2 axis wakes up', () => {
    const pad = makePad({ id: DS4_FIREFOX_ID, mapping: '', buttons: 18, axes: 6 });
    pad.press(1); // Cross (HID order: □ ✕ ○ △)
    pad.press(14 + 2); // D-pad left
    const s = createSnapshot();
    const c = createCalib();
    readPad(pad, 'ps-hid', s, c);
    expect(s.buttons & PB.SOUTH).toBeTruthy();
    expect(s.buttons & PB.LEFT).toBeTruthy();
    expect(s.r2).toBe(0); // axis still at the "0 until touched" value → ignored
    pad.axes[4] = 1;
    readPad(pad, 'ps-hid', s, c);
    expect(s.r2).toBeCloseTo(1);
  });

  it('decodeHat rejects neutral and in-between readings', () => {
    expect(decodeHat(-1)).toBe(PB.UP);
    expect(decodeHat(1)).toBe(PB.UP | PB.LEFT);
    expect(decodeHat(1.2857)).toBe(0);
    expect(decodeHat(0)).toBe(0);
    expect(decodeHat(Number.NaN)).toBe(0);
  });
});

describe('dead zone math', () => {
  it('radialDeadzone: zero inside, no jump at the edge, 1 at full, magnitude never > 1', () => {
    const o = { x: 0, y: 0 };
    radialDeadzone(STICK_DEADZONE * 0.99, 0, STICK_DEADZONE, o);
    expect(o).toEqual({ x: 0, y: 0 });
    radialDeadzone(STICK_DEADZONE + 0.001, 0, STICK_DEADZONE, o);
    expect(o.x).toBeGreaterThan(0);
    expect(o.x).toBeLessThan(0.01);
    radialDeadzone(1, 0, STICK_DEADZONE, o);
    expect(o.x).toBeCloseTo(1);
    radialDeadzone(1, 1, STICK_DEADZONE, o); // square-gate corner (magnitude √2)
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(1);
    expect(o.x).toBeCloseTo(o.y);
  });

  it('radial, not per-axis: a diagonal just outside the zone is not snapped to an axis', () => {
    const o = { x: 0, y: 0 };
    const d = (STICK_DEADZONE + 0.1) / Math.SQRT2; // each axis alone is inside the zone
    radialDeadzone(d, d, STICK_DEADZONE, o);
    expect(o.x).toBeGreaterThan(0);
    expect(o.x).toBeCloseTo(o.y);
  });

  it('radialDeadzone survives NaN', () => {
    const o = { x: 5, y: 5 };
    radialDeadzone(Number.NaN, 0, STICK_DEADZONE, o);
    expect(o).toEqual({ x: 0, y: 0 });
  });
});

describe('padMove', () => {
  it('resting drift inside the dead zone → no movement', () => {
    const s = createSnapshot();
    s.lx = STICK_DEADZONE * 0.9;
    s.ly = 0.05;
    const m = move();
    padMove(s, m);
    expect(m).toEqual({ moveX: 0, moveY: 0 });
  });

  it('stick up (−y) → moveY > 0, full deflection = 1, linear rescale', () => {
    const s = createSnapshot();
    s.ly = -1;
    const m = move();
    padMove(s, m);
    expect(m.moveY).toBeCloseTo(1);
    s.ly = 0;
    s.lx = (1 + STICK_DEADZONE) / 2; // halfway between the dead zone and full
    padMove(s, m);
    expect(m.moveX).toBeCloseTo(0.5);
  });

  it('D-pad overrides the stick, normalised on diagonals', () => {
    const s = createSnapshot();
    s.lx = 1;
    s.buttons = PB.UP | PB.LEFT;
    const m = move();
    padMove(s, m);
    expect(m.moveX).toBeCloseTo(-Math.SQRT1_2);
    expect(m.moveY).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('padSlots', () => {
  it('✕ primary; ○ or □ secondary; R2 alt (R1 is next, not alt)', () => {
    const s = createSnapshot();
    s.buttons = PB.SOUTH;
    expect(padSlots(s, false)).toBe(SLOT_PRIMARY);
    s.buttons = PB.EAST;
    expect(padSlots(s, false)).toBe(SLOT_SECONDARY);
    s.buttons = PB.WEST;
    expect(padSlots(s, false)).toBe(SLOT_SECONDARY);
    s.buttons = PB.R1;
    expect(padSlots(s, false)).toBe(0);
    s.buttons = PB.NORTH | PB.L1 | PB.L2;
    expect(padSlots(s, false)).toBe(0);
  });

  it('analog R2 uses hysteresis around the ~0.35 threshold', () => {
    const s = createSnapshot();
    s.r2 = TRIGGER_PRESS - 0.01;
    expect(padSlots(s, false) & SLOT_ALT).toBe(0);
    s.r2 = TRIGGER_PRESS;
    const on = padSlots(s, false);
    expect(on & SLOT_ALT).toBeTruthy();
    expect(on & SLOT_ALT_TRIGGER).toBeTruthy();
    s.r2 = (TRIGGER_PRESS + TRIGGER_RELEASE) / 2; // between: stays held
    expect(padSlots(s, true) & SLOT_ALT).toBeTruthy();
    s.r2 = TRIGGER_RELEASE - 0.01;
    expect(padSlots(s, true) & SLOT_ALT).toBe(0);
  });
});

describe('menuDirection', () => {
  it('D-pad beats the stick', () => {
    expect(menuDirection(PB.DOWN | PB.STICK_UP)).toBe('down');
    expect(menuDirection(PB.STICK_LEFT)).toBe('left');
    expect(menuDirection(0)).toBeNull();
  });
});
