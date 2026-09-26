// The WAKE-UP SONG beat track (ACT II burrito wake-up): a small cream panel in the activity layer — four notes slide
// to a hit ring; PRIMARY / tap / click on each beat. Pure DOM (kit classes + a few scoped styles), no framework.
// Drives nothing by itself: the activity owns the BeatPhrase and calls render() every frame.
import type { BeatPhrase, Grade } from './logic';

const CSS = `
/* centred with auto margins: the kit's .bhd-pop animation owns transform */
.bhd-wk-song{position:absolute;left:0;right:0;margin:0 auto;bottom:calc(15vh + var(--bhd-safe-b));
  width:min(540px,84vw);padding:10px 16px 12px;display:flex;flex-direction:column;align-items:center;gap:7px;
  touch-action:manipulation;cursor:pointer}
/* touch: the joystick is hidden during the song → dock bottom-left, clear of the big SING button */
.bhd-ui[data-device='touch'] .bhd-wk-song{right:auto;margin:0;left:calc(12px + var(--bhd-safe-l));bottom:calc(10px + var(--bhd-safe-b));
  width:min(470px,58vw);padding:7px 12px 9px;gap:5px}
.bhd-wk-song__head{display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap}
.bhd-wk-song__title{font-family:var(--bhd-font-display);font-size:var(--bhd-fs-3);letter-spacing:.04em;color:var(--bhd-plum)}
.bhd-wk-song__try{font-size:var(--bhd-fs-0)}
.bhd-wk-lane{position:relative;width:100%;height:58px;border:var(--bhd-bw) solid var(--bhd-plum);border-radius:999px;
  background:linear-gradient(90deg,#fff1cc 0%,#ffe9f1 55%,#eaf3ff 100%);overflow:hidden}
.bhd-ui[data-device='touch'] .bhd-wk-lane{height:48px}
.bhd-wk-lane::after{content:'';position:absolute;left:14%;right:3%;top:50%;height:4px;margin-top:-2px;border-radius:2px;
  background:repeating-linear-gradient(90deg,rgba(58,35,48,.18) 0 10px,transparent 10px 20px)}
.bhd-wk-hit{position:absolute;left:14%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;
  border:4px dashed var(--bhd-plum);background:rgba(255,201,74,.45);z-index:1}
.bhd-ui[data-device='touch'] .bhd-wk-hit{width:38px;height:38px;margin:-19px 0 0 -19px}
.bhd-wk-hit.is-flash{animation:bhd-wk-flash .28s ease-out}
.bhd-wk-hit.is-tick{animation:bhd-wk-tick .22s ease-out}
@keyframes bhd-wk-flash{0%{transform:scale(1.35);background:var(--bhd-sunshine)}100%{transform:scale(1)}}
@keyframes bhd-wk-tick{0%{transform:scale(1.15)}100%{transform:scale(1)}}
.bhd-wk-note{position:absolute;top:50%;left:0;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;
  border:3px solid var(--bhd-plum);background:var(--wk-c,#b79cf5);box-shadow:0 3px 0 var(--bhd-plum);z-index:2;
  display:grid;place-items:center;font:400 22px/1 var(--bhd-font-display);color:#fff;
  -webkit-text-stroke:1.5px var(--bhd-plum);paint-order:stroke fill;visibility:hidden;transform:translateX(var(--x,0px))}
.bhd-ui[data-device='touch'] .bhd-wk-note{width:34px;height:34px;margin:-17px 0 0 -17px;font-size:18px}
.bhd-wk-note.is-hit{animation:bhd-wk-pop .3s ease-out forwards}
.bhd-wk-note.is-miss{filter:grayscale(1);opacity:.4}
@keyframes bhd-wk-pop{0%{transform:translateX(var(--x,0px)) scale(1.1)}100%{transform:translateX(var(--x,0px)) scale(1.9);opacity:0}}
.bhd-wk-judge{position:absolute;left:14%;top:2px;transform:translateX(-50%);z-index:3;pointer-events:none;
  font:400 var(--bhd-fs-2)/1 var(--bhd-font-display);color:var(--bhd-cream);-webkit-text-stroke:.16em var(--bhd-plum);
  paint-order:stroke fill;opacity:0;white-space:nowrap}
.bhd-wk-judge.is-on{animation:bhd-wk-judge .7s ease-out}
@keyframes bhd-wk-judge{0%{opacity:0;transform:translate(-50%,6px) scale(.8)}20%{opacity:1;transform:translate(-50%,-2px) scale(1.1)}
  100%{opacity:0;transform:translate(-50%,-8px) scale(1)}}
.bhd-wk-row{display:flex;align-items:center;gap:12px;justify-content:center;flex-wrap:wrap}
.bhd-wk-dots{display:flex;gap:7px}
.bhd-wk-dot{width:15px;height:15px;border-radius:50%;border:2.5px solid var(--bhd-plum);background:var(--bhd-cream-2)}
.bhd-wk-dot.is-perfect{background:var(--bhd-sunshine)}
.bhd-wk-dot.is-good{background:var(--bhd-mint)}
.bhd-wk-dot.is-miss{background:#dccdd3}
.bhd-wk-msg{font-size:var(--bhd-fs-1);color:var(--bhd-ink-soft);min-height:1.2em;text-align:center}
.bhd-ui[data-device='touch'] .bhd-wk-song .bhd-glyph{display:none}
`;

const JUDGE: Record<Grade, string> = { perfect: 'PERFECT!', good: 'GOOD!', miss: 'oops' };

export class SongView {
  readonly el: HTMLElement;
  private readonly notes: HTMLElement[] = [];
  private readonly dots: HTMLElement[] = [];
  private readonly hit: HTMLElement;
  private readonly judge: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly tryEl: HTMLElement;
  private readonly lane: HTMLElement;
  private taps = 0;
  private laneW = 0;
  private measureIn = 0;
  private readonly onDown = (e: Event): void => {
    e.preventDefault();
    this.taps++;
  };

  constructor(layer: HTMLElement, color: string, name: string, noteCount: number) {
    const style = document.createElement('style');
    style.textContent = CSS;
    const root = document.createElement('div');
    root.className = 'bhd-panel bhd-panel--sm bhd-wk-song bhd-pop';
    root.setAttribute('data-bhd-tap', '');
    root.style.setProperty('--wk-c', color);
    root.appendChild(style);

    const head = div('bhd-wk-song__head');
    const title = div('bhd-wk-song__title');
    title.textContent = `WAKE-UP SONG`;
    const tag = document.createElement('span');
    tag.className = 'bhd-tag bhd-tag--lilac';
    tag.textContent = `for ${name}`;
    this.tryEl = document.createElement('span');
    this.tryEl.className = 'bhd-tag bhd-tag--soft bhd-wk-song__try';
    head.append(title, tag, this.tryEl);

    this.lane = div('bhd-wk-lane');
    this.hit = div('bhd-wk-hit');
    this.judge = div('bhd-wk-judge');
    this.lane.append(this.hit, this.judge);
    for (let i = 0; i < noteCount; i++) {
      const n = div('bhd-wk-note');
      n.textContent = i % 2 === 0 ? '♪' : '♫';
      this.lane.appendChild(n);
      this.notes.push(n);
    }

    const row = div('bhd-wk-row');
    const dots = div('bhd-wk-dots');
    for (let i = 0; i < noteCount; i++) {
      const d = div('bhd-wk-dot');
      dots.appendChild(d);
      this.dots.push(d);
    }
    const glyph = document.createElement('span');
    glyph.className = 'bhd-glyph';
    glyph.setAttribute('data-slot', 'primary');
    glyph.textContent = 'on each beat';
    row.append(glyph, dots);
    this.msg = div('bhd-wk-msg');
    this.msg.textContent = 'Tap on the beat!';

    root.append(head, this.lane, row, this.msg);
    root.addEventListener('pointerdown', this.onDown);
    layer.appendChild(root);
    this.el = root;
  }

  /** Taps/clicks on the panel since the last call. */
  takeTaps(): number {
    const n = this.taps;
    this.taps = 0;
    return n;
  }

  setTry(n: number, max: number): void {
    this.tryEl.textContent = `try ${n}/${max}`;
  }

  message(text: string): void {
    this.msg.textContent = text;
  }

  /** New phrase: reset notes + dots. */
  reset(): void {
    for (const n of this.notes) {
      n.classList.remove('is-hit', 'is-miss');
      n.style.visibility = 'hidden';
    }
    for (const d of this.dots) d.className = 'bhd-wk-dot';
  }

  /** Per frame: slide the notes. */
  render(phrase: BeatPhrase, dt: number): void {
    this.measureIn -= dt;
    if (this.laneW <= 0 || this.measureIn <= 0) {
      this.laneW = this.lane.clientWidth || 400;
      this.measureIn = 0.5;
    }
    const hitX = this.laneW * 0.14;
    const span = this.laneW * 0.97 - hitX;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      const g = phrase.grades[i];
      if (g === 'perfect' || g === 'good') continue; // popping (CSS)
      const s = phrase.slide(i);
      if (s > 1.02 || s < -0.6) {
        if (n.style.visibility !== 'hidden') n.style.visibility = 'hidden';
        continue;
      }
      if (n.style.visibility !== 'visible') n.style.visibility = 'visible';
      n.style.setProperty('--x', `${(hitX + s * span).toFixed(1)}px`);
    }
  }

  /** A judged note. */
  judged(i: number, grade: Grade): void {
    const d = this.dots[i];
    if (d) d.className = `bhd-wk-dot is-${grade}`;
    const n = this.notes[i];
    if (n) n.classList.add(grade === 'miss' ? 'is-miss' : 'is-hit');
    if (grade !== 'miss') {
      replay(this.hit, 'is-flash');
      this.judge.textContent = JUDGE[grade];
      replay(this.judge, 'is-on');
    }
  }

  /** Count-in tick pulse. */
  tick(): void {
    replay(this.hit, 'is-tick');
  }

  close(): void {
    this.el.removeEventListener('pointerdown', this.onDown);
    this.el.remove();
  }
}

function div(cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
