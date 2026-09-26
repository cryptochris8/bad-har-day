// Centre banners (6 styles, queued), toasts, the big instruction line and control prompts
// (bottom-centre bar, or world-anchored above a point). All text via textContent; glyphs via the
// trusted glyph renderer.
import type { Projector, Vec3Like } from '../render/types';
import { el, replay, setText } from './dom';
import { C, iconSvg, sparkleSvg, starSvg } from './icons';
import type { BannerStyle, IconId, PromptSpec } from './types';

// ── banners ──────────────────────────────────────────────────────────────────

export interface BannerSpec {
  text: string;
  sub: string;
  style: BannerStyle;
  seconds: number;
  icon: IconId | null;
  /** 'center' (default) · 'top' · 'bottom' — keeps a banner off a close-up's faces. */
  pos: BannerPos;
}

export type BannerPos = 'center' | 'top' | 'bottom';

export const BANNER_SECONDS: Readonly<Record<BannerStyle, number>> = {
  secured: 2.3,
  legendary: 4,
  boss: 2.8,
  approved: 2.3,
  info: 2,
  fun: 1.9,
};

export const BANNER_QUEUE_MAX = 4;
const BANNER_OUT = 0.35;

/** Pure queue policy: 'legendary' and 'boss' jump the queue; the oldest ordinary one is dropped when full. */
export function enqueueBanner(queue: readonly BannerSpec[], spec: BannerSpec, max = BANNER_QUEUE_MAX): BannerSpec[] {
  const q = queue.slice();
  const big = (s: BannerSpec): boolean => s.style === 'legendary' || s.style === 'boss';
  if (big(spec)) {
    let i = 0;
    while (i < q.length && big(q[i]!)) i++;
    q.splice(i, 0, spec);
  } else q.push(spec);
  while (q.length > max) {
    const drop = q.findIndex((b) => !big(b));
    q.splice(drop >= 0 ? drop : q.length - 1, 1);
  }
  return q;
}

export class Banners {
  readonly el: HTMLElement;
  private readonly box: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly ico: HTMLElement;
  private queue: BannerSpec[] = [];
  private current: BannerSpec | null = null;
  private left = 0;
  private outing = false;

  constructor() {
    this.title = el('div', { class: 'bhd-banner__title' });
    this.sub = el('div', { class: 'bhd-banner__sub' });
    this.ico = el('div', { class: 'bhd-banner__ico' });
    this.box = el('div', { class: 'bhd-banner' }, [
      el('div', { class: 'bhd-banner__bg', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'bhd-banner__rays', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'bhd-banner__sparks', attrs: { 'aria-hidden': 'true' } }, [
        el('span', { html: sparkleSvg('', C.sun) }),
        el('span', { html: sparkleSvg('', C.cream) }),
        el('span', { html: sparkleSvg('', C.sheen) }),
        el('span', { html: sparkleSvg('', C.sun) }),
      ]),
      el('div', { class: 'bhd-banner__card' }, [this.ico, el('div', { class: 'bhd-banner__texts' }, [this.title, this.sub])]),
    ]);
    this.el = el('div', { class: 'bhd-layer bhd-banners', attrs: { 'aria-live': 'polite' } }, [this.box]);
  }

  get showing(): string | null {
    return this.current?.text ?? null;
  }

  get showingStyle(): BannerStyle | null {
    return this.current?.style ?? null;
  }

  get showingPos(): BannerPos | null {
    return this.current?.pos ?? null;
  }

  get pending(): number {
    return this.queue.length;
  }

  show(text: string, style: BannerStyle = 'info', opts: { sub?: string; seconds?: number; icon?: IconId; pos?: BannerPos } = {}): void {
    const secs = opts.seconds;
    const spec: BannerSpec = {
      text: String(text),
      sub: opts.sub ?? '',
      style,
      seconds: Math.min(8, Math.max(0.8, secs !== undefined && Number.isFinite(secs) ? secs : BANNER_SECONDS[style] ?? 2)),
      icon: opts.icon ?? null,
      pos: opts.pos === 'top' || opts.pos === 'bottom' ? opts.pos : 'center',
    };
    if (!this.current) {
      this.display(spec);
      return;
    }
    const big = style === 'legendary' || style === 'boss';
    if (big && this.current.style !== 'legendary' && this.current.style !== 'boss') {
      this.display(spec);
      return;
    }
    this.queue = enqueueBanner(this.queue, spec);
  }

  update(dt: number): void {
    if (!this.current) return;
    this.left -= dt;
    if (!this.outing && this.left <= BANNER_OUT) {
      this.outing = true;
      this.box.classList.add('is-out');
    }
    if (this.left > 0) return;
    const next = this.queue.shift();
    if (next) this.display(next);
    else {
      this.current = null;
      this.box.classList.remove('is-show', 'is-out');
    }
  }

  clear(): void {
    this.queue = [];
    this.current = null;
    this.outing = false;
    this.box.classList.remove('is-show', 'is-out');
  }

  private display(spec: BannerSpec): void {
    this.current = spec;
    this.left = spec.seconds;
    this.outing = false;
    this.box.dataset.style = spec.style;
    this.box.dataset.pos = spec.pos;
    this.box.style.setProperty('--dur', `${spec.seconds}s`);
    this.title.textContent = '';
    // Letters as spans for the shimmer / bounce (textContent each).
    Array.from(spec.text).forEach((ch, i) => {
      const s = el('span', { class: 'bhd-banner__ch', text: ch });
      s.style.setProperty('--i', String(i));
      if (ch === ' ') s.classList.add('is-space');
      this.title.appendChild(s);
    });
    this.title.setAttribute('aria-label', spec.text);
    this.sub.textContent = spec.sub;
    this.sub.hidden = spec.sub === '';
    const icon: IconId | null = spec.icon ?? (spec.style === 'approved' ? 'check' : spec.style === 'secured' ? 'star' : spec.style === 'legendary' ? 'blackBrush' : spec.style === 'boss' ? 'eye' : null);
    this.ico.innerHTML = icon ? iconSvg(icon) : '';
    this.ico.hidden = icon === null;
    this.box.classList.remove('is-out');
    replay(this.box, 'is-show');
  }
}

// ── toasts ───────────────────────────────────────────────────────────────────

export const MAX_TOASTS = 3;

interface ToastNode {
  el: HTMLElement;
  ico: HTMLElement;
  text: HTMLElement;
  left: number;
  busy: boolean;
}

export class Toasts {
  readonly el: HTMLElement;
  private readonly pool: ToastNode[] = [];
  private order = 0;

  constructor() {
    this.el = el('div', { class: 'bhd-layer bhd-toasts', attrs: { role: 'status', 'aria-live': 'polite' } });
    for (let i = 0; i < MAX_TOASTS; i++) {
      const ico = el('span', { class: 'bhd-toast__ico' });
      const text = el('span', { class: 'bhd-toast__t' });
      const node = el('div', { class: 'bhd-toast', attrs: { hidden: '' } }, [ico, text]);
      this.pool.push({ el: node, ico, text, left: 0, busy: false });
      this.el.appendChild(node);
    }
  }

  get texts(): string[] {
    return this.pool.filter((t) => t.busy).map((t) => t.text.textContent ?? '');
  }

  show(text: string, icon?: IconId, seconds = 2.4): void {
    let node = this.pool.find((t) => !t.busy);
    if (!node) {
      node = this.pool.reduce((a, b) => (a.left < b.left ? a : b));
    }
    node.busy = true;
    node.left = Number.isFinite(seconds) && seconds > 0 ? Math.min(10, seconds) : 2.4;
    node.text.textContent = text;
    node.ico.innerHTML = icon ? iconSvg(icon) : iconSvg('sparkle');
    node.el.style.order = String(this.order++);
    node.el.hidden = false;
    node.el.classList.remove('is-out');
    replay(node.el, 'is-in');
  }

  update(dt: number): void {
    for (const t of this.pool) {
      if (!t.busy) continue;
      t.left -= dt;
      if (t.left <= 0.3 && !t.el.classList.contains('is-out')) t.el.classList.add('is-out');
      if (t.left <= 0) {
        t.busy = false;
        t.el.hidden = true;
      }
    }
  }

  clear(): void {
    for (const t of this.pool) {
      t.busy = false;
      t.el.hidden = true;
    }
  }
}

// ── instruction line ─────────────────────────────────────────────────────────

export class Instruction {
  readonly el: HTMLElement;
  private readonly text: HTMLElement;
  private readonly sub: HTMLElement;
  private cur = '\u0000';
  private curSub = '\u0000';

  constructor() {
    this.text = el('div', { class: 'bhd-instr__t' });
    this.sub = el('div', { class: 'bhd-instr__s' });
    this.el = el('div', { class: 'bhd-layer bhd-instr-layer' }, [el('div', { class: 'bhd-instr', attrs: { hidden: '' } }, [this.text, this.sub])]);
  }

  private get box(): HTMLElement {
    return this.el.firstElementChild as HTMLElement;
  }

  get text_(): string | null {
    return this.box.hidden ? null : this.cur;
  }

  set(text: string | null, sub?: string): void {
    if (text === null || text === '') {
      if (!this.box.hidden) this.box.hidden = true;
      this.cur = '\u0000';
      return;
    }
    const s = sub ?? '';
    if (text === this.cur && s === this.curSub && !this.box.hidden) return;
    const changed = text !== this.cur;
    this.cur = text;
    this.curSub = s;
    setText(this.text, text);
    setText(this.sub, s);
    this.sub.hidden = s === '';
    this.box.hidden = false;
    if (changed) replay(this.box, 'is-new');
  }
}

// ── prompts ──────────────────────────────────────────────────────────────────

export class Prompt {
  readonly el: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly text: HTMLElement;
  private spec: PromptSpec | null = null;
  private key = '';
  private lastText = '';
  private readonly out = { x: 0, y: 0, visible: false };
  private x = NaN;
  private y = NaN;
  private vis = true;

  constructor(private readonly glyphFor: (slot: PromptSpec['slot']) => string) {
    this.glyph = el('span', { class: 'bhd-prompt__g' });
    this.text = el('span', { class: 'bhd-prompt__t' });
    this.bar = el('div', { class: 'bhd-prompt', attrs: { hidden: '' } }, [this.glyph, this.text, el('span', { class: 'bhd-prompt__hold' }, [el('span', { class: 'bhd-prompt__holdt', text: 'HOLD' })])]);
    this.el = el('div', { class: 'bhd-layer bhd-prompt-layer' }, [this.bar]);
  }

  get current(): PromptSpec | null {
    return this.spec;
  }

  /** The glyph markup currently shown (tests). */
  get glyphHtml(): string {
    return this.glyph.innerHTML;
  }

  set(p: PromptSpec | null, glyphKey: string): void {
    if (!p) {
      if (this.spec) {
        this.spec = null;
        this.key = '';
        this.bar.hidden = true;
      }
      return;
    }
    const key = `${p.slot}|${p.hold ? 1 : 0}|${p.at ? 1 : 0}|${p.text}|${glyphKey}`;
    this.spec = { ...p, at: p.at ? { x: p.at.x, y: p.at.y, z: p.at.z } : undefined };
    if (key === this.key) return;
    const newText = p.text !== this.lastText || this.bar.hidden;
    this.lastText = p.text;
    this.key = key;
    this.glyph.innerHTML = this.glyphFor(p.slot);
    setText(this.text, p.text);
    this.bar.dataset.slot = p.slot;
    this.bar.classList.toggle('is-hold', p.hold === true);
    this.bar.classList.toggle('is-anchored', !!p.at);
    if (!p.at) {
      this.bar.style.transform = '';
      this.bar.style.visibility = '';
      this.x = NaN;
      this.y = NaN;
      this.vis = true;
    }
    this.bar.hidden = false;
    if (newText) replay(this.bar, 'is-new');
  }

  /** Re-render the glyph (device changed). */
  refresh(glyphKey: string): void {
    if (this.spec) {
      this.key = '';
      this.set(this.spec, glyphKey);
    }
  }

  update(projector: Projector | null): void {
    const at: Vec3Like | undefined = this.spec?.at;
    if (!at || !projector) return;
    projector.project(at, this.out);
    const vis = this.out.visible && Number.isFinite(this.out.x) && Number.isFinite(this.out.y);
    if (vis !== this.vis) {
      this.vis = vis;
      this.bar.style.visibility = vis ? '' : 'hidden';
    }
    if (!vis) return;
    const x = Math.round(this.out.x);
    const y = Math.round(this.out.y);
    if (x !== this.x || y !== this.y) {
      this.x = x;
      this.y = y;
      this.bar.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -100%)`;
    }
  }

  clear(): void {
    this.spec = null;
    this.key = '';
    this.bar.hidden = true;
  }
}

/** Star row markup (report card + chips). */
export function starsHtml(n: number, max = 3): string {
  let s = '';
  for (let i = 0; i < max; i++) s += starSvg(i < n ? 'is-on' : '');
  return s;
}
