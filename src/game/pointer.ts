// Pointer input on the game canvas (contract: PointerInput in src/input/types.ts): mouse / touch / pen directly,
// plus a VIRTUAL cursor driven by the gamepad stick / arrow keys with PRIMARY as the button, so every pointer
// activity (brushing, pouring, packing) also works on a pad or keyboard.
//
// Source switching: any real mouse/touch/pen event makes that the source; moving the stick/keys (or pressing
// primary while the last device is a gamepad/keyboard with no recent mouse use) switches to 'virtual'.
import type { GameControls, InputDevice, PointerInput, PointerSource } from '../input/types';

export interface PointerTarget {
  addEventListener: HTMLElement['addEventListener'];
  removeEventListener: HTMLElement['removeEventListener'];
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  setPointerCapture?(id: number): void;
  style?: { cursor: string };
}

/** Pure: CSS px within a rect → NDC (y up). */
export function toNdc(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return { x: w > 0 ? (x / w) * 2 - 1 : 0, y: h > 0 ? 1 - (y / h) * 2 : 0 };
}

/** Pure: advance a virtual cursor by the stick (screen-height units per second), clamped to the rect. */
export function stepVirtual(
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  speed: number,
  dt: number,
  w: number,
  h: number,
): { x: number; y: number } {
  // Slight response curve: precise near the centre, fast at full tilt.
  const mag = Math.hypot(moveX, moveY);
  const k = mag > 0 ? Math.pow(Math.min(1, mag), 1.6) / mag : 0;
  const px = speed * h * dt;
  return {
    x: Math.min(w, Math.max(0, x + moveX * k * px)),
    y: Math.min(h, Math.max(0, y - moveY * k * px)),
  };
}

export class PointerImpl implements PointerInput {
  x = 0;
  y = 0;
  ndcX = 0;
  ndcY = 0;
  down = false;
  pressed = false;
  released = false;
  vx = 0;
  vy = 0;
  active = false;
  source: PointerSource = 'mouse';
  enabled = false;

  private virtualMode: 'auto' | 'off' = 'auto';
  private cursorKind: 'ring' | 'none' = 'ring';
  private speed = 0.9;
  private hideMouse = false;
  private rawDown = false;
  private pendPress = false;
  private pendRelease = false;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private realX = 0;
  private realY = 0;
  private realActive = false;
  private realSource: PointerSource = 'mouse';
  private lastRealEvent = -1e9;
  private time = 0;
  private cursorEl: HTMLDivElement | null = null;

  constructor(
    private readonly target: PointerTarget,
    private readonly layer: HTMLElement | null,
  ) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointercancel', this.onUp);
    target.addEventListener('pointerleave', this.onLeave);
    if (layer && typeof document !== 'undefined') {
      const el = document.createElement('div');
      el.className = 'bhd-pointer';
      el.style.cssText =
        'position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;' +
        'border:4px solid #fff6e9;box-shadow:0 0 0 3px #3a2330,inset 0 0 0 3px #3a2330;z-index:2;pointer-events:none;' +
        'display:none;transition:transform .08s ease;';
      layer.appendChild(el);
      this.cursorEl = el;
    }
  }

  private rect() {
    return this.target.getBoundingClientRect();
  }

  private readonly onDown = (e: Event): void => {
    const ev = e as PointerEvent;
    if (this.pointerId !== null && ev.pointerId !== this.pointerId) return; // one pointer at a time
    this.pointerId = ev.pointerId;
    try {
      this.target.setPointerCapture?.(ev.pointerId);
    } catch {
      // capture can fail on synthetic events
    }
    this.track(ev);
    if (!this.rawDown) this.pendPress = true;
    this.rawDown = true;
  };

  private readonly onMove = (e: Event): void => {
    const ev = e as PointerEvent;
    if (this.pointerId !== null && ev.pointerId !== this.pointerId) return;
    this.track(ev);
  };

  private readonly onUp = (e: Event): void => {
    const ev = e as PointerEvent;
    if (this.pointerId !== null && ev.pointerId !== this.pointerId) return;
    this.track(ev);
    this.pointerId = null;
    if (this.rawDown) this.pendRelease = true;
    this.rawDown = false;
    if (ev.pointerType !== 'mouse') this.realActive = false;
  };

  private readonly onLeave = (e: Event): void => {
    const ev = e as PointerEvent;
    if (ev.pointerType === 'mouse' && !this.rawDown) this.realActive = false;
  };

  private track(ev: PointerEvent): void {
    const r = this.rect();
    this.realX = ev.clientX - r.left;
    this.realY = ev.clientY - r.top;
    this.realActive = true;
    this.realSource = ev.pointerType === 'touch' ? 'touch' : ev.pointerType === 'pen' ? 'pen' : 'mouse';
    this.lastRealEvent = this.time;
  }

  enable(opts: { virtual?: 'auto' | 'off'; cursor?: 'ring' | 'none'; speed?: number; hideMouse?: boolean } = {}): void {
    this.enabled = true;
    this.virtualMode = opts.virtual ?? 'auto';
    this.cursorKind = opts.cursor ?? 'ring';
    this.speed = opts.speed ?? 0.9;
    this.hideMouse = !!opts.hideMouse;
    if (this.target.style) this.target.style.cursor = this.hideMouse ? 'none' : '';
    const r = this.rect();
    if (!this.active) {
      this.x = r.width / 2;
      this.y = r.height / 2;
    }
  }

  disable(): void {
    this.enabled = false;
    this.down = this.pressed = this.released = false;
    this.active = false;
    this.vx = this.vy = 0;
    if (this.target.style) this.target.style.cursor = '';
    if (this.cursorEl) this.cursorEl.style.display = 'none';
  }

  warp(ndcX: number, ndcY: number): void {
    const r = this.rect();
    this.x = ((ndcX + 1) / 2) * r.width;
    this.y = ((1 - ndcY) / 2) * r.height;
    this.source = 'virtual';
  }

  update(dt: number, controls: GameControls, device: InputDevice): void {
    this.time += dt;
    const pressedEdge = this.pendPress;
    const releasedEdge = this.pendRelease;
    this.pendPress = this.pendRelease = false;
    if (!this.enabled) return;
    const r = this.rect();
    this.lastX = this.x;
    this.lastY = this.y;

    const stick = Math.hypot(controls.moveX, controls.moveY) > 0.12;
    const recentReal = this.time - this.lastRealEvent < 0.6;
    const wantVirtual =
      this.virtualMode === 'auto' &&
      !recentReal &&
      !this.rawDown &&
      (stick || ((device === 'gamepad' || device === 'keyboard') && (controls.primaryPressed || this.source === 'virtual')));

    if (wantVirtual) {
      if (this.source !== 'virtual') {
        this.source = 'virtual';
        this.active = true;
      }
      const p = stepVirtual(this.x, this.y, controls.moveX, controls.moveY, this.speed, dt, r.width, r.height);
      this.x = p.x;
      this.y = p.y;
      this.pressed = controls.primaryPressed;
      this.released = controls.primaryReleased;
      this.down = controls.primary;
    } else {
      if (recentReal || this.rawDown) this.source = this.realSource;
      this.x = this.realX;
      this.y = this.realY;
      this.active = this.realActive;
      this.pressed = pressedEdge;
      this.released = releasedEdge;
      this.down = this.rawDown || (pressedEdge && releasedEdge);
    }
    const n = toNdc(this.x, this.y, r.width, r.height);
    this.ndcX = n.x;
    this.ndcY = n.y;
    if (dt > 0) {
      const k = Math.min(1, dt * 25);
      this.vx += ((this.x - this.lastX) / dt - this.vx) * k;
      this.vy += ((this.y - this.lastY) / dt - this.vy) * k;
    }
    if (this.cursorEl) {
      const show = this.source === 'virtual' && this.cursorKind === 'ring' && this.active;
      this.cursorEl.style.display = show ? 'block' : 'none';
      if (show) this.cursorEl.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.down ? 0.8 : 1})`;
    }
  }

  dispose(): void {
    const t = this.target;
    t.removeEventListener('pointerdown', this.onDown);
    t.removeEventListener('pointermove', this.onMove);
    t.removeEventListener('pointerup', this.onUp);
    t.removeEventListener('pointercancel', this.onUp);
    t.removeEventListener('pointerleave', this.onLeave);
    this.cursorEl?.remove();
  }
}
