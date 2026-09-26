// BAD HAIR DAY! — the app: builds every subsystem, runs the frame loop, owns the screens state machine
// (boot → title/menu → morning → results) and the pause/settings/family-setup plumbing.
import { createAudio } from '../audio';
import type { AudioEngine } from '../audio/types';
import { createFamily } from '../family';
import type { Family } from '../family/types';
import { createInput } from '../input';
import type { InputManager } from '../input/types';
import { dailySeed, dateKeyOf, generatePlan, type ActNumber, type ActivityId } from '../plan';
import { createFx } from '../render/fx';
import { GameRenderer, detailTier } from '../render/renderer';
import type { Fx, Quality } from '../render/types';
import { createSaveStore } from '../storage';
import type { SaveStore, Settings } from '../storage/types';
import { createUI } from '../ui';
import type { UiCommand, UiManager } from '../ui/types';
import { createWorld } from '../world';
import type { World } from '../world/types';
import { installAudioUnlock } from './audioUnlock';
import { CameraDirectorImpl, dollhouseGoal } from './cameraDirector';
import { GameClockImpl } from './clock';
import { detectPlatform, renderDpr, type PlatformInfo } from './device';
import { Fader } from './fade';
import { FullscreenController } from './fullscreen';
import { InteractionsImpl } from './interactions';
import { Morning, MATTRESS_H } from './morning';
import { NpcsImpl } from './npcs';
import { PointerImpl } from './pointer';
import { installViewport } from './viewport';
import { WalkerImpl } from './walker';

export interface AppParams {
  seed: number | null;
  quality: Quality | null;
  /** Jump straight to an act (dev/e2e). */
  act: ActNumber | null;
  /** Play a single activity (dev/e2e). */
  activity: ActivityId | null;
  autostart: boolean;
  noBoot: boolean;
  debug: boolean;
}

type AppScreen = 'boot' | 'menus' | 'playing' | 'paused' | 'results';

export class App {
  readonly save: SaveStore;
  readonly renderer: GameRenderer;
  readonly world: World;
  family: Family;
  readonly fx: Fx;
  readonly audio: AudioEngine;
  readonly input: InputManager;
  readonly ui: UiManager;
  readonly pointer: PointerImpl;
  readonly npcs: NpcsImpl;
  readonly interactions: InteractionsImpl;
  readonly camera: CameraDirectorImpl;
  walker: WalkerImpl;
  clock = new GameClockImpl(315);
  morning: Morning | null = null;
  screen: AppScreen = 'boot';

  private readonly platform: PlatformInfo;
  private readonly fader: Fader;
  private readonly fullscreen: FullscreenController;
  private last = 0;
  private time = 0;
  private attractT = 0;
  private lastScheme: unknown = undefined;
  private raf = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly params: AppParams,
  ) {
    this.save = createSaveStore();
    const settings = this.save.data.settings;
    this.platform = detectPlatform(window);
    const quality = params.quality ?? settings.quality;
    this.renderer = new GameRenderer(root, quality);
    const fade = document.createElement('div');
    fade.className = 'bhd-fade';
    root.appendChild(fade);
    this.fader = new Fader(fade);
    this.fullscreen = new FullscreenController(document, this.platform);

    this.world = createWorld({ quality: detailTier(quality, this.platform.touchPrimary) });
    this.renderer.scene.add(this.world.root);
    this.family = createFamily(this.save.data.family.looks);
    this.addFamily();
    this.fx = createFx({ quality: detailTier(quality, this.platform.touchPrimary), floor: (x, z) => this.world.floorAt(x, z) });
    this.renderer.scene.add(this.fx.root);
    this.audio = createAudio();
    this.input = createInput({ touchRoot: root });
    this.ui = createUI({ root, projector: this.renderer.projector });
    this.pointer = new PointerImpl(this.renderer.canvas, root);
    this.npcs = new NpcsImpl(this.world);
    this.interactions = new InteractionsImpl(this.world);
    this.walker = new WalkerImpl(this.family.chris, this.world, this.audio);
    this.camera = new CameraDirectorImpl(this.renderer.rig, this.world, () => this.family.chris.root);

    installViewport(root, window, (size) => {
      const q = this.params.quality ?? this.save.data.settings.quality;
      this.renderer.resize(size.w, size.h, renderDpr(size.dpr, size.w, size.h, this.platform.touchPrimary, q));
      this.camera.zoom = size.w / Math.max(1, size.h) < 0.8 ? 1.3 : 1;
    });
    installAudioUnlock(window, this.audio);
    this.input.onFirstGesture(() => this.audio.unlock());
    this.input.onDeviceChange((dev) => this.ui.setInputDevice(dev, this.input.gamepad().style));
    this.input.onGamepadConnection((connected, _info) => {
      if (!connected && this.screen === 'playing') this.pause();
    });
    this.ui.setInputDevice(this.input.lastDevice, this.input.gamepad().style);
    this.ui.onCommand((cmd) => this.command(cmd));
    window.addEventListener('blur', () => {
      if (this.screen === 'playing') this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'playing') this.pause();
      this.audio.setPaused(document.hidden || this.screen === 'paused');
    });
    this.applySettings(settings);
    this.attractScene();
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
    this.fader.fromBlack();
    if (this.params.autostart || this.params.act !== null || this.params.activity !== null) {
      this.ui.showScreen('none');
      this.newMorning({ seed: this.params.seed, act: this.params.act, activity: this.params.activity });
      return;
    }
    if (this.params.noBoot) {
      this.toMenus('title');
      return;
    }
    void this.ui.boot().then(() => {
      if (this.screen === 'boot') this.screen = 'menus';
    });
  }

  private addFamily(): void {
    const s = this.renderer.scene;
    for (const m of this.family.members) s.add(m.root);
    s.add(this.family.dog.root);
  }

  /** Rebuild the family after FAMILY SETUP changes (menus only). */
  private rebuildFamily(): void {
    this.npcs.clear();
    this.family.dispose();
    this.family = createFamily(this.save.data.family.looks);
    this.addFamily();
    this.walker = new WalkerImpl(this.family.chris, this.world, this.audio);
    this.attractScene();
  }

  /** Title/menu backdrop: 5:15 AM, everybody asleep, a slow drift over the dollhouse. */
  private attractScene(): void {
    this.clock = new GameClockImpl(315);
    this.world.setClock(315);
    this.world.setWeather('clear');
    for (const id of ['ashley', 'addy', 'ellie', 'heidi'] as const) {
      const c = this.family.member(id);
      const a = this.world.anchor(id === 'ashley' ? 'masterBedAshley' : id === 'addy' ? 'bedAddy' : id === 'ellie' ? 'bedEllie' : 'bedHeidi');
      this.npcs.release(c);
      c.root.position.set(a.x, a.y, a.z);
      c.root.rotation.y = a.yaw;
      c.setOutfit('sleep');
      c.setPose('lie', { seatHeight: MATTRESS_H, side: id === 'heidi' ? 1 : 0.4 });
      c.setExpression('asleep');
      c.emote('zzz');
      c.hair?.setBedhead(1);
    }
    for (const b of ['addy', 'ellie', 'heidi', 'master'] as const) this.world.bed(b).setBlanket('tucked');
    const chris = this.family.chris;
    const cb = this.world.anchor('masterBedChris');
    this.npcs.release(chris);
    chris.root.position.set(cb.x, cb.y, cb.z);
    chris.root.rotation.y = cb.yaw;
    chris.setOutfit('sleep');
    chris.setPose('lie', { seatHeight: MATTRESS_H, side: -0.5 });
    chris.setExpression('asleep');
    this.npcs.placeAt(this.family.dog, 'dogBed');
    this.family.dog.setPose('sleep');
    this.attractT = 0;
  }

  private attractCamera(dt: number): void {
    this.attractT += dt;
    const t = this.attractT;
    const a = this.world.anchor('vanity');
    const b = this.world.anchor('bedHeidi');
    const k = 0.5 + 0.5 * Math.sin(t * 0.045);
    const g = dollhouseGoal(a.x + (b.x - a.x) * k, (a.z + b.z) / 2 + 1, 0, 0, 1.45);
    this.camera.shot(g, 1.2);
    if (t < 0.05) this.renderer.rig.snap();
  }

  private toMenus(id: 'title' | 'menu'): void {
    this.screen = 'menus';
    this.input.setMode('menu');
    this.input.setScheme(null);
    this.audio.setMusic('title');
    this.ui.showScreen(id, this.screenData());
  }

  private screenData() {
    const today = dateKeyOf(new Date());
    return {
      settings: this.save.data.settings,
      family: this.save.data.family,
      stats: this.save.data.stats,
      dailyBest: this.save.data.stats.daily[today] ?? null,
    };
  }

  // ── morning ───────────────────────────────────────────────────────────────

  newMorning(opts: { seed?: number | null; daily?: boolean; act?: ActNumber | null; activity?: ActivityId | null } = {}): void {
    this.morning?.dispose();
    const today = dateKeyOf(new Date());
    const seed = opts.daily ? dailySeed(today) : (opts.seed ?? (Math.floor(Math.random() * 0x7fffffff) ^ Date.now()) >>> 0);
    const plan = generatePlan(seed, { daily: !!opts.daily, dateKey: opts.daily ? today : null });
    this.clock = new GameClockImpl(315);
    this.ui.showScreen('none');
    this.screen = 'playing';
    this.fader.fromBlack();
    const m = new Morning(
      {
        scene: this.renderer.scene,
        renderer: this.renderer.renderer,
        projector: this.renderer.projector,
        world: this.world,
        family: this.family,
        fx: this.fx,
        audio: this.audio,
        ui: this.ui,
        input: this.input,
        pointer: this.pointer,
        camera: this.camera,
        walker: this.walker,
        npcs: this.npcs,
        interactions: this.interactions,
        clock: this.clock,
        settings: () => this.save.data.settings,
        dogName: () => this.save.data.family.looks.dog.name,
        bestArrival: () => this.save.data.stats.bestArrival,
        rumble: (k) => this.input.rumble(k),
        seen: (key) => !!this.save.data.seen[key],
        markSeen: (key) => this.save.markSeen(key),
      },
      plan,
    );
    this.morning = m;
    m.start({ act: opts.act ?? null, activity: opts.activity ?? null });
  }

  pause(): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.setMode('menu');
    this.input.reset();
    this.audio.setPaused(true);
    this.ui.showScreen('pause', this.screenData());
  }

  resume(): void {
    if (this.screen !== 'paused') return;
    this.screen = 'playing';
    this.audio.setPaused(false);
    this.ui.showScreen('none');
  }

  private quitToMenu(): void {
    this.morning?.dispose();
    this.morning = null;
    this.audio.setPaused(false);
    this.fader.fromBlack();
    this.pointer.disable();
    this.ui.prompt(null);
    this.ui.instruction(null);
    this.ui.portraits(null);
    this.ui.setHud(null);
    this.attractScene();
    this.toMenus('menu');
  }

  private showResults(): void {
    const m = this.morning;
    if (!m?.report) return;
    const newBest = this.save.recordMorning(m.report);
    const report = { ...m.report, newBestArrival: newBest };
    this.screen = 'results';
    this.input.setMode('menu');
    this.input.setScheme(null);
    this.ui.setHud(null);
    this.ui.prompt(null);
    this.audio.setMusic('results');
    this.ui.showScreen('results', { ...this.screenData(), report });
  }

  private command(cmd: UiCommand): void {
    switch (cmd.type) {
      case 'newMorning':
        this.fullscreen.maybeEnter(true);
        this.newMorning();
        break;
      case 'dailyMorning':
        this.fullscreen.maybeEnter(true);
        this.newMorning({ daily: true });
        break;
      case 'playAgain':
        this.newMorning();
        break;
      case 'resume':
        this.resume();
        break;
      case 'restartMorning': {
        const seed = this.morning?.plan.seed ?? null;
        const daily = this.morning?.plan.daily ?? false;
        this.audio.setPaused(false);
        this.newMorning({ seed, daily });
        break;
      }
      case 'quitToMenu':
      case 'toMenu':
        this.quitToMenu();
        break;
      case 'settings': {
        this.save.setSettings(cmd.patch);
        this.applySettings(this.save.data.settings);
        break;
      }
      case 'family':
        this.save.setFamily(cmd.family);
        if (!this.morning) this.rebuildFamily();
        break;
      case 'resetStats':
        this.save.resetStats();
        break;
      case 'fullscreen':
        this.fullscreen.enter();
        break;
      case 'skip':
        break;
    }
  }

  private applySettings(s: Readonly<Settings>): void {
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    this.audio.setMuted(s.muted);
    this.input.setTouchControls(s.touchControls);
    this.input.setTouchHand(s.touchHand);
    this.input.setVibrationEnabled(s.vibration);
    if (!this.params.quality) this.renderer.setQuality(s.quality);
    this.renderer.rig.shakeEnabled = s.screenShake && !s.reducedMotion;
    this.root.classList.toggle('bhd-reduced-motion', s.reducedMotion);
  }

  // ── frame loop ────────────────────────────────────────────────────────────

  private readonly tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.input.update(dt);
    const actions = this.input.getMenuActions();
    const clicks = this.ui.takeClicks();
    if (actions.includes('mute')) {
      this.save.setSettings({ muted: !this.save.data.settings.muted });
      this.applySettings(this.save.data.settings);
    }
    const m = this.morning;
    if (this.screen === 'playing' && m) {
      if (actions.includes('pause') || clicks.includes('pause')) this.pause();
      else if (m.inputMode === 'menu') this.ui.handleMenuActions(actions);
    } else this.ui.handleMenuActions(actions);

    const playing = this.screen === 'playing' && !!m;
    this.input.setMode(playing && m.inputMode === 'gameplay' ? 'gameplay' : 'menu');
    const controls = this.input.getControls();
    const gdt = playing ? dt : 0;
    this.pointer.update(gdt, controls, this.input.lastDevice);
    if (m) {
      m.update(gdt, controls, clicks.filter((c) => c !== 'pause'));
      const scheme = playing ? m.controlScheme : null;
      if (scheme !== this.lastScheme) {
        this.lastScheme = scheme;
        this.input.setScheme(scheme);
      }
      if (m.done && this.screen === 'playing') this.showResults();
    } else {
      this.attractCamera(dt);
      this.npcs.update(dt);
      this.camera.update(dt);
    }
    this.family.update(this.screen === 'paused' ? 0 : dt);
    this.world.update(dt, this.renderer.rig.camera);
    this.fx.update(gdt, this.renderer.rig.camera);
    this.audio.update(dt);
    this.fader.update(this.time);
    this.renderer.render(dt);
    this.ui.update(dt);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.morning?.dispose();
    this.ui.dispose();
    this.input.dispose();
    this.pointer.dispose();
    this.audio.dispose();
    this.fx.dispose();
    this.family.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}

