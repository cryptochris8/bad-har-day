// ─────────────────────────────────────────────────────────────────────────────
// BAD HAIR DAY! audio engine. Everything is synthesized at runtime with Web Audio:
// no files, no network, no existing melodies.
//
//   createAudio() → AudioEngine   (contract: ./types.ts)
//
// • SFX (sfx.ts): every SfxId — per-sound cooldowns / voice limits / a global voice
//   budget (limits.ts), pan, delay, pitch, music ducking for stingers, room reverb sends.
// • Loops (loops.ts): brew / water / engine / rain / brushing / pourStream with live
//   set(volume, pitch) and stop(); remembered before unlock and across rebuilds.
// • Music (music.ts / song.ts): eight original looping tracks, crossfades, intensity layers.
// • Babble (babble.ts): Animal-Crossing-style gibberish per family member / mood.
// • Mixer (mixer.ts): master / music / sfx gain staging, pause & duck stages, master
//   compressor + soft-clip ceiling so stacked sounds never clip.
//
// The AudioContext is created lazily in unlock() (call it from a user gesture). Every
// method is a safe no-op until then — settings, the requested track, the intensity and
// any loops are remembered and applied on unlock.
//
// Robustness (from ATHLETE MAYHEM / TRASH PANDA TROUBLE): nothing here may throw into
// the game loop. The context is watched for 'statechange' / 'error' and a stalled
// clock; a dead context is torn down and rebuilt — immediately when the page already has
// user activation, otherwise on the next tap/key. iOS 'interrupted' and hidden→visible
// both resume; the context is suspended while the tab is hidden. unlock() is cheap and
// idempotent, so gamepad presses can retry it.
// ─────────────────────────────────────────────────────────────────────────────
import { babblePlan, type BabbleVoice, playBabble, VOICES } from './babble';
import { VoiceLimiter } from './limits';
import { LOOP_META, LoopVoice } from './loops';
import { buildMixer, duckParam, MIX_TRIM, type Mixer, PAUSE_MUSIC } from './mixer';
import { MusicPlayer } from './music';
import { warmPlucks } from './plucks';
import { playSfx, SFX_META } from './sfx';
import { SONGS } from './song';
import { silentBuffer, smoothSet } from './synth';
import type { AudioEngine, AudioSettings, BabbleMood, LoopHandle, LoopId, MusicId, SfxId, SfxOpts, Voice } from './types';

export type { AudioEngine } from './types';

/** Scheduler: wake every 25 ms, schedule 120 ms ahead. */
const TICK_MS = 25;
const LOOKAHEAD = 0.12;
/** A 'running' context whose clock has not moved for this long (wall ms, tab visible) is considered wedged. */
export const STALL_MS = 3000;
/** Retry resume() at most this often (wall ms) while locked but the page has user activation. */
export const RETRY_MS = 1000;
/** At most this many automatic rebuilds per minute (then wait for a user gesture). */
const MAX_REBUILDS_PER_MIN = 4;
/**
 * Circuit breaker for hosts with NO usable audio device (headless Chrome, locked-down kiosks): a context that errors
 * before it has run for DEVICE_OK_MS counts as a device failure. After a failure, unlock() is ignored for
 * ERROR_COOLDOWN_MS (no rebuild per key press), and after MAX_DEVICE_FAILURES in a row audio stays off for the
 * session — each rebuild is expensive (mixer graph + pluck pre-rendering) and would stall the game.
 */
export const MAX_DEVICE_FAILURES = 3;
export const ERROR_COOLDOWN_MS = 5000;
const DEVICE_OK_MS = 20000;
/** Start offset for scheduled one-shots (s): a hair ahead of "now" so the attack is never clipped. */
const START_DELAY = 0.005;
/** Default music crossfade (s). */
export const DEFAULT_FADE = 1.2;
/** Loop caps (a runaway loop() per frame can never pile up). */
export const MAX_LOOPS_PER_ID = 2;
export const MAX_LOOPS = 8;
/** Simultaneous babble lines (one per voice at most). */
export const MAX_BABBLES = 4;
/** update(dt) runs the scheduler itself when the timer has been late for this long (ms). */
const LATE_TICK_MS = 60;

/** Slider (0..1) → gain. Squared for a roughly perceptual taper. */
export function sliderToGain(v: number): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  return c * c;
}

/** Sanitised crossfade length (s): default 1.2, clamped to 0..8. */
export function clampFade(fade: number | undefined): number {
  return fade !== undefined && Number.isFinite(fade) ? Math.min(8, Math.max(0, fade)) : DEFAULT_FADE;
}

type AudioCtor = typeof AudioContext;
type CtxState = AudioContextState | 'interrupted';

/**
 * Events that carry user activation (HTML spec) — any of them can unlock audio. Deliberately not
 * pointerdown/touchstart: for touch those don't grant activation (the context would stay suspended).
 */
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown', 'mousedown'] as const;

const noop = (): void => undefined;
const wallNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function hasBeenActive(): boolean {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    return !!ua && ua.hasBeenActive;
  } catch {
    return false;
  }
}
const docHidden = (): boolean => typeof document !== 'undefined' && !!document.hidden;

const NOOP_LOOP: LoopHandle = { set: noop, stop: noop };

interface Speaking {
  text: string;
  mood: BabbleMood;
  v: BabbleVoice;
}

/** Live numbers for the dev bench (not part of the contract). */
export interface AudioDebugInfo {
  state: string;
  music: MusicId | null;
  bpm: number;
  intensityLevel: number;
  voices: number;
  loops: number;
  babbles: number;
  notes: number;
  paused: boolean;
  /** Current music duck depth (0 = none). */
  duck: number;
}

export class WebAudioEngine implements AudioEngine {
  private ctx: AudioContext | null = null;
  private mix: Mixer | null = null;
  private volumes: AudioSettings = { master: 1, music: 1, sfx: 1 };
  private isMuted = false;
  private paused = false;
  private track: MusicId | null = null;
  private intensity = 0;
  private player: MusicPlayer | null = null;
  private readonly fading: MusicPlayer[] = [];
  private readonly limiter = new VoiceLimiter<SfxId>();
  private readonly loops: LoopVoice[] = [];
  private readonly speaking = new Map<Voice, Speaking>();
  private duckUntil = 0;
  private duckDepth = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private hiddenSuspended = false;
  private gestureArmed = false;
  private docListening = false;
  private disposed = false;
  private watchCtx = 0;
  private watchWall = 0;
  private lastRetry = -Infinity;
  private readonly rebuilds: number[] = [];
  private deviceFailures = 0;
  private lastError = -Infinity;
  private runningSince = -Infinity;
  /** Audio permanently off for this session (no usable device). */
  private gaveUp = false;
  private cancelWarm: (() => void) | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;

  get unlocked(): boolean {
    return !this.disposed && !!this.ctx && this.ctx.state === 'running';
  }

  get muted(): boolean {
    return this.isMuted;
  }

  get music(): MusicId | null {
    return this.track;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  unlock(): void {
    // Right after a device error, don't rebuild on every gesture (see MAX_DEVICE_FAILURES).
    if (!this.ctx && wallNow() - this.lastError < ERROR_COOLDOWN_MS) return;
    this.doUnlock();
  }

  /** unlock() without the post-error cooldown (recover() rebuilds at once, within its own per-minute cap). */
  private doUnlock(): void {
    if (this.disposed || this.gaveUp) return;
    try {
      let ctx = this.ctx;
      if (ctx && ctx.state === 'running') {
        this.disarmGestureResume();
        return;
      }
      if (ctx && ctx.state === 'closed') {
        this.teardown();
        ctx = null;
      }
      if (!ctx) {
        if (!this.build()) return;
        ctx = this.ctx!;
        if (ctx.state === 'running') {
          this.disarmGestureResume();
          return;
        }
      }
      if (!docHidden()) {
        this.hiddenSuspended = false;
        void ctx.resume().catch(noop);
      }
      // iOS/WebKit unlock: start a 1-sample silent buffer inside the gesture.
      const src = ctx.createBufferSource();
      src.buffer = silentBuffer(ctx);
      src.connect(ctx.destination);
      src.start(0);
      if (ctx.state !== 'running') this.armGestureResume();
    } catch {
      // Audio is optional — never let it crash the game. Re-arm so the next gesture retries.
      this.armGestureResume();
    }
  }

  /** Create the context + mixer graph and restart the current track / loops. Returns false when Web Audio is unavailable. */
  private build(): boolean {
    if (typeof window === 'undefined') return false;
    const w = window as Window & { webkitAudioContext?: AudioCtor };
    const AC: AudioCtor | undefined = typeof AudioContext !== 'undefined' ? AudioContext : w.webkitAudioContext;
    if (!AC) return false;
    // iOS 17+: play through the ringer/silent switch like a game should.
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'playback';
    } catch {
      /* optional API */
    }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    try {
      this.mix = buildMixer(ctx);
      this.applyVolumes(true);
      this.applyPause(true);
      ctx.addEventListener('statechange', this.onStateChange);
      ctx.addEventListener('error', this.onCtxError);
    } catch (e) {
      this.teardown();
      throw e;
    }
    if (this.timer === null) this.timer = setInterval(this.tick, TICK_MS);
    this.listenDocument();
    this.resetWatch();
    if (this.track) this.startTrack(this.track, 0.8);
    const t = ctx.currentTime + 0.02;
    for (const l of this.loops) l.attach(ctx, this.mix.loops, t);
    try {
      this.cancelWarm = warmPlucks(ctx);
    } catch {
      /* optional */
    }
    return true;
  }

  private teardown(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.mix = null;
    this.analyser = null;
    try {
      this.player?.kill();
      for (const p of this.fading) p.kill();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.fading.length = 0;
    for (const l of this.loops) l.detach();
    this.speaking.clear();
    this.duckUntil = 0;
    this.limiter.reset();
    this.cancelWarm?.();
    this.cancelWarm = null;
    if (!ctx) return;
    try {
      ctx.removeEventListener('statechange', this.onStateChange);
      ctx.removeEventListener('error', this.onCtxError);
      if (ctx.state !== 'closed') void ctx.close().catch(noop);
    } catch {
      /* already gone */
    }
  }

  private recover(): void {
    if (this.disposed) return;
    this.teardown();
    const now = wallNow();
    while (this.rebuilds.length && now - this.rebuilds[0]! > 60000) this.rebuilds.shift();
    if (this.rebuilds.length < MAX_REBUILDS_PER_MIN && hasBeenActive() && !docHidden()) {
      this.rebuilds.push(now);
      this.doUnlock();
    } else this.armGestureResume();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.disarmGestureResume();
      this.unlistenDocument();
      for (const l of this.loops.slice()) l.stop();
      this.loops.length = 0;
    } catch {
      /* ignore */
    }
    this.teardown();
  }

  private listenDocument(): void {
    if (this.docListening || typeof document === 'undefined' || typeof window === 'undefined') return;
    this.docListening = true;
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pageshow', this.onWake);
    window.addEventListener('focus', this.onWake);
  }

  private unlistenDocument(): void {
    if (!this.docListening) return;
    this.docListening = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pageshow', this.onWake);
    window.removeEventListener('focus', this.onWake);
  }

  private readonly onVisibility = (): void => {
    try {
      const ctx = this.ctx;
      if (docHidden()) {
        if (ctx && ctx.state === 'running') {
          this.hiddenSuspended = true;
          void ctx.suspend().catch(noop);
        }
      } else {
        this.hiddenSuspended = false;
        this.wake();
      }
    } catch {
      /* never throw from an event handler */
    }
  };

  private readonly onWake = (): void => {
    try {
      if (!docHidden()) this.wake();
    } catch {
      /* ignore */
    }
  };

  private wake(): void {
    if (this.disposed) return;
    const ctx = this.ctx;
    this.resetWatch();
    if (!ctx) return;
    const st = ctx.state as CtxState;
    if (st === 'closed') this.recover();
    else if (st !== 'running') {
      void ctx.resume().catch(noop);
      this.armGestureResume();
    }
  }

  private readonly onStateChange = (): void => {
    try {
      const st = this.ctx?.state as CtxState | undefined;
      if (!st || this.disposed) return;
      if (st === 'running') {
        this.runningSince = wallNow();
        this.disarmGestureResume();
        this.resetWatch();
      } else if (st === 'closed') this.recover();
      else if (!this.hiddenSuspended) this.armGestureResume();
    } catch {
      /* ignore */
    }
  };

  private readonly onCtxError = (): void => {
    try {
      const now = wallNow();
      // A context that ran fine for a while and then errored is a real device change (headphones unplugged…):
      // start counting afresh. One that errors almost immediately means there is no usable device.
      if (now - this.runningSince > DEVICE_OK_MS && this.runningSince > -Infinity) this.deviceFailures = 0;
      this.deviceFailures++;
      this.lastError = now;
      this.runningSince = -Infinity;
      if (this.deviceFailures >= MAX_DEVICE_FAILURES) {
        this.gaveUp = true;
        this.teardown();
        this.disarmGestureResume();
        console.info('[audio] no usable audio device — sound disabled for this session');
        return;
      }
      this.recover();
    } catch {
      /* ignore */
    }
  };

  private armGestureResume(): void {
    if (this.gestureArmed || this.disposed || typeof window === 'undefined') return;
    this.gestureArmed = true;
    for (const type of GESTURES) window.addEventListener(type, this.onGesture, { capture: true, passive: true });
  }

  private disarmGestureResume(): void {
    if (!this.gestureArmed) return;
    this.gestureArmed = false;
    for (const type of GESTURES) window.removeEventListener(type, this.onGesture, { capture: true });
  }

  private readonly onGesture = (): void => {
    this.unlock();
  };

  private resetWatch(): void {
    this.watchCtx = this.ctx?.currentTime ?? 0;
    this.watchWall = wallNow();
  }

  /** Ready to make sound right now? */
  private live(): Mixer | null {
    return !this.disposed && this.ctx && this.mix && this.ctx.state === 'running' ? this.mix : null;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  setVolumes(v: AudioSettings): void {
    if (!v) return;
    this.volumes = { master: v.master, music: v.music, sfx: v.sfx };
    this.safe(() => this.applyVolumes(false));
  }

  setMuted(muted: boolean): void {
    this.isMuted = !!muted;
    this.safe(() => this.applyVolumes(false));
  }

  private applyVolumes(instant: boolean): void {
    const m = this.mix;
    const ctx = this.ctx;
    if (!m || !ctx) return;
    const now = ctx.currentTime;
    const set = (p: AudioParam, v: number): void => {
      if (instant) {
        p.cancelScheduledValues(now);
        p.setValueAtTime(v, now);
      } else smoothSet(p, v, now, 0.04);
    };
    set(m.master.gain, this.isMuted ? 0 : sliderToGain(this.volumes.master));
    set(m.music.gain, sliderToGain(this.volumes.music) * MIX_TRIM.music);
    set(m.sfx.gain, sliderToGain(this.volumes.sfx));
  }

  setPaused(paused: boolean): void {
    const p = !!paused;
    if (this.paused === p) return;
    this.paused = p;
    this.safe(() => this.applyPause(false));
  }

  private applyPause(instant: boolean): void {
    const m = this.mix;
    const ctx = this.ctx;
    if (!m || !ctx) return;
    const now = ctx.currentTime;
    const tc = instant ? 0.001 : 0.06;
    const p = this.paused;
    smoothSet(m.musicPause.gain, p ? PAUSE_MUSIC : 1, now, instant ? 0.001 : 0.12);
    smoothSet(m.gamePause.gain, p ? 0 : 1, now, tc);
    smoothSet(m.loopPause.gain, p ? 0 : MIX_TRIM.loops, now, tc);
    smoothSet(m.voicePause.gain, p ? 0 : MIX_TRIM.voice, now, tc);
    if (p) {
      // Lines in progress are cut (they would otherwise resume mid-word).
      for (const s of this.speaking.values()) s.v.cut(now);
      this.speaking.clear();
    }
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  setMusic(id: MusicId | null, opts?: { fade?: number }): void {
    if (id !== null && !SONGS[id]) return;
    if (id === this.track) return;
    this.track = id;
    const fade = clampFade(opts?.fade);
    this.safe(() => {
      if (this.ctx) this.startTrack(id, fade);
    });
  }

  private startTrack(id: MusicId | null, fade: number): void {
    const ctx = this.ctx;
    const m = this.mix;
    if (!ctx || !m) return;
    const now = ctx.currentTime;
    if (this.player) {
      this.player.stop(now, fade);
      this.fading.push(this.player);
      this.player = null;
    }
    // A burst of track switches: never keep more than two tails alive.
    while (this.fading.length > 2) this.fading.shift()!.kill();
    if (id === null) return;
    this.player = new MusicPlayer(ctx, m.music, id, now + 0.03, { fadeIn: Math.max(0.02, fade), intensity: this.intensity });
    if (ctx.state === 'running' && !this.isMuted) this.player.pump(now + LOOKAHEAD, now);
  }

  setIntensity(v: number): void {
    this.intensity = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
    this.safe(() => this.player?.setIntensity(this.intensity));
  }

  // ── Ducking ───────────────────────────────────────────────────────────────

  duck(amount: number, seconds: number): void {
    const a = Math.min(1, Math.max(0, Number.isFinite(amount) ? amount : 0));
    const s = Math.min(30, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
    if (a <= 0 || s <= 0) return;
    this.safe(() => {
      const m = this.live();
      if (m) this.applyDuck(m, a, s, m.ctx.currentTime);
    });
  }

  /** A shallower duck never cuts short a deeper one that is still in effect. */
  private applyDuck(m: Mixer, amount: number, seconds: number, at: number): void {
    const until = at + seconds;
    if (at < this.duckUntil && this.duckDepth > amount && this.duckUntil > until) return;
    this.duckUntil = until;
    this.duckDepth = amount;
    duckParam(m.musicDuck.gain, 1, amount, seconds, at);
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  play(id: SfxId, opts?: SfxOpts): void {
    try {
      const m = this.live();
      if (!m || this.isMuted) return;
      const meta = SFX_META[id];
      if (!meta) return;
      if (this.paused && meta.bus !== 'ui') return;
      const now = m.ctx.currentTime;
      if (!this.limiter.allow(id, meta, now)) return;
      const delay = opts?.delay !== undefined && Number.isFinite(opts.delay) ? Math.min(10, Math.max(0, opts.delay)) : 0;
      const t = now + START_DELAY + delay;
      const end = playSfx(m.ctx, meta.bus === 'ui' ? m.ui : m.game, id, t, { pitch: opts?.pitch, volume: opts?.volume, pan: opts?.pan, wet: m.wet });
      if (end <= t) return;
      this.limiter.commit(id, now, end);
      if (meta.duck) this.applyDuck(m, meta.duck.amount, meta.duck.seconds, t);
    } catch {
      // A malformed option must never take the game down.
    }
  }

  // ── Loops ─────────────────────────────────────────────────────────────────

  loop(id: LoopId): LoopHandle {
    try {
      if (this.disposed || !LOOP_META[id]) return NOOP_LOOP;
      let same = 0;
      for (const l of this.loops) if (l.id === id) same++;
      if (same >= MAX_LOOPS_PER_ID) this.loops.find((l) => l.id === id)?.stop();
      if (this.loops.length >= MAX_LOOPS) this.loops[0]?.stop();
      const v = new LoopVoice(id, this.removeLoop);
      this.loops.push(v);
      if (this.ctx && this.mix) v.attach(this.ctx, this.mix.loops, this.ctx.currentTime + 0.01);
      return v;
    } catch {
      return NOOP_LOOP;
    }
  }

  private readonly removeLoop = (v: LoopVoice): void => {
    const i = this.loops.indexOf(v);
    if (i >= 0) this.loops.splice(i, 1);
  };

  // ── Babble ────────────────────────────────────────────────────────────────

  babble(voice: Voice, text: string, mood: BabbleMood = 'normal'): void {
    try {
      const m = this.live();
      if (!m || this.isMuted || this.paused || !VOICES[voice]) return;
      const now = m.ctx.currentTime;
      const line = typeof text === 'string' ? text : '';
      const prev = this.speaking.get(voice);
      if (prev && prev.v.end > now) {
        // The same line again (e.g. called every frame while a bubble is up): ignore it.
        if (prev.text === line && prev.mood === mood) return;
        prev.v.cut(now);
        this.speaking.delete(voice);
      }
      let active = 0;
      for (const [k, s] of this.speaking) {
        if (s.v.end > now) active++;
        else this.speaking.delete(k);
      }
      if (active >= MAX_BABBLES) return;
      const plan = babblePlan(voice, line, mood);
      if (plan.syllables.length === 0) return;
      const v = playBabble(m.ctx, m.voice, now + START_DELAY, plan);
      this.speaking.set(voice, { text: line, mood, v });
    } catch {
      /* audio is optional */
    }
  }

  // ── Scheduler heartbeat (also the lock-retry + stall watchdog) ────────────

  update(_dt: number): void {
    if (this.timer !== null && wallNow() - this.lastTick > LATE_TICK_MS) this.tick();
  }

  private readonly tick = (): void => {
    try {
      const w = wallNow();
      this.lastTick = w;
      const ctx = this.ctx;
      if (!ctx || this.disposed) return;
      if (ctx.state !== 'running') {
        if (!this.hiddenSuspended && !docHidden() && ctx.state !== 'closed' && w - this.lastRetry >= RETRY_MS && hasBeenActive()) {
          this.lastRetry = w;
          void ctx.resume().catch(noop);
        }
        return;
      }
      const now = ctx.currentTime;
      if (now > this.watchCtx + 0.001) {
        this.watchCtx = now;
        this.watchWall = w;
      } else if (w - this.watchWall > STALL_MS && !docHidden()) {
        this.recover();
        return;
      }
      // Muted: keep the transport moving in time without scheduling notes.
      const until = now + LOOKAHEAD;
      this.player?.pump(until, now, this.isMuted);
      for (let i = this.fading.length - 1; i >= 0; i--) {
        const p = this.fading[i]!;
        p.pump(until, now, this.isMuted);
        if (p.finished) this.fading.splice(i, 1);
      }
      if (!this.paused && !this.isMuted) for (const l of this.loops) l.pump(now + LOOKAHEAD, now);
    } catch {
      // A scheduler hiccup must never escape the timer.
    }
  };

  // ── Dev bench extras (not part of the contract) ───────────────────────────

  /** Peak output level (0..1) right now — creates a tap on first use (dev meter only). */
  level(): number {
    try {
      const m = this.mix;
      const ctx = this.ctx;
      if (!m || !ctx) return 0;
      if (!this.analyser) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        m.out.connect(this.analyser);
        this.meterBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
      }
      const buf = this.meterBuf!;
      this.analyser.getFloatTimeDomainData(buf);
      let pk = 0;
      for (let i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]!));
      return pk;
    } catch {
      return 0;
    }
  }

  debugInfo(): AudioDebugInfo {
    let babbles = 0;
    const now = this.ctx?.currentTime ?? 0;
    for (const s of this.speaking.values()) if (s.v.end > now) babbles++;
    return {
      state: this.disposed ? 'disposed' : (this.ctx?.state ?? 'none'),
      music: this.track,
      bpm: this.player?.bpm ?? 0,
      intensityLevel: this.player?.intensityLevel ?? 0,
      voices: this.limiter.count,
      loops: this.loops.length,
      babbles,
      notes: this.player?.notes ?? 0,
      paused: this.paused,
      duck: now < this.duckUntil ? this.duckDepth : 0,
    };
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

/** The engine with its dev-bench extras (debugInfo, level). */
export function createAudioEngine(): WebAudioEngine {
  return new WebAudioEngine();
}

export function createAudio(): AudioEngine {
  return new WebAudioEngine();
}
