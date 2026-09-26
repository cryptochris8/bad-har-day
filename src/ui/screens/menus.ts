// HOW TO PLAY (controls for the device in use + a tip card per act), CREDITS and the PAUSE menu.
import { DISPLAY_NAME, MEMBERS } from '../../family/types';
import type { MenuAction } from '../../input/types';
import { ACTS } from '../../plan/types';
import { button, el, onClick, setText } from '../dom';
import { dogFaceSvg, faceSvg, lookOf } from '../faces';
import type { FocusGroup, FocusItem } from '../focus';
import { formatClock, roman, sanitizeDogName } from '../format';
import { deviceLabel, type GlyphToken } from '../glyphs';
import { iconSvg, uiIcon } from '../icons';
import type { IconId } from '../types';
import { cardTitle, ConfirmBox, logoEl } from '../widgets';
import type { Screen, UiCtx } from './screen';
import { screenEl } from './screen';

const SCROLL_STEP = 80;

// ── how to play ──────────────────────────────────────────────────────────────

const CONTROL_ROWS: readonly { tokens: GlyphToken[]; text: string; icon: IconId }[] = [
  { tokens: ['move'], text: 'Walk around the house', icon: 'shoe' },
  { tokens: ['primary'], text: 'Do the thing! Open, grab, brew, place', icon: 'hand' },
  { tokens: ['secondary'], text: 'Call the dog · pass the black brush', icon: 'whistle' },
  { tokens: ['alt'], text: '“I’m done!” · hold actions', icon: 'check' },
  { tokens: ['switch'], text: 'Switch girl while brushing', icon: 'heart' },
  { tokens: ['pointer'], text: 'Brush, pour & drag', icon: 'brush' },
  { tokens: ['pause'], text: 'Pause', icon: 'clock' },
];

const ACT_TIPS: readonly { icon: IconId; tips: string[] }[] = [
  { icon: 'coffee', tips: ['Tick off the to-do list before 6:00.', 'Call the dog when she glances back — a shake of the treat bag helps.', 'Hold to brew, let go at the line.', 'Tiptoe near the girls’ doors. Shh!'] },
  { icon: 'sun', tips: ['Every girl wakes up her own way.', 'Blanket burrito? Open the curtains, then sing on the beat.', 'Sleepwalker? Walk beside her to the kitchen.'] },
  { icon: 'blackBrush', tips: ['Brush DOWN, and start at the ends — work your way up.', 'Gentle strokes: too fast and the brush snags (boing!).', 'Pass the black brush — it’s a bit better. Everybody wants it.', 'Mom checks every head at the end. She’s very proud.'] },
  { icon: 'backpack', tips: ['Things go missing. Look for the sparkle!', 'Bring each item to the right girl — match her colour.', 'The dog might “help”.'] },
  { icon: 'car', tips: ['Steer left and right, stop for the crossing guard.', 'Catch the green lights. Wave at the geese.'] },
];

export class HowToScreen implements Screen {
  readonly id = 'howto' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly tabBtns: HTMLButtonElement[] = [];
  private readonly body: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly back_: HTMLButtonElement;
  private readonly tabsEl: HTMLElement;
  private index = 0;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('howto', 'bhd-screen--dim');
    this.tabsEl = el('div', { class: 'bhd-tabs bhd-howto__tabs', attrs: { role: 'tablist' } });
    ['CONTROLS', 'THE MORNING'].forEach((label, i) => {
      const b = el('button', { class: 'bhd-tab bhd-tab--text', attrs: { type: 'button', tabindex: '-1', role: 'tab' } }, [
        el('span', { class: 'bhd-tab__ico', html: i === 0 ? uiIcon('sliders') : iconSvg('clock') }),
        el('span', { class: 'bhd-tab__t', text: label }),
      ]);
      onClick(b, (e) => {
        e.stopPropagation();
        if (i !== this.index) this.ctx.sound('move');
        this.select(i);
      });
      this.tabBtns.push(b);
      this.tabsEl.appendChild(b);
    });
    this.body = el('div', { class: 'bhd-howto__body bhd-scroll' });
    this.back_ = button('bhd-btn--primary', 'GOT IT!', uiIcon('check'));
    this.hint = el('div', { class: 'bhd-hint bhd-hint--inline' });
    const card = el('div', { class: 'bhd-panel bhd-howto__card bhd-enter' }, [
      cardTitle('HOW TO PLAY', uiIcon('question')),
      this.tabsEl,
      this.body,
      el('div', { class: 'bhd-cardfoot' }, [this.hint, this.back_]),
    ]);
    this.el.append(card);
    this.focus = ctx.createFocus();
    const back: FocusItem = { el: this.back_, activate: () => this.ctx.close(), sound: 'back' };
    this.focus.setRows([[back]], this.back_);
  }

  get tabIndex(): number {
    return this.index;
  }

  enter(): void {
    this.select(this.index);
    this.focus.focus(this.back_);
    this.refreshGlyphs();
  }

  back(): boolean {
    this.ctx.close();
    return true;
  }

  action(a: MenuAction): boolean {
    if (a === 'left' || a === 'prev' || a === 'right' || a === 'next') {
      const dir = a === 'left' || a === 'prev' ? -1 : 1;
      const n = this.tabBtns.length;
      this.select((((this.index + dir) % n) + n) % n);
      this.ctx.sound('move');
      return true;
    }
    if (a === 'up' || a === 'down') {
      const dy = a === 'up' ? -SCROLL_STEP : SCROLL_STEP;
      if (typeof this.body.scrollBy === 'function') this.body.scrollBy({ top: dy, behavior: 'smooth' });
      else this.body.scrollTop += dy;
      return true;
    }
    return false;
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText('{navigate} Tabs & scroll   {back} Back');
    this.render();
  }

  private select(i: number): void {
    this.index = Math.max(0, Math.min(this.tabBtns.length - 1, i));
    this.tabBtns.forEach((b, k) => {
      b.classList.toggle('is-on', k === this.index);
      b.setAttribute('aria-selected', String(k === this.index));
    });
    this.body.scrollTop = 0;
    this.render();
  }

  private render(): void {
    this.body.textContent = '';
    if (this.index === 0) {
      const head = el('div', { class: 'bhd-howto__device' }, [
        el('span', { class: 'bhd-tag', text: 'SHOWING' }),
        el('span', { class: 'bhd-howto__devname', text: deviceLabel(this.ctx.device, this.ctx.pad) }),
        el('span', { class: 'bhd-howto__devnote', text: 'Pick up a controller, keyboard or tap the screen — it switches by itself.' }),
      ]);
      const list = el('div', { class: 'bhd-ctrls' });
      for (const r of CONTROL_ROWS) {
        const glyphs = el('span', { class: 'bhd-ctrl__g', html: r.tokens.map((t) => this.ctx.glyph(t)).join('') });
        list.appendChild(el('div', { class: 'bhd-ctrl' }, [glyphs, el('span', { class: 'bhd-ctrl__ico', html: iconSvg(r.icon) }), el('span', { class: 'bhd-ctrl__t', text: r.text })]));
      }
      this.body.append(head, list);
      return;
    }
    const intro = el('p', { class: 'bhd-howto__intro', text: 'There’s no game over — the morning always ends at school. Quicker, careful mornings earn more stars and sillier awards on the report card.' });
    const acts = el('div', { class: 'bhd-acttips' });
    ACTS.forEach((a, i) => {
      const t = ACT_TIPS[i];
      if (!t) return;
      const card = el('div', { class: `bhd-acttip bhd-acttip--${i + 1}` }, [
        el('div', { class: 'bhd-acttip__head' }, [
          el('span', { class: 'bhd-acttip__ico', html: iconSvg(t.icon) }),
          el('div', {}, [el('div', { class: 'bhd-acttip__time', text: `ACT ${roman(a.act)} · ${formatClock(a.start)}` }), el('div', { class: 'bhd-acttip__title', text: a.title })]),
        ]),
        el('ul', { class: 'bhd-acttip__list' }, t.tips.map((tip) => el('li', { text: tip }))),
      ]);
      acts.appendChild(card);
    });
    this.body.append(intro, acts);
  }
}

// ── credits ──────────────────────────────────────────────────────────────────

export class CreditsScreen implements Screen {
  readonly id = 'credits' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly faces: HTMLElement;
  private readonly back_: HTMLButtonElement;
  private looksSeen: unknown = null;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('credits', 'bhd-screen--dim');
    this.faces = el('div', { class: 'bhd-credits__faces' });
    this.back_ = button('bhd-btn--primary', 'BACK', uiIcon('back'));
    const card = el('div', { class: 'bhd-panel bhd-credits__card bhd-enter' }, [
      cardTitle('CREDITS', iconSvg('heart')),
      logoEl('sm'),
      el('p', { class: 'bhd-credits__love' }, [el('span', { class: 'bhd-credits__heart', html: iconSvg('heart') }), el('span', { text: 'Made with love for Addy, Ellie, Heidi, Ashley & Chris' })]),
      this.faces,
      el('div', { class: 'bhd-credits__tech' }, [
        el('span', { class: 'bhd-tag', text: 'HOMEMADE' }),
        el('span', { text: 'Procedural 3D, synthesized audio, zero downloaded assets.' }),
      ]),
      el('p', { class: 'bhd-credits__small', text: 'Every model built in code · every sound made on the fly · Three.js + Web Audio' }),
      el('p', { class: 'bhd-credits__small', text: '© Athlete Domains LLC' }),
      el('div', { class: 'bhd-cardfoot bhd-cardfoot--center' }, [this.back_]),
    ]);
    this.el.append(card);
    this.focus = ctx.createFocus();
    this.focus.setRows([[{ el: this.back_, activate: () => this.ctx.close(), sound: 'back' }]], this.back_);
  }

  enter(): void {
    this.focus.focus(this.back_);
    this.refresh();
  }

  refresh(): void {
    const looks = this.ctx.family.looks;
    if (looks === this.looksSeen) return;
    this.looksSeen = looks;
    this.faces.textContent = '';
    MEMBERS.forEach((m, i) => {
      const f = el('div', { class: 'bhd-credits__face', html: faceSvg({ who: m, look: lookOf(looks, m), mood: m === 'chris' ? 'neutral' : 'happy' }) }, [
        el('span', { class: 'bhd-credits__name', text: DISPLAY_NAME[m] }),
      ]);
      f.style.setProperty('--i', String(i));
      this.faces.appendChild(f);
    });
    const dog = el('div', { class: 'bhd-credits__face bhd-credits__face--dog', html: dogFaceSvg(looks?.dog?.coat ?? 'golden') }, [
      el('span', { class: 'bhd-credits__name', text: sanitizeDogName(looks?.dog?.name) }),
    ]);
    dog.style.setProperty('--i', '5');
    this.faces.appendChild(dog);
  }

  back(): boolean {
    this.ctx.close();
    return true;
  }
}

// ── pause ────────────────────────────────────────────────────────────────────

export class PauseScreen implements Screen {
  readonly id = 'pause' as const;
  readonly el: HTMLElement;
  private readonly mainFocus: FocusGroup;
  private readonly confirm: ConfirmBox;
  private readonly resume: HTMLButtonElement;
  private readonly menuEl: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly sub: HTMLElement;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('pause', 'bhd-screen--dim');
    this.resume = button('bhd-btn--primary bhd-btn--lg', 'RESUME', uiIcon('play'));
    const restart = button('', 'RESTART MORNING', uiIcon('restart'));
    const howto = button('', 'HOW TO PLAY', uiIcon('question'));
    const settings = button('', 'SETTINGS', uiIcon('sliders'));
    const quit = button('bhd-btn--soft', 'QUIT TO MENU', uiIcon('home'));
    this.sub = el('div', { class: 'bhd-pause__sub', text: 'The whole house is frozen. Even the dog.' });
    this.hint = el('div', { class: 'bhd-hint bhd-hint--inline' });
    this.menuEl = el('div', { class: 'bhd-pause__btns' }, [this.resume, restart, howto, settings, quit]);
    this.mainFocus = ctx.createFocus();
    this.confirm = new ConfirmBox(ctx.createFocus());
    const card = el('div', { class: 'bhd-panel bhd-pause__card bhd-enter' }, [
      cardTitle('PAUSED', uiIcon('pause')),
      el('div', { class: 'bhd-pause__zzz', html: iconSvg('clock') }),
      this.sub,
      this.menuEl,
      this.confirm.el,
      el('div', { class: 'bhd-cardfoot bhd-cardfoot--center' }, [this.hint]),
    ]);
    this.el.append(card);
    const it = (b: HTMLElement, activate: () => void, sound?: FocusItem['sound']): FocusItem => ({ el: b, activate, sound });
    this.mainFocus.setRows(
      [
        [it(this.resume, () => ctx.emit({ type: 'resume' }), 'back')],
        [
          it(restart, () =>
            this.ask('RESTART THIS MORNING?', 'Back to 5:15 AM. The alarm goes off again.', 'RESTART', () => ctx.emit({ type: 'restartMorning' })),
          ),
        ],
        [it(howto, () => ctx.open('howto'))],
        [it(settings, () => ctx.open('settings'))],
        [it(quit, () => this.ask('QUIT TO THE MENU?', 'This morning won’t be saved. Nobody will mind — promise.', 'QUIT', () => ctx.emit({ type: 'quitToMenu' })))],
      ],
      this.resume,
    );
  }

  get focus(): FocusGroup {
    return this.confirm.open ? this.confirm.focus : this.mainFocus;
  }

  /** Is the two-step confirm showing (tests)? */
  get confirming(): boolean {
    return this.confirm.open;
  }

  enter(from: string): void {
    this.closeConfirm();
    if (from !== 'howto' && from !== 'settings' && from !== 'family') this.mainFocus.focus(this.resume);
    this.refreshGlyphs();
  }

  leave(): void {
    this.closeConfirm();
  }

  action(a: MenuAction): boolean {
    if (a === 'pause') {
      if (this.confirm.open) this.closeConfirm();
      else this.ctx.emit({ type: 'resume' });
      return true;
    }
    return false;
  }

  back(): boolean {
    if (this.confirm.open) {
      this.closeConfirm();
      return true;
    }
    this.ctx.emit({ type: 'resume' });
    return true;
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText('{confirm} Select   {back} Resume');
  }

  private ask(title: string, body: string, yes: string, onYes: () => void): void {
    this.mainFocus.blur();
    this.menuEl.hidden = true;
    setText(this.sub, '');
    this.confirm.show(title, body, yes, 'NO, KEEP GOING', onYes, () => {
      this.ctx.sound('back');
      this.closeConfirm();
    });
  }

  private closeConfirm(): void {
    if (!this.confirm.open && !this.menuEl.hidden) return;
    this.confirm.hide();
    this.confirm.focus.blur();
    this.menuEl.hidden = false;
    setText(this.sub, 'The whole house is frozen. Even the dog.');
    this.mainFocus.repaint();
  }
}
