// Shared widgets: the BAD HAIR DAY! logo, card titles, stickers, the two-step confirm box and the
// adjustable rows used by SETTINGS and FAMILY SETUP (toggle / slider / segmented choice / swatches).
import { button, el, onClick, setClass, setText } from './dom';
import type { FocusGroup, FocusItem } from './focus';
import { C, INK, iconSvg, sparklePath, sparkleSvg, uiIcon } from './icons';

// ── logo ─────────────────────────────────────────────────────────────────────

/** Per-letter jitter (deg, px) so the lettering looks hand-placed. */
const JITTER: readonly [number, number][] = [
  [-6, 2], [4, -3], [-3, 1], [5, -1], [-4, 3], [3, -2], [-5, 1], [6, -3], [-2, 2], [4, 0], [-3, -2], [5, 2],
];

function word(text: string, cls: string, start: number): HTMLElement {
  const w = el('span', { class: `bhd-logo__word ${cls}` });
  Array.from(text).forEach((ch, i) => {
    const [r, y] = JITTER[(start + i) % JITTER.length]!;
    const s = el('span', { class: 'bhd-logo__ch', text: ch, attrs: { 'data-ch': ch } });
    s.style.setProperty('--i', String(start + i));
    s.style.setProperty('--r', `${r}deg`);
    s.style.setProperty('--y', `${y}px`);
    w.appendChild(s);
  });
  return w;
}

/** Wild bedhead flyaways sprouting from "HAIR" (the logo is having a bad hair day). */
const FLYAWAYS = `<svg class="bhd-logo__fly" viewBox="0 0 220 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
<g stroke-linecap="round" stroke-linejoin="round">
<path d="M34 96C30 80 20 72 8 70M186 96c6-16 16-24 30-26" fill="none" stroke="${INK}" stroke-width="7"/>
<path d="M34 96C30 80 20 72 8 70M186 96c6-16 16-24 30-26" fill="none" stroke="#9b6536" stroke-width="3"/>
<path d="M10 102C12 84 6 66 16 54c4 10 8 16 16 20-4-24 6-44 24-52-4 14-2 28 6 36 4-22 20-40 42-44-8 16-8 32 0 42 8-18 26-28 46-24-12 8-16 20-12 32 12-12 30-16 48-8-12 4-16 14-12 24 12-2 24 2 32 10-8 2-12 8-10 16l0 20z" fill="#6b3d24" stroke="${INK}" stroke-width="5"/>
<path d="M58 66c-2-14 4-26 12-32M104 60c-2-14 4-28 16-36M148 70c0-12 8-22 20-26M34 74c-2-8 0-14 6-20" fill="none" stroke="#9b6536" stroke-width="4"/>
<path d="M96 56c0-10 4-18 10-24" fill="none" stroke="#bf8a48" stroke-width="3"/>
<path d="M120 8c8 2 12 10 8 16-3 4-9 4-10 0" fill="none" stroke="${INK}" stroke-width="7"/>
<path d="M120 8c8 2 12 10 8 16-3 4-9 4-10 0" fill="none" stroke="#8c3e22" stroke-width="3"/>
</g></svg>`;

const FLYING_BRUSH = `<svg class="bhd-logo__brush" viewBox="0 0 120 70" aria-hidden="true" focusable="false">
<g stroke-linecap="round" fill="none" stroke="${INK}" stroke-width="5"><path d="M4 30h20M0 43h18M8 56h14"/></g>
<g transform="rotate(-18 70 38)">
<ellipse cx="72" cy="38" rx="34" ry="19" fill="${C.sheen}" opacity=".35"/>
<path d="M28 38h22" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
<path d="M28 38h22" stroke="${C.black}" stroke-width="7.5" stroke-linecap="round"/>
<ellipse cx="76" cy="38" rx="27" ry="15" fill="${C.black}" stroke="${INK}" stroke-width="3.5"/>
<ellipse cx="78" cy="38" rx="19" ry="9.5" fill="#3b3348" stroke="${C.sheen}" stroke-width="2"/>
<g fill="${C.sheen}"><circle cx="66" cy="35" r="1.8"/><circle cx="72" cy="41" r="1.8"/><circle cx="78" cy="34" r="1.8"/><circle cx="84" cy="41" r="1.8"/><circle cx="90" cy="36" r="1.8"/><circle cx="72" cy="34" r="1.8"/><circle cx="84" cy="34" r="1.8"/><circle cx="78" cy="42" r="1.8"/></g>
<path d="M56 28a26 12 0 0 1 22-5" stroke="${C.sheen}" stroke-width="3" stroke-linecap="round"/>
</g>
<path d="${sparklePath(108, 12, 9)}" fill="${C.sun}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
</svg>`;

/** The BAD HAIR DAY! logo, built from type + inline SVG (no images). */
export function logoEl(size: 'xl' | 'md' | 'sm' = 'xl'): HTMLElement {
  return el('div', { class: `bhd-logo bhd-logo--${size}`, attrs: { role: 'img', 'aria-label': 'Bad Hair Day!' } }, [
    el('div', { class: 'bhd-logo__glow', attrs: { 'aria-hidden': 'true' } }),
    el('div', { class: 'bhd-logo__row bhd-logo__row--top', attrs: { 'aria-hidden': 'true' } }, [
      word('BAD', 'bhd-logo__word--bad', 0),
      el('span', { class: 'bhd-logo__hairwrap' }, [el('span', { class: 'bhd-logo__flywrap', html: FLYAWAYS }), word('HAIR', 'bhd-logo__word--hair', 3)]),
    ]),
    el('div', { class: 'bhd-logo__row bhd-logo__row--bottom', attrs: { 'aria-hidden': 'true' } }, [word('DAY!', 'bhd-logo__word--day', 7)]),
    el('div', { class: 'bhd-logo__brushwrap', html: FLYING_BRUSH, attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'bhd-logo__sp bhd-logo__sp--a', html: sparkleSvg('', C.sun), attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'bhd-logo__sp bhd-logo__sp--b', html: sparkleSvg('', C.cream), attrs: { 'aria-hidden': 'true' } }),
    el('span', { class: 'bhd-logo__sp bhd-logo__sp--c', html: sparkleSvg('', C.coral), attrs: { 'aria-hidden': 'true' } }),
  ]);
}

// ── card chrome ──────────────────────────────────────────────────────────────

/** Title on a strip of washi tape, hanging over the card's top edge. */
export function cardTitle(text: string, iconHtml = ''): HTMLElement {
  return el('div', { class: 'bhd-cardtitle' }, [
    iconHtml ? el('span', { class: 'bhd-cardtitle__ico', html: iconHtml }) : null,
    el('h2', { class: 'bhd-cardtitle__t', text }),
  ]);
}

/** Round award sticker (icon + title + blurb). Text via textContent. */
export function sticker(icon: string, title: string, blurb: string, tilt: number): HTMLElement {
  const s = el('div', { class: 'bhd-sticker' }, [
    el('div', { class: 'bhd-sticker__badge', html: iconSvg(icon) }),
    el('div', { class: 'bhd-sticker__t', text: title }),
    el('div', { class: 'bhd-sticker__b', text: blurb }),
  ]);
  s.style.setProperty('--tilt', `${tilt}deg`);
  return s;
}

// ── confirm box ──────────────────────────────────────────────────────────────

/** Two-step confirmation ("QUIT TO MENU?" → KEEP PLAYING / QUIT). The owning screen swaps its focus group while open. */
export class ConfirmBox {
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly yes: HTMLButtonElement;
  private readonly no: HTMLButtonElement;
  private onYes: () => void = () => {};
  private onNo: () => void = () => {};
  open = false;

  constructor(focus: FocusGroup) {
    this.focus = focus;
    this.title = el('div', { class: 'bhd-confirm__title' });
    this.body = el('div', { class: 'bhd-confirm__body' });
    this.yes = button('bhd-btn--primary bhd-confirm__yes', 'YES', uiIcon('check'));
    this.no = button('bhd-confirm__no', 'NO', uiIcon('back'));
    this.el = el('div', { class: 'bhd-confirm bhd-panel', attrs: { hidden: '', role: 'alertdialog' } }, [
      this.title,
      this.body,
      el('div', { class: 'bhd-row bhd-confirm__btns' }, [this.no, this.yes]),
    ]);
    const yes: FocusItem = { el: this.yes, activate: () => this.onYes() };
    const no: FocusItem = { el: this.no, activate: () => this.onNo(), sound: 'back' };
    this.focus.setRows([[no, yes]], this.no);
    this.focus.blur();
  }

  show(title: string, body: string, yesLabel: string, noLabel: string, onYes: () => void, onNo: () => void): void {
    this.title.textContent = title;
    this.body.textContent = body;
    (this.yes.querySelector('.bhd-btn__label') as HTMLElement).textContent = yesLabel;
    (this.no.querySelector('.bhd-btn__label') as HTMLElement).textContent = noLabel;
    this.onYes = onYes;
    this.onNo = onNo;
    this.open = true;
    this.el.hidden = false;
    this.focus.focus(this.no);
    this.focus.freezeHover();
  }

  hide(): void {
    this.open = false;
    this.el.hidden = true;
  }
}

// ── adjustable rows ──────────────────────────────────────────────────────────

export interface Row {
  item: FocusItem;
  refresh(): void;
}

function rowLabel(text: string, iconHtml: string): HTMLElement {
  return el('span', { class: 'bhd-setrow__label' }, [iconHtml ? el('span', { class: 'bhd-setrow__ico', html: iconHtml }) : null, el('span', { class: 'bhd-setrow__t', text })]);
}

export function toggleRow(label: string, iconHtml: string, get: () => boolean, set: (v: boolean) => void, sound: (k: 'toggle') => void): Row {
  const sw = el('span', { class: 'bhd-toggle', attrs: { role: 'switch' } }, [el('span', { class: 'bhd-toggle__on', text: 'ON' }), el('span', { class: 'bhd-toggle__off', text: 'OFF' }), el('span', { class: 'bhd-toggle__knob' })]);
  const row = el('div', { class: 'bhd-setrow bhd-setrow--toggle' }, [rowLabel(label, iconHtml), sw]);
  return {
    item: {
      el: row,
      sound: 'none',
      activate: () => {
        set(!get());
        sound('toggle');
      },
      adjust: (dir) => {
        const want = dir > 0;
        if (get() === want) return false;
        set(want);
        return true;
      },
    },
    refresh: () => {
      const on = get();
      setClass(sw, 'is-on', on);
      if (sw.getAttribute('aria-checked') !== String(on)) sw.setAttribute('aria-checked', String(on));
    },
  };
}

export function sliderRow(label: string, iconHtml: string, get: () => number, set: (v: number) => void, focus: () => FocusGroup): Row {
  const fill = el('div', { class: 'bhd-slider__fill' });
  const track = el('div', { class: 'bhd-slider__track' }, [fill]);
  const thumb = el('div', { class: 'bhd-slider__thumb' });
  const val = el('span', { class: 'bhd-slider__val' });
  const slider = el('div', { class: 'bhd-slider', attrs: { role: 'slider', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'data-bhd-tap': '' } }, [
    el('div', { class: 'bhd-slider__rail' }, [track, thumb]),
    val,
  ]);
  const row = el('div', { class: 'bhd-setrow bhd-setrow--slider' }, [rowLabel(label, iconHtml), slider]);
  const fromPointer = (clientX: number): void => {
    const r = track.getBoundingClientRect();
    if (r.width <= 0) return;
    const v = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 20) / 20;
    if (v !== get()) set(v);
  };
  let dragging = -1;
  slider.addEventListener('pointerdown', (e) => {
    dragging = e.pointerId;
    try {
      slider.setPointerCapture(e.pointerId);
    } catch {
      /* best effort */
    }
    focus().focus(row);
    fromPointer(e.clientX);
    e.preventDefault();
  });
  slider.addEventListener('pointermove', (e) => {
    if (e.pointerId === dragging) fromPointer(e.clientX);
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId === dragging) dragging = -1;
  };
  slider.addEventListener('pointerup', end);
  slider.addEventListener('pointercancel', end);
  return {
    item: {
      el: row,
      noClick: true,
      adjust: (dir) => {
        const cur = get();
        const next = Math.round(Math.min(1, Math.max(0, cur + dir * 0.1)) * 20) / 20;
        if (next === cur) return false;
        set(next);
        return true;
      },
    },
    refresh: () => {
      const v = get();
      if (slider.style.getPropertyValue('--v') !== String(v)) slider.style.setProperty('--v', String(v));
      setText(val, `${Math.round(v * 100)}%`);
      if (slider.getAttribute('aria-valuenow') !== String(Math.round(v * 100))) slider.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    },
  };
}

export interface ChoiceOpt<T> {
  value: T;
  text: string;
  /** Trusted decoration markup (coffee cup, beard…). */
  html?: string;
}

export function choiceRow<T>(label: string, iconHtml: string, options: readonly ChoiceOpt<T>[], get: () => T, set: (v: T) => void, focus: () => FocusGroup, cls = ''): Row {
  const row = el('div', { class: `bhd-setrow bhd-setrow--choice ${cls}`.trim() });
  const chips = options.map((opt) => {
    const chip = el('button', { class: 'bhd-seg', attrs: { type: 'button', tabindex: '-1', 'data-value': String(opt.value) } }, [
      opt.html ? el('span', { class: 'bhd-seg__art', html: opt.html }) : null,
      el('span', { class: 'bhd-seg__t', text: opt.text }),
    ]);
    onClick(chip, (e) => {
      e.stopPropagation();
      focus().focus(row);
      if (get() !== opt.value) set(opt.value);
    });
    return chip;
  });
  row.append(rowLabel(label, iconHtml), el('div', { class: 'bhd-segs', attrs: { role: 'radiogroup', 'aria-label': label } }, chips));
  const index = (): number => Math.max(0, options.findIndex((o) => o.value === get()));
  return {
    item: {
      el: row,
      noClick: true,
      activate: () => set(options[(index() + 1) % options.length]!.value),
      adjust: (dir) => {
        const i = Math.min(options.length - 1, Math.max(0, index() + dir));
        if (i === index()) return false;
        set(options[i]!.value);
        return true;
      },
    },
    refresh: () => {
      const cur = get();
      chips.forEach((c, i) => {
        const on = options[i]!.value === cur;
        setClass(c, 'is-selected', on);
        if (c.getAttribute('aria-checked') !== String(on)) c.setAttribute('aria-checked', String(on));
      });
    },
  };
}

export interface Swatch<T> {
  value: T;
  color: string;
  name: string;
}

export function swatchRow<T>(label: string, swatches: readonly Swatch<T>[], get: () => T, set: (v: T) => void, focus: () => FocusGroup): Row {
  const name = el('span', { class: 'bhd-swrow__name' });
  const btns = swatches.map((s) => {
    const b = el('button', { class: 'bhd-swatch', attrs: { type: 'button', tabindex: '-1', 'aria-label': s.name, title: s.name } });
    b.style.setProperty('--sw', s.color);
    onClick(b, (e) => {
      e.stopPropagation();
      focus().focus(row);
      if (get() !== s.value) set(s.value);
    });
    return b;
  });
  const row = el('div', { class: 'bhd-setrow bhd-setrow--swatches' }, [
    el('span', { class: 'bhd-setrow__label' }, [el('span', { class: 'bhd-setrow__t', text: label }), name]),
    el('div', { class: 'bhd-swatches', attrs: { role: 'radiogroup', 'aria-label': label } }, btns),
  ]);
  const index = (): number => swatches.findIndex((s) => s.value === get());
  return {
    item: {
      el: row,
      noClick: true,
      activate: () => set(swatches[(Math.max(0, index()) + 1) % swatches.length]!.value),
      adjust: (dir) => {
        const cur = index();
        const n = swatches.length;
        const i = cur < 0 ? 0 : (((cur + dir) % n) + n) % n;
        if (i === cur) return false;
        set(swatches[i]!.value);
        return true;
      },
    },
    refresh: () => {
      const i = index();
      btns.forEach((b, k) => {
        setClass(b, 'is-selected', k === i);
        if (b.getAttribute('aria-checked') !== String(k === i)) b.setAttribute('aria-checked', String(k === i));
      });
      setText(name, i >= 0 ? swatches[i]!.name : '');
    },
  };
}
