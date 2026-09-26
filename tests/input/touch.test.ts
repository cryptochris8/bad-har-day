// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_STICK } from '../../src/input/joystick';
import { TOUCH_STYLE_ID } from '../../src/input/touchStyles';
import { SCHEMES, createHarness, down, pointer, type Harness } from './helpers';

let h: Harness;

function q<T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = h.root): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
}

/** jsdom has no layout: give the joystick zone a phone-like rect (844×390 landscape, left half). */
function mockZoneRect(zone: HTMLElement): void {
  zone.getBoundingClientRect = () =>
    ({ left: 0, top: 94, width: 422, height: 284, right: 422, bottom: 378, x: 0, y: 94, toJSON: () => ({}) }) as DOMRect;
}

const R = DEFAULT_STICK.radius;
const zone = () => q('.bhd-touch__zone');
const btn = (slot: 'primary' | 'secondary' | 'alt') => q(`.bhd-touch__btn--${slot}`);

beforeEach(() => {
  h = createHarness({ prefersTouch: true });
  h.input.setMode('gameplay');
  h.input.setScheme(SCHEMES.soccer);
  mockZoneRect(zone());
});
afterEach(() => h.dispose());

describe('overlay DOM', () => {
  it('appends one .bhd-touch overlay (zone + 3 buttons); stylesheet injected once', () => {
    expect(h.root.querySelectorAll('.bhd-touch')).toHaveLength(1);
    for (const s of ['primary', 'secondary', 'alt'] as const) expect(btn(s)).toBeTruthy();
    expect(document.querySelectorAll(`#${TOUCH_STYLE_ID}`)).toHaveLength(1);
    expect(q('.bhd-touch').dataset.visible).toBe('true');
    expect(q('.bhd-touch').getAttribute('aria-hidden')).toBe('true');
  });

  it('scheme → buttons shown/hidden with labels, icons and hold rings', () => {
    h.input.setScheme(SCHEMES.football);
    expect(btn('primary').dataset.on).toBe('true');
    expect(q('.bhd-touch__label', btn('primary')).textContent).toBe('JUMP');
    expect(btn('primary').querySelector('.bhd-ico--hand')).not.toBeNull();
    expect(btn('primary').dataset.hold).toBe('false');
    expect(q('.bhd-touch__label', btn('secondary')).textContent).toBe('SPIN');
    expect(btn('secondary').querySelector('.bhd-ico--whistle')).not.toBeNull();
    expect(q('.bhd-touch__label', btn('alt')).textContent).toBe('SPRINT');
    expect(btn('alt').dataset.hold).toBe('true');
    expect(zone().dataset.move).toBe('x');
    expect(q('.bhd-touch__base').dataset.axis).toBe('x');
    expect(q('.bhd-touch__movelabel').textContent).toBe('STEER');

    h.input.setScheme(SCHEMES.hoops);
    expect(btn('primary').dataset.on).toBe('true');
    expect(btn('primary').dataset.hold).toBe('true');
    expect(q('.bhd-touch__label', btn('primary')).textContent).toBe('SHOOT');
    expect(btn('secondary').dataset.on).toBe('false');
    expect(btn('alt').dataset.on).toBe('false');

    h.input.setScheme(SCHEMES.baseball);
    expect(zone().dataset.move).toBe('xy');
    expect(q('.bhd-touch__base').dataset.axis).toBe('xy');
    expect(btn('secondary').dataset.on).toBe('false');
    expect(q('.bhd-touch__label', btn('alt')).textContent).toBe('POWER');
    expect(btn('alt').querySelector('.bhd-ico--done')).not.toBeNull();

    h.input.setScheme({ ...SCHEMES.baseball, move: 'none' });
    expect(zone().dataset.move).toBe('none');
  });

  it('labels are text, never markup (athlete/event strings are data)', () => {
    h.input.setScheme({ ...SCHEMES.hoops, primary: { label: '<img src=x onerror=alert(1)>', icon: 'go' } });
    const label = q('.bhd-touch__label', btn('primary'));
    expect(label.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(label.querySelector('img')).toBeNull();
  });

  it('null scheme hides the overlay; so does menu mode and a non-touch device in auto', () => {
    h.input.setScheme(null);
    expect(h.input.touchVisible).toBe(false);
    h.input.setScheme(SCHEMES.soccer);
    expect(h.input.touchVisible).toBe(true);
    h.input.setMode('menu');
    expect(h.input.touchVisible).toBe(false);
    expect(q('.bhd-touch').dataset.visible).toBe('false');
    h.input.setMode('gameplay');
    expect(h.input.touchVisible).toBe(true);
    down('KeyW'); // keyboard now → hidden in 'auto'
    expect(h.input.touchVisible).toBe(false);
    h.input.setTouchControls('on');
    expect(h.input.touchVisible).toBe(true);
    h.input.setTouchControls('off');
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
    expect(h.input.touchVisible).toBe(false);
    h.input.setTouchControls('auto');
    expect(h.input.touchVisible).toBe(true);
  });

  it('dispose removes the overlay and the stylesheet', () => {
    h.dispose();
    expect(document.querySelector('.bhd-touch')).toBeNull();
    expect(document.getElementById(TOUCH_STYLE_ID)).toBeNull();
    h = createHarness({ prefersTouch: true });
  });
});

describe('joystick', () => {
  it('floating stick: thumb up → moveY > 0; release → 0', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150, clientY: 250 - R });
    let f = h.step();
    expect(f.moveY).toBeCloseTo(1);
    expect(f.moveX).toBeCloseTo(0);
    expect(q('.bhd-touch__base').classList.contains('is-idle')).toBe(false);
    pointer(zone(), 'pointerup', { pointerId: 1 });
    f = h.step();
    expect(f.moveY).toBe(0);
    expect(q('.bhd-touch__base').classList.contains('is-idle')).toBe(true);
  });

  it('the base appears where the thumb lands', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 200, clientY: 294 });
    expect(q('.bhd-touch__base').style.transform).toBe('translate3d(200.0px, 200.0px, 0)');
    expect(h.step().moveX).toBe(0); // no deflection on landing
  });

  it('analog: half travel gives a partial value; diagonal magnitude ≤ 1', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R * 0.5, clientY: 250 });
    const m = h.step().moveX;
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThan(0.7);
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R * 3, clientY: 250 + R * 3 });
    const f = h.step();
    expect(Math.hypot(f.moveX, f.moveY)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("'x' scheme: horizontal-only track (vertical thumb travel is ignored)", () => {
    h.input.setScheme(SCHEMES.football);
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 - R, clientY: 250 - R * 2 });
    const f = h.step();
    expect(f.moveX).toBeCloseTo(-1);
    expect(f.moveY).toBe(0);
  });

  it('a second finger on the zone does not steal the stick', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 - R, clientY: 250 });
    pointer(zone(), 'pointerdown', { pointerId: 2, clientX: 300, clientY: 200 });
    pointer(zone(), 'pointermove', { pointerId: 2, clientX: 380, clientY: 200 });
    expect(h.step().moveX).toBeCloseTo(-1);
    pointer(zone(), 'pointerup', { pointerId: 2 });
    expect(h.step().moveX).toBeCloseTo(-1);
  });

  it("'none' scheme: no stick at all", () => {
    h.input.setScheme({ ...SCHEMES.soccer, move: 'none' });
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R, clientY: 250 });
    expect(h.step().moveX).toBe(0);
  });
});

describe('buttons', () => {
  it('respond on pointerdown (same frame), release on pointerup', () => {
    pointer(btn('primary'), 'pointerdown', { pointerId: 5 });
    let f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, true, false]);
    expect(btn('primary').classList.contains('is-pressed')).toBe(true);
    f = h.step();
    expect([f.primary, f.primaryPressed]).toEqual([true, false]);
    pointer(btn('primary'), 'pointerup', { pointerId: 5 });
    f = h.step();
    expect([f.primary, f.primaryReleased]).toEqual([false, true]);
    expect(btn('primary').classList.contains('is-pressed')).toBe(false);
  });

  it('a tap within one frame yields pressed + released on the same frame', () => {
    pointer(btn('secondary'), 'pointerdown', { pointerId: 5 });
    pointer(btn('secondary'), 'pointerup', { pointerId: 5 });
    const f = h.step();
    expect([f.secondary, f.secondaryPressed, f.secondaryReleased]).toEqual([true, true, true]);
  });

  it('releasing outside the button still releases (pointercancel / lostpointercapture)', () => {
    pointer(btn('alt'), 'pointerdown', { pointerId: 7 });
    expect(h.step().alt).toBe(true);
    pointer(btn('alt'), 'lostpointercapture', { pointerId: 7 });
    expect(h.step().altReleased).toBe(true);
    pointer(btn('alt'), 'pointerdown', { pointerId: 8 });
    h.step();
    pointer(btn('alt'), 'pointercancel', { pointerId: 8 });
    expect(h.step().alt).toBe(false);
  });

  it('two fingers on one button: held until the LAST lifts, one press, one release', () => {
    pointer(btn('primary'), 'pointerdown', { pointerId: 1 });
    pointer(btn('primary'), 'pointerdown', { pointerId: 2 });
    expect(h.step().primaryPressed).toBe(true);
    pointer(btn('primary'), 'pointerup', { pointerId: 1 });
    let f = h.step();
    expect([f.primary, f.primaryPressed, f.primaryReleased]).toEqual([true, false, false]);
    pointer(btn('primary'), 'pointerup', { pointerId: 2 });
    f = h.step();
    expect([f.primary, f.primaryReleased]).toEqual([false, true]);
  });

  it('multi-touch: steer + hold SPRINT + tap SHOOT at the same time', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R, clientY: 250 });
    pointer(btn('alt'), 'pointerdown', { pointerId: 2 });
    let f = h.step();
    expect(f.moveX).toBeCloseTo(1);
    expect(f.alt).toBe(true);
    pointer(btn('primary'), 'pointerdown', { pointerId: 3 });
    f = h.step();
    expect(f.primaryPressed).toBe(true);
    expect(f.alt).toBe(true);
    expect(f.moveX).toBeCloseTo(1);
    pointer(btn('primary'), 'pointerup', { pointerId: 3 });
    f = h.step();
    expect(f.primaryReleased).toBe(true);
    expect(f.alt).toBe(true);
    pointer(btn('alt'), 'pointerup', { pointerId: 2 });
    f = h.step();
    expect(f.altReleased).toBe(true);
    expect(f.moveX).toBeCloseTo(1);
  });

  it('pointer ids are tracked per button: a foreign pointerup does not release', () => {
    pointer(btn('primary'), 'pointerdown', { pointerId: 11 });
    h.step();
    pointer(btn('primary'), 'pointerup', { pointerId: 99 });
    expect(h.step().primary).toBe(true);
  });

  it('buttons ignore presses while hidden, and hidden slots ignore presses', () => {
    h.input.setMode('menu');
    pointer(btn('primary'), 'pointerdown', { pointerId: 1 });
    h.input.setMode('gameplay');
    expect(h.step().primary).toBe(false);
    h.input.setScheme(SCHEMES.hoops); // no secondary
    pointer(btn('secondary'), 'pointerdown', { pointerId: 2 });
    expect(h.step().secondary).toBe(false);
  });

  it('a scheme change that removes a held button releases it', () => {
    pointer(btn('secondary'), 'pointerdown', { pointerId: 4 });
    expect(h.step().secondary).toBe(true);
    h.input.setScheme(SCHEMES.hoops);
    expect(h.step().secondaryReleased).toBe(true);
  });

  it('going to the menu mid-hold releases everything (no stuck buttons on resume)', () => {
    pointer(btn('alt'), 'pointerdown', { pointerId: 2 });
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R, clientY: 250 });
    h.step();
    h.input.setMode('menu');
    h.step();
    h.input.setMode('gameplay');
    const f = h.step();
    expect(f.alt).toBe(false);
    expect(f.moveX).toBe(0);
    expect(btn('alt').classList.contains('is-pressed')).toBe(false);
  });
});

describe('layout', () => {
  it('left-handed mirrors via data-hand and releases a held stick', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150 + R, clientY: 250 });
    expect(h.step().moveX).toBeCloseTo(1);
    h.input.setTouchHand('left');
    expect(q('.bhd-touch').dataset.hand).toBe('left');
    expect(h.step().moveX).toBe(0);
    h.input.setTouchHand('right');
    expect(q('.bhd-touch').dataset.hand).toBe('right');
  });

  it('blur releases the stick and held buttons', () => {
    pointer(zone(), 'pointerdown', { pointerId: 1, clientX: 150, clientY: 250 });
    pointer(zone(), 'pointermove', { pointerId: 1, clientX: 150, clientY: 250 - R });
    pointer(btn('alt'), 'pointerdown', { pointerId: 2 });
    h.step();
    window.dispatchEvent(new Event('blur'));
    const f = h.step();
    expect(f.moveY).toBe(0);
    expect(f.alt).toBe(false);
  });

  it('touchstart/touchmove on the visible overlay are cancelled (no scroll / zoom); UI buttons keep native taps', () => {
    const t1 = new Event('touchstart', { bubbles: true, cancelable: true }) as Event & { touches?: unknown };
    Object.defineProperty(t1, 'touches', { value: [{}] });
    btn('primary').dispatchEvent(t1);
    expect(t1.defaultPrevented).toBe(true);

    const uiBtn = document.createElement('button');
    document.body.appendChild(uiBtn);
    const t2 = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(t2, 'touches', { value: [{}] });
    uiBtn.dispatchEvent(t2);
    expect(t2.defaultPrevented).toBe(false);
    uiBtn.remove();

    const tm = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(tm, 'touches', { value: [{}] });
    document.body.dispatchEvent(tm);
    expect(tm.defaultPrevented).toBe(true);

    h.input.setMode('menu'); // menus may scroll with one finger
    const tm2 = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(tm2, 'touches', { value: [{}] });
    document.body.dispatchEvent(tm2);
    expect(tm2.defaultPrevented).toBe(false);
  });
});
