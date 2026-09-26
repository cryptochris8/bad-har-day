// FAMILY SETUP — per member hair colour + skin tone swatches, glasses, Chris's beard, Ashley's coffee
// order (little cup previews), the dog's name (text input, ≤ 14 chars, textContent-only) + coat.
// Every change emits {type:'family', family} with a fresh deep copy.
import type { FamilyLooks, MemberId, MemberLook } from '../../family/types';
import { DISPLAY_NAME, MEMBERS } from '../../family/types';
import type { MenuAction } from '../../input/types';
import type { CoffeeOrder } from '../../plan/types';
import { DOG_COATS, HAIR_COLORS, SKIN_TONES, type DogCoat } from '../../render/palette';
import type { FamilySetup } from '../../storage/types';
import { button, el, hexColor, onClick, setText } from '../dom';
import { dogFaceSvg, faceSvg, lookOf } from '../faces';
import type { FocusGroup, FocusItem } from '../focus';
import { clampDogNameInput, nextDogName, sanitizeDogName } from '../format';
import { INK, uiIcon } from '../icons';
import { cardTitle, choiceRow, swatchRow, toggleRow, type Row } from '../widgets';
import type { Screen, UiCtx } from './screen';
import { screenEl } from './screen';

type Tab = MemberId | 'dog';
const TABS: readonly Tab[] = [...MEMBERS, 'dog'];

const ROLE: Readonly<Record<Tab, string>> = {
  chris: 'Stepdad · early-morning utility player',
  ashley: 'Mom · the official Hair Inspector',
  addy: 'Twin · 9 · lavender everything',
  ellie: 'Twin · 9 · mint & teal forever',
  heidi: 'Little sister · 7 · coral star power',
  dog: 'Good dog · professional sniffer',
};

const COAT_NAMES: Readonly<Record<DogCoat, string>> = {
  golden: 'Golden',
  chocolate: 'Chocolate',
  black: 'Black',
  spotted: 'Spotty',
  gray: 'Grey',
  cream: 'Cream',
};

export const COFFEE_LABEL: Readonly<Record<CoffeeOrder, string>> = {
  black: 'Black',
  splash: 'A splash',
  creamSugar: 'Cream & sugar',
  latte: 'Lots of cream',
};
const COFFEE_TINT: Readonly<Record<CoffeeOrder, string>> = {
  black: '#3a2317',
  splash: '#6b4428',
  creamSugar: '#a8784f',
  latte: '#d9b184',
};

/** Tiny mug preview filled with the coffee's colour (trusted constant markup). */
export function cupSvg(order: CoffeeOrder): string {
  const t = COFFEE_TINT[order];
  const sugar = order === 'creamSugar' ? `<rect x="30" y="4" width="7" height="7" rx="1.5" fill="#fff" stroke="${INK}" stroke-width="2" transform="rotate(12 33 7)"/>` : '';
  const foam = order === 'latte' ? `<path d="M11 15q3-4 6 0 3-4 6 0 3-4 6 0" fill="#fff6e9" stroke="${INK}" stroke-width="1.6"/>` : '';
  return (
    `<svg class="bhd-cup" viewBox="0 0 44 40" aria-hidden="true" focusable="false">` +
    `<path d="M33 18h3a5 5 0 0 1 0 10h-3" fill="none" stroke="${INK}" stroke-width="6.5"/><path d="M33 18h3a5 5 0 0 1 0 10h-3" fill="none" stroke="#fff6e9" stroke-width="3"/>` +
    `<path d="M7 14h27v15a8 8 0 0 1-8 8H15a8 8 0 0 1-8-8z" fill="#fff6e9" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<ellipse cx="20.5" cy="14.5" rx="13.5" ry="3.6" fill="${t}" stroke="${INK}" stroke-width="2.4"/>` +
    foam +
    sugar +
    `</svg>`
  );
}

function beardSvg(kind: MemberLook['beard']): string {
  const chin = `<path d="M8 10c0 12 7 20 16 20s16-8 16-20" fill="#f9d0ae" stroke="${INK}" stroke-width="2.4"/>`;
  const art =
    kind === 'beard'
      ? `<path d="M8 10c0 12 7 20 16 20s16-8 16-20c-2 4-4 5-6 5-2-2-6-3-10-3s-8 1-10 3c-2 0-4-1-6-5z" fill="#44291b" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`
      : kind === 'stubble'
        ? `<g fill="#44291b">${[
            [12, 17], [15, 21], [19, 24], [24, 25], [29, 24], [33, 21], [36, 17], [17, 18], [22, 21], [27, 21], [31, 18], [24, 28],
          ]
            .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2"/>`)
            .join('')}</g>`
        : '';
  return `<svg class="bhd-beard" viewBox="0 0 48 34" aria-hidden="true" focusable="false">${chin}${art}<path d="M19 15q5 3 10 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}

/** Deep copy (the screen never mutates the game's object). */
export function cloneFamily(f: Readonly<FamilySetup>): FamilySetup {
  const m = {} as Record<MemberId, MemberLook>;
  for (const id of MEMBERS) m[id] = { ...lookOf(f.looks, id) };
  return { looks: { members: m, dog: { name: sanitizeDogName(f.looks?.dog?.name), coat: f.looks?.dog?.coat ?? 'golden' } }, coffee: f.coffee ?? 'splash' };
}

export class FamilyScreen implements Screen {
  readonly id = 'family' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly tabsEl: HTMLElement;
  private readonly tabBtns: HTMLButtonElement[] = [];
  private readonly preview: HTMLElement;
  private readonly pvFace: HTMLElement;
  private readonly pvName: HTMLElement;
  private readonly pvRole: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly done: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private readonly tabsItem: FocusItem;
  private rows: Row[] = [];
  private tab = 0;
  private draft: FamilySetup;
  private nameInput: HTMLInputElement | null = null;
  private nameTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('family', 'bhd-screen--dim');
    this.draft = cloneFamily(ctx.family);
    this.tabsEl = el('div', { class: 'bhd-tabs bhd-fam__tabs', attrs: { role: 'tablist' } });
    TABS.forEach((t, i) => {
      const b = el('button', { class: 'bhd-tab', attrs: { type: 'button', tabindex: '-1', role: 'tab', 'data-tab': t } }, [
        el('span', { class: 'bhd-tab__face' }),
        el('span', { class: 'bhd-tab__t', text: t === 'dog' ? 'DOG' : DISPLAY_NAME[t].toUpperCase() }),
      ]);
      onClick(b, (e) => {
        e.stopPropagation();
        this.focus.focus(this.tabsEl);
        if (i !== this.tab) {
          this.ctx.sound('move');
          this.select(i);
        }
      });
      this.tabBtns.push(b);
      this.tabsEl.appendChild(b);
    });
    this.pvFace = el('div', { class: 'bhd-fam__face' });
    this.pvName = el('div', { class: 'bhd-fam__name' });
    this.pvRole = el('div', { class: 'bhd-fam__role' });
    this.preview = el('div', { class: 'bhd-fam__preview' }, [el('div', { class: 'bhd-fam__halo', attrs: { 'aria-hidden': 'true' } }), this.pvFace, this.pvName, this.pvRole]);
    this.controls = el('div', { class: 'bhd-fam__controls bhd-scroll' });
    this.done = button('bhd-btn--primary', 'DONE', uiIcon('check'));
    this.hint = el('div', { class: 'bhd-hint bhd-hint--inline' });
    const card = el('div', { class: 'bhd-panel bhd-fam__card bhd-enter' }, [
      cardTitle('FAMILY SETUP', uiIcon('family')),
      this.tabsEl,
      el('div', { class: 'bhd-fam__body' }, [this.preview, this.controls]),
      el('div', { class: 'bhd-cardfoot' }, [this.hint, this.done]),
    ]);
    this.el.append(card);
    this.focus = ctx.createFocus('grid');
    this.tabsItem = {
      el: this.tabsEl,
      noClick: true,
      adjust: (dir) => {
        const n = TABS.length;
        this.select((((this.tab + dir) % n) + n) % n);
        return true;
      },
      activate: () => this.select((this.tab + 1) % TABS.length),
    };
    this.focus.onChange = (f) => {
      if (f && this.controls.contains(f) && typeof f.scrollIntoView === 'function') f.scrollIntoView({ block: 'nearest' });
      if (this.nameInput && document.activeElement === this.nameInput && f && !f.contains(this.nameInput)) this.nameInput.blur();
    };
  }

  /** Current tab id (tests). */
  get currentTab(): Tab {
    return TABS[this.tab] ?? 'chris';
  }

  enter(from: string): void {
    this.draft = cloneFamily(this.ctx.family);
    if (from === 'menu' || from === 'pause') this.tab = 0;
    this.renderTabFaces();
    this.select(this.tab);
    this.focus.focus(this.tabsEl);
    this.refreshGlyphs();
  }

  leave(): void {
    this.nameInput?.blur();
    this.flushName();
  }

  /** Typing the dog's name emits after a short pause (the game rebuilds the family on every change). */
  private scheduleNameCommit(): void {
    if (this.nameTimer !== null) clearTimeout(this.nameTimer);
    this.nameTimer = setTimeout(() => this.flushName(), 400);
  }

  private flushName(): void {
    if (this.nameTimer === null) return;
    clearTimeout(this.nameTimer);
    this.nameTimer = null;
    this.commit();
  }

  refresh(): void {
    // The game echoed a family (e.g. after our own change): keep the draft, just re-read the rows.
    for (const r of this.rows) r.refresh();
  }

  back(): boolean {
    if (this.nameInput && document.activeElement === this.nameInput) {
      this.nameInput.blur();
      return true;
    }
    this.ctx.close();
    return true;
  }

  action(a: MenuAction): boolean {
    if (a === 'next' || a === 'prev') {
      const n = TABS.length;
      this.select((((this.tab + (a === 'next' ? 1 : -1)) % n) + n) % n);
      this.ctx.sound('move');
      return true;
    }
    if (this.nameInput && document.activeElement === this.nameInput && a !== 'back') this.nameInput.blur();
    return false;
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText('{switch} Family member   {navigate} Pick   {back} Done');
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private commit(): void {
    this.ctx.changeFamily(cloneFamily(this.draft));
    this.renderPreview();
    this.renderTabFaces();
    for (const r of this.rows) r.refresh();
  }

  private member(id: MemberId): MemberLook {
    return this.draft.looks.members[id];
  }

  private select(i: number): void {
    this.nameInput?.blur();
    this.flushName();
    this.tab = Math.max(0, Math.min(TABS.length - 1, i));
    this.tabBtns.forEach((b, k) => {
      b.classList.toggle('is-on', k === this.tab);
      b.setAttribute('aria-selected', String(k === this.tab));
    });
    this.buildRows();
    this.renderPreview();
  }

  private renderTabFaces(): void {
    TABS.forEach((t, i) => {
      const face = this.tabBtns[i]!.querySelector('.bhd-tab__face') as HTMLElement;
      face.innerHTML = t === 'dog' ? dogFaceSvg(this.draft.looks.dog.coat) : faceSvg({ who: t, look: this.member(t), mood: 'happy' });
    });
  }

  private renderPreview(): void {
    const t = this.currentTab;
    this.preview.dataset.who = t;
    if (t === 'dog') {
      this.pvFace.innerHTML = dogFaceSvg(this.draft.looks.dog.coat);
      setText(this.pvName, sanitizeDogName(this.draft.looks.dog.name)); // user string → textContent
    } else {
      this.pvFace.innerHTML = faceSvg({ who: t, look: this.member(t), mood: 'happy' });
      setText(this.pvName, DISPLAY_NAME[t]);
    }
    setText(this.pvRole, ROLE[t]);
  }

  private buildRows(): void {
    const t = this.currentTab;
    this.controls.textContent = '';
    this.nameInput = null;
    const fg = (): FocusGroup => this.focus;
    const rows: Row[] = [];
    const extraItems: FocusItem[][] = [];
    if (t === 'dog') {
      const input = el('input', {
        class: 'bhd-input',
        attrs: { type: 'text', maxlength: '14', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': 'Dog name', enterkeyhint: 'done' },
      });
      input.value = this.draft.looks.dog.name;
      this.nameInput = input;
      input.addEventListener('input', () => {
        const v = clampDogNameInput(input.value);
        if (v !== input.value) input.value = v;
        if (v.trim().length > 0) {
          this.draft.looks.dog.name = sanitizeDogName(v);
          setText(this.pvName, this.draft.looks.dog.name); // user string → textContent
          this.scheduleNameCommit();
        }
      });
      const restore = (): void => {
        if (input.value.trim().length === 0) input.value = this.draft.looks.dog.name;
        this.flushName();
      };
      input.addEventListener('blur', restore);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
      const shuffle = el('button', { class: 'bhd-iconbtn bhd-fam__shuffle', html: uiIcon('dice'), attrs: { type: 'button', tabindex: '-1', 'aria-label': 'Suggest a name' } });
      const nameRow = el('div', { class: 'bhd-setrow bhd-setrow--name' }, [
        el('span', { class: 'bhd-setrow__label' }, [el('span', { class: 'bhd-setrow__t', text: 'NAME' })]),
        el('div', { class: 'bhd-fam__namebox' }, [input, shuffle]),
      ]);
      const doShuffle = (): void => {
        if (this.nameTimer !== null) clearTimeout(this.nameTimer);
        this.nameTimer = null;
        const n = nextDogName(this.draft.looks.dog.name);
        this.draft.looks.dog.name = n;
        input.value = n;
        this.ctx.sound('toggle');
        this.commit();
      };
      this.controls.appendChild(nameRow);
      extraItems.push([
        { el: input, activate: () => input.focus(), sound: 'none' },
        { el: shuffle, activate: doShuffle, sound: 'none' },
      ]);
      const coats = (Object.keys(DOG_COATS) as DogCoat[]).map((k) => ({ value: k, color: hexColor(DOG_COATS[k].main), name: COAT_NAMES[k] }));
      rows.push(
        swatchRow(
          'COAT',
          coats,
          () => this.draft.looks.dog.coat,
          (v) => {
            this.draft.looks.dog.coat = v;
            this.commit();
          },
          fg,
        ),
      );
    } else {
      const m = (): MemberLook => this.member(t);
      rows.push(
        swatchRow(
          'HAIR',
          HAIR_COLORS.map((h) => ({ value: h.hex, color: hexColor(h.hex), name: h.name })),
          () => m().hair,
          (v) => {
            m().hair = v;
            this.commit();
          },
          fg,
        ),
      );
      rows.push(
        swatchRow(
          'SKIN',
          SKIN_TONES.map((s, i) => ({ value: i, color: hexColor(s), name: `Tone ${i + 1}` })),
          () => m().skin,
          (v) => {
            m().skin = v;
            this.commit();
          },
          fg,
        ),
      );
      rows.push(
        toggleRow(
          'GLASSES',
          '',
          () => m().glasses,
          (v) => {
            m().glasses = v;
            this.commit();
          },
          (k) => this.ctx.sound(k),
        ),
      );
      if (t === 'chris') {
        rows.push(
          choiceRow<MemberLook['beard']>(
            'BEARD',
            '',
            [
              { value: 'none', text: 'None', html: beardSvg('none') },
              { value: 'stubble', text: 'Stubble', html: beardSvg('stubble') },
              { value: 'beard', text: 'Beard', html: beardSvg('beard') },
            ],
            () => m().beard,
            (v) => {
              m().beard = v;
              this.commit();
            },
            fg,
            'bhd-setrow--art',
          ),
        );
      }
      if (t === 'ashley') {
        rows.push(
          choiceRow<CoffeeOrder>(
            'COFFEE ORDER',
            '',
            (['black', 'splash', 'creamSugar', 'latte'] as const).map((o) => ({ value: o, text: COFFEE_LABEL[o], html: cupSvg(o) })),
            () => this.draft.coffee,
            (v) => {
              this.draft.coffee = v;
              this.commit();
            },
            fg,
            'bhd-setrow--art bhd-setrow--coffee',
          ),
        );
      }
    }
    for (const r of rows) {
      this.controls.appendChild(r.item.el);
      r.refresh();
    }
    this.rows = rows;
    const focusRows: FocusItem[][] = [[this.tabsItem], ...extraItems, ...rows.map((r) => [r.item]), [{ el: this.done, activate: () => this.ctx.close(), sound: 'back' }]];
    this.focus.setRows(focusRows, this.tabsEl);
  }
}

/** Exposed for tests: the looks the screen would emit for a given family. */
export function familyLooks(f: FamilySetup): FamilyLooks {
  return cloneFamily(f).looks;
}
