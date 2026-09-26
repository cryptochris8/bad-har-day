// UiController — implements UiManager (src/ui/types.ts). Owns the `.bhd-ui` layer inside #app, routes
// MenuActions (menus, pause, choices, act-card skips), keeps the sub-screen stack (menu/pause →
// family/settings/howto/credits → back), caches the ScreenData the game hands over, and hosts every
// in-game presentation piece (HUD, bubbles, prompts, banners, toasts, act cards, boss intro, choice,
// portraits, activity layer).
//
// Extras beyond the contract (all optional for the game):
//   • 'mute' MenuAction → emits {type:'settings', patch:{muted}} + a toast (the game should NOT also toggle).
//   • UI sounds: a bubbling CustomEvent 'bhd-ui-sound' ({detail:{kind}}) on opts.root —
//     kind ∈ 'move' | 'confirm' | 'back' | 'toggle' | 'denied' | 'open'. Hook audio to it if you like.
//   • The HUD pause button queues the click id 'pause' (read it via takeClicks()).
//   • `.bhd-glyph[data-slot]` / `.bhd-chip[data-slot]` elements added to activityLayer() get their device
//     glyph filled in automatically (and re-rendered when the device changes).
import { isControlIcon } from '../input/icons';
import type { ControlIcon, InputDevice, MenuAction, PadStyle } from '../input/types';
import type { MorningReport } from '../plan/types';
import type { Projector, Vec3Like } from '../render/types';
import { DEFAULT_SETTINGS, type FamilySetup, type Settings, type Stats } from '../storage/types';
import { Bubbles, type Size } from './bubbles';
import { ActCardView, BossIntroView } from './cards';
import { ChoiceView } from './choice';
import { el, prefersReducedMotion } from './dom';
import { DEFAULT_LOOKS } from './faces';
import { FocusGroup, type NavDir, type NavMode, type NavStep } from './focus';
import { warmFonts } from './fonts';
import { glyphHtml, glyphKey, isGlyphToken, renderGlyphText, type GlyphContext, type GlyphToken, type TouchButtonInfo } from './glyphs';
import { Hud } from './hud';
import { Banners, Instruction, Prompt, Toasts } from './overlays';
import { Portraits } from './portraits';
import { cloneFamily, FamilyScreen } from './screens/family';
import { CreditsScreen, HowToScreen, PauseScreen } from './screens/menus';
import { ResultsScreen } from './screens/results';
import type { Screen, SubScreen, UiCtx, UiSound } from './screens/screen';
import { screenEl } from './screens/screen';
import { SettingsScreen } from './screens/settings';
import { MenuScreen, TitleScreen } from './screens/title';
import type {
  ActCard,
  BannerStyle,
  BubbleHandle,
  BubbleOpts,
  ChoiceOption,
  HudState,
  IconId,
  PortraitRow,
  PromptSpec,
  ScreenData,
  ScreenId,
  UiCommand,
  UiManager,
  UiOptions,
} from './types';
import { logoEl } from './widgets';

export const UI_SOUND_EVENT = 'bhd-ui-sound';
export const BOOT_SECONDS = 1.5;

const SUB_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['family', 'settings', 'howto', 'credits']);
/** Screens where the gameplay layers (HUD, prompts, bubbles, activity…) are visible. */
const GAME_SCREENS: ReadonlySet<ScreenId> = new Set<ScreenId>(['none', 'pause']);

class PlayScreen implements Screen {
  readonly id = 'none' as const;
  readonly focus = null;
  readonly el = screenEl('none');
  enter(): void {}
}

function guessDevice(): InputDevice {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 'touch';
  } catch {
    /* ignore */
  }
  return 'keyboard';
}

export function defaultFamily(): FamilySetup {
  return cloneFamily({ looks: DEFAULT_LOOKS, coffee: 'splash' });
}

export class UiController implements UiManager {
  readonly layer: HTMLElement;
  private readonly root: HTMLElement;
  private readonly projector: Projector;
  private readonly listeners = new Set<(c: UiCommand) => void>();

  readonly hud: Hud;
  readonly bubbles: Bubbles;
  readonly banners: Banners;
  readonly toasts: Toasts;
  readonly instr: Instruction;
  readonly promptView: Prompt;
  readonly choiceView: ChoiceView;
  readonly portraitView: Portraits;
  readonly actCardView: ActCardView;
  readonly bossView: BossIntroView;
  private readonly activity: HTMLElement;
  private readonly play: HTMLElement;
  private readonly bootEl: HTMLElement;
  readonly screens: Record<ScreenId, Screen>;

  private current: ScreenId = 'none';
  private returnTo_: ScreenId | null = null;
  private device: InputDevice;
  private pad: PadStyle = 'generic';
  private settings_: Settings = { ...DEFAULT_SETTINGS };
  private family_: FamilySetup = defaultFamily();
  private stats_: Stats | null = null;
  private report_: MorningReport | null = null;
  private dailyBest_: number | null = null;
  private clicks: string[] = [];
  private time = 0;
  private sizeCache: Size = { w: 1, h: 1 };
  private sizeFrame = 0;
  private touchPoll = 0;
  private lastGlyphKey = '';
  private observer: MutationObserver | null = null;
  private disposed = false;
  private booted = false;

  constructor(opts: UiOptions) {
    this.root = opts.root;
    this.projector = opts.projector;
    this.device = guessDevice();
    warmFonts();

    const layer = el('div', { class: 'bhd-ui' });
    this.layer = layer;
    layer.dataset.device = this.device;
    layer.dataset.pad = this.pad;

    this.hud = new Hud(() => {
      this.clicks.push('pause');
      this.sound('confirm');
    });
    this.bubbles = new Bubbles(() => this.projector);
    this.banners = new Banners();
    this.toasts = new Toasts();
    this.instr = new Instruction();
    this.promptView = new Prompt((slot) => this.glyph(slot));
    this.activity = el('div', { class: 'bhd-layer bhd-activity' });
    this.portraitView = new Portraits(
      (id) => {
        this.clicks.push(id);
        this.sound('toggle');
      },
      (slot) => this.glyph(slot),
      () => glyphKey(this.glyphCtx()),
    );
    this.choiceView = new ChoiceView(this.makeFocus('spatial'), (k) => this.sound(k));
    this.actCardView = new ActCardView();
    this.bossView = new BossIntroView();
    this.play = el('div', { class: 'bhd-play' }, [
      this.hud.el,
      this.bubbles.el,
      this.promptView.el,
      this.instr.el,
      this.activity,
      this.portraitView.el,
      this.banners.el,
      this.choiceView.el,
      this.actCardView.el,
      this.bossView.el,
    ]);
    this.bootEl = el('div', { class: 'bhd-layer bhd-boot', attrs: { hidden: '', 'aria-hidden': 'true' } }, [
      el('div', { class: 'bhd-boot__sun' }),
      el('div', { class: 'bhd-boot__inner' }, [logoEl('xl'), el('div', { class: 'bhd-boot__gm', text: 'GOOD MORNING!' })]),
    ]);

    const ctx = this.makeCtx();
    this.screens = {
      none: new PlayScreen(),
      title: new TitleScreen(ctx),
      menu: new MenuScreen(ctx),
      family: new FamilyScreen(ctx),
      settings: new SettingsScreen(ctx),
      howto: new HowToScreen(ctx),
      credits: new CreditsScreen(ctx),
      pause: new PauseScreen(ctx),
      results: new ResultsScreen(ctx),
    };
    layer.appendChild(this.play);
    for (const s of Object.values(this.screens)) layer.appendChild(s.el);
    layer.append(this.toasts.el, this.bootEl);
    this.root.appendChild(layer);

    if (typeof MutationObserver === 'function') {
      this.observer = new MutationObserver(() => this.hydrate());
      this.observer.observe(this.activity, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-slot'] });
    }
    this.applySettingsAttrs();
    this.syncLooks();
    this.activate('none', 'none');
    this.refreshCardHints();
  }

  // ── UiManager: screens ─────────────────────────────────────────────────────

  get screen(): ScreenId {
    return this.current;
  }

  showScreen(id: ScreenId, data?: ScreenData): void {
    if (this.disposed || !(id in this.screens)) return;
    if (data) this.absorb(data);
    if (id === this.current) {
      this.screens[id].refresh?.();
      return;
    }
    const prev = this.current;
    if (SUB_SCREENS.has(id)) {
      if (!SUB_SCREENS.has(prev)) this.returnTo_ = prev === 'pause' || prev === 'menu' ? prev : 'menu';
    } else this.returnTo_ = null;
    this.switchTo(id, prev);
  }

  onCommand(cb: (cmd: UiCommand) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  handleMenuActions(actions: readonly MenuAction[]): boolean {
    if (this.disposed || actions.length === 0) return false;
    const start = this.current;
    let consumed = false;
    for (const a of actions) {
      // After a screen change in this batch, drop further activations (no double-confirm through two screens).
      if (this.current !== start && (a === 'confirm' || a === 'back' || a === 'pause')) {
        consumed = true;
        continue;
      }
      if (this.handleAction(a)) consumed = true;
    }
    return consumed;
  }

  setInputDevice(device: InputDevice, padStyle: PadStyle): void {
    if (device === this.device && padStyle === this.pad) return;
    this.device = device;
    this.pad = padStyle;
    this.layer.dataset.device = device;
    this.layer.dataset.pad = padStyle;
    this.refreshGlyphs();
  }

  boot(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.booted) {
      this.showScreen('title');
      return Promise.resolve();
    }
    this.booted = true;
    this.bootEl.hidden = false;
    this.bootEl.classList.remove('is-out');
    // The static index.html splash hands over to this one (same colours).
    document.getElementById('bhd-loading')?.classList.add('bhd-done');
    return new Promise<void>((resolve) => {
      const minMs = this.reducedMotion() ? 500 : BOOT_SECONDS * 1000;
      const fontsReady = (): Promise<unknown> => {
        try {
          const f = typeof document !== 'undefined' ? document.fonts : undefined;
          return f && f.ready ? Promise.race([f.ready, new Promise((r) => setTimeout(r, 1800))]) : Promise.resolve();
        } catch {
          return Promise.resolve();
        }
      };
      const wait = new Promise((r) => setTimeout(r, minMs));
      void Promise.all([wait, fontsReady()]).then(() => {
        if (this.disposed) {
          resolve();
          return;
        }
        this.showScreen('title');
        this.bootEl.classList.add('is-out');
        setTimeout(() => {
          this.bootEl.hidden = true;
        }, 520);
        resolve();
      });
    });
  }

  // ── UiManager: in-game presentation ───────────────────────────────────────

  actCard(card: ActCard): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.refreshCardHints();
    return this.actCardView.show(card);
  }

  banner(text: string, style: BannerStyle = 'info', opts?: { sub?: string; seconds?: number; icon?: IconId }): void {
    if (this.disposed) return;
    this.banners.show(text, style, opts);
  }

  bossIntro(name: string, title: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.bossView.looks = this.family_.looks;
    this.refreshCardHints();
    return this.bossView.show(name, title);
  }

  bubble(at: Vec3Like, text: string, opts?: BubbleOpts): BubbleHandle {
    return this.bubbles.open(at, text, opts);
  }

  toast(text: string, icon?: IconId, seconds?: number): void {
    if (this.disposed) return;
    this.toasts.show(text, icon, seconds);
  }

  choice(title: string, options: ChoiceOption[], opts?: { subtitle?: string; defaultId?: string }): Promise<string> {
    if (this.disposed) return Promise.resolve(opts?.defaultId ?? options[0]?.id ?? '');
    this.choiceView.looks = this.family_.looks;
    this.choiceView.hintEl.innerHTML = this.device === 'touch' ? 'Tap a card' : this.glyphText('{navigate} Choose   {confirm} Pick');
    return this.choiceView.open(title, options, opts);
  }

  setHud(hud: HudState | null): void {
    if (this.disposed) return;
    this.hud.set(hud);
  }

  prompt(p: PromptSpec | null): void {
    if (this.disposed) return;
    this.promptView.set(p, glyphKey(this.glyphCtx()));
    if (p?.at) this.promptView.update(this.projector);
  }

  instruction(text: string | null, sub?: string): void {
    if (this.disposed) return;
    this.instr.set(text, sub);
  }

  activityLayer(): HTMLElement {
    return this.activity;
  }

  portraits(p: PortraitRow | null): void {
    if (this.disposed) return;
    this.portraitView.set(p);
  }

  takeClicks(): readonly string[] {
    if (this.clicks.length === 0) return EMPTY;
    const out = this.clicks;
    this.clicks = [];
    return out;
  }

  update(dt: number): void {
    if (this.disposed) return;
    const d = Number.isFinite(dt) ? Math.min(0.25, Math.max(0, dt)) : 0;
    this.time += d;
    this.screens[this.current].update?.(d);
    const paused = this.current === 'pause' || this.returnTo_ === 'pause';
    if (!paused) {
      this.actCardView.update(d);
      this.bossView.update(d);
      this.banners.update(d);
      this.bubbles.update(d, this.size());
    }
    this.promptView.update(this.projector);
    this.toasts.update(d);
    if (this.device === 'touch') {
      this.touchPoll -= d;
      if (this.touchPoll <= 0) {
        this.touchPoll = 0.4;
        const k = glyphKey(this.glyphCtx());
        if (k !== this.lastGlyphKey) this.refreshGlyphs();
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.screens[this.current].leave?.();
    this.disposed = true;
    this.observer?.disconnect();
    this.actCardView.dispose();
    this.bossView.dispose();
    this.choiceView.dispose();
    this.bubbles.clear();
    this.banners.clear();
    this.listeners.clear();
    this.layer.remove();
  }

  // ── debug / tests / dev gallery ────────────────────────────────────────────

  get debug(): {
    banner: string | null;
    bannerStyle: BannerStyle | null;
    toasts: string[];
    bubbles: number;
    instruction: string | null;
    returnTo: ScreenId | null;
    actCard: boolean;
    boss: boolean;
    choice: boolean;
    settings: Readonly<Settings>;
    family: Readonly<FamilySetup>;
  } {
    return {
      banner: this.banners.showing,
      bannerStyle: this.banners.showingStyle,
      toasts: this.toasts.texts,
      bubbles: this.bubbles.active,
      instruction: this.instr.text_,
      returnTo: this.returnTo_,
      actCard: this.actCardView.active,
      boss: this.bossView.active,
      choice: this.choiceView.active,
      settings: this.settings_,
      family: this.family_,
    };
  }

  screenEl(id: ScreenId): HTMLElement {
    return this.screens[id].el;
  }

  /** Freeze (0) / resume (1) the dt-driven cards (dev gallery screenshots). */
  setCardTimeScale(k: number): void {
    this.actCardView.timeScale = k;
    this.bossView.timeScale = k;
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private switchTo(id: ScreenId, prev: ScreenId): void {
    const old = this.screens[prev];
    old.leave?.();
    old.focus?.blur();
    old.el.classList.remove('is-active');
    this.activate(id, prev);
    const wasGame = GAME_SCREENS.has(prev) || (SUB_SCREENS.has(prev) && this.returnTo_ === 'pause');
    const isGame = GAME_SCREENS.has(id) || (SUB_SCREENS.has(id) && this.returnTo_ === 'pause');
    if (wasGame && !isGame) {
      this.bubbles.clear();
      this.banners.clear();
    }
  }

  private activate(id: ScreenId, from: ScreenId): void {
    this.current = id;
    this.layer.dataset.screen = id;
    const inGame = GAME_SCREENS.has(id) || (SUB_SCREENS.has(id) && this.returnTo_ === 'pause');
    this.layer.dataset.mode = inGame ? 'game' : 'menu';
    const s = this.screens[id];
    s.el.classList.add('is-active');
    s.focus?.freezeHover();
    s.enter(from);
    s.focus?.repaint();
  }

  private handleAction(a: MenuAction): boolean {
    if (a === 'mute') {
      const muted = !this.settings_.muted;
      this.changeSettings({ muted });
      this.toasts.show(muted ? 'Sound off' : 'Sound on', 'music', 1.6);
      return true;
    }
    if (this.current === 'none') {
      if (this.bossView.active) {
        if (a === 'confirm' || a === 'back') this.bossView.skip();
        return a !== 'pause';
      }
      if (this.actCardView.active) {
        if (a === 'confirm' || a === 'back') this.actCardView.skip();
        return a !== 'pause';
      }
      if (this.choiceView.active) {
        if (a === 'pause') return false;
        return this.choiceView.handle(a);
      }
      if (a === 'confirm') {
        this.emit({ type: 'skip' });
        return true;
      }
      return false; // 'pause' etc. → the game
    }
    const scr = this.screens[this.current];
    if (scr.action?.(a)) return true;
    if (a === 'back') {
      const before = this.current;
      if (!scr.back || scr.back() === false) this.sound('denied');
      else if (this.current !== before) this.sound('back');
      return true;
    }
    if (a === 'pause') {
      if (SUB_SCREENS.has(this.current) && this.returnTo_ === 'pause') this.emit({ type: 'resume' });
      return true;
    }
    const focus = scr.focus;
    if (!focus) return false;
    const item = focus.current;
    const res = focus.handle(a as NavDir | NavStep | 'confirm');
    if (res === 'moved' || res === 'adjusted') this.sound(res === 'adjusted' ? 'toggle' : 'move');
    else if (res === 'activated' && item?.sound !== 'none') this.sound(item?.sound === 'back' ? 'back' : 'confirm');
    return true;
  }

  private emit(cmd: UiCommand): void {
    for (const cb of [...this.listeners]) {
      try {
        cb(cmd);
      } catch (e) {
        console.error('[ui] command listener threw', e);
      }
    }
  }

  private absorb(d: ScreenData): void {
    if (d.settings) {
      this.settings_ = { ...DEFAULT_SETTINGS, ...d.settings };
      this.applySettingsAttrs();
    }
    if (d.family) {
      this.family_ = cloneFamily(d.family);
      this.syncLooks();
    }
    if (d.stats !== undefined) this.stats_ = d.stats ?? null;
    if (d.report !== undefined) this.report_ = d.report ?? null;
    if (d.dailyBest !== undefined) this.dailyBest_ = d.dailyBest ?? null;
  }

  private changeSettings(patch: Partial<Settings>): void {
    this.settings_ = { ...this.settings_, ...patch };
    this.applySettingsAttrs();
    if (this.current === 'settings') this.screens.settings.refresh?.();
    this.emit({ type: 'settings', patch: { ...patch } });
  }

  private changeFamily(f: FamilySetup): void {
    this.family_ = cloneFamily(f);
    this.syncLooks();
    this.emit({ type: 'family', family: cloneFamily(f) });
  }

  private syncLooks(): void {
    const looks = this.family_.looks;
    this.portraitView.setLooks(looks);
    this.portraitView.refreshGlyphs();
    this.choiceView.looks = looks;
    this.bossView.looks = looks;
    this.bubbles.dogName = looks.dog.name;
  }

  private applySettingsAttrs(): void {
    const reduced = this.reducedMotion();
    const m = reduced ? 'reduced' : 'full';
    if (this.layer.dataset.motion !== m) this.layer.dataset.motion = m;
  }

  reducedMotion(): boolean {
    return this.settings_.reducedMotion || prefersReducedMotion() || this.root.classList.contains('bhd-reduced-motion');
  }

  private sound(kind: UiSound): void {
    try {
      this.root.dispatchEvent(new CustomEvent(UI_SOUND_EVENT, { bubbles: true, detail: { kind } }));
    } catch {
      /* ignore */
    }
  }

  private touchInfo(slot: 'primary' | 'secondary' | 'alt'): TouchButtonInfo | null {
    const b = this.root.querySelector<HTMLElement>(`.bhd-touch__btn--${slot}`);
    if (!b || b.dataset.on !== 'true') return null;
    const label = b.querySelector('.bhd-touch__label')?.textContent ?? '';
    const cls = b.querySelector('.bhd-touch__icon svg')?.getAttribute('class') ?? '';
    const m = /bhd-ico--([a-zA-Z]+)/.exec(cls);
    const icon: ControlIcon = m && isControlIcon(m[1]) ? (m[1] as ControlIcon) : 'go';
    return { icon, label };
  }

  private glyphCtx(): GlyphContext {
    return { device: this.device, pad: this.pad, touch: (s) => this.touchInfo(s) };
  }

  glyph(token: GlyphToken): string {
    return glyphHtml(token, this.glyphCtx());
  }

  glyphText(text: string): string {
    return renderGlyphText(text, this.glyphCtx());
  }

  private refreshCardHints(): void {
    const hint = this.device === 'touch' ? `<span class="bhd-skip__t">TAP TO SKIP</span>` : `${this.glyph('confirm')}<span class="bhd-skip__t">SKIP</span>`;
    this.actCardView.setSkipHint(hint);
    this.bossView.setSkipHint(hint);
  }

  private refreshGlyphs(): void {
    const ctx = this.glyphCtx();
    this.lastGlyphKey = glyphKey(ctx);
    this.promptView.refresh(this.lastGlyphKey);
    this.portraitView.refreshGlyphs();
    this.refreshCardHints();
    if (this.choiceView.active) this.choiceView.hintEl.innerHTML = this.device === 'touch' ? 'Tap a card' : this.glyphText('{navigate} Choose   {confirm} Pick');
    this.screens[this.current].refreshGlyphs?.();
    this.hydrate();
  }

  /** Fill `.bhd-glyph[data-slot]` / `.bhd-chip[data-slot]` elements in the activity layer. */
  private hydrate(): void {
    const ctx = this.glyphCtx();
    const key = glyphKey(ctx);
    const nodes = this.activity.querySelectorAll<HTMLElement>('.bhd-glyph[data-slot], .bhd-chip[data-slot]');
    nodes.forEach((n) => {
      const slot = n.dataset.slot ?? '';
      if (!isGlyphToken(slot)) return;
      const k = `${key}|${slot}`;
      if (n.dataset.glyphKey === k) return;
      let g = n.querySelector<HTMLElement>(':scope > .bhd-glyph__g');
      if (!g) {
        g = el('span', { class: 'bhd-glyph__g' });
        n.prepend(g);
      }
      g.innerHTML = glyphHtml(slot, ctx);
      n.dataset.glyphKey = k;
    });
  }

  private size(): Size {
    if (this.sizeFrame++ % 30 === 0) {
      const w = this.layer.clientWidth;
      const h = this.layer.clientHeight;
      this.sizeCache = { w: w > 0 ? w : 1, h: h > 0 ? h : 1 };
    }
    return this.sizeCache;
  }

  private makeFocus(mode: NavMode): FocusGroup {
    return new FocusGroup(
      (res, item) => {
        if (res === 'moved') this.sound('move');
        else if (res === 'activated' && item.sound !== 'none') this.sound(item.sound === 'back' ? 'back' : 'confirm');
      },
      { mode },
    );
  }

  private open(sub: SubScreen): void {
    const back: ScreenId = SUB_SCREENS.has(this.current) ? (this.returnTo_ ?? 'menu') : this.current === 'pause' ? 'pause' : 'menu';
    const prev = this.current;
    this.returnTo_ = back;
    this.switchTo(sub, prev);
  }

  private close(): void {
    const to = this.returnTo_ ?? 'menu';
    const prev = this.current;
    this.returnTo_ = null;
    this.switchTo(to, prev);
  }

  private makeCtx(): UiCtx {
    const self = this;
    return {
      get device() {
        return self.device;
      },
      get pad() {
        return self.pad;
      },
      get settings() {
        return self.settings_;
      },
      get family() {
        return self.family_;
      },
      get stats() {
        return self.stats_;
      },
      get report() {
        return self.report_;
      },
      get dailyBest() {
        return self.dailyBest_;
      },
      get returnTo() {
        return self.returnTo_;
      },
      emit: (c) => this.emit(c),
      changeSettings: (p) => this.changeSettings(p),
      changeFamily: (f) => this.changeFamily(f),
      open: (s) => this.open(s),
      close: () => this.close(),
      go: (id) => {
        const prev = this.current;
        this.returnTo_ = null;
        this.switchTo(id, prev);
      },
      sound: (k) => this.sound(k),
      glyph: (t) => this.glyph(t),
      glyphText: (t) => this.glyphText(t),
      createFocus: (mode) => this.makeFocus(mode ?? 'spatial'),
      toast: (t) => this.toasts.show(t),
      clock: () => this.time,
      reducedMotion: () => this.reducedMotion(),
    };
  }
}

const EMPTY: readonly string[] = Object.freeze([]);
