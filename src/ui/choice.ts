// Modal choice with big portrait cards (e.g. "WHO GETS THE BLACK BRUSH FIRST?"). Keyboard / pad
// navigate + confirm, mouse click, touch tap. Resolves with the chosen option id.
import type { FamilyLooks, GirlId } from '../family/types';
import { GIRLS } from '../family/types';
import type { MenuAction } from '../input/types';
import { el, replay, safeColor } from './dom';
import { faceSvg, lookOf } from './faces';
import type { FocusGroup, FocusItem } from './focus';
import { iconSvg } from './icons';
import type { ChoiceOption } from './types';

const isGirl = (id: string): id is GirlId => (GIRLS as readonly string[]).includes(id);

export class ChoiceView {
  readonly el: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly cardsEl: HTMLElement;
  readonly hintEl: HTMLElement;
  private resolve: ((id: string) => void) | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private cards: HTMLButtonElement[] = [];
  looks: FamilyLooks | null = null;

  constructor(
    readonly focus: FocusGroup,
    private readonly sound: (k: 'move' | 'confirm') => void,
  ) {
    this.titleEl = el('div', { class: 'bhd-choice__title' });
    this.subEl = el('div', { class: 'bhd-choice__sub' });
    this.cardsEl = el('div', { class: 'bhd-choice__cards' });
    this.hintEl = el('div', { class: 'bhd-hint bhd-hint--inline bhd-choice__hint' });
    this.el = el('div', { class: 'bhd-layer bhd-choice', attrs: { hidden: '', role: 'dialog', 'aria-modal': 'true', 'data-bhd-tap': '' } }, [
      el('div', { class: 'bhd-choice__box' }, [this.titleEl, this.subEl, this.cardsEl, this.hintEl]),
    ]);
  }

  get active(): boolean {
    return this.resolve !== null;
  }

  /** Option ids in display order (tests). */
  get ids(): string[] {
    return this.cards.map((c) => c.dataset.id ?? '');
  }

  open(title: string, options: readonly ChoiceOption[], opts: { subtitle?: string; defaultId?: string } = {}): Promise<string> {
    if (this.resolve) this.pick(opts.defaultId ?? options[0]?.id ?? ''); // a stale choice resolves with its default
    if (this.closeTimer !== null) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.titleEl.textContent = title;
    this.subEl.textContent = opts.subtitle ?? '';
    this.subEl.hidden = !opts.subtitle;
    this.cardsEl.textContent = '';
    this.cards = [];
    const items: FocusItem[] = [];
    options.forEach((o, i) => {
      const color = safeColor(o.color, 'var(--bhd-lilac)');
      const art = isGirl(o.id)
        ? faceSvg({ who: o.id, look: lookOf(this.looks, o.id), mood: o.badge ? 'proud' : 'happy' })
        : iconSvg(o.icon ?? 'star');
      const card = el('button', { class: `bhd-pcard${isGirl(o.id) ? ' bhd-pcard--face' : ''}`, attrs: { type: 'button', tabindex: '-1', 'data-id': o.id } }, [
        el('span', { class: 'bhd-pcard__art', html: art }),
        o.badge ? el('span', { class: 'bhd-pcard__badge', html: iconSvg(o.badge) }) : null,
        o.icon && isGirl(o.id) ? el('span', { class: 'bhd-pcard__icon', html: iconSvg(o.icon) }) : null,
        el('span', { class: 'bhd-pcard__label', text: o.label }),
        o.sub ? el('span', { class: 'bhd-pcard__sub', text: o.sub }) : null,
      ]);
      card.style.setProperty('--pc', color);
      card.style.setProperty('--i', String(i));
      card.style.setProperty('--tilt', `${[-2.5, 1.8, -1.2, 2.4][i % 4]}deg`);
      this.cards.push(card);
      this.cardsEl.appendChild(card);
      items.push({ el: card, activate: () => this.pick(o.id), sound: 'none' });
    });
    const def = this.cards.find((c) => c.dataset.id === opts.defaultId) ?? this.cards[0] ?? null;
    this.focus.setRows([items], def);
    this.el.hidden = false;
    this.el.classList.remove('is-closing');
    replay(this.el, 'is-in');
    return new Promise<string>((resolve) => {
      if (options.length === 0) {
        resolve('');
        this.close();
        return;
      }
      this.resolve = resolve;
    });
  }

  handle(a: MenuAction): boolean {
    if (!this.resolve) return false;
    if (a === 'confirm') {
      this.focus.handle('confirm');
      return true;
    }
    if (a === 'up' || a === 'down' || a === 'left' || a === 'right' || a === 'next' || a === 'prev') {
      if (this.focus.handle(a) === 'moved') this.sound('move');
      return true;
    }
    // back / pause: a choice must be made (the game decides); swallow.
    return a === 'back';
  }

  private pick(id: string): void {
    const r = this.resolve;
    if (!r) return;
    this.resolve = null;
    this.sound('confirm');
    const card = this.cards.find((c) => c.dataset.id === id);
    card?.classList.add('is-chosen');
    this.close();
    r(id);
  }

  private close(): void {
    this.el.classList.add('is-closing');
    this.focus.blur();
    if (typeof setTimeout === 'function') {
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        if (!this.resolve) this.el.hidden = true;
      }, 380);
    } else this.el.hidden = true;
  }

  dispose(): void {
    if (this.closeTimer !== null) clearTimeout(this.closeTimer);
    this.resolve = null;
  }
}
