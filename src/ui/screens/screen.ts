// Shared plumbing for menu screens.
import type { FamilySetup, Settings, Stats } from '../../storage/types';
import type { InputDevice, MenuAction, PadStyle } from '../../input/types';
import type { MorningReport } from '../../plan/types';
import type { FocusGroup, NavMode } from '../focus';
import type { GlyphToken } from '../glyphs';
import type { ScreenId, UiCommand } from '../types';

export type UiSound = 'move' | 'confirm' | 'back' | 'toggle' | 'denied' | 'open';
export type SubScreen = 'family' | 'settings' | 'howto' | 'credits';

/** What screens can see/do. Implemented by the UI controller. */
export interface UiCtx {
  readonly device: InputDevice;
  readonly pad: PadStyle;
  readonly settings: Readonly<Settings>;
  readonly family: Readonly<FamilySetup>;
  readonly stats: Readonly<Stats> | null;
  readonly report: MorningReport | null;
  readonly dailyBest: number | null;
  /** Where the current sub-screen returns to ('menu' or 'pause'). */
  readonly returnTo: ScreenId | null;
  emit(cmd: UiCommand): void;
  /** Patch settings locally (optimistic) AND emit {type:'settings', patch}. */
  changeSettings(patch: Partial<Settings>): void;
  /** Replace the family setup locally AND emit {type:'family', family}. */
  changeFamily(family: FamilySetup): void;
  /** Push a sub-screen; its back returns to the current screen. */
  open(sub: SubScreen): void;
  /** Pop the current sub-screen. */
  close(): void;
  /** Go to another screen internally (title → menu). */
  go(id: ScreenId): void;
  sound(kind: UiSound): void;
  glyph(token: GlyphToken): string;
  glyphText(text: string): string;
  createFocus(mode?: NavMode): FocusGroup;
  toast(text: string): void;
  /** UI clock (s). */
  clock(): number;
  reducedMotion(): boolean;
}

export interface Screen {
  readonly id: ScreenId;
  readonly el: HTMLElement;
  /** Focus group for navigation (null = no focusable items right now). */
  readonly focus: FocusGroup | null;
  enter(from: ScreenId): void;
  leave?(): void;
  /** 'back' action. Return false when back does nothing here. */
  back?(): boolean | void;
  /** Custom handling before the focus group sees the action; return true if consumed. */
  action?(a: MenuAction): boolean;
  /** Device / pad style changed: re-render glyphs. */
  refreshGlyphs?(): void;
  /** Screen data (settings / family / stats / report) changed: re-read. */
  refresh?(): void;
  update?(dt: number): void;
}

/**
 * Screen section element. Menu screens carry [data-bhd-tap] so the input module's touch overlay never
 * cancels taps (or list scrolling) inside them.
 */
export function screenEl(id: ScreenId, extra = ''): HTMLElement {
  const s = document.createElement('section');
  s.className = `bhd-screen bhd-screen--${id}${extra ? ' ' + extra : ''}`;
  s.dataset.screen = id;
  if (id !== 'none') s.setAttribute('data-bhd-tap', '');
  return s;
}
