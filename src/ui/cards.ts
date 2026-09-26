// Full-screen presentation cards, driven by update(dt) (deterministic) with a wall-clock safety net:
//   ActCardView  — "5:15 AM / ACT I / CHRIS'S EARLY SHIFT / EVERYBODY ELSE IS STILL ASLEEP." with a
//                  ringing alarm clock + flip-clock digits over a mood backdrop (pre-dawn navy + stars,
//                  sunrise peach, morning sky, bright sunshine). ~3.2 s; any confirm / tap skips.
//   BossIntroView — mock-epic fighting-game VERSUS card: the three girls (dramatic!) vs MOM, THE HAIR
//                  INSPECTOR, with a heart-shaped "boss bar" filling up to LOVE: MAX. ~3.4 s. Affectionate.
import type { FamilyLooks } from '../family/types';
import { el, onTap, replay } from './dom';
import { faceSvg, lookOf } from './faces';
import { C, INK, heartSvg, iconSvg, sparkleSvg } from './icons';
import type { ActCard } from './types';

export const ACT_CARD_SECONDS = 3.2;
export const BOSS_SECONDS = 3.5;
const OUT_SECONDS = 0.42;
/** Confirms during the first moments are ignored (the press that started the morning). */
const SKIP_GUARD = 0.3;

const ALARM_SVG = `<svg class="bhd-alarm" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
<g class="bhd-alarm__ring" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"><path d="M10 38l-8-4M8 56H-1M14 22l-6-8M110 38l8-4M112 56h9M106 22l6-8"/></g>
<g class="bhd-alarm__body">
<path d="M22 36a17 17 0 0 1 26-17" fill="${C.sun}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M98 36a17 17 0 0 0-26-17" fill="${C.sun}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M60 12v8" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="60" cy="10" r="5" fill="${C.sun}" stroke="${INK}" stroke-width="4"/>
<path d="M34 104l-8 12M86 104l8 12" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
<circle cx="60" cy="66" r="43" fill="${C.coral}" stroke="${INK}" stroke-width="5.5"/>
<circle cx="60" cy="66" r="33" fill="${C.cream}" stroke="${INK}" stroke-width="4"/>
<g stroke="${INK}" stroke-width="4" stroke-linecap="round"><path d="M60 38v6M60 88v6M32 66h6M82 66h6"/></g>
<path class="bhd-alarm__m" d="M60 66V42" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
<path class="bhd-alarm__h" d="M60 66l14 8" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>
<circle cx="60" cy="66" r="5" fill="${INK}"/>
<path d="M36 50a30 30 0 0 1 12-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".8"/>
</g></svg>`;

/** Deterministic star field for the pre-dawn card: [left%, top%, size px, delay s]. */
const STARS: readonly [number, number, number, number][] = [
  [6, 12, 14, 0.1], [14, 30, 9, 0.9], [22, 8, 11, 0.5], [31, 22, 7, 1.3], [44, 6, 9, 0.2], [52, 16, 13, 1.1], [63, 9, 8, 0.7],
  [71, 27, 10, 0.3], [79, 11, 15, 1.5], [88, 24, 9, 0.6], [94, 8, 11, 1.2], [9, 48, 8, 0.4], [91, 46, 9, 1.0], [4, 72, 10, 0.8],
  [96, 70, 12, 0.2], [17, 88, 9, 1.4], [84, 90, 8, 0.5], [36, 92, 7, 1.1], [60, 94, 9, 0.3], [27, 58, 6, 0.9], [74, 60, 6, 1.6],
];

const CLOUDS: readonly [number, number, number, number][] = [
  [8, 14, 1.1, 0], [70, 8, 0.9, 1], [82, 70, 1.2, 2], [4, 76, 0.8, 3], [40, 88, 0.7, 1.5],
];

const CLOUD_SVG = `<svg viewBox="0 0 120 60" aria-hidden="true" focusable="false"><path d="M20 50a16 16 0 0 1 4-31 22 22 0 0 1 40-8 18 18 0 0 1 30 10 15 15 0 0 1 6 29z" fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round" opacity=".95"/></svg>`;
const MOON_SVG = `<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false"><path d="M38 6a24 24 0 1 0 16 36A20 20 0 0 1 38 6z" fill="#f4f0ff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="24" cy="30" r="3" fill="#d9d2f0"/><circle cx="31" cy="42" r="2" fill="#d9d2f0"/></svg>`;

interface Timed {
  t: number;
  dur: number;
  canSkipAt: number;
  resolve: (() => void) | null;
  safety: ReturnType<typeof setTimeout> | null;
}

abstract class TimedCard {
  readonly el: HTMLElement;
  protected run: Timed | null = null;
  private outing = false;
  /** 0 freezes the card (dev gallery); tests leave it at 1. */
  timeScale = 1;

  constructor(cls: string) {
    this.el = el('div', { class: `bhd-layer ${cls}`, attrs: { hidden: '', 'data-bhd-tap': '' } });
    onTap(this.el, () => this.skip());
  }

  get active(): boolean {
    return this.run !== null;
  }

  protected start(dur: number): Promise<void> {
    this.finish(); // a previous card still up resolves now
    this.outing = false;
    this.el.hidden = false;
    this.el.classList.remove('is-out');
    replay(this.el, 'is-in');
    return new Promise<void>((resolve) => {
      const run: Timed = { t: 0, dur, canSkipAt: SKIP_GUARD, resolve, safety: null };
      this.run = run;
      // Safety net: if nobody pumps update() (tab hidden / game loop stalled) never hang the flow.
      if (typeof setTimeout === 'function') {
        run.safety = setTimeout(
          () => {
            if (this.run === run && this.timeScale > 0) this.finish();
          },
          (dur + OUT_SECONDS + 2.5) * 1000,
        );
      }
    });
  }

  /** Any confirm / tap: jump to the outro. */
  skip(): boolean {
    const r = this.run;
    if (!r) return false;
    if (r.t < r.canSkipAt) return true;
    if (r.t < r.dur) r.t = r.dur;
    return true;
  }

  update(dt: number): void {
    const r = this.run;
    if (!r) return;
    r.t += dt * this.timeScale;
    this.tick(r.t);
    if (!this.outing && r.t >= r.dur) {
      this.outing = true;
      this.el.classList.add('is-out');
    }
    if (r.t >= r.dur + OUT_SECONDS) this.finish();
  }

  protected tick(_t: number): void {}

  protected finish(): void {
    const r = this.run;
    if (!r) return;
    this.run = null;
    if (r.safety !== null) clearTimeout(r.safety);
    this.el.hidden = true;
    this.el.classList.remove('is-in', 'is-out');
    r.resolve?.();
  }

  dispose(): void {
    this.finish();
  }
}

export class ActCardView extends TimedCard {
  private readonly bg: HTMLElement;
  private readonly flip: HTMLElement;
  private readonly actEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly subEl: HTMLElement;
  readonly skipEl: HTMLElement;
  private current: ActCard | null = null;

  constructor() {
    super('bhd-actcard');
    const stars = el('div', { class: 'bhd-actcard__stars' });
    for (const [x, y, s, d] of STARS) {
      const st = el('span', { class: 'bhd-actcard__star', html: sparkleSvg('', '#fff6dc') });
      st.style.cssText = `left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${d}s`;
      stars.appendChild(st);
    }
    const clouds = el('div', { class: 'bhd-actcard__clouds' });
    for (const [x, y, k, d] of CLOUDS) {
      const c = el('span', { class: 'bhd-actcard__cloud', html: CLOUD_SVG });
      c.style.cssText = `left:${x}%;top:${y}%;--k:${k};animation-delay:-${d * 3}s`;
      clouds.appendChild(c);
    }
    this.bg = el('div', { class: 'bhd-actcard__bg', attrs: { 'aria-hidden': 'true' } }, [
      el('div', { class: 'bhd-actcard__rays' }),
      el('div', { class: 'bhd-actcard__sun' }),
      el('div', { class: 'bhd-actcard__moon', html: MOON_SVG }),
      stars,
      clouds,
      el('div', { class: 'bhd-actcard__hills' }),
    ]);
    this.flip = el('div', { class: 'bhd-flip' });
    this.actEl = el('div', { class: 'bhd-actcard__act' });
    this.titleEl = el('h1', { class: 'bhd-actcard__title' });
    this.subEl = el('div', { class: 'bhd-actcard__sub' });
    this.skipEl = el('div', { class: 'bhd-actcard__skip' });
    this.el.append(
      this.bg,
      el('div', { class: 'bhd-actcard__inner' }, [
        el('div', { class: 'bhd-actcard__clock' }, [el('div', { class: 'bhd-actcard__alarm', html: ALARM_SVG }), this.flip]),
        this.actEl,
        this.titleEl,
        this.subEl,
      ]),
      this.skipEl,
    );
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'assertive');
  }

  get card(): ActCard | null {
    return this.run ? this.current : null;
  }

  show(card: ActCard): Promise<void> {
    this.current = card;
    const mood = ['predawn', 'sunrise', 'morning', 'bright'].includes(card.mood) ? card.mood : 'morning';
    this.el.dataset.mood = mood;
    // Flip-clock digits: "5:15 AM" → 5 : 1 5 + AM.
    this.flip.textContent = '';
    const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(card.time.trim());
    if (m) {
      const digits = `${m[1]}:${m[2]}`;
      let i = 0;
      for (const ch of digits) {
        if (ch === ':') {
          this.flip.appendChild(el('span', { class: 'bhd-flip__colon', text: ':' }));
          continue;
        }
        const d = el('span', { class: 'bhd-flip__d' }, [el('span', { class: 'bhd-flip__card', text: ch })]);
        d.style.setProperty('--i', String(i++));
        this.flip.appendChild(d);
      }
      if (m[3]) this.flip.appendChild(el('span', { class: 'bhd-flip__ampm', text: m[3].toUpperCase() }));
      // Point the alarm clock's hands at the card's time.
      const h = Number(m[1]) % 12;
      const mins = Number(m[2]);
      this.el.querySelector('.bhd-alarm__h')?.setAttribute('transform', `rotate(${((h + mins / 60) * 30 - 60).toFixed(1)} 60 66)`);
      this.el.querySelector('.bhd-alarm__m')?.setAttribute('transform', `rotate(${mins * 6} 60 66)`);
    } else {
      this.flip.appendChild(el('span', { class: 'bhd-flip__raw', text: card.time }));
    }
    this.actEl.textContent = card.act;
    this.actEl.hidden = card.act === '';
    this.titleEl.textContent = '';
    this.titleEl.setAttribute('aria-label', card.title);
    const words = card.title.split(' ');
    let n = 0;
    words.forEach((w, wi) => {
      const word = el('span', { class: 'bhd-actcard__word' });
      for (const ch of w) {
        const s = el('span', { class: 'bhd-actcard__ch', text: ch, attrs: { 'aria-hidden': 'true' } });
        s.style.setProperty('--i', String(n++));
        word.appendChild(s);
      }
      this.titleEl.appendChild(word);
      if (wi < words.length - 1) this.titleEl.appendChild(document.createTextNode(' '));
    });
    this.subEl.textContent = card.subtitle;
    this.subEl.hidden = card.subtitle === '';
    return this.start(ACT_CARD_SECONDS);
  }

  setSkipHint(html: string): void {
    this.skipEl.innerHTML = html;
  }
}

export class BossIntroView extends TimedCard {
  private readonly nameEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly girls: HTMLElement;
  private readonly mom: HTMLElement;
  private readonly hearts: HTMLElement[] = [];
  private readonly maxEl: HTMLElement;
  readonly skipEl: HTMLElement;
  private lit = 0;
  looks: FamilyLooks | null = null;

  constructor() {
    super('bhd-boss');
    this.nameEl = el('div', { class: 'bhd-boss__name' });
    this.titleEl = el('div', { class: 'bhd-boss__title' });
    this.girls = el('div', { class: 'bhd-boss__girls' });
    this.mom = el('div', { class: 'bhd-boss__mom' });
    const bar = el('div', { class: 'bhd-boss__hearts' });
    for (let i = 0; i < 10; i++) {
      const h = el('span', { class: 'bhd-boss__heart', html: heartSvg() });
      h.style.setProperty('--i', String(i));
      this.hearts.push(h);
      bar.appendChild(h);
    }
    this.maxEl = el('span', { class: 'bhd-boss__max', text: 'MAX!' });
    this.skipEl = el('div', { class: 'bhd-actcard__skip bhd-boss__skip' });
    this.el.append(
      el('div', { class: 'bhd-boss__bg', attrs: { 'aria-hidden': 'true' } }, [el('div', { class: 'bhd-boss__half bhd-boss__half--l' }), el('div', { class: 'bhd-boss__half bhd-boss__half--r' }), el('div', { class: 'bhd-boss__burst' })]),
      el('div', { class: 'bhd-boss__side bhd-boss__side--l' }, [el('div', { class: 'bhd-boss__label', text: 'CHALLENGERS' }), this.girls, el('div', { class: 'bhd-boss__gulp', text: '*gulp*' })]),
      el('div', { class: 'bhd-boss__vs', text: 'VS' }),
      el('div', { class: 'bhd-boss__side bhd-boss__side--r' }, [
        this.mom,
        el('div', { class: 'bhd-boss__plate' }, [this.nameEl, this.titleEl]),
      ]),
      el('div', { class: 'bhd-boss__bar' }, [el('span', { class: 'bhd-boss__barlabel', text: 'LOVE' }), bar, this.maxEl]),
      el('div', { class: 'bhd-boss__ready', text: 'READY?' }),
      this.skipEl,
    );
    this.el.setAttribute('role', 'dialog');
  }

  show(name: string, title: string): Promise<void> {
    this.nameEl.textContent = name;
    this.titleEl.textContent = title;
    const looks = this.looks;
    this.girls.textContent = '';
    (['addy', 'ellie', 'heidi'] as const).forEach((g, i) => {
      const f = el('div', { class: `bhd-boss__girl bhd-boss__girl--${g}`, html: faceSvg({ who: g, look: lookOf(looks, g), mood: i === 1 ? 'eek' : 'dramatic' }) });
      f.style.setProperty('--i', String(i));
      this.girls.appendChild(f);
    });
    this.mom.innerHTML =
      faceSvg({ who: 'ashley', look: lookOf(looks, 'ashley'), mood: 'proud' }) +
      `<span class="bhd-boss__sparkle">${sparkleSvg('', C.sun)}</span><span class="bhd-boss__prop">${iconSvg('eye')}</span>`;
    this.lit = 0;
    for (const h of this.hearts) h.classList.remove('is-on');
    this.maxEl.classList.remove('is-on');
    return this.start(BOSS_SECONDS);
  }

  /** Hearts lit so far (tests). */
  get heartsLit(): number {
    return this.lit;
  }

  protected override tick(t: number): void {
    // The boss bar fills from 1.1 s to 2.3 s.
    const want = Math.max(0, Math.min(10, Math.floor(((t - 1.1) / 1.2) * 10 + 0.0001)));
    while (this.lit < want) {
      this.hearts[this.lit]?.classList.add('is-on');
      this.lit++;
    }
    if (this.lit >= 10 && !this.maxEl.classList.contains('is-on')) this.maxEl.classList.add('is-on');
  }

  override skip(): boolean {
    const r = this.run;
    if (r && r.t >= r.canSkipAt) {
      this.tick(99);
    }
    return super.skip();
  }

  setSkipHint(html: string): void {
    this.skipEl.innerHTML = html;
  }
}
