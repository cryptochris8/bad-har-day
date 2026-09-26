// Title (animated logo + tagline + "press any button"; transparent over the 3D house) and the main
// menu (NEW MORNING · DAILY MORNING · FAMILY SETUP · HOW TO PLAY · SETTINGS · CREDITS).
import type { MenuAction } from '../../input/types';
import { button, el, onClick, setText } from '../dom';
import type { FocusGroup, FocusItem } from '../focus';
import { formatClock } from '../format';
import { iconSvg, uiIcon } from '../icons';
import { logoEl } from '../widgets';
import type { Screen, UiCtx } from './screen';
import { screenEl } from './screen';

export const TAGLINE = 'Five family members. Three heads of hair. One black brush. One school morning.';

export class TitleScreen implements Screen {
  readonly id = 'title' as const;
  readonly focus = null;
  readonly el: HTMLElement;
  private readonly press: HTMLElement;
  private readonly pressGlyph: HTMLElement;
  private started = false;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('title');
    this.press = el('span', { class: 'bhd-title__presst' });
    this.pressGlyph = el('span', { class: 'bhd-title__glyph' });
    this.el.append(
      el('div', { class: 'bhd-title__vignette', attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'bhd-title__col' }, [
        logoEl('xl'),
        el('p', { class: 'bhd-title__tagline', text: TAGLINE }),
        el('div', { class: 'bhd-title__press' }, [this.pressGlyph, this.press]),
      ]),
      el('div', { class: 'bhd-title__foot', text: 'A school-morning family arcade game' }),
    );
    onClick(this.el, () => this.start());
  }

  enter(): void {
    this.started = false;
    this.refreshGlyphs();
  }

  refreshGlyphs(): void {
    const touch = this.ctx.device === 'touch';
    setText(this.press, touch ? 'TAP TO START' : this.ctx.device === 'gamepad' ? 'PRESS ANY BUTTON' : 'PRESS ANY KEY');
    this.pressGlyph.innerHTML = touch ? '' : this.ctx.glyph('confirm');
  }

  action(a: MenuAction): boolean {
    if (a === 'mute') return false;
    this.start();
    return true;
  }

  back(): boolean {
    this.start();
    return true;
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.ctx.sound('open');
    this.ctx.go('menu');
  }
}

export class MenuScreen implements Screen {
  readonly id = 'menu' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly newBtn: HTMLButtonElement;
  private readonly dailySub: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly hint: HTMLElement;
  private statsKey = '#';

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('menu');
    this.newBtn = button('bhd-btn--primary bhd-btn--xl bhd-menu__new', 'NEW MORNING', uiIcon('sunrise'), 'A brand-new, totally random morning');
    const daily = button('bhd-btn--lg bhd-menu__daily', 'DAILY MORNING', uiIcon('calendar'), '');
    this.dailySub = daily.querySelector('.bhd-btn__sub') as HTMLElement;
    const family = button('bhd-menu__small', 'FAMILY SETUP', uiIcon('family'));
    const howto = button('bhd-menu__small', 'HOW TO PLAY', uiIcon('question'));
    const settings = button('bhd-menu__small', 'SETTINGS', uiIcon('sliders'));
    const credits = button('bhd-menu__small', 'CREDITS', iconSvg('heart'));
    const full = el('button', { class: 'bhd-iconbtn bhd-menu__full', html: uiIcon('fullscreen'), attrs: { type: 'button', tabindex: '-1', 'aria-label': 'Fullscreen' } });
    this.stats = el('div', { class: 'bhd-menu__stats' });
    this.hint = el('div', { class: 'bhd-hint' });
    const card = el('div', { class: 'bhd-panel bhd-menu__card bhd-enter' }, [
      this.newBtn,
      daily,
      el('div', { class: 'bhd-menu__grid' }, [family, howto, settings, credits]),
      this.stats,
    ]);
    this.el.append(
      el('div', { class: 'bhd-menu__logo' }, [logoEl('md'), el('p', { class: 'bhd-menu__tag', text: 'Somehow, everybody makes it out the door.' })]),
      card,
      full,
      this.hint,
    );
    this.focus = ctx.createFocus();
    const it = (b: HTMLElement, activate: () => void): FocusItem => ({ el: b, activate });
    this.focus.setRows(
      [
        [it(this.newBtn, () => ctx.emit({ type: 'newMorning' }))],
        [it(daily, () => ctx.emit({ type: 'dailyMorning' }))],
        [it(family, () => ctx.open('family')), it(howto, () => ctx.open('howto'))],
        [it(settings, () => ctx.open('settings')), it(credits, () => ctx.open('credits'))],
        [it(full, () => ctx.emit({ type: 'fullscreen' }))],
      ],
      this.newBtn,
    );
  }

  enter(from: string): void {
    if (from === 'title' || from === 'none' || from === 'results' || from === 'pause') this.focus.focus(this.newBtn);
    this.refresh();
    this.refreshGlyphs();
  }

  back(): boolean {
    this.ctx.go('title');
    return true;
  }

  refresh(): void {
    const best = this.ctx.dailyBest;
    setText(this.dailySub, typeof best === 'number' && best > 0 ? `Today’s best: ★ ${best} — go again?` : 'The same morning for everyone today');
    const s = this.ctx.stats;
    const key = s ? `${s.mornings}|${s.bestArrival}|${s.totalStars}` : '';
    if (key === this.statsKey) return;
    this.statsKey = key;
    this.stats.textContent = '';
    if (s && s.mornings > 0) {
      const chip = (icon: string, text: string): HTMLElement => el('span', { class: 'bhd-menu__stat' }, [el('span', { class: 'bhd-menu__stati', html: icon }), el('span', { text })]);
      this.stats.append(
        chip(iconSvg('sun'), `${s.mornings} morning${s.mornings === 1 ? '' : 's'}`),
        chip(iconSvg('clock'), s.bestArrival !== null ? `Best ${formatClock(s.bestArrival)}` : 'No arrivals yet'),
        chip(iconSvg('star'), `${s.totalStars} stars`),
      );
    } else {
      this.stats.append(el('span', { class: 'bhd-menu__stat bhd-menu__stat--first', text: 'First morning? Wake up, Chris — it’s 5:15!' }));
    }
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText('{navigate} Choose   {confirm} Select');
  }
}
