// ─────────────────────────────────────────────────────────────────────────────
// UI CONTRACT — every DOM screen, the HUD, act cards, banners, speech bubbles,
// boss intro, choices, results. No UI framework: plain DOM + CSS (src/ui/styles.css).
// Owner: ui module (src/ui/*). SHARED CONTRACT (frozen).
//
// DOM layering inside #app (bottom → top): canvas (0) → .bhd-fade (1) → .bhd-touch (2, input's touch overlay)
// → .bhd-ui (3). The HUD is pointer-events: none except its buttons. CSS class prefix `bhd-` everywhere.
// SECURITY: user strings (the dog's name) → textContent only, never innerHTML.
// ─────────────────────────────────────────────────────────────────────────────
import type { FamilySetup, Settings, Stats } from '../storage/types';
import type { GirlId, MemberId } from '../family/types';
import type { InputDevice, MenuAction, PadStyle } from '../input/types';
import type { MorningReport } from '../plan/types';
import type { Projector, Vec3Like } from '../render/types';

export type ScreenId =
  | 'none' // gameplay (HUD only)
  | 'title' // BAD HAIR DAY! logo + "press any button"
  | 'menu' // NEW MORNING · DAILY MORNING · FAMILY SETUP · HOW TO PLAY · SETTINGS · CREDITS
  | 'family' // family setup (hair colours, skin tones, beard/glasses, coffee order, dog name + coat)
  | 'settings'
  | 'howto'
  | 'credits'
  | 'pause' // RESUME · RESTART MORNING · HOW TO PLAY · SETTINGS · QUIT TO MENU
  | 'results'; // the Morning Report Card

/** Icons the HUD / cards / prompts can show (inline SVG drawn by the ui module). */
export type IconId =
  | 'dog'
  | 'coffee'
  | 'lunch'
  | 'trash'
  | 'dishes'
  | 'bed'
  | 'sun'
  | 'brush'
  | 'blackBrush'
  | 'crown'
  | 'heart'
  | 'star'
  | 'clock'
  | 'check'
  | 'shoe'
  | 'backpack'
  | 'book'
  | 'bottle'
  | 'hairTie'
  | 'slip'
  | 'jacket'
  | 'car'
  | 'school'
  | 'sparkle'
  | 'music'
  | 'eye' // Mom's inspection
  | 'whistle'
  | 'hand';

/** Commands the UI sends to the game (menu choices, settings edits). */
export type UiCommand =
  | { type: 'newMorning' }
  | { type: 'dailyMorning' }
  | { type: 'resume' }
  | { type: 'restartMorning' }
  | { type: 'quitToMenu' }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'family'; family: FamilySetup }
  | { type: 'resetStats' }
  | { type: 'playAgain' } // results → another morning (new seed)
  | { type: 'toMenu' } // results → menu
  | { type: 'fullscreen' }
  | { type: 'skip' }; // skip button on act cards / cutscenes (also any confirm)

export interface ScreenData {
  settings?: Readonly<Settings>;
  family?: Readonly<FamilySetup>;
  stats?: Readonly<Stats>;
  report?: MorningReport;
  /** Is there a daily morning already played today (show best)? */
  dailyBest?: number | null;
}

export interface ActCard {
  /** "5:15 AM" */
  time: string;
  /** "ACT I" */
  act: string;
  title: string;
  subtitle: string;
  /** Visual theme of the card (pre-dawn navy, sunrise, bright morning…). */
  mood: 'predawn' | 'sunrise' | 'morning' | 'bright';
}

export type BannerStyle =
  | 'secured' // "COFFEE: SECURED" — stamp, warm gold
  | 'legendary' // "THE BLACK BRUSH HAS SPAWNED" — dark, glowing, shimmering, slow
  | 'boss' // "MOM IS CHECKING THE HAIR" — dramatic
  | 'approved' // "MOM APPROVED ✓"
  | 'info' // neutral
  | 'fun'; // bouncy comic (e.g. "WRONG DOOR.")

export interface TaskItem {
  id: string;
  label: string;
  icon: IconId;
  state: 'todo' | 'active' | 'done' | 'skipped';
  /** 1..3 once done. */
  stars?: number;
}

export interface Meter {
  id: string;
  label: string;
  /** 0..1 */
  value: number;
  /** CSS colour (token var or hex string). */
  color?: string;
  icon?: IconId;
}

export interface HudState {
  /** Minutes since midnight. */
  clock: number;
  /** Blink the clock (held at a cap: "5:59 … 5:59 …"). */
  clockBlink?: boolean;
  /** Small label under the clock, e.g. "ACT I · CHRIS'S EARLY SHIFT". */
  actLabel?: string;
  tasks?: TaskItem[];
  /** One-line current objective under the task list. */
  objective?: string;
  meters?: Meter[];
  /** Show the touch pause button. */
  pauseButton?: boolean;
}

/** A control prompt with device-appropriate glyphs, e.g. "[✕] Open the door". */
export interface PromptSpec {
  text: string;
  slot: 'primary' | 'secondary' | 'alt' | 'move' | 'switch' | 'pointer';
  hold?: boolean;
  /** World anchor → the prompt floats above it; omitted → bottom-centre prompt bar. */
  at?: Vec3Like;
}

export interface BubbleOpts {
  seconds?: number;
  speaker?: MemberId | 'dog' | 'extra';
  style?: 'say' | 'think' | 'shout' | 'whisper' | 'sing';
}

export interface BubbleHandle {
  /** Re-anchor (e.g. the character moved: pass its 'overhead' socket world position each frame). */
  move(at: Vec3Like): void;
  close(): void;
  readonly open: boolean;
}

export interface ChoiceOption {
  id: string;
  label: string;
  sub?: string;
  icon?: IconId;
  /** Portrait accent colour (CSS). */
  color?: string;
  /** Portrait badge (e.g. 'blackBrush'). */
  badge?: IconId;
}

export interface UiOptions {
  /** #app — the ui appends `.bhd-ui` (and `.bhd-fade` stays the game's). */
  root: HTMLElement;
  projector: Projector;
}

export interface UiManager {
  // ── screens ──
  showScreen(id: ScreenId, data?: ScreenData): void;
  readonly screen: ScreenId;
  onCommand(cb: (cmd: UiCommand) => void): () => void;
  /** Feed input MenuActions every frame (menus + pause + skip). Returns true if the UI consumed something. */
  handleMenuActions(actions: readonly MenuAction[]): boolean;
  setInputDevice(device: InputDevice, padStyle: PadStyle): void;
  /** Boot splash → title. Resolves when the title is showing. */
  boot(): Promise<void>;

  // ── in-game presentation ──
  /** Full-screen act card (~3.2 s; any confirm skips the rest). */
  actCard(card: ActCard): Promise<void>;
  /** `pos` (default 'center'): 'top' / 'bottom' keep a banner off a close-up's faces. */
  banner(text: string, style?: BannerStyle, opts?: { sub?: string; seconds?: number; icon?: IconId; pos?: 'center' | 'top' | 'bottom' }): void;
  /** Mock-epic boss card ("MOM" / "THE HAIR INSPECTOR") with a heart-shaped boss bar (~3 s). */
  bossIntro(name: string, title: string): Promise<void>;
  /** Speech bubble anchored to a world point (projected every frame). */
  bubble(at: Vec3Like, text: string, opts?: BubbleOpts): BubbleHandle;
  toast(text: string, icon?: IconId, seconds?: number): void;
  /** Modal choice with big cards (e.g. who gets the black brush first). Navigable by pad/keys/touch/mouse. */
  choice(title: string, options: ChoiceOption[], opts?: { subtitle?: string; defaultId?: string }): Promise<string>;
  /** null hides the HUD. Call when it changes (cheap: diffed internally). */
  setHud(hud: HudState | null): void;
  prompt(p: PromptSpec | null): void;
  /** Big centred instruction line for activities ("Pour until it matches the swatch!"), null hides. */
  instruction(text: string | null, sub?: string): void;
  /**
   * Empty container for activity-specific DOM (portraits, pour gauges…), inside `.bhd-ui` above the HUD and below
   * modal screens. The activity clears it (textContent = '') when done. Use the shared CSS kit classes
   * (docs/ARCHITECTURE.md "UI kit").
   */
  activityLayer(): HTMLElement;
  /** Show a girl's portrait row (brushing + rush): generic, data-driven. null hides. */
  portraits(p: PortraitRow | null): void;
  /** Clicks/taps on portraits / activity chips arrive here (id). Consumed once. */
  takeClicks(): readonly string[];
  update(dt: number): void;
  dispose(): void;
}

export interface Portrait {
  id: GirlId;
  name: string;
  /** CSS colour accent. */
  color: string;
  /** 0..1 progress ring. */
  progress: number;
  /** Optional goal mark on the ring (0..1), e.g. 0.95 = "Mom approves at 95 %". */
  goal?: number;
  /** Small status line ("I'M DONE!", "Needs: left shoe"). */
  status?: string;
  badge?: IconId | null;
  focused?: boolean;
  /** Face mood for the mini portrait. */
  mood?: 'happy' | 'neutral' | 'eek' | 'proud' | 'sleepy' | 'dramatic';
}

export interface PortraitRow {
  items: Portrait[];
  /**
   * Compact layout for close-up cameras (brushing): small portraits in a single tight row tucked into the top-right
   * corner (chips beside/under them), leaving the centre and upper-middle of the screen clear.
   */
  compact?: boolean;
  /** Action chips under the row, e.g. [{id:'pass', label:'PASS THE BLACK BRUSH', slot:'secondary'}]. */
  chips?: { id: string; label: string; slot?: 'primary' | 'secondary' | 'alt'; icon?: IconId; disabled?: boolean }[];
}

/*
 * src/ui/index.ts exports:
 *   export function createUI(opts: UiOptions): UiManager;
 *   export function formatClock(minutes: number): string;          // 315 → "5:15 AM"
 */
