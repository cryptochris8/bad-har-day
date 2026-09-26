import { describe, expect, it } from 'vitest';
import { SRC_KEYBOARD, SRC_PAD, SRC_TOUCH, SlotState, type SlotFrame } from '../../src/input/slots';

function roll(s: SlotState): SlotFrame {
  const f: SlotFrame = { held: false, pressed: false, released: false };
  s.roll(f);
  return f;
}

describe('SlotState edge semantics', () => {
  it('press → held frames → release: each edge exactly one frame', () => {
    const s = new SlotState();
    s.set(SRC_KEYBOARD, true);
    expect(roll(s)).toEqual({ held: true, pressed: true, released: false });
    expect(roll(s)).toEqual({ held: true, pressed: false, released: false });
    s.set(SRC_KEYBOARD, false);
    expect(roll(s)).toEqual({ held: false, pressed: false, released: true });
    expect(roll(s)).toEqual({ held: false, pressed: false, released: false });
  });

  it('a tap inside one frame is never lost: held + pressed + released on that frame', () => {
    const s = new SlotState();
    s.set(SRC_TOUCH, true);
    s.set(SRC_TOUCH, false);
    expect(roll(s)).toEqual({ held: true, pressed: true, released: true });
    expect(roll(s)).toEqual({ held: false, pressed: false, released: false });
  });

  it('release + re-press inside one frame reports both edges and stays held', () => {
    const s = new SlotState();
    s.set(SRC_KEYBOARD, true);
    roll(s);
    s.set(SRC_KEYBOARD, false);
    s.set(SRC_KEYBOARD, true);
    expect(roll(s)).toEqual({ held: true, pressed: true, released: true });
    expect(roll(s)).toEqual({ held: true, pressed: false, released: false });
  });

  it('overlapping devices are one continuous hold', () => {
    const s = new SlotState();
    s.set(SRC_KEYBOARD, true);
    roll(s);
    s.set(SRC_PAD, true); // pad joins: no second press
    expect(roll(s).pressed).toBe(false);
    s.set(SRC_KEYBOARD, false); // keyboard lets go: still held by the pad
    expect(roll(s)).toEqual({ held: true, pressed: false, released: false });
    s.set(SRC_PAD, false);
    expect(roll(s)).toEqual({ held: false, pressed: false, released: true });
  });

  it('set() is idempotent (the pad reports its level every frame)', () => {
    const s = new SlotState();
    s.set(SRC_PAD, true);
    s.set(SRC_PAD, true);
    expect(roll(s).pressed).toBe(true);
    s.set(SRC_PAD, true);
    expect(roll(s).pressed).toBe(false);
    s.set(SRC_PAD, false);
    s.set(SRC_PAD, false);
    expect(roll(s).released).toBe(true);
    s.set(SRC_PAD, false);
    expect(roll(s).released).toBe(false);
  });

  it('clear() forgets holders and edges without reporting a release', () => {
    const s = new SlotState();
    s.set(SRC_KEYBOARD, true);
    s.clear();
    expect(roll(s)).toEqual({ held: false, pressed: false, released: false });
    expect(s.isHeld).toBe(false);
    s.set(SRC_KEYBOARD, false); // late release after a clear: harmless
    expect(roll(s)).toEqual({ held: false, pressed: false, released: false });
  });
});
