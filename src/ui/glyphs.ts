// Control glyphs for prompts, chips, menu hints and How to Play — device- and pad-style-aware.
// Labels always come from src/input/labels.ts (bindingLabels) so they stay in sync with the real
// mappings; this file only decides how each label LOOKS:
//   keyboard → keycaps (SPACE / E / SHIFT / Q R / WASD cluster), mouse icon for 'pointer'
//   PlayStation → coloured ✕ ○ □ △ shapes on dark discs · Xbox → coloured A B X Y letter discs
//   Nintendo / generic → cream letter discs · triggers & bumpers → shoulder pills · L-STICK → stick
//   touch → a mini replica of the on-screen button (its ControlIcon), the joystick, a finger tap
// Output is trusted markup: every label is HTML-escaped; shapes are constants.
import { controlIconSvg, isControlIcon } from '../input/icons';
import { bindingLabels, type BindingSlot } from '../input/labels';
import type { ControlIcon, InputDevice, PadStyle } from '../input/types';
import { escapeHtml } from './dom';
import { INK, uiIcon } from './icons';

export type GlyphToken = BindingSlot | 'pointer' | 'confirm' | 'back' | 'navigate';
export const GLYPH_TOKENS: readonly GlyphToken[] = ['primary', 'secondary', 'alt', 'move', 'pause', 'switch', 'pointer', 'confirm', 'back', 'navigate'];
export const isGlyphToken = (s: string): s is GlyphToken => (GLYPH_TOKENS as readonly string[]).includes(s);

export interface TouchButtonInfo {
  icon: ControlIcon;
  label: string;
}

export interface GlyphContext {
  device: InputDevice;
  pad: PadStyle;
  /** Current touch-overlay button for a slot (null = not shown). */
  touch?: (slot: 'primary' | 'secondary' | 'alt') => TouchButtonInfo | null;
}

const wrap = (inner: string, kind: string, id: string, aria: string): string =>
  `<span class="bhd-g bhd-g--${kind}" data-g="${escapeHtml(id)}" role="img" aria-label="${escapeHtml(aria)}">${inner}</span>`;

const key = (label: string): string => {
  const wide = label.length > 2;
  return `<kbd class="bhd-key${wide ? ' bhd-key--wide' : ''}">${escapeHtml(label)}</kbd>`;
};

const ARROWS = { up: 'M8 3.5 13 11H3z', down: 'M8 12.5 13 5H3z', left: 'M3.5 8 11 3v10z', right: 'M12.5 8 5 3v10z' } as const;
const arrowKey = (d: keyof typeof ARROWS): string =>
  `<kbd class="bhd-key bhd-key--arrow"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${ARROWS[d]}" fill="currentColor"/></svg></kbd>`;

// ── pad faces ────────────────────────────────────────────────────────────────

const disc = (inner: string, fill = '#2a2140'): string =>
  `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="${fill}" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="14.6" r="11" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1.6"/>${inner}</svg>`;

const PS: Record<string, { id: string; name: string; inner: string }> = {
  '✕': { id: 'ps-cross', name: 'Cross', inner: `<path d="M11 11 21 21M21 11 11 21" stroke="#8cc2ff" stroke-width="3.4" stroke-linecap="round"/>` },
  '○': { id: 'ps-circle', name: 'Circle', inner: `<circle cx="16" cy="16" r="6.3" fill="none" stroke="#ff7a8a" stroke-width="3.2"/>` },
  '□': { id: 'ps-square', name: 'Square', inner: `<rect x="10.3" y="10.3" width="11.4" height="11.4" rx="1.2" fill="none" stroke="#ffa6e4" stroke-width="3.2"/>` },
  '△': { id: 'ps-triangle', name: 'Triangle', inner: `<path d="M16 9.4 22.6 20.8H9.4Z" fill="none" stroke="#5fe3b5" stroke-width="3" stroke-linejoin="round"/>` },
};

const XBOX_COL: Record<string, string> = { A: '#6fd36a', B: '#ff6a5c', X: '#5aaeff', Y: '#ffd24a' };

function letterDisc(letter: string, pad: PadStyle): string {
  const xbox = pad === 'xbox';
  const col = xbox ? (XBOX_COL[letter] ?? '#fff6e9') : '#fff6e9';
  return disc(
    `<text x="16" y="21.2" text-anchor="middle" font-family="'Baloo 2', Nunito, Arial, sans-serif" font-weight="800" font-size="15" fill="${col}">${escapeHtml(letter)}</text>`,
    xbox ? '#262a2e' : pad === 'nintendo' ? '#3a3440' : '#2a2140',
  );
}

const STICK = `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#efe6f5" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="16" r="7.2" fill="#7d6f9e" stroke="${INK}" stroke-width="2"/><path d="M16 3.8 13.4 6.6h5.2zM16 28.2l-2.6-2.8h5.2zM3.8 16l2.8-2.6v5.2zM28.2 16l-2.8-2.6v5.2z" fill="${INK}"/></svg>`;
const DPAD = `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><path d="M12 3.5h8v8.5h8.5v8H20v8.5h-8V20H3.5v-8H12z" fill="#3a3148" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M6.6 16 10 13.2v5.6zM25.4 16 22 13.2v5.6zM16 6.6l-2.8 3.4h5.6zM16 25.4l-2.8-3.4h5.6z" fill="#ffc94a"/></svg>`;
const JOY = `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff6e9" fill-opacity=".55" stroke="${INK}" stroke-width="2.2" stroke-dasharray="3 2.2"/><circle cx="16" cy="16" r="7.6" fill="#fff6e9" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="16" r="3" fill="#ff7a6b"/></svg>`;
const PAUSE = `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff6e9" stroke="${INK}" stroke-width="2.4"/><rect x="10.6" y="9.6" width="3.8" height="12.8" rx="1.3" fill="${INK}"/><rect x="17.6" y="9.6" width="3.8" height="12.8" rx="1.3" fill="${INK}"/></svg>`;
const TAP = `<svg class="bhd-face-btn" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff6e9" stroke="${INK}" stroke-width="2.4"/><circle cx="16" cy="12" r="5.6" fill="none" stroke="#ff7a6b" stroke-width="2" stroke-dasharray="2.4 2"/><path d="M14 22.5v-9.3a2 2 0 0 1 4 0v6l3.4.8a2.4 2.4 0 0 1 1.8 2.7l-.6 3.8H15.6z" fill="#f9d0ae" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/></svg>`;

function pill(label: string, kind: 'shoulder' | 'menu'): string {
  return `<span class="bhd-pill bhd-pill--${kind}">${escapeHtml(label)}</span>`;
}

const SHOULDER = new Set(['R2', 'L2', 'RT', 'LT', 'ZR', 'ZL', 'L1', 'R1', 'LB', 'RB', 'L', 'R']);

function padLabel(label: string, pad: PadStyle): string {
  const ps = PS[label];
  if (ps) return wrap(disc(ps.inner), 'face', ps.id, `${ps.name} button`);
  if (/^[ABXY]$/.test(label)) return wrap(letterDisc(label, pad), 'face', `${pad}-${label.toLowerCase()}`, `${label} button`);
  if (label === 'L-STICK') return wrap(STICK, 'face', 'stick', 'Left stick');
  if (label === 'D-PAD') return wrap(DPAD, 'face', 'dpad', 'D-pad');
  if (SHOULDER.has(label)) return wrap(pill(label, 'shoulder'), 'pill', `shoulder-${label.toLowerCase()}`, `${label} button`);
  return wrap(pill(label, 'menu'), 'pill', `menu-${label.toLowerCase()}`, `${label} button`);
}

function touchButton(slot: 'primary' | 'secondary' | 'alt', info: TouchButtonInfo | null): string {
  const icon: ControlIcon = info && isControlIcon(info.icon) ? info.icon : slot === 'primary' ? 'hand' : 'go';
  const label = info?.label ?? '';
  return wrap(
    `<span class="bhd-tbtn bhd-tbtn--${slot}">${controlIconSvg(icon)}</span>` + (label ? `<span class="bhd-tbtn__t">${escapeHtml(label)}</span>` : ''),
    'touch',
    `touch-${slot}-${icon}`,
    label ? `${label} button` : 'On-screen button',
  );
}

function keyboardGlyph(t: GlyphToken): string {
  switch (t) {
    case 'primary':
    case 'secondary':
    case 'alt':
    case 'pause': {
      const l = bindingLabels(t, 'keyboard')[0] ?? '?';
      return wrap(key(l), 'key', `key-${l.toLowerCase()}`, `${l} key`);
    }
    case 'switch': {
      const [a = 'Q', b = 'R'] = bindingLabels('switch', 'keyboard');
      return wrap(key(a) + key(b), 'key', 'key-switch', `${a} or ${b} key`);
    }
    case 'move':
      return wrap(`<span class="bhd-wasd">${key('W')}<span>${key('A')}${key('S')}${key('D')}</span></span>`, 'key', 'key-wasd', 'W A S D or arrow keys');
    case 'pointer':
      return wrap(`<span class="bhd-g__ico">${uiIcon('mouse')}</span>`, 'icon', 'mouse', 'Mouse: hold and drag');
    case 'confirm':
      return wrap(key('ENTER'), 'key', 'key-enter', 'Enter key');
    case 'back':
      return wrap(key('ESC'), 'key', 'key-esc', 'Escape key');
    case 'navigate':
      return wrap(arrowKey('up') + arrowKey('down') + arrowKey('left') + arrowKey('right'), 'key', 'key-arrows', 'Arrow keys');
  }
}

function padGlyph(t: GlyphToken, pad: PadStyle): string {
  switch (t) {
    case 'primary':
    case 'secondary':
    case 'alt':
    case 'pause':
    case 'move':
      return padLabel(bindingLabels(t, 'gamepad', pad)[0] ?? 'A', pad);
    case 'switch': {
      const [a = 'LB', b = 'RB'] = bindingLabels('switch', 'gamepad', pad);
      return padLabel(a, pad) + padLabel(b, pad);
    }
    case 'pointer':
      return padLabel(bindingLabels('move', 'gamepad', pad)[0] ?? 'L-STICK', pad) + padLabel(bindingLabels('primary', 'gamepad', pad)[0] ?? 'A', pad);
    case 'confirm':
      return padLabel(bindingLabels('primary', 'gamepad', pad)[0] ?? 'A', pad);
    case 'back':
      return padLabel(bindingLabels('secondary', 'gamepad', pad)[0] ?? 'B', pad);
    case 'navigate':
      return wrap(DPAD, 'face', 'dpad', 'D-pad');
  }
}

function touchGlyph(t: GlyphToken, ctx: GlyphContext): string {
  switch (t) {
    case 'primary':
    case 'secondary':
    case 'alt':
      return touchButton(t, ctx.touch?.(t) ?? null);
    case 'move':
      return wrap(JOY, 'face', 'joystick', 'Joystick');
    case 'pause':
      return wrap(PAUSE, 'face', 'touch-pause', 'Pause button');
    case 'switch':
    case 'confirm':
    case 'navigate':
      return wrap(TAP, 'face', 'tap', 'Tap');
    case 'pointer':
      return wrap(`<span class="bhd-g__ico">${uiIcon('drag')}</span>`, 'icon', 'drag', 'Drag with your finger');
    case 'back':
      return wrap(pill('BACK', 'menu'), 'pill', 'touch-back', 'Back button');
  }
}

/** Markup for one control glyph on the given device. */
export function glyphHtml(token: GlyphToken, ctx: GlyphContext): string {
  if (ctx.device === 'touch') return touchGlyph(token, ctx);
  if (ctx.device === 'gamepad') return padGlyph(token, ctx.pad);
  return keyboardGlyph(token);
}

/** Replace `{token}` markers in plain text with glyph markup; everything else is escaped. */
export function renderGlyphText(text: string, ctx: GlyphContext): string {
  let out = '';
  let last = 0;
  const re = /\{([a-zA-Z]+)\}/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const name = m[1]!;
    if (!isGlyphToken(name)) continue;
    out += escapeHtml(text.slice(last, m.index)) + glyphHtml(name, ctx);
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/** Stable key for caching rendered glyphs (changes whenever the rendered output could). */
export function glyphKey(ctx: GlyphContext): string {
  if (ctx.device === 'touch') {
    const p = ctx.touch?.('primary');
    const s = ctx.touch?.('secondary');
    const a = ctx.touch?.('alt');
    return `touch|${p?.icon ?? ''}${p?.label ?? ''}|${s?.icon ?? ''}${s?.label ?? ''}|${a?.icon ?? ''}${a?.label ?? ''}`;
  }
  return ctx.device === 'gamepad' ? `pad|${ctx.pad}` : 'kb';
}

/** Human name for a device (How to Play header). */
export function deviceLabel(device: InputDevice, pad: PadStyle): string {
  if (device === 'touch') return 'TOUCH';
  if (device === 'keyboard') return 'KEYBOARD & MOUSE';
  switch (pad) {
    case 'playstation':
      return 'PLAYSTATION CONTROLLER';
    case 'xbox':
      return 'XBOX CONTROLLER';
    case 'nintendo':
      return 'NINTENDO CONTROLLER';
    default:
      return 'CONTROLLER';
  }
}
