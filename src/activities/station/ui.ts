// ─────────────────────────────────────────────────────────────────────────────
// Station DOM kit — small activity-layer widgets built from the shared UI kit classes (bhd-panel, bhd-btn,
// bhd-gauge, bhd-swatch, bhd-tag, bhd-glyph[data-slot]) plus a few station-only layout rules (bhd-st-*):
//   side cards (right column), hold / tap buttons (own pointer listeners → a tap queue + held state),
//   world-anchored tags (projected every frame), and a bottom "zones" row (dishes).
// Everything lives in one root inside ctx.ui.activityLayer(); dispose() removes it. Text → textContent only.
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';
import type { Projector } from '../../render/types';

const STYLE_ID = 'bhd-station-styles';

const CSS = `
.bhd-st{position:absolute;inset:0;pointer-events:none}
.bhd-st-side{position:absolute;right:calc(var(--bhd-edge,12px) + var(--bhd-safe-r,0px));top:calc(var(--bhd-safe-t,0px) + clamp(96px,19vh,150px));display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.bhd-st-card{display:flex;flex-direction:column;align-items:center;gap:7px;padding:9px 12px 11px;min-width:92px}
.bhd-st-cap{font-family:var(--bhd-font-display);font-weight:400;letter-spacing:.05em;font-size:var(--bhd-fs-1);line-height:1;text-align:center}
.bhd-st-sub{font-family:var(--bhd-font-body);font-weight:700;font-size:var(--bhd-fs-0);color:var(--bhd-ink-soft);text-align:center;max-width:150px;line-height:1.2}
.bhd-st-card .bhd-gauge{height:clamp(96px,24vh,176px)}
.bhd-st-gauge-row{display:flex;align-items:stretch;gap:8px}
.bhd-st-ticks{display:flex;flex-direction:column;justify-content:space-between;font-family:var(--bhd-font-ui);font-size:11px;color:var(--bhd-ink-soft);padding:2px 0}
.bhd-st-swatches{display:flex;gap:12px;align-items:flex-start}
.bhd-st-sw{display:flex;flex-direction:column;align-items:center;gap:4px;font-family:var(--bhd-font-ui);font-weight:800;font-size:11px;letter-spacing:.06em;color:var(--bhd-ink-soft)}
.bhd-st-sw .bhd-swatch{width:50px;height:50px;pointer-events:none;cursor:default;transition:transform .15s cubic-bezier(.3,1.6,.5,1),background-color .1s linear}
.bhd-st-btn{user-select:none;-webkit-user-select:none}
.bhd-st-btn.is-held{transform:translateY(4px);box-shadow:0 1px 0 var(--bhd-plum);background:var(--bhd-sunshine)}
.bhd-st-btn .bhd-glyph__g{font-size:18px}
.bhd-st-tag{position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;will-change:transform;display:flex;flex-direction:column;align-items:center;gap:3px}
.bhd-st-tag[hidden]{display:none}
.bhd-st-name{font-family:var(--bhd-font-display);font-weight:400;letter-spacing:.05em;font-size:var(--bhd-fs-1);color:#fff;padding:3px 10px 1px;border:2.5px solid var(--bhd-plum);border-radius:10px 8px 11px 7px;box-shadow:0 3px 0 var(--bhd-plum);text-shadow:0 2px 0 rgba(58,35,48,.45)}
.bhd-st-fav{display:inline-flex;align-items:center;gap:4px;font-family:var(--bhd-font-ui);font-weight:800;font-size:var(--bhd-fs-0);color:var(--bhd-plum);background:var(--bhd-cream);padding:1px 8px 0;border:2px solid var(--bhd-plum);border-radius:999px}
.bhd-st-fav b{color:var(--bhd-heart);font-size:1.15em}
.bhd-st-fav.is-done{background:#ffe1ea}
.bhd-st-fav.is-done::after{content:'\\2713';color:var(--bhd-mint-d);font-weight:900}
.bhd-st-label{font-family:var(--bhd-font-ui);font-weight:800;font-size:var(--bhd-fs-0);background:var(--bhd-cream);border:2px solid var(--bhd-plum);border-radius:999px;padding:1px 9px 0;box-shadow:0 2px 0 var(--bhd-plum)}
.bhd-st-zones{position:absolute;left:50%;bottom:calc(12px + var(--bhd-safe-b,0px));transform:translateX(-50%);display:flex;gap:10px;align-items:flex-end}
.bhd-st-zone{flex-direction:column;gap:2px;min-width:118px;padding:.35em .8em .45em;text-align:center}
.bhd-st-zone .bhd-btn__label{font-family:var(--bhd-font-display);font-weight:400;letter-spacing:.04em}
.bhd-st-zone .bhd-btn__sub{font-size:.62em}
.bhd-st-zone--up{margin-bottom:16px}
.bhd-st-arrow{width:26px;height:26px;display:block}
.bhd-st-zone.is-good{background:var(--bhd-mint)}
.bhd-st-zone.is-bad{animation:bhd-st-shake .4s ease}
.bhd-st-zone.is-hot{background:var(--bhd-sunshine)}
@keyframes bhd-st-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}50%{transform:translateX(6px)}75%{transform:translateX(-4px)}}
.bhd-st-streak{display:inline-flex;align-items:center;gap:6px;font-family:var(--bhd-font-display);font-weight:400;letter-spacing:.04em;font-size:var(--bhd-fs-2)}
.bhd-st-streak b{color:var(--bhd-coral)}
.bhd-st-streak.is-pop{animation:bhd-pop .35s cubic-bezier(.3,1.6,.5,1)}
.bhd-st-hint{font-family:var(--bhd-font-ui);font-weight:800;font-size:var(--bhd-fs-1);display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center}
@media (max-height:500px){
  .bhd-st-side{top:calc(var(--bhd-safe-t,0px) + 58px);gap:6px}
  .bhd-st-card{padding:6px 9px 8px;gap:5px}
  .bhd-st-card .bhd-gauge{height:clamp(80px,30vh,130px);width:28px}
  .bhd-st-sw .bhd-swatch{width:40px;height:40px}
  .bhd-st-zone{min-width:96px;min-height:44px;font-size:var(--bhd-fs-1)}
  .bhd-st-zone--up{margin-bottom:10px}
}
@media (max-width:640px) and (orientation:portrait){
  .bhd-st-side{top:calc(var(--bhd-safe-t,0px) + 150px)}
  .bhd-st-zones{bottom:calc(46vh + var(--bhd-safe-b,0px))}
  .bhd-st-zone{min-width:92px}
}
.bhd-ui[data-device='touch'] .bhd-st-card .bhd-st-hold{display:none}
@media (prefers-reduced-motion: reduce){.bhd-st-zone.is-bad,.bhd-st-streak.is-pop{animation:none}}
`;

function ensureStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A glyph pill: "<device glyph> text" (the UI fills in the glyph for the current device). */
export function glyph(slot: 'primary' | 'secondary' | 'alt' | 'move' | 'pointer' | 'navigate', text: string): HTMLElement {
  const g = h('span', 'bhd-glyph', text);
  g.dataset.slot = slot;
  return g;
}

export const ARROW_SVG: Readonly<Record<'left' | 'up' | 'right', string>> = {
  left: '<svg class="bhd-st-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 4.5L7 12l8.5 7.5" fill="none" stroke="#3a2330" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg class="bhd-st-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 15.5L12 7l7.5 8.5" fill="none" stroke="#3a2330" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right: '<svg class="bhd-st-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5L17 12l-8.5 7.5" fill="none" stroke="#3a2330" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/** A world-anchored DOM tag (projected every frame). */
export class WorldTag {
  readonly el: HTMLElement;
  private readonly out = { x: 0, y: 0, visible: false };
  private lx = -1e9;
  private ly = -1e9;

  constructor(
    parent: HTMLElement,
    readonly at: THREE.Vector3,
    cls = '',
    private readonly below = false,
  ) {
    this.el = h('div', 'bhd-st-tag' + (cls ? ' ' + cls : ''));
    this.el.style.transform = 'translate(-9999px,-9999px)';
    parent.appendChild(this.el);
  }

  update(projector: Projector): void {
    projector.project(this.at, this.out);
    if (!this.out.visible) {
      if (!this.el.hidden) this.el.hidden = true;
      return;
    }
    if (this.el.hidden) this.el.hidden = false;
    const x = Math.round(this.out.x);
    const y = Math.round(this.out.y);
    if (x === this.lx && y === this.ly) return;
    this.lx = x;
    this.ly = y;
    this.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${this.below ? '0' : '-100%'})`;
  }

  set hidden(v: boolean) {
    this.el.style.display = v ? 'none' : '';
  }
}

interface Btn {
  id: string;
  el: HTMLElement;
  pointers: Set<number>;
}

/** The station's DOM root + input from its own buttons. */
export class StationUi {
  readonly root: HTMLElement;
  readonly side: HTMLElement;
  private readonly taps: string[] = [];
  private readonly out: string[] = [];
  private readonly btns: Btn[] = [];
  private readonly tags: WorldTag[] = [];
  private disposed = false;

  constructor(layer: HTMLElement) {
    ensureStyles();
    this.root = h('div', 'bhd-st');
    this.side = h('div', 'bhd-st-side');
    this.root.appendChild(this.side);
    layer.appendChild(this.root);
  }

  /** A cream card in the right column. */
  card(caption?: string): HTMLElement {
    const c = h('div', 'bhd-panel bhd-panel--sm bhd-st-card bhd-pop');
    if (caption) c.appendChild(h('div', 'bhd-st-cap', caption));
    this.side.appendChild(c);
    return c;
  }

  /**
   * A button that reports taps (id queued on pointerdown) and a held state (while any pointer is down on it).
   * `data-bhd-tap` lets the touch overlay pass taps through.
   */
  button(parent: HTMLElement, id: string, cls: string, content: (HTMLElement | string)[]): HTMLElement {
    const el = h('button', 'bhd-btn bhd-st-btn ' + cls);
    el.setAttribute('type', 'button');
    el.setAttribute('tabindex', '-1');
    el.dataset.bhdTap = '';
    for (const c of content) {
      if (typeof c === 'string') el.appendChild(h('span', 'bhd-btn__label', c));
      else el.appendChild(c);
    }
    const b: Btn = { id, el, pointers: new Set() };
    const down = (e: PointerEvent): void => {
      if (this.disposed) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      if (b.pointers.size === 0) this.taps.push(id);
      b.pointers.add(e.pointerId);
      el.classList.add('is-held');
    };
    const up = (e: PointerEvent): void => {
      b.pointers.delete(e.pointerId);
      if (b.pointers.size === 0) el.classList.remove('is-held');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    parent.appendChild(el);
    this.btns.push(b);
    return el;
  }

  /** Is the button with this id held right now? */
  held(id: string): boolean {
    for (const b of this.btns) if (b.id === id && b.pointers.size > 0) return true;
    return false;
  }

  /** Taps since the last call (reused array — read it right away). */
  takeTaps(): readonly string[] {
    this.out.length = 0;
    for (const t of this.taps) this.out.push(t);
    this.taps.length = 0;
    return this.out;
  }

  /** Drop pending taps/holds (phase change). */
  clearInput(): void {
    this.taps.length = 0;
  }

  tag(at: THREE.Vector3, cls = '', below = false): WorldTag {
    const t = new WorldTag(this.root, at, cls, below);
    this.tags.push(t);
    return t;
  }

  removeTag(t: WorldTag): void {
    const i = this.tags.indexOf(t);
    if (i >= 0) this.tags.splice(i, 1);
    t.el.remove();
  }

  update(projector: Projector): void {
    for (const t of this.tags) t.update(projector);
  }

  dispose(): void {
    this.disposed = true;
    this.btns.length = 0;
    this.tags.length = 0;
    this.root.remove();
  }
}

/** Set a CSS number custom property only when it changed (avoids style churn every frame). */
export function setVar(el: HTMLElement, name: string, v: number, digits = 3): void {
  const s = (Number.isFinite(v) ? v : 0).toFixed(digits);
  let m = varCache.get(el);
  if (!m) {
    m = new Map();
    varCache.set(el, m);
  }
  if (m.get(name) === s) return;
  m.set(name, s);
  el.style.setProperty('--' + name, s);
}
const varCache = new WeakMap<HTMLElement, Map<string, string>>();

/** #rrggbb from a hex number. */
export const css = (hex: number): string => '#' + (hex & 0xffffff).toString(16).padStart(6, '0');
