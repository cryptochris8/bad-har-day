// SETTINGS — every Settings field (GDD §13) + RESET STATS (two-step). Each change emits
// {type:'settings', patch} (the UI also applies it to its cached copy so the rows update at once).
import type { MenuAction } from '../../input/types';
import type { Quality } from '../../render/types';
import type { Settings } from '../../storage/types';
import { START_POINTS } from '../../plan/types';
import { button, el } from '../dom';
import type { FocusGroup, FocusItem } from '../focus';
import { iconSvg, uiIcon } from '../icons';
import { cardTitle, choiceRow, sliderRow, toggleRow, type Row } from '../widgets';
import type { Screen, UiCtx } from './screen';
import { screenEl } from './screen';

type BoolKey = 'muted' | 'screenShake' | 'reducedMotion' | 'vibration' | 'hints';
type VolKey = 'master' | 'music' | 'sfx';

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly rows: Row[] = [];
  private readonly list: HTMLElement;
  private readonly resetRow: HTMLElement;
  private readonly resetLabel: HTMLElement;
  private readonly firstRow: HTMLElement;
  private readonly hint: HTMLElement;
  private armed = false;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('settings', 'bhd-screen--dim');
    const cols = el('div', { class: 'bhd-set__cols' });
    this.list = el('div', { class: 'bhd-set__list bhd-scroll' }, [cols]);
    const fg = (): FocusGroup => this.focus;
    const section = (t: string, icon: string): HTMLElement => el('div', { class: 'bhd-set__sec' }, [el('span', { class: 'bhd-set__secico', html: icon }), el('span', { text: t })]);
    const add = (r: Row): void => {
      this.rows.push(r);
      cols.appendChild(r.item.el);
    };
    const s = (): Readonly<Settings> => this.ctx.settings;
    const vol = (label: string, key: VolKey): Row =>
      sliderRow(label, '', () => s()[key], (v) => this.ctx.changeSettings({ [key]: v } as Partial<Settings>), fg);
    const tog = (label: string, key: BoolKey): Row =>
      toggleRow(label, '', () => s()[key], (v) => this.ctx.changeSettings({ [key]: v } as Partial<Settings>), (k) => this.ctx.sound(k));

    cols.appendChild(section('SOUND', iconSvg('music')));
    add(vol('Master volume', 'master'));
    add(vol('Music', 'music'));
    add(vol('Sound effects', 'sfx'));
    add(tog('Mute everything', 'muted'));
    cols.appendChild(section('PLAY', iconSvg('heart')));
    // Where a morning begins — the girls can skip Chris's early shift and start at their part.
    add(
      choiceRow<Settings['startAct']>(
        'Start the morning at',
        '',
        ([1, 2, 3, 4, 5] as const).map((a) => ({ value: a, text: `${START_POINTS[a].time} ${START_POINTS[a].short}` })),
        () => s().startAct,
        (v) => this.ctx.changeSettings({ startAct: v }),
        fg,
        'bhd-setrow--start',
      ),
    );
    add(tog('Helpful hints', 'hints'));
    add(tog('Vibration', 'vibration'));
    add(tog('Screen shake', 'screenShake'));
    add(tog('Reduced motion', 'reducedMotion'));
    cols.appendChild(section('DISPLAY', iconSvg('sun')));
    add(
      choiceRow<Quality>(
        'Graphics',
        '',
        [
          { value: 'auto', text: 'Auto' },
          { value: 'high', text: 'High' },
          { value: 'low', text: 'Low' },
        ],
        () => s().quality,
        (v) => this.ctx.changeSettings({ quality: v }),
        fg,
      ),
    );
    cols.appendChild(section('TOUCH', iconSvg('hand')));
    add(
      choiceRow<Settings['touchControls']>(
        'Touch controls',
        '',
        [
          { value: 'auto', text: 'Auto' },
          { value: 'on', text: 'On' },
          { value: 'off', text: 'Off' },
        ],
        () => s().touchControls,
        (v) => this.ctx.changeSettings({ touchControls: v }),
        fg,
      ),
    );
    add(
      choiceRow<Settings['touchHand']>(
        'Buttons on the',
        '',
        [
          { value: 'right', text: 'Right' },
          { value: 'left', text: 'Left' },
        ],
        () => s().touchHand,
        (v) => this.ctx.changeSettings({ touchHand: v }),
        fg,
      ),
    );
    cols.appendChild(section('SAVED STUFF', iconSvg('book')));
    this.resetLabel = el('span', { class: 'bhd-set__danger', text: 'RESET' });
    this.resetRow = el('div', { class: 'bhd-setrow bhd-setrow--danger', attrs: { role: 'button' } }, [
      el('span', { class: 'bhd-setrow__label' }, [el('span', { class: 'bhd-setrow__t', text: 'Reset stats & awards' })]),
      this.resetLabel,
    ]);
    add({ item: { el: this.resetRow, activate: () => this.pressReset(), sound: 'none' }, refresh: () => {} });
    this.firstRow = this.rows[0]!.item.el;

    const done = button('bhd-btn--primary', 'DONE', uiIcon('check'));
    this.hint = el('div', { class: 'bhd-hint bhd-hint--inline' });
    const card = el('div', { class: 'bhd-panel bhd-set__card bhd-enter' }, [
      cardTitle('SETTINGS', uiIcon('sliders')),
      this.list,
      el('div', { class: 'bhd-cardfoot' }, [this.hint, done]),
    ]);
    this.el.append(card);
    this.focus = ctx.createFocus('grid');
    const doneItem: FocusItem = { el: done, activate: () => this.ctx.close(), sound: 'back' };
    this.focus.setRows([...this.rows.map((r) => [r.item]), [doneItem]], this.firstRow);
    this.focus.onChange = (f) => {
      if (f && this.list.contains(f) && typeof f.scrollIntoView === 'function') f.scrollIntoView({ block: 'nearest' });
    };
  }

  enter(from: string): void {
    this.disarm();
    this.refresh();
    if (from !== 'settings') {
      this.focus.focus(this.firstRow);
      this.list.scrollTop = 0;
    }
    this.refreshGlyphs();
  }

  leave(): void {
    this.disarm();
  }

  back(): boolean {
    this.ctx.close();
    return true;
  }

  action(a: MenuAction): boolean {
    if (this.armed && (a === 'up' || a === 'down' || a === 'next' || a === 'prev')) this.disarm();
    return false;
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText('{navigate} Choose / adjust   {back} Done');
  }

  refresh(): void {
    for (const r of this.rows) r.refresh();
  }

  private pressReset(): void {
    if (!this.armed) {
      this.armed = true;
      this.resetRow.classList.add('is-armed');
      this.resetLabel.textContent = 'SURE? PRESS AGAIN';
      this.ctx.sound('denied');
      return;
    }
    this.disarm();
    this.ctx.emit({ type: 'resetStats' });
    this.resetLabel.textContent = 'ALL FRESH!';
    this.resetRow.classList.add('is-done');
    this.ctx.sound('confirm');
    this.ctx.toast('Stats reset — a brand-new start!');
  }

  private disarm(): void {
    this.armed = false;
    this.resetRow.classList.remove('is-armed', 'is-done');
    this.resetLabel.textContent = 'RESET';
  }
}
