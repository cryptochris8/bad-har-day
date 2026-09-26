// Engine lifecycle & robustness (adapted from ATHLETE MAYHEM / TRASH PANDA TROUBLE) with a stubbed
// Web Audio: unlock, locked contexts, gamepad-style retries, device loss, iOS interruptions, hidden
// tabs, a wedged clock, and "nothing ever throws into the game loop". Plus: the remembered music
// track and live loops survive a rebuilt context.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, createAudioEngine, ERROR_COOLDOWN_MS, MAX_DEVICE_FAILURES, RETRY_MS, STALL_MS } from '../../src/audio/index';
import type { AudioEngine, BabbleMood, LoopId, MusicId, SfxId, Voice } from '../../src/audio/types';
import { type FakeEnv, FakeAudioContext, installFakeAudio, uninstallFakeAudio } from './fakeAudio';

let env: FakeEnv;
beforeEach(() => {
  env = installFakeAudio();
});
afterEach(() => uninstallFakeAudio());

/** Exercise the whole public API, including hostile arguments. */
function everything(a: AudioEngine): void {
  a.play('blackBrushSting');
  a.play('brushStroke', { pitch: 1.2, pan: -0.4, volume: 0.8, delay: 0.1 });
  a.play('sectionClear', { pitch: NaN, pan: Infinity, volume: -1, delay: NaN });
  a.play('nope' as SfxId);
  const l = a.loop('brushing');
  l.set(0.5, 1.2);
  l.set(NaN);
  const bad = a.loop('vacuum' as LoopId);
  bad.set(1, 1);
  bad.stop();
  a.babble('heidi', 'GOOD MORNING!!!', 'excited');
  a.babble('dog', 'woof', 'nope' as BabbleMood);
  a.babble('ghost' as Voice, 'boo');
  a.babble('chris', undefined as unknown as string);
  a.setMusic('boss');
  a.setMusic('nope' as MusicId);
  a.setIntensity(1);
  a.setIntensity(NaN);
  a.duck(0.5, 1);
  a.duck(-1, Infinity);
  a.setVolumes({ master: 1, music: 0.5, sfx: 0.8 });
  a.setVolumes({ master: NaN, music: -3, sfx: 9 });
  a.setVolumes(null as never);
  a.setMuted(false);
  a.setPaused(true);
  a.play('uiConfirm');
  a.setPaused(false);
  a.update(0.016);
  a.update(NaN);
  a.setMusic('results', { fade: 0.2 });
  a.setMusic(null);
  a.setMusic('title', { fade: NaN });
  l.stop();
}

describe('unlock', () => {
  it('creates one context; later calls are cheap no-ops', () => {
    const a = createAudio();
    a.setMusic('title');
    a.unlock();
    expect(a.unlocked).toBe(true);
    a.unlock();
    a.unlock();
    expect(env.ctxs().length).toBe(1);
    expect(env.last().resumeCalls).toBe(0); // created running: no resume needed
    a.dispose();
  });

  it('locked by autoplay policy: stays locked, then the next real gesture unlocks', () => {
    FakeAudioContext.allowStart = false;
    const a = createAudio();
    a.unlock();
    expect(a.unlocked).toBe(false);
    FakeAudioContext.allowStart = true;
    env.win.dispatchEvent(new Event('keydown'));
    expect(a.unlocked).toBe(true);
    expect(env.ctxs().length).toBe(1);
    a.dispose();
  });

  it('touch: a tap (pointerup / touchend) re-arms and unlocks', () => {
    FakeAudioContext.allowStart = false;
    const a = createAudio();
    a.unlock();
    FakeAudioContext.allowStart = true;
    env.win.dispatchEvent(new Event('touchend'));
    expect(a.unlocked).toBe(true);
    a.dispose();
  });

  it('gamepad players: with sticky activation the scheduler keeps retrying resume() (≤ 1/s)', () => {
    FakeAudioContext.allowStart = false;
    const a = createAudio();
    a.unlock();
    vi.advanceTimersByTime(5000);
    expect(env.last().resumeCalls).toBe(1); // no activation yet: no retries
    env.activation.hasBeenActive = true;
    vi.advanceTimersByTime(3 * RETRY_MS + 50);
    expect(env.last().resumeCalls).toBeGreaterThanOrEqual(3);
    expect(env.last().resumeCalls).toBeLessThanOrEqual(5);
    FakeAudioContext.allowStart = true;
    vi.advanceTimersByTime(RETRY_MS + 50);
    expect(a.unlocked).toBe(true);
    a.dispose();
  });

  it('a failed first start (node creation throws) re-arms: the next gesture retries', () => {
    FakeAudioContext.explode = true;
    const a = createAudio();
    a.unlock();
    expect(a.unlocked).toBe(false);
    FakeAudioContext.explode = false;
    env.win.dispatchEvent(new Event('click'));
    expect(a.unlocked).toBe(true);
    a.dispose();
  });
});

describe('device loss & interruptions', () => {
  it("'error' (device lost) rebuilds at once when the page has activation — music and loops come back", () => {
    env.activation.hasBeenActive = true;
    const a = createAudioEngine();
    a.setMusic('drive');
    const engine = a.loop('engine');
    engine.set(0.7, 1.4);
    a.unlock();
    const first = env.last();
    first.dispatchEvent(new Event('error'));
    expect(first.state).toBe('closed');
    expect(env.ctxs().length).toBe(2);
    expect(a.unlocked).toBe(true);
    expect(a.music).toBe('drive');
    vi.advanceTimersByTime(300);
    expect(a.debugInfo().bpm).toBeGreaterThan(0);
    // The loop was re-attached on the new context.
    expect(env.last().sources().some((s) => s.kind === 'Oscillator' && s.stopAt! > 1000)).toBe(true);
    expect(a.debugInfo().loops).toBe(1);
    a.dispose();
  });

  it('closed under us without activation: rebuilt on the next gesture', () => {
    const a = createAudio();
    a.unlock();
    env.last().setState('closed');
    expect(a.unlocked).toBe(false);
    expect(env.ctxs().length).toBe(1);
    env.win.dispatchEvent(new Event('pointerup'));
    expect(env.ctxs().length).toBe(2);
    expect(a.unlocked).toBe(true);
    a.dispose();
  });

  it("iOS 'interrupted': resumes when the page comes back or on the next tap", () => {
    const a = createAudio();
    a.unlock();
    FakeAudioContext.allowStart = false;
    env.last().setState('interrupted');
    expect(a.unlocked).toBe(false);
    FakeAudioContext.allowStart = true;
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(a.unlocked).toBe(true);
    FakeAudioContext.allowStart = false;
    env.last().setState('interrupted');
    FakeAudioContext.allowStart = true;
    env.win.dispatchEvent(new Event('touchend'));
    expect(a.unlocked).toBe(true);
    expect(env.ctxs().length).toBe(1);
    a.dispose();
  });

  it('hidden tab suspends; visible again resumes (no gesture needed)', () => {
    const a = createAudio();
    a.unlock();
    env.doc.hidden = true;
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(env.last().state).toBe('suspended');
    vi.advanceTimersByTime(5000); // no retry fights the deliberate suspend
    expect(env.last().state).toBe('suspended');
    env.doc.hidden = false;
    env.doc.dispatchEvent(new Event('visibilitychange'));
    expect(a.unlocked).toBe(true);
    a.dispose();
  });

  it('a running context whose clock froze is rebuilt', () => {
    env.activation.hasBeenActive = true;
    const a = createAudio();
    a.unlock();
    vi.advanceTimersByTime(1000);
    expect(env.ctxs().length).toBe(1);
    env.last().frozen = true;
    vi.advanceTimersByTime(STALL_MS + 500);
    expect(env.ctxs().length).toBe(2);
    expect(a.unlocked).toBe(true);
    a.dispose();
  });

  it('no usable audio device (contexts keep erroring): capped rebuilds, then sound stays off — no rebuild per key press', () => {
    env.activation.hasBeenActive = true;
    const a = createAudio();
    a.unlock();
    for (let i = 0; i < 8; i++) env.last().dispatchEvent(new Event('error'));
    const built = env.ctxs().length;
    expect(built).toBeLessThanOrEqual(MAX_DEVICE_FAILURES);
    for (let i = 0; i < 5; i++) env.win.dispatchEvent(new Event('keydown'));
    a.unlock();
    expect(env.ctxs().length).toBe(built);
    expect(a.unlocked).toBe(false);
    expect(() => everything(a)).not.toThrow();
    a.dispose();
  });

  it('one device error without activation: the next gesture after the cooldown recovers', () => {
    const a = createAudio();
    a.unlock();
    env.last().dispatchEvent(new Event('error'));
    expect(a.unlocked).toBe(false);
    const now = performance.now();
    const spy = vi.spyOn(performance, 'now').mockReturnValue(now + ERROR_COOLDOWN_MS + 100);
    env.win.dispatchEvent(new Event('keydown'));
    expect(a.unlocked).toBe(true);
    spy.mockRestore();
    a.dispose();
  });
});

describe('never throws into the game loop', () => {
  it('before unlock every method is a silent no-op (no context is created)', () => {
    const a = createAudio();
    expect(() => everything(a)).not.toThrow();
    expect(env.ctxs().length).toBe(0);
    expect(a.unlocked).toBe(false);
    a.dispose();
  });

  it('a broken audio stack (node creation throws) is contained everywhere', () => {
    FakeAudioContext.explode = true;
    const a = createAudio();
    expect(() => {
      a.unlock();
      everything(a);
      vi.advanceTimersByTime(500);
      a.dispose();
    }).not.toThrow();
  });

  it('full API on a live context, a few seconds of scheduling, then after dispose', () => {
    const a = createAudio();
    a.unlock();
    expect(() => {
      everything(a);
      a.setMusic('rush');
      a.loop('rain').set(1, 1.5);
      vi.advanceTimersByTime(4000);
      a.dispose();
      everything(a);
      a.unlock();
      vi.advanceTimersByTime(1000);
    }).not.toThrow();
    expect(a.unlocked).toBe(false);
    expect(env.ctxs().length).toBe(1); // no zombie rebuild after dispose
    expect(env.last().state).toBe('closed');
  });

  it('resume() that throws synchronously is contained', () => {
    FakeAudioContext.allowStart = false;
    const a = createAudio();
    a.unlock();
    env.last().resume = () => {
      throw new Error('nope');
    };
    env.activation.hasBeenActive = true;
    expect(() => {
      env.win.dispatchEvent(new Event('keydown'));
      env.doc.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(3000);
    }).not.toThrow();
    a.dispose();
  });
});

describe('no Web Audio at all (jsdom / old browsers)', () => {
  it('every method is a silent no-op', () => {
    vi.stubGlobal('AudioContext', undefined);
    const a = createAudio();
    expect(() => {
      a.unlock();
      everything(a);
      vi.advanceTimersByTime(500);
    }).not.toThrow();
    expect(a.unlocked).toBe(false);
    a.dispose();
  });

  it('no window at all (SSR / worker) is fine too', () => {
    vi.stubGlobal('window', undefined);
    const a = createAudio();
    expect(() => {
      a.unlock();
      everything(a);
    }).not.toThrow();
    expect(a.unlocked).toBe(false);
    a.dispose();
  });
});
