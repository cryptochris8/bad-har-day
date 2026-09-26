import { describe, expect, it } from 'vitest';
import { bindingLabels, type BindingSlot } from '../../src/input';
import { keyRole, slotOfRole } from '../../src/input/keymap';
import type { PadStyle } from '../../src/input/types';
import { SCHEMES } from './helpers';

const SLOTS: BindingSlot[] = ['primary', 'secondary', 'alt', 'move', 'pause'];
const STYLES: PadStyle[] = ['playstation', 'xbox', 'nintendo', 'generic'];

describe('bindingLabels — keyboard', () => {
  it('primary SPACE/J, secondary E/K, alt SHIFT/L, move WASD/ARROWS, pause ESC/P', () => {
    expect(bindingLabels('primary', 'keyboard')).toEqual(['SPACE', 'J']);
    expect(bindingLabels('secondary', 'keyboard')).toEqual(['E', 'K']);
    expect(bindingLabels('alt', 'keyboard')).toEqual(['SHIFT', 'L']);
    expect(bindingLabels('move', 'keyboard')).toEqual(['WASD', 'ARROWS']);
    expect(bindingLabels('pause', 'keyboard')).toEqual(['ESC', 'P']);
  });

  it('agrees with the real key map', () => {
    expect(slotOfRole(keyRole('Space', ' ')!)).toBe('primary');
    expect(slotOfRole(keyRole('KeyJ', 'j')!)).toBe('primary');
    expect(slotOfRole(keyRole('KeyE', 'e')!)).toBe('secondary');
    expect(slotOfRole(keyRole('KeyK', 'k')!)).toBe('secondary');
    expect(slotOfRole(keyRole('ShiftLeft', 'Shift')!)).toBe('alt');
    expect(slotOfRole(keyRole('KeyL', 'l')!)).toBe('alt');
  });

  it('ignores the pad style', () => {
    expect(bindingLabels('primary', 'keyboard', 'xbox')).toEqual(bindingLabels('primary', 'keyboard', 'playstation'));
  });
});

describe('bindingLabels — gamepad', () => {
  it('PlayStation glyphs', () => {
    expect(bindingLabels('primary', 'gamepad', 'playstation')).toEqual(['✕']);
    expect(bindingLabels('secondary', 'gamepad', 'playstation')).toEqual(['○', '□']);
    expect(bindingLabels('alt', 'gamepad', 'playstation')).toEqual(['R2']);
    expect(bindingLabels('pause', 'gamepad', 'playstation')).toEqual(['OPTIONS']);
  });

  it('Xbox letters', () => {
    expect(bindingLabels('primary', 'gamepad', 'xbox')).toEqual(['A']);
    expect(bindingLabels('secondary', 'gamepad', 'xbox')).toEqual(['B', 'X']);
    expect(bindingLabels('alt', 'gamepad', 'xbox')).toEqual(['RT']);
    expect(bindingLabels('pause', 'gamepad', 'xbox')).toEqual(['MENU']);
  });

  it('Nintendo: positional, so the bottom button prints "B"', () => {
    expect(bindingLabels('primary', 'gamepad', 'nintendo')).toEqual(['B']);
    expect(bindingLabels('secondary', 'gamepad', 'nintendo')).toEqual(['A', 'Y']);
    expect(bindingLabels('alt', 'gamepad', 'nintendo')).toEqual(['ZR']);
    expect(bindingLabels('pause', 'gamepad', 'nintendo')).toEqual(['+']);
  });

  it('every style has a non-empty label for every slot; move is the stick', () => {
    for (const st of STYLES) {
      for (const s of SLOTS) expect(bindingLabels(s, 'gamepad', st).length).toBeGreaterThan(0);
      expect(bindingLabels('move', 'gamepad', st)[0]).toBe('L-STICK');
    }
  });
});

describe('bindingLabels — touch', () => {
  it('buttons show the scheme label; missing slots have no binding', () => {
    expect(bindingLabels('primary', 'touch', 'generic', SCHEMES.football)).toEqual(['JUMP']);
    expect(bindingLabels('secondary', 'touch', 'generic', SCHEMES.football)).toEqual(['SPIN']);
    expect(bindingLabels('alt', 'touch', 'generic', SCHEMES.football)).toEqual(['SPRINT']);
    expect(bindingLabels('secondary', 'touch', 'generic', SCHEMES.hoops)).toEqual([]);
  });

  it('move → JOYSTICK (none when the scheme hides it); pause → the pause button', () => {
    expect(bindingLabels('move', 'touch', 'generic', SCHEMES.soccer)).toEqual(['JOYSTICK']);
    expect(bindingLabels('move', 'touch', 'generic', { ...SCHEMES.soccer, move: 'none' })).toEqual([]);
    expect(bindingLabels('pause', 'touch')).toEqual(['❚❚']);
  });

  it('without a scheme the buttons fall back to TAP', () => {
    expect(bindingLabels('primary', 'touch')).toEqual(['TAP']);
    expect(bindingLabels('move', 'touch')).toEqual(['JOYSTICK']);
  });

  it('returns a fresh array each call', () => {
    const a = bindingLabels('primary', 'keyboard');
    a.push('X');
    expect(bindingLabels('primary', 'keyboard')).toEqual(['SPACE', 'J']);
  });
});
