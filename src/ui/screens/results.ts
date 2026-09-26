// RESULTS — the MORNING REPORT CARD: a school report on a clipboard. Arrival time big with a rubber
// stamp, one row per activity with stars popping in (0 = "skipped", said kindly), total stars counting
// up, the grade circled in teacher's ink, 2–4 award stickers slapped on, the tagline, PLAY AGAIN / MENU.
// The reveal is a dt-driven timeline (deterministic for tests); confirm / tap skips straight to the end.
import type { MenuAction } from '../../input/types';
import type { ActivityRecord, MorningReport } from '../../plan/types';
import { button, el, setText } from '../dom';
import type { FocusGroup } from '../focus';
import { ACTIVITY_ICON, arrivalStamp, formatClock, formatDuration, skippedLine } from '../format';
import { iconSvg, isIconId, sparkleSvg, starSvg, uiIcon } from '../icons';
import { sticker } from '../widgets';
import type { Screen, UiCtx } from './screen';
import { screenEl } from './screen';

export const RESULTS_TAGLINE = 'Somehow, everybody makes it out the door.';

interface Step {
  t: number;
  run: () => void;
}

const CLIP_SVG = `<svg class="bhd-rc__clipsvg" viewBox="0 0 160 60" aria-hidden="true" focusable="false">
<rect x="22" y="22" width="116" height="34" rx="10" fill="#c8ced4" stroke="#3a2330" stroke-width="4"/>
<rect x="48" y="4" width="64" height="30" rx="12" fill="#e6eaee" stroke="#3a2330" stroke-width="4"/>
<rect x="62" y="12" width="36" height="12" rx="6" fill="#aeb8c2" stroke="#3a2330" stroke-width="3"/>
<path d="M34 34h92" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>
</svg>`;

const CIRCLE_SVG = `<svg class="bhd-rc__circle" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path pathLength="100" d="M40 70C20 40 70 12 150 10c80-2 140 18 138 48-2 34-80 48-150 46C60 102 12 86 22 52 30 26 90 14 120 14" fill="none" stroke="#ff7a6b" stroke-width="5" stroke-linecap="round"/></svg>`;

export class ResultsScreen implements Screen {
  readonly id = 'results' as const;
  readonly el: HTMLElement;
  readonly focus: FocusGroup;
  private readonly paper: HTMLElement;
  private readonly again: HTMLButtonElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly hint: HTMLElement;
  private steps: Step[] = [];
  private t = 0;
  private done = true;
  private totalEl: HTMLElement | null = null;
  private totalFrom = 0;
  private totalTo = 0;
  private totalT = -1;
  private rendered: MorningReport | null = null;
  private skipping = false;

  constructor(private readonly ctx: UiCtx) {
    this.el = screenEl('results', 'bhd-screen--dim');
    this.paper = el('div', { class: 'bhd-rc__paper' });
    this.again = button('bhd-btn--primary bhd-btn--lg', 'PLAY AGAIN', uiIcon('sunrise'));
    this.menuBtn = button('', 'MENU', uiIcon('home'));
    this.hint = el('div', { class: 'bhd-hint bhd-hint--inline bhd-rc__hint' });
    const board = el('div', { class: 'bhd-rc bhd-enter-up' }, [
      el('div', { class: 'bhd-rc__clip', html: CLIP_SVG }),
      this.paper,
      el('div', { class: 'bhd-rc__btns' }, [this.menuBtn, this.again]),
      this.hint,
    ]);
    this.el.append(board);
    this.focus = ctx.createFocus();
    this.focus.setRows(
      [
        [
          { el: this.menuBtn, activate: () => this.ctx.emit({ type: 'toMenu' }), sound: 'back' },
          { el: this.again, activate: () => this.ctx.emit({ type: 'playAgain' }) },
        ],
      ],
      this.again,
    );
    // A click on PLAY AGAIN / MENU acts at once (finishing the reveal first); only confirm / any key /
    // background clicks merely skip the reveal.
    this.focus.gate = () => {
      if (!this.done) this.skip();
      return true;
    };
    this.el.addEventListener('click', (e) => {
      if (e.detail !== 0 && !this.done) this.skip();
    });
  }

  /** Is the reveal still running (tests)? */
  get revealing(): boolean {
    return !this.done;
  }

  enter(): void {
    this.build(this.ctx.report);
    this.focus.focus(this.again);
    this.refreshGlyphs();
  }

  refresh(): void {
    if (this.ctx.report !== this.rendered) this.enter();
  }

  refreshGlyphs(): void {
    this.hint.innerHTML = this.ctx.device === 'touch' ? '' : this.ctx.glyphText(this.done ? '{navigate} Choose   {confirm} Select' : '{confirm} Skip');
  }

  action(a: MenuAction): boolean {
    if (!this.done && (a === 'confirm' || a === 'back' || a === 'pause')) {
      this.skip();
      return true;
    }
    if (a === 'up' || a === 'down') {
      // The paper scrolls on short screens (phones on their side).
      const dy = a === 'up' ? -90 : 90;
      if (typeof this.paper.scrollBy === 'function') this.paper.scrollBy({ top: dy, behavior: 'smooth' });
      else this.paper.scrollTop += dy;
      return true;
    }
    return false;
  }

  back(): boolean {
    return false;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt * (this.ctx.reducedMotion() ? 2.5 : 1);
    while (this.steps.length > 0 && this.steps[0]!.t <= this.t) this.steps.shift()!.run();
    this.tickTotal();
    if (this.steps.length === 0 && this.totalT < 0) this.finish();
  }

  /** Jump to the end of the reveal. */
  skip(): void {
    if (this.done) return;
    this.paper.classList.add('is-instant');
    this.skipping = true;
    while (this.steps.length > 0) this.steps.shift()!.run();
    this.skipping = false;
    this.totalT = -1;
    if (this.totalEl) setText(this.totalEl, String(this.totalTo));
    this.finish();
  }

  private finish(): void {
    this.done = true;
    this.el.classList.add('is-done');
    this.refreshGlyphs();
  }

  private tickTotal(): void {
    if (this.totalT < 0 || !this.totalEl) return;
    this.totalT = Math.min(1, this.totalT + 1 / 50);
    const k = 1 - Math.pow(1 - this.totalT, 3);
    setText(this.totalEl, String(Math.round(this.totalFrom + (this.totalTo - this.totalFrom) * k)));
    if (this.totalT >= 1) this.totalT = -1;
  }

  private build(report: MorningReport | null): void {
    this.rendered = report;
    this.paper.textContent = '';
    this.paper.classList.remove('is-instant');
    this.el.classList.remove('is-done');
    this.steps = [];
    this.t = 0;
    this.done = false;
    this.totalT = -1;
    if (!report) {
      this.paper.appendChild(el('div', { class: 'bhd-rc__empty', text: 'No report yet — go have a morning!' }));
      this.finish();
      return;
    }
    const at = (t: number, run: () => void): void => {
      this.steps.push({ t, run });
    };
    const show = (node: HTMLElement): void => {
      node.classList.add('is-in');
      // Keep the newest line of the reveal in view when the paper scrolls (short screens).
      if (!this.skipping && this.paper.scrollHeight > this.paper.clientHeight + 4 && typeof node.scrollIntoView === 'function') {
        node.scrollIntoView({ block: 'nearest', behavior: this.ctx.reducedMotion() ? 'auto' : 'smooth' });
      }
    };

    // ── header ──
    const meta = report.daily && report.dateKey ? `DAILY MORNING · ${report.dateKey}` : `MORNING No. ${String(Math.abs(Math.floor(report.seed)) % 100000).padStart(5, '0')}`;
    const header = el('div', { class: 'bhd-rc__head' }, [
      el('div', { class: 'bhd-rc__school', text: 'MORNING REPORT CARD' }),
      el('div', { class: 'bhd-rc__meta' }, [el('span', { text: meta }), el('span', { class: 'bhd-rc__dot', text: '•' }), el('span', { text: `Played in ${formatDuration(report.playSeconds)}` })]),
    ]);

    // ── arrival ──
    const stamp = arrivalStamp(report);
    const stampEl = el('div', { class: `bhd-stamp bhd-stamp--${stamp.tone}` }, [el('span', { text: stamp.text })]);
    const arrival = el('div', { class: 'bhd-rc__arrival' }, [
      el('div', { class: 'bhd-rc__label', text: 'ARRIVED AT SCHOOL' }),
      // Time + stamp share a wrapping row: the stamp can never sit on top of the "AM".
      el('div', { class: 'bhd-rc__timerow' }, [
        el('div', { class: 'bhd-rc__time' }, [el('span', { class: 'bhd-rc__timeico', html: iconSvg('school') }), el('span', { text: formatClock(report.arrival) })]),
        stampEl,
      ]),
    ]);

    // ── grade ──
    this.totalFrom = 0;
    this.totalTo = Math.max(0, Math.floor(report.totalStars));
    const totalNum = el('span', { class: 'bhd-rc__totaln', text: '0' });
    this.totalEl = totalNum;
    const total = el('div', { class: 'bhd-rc__total' }, [
      el('span', { class: 'bhd-rc__totalstar', html: starSvg('is-on') }),
      totalNum,
      el('span', { class: 'bhd-rc__totalmax', text: `/ ${Math.max(0, Math.floor(report.maxStars))}` }),
    ]);
    const grade = el('div', { class: 'bhd-rc__grade' }, [
      el('div', { class: 'bhd-rc__label', text: 'THIS MORNING WAS…' }),
      el('div', { class: 'bhd-rc__gradebox' }, [el('span', { class: 'bhd-rc__gradet', text: report.grade.title }), el('span', { class: 'bhd-rc__circlewrap', html: CIRCLE_SVG })]),
      el('div', { class: 'bhd-rc__blurb', text: report.grade.blurb }),
    ]);

    // ── activity rows ──
    const rowsEl = el('div', { class: 'bhd-rc__rows' });
    const rowNodes: { row: HTMLElement; stars: HTMLElement[]; rec: ActivityRecord }[] = [];
    for (const rec of report.records) {
      const stars: HTMLElement[] = [];
      let right: HTMLElement;
      if (rec.stars === 0) {
        right = el('span', { class: 'bhd-rc__skip' }, [el('span', { class: 'bhd-tag bhd-tag--soft', text: 'SKIPPED' }), el('span', { class: 'bhd-rc__skipt', text: skippedLine(rec.id) })]);
      } else {
        right = el('span', { class: 'bhd-rc__stars', attrs: { role: 'img', 'aria-label': `${rec.stars} of 3 stars` } });
        for (let i = 0; i < 3; i++) {
          const s = el('span', { class: 'bhd-rc__star', html: starSvg() });
          if (i < rec.stars) s.dataset.earned = '1';
          stars.push(s);
          right.appendChild(s);
        }
      }
      const row = el('div', { class: `bhd-rc__row${rec.stars === 0 ? ' is-skipped' : ''}` }, [
        el('span', { class: 'bhd-rc__rowico', html: iconSvg(ACTIVITY_ICON[rec.id] ?? 'star') }),
        el('span', { class: 'bhd-rc__rowt', text: rec.label }),
        el('span', { class: 'bhd-rc__lead', attrs: { 'aria-hidden': 'true' } }),
        right,
      ]);
      rowNodes.push({ row, stars, rec });
      rowsEl.appendChild(row);
    }

    // ── awards ──
    const awards = el('div', { class: 'bhd-rc__awards' });
    const stickerEls: HTMLElement[] = [];
    const tilts = [-7, 5, -3, 8];
    report.awards.slice(0, 4).forEach((a, i) => {
      const s = sticker(isIconId(a.icon) ? a.icon : 'star', a.title, a.blurb, tilts[i % tilts.length]!);
      stickerEls.push(s);
      awards.appendChild(s);
    });

    const tag = el('div', { class: 'bhd-rc__tag' }, [el('span', { html: sparkleSvg('', '#ffc94a') }), el('span', { text: RESULTS_TAGLINE }), el('span', { html: sparkleSvg('', '#ff7a6b') })]);

    const left = el('div', { class: 'bhd-rc__left' }, [arrival, grade, total]);
    const right = el('div', { class: 'bhd-rc__right' }, [el('div', { class: 'bhd-rc__label', text: 'TODAY’S JOBS' }), rowsEl]);
    const awardsWrap = el('div', { class: 'bhd-rc__awardswrap' }, [el('div', { class: 'bhd-rc__label', text: 'AWARDS' }), awards]);
    this.paper.append(header, el('div', { class: 'bhd-rc__cols' }, [left, right]), awardsWrap, tag);
    if (report.awards.length === 0) awardsWrap.hidden = true;

    // ── timeline ──
    let t = 0.35;
    at(t, () => show(arrival));
    t += 0.45;
    at(t, () => {
      show(stampEl);
      this.beep('confirm');
    });
    t += 0.35;
    for (const r of rowNodes) {
      at(t, () => show(r.row));
      t += 0.12;
      r.stars.forEach((s, i) => {
        at(t + i * 0.09, () => {
          if (s.dataset.earned) s.classList.add('is-on');
          s.classList.add('is-in');
        });
      });
      t += 0.2;
    }
    at(t, () => {
      show(total);
      this.totalT = 0;
    });
    t += 0.7;
    at(t, () => {
      show(grade);
      this.beep('open');
    });
    t += 0.5;
    stickerEls.forEach((s) => {
      at(t, () => {
        show(s);
        this.beep('toggle');
      });
      t += 0.32;
    });
    at(t + 0.1, () => show(tag));
  }

  private beep(kind: 'confirm' | 'open' | 'toggle'): void {
    if (!this.skipping) this.ctx.sound(kind);
  }

  /** Earned stars currently lit (tests). */
  get litStars(): number {
    return this.paper.querySelectorAll('.bhd-rc__star.is-on').length;
  }
}
