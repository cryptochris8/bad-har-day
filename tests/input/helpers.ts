// Shared test helpers for the input module (fake gamepads, key/pointer events, a manager wired
// to jsdom with an injectable gamepad list and clock). Adapted from Trash Panda.
import { vi, type Mock } from 'vitest';
import type { GamepadLike } from '../../src/input/gamepad';
import { createInputManager, type InputEnv, type InputManagerInternal } from '../../src/input/manager';
import type { ControlScheme, GameControls } from '../../src/input/types';

export const DS4_CHROME_ID = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
export const DUALSENSE_CHROME_ID = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
export const DS4_FIREFOX_ID = '054c-09cc-Wireless Controller';
export const DS4_LINUX_ID = '054c-09cc-Sony Interactive Entertainment Wireless Controller';
export const XBOX_ID = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
export const XBOX_FIREFOX_ID = '45e-b13-Xbox Wireless Controller';
export const SWITCH_PRO_ID = 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)';

export interface FakeButton {
  pressed: boolean;
  value: number;
}

export type PlayEffect = (type: string, params?: Record<string, number>) => unknown;

export interface FakePad extends GamepadLike {
  id: string;
  index: number;
  mapping: string;
  connected: boolean;
  buttons: FakeButton[];
  axes: number[];
  vibrationActuator: { playEffect: Mock<PlayEffect> } | null;
  press(i: number, value?: number): void;
  release(i: number): void;
}

export function makePad(
  opts: { id?: string; index?: number; mapping?: string; buttons?: number; axes?: number; rumble?: boolean } = {},
): FakePad {
  const buttons: FakeButton[] = [];
  for (let i = 0; i < (opts.buttons ?? 17); i++) buttons.push({ pressed: false, value: 0 });
  const axes: number[] = new Array<number>(opts.axes ?? 4).fill(0);
  const pad: FakePad = {
    id: opts.id ?? DS4_CHROME_ID,
    index: opts.index ?? 0,
    mapping: opts.mapping ?? 'standard',
    connected: true,
    buttons,
    axes,
    vibrationActuator:
      opts.rumble === false ? null : { playEffect: vi.fn<PlayEffect>(() => Promise.resolve('complete')) },
    press(i: number, value = 1) {
      const b = buttons[i];
      if (b) {
        b.pressed = value > 0.1;
        b.value = value;
      }
    },
    release(i: number) {
      const b = buttons[i];
      if (b) {
        b.pressed = false;
        b.value = 0;
      }
    },
  };
  return pad;
}

/** Standard-mapping button indices (W3C). */
export const STD = {
  CROSS: 0,
  CIRCLE: 1,
  SQUARE: 2,
  TRIANGLE: 3,
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SHARE: 8,
  OPTIONS: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export interface Frame extends GameControls {
  menu: string[];
}

export interface Harness {
  input: InputManagerInternal;
  root: HTMLDivElement;
  pads: (FakePad | null)[];
  env: InputEnv;
  /** Fake clock (ms) used by the rumble gate. */
  clock: { t: number };
  /** update() then return a copy of the controls + menu actions. */
  step(dt?: number): Frame;
  dispose(): void;
}

export function createHarness(over: Partial<InputEnv> = {}): Harness {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const pads: (FakePad | null)[] = [];
  const clock = { t: 0 };
  const env: InputEnv = {
    win: window,
    doc: document,
    nav: navigator,
    getGamepads: () => pads,
    requireTrustedGesture: false,
    prefersTouch: false,
    now: () => clock.t,
    ...over,
  };
  const input = createInputManager({ touchRoot: root }, env);
  return {
    input,
    root,
    pads,
    env,
    clock,
    step(dt = 1 / 60) {
      input.update(dt);
      const c = input.getControls();
      return { ...c, menu: [...input.getMenuActions()] };
    },
    dispose() {
      input.dispose();
      root.remove();
    },
  };
}

export function key(
  type: 'keydown' | 'keyup',
  code: string,
  init: KeyboardEventInit = {},
  target: EventTarget = window,
): KeyboardEvent {
  const keyName = init.key ?? codeToKey(code);
  const e = new KeyboardEvent(type, { code, key: keyName, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

export const down = (code: string, init: KeyboardEventInit = {}) => key('keydown', code, init);
export const up = (code: string, init: KeyboardEventInit = {}) => key('keyup', code, init);
/** keydown + keyup before the next update(). */
export const tap = (code: string, init: KeyboardEventInit = {}) => {
  down(code, init);
  up(code, init);
};

function codeToKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code === 'Space') return ' ';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Control')) return 'Control';
  return code;
}

export function pointer(
  target: EventTarget,
  type: string,
  init: { pointerId?: number; pointerType?: string; clientX?: number; clientY?: number; button?: number } = {},
): PointerEvent {
  const e = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: init.pointerId ?? 1,
    pointerType: init.pointerType ?? 'touch',
    clientX: init.clientX ?? 0,
    clientY: init.clientY ?? 0,
    button: init.button ?? 0,
  });
  target.dispatchEvent(e);
  return e;
}

/** The four example schemes used by the dev page (and the tests). */
export const SCHEMES: Readonly<Record<'football' | 'hoops' | 'baseball' | 'soccer', ControlScheme>> = {
  football: {
    move: 'x',
    moveLabel: 'STEER',
    primary: { label: 'JUMP', icon: 'hand' },
    secondary: { label: 'SPIN', icon: 'whistle' },
    alt: { label: 'SPRINT', icon: 'run', hold: true },
  },
  hoops: { move: 'x', moveLabel: 'AIM', primary: { label: 'SHOOT', icon: 'pour', hold: true }, secondary: null, alt: null },
  baseball: {
    move: 'xy',
    moveLabel: 'AIM',
    primary: { label: 'SWING', icon: 'brush' },
    secondary: null,
    alt: { label: 'POWER', icon: 'done', hold: true },
  },
  soccer: {
    move: 'xy',
    moveLabel: 'MOVE',
    primary: { label: 'SHOOT', icon: 'toss', hold: true },
    secondary: { label: 'SKILL', icon: 'pass' },
    alt: { label: 'SPRINT', icon: 'run', hold: true },
  },
};
