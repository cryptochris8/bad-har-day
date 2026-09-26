import { describe, expect, it } from 'vitest';
import { allowedWhileTyping, isAxisRole, keyId, keyRole, menuActionFor, slotOfRole } from '../../src/input/keymap';

describe('keyRole', () => {
  it('maps the GDD §13 keys by physical code', () => {
    expect(keyRole('KeyW', 'w')).toBe('up');
    expect(keyRole('ArrowUp', 'ArrowUp')).toBe('up');
    expect(keyRole('KeyA', 'a')).toBe('left');
    expect(keyRole('KeyS', 's')).toBe('down');
    expect(keyRole('KeyD', 'd')).toBe('right');
    expect(keyRole('ArrowRight', 'ArrowRight')).toBe('right');
    expect(keyRole('Space', ' ')).toBe('space');
    expect(keyRole('KeyJ', 'j')).toBe('primary');
    expect(keyRole('KeyE', 'e')).toBe('secondary');
    expect(keyRole('KeyK', 'k')).toBe('secondary');
    expect(keyRole('ShiftLeft', 'Shift')).toBe('alt');
    expect(keyRole('ShiftRight', 'Shift')).toBe('alt');
    expect(keyRole('KeyL', 'l')).toBe('alt');
    expect(keyRole('Escape', 'Escape')).toBe('escape');
    expect(keyRole('KeyP', 'p')).toBe('pause');
    expect(keyRole('KeyM', 'm')).toBe('mute');
    expect(keyRole('Enter', 'Enter')).toBe('enter');
    expect(keyRole('NumpadEnter', 'Enter')).toBe('enter');
    expect(keyRole('Backspace', 'Backspace')).toBe('backspace');
    expect(keyRole('Tab', 'Tab')).toBe('tab');
  });

  it('matches by position on AZERTY (code KeyW sends key "z")', () => {
    expect(keyRole('KeyW', 'z')).toBe('up');
    expect(keyRole('KeyA', 'q')).toBe('left');
  });

  it('falls back to key when code is empty or Unidentified', () => {
    expect(keyRole('', 'e')).toBe('secondary');
    expect(keyRole('Unidentified', 'Shift')).toBe('alt');
    expect(keyRole('', 'Esc')).toBe('escape');
    expect(keyRole('', ' ')).toBe('space');
  });

  it('ignores unmapped keys', () => {
    expect(keyRole('KeyX', 'x')).toBeNull();
    expect(keyRole('KeyQ', 'q')).toBe('prevTab');
    expect(keyRole('KeyR', 'r')).toBe('nextTab');
    expect(keyRole('F5', 'F5')).toBeNull();
    expect(keyRole('ControlLeft', 'Control')).toBeNull();
    expect(keyRole('', 'x')).toBeNull();
  });

  it('keyId prefers code', () => {
    expect(keyId('KeyE', 'e')).toBe('KeyE');
    expect(keyId('', 'E')).toBe('key:e');
    expect(keyId('Unidentified', 'E')).toBe('key:e');
  });

  it('slots and axes', () => {
    expect(slotOfRole('space')).toBe('primary');
    expect(slotOfRole('primary')).toBe('primary');
    expect(slotOfRole('secondary')).toBe('secondary');
    expect(slotOfRole('alt')).toBe('alt');
    expect(slotOfRole('up')).toBeNull();
    expect(slotOfRole('enter')).toBeNull();
    expect(isAxisRole('left')).toBe(true);
    expect(isAxisRole('space')).toBe(false);
  });
});

describe('menuActionFor', () => {
  it('menu: directions, confirm, back, tab next/prev, pause, mute', () => {
    expect(menuActionFor('up', 'menu', false)).toBe('up');
    expect(menuActionFor('right', 'menu', false)).toBe('right');
    expect(menuActionFor('enter', 'menu', false)).toBe('confirm');
    expect(menuActionFor('space', 'menu', false)).toBe('confirm');
    expect(menuActionFor('escape', 'menu', false)).toBe('back');
    expect(menuActionFor('backspace', 'menu', false)).toBe('back');
    expect(menuActionFor('tab', 'menu', false)).toBe('next');
    expect(menuActionFor('tab', 'menu', false, true)).toBe('prev');
    expect(menuActionFor('pause', 'menu', false)).toBe('pause');
    expect(menuActionFor('mute', 'menu', false)).toBe('mute');
    expect(menuActionFor('primary', 'menu', false)).toBeNull(); // J is not confirm
    expect(menuActionFor('secondary', 'menu', false)).toBeNull();
    expect(menuActionFor('alt', 'menu', false)).toBeNull();
  });

  it('OS auto-repeat never produces an action (our own timer repeats directions)', () => {
    expect(menuActionFor('down', 'menu', true)).toBeNull();
    expect(menuActionFor('enter', 'menu', true)).toBeNull();
    expect(menuActionFor('escape', 'gameplay', true)).toBeNull();
    expect(menuActionFor('mute', 'gameplay', true)).toBeNull();
  });

  it('gameplay: only pause (Esc / P) and mute (M)', () => {
    expect(menuActionFor('escape', 'gameplay', false)).toBe('pause');
    expect(menuActionFor('pause', 'gameplay', false)).toBe('pause');
    expect(menuActionFor('mute', 'gameplay', false)).toBe('mute');
    expect(menuActionFor('up', 'gameplay', false)).toBeNull();
    expect(menuActionFor('space', 'gameplay', false)).toBeNull();
    expect(menuActionFor('enter', 'gameplay', false)).toBeNull();
    expect(menuActionFor('tab', 'gameplay', false)).toBeNull();
  });

  it('only Escape is honoured while typing', () => {
    expect(allowedWhileTyping('escape')).toBe(true);
    expect(allowedWhileTyping('up')).toBe(false);
    expect(allowedWhileTyping('space')).toBe(false);
  });
});
