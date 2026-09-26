import { describe, expect, it, vi } from 'vitest';
import { KeyboardState, createKeySample } from '../../src/input/keyboard';
import { MENU_REPEAT_DELAY, MENU_REPEAT_INTERVAL } from '../../src/input/menuRepeat';

function sample(kb: KeyboardState) {
  const s = createKeySample();
  kb.sample(s);
  return s;
}

describe('KeyboardState — movement', () => {
  it('holds directions', () => {
    const kb = new KeyboardState();
    kb.down('KeyW', 'up', false, 'gameplay');
    kb.down('KeyD', 'right', false, 'gameplay');
    expect(sample(kb)).toEqual({ x: 1, y: 1 });
  });

  it('opposite directions: last pressed wins, releasing falls back', () => {
    const kb = new KeyboardState();
    kb.down('KeyA', 'left', false, 'gameplay');
    kb.endFrame();
    kb.down('KeyD', 'right', false, 'gameplay');
    kb.endFrame();
    expect(sample(kb).x).toBe(1);
    kb.up('KeyD');
    expect(sample(kb).x).toBe(-1);
  });

  it('two keys for the same direction (W + ArrowUp) release independently', () => {
    const kb = new KeyboardState();
    kb.down('KeyW', 'up', false, 'gameplay');
    kb.down('ArrowUp', 'up', false, 'gameplay');
    kb.endFrame();
    kb.up('KeyW');
    expect(sample(kb).y).toBe(1);
    kb.up('ArrowUp');
    expect(sample(kb).y).toBe(0);
  });

  it('a direction tapped inside one frame still moves for exactly one frame', () => {
    const kb = new KeyboardState();
    kb.down('KeyW', 'up', false, 'gameplay');
    kb.up('KeyW');
    expect(sample(kb).y).toBe(1);
    kb.endFrame();
    expect(sample(kb).y).toBe(0);
  });
});

describe('KeyboardState — action slots', () => {
  it('reports slot changes at event time; Space and J share primary', () => {
    const onSlot = vi.fn();
    const kb = new KeyboardState(onSlot);
    kb.down('Space', 'space', false, 'gameplay');
    kb.down('KeyJ', 'primary', false, 'gameplay');
    expect(onSlot.mock.calls).toEqual([['primary', true]]);
    kb.up('Space');
    expect(onSlot).toHaveBeenCalledTimes(1); // J still holds it
    kb.up('KeyJ');
    expect(onSlot.mock.calls).toEqual([
      ['primary', true],
      ['primary', false],
    ]);
  });

  it('OS auto-repeat never presses a slot', () => {
    const onSlot = vi.fn();
    const kb = new KeyboardState(onSlot);
    kb.down('KeyE', 'secondary', true, 'gameplay'); // repeat of a key we never saw go down
    expect(onSlot).not.toHaveBeenCalled();
    expect(kb.slotCount('secondary')).toBe(0);
  });

  it('keys pressed in menu mode never count as gameplay slots', () => {
    const onSlot = vi.fn();
    const kb = new KeyboardState(onSlot);
    expect(kb.down('Space', 'space', false, 'menu')).toBe('confirm');
    expect(kb.down('KeyE', 'secondary', false, 'menu')).toBeNull();
    expect(onSlot).not.toHaveBeenCalled();
    kb.up('Space');
    expect(onSlot).not.toHaveBeenCalled();
  });

  it('latchAll: held action keys stop counting until released and pressed again', () => {
    const onSlot = vi.fn();
    const kb = new KeyboardState(onSlot);
    kb.down('ShiftLeft', 'alt', false, 'gameplay');
    kb.latchAll();
    expect(kb.slotCount('alt')).toBe(0);
    kb.down('ShiftLeft', 'alt', true, 'gameplay'); // OS repeat while still held
    expect(kb.slotCount('alt')).toBe(0);
    kb.up('ShiftLeft');
    expect(onSlot.mock.calls).toEqual([['alt', true]]); // no callback for the latched key
    kb.down('ShiftLeft', 'alt', false, 'gameplay');
    expect(kb.slotCount('alt')).toBe(1);
  });

  it('latchAll keeps held directions (movement is level-based)', () => {
    const kb = new KeyboardState();
    kb.down('KeyD', 'right', false, 'gameplay');
    kb.endFrame();
    kb.latchAll();
    expect(sample(kb).x).toBe(1);
  });

  it('reset releases everything', () => {
    const kb = new KeyboardState();
    kb.down('KeyW', 'up', false, 'gameplay');
    kb.down('ShiftLeft', 'alt', false, 'gameplay');
    kb.reset();
    expect(sample(kb)).toEqual({ x: 0, y: 0 });
    expect(kb.slotCount('alt')).toBe(0);
  });
});

describe('KeyboardState — menu auto-repeat', () => {
  it('fires on press, then after the delay, then every interval while held', () => {
    const kb = new KeyboardState();
    expect(kb.down('ArrowDown', 'down', false, 'menu')).toBe('down');
    const dt = 0.01;
    let fired = 0;
    const frames = Math.round((MENU_REPEAT_DELAY + MENU_REPEAT_INTERVAL * 2) / dt) + 1;
    for (let i = 0; i < frames; i++) {
      if (kb.menuRepeatStep(dt) === 'down') fired++;
      kb.endFrame();
    }
    expect(fired).toBe(3);
  });

  it('OS repeat events are ignored; releasing stops the repeat', () => {
    const kb = new KeyboardState();
    kb.down('KeyS', 'down', false, 'menu');
    expect(kb.down('KeyS', 'down', true, 'menu')).toBeNull();
    kb.up('KeyS');
    kb.endFrame();
    for (let i = 0; i < 60; i++) expect(kb.menuRepeatStep(0.02)).toBeNull();
  });

  it('a tap inside one frame fires once and never repeats', () => {
    const kb = new KeyboardState();
    expect(kb.down('ArrowUp', 'up', false, 'menu')).toBe('up');
    kb.up('ArrowUp');
    expect(kb.menuRepeatStep(1)).toBeNull();
  });

  it('the latest direction repeats; releasing it does not revive an older held one', () => {
    const kb = new KeyboardState();
    kb.down('ArrowDown', 'down', false, 'menu');
    kb.endFrame();
    expect(kb.down('ArrowRight', 'right', false, 'menu')).toBe('right');
    kb.endFrame();
    expect(kb.menuRepeatStep(MENU_REPEAT_DELAY + 0.01)).toBe('right');
    kb.up('ArrowRight');
    kb.endFrame();
    for (let i = 0; i < 60; i++) expect(kb.menuRepeatStep(0.05)).toBeNull();
  });

  it('a direction held since gameplay never scrolls the menu (latchAll stops the repeat)', () => {
    const kb = new KeyboardState();
    kb.down('ArrowDown', 'down', false, 'gameplay');
    kb.endFrame();
    kb.latchAll();
    for (let i = 0; i < 60; i++) expect(kb.menuRepeatStep(0.05)).toBeNull();
  });
});
