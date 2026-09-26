// The gameplay HUD (top band, safe-area aware): a chunky alarm-clock widget (analog face + digital
// readout, blinks while the clock is held "5:59 … 5:59 …") with the act label, the morning's to-do
// list (icons, check-off animation, stars), the current objective, meters, and the touch pause button.
// setHud() is DIFFED: identical input touches nothing in the DOM (cheap to call every frame).
import { clockParts } from './format';
import { el, onTap, replay, safeColor, setClass, setData, setHidden, setText, setVar } from './dom';
import { C, INK, iconSvg, starSvg, uiIcon } from './icons';
import type { HudState, IconId, Meter, TaskItem } from './types';

const CLOCK_SVG = `<svg class="bhd-clock__svg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
<path d="M10 17a9 9 0 0 1 14-9" fill="${C.sun}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M54 17a9 9 0 0 0-14-9" fill="${C.sun}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
<path d="M17 55l-4 6M47 55l4 6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
<circle cx="32" cy="35" r="23" fill="${C.coral}" stroke="${INK}" stroke-width="3.4"/>
<circle cx="32" cy="35" r="17" fill="${C.cream}" stroke="${INK}" stroke-width="2.6"/>
<g stroke="${INK}" stroke-width="2.4" stroke-linecap="round"><path d="M32 20.5v3M32 46.5v3M17.5 35h3M43.5 35h3"/></g>
<g class="bhd-clock__hh"><path d="M32 35V26" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/></g>
<g class="bhd-clock__mh"><path d="M32 35V21.5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/></g>
<circle cx="32" cy="35" r="2.6" fill="${INK}"/>
<rect x="28" y="7.5" width="8" height="5" rx="1.6" fill="${C.sun}" stroke="${INK}" stroke-width="2.4"/>
</svg>`;

const BOX_SVG = `<svg class="bhd-task__boxsvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="bhd-task__sq" d="M4.5 5.2c4.6-.8 10-.9 15 .2.7 4.6.6 9.4-.2 14.2-4.8.7-9.8.6-14.6-.1-.7-4.6-.9-9.5-.2-14.3z"/><path class="bhd-task__tick" pathLength="1" d="M6.5 12.5l4 4.2L19 6.5"/></svg>`;

interface TaskNode {
  li: HTMLElement;
  ico: HTMLElement;
  label: HTMLElement;
  stars: HTMLElement;
  state: TaskItem['state'] | '';
  icon: IconId | '';
  text: string;
  starN: number;
}

interface MeterNode {
  root: HTMLElement;
  label: HTMLElement;
  ico: HTMLElement;
  fill: HTMLElement;
  text: string;
  icon: IconId | '';
  value: number;
  color: string;
}

export class Hud {
  readonly el: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly hh: SVGGElement;
  private readonly mh: SVGGElement;
  private readonly timeEl: HTMLElement;
  private readonly ampmEl: HTMLElement;
  private readonly actEl: HTMLElement;
  private readonly tasksEl: HTMLElement;
  private readonly taskList: HTMLElement;
  private readonly taskCount: HTMLElement;
  private readonly objEl: HTMLElement;
  private readonly objText: HTMLElement;
  private readonly metersEl: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly tasks = new Map<string, TaskNode>();
  private readonly meters = new Map<string, MeterNode>();
  private taskKey = '';
  private meterKey = '';
  private shown = false;
  private minute = -1;
  private blink = false;
  private act = '\u0000';
  private obj = '\u0000';
  private pause = false;

  constructor(onPause: () => void) {
    this.timeEl = el('span', { class: 'bhd-clock__time' });
    this.ampmEl = el('span', { class: 'bhd-clock__ampm' });
    this.actEl = el('div', { class: 'bhd-clock__act' });
    this.clock = el('div', { class: 'bhd-clock', attrs: { role: 'timer', 'aria-live': 'off' } }, [
      el('div', { class: 'bhd-clock__analog', html: CLOCK_SVG }),
      el('div', { class: 'bhd-clock__read' }, [el('div', { class: 'bhd-clock__digits' }, [this.timeEl, this.ampmEl]), this.actEl]),
    ]);
    this.hh = this.clock.querySelector('.bhd-clock__hh') as SVGGElement;
    this.mh = this.clock.querySelector('.bhd-clock__mh') as SVGGElement;
    this.taskCount = el('span', { class: 'bhd-tasks__count' });
    this.taskList = el('ul', { class: 'bhd-tasks__list' });
    this.tasksEl = el('div', { class: 'bhd-tasks bhd-panel bhd-panel--sm', attrs: { hidden: '' } }, [
      el('div', { class: 'bhd-tasks__head' }, [el('span', { class: 'bhd-tasks__title', text: 'TO-DO' }), this.taskCount]),
      this.taskList,
    ]);
    this.objText = el('span', { class: 'bhd-obj__t' });
    this.objEl = el('div', { class: 'bhd-obj', attrs: { hidden: '' } }, [el('span', { class: 'bhd-obj__arrow', html: uiIcon('next') }), this.objText]);
    this.metersEl = el('div', { class: 'bhd-meters', attrs: { hidden: '' } });
    this.pauseBtn = el('button', { class: 'bhd-iconbtn bhd-pausebtn', html: uiIcon('pause'), attrs: { type: 'button', tabindex: '-1', 'aria-label': 'Pause', hidden: '', 'data-bhd-tap': '' } });
    onTap(this.pauseBtn, () => onPause());
    this.el = el('div', { class: 'bhd-hud', attrs: { hidden: '' } }, [
      el('div', { class: 'bhd-hud__tl' }, [this.clock, this.tasksEl, this.objEl]),
      el('div', { class: 'bhd-hud__tr' }, [this.pauseBtn, this.metersEl]),
    ]);
  }

  get visible(): boolean {
    return this.shown;
  }

  set(h: HudState | null): void {
    if (!h) {
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
    // Clock (changes once per game minute).
    const minute = Number.isFinite(h.clock) ? Math.floor(h.clock) : 0;
    if (minute !== this.minute) {
      this.minute = minute;
      const p = clockParts(minute);
      setText(this.timeEl, `${p.h}:${p.mm}`);
      setText(this.ampmEl, p.ampm);
      this.hh.setAttribute('transform', `rotate(${p.hourDeg.toFixed(1)} 32 35)`);
      this.mh.setAttribute('transform', `rotate(${p.minDeg} 32 35)`);
    }
    const blink = h.clockBlink === true;
    if (blink !== this.blink) {
      this.blink = blink;
      setClass(this.clock, 'is-blink', blink);
    }
    const act = h.actLabel ?? '';
    if (act !== this.act) {
      this.act = act;
      setText(this.actEl, act);
      setHidden(this.actEl, act === '');
    }
    this.setTasks(h.tasks);
    const obj = h.objective ?? '';
    if (obj !== this.obj) {
      this.obj = obj;
      setText(this.objText, obj);
      setHidden(this.objEl, obj === '');
      if (obj !== '') replay(this.objEl, 'is-new');
    }
    this.setMeters(h.meters);
    const pause = h.pauseButton === true;
    if (pause !== this.pause) {
      this.pause = pause;
      setHidden(this.pauseBtn, !pause);
    }
  }

  private setTasks(tasks: readonly TaskItem[] | undefined): void {
    const list = tasks ?? [];
    let key = '';
    for (const t of list) key += t.id + '\u0001';
    if (key !== this.taskKey) {
      this.taskKey = key;
      // The set/order of tasks changed: rebuild (rare — once per act).
      this.tasks.clear();
      this.taskList.textContent = '';
      for (const t of list) {
        const node = this.makeTask();
        this.tasks.set(t.id, node);
        this.taskList.appendChild(node.li);
      }
      setHidden(this.tasksEl, list.length === 0);
    }
    let done = 0;
    for (const t of list) {
      const n = this.tasks.get(t.id);
      if (!n) continue;
      if (t.state === 'done') done++;
      if (t.label !== n.text) {
        n.text = t.label;
        setText(n.label, t.label);
      }
      if (t.icon !== n.icon) {
        n.icon = t.icon;
        n.ico.innerHTML = iconSvg(t.icon);
      }
      if (t.state !== n.state) {
        const prev = n.state;
        n.state = t.state;
        setData(n.li, 'state', t.state);
        if (t.state === 'done' && prev !== '' && prev !== 'done') replay(n.li, 'is-justdone');
        if (t.state === 'active' && prev !== '') replay(n.li, 'is-justactive');
      }
      const stars = t.state === 'done' ? Math.max(0, Math.min(3, Math.floor(t.stars ?? 0))) : 0;
      if (stars !== n.starN) {
        n.starN = stars;
        n.stars.textContent = '';
        for (let i = 0; i < stars; i++) {
          const s = el('span', { class: 'bhd-task__star', html: starSvg('is-on') });
          s.style.setProperty('--i', String(i));
          n.stars.appendChild(s);
        }
      }
    }
    if (list.length > 0) setText(this.taskCount, `${done}/${list.length}`);
  }

  private makeTask(): TaskNode {
    const ico = el('span', { class: 'bhd-task__ico' });
    const label = el('span', { class: 'bhd-task__t' });
    const stars = el('span', { class: 'bhd-task__stars' });
    const li = el('li', { class: 'bhd-task' }, [el('span', { class: 'bhd-task__box', html: BOX_SVG }), ico, label, stars]);
    return { li, ico, label, stars, state: '', icon: '', text: '\u0000', starN: 0 };
  }

  private setMeters(meters: readonly Meter[] | undefined): void {
    const list = meters ?? [];
    let key = '';
    for (const m of list) key += m.id + '\u0001';
    if (key !== this.meterKey) {
      this.meterKey = key;
      this.meters.clear();
      this.metersEl.textContent = '';
      for (const m of list) {
        const node = this.makeMeter();
        this.meters.set(m.id, node);
        this.metersEl.appendChild(node.root);
      }
      setHidden(this.metersEl, list.length === 0);
    }
    for (const m of list) {
      const n = this.meters.get(m.id);
      if (!n) continue;
      if (m.label !== n.text) {
        n.text = m.label;
        setText(n.label, m.label);
      }
      const icon = m.icon ?? '';
      if (icon !== n.icon) {
        n.icon = icon;
        n.ico.innerHTML = icon ? iconSvg(icon) : '';
        setHidden(n.ico, icon === '');
      }
      const v = Number.isFinite(m.value) ? Math.round(Math.max(0, Math.min(1, m.value)) * 1000) / 1000 : 0;
      if (v !== n.value) {
        n.value = v;
        setVar(n.root, '--value', String(v));
      }
      const color = safeColor(m.color, 'var(--bhd-mint)');
      if (color !== n.color) {
        n.color = color;
        setVar(n.root, '--color', color);
      }
    }
  }

  private makeMeter(): MeterNode {
    const label = el('span', { class: 'bhd-hmeter__t' });
    const ico = el('span', { class: 'bhd-hmeter__ico', attrs: { hidden: '' } });
    const fill = el('span', { class: 'bhd-meter__fill' });
    const root = el('div', { class: 'bhd-hmeter bhd-panel bhd-panel--sm' }, [el('div', { class: 'bhd-hmeter__head' }, [ico, label]), el('div', { class: 'bhd-meter' }, [fill])]);
    return { root, label, ico, fill, text: '\u0000', icon: '', value: -1, color: '' };
  }
}
