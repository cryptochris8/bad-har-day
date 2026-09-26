// World-anchored speech bubbles: projected through the Projector every update(), a tail pointing at
// the anchor (the box slides to stay on screen, the tail stays on the speaker), the speaker's colour
// accent + name tag, words popping in one by one. Styles: say · think (cloud) · shout (spiky burst) ·
// whisper (dashed, small) · sing (notes). Pooled DOM nodes; transforms written only on change.
import type { MemberId } from '../family/types';
import { DISPLAY_NAME } from '../family/types';
import type { Projector, Vec3Like } from '../render/types';
import { el, replay } from './dom';
import { bubbleSeconds } from './format';
import { iconSvg } from './icons';
import type { BubbleHandle, BubbleOpts } from './types';

export const MAX_BUBBLES = 8;
const OUT_TIME = 0.22;
/** Keep bubbles below the HUD band. */
const TOP_LIMIT = 70;
const EDGE = 8;

type Style = NonNullable<BubbleOpts['style']>;
type Speaker = NonNullable<BubbleOpts['speaker']>;

interface Node {
  wrap: HTMLElement;
  box: HTMLElement;
  text: HTMLElement;
  tag: HTMLElement;
  busy: boolean;
  gen: number;
  age: number;
  life: number;
  closing: number;
  at: Vec3Like;
  x: number;
  y: number;
  shift: number;
  flip: boolean;
  vis: boolean;
  w: number;
  h: number;
  measured: boolean;
}

export interface Size {
  w: number;
  h: number;
}

/** Horizontal shift (px) that keeps a box of width `w` centred on `x` inside [EDGE, screenW − EDGE]. Pure. */
export function bubbleShift(x: number, w: number, screenW: number): number {
  const half = w / 2;
  const lo = EDGE + half;
  const hi = screenW - EDGE - half;
  if (hi < lo) return screenW / 2 - x;
  if (x < lo) return lo - x;
  if (x > hi) return hi - x;
  return 0;
}

export class Bubbles {
  readonly el: HTMLElement;
  private readonly pool: Node[] = [];
  private readonly out = { x: 0, y: 0, visible: false };
  private live = 0;
  dogName = 'Biscuit';

  constructor(private readonly projector: () => Projector | null) {
    this.el = el('div', { class: 'bhd-layer bhd-bubbles', attrs: { 'aria-live': 'polite' } });
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const text = el('span', { class: 'bhd-bubble__text' });
      const tag = el('span', { class: 'bhd-bubble__tag' });
      const box = el('div', { class: 'bhd-bubble__box' }, [tag, text, el('span', { class: 'bhd-bubble__notes', html: iconSvg('music') })]);
      const wrap = el('div', { class: 'bhd-bubble', attrs: { hidden: '' } }, [box, el('span', { class: 'bhd-bubble__tail' }), el('span', { class: 'bhd-bubble__puff bhd-bubble__puff--a' }), el('span', { class: 'bhd-bubble__puff bhd-bubble__puff--b' })]);
      this.pool.push({ wrap, box, text, tag, busy: false, gen: 0, age: 0, life: 3, closing: -1, at: { x: 0, y: 0, z: 0 }, x: NaN, y: NaN, shift: NaN, flip: false, vis: true, w: 0, h: 0, measured: false });
      this.el.appendChild(wrap);
    }
  }

  get active(): number {
    return this.live;
  }

  open(at: Vec3Like, text: string, opts: BubbleOpts = {}): BubbleHandle {
    const node = this.take();
    node.gen++;
    const gen = node.gen;
    node.busy = true;
    node.age = 0;
    node.closing = -1;
    const secs = opts.seconds;
    node.life = secs !== undefined && Number.isFinite(secs) && secs > 0 ? secs : bubbleSeconds(text);
    node.at = { x: at.x, y: at.y, z: at.z };
    node.x = NaN;
    node.y = NaN;
    node.shift = NaN;
    node.vis = true;
    node.measured = false;
    const style: Style = opts.style ?? 'say';
    const speaker: Speaker | '' = opts.speaker ?? '';
    node.wrap.dataset.style = style;
    node.wrap.dataset.speaker = speaker;
    node.wrap.classList.remove('is-out', 'is-flip');
    node.flip = false;
    // Name tag (the dog's name is user input → textContent).
    const name = speaker === 'dog' ? this.dogName : speaker && speaker !== 'extra' ? DISPLAY_NAME[speaker as MemberId] : '';
    node.tag.textContent = name ?? '';
    node.tag.hidden = !name;
    // Words pop in one by one (textContent per word).
    node.text.textContent = '';
    const words = String(text).split(/\s+/).filter((w) => w.length > 0);
    words.forEach((w, i) => {
      const s = el('span', { class: 'bhd-bubble__w', text: w });
      s.style.animationDelay = `${Math.min(i, 24) * 55}ms`;
      node.text.appendChild(s);
      if (i < words.length - 1) node.text.appendChild(document.createTextNode(' '));
    });
    node.wrap.hidden = false;
    node.wrap.style.visibility = '';
    replay(node.wrap, 'is-in');
    this.live = this.count();
    this.place(node, true);
    const self = this;
    return {
      move(p: Vec3Like): void {
        if (node.gen !== gen || !node.busy) return;
        node.at.x = p.x;
        node.at.y = p.y;
        node.at.z = p.z;
      },
      close(): void {
        if (node.gen !== gen || !node.busy) return;
        self.beginClose(node);
      },
      get open(): boolean {
        return node.gen === gen && node.busy && node.closing < 0;
      },
    };
  }

  update(dt: number, size: Size): void {
    if (this.live === 0) return;
    for (const n of this.pool) {
      if (!n.busy) continue;
      n.age += dt;
      if (n.closing >= 0) {
        n.closing += dt;
        if (n.closing >= OUT_TIME) {
          this.free(n);
          continue;
        }
      } else if (n.age >= n.life) this.beginClose(n);
      this.place(n, false, size);
    }
    this.live = this.count();
  }

  clear(): void {
    for (const n of this.pool) if (n.busy) this.free(n);
    this.live = 0;
  }

  private place(n: Node, first: boolean, size?: Size): void {
    const p = this.projector();
    if (!p) return;
    p.project(n.at, this.out);
    const vis = this.out.visible && Number.isFinite(this.out.x) && Number.isFinite(this.out.y);
    if (vis !== n.vis) {
      n.vis = vis;
      n.wrap.style.visibility = vis ? '' : 'hidden';
      n.wrap.classList.toggle('is-offscreen', !vis);
    }
    if (!vis) return;
    if (!n.measured) {
      n.w = n.box.offsetWidth;
      n.h = n.box.offsetHeight;
      n.measured = n.w > 0 || first === false;
    }
    const sw = size?.w ?? (this.el.clientWidth || 1);
    const x = Math.round(this.out.x);
    const y = Math.round(this.out.y);
    const flip = y - n.h - 26 < TOP_LIMIT;
    if (flip !== n.flip) {
      n.flip = flip;
      n.wrap.classList.toggle('is-flip', flip);
    }
    const shift = Math.round(bubbleShift(x, n.w, sw));
    if (x !== n.x || y !== n.y) {
      n.x = x;
      n.y = y;
      n.wrap.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    if (shift !== n.shift) {
      n.shift = shift;
      n.box.style.setProperty('--shift', `${shift}px`);
    }
  }

  private beginClose(n: Node): void {
    if (n.closing >= 0) return;
    n.closing = 0;
    n.wrap.classList.add('is-out');
  }

  private take(): Node {
    let oldest = this.pool[0]!;
    for (const n of this.pool) {
      if (!n.busy) return n;
      if (n.age > oldest.age) oldest = n;
    }
    return oldest;
  }

  private free(n: Node): void {
    n.busy = false;
    n.closing = -1;
    n.wrap.hidden = true;
    n.wrap.classList.remove('is-in', 'is-out');
  }

  private count(): number {
    let c = 0;
    for (const n of this.pool) if (n.busy) c++;
    return c;
  }
}
