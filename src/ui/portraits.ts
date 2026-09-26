// The girls' portrait row (brushing + rush): a charming face per girl in her colour with a mood,
// a progress ring, a badge (e.g. the black brush), a status line, the current girl highlighted —
// plus action chips with device glyphs. Taps are queued as click ids (UiManager.takeClicks()).
// Diffed: only what changed touches the DOM.
import type { FamilyLooks, GirlId } from '../family/types';
import { el, onTap, safeColor, setClass, setHidden, setText, setVar } from './dom';
import { faceSvg, lookOf } from './faces';
import { iconSvg } from './icons';
import type { IconId, Portrait, PortraitRow } from './types';

const RING = `<svg class="bhd-portrait__ring" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><circle class="bhd-portrait__track" cx="50" cy="50" r="45"/><circle class="bhd-portrait__prog" cx="50" cy="50" r="45" pathLength="100" transform="rotate(-90 50 50)"/></svg>`;

interface PNode {
  root: HTMLElement;
  face: HTMLElement;
  badge: HTMLElement;
  name: HTMLElement;
  status: HTMLElement;
  faceKey: string;
  badgeId: IconId | null | '';
  nameText: string;
  statusText: string;
  progress: number;
  color: string;
  focused: boolean | null;
}

interface CNode {
  root: HTMLButtonElement;
  glyph: HTMLElement;
  ico: HTMLElement;
  label: HTMLElement;
  key: string;
  disabled: boolean | null;
  glyphKey: string;
}

type Chip = NonNullable<PortraitRow['chips']>[number];

export class Portraits {
  readonly el: HTMLElement;
  private readonly row: HTMLElement;
  private readonly chipsEl: HTMLElement;
  private readonly nodes = new Map<string, PNode>();
  private readonly chips = new Map<string, CNode>();
  private idsKey = '';
  private chipsKey = '';
  private shown = false;
  private last: PortraitRow | null = null;
  looks: FamilyLooks | null = null;
  private looksVer = 0;

  constructor(
    private readonly onClick: (id: string) => void,
    private readonly glyphFor: (slot: 'primary' | 'secondary' | 'alt') => string,
    private readonly glyphKey: () => string,
  ) {
    this.row = el('div', { class: 'bhd-portraits__row' });
    this.chipsEl = el('div', { class: 'bhd-portraits__chips', attrs: { hidden: '' } });
    this.el = el('div', { class: 'bhd-portraits', attrs: { hidden: '' } }, [this.row, this.chipsEl]);
  }

  get visible(): boolean {
    return this.shown;
  }

  /** Family looks changed: faces re-render on the next set(). */
  setLooks(looks: FamilyLooks | null): void {
    this.looks = looks;
    this.looksVer++;
  }

  set(p: PortraitRow | null): void {
    this.last = p;
    if (!p) {
      if (this.shown) {
        this.shown = false;
        this.el.hidden = true;
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.el.hidden = false;
    }
    let key = '';
    for (const it of p.items) key += it.id + '|';
    if (key !== this.idsKey) {
      this.idsKey = key;
      this.nodes.clear();
      this.row.textContent = '';
      for (const it of p.items) {
        const n = this.makePortrait(it.id);
        this.nodes.set(it.id, n);
        this.row.appendChild(n.root);
      }
    }
    for (const it of p.items) this.apply(this.nodes.get(it.id)!, it);
    this.setChips(p.chips ?? []);
  }

  /** Device / looks changed: re-apply the last row (chip glyphs and faces re-render as needed). */
  refreshGlyphs(): void {
    if (this.last && this.shown) this.set(this.last);
  }

  private makePortrait(id: string): PNode {
    const face = el('span', { class: 'bhd-portrait__face' });
    const badge = el('span', { class: 'bhd-portrait__badge', attrs: { hidden: '' } });
    const name = el('span', { class: 'bhd-portrait__name' });
    const status = el('span', { class: 'bhd-portrait__status', attrs: { hidden: '' } });
    const root = el('button', { class: 'bhd-portrait', attrs: { type: 'button', tabindex: '-1', 'data-id': id, 'data-bhd-tap': '' } }, [
      el('span', { class: 'bhd-portrait__disc' }, [el('span', { class: 'bhd-portrait__ringwrap', html: RING }), face, badge]),
      name,
      status,
      el('span', { class: 'bhd-portrait__pointer', attrs: { 'aria-hidden': 'true' } }),
    ]);
    onTap(root, () => this.onClick(id));
    return { root, face, badge, name, status, faceKey: '', badgeId: '', nameText: '\u0000', statusText: '\u0000', progress: -1, color: '', focused: null };
  }

  private apply(n: PNode, it: Portrait): void {
    const mood = it.mood ?? 'happy';
    const faceKey = `${it.id}|${mood}|${this.looksVer}`;
    if (faceKey !== n.faceKey) {
      n.faceKey = faceKey;
      const girl = (['addy', 'ellie', 'heidi'] as const).includes(it.id as GirlId) ? (it.id as GirlId) : 'addy';
      n.face.innerHTML = faceSvg({ who: girl, look: lookOf(this.looks, girl), mood });
      n.root.dataset.mood = mood;
    }
    const color = safeColor(it.color, 'var(--bhd-lilac)');
    if (color !== n.color) {
      n.color = color;
      setVar(n.root, '--pc', color);
    }
    const prog = Number.isFinite(it.progress) ? Math.round(Math.max(0, Math.min(1, it.progress)) * 200) / 200 : 0;
    if (prog !== n.progress) {
      n.progress = prog;
      setVar(n.root, '--p', String(prog));
      setClass(n.root, 'is-full', prog >= 1);
    }
    const badge = it.badge ?? null;
    if (badge !== n.badgeId) {
      n.badgeId = badge;
      n.badge.innerHTML = badge ? iconSvg(badge) : '';
      setHidden(n.badge, !badge);
      if (badge) {
        n.badge.classList.remove('is-pop');
        void n.badge.offsetWidth;
        n.badge.classList.add('is-pop');
      }
    }
    if (it.name !== n.nameText) {
      n.nameText = it.name;
      setText(n.name, it.name);
    }
    const status = it.status ?? '';
    if (status !== n.statusText) {
      n.statusText = status;
      setText(n.status, status);
      setHidden(n.status, status === '');
    }
    const focused = it.focused === true;
    if (focused !== n.focused) {
      n.focused = focused;
      setClass(n.root, 'is-current', focused);
      n.root.setAttribute('aria-pressed', String(focused));
    }
  }

  private setChips(chips: readonly Chip[]): void {
    let key = '';
    for (const c of chips) key += c.id + '|';
    if (key !== this.chipsKey) {
      this.chipsKey = key;
      this.chips.clear();
      this.chipsEl.textContent = '';
      for (const c of chips) {
        const n = this.makeChip(c.id);
        this.chips.set(c.id, n);
        this.chipsEl.appendChild(n.root);
      }
      setHidden(this.chipsEl, chips.length === 0);
    }
    const gk = this.glyphKey();
    for (const c of chips) {
      const n = this.chips.get(c.id);
      if (!n) continue;
      const k = `${c.label}|${c.slot ?? ''}|${c.icon ?? ''}`;
      if (k !== n.key || gk !== n.glyphKey) {
        n.key = k;
        n.glyphKey = gk;
        setText(n.label, c.label);
        const touch = gk.startsWith('touch');
        n.glyph.innerHTML = c.slot && !touch ? this.glyphFor(c.slot) : '';
        setHidden(n.glyph, !c.slot || touch);
        n.ico.innerHTML = c.icon ? iconSvg(c.icon) : '';
        setHidden(n.ico, !c.icon);
        if (c.slot) n.root.dataset.slot = c.slot;
      }
      const dis = c.disabled === true;
      if (dis !== n.disabled) {
        n.disabled = dis;
        setClass(n.root, 'is-disabled', dis);
        n.root.setAttribute('aria-disabled', String(dis));
      }
    }
  }
  private makeChip(id: string): CNode {
    const glyph = el('span', { class: 'bhd-chip__g' });
    const ico = el('span', { class: 'bhd-chip__ico', attrs: { hidden: '' } });
    const label = el('span', { class: 'bhd-chip__t' });
    const root = el('button', { class: 'bhd-chip', attrs: { type: 'button', tabindex: '-1', 'data-id': id, 'data-bhd-tap': '' } }, [glyph, ico, label]);
    const node: CNode = { root, glyph, ico, label, key: '', disabled: null, glyphKey: '' };
    onTap(root, () => {
      if (!node.disabled) this.onClick(id);
    });
    return node;
  }
}
