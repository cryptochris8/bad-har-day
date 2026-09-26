// Tiny DOM helpers (no framework). Every UI class uses the `bhd-` prefix.
// Dynamic strings ALWAYS go through `text` (textContent). `html` is for trusted markup only:
// our own icon / face / glyph strings (which escape everything they don't build themselves).

export interface ElProps {
  class?: string;
  text?: string;
  /** Trusted markup only (icons / glyph output). Never pass outside data here. */
  html?: string;
  attrs?: Record<string, string>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: readonly (Node | null | undefined | false)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.html !== undefined) e.innerHTML = props.html;
  else if (props.text !== undefined) e.textContent = props.text;
  if (props.attrs) for (const k in props.attrs) e.setAttribute(k, props.attrs[k]!);
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

/**
 * A menu button. Never takes DOM focus (tabindex −1): the UI draws its own focus ring and only
 * activates through MenuAction 'confirm' or real pointer input. `iconHtml` is trusted icon markup;
 * `label` is set with textContent.
 */
export function button(cls: string, label: string, iconHtml = '', sub?: string): HTMLButtonElement {
  const b = el('button', { class: ('bhd-btn ' + cls).trim(), attrs: { type: 'button', tabindex: '-1' } });
  if (iconHtml) b.appendChild(el('span', { class: 'bhd-btn__ico', html: iconHtml, attrs: { 'aria-hidden': 'true' } }));
  const labels = el('span', { class: 'bhd-btn__labels' }, [el('span', { class: 'bhd-btn__label', text: label })]);
  if (sub !== undefined) labels.appendChild(el('span', { class: 'bhd-btn__sub', text: sub }));
  b.appendChild(labels);
  return b;
}

/** Restart a CSS animation class on an element (event-rate only: forces a style flush). */
export function replay(node: Element, cls: string): void {
  node.classList.remove(cls);
  void (node as HTMLElement).offsetWidth; // flush styles so re-adding the class restarts the keyframes
  node.classList.add(cls);
}

/** Set text only when it differs (avoids needless DOM mutations). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Toggle a class only when the state really changes (classList writes re-set the attribute). */
export function setClass(node: Element, cls: string, on: boolean): void {
  if (node.classList.contains(cls) !== on) node.classList.toggle(cls, on);
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

/** Set a data-* attribute only when it changes. */
export function setData(node: HTMLElement, key: string, value: string): void {
  if (node.dataset[key] !== value) node.dataset[key] = value;
}

/** Set a CSS custom property only when it changes. */
export function setVar(node: HTMLElement, name: string, value: string): void {
  if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value);
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 0xff6b1a → '#ff6b1a' (always a well-formed 6-digit colour, whatever the input number). */
export function hexColor(n: number): string {
  const v = Number.isFinite(n) ? Math.max(0, Math.min(0xffffff, Math.floor(n))) : 0;
  return '#' + v.toString(16).padStart(6, '0');
}

/**
 * Accepts a CSS colour coming from game code (a token like 'var(--bhd-addy)', '#a78bfa', 'rgb(…)')
 * and returns it only if it is a plain, harmless colour value (never lets `;`, `url(` or quotes
 * through into a style attribute). Falls back to `fallback`.
 */
export function safeColor(c: string | undefined | null, fallback: string): string {
  if (typeof c !== 'string') return fallback;
  const s = c.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^var\(--[a-zA-Z0-9-]+\)$/.test(s)) return s;
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,%\s/+-]+\)$/.test(s)) return s;
  if (/^[a-zA-Z]{3,20}$/.test(s)) return s;
  return fallback;
}

/**
 * Menu activation: real clicks and taps only (detail ≠ 0 — a keyboard-synthesised click on a focused
 * button is ignored; the UI activates through MenuAction 'confirm'). Activating on `click` (the last
 * event of a tap) means a screen change can't leave a ghost click for the next screen to receive.
 */
export function onClick(node: HTMLElement, fn: (e: MouseEvent) => void): void {
  node.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    fn(e);
  });
}

/**
 * Gameplay-time tap (HUD pause button, portraits, chips, act-card skip). Mouse uses `click`
 * (detail ≠ 0). Touch/pen activate on pointerup over the element (with thumb slop) because during
 * gameplay the input module may preventDefault() touchstart, which stops browsers from synthesising
 * a click; the click that may still follow a touch pointerup is muted so nothing double-fires.
 */
export function onTap(node: HTMLElement, fn: (e: Event) => void): void {
  let touchId: number | null = null;
  let startX = 0;
  let startY = 0;
  let muteUntil = -Infinity;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    touchId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
  });
  node.addEventListener('pointercancel', () => (touchId = null));
  node.addEventListener('pointerup', (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    if (Math.abs(e.clientX - startX) > 14 || Math.abs(e.clientY - startY) > 14) return;
    if (!releasedOver(node, e)) return;
    muteUntil = e.timeStamp + 700;
    fn(e);
  });
  node.addEventListener('click', (e) => {
    if (e.detail === 0) return;
    if (e.timeStamp < muteUntil) return;
    fn(e);
  });
}

/** Finger lifted over the element (with slop)? jsdom has no layout: a 0×0 rect counts as over. */
export function releasedOver(node: HTMLElement, e: { clientX: number; clientY: number }, slop = 24): boolean {
  const r = node.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return true;
  return e.clientX >= r.left - slop && e.clientX <= r.right + slop && e.clientY >= r.top - slop && e.clientY <= r.bottom + slop;
}

/** HTML-escape for the few places that build markup strings around text (glyph labels). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'));
}
