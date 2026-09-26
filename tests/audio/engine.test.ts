// Engine behaviour with a stubbed Web Audio: everything safe & remembered before unlock (music,
// volumes, mute, loops), cooldowns & voice limits, delay, mute, pause (UI keeps playing, gameplay
// sounds / babble stop, music keeps going quieter), ducking, music crossfades & intensity,
// babble replacement & caps, loop caps, update() and dispose().
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampFade, createAudioEngine, DEFAULT_FADE, MAX_BABBLES, MAX_LOOPS, MAX_LOOPS_PER_ID, sliderToGain } from '../../src/audio/index';
import { GLOBAL_VOICES } from '../../src/audio/limits';
import { SFX_IDS, SFX_META, sfxGain, sfxPitch } from '../../src/audio/sfx';
import { type FakeEnv, installFakeAudio, uninstallFakeAudio } from './fakeAudio';

let env: FakeEnv;
beforeEach(() => {
  env = installFakeAudio();
});
afterEach(() => uninstallFakeAudio());

/** Nodes created by `fn` on the live context. */
function nodesFor(fn: () => void): number {
  const before = env.last().nodes;
  fn();
  return env.last().nodes - before;
}

describe('pure helpers', () => {
  it('slider taper is squared and clamped', () => {
    expect(sliderToGain(1)).toBe(1);
    expect(sliderToGain(0.5)).toBeCloseTo(0.25, 9);
    expect(sliderToGain(-2)).toBe(0);
    expect(sliderToGain(7)).toBe(1);
    expect(sliderToGain(NaN)).toBe(0);
  });

  it('crossfade length: 1.2 s by default, clamped, 0 allowed (hard cut)', () => {
    expect(clampFade(undefined)).toBe(DEFAULT_FADE);
    expect(DEFAULT_FADE).toBeCloseTo(1.2, 9);
    expect(clampFade(NaN)).toBe(DEFAULT_FADE);
    expect(clampFade(-1)).toBe(0);
    expect(clampFade(0)).toBe(0);
    expect(clampFade(99)).toBe(8);
    expect(clampFade(0.4)).toBeCloseTo(0.4, 9);
  });

  it('dynamic sounds (brush strokes, footsteps) read volume as intensity and keep a floor', () => {
    const meta = SFX_META.brushStroke;
    expect(meta.dyn).toBeDefined();
    const gentle = sfxGain(meta, 0.1);
    const fast = sfxGain(meta, 1);
    expect(gentle.intensity).toBeCloseTo(0.1, 9);
    expect(fast.intensity).toBe(1);
    expect(gentle.gain).toBeGreaterThan(fast.gain * meta.dyn!);
    expect(gentle.gain).toBeLessThan(fast.gain);
    expect(sfxGain(meta, 0).gain).toBe(0);
    // Plain sounds: volume is just gain, intensity stays 1.
    const ui = sfxGain(SFX_META.uiMove, 0.5);
    expect(ui.gain).toBeCloseTo(SFX_META.uiMove.level * 0.5, 9);
    expect(ui.intensity).toBe(1);
    expect(sfxGain(SFX_META.uiMove, NaN).gain).toBeCloseTo(SFX_META.uiMove.level, 9);
  });

  it('pitch option is sanitised', () => {
    expect(sfxPitch(undefined)).toBe(1);
    expect(sfxPitch(NaN)).toBe(1);
    expect(sfxPitch(-2)).toBe(1);
    expect(sfxPitch(0.01)).toBe(0.25);
    expect(sfxPitch(10)).toBe(4);
    expect(sfxPitch(1.5)).toBe(1.5);
  });
});

describe('before unlock: ignored or remembered', () => {
  it('music is remembered and starts on unlock', () => {
    const a = createAudioEngine();
    a.setMusic('wake');
    expect(a.music).toBe('wake');
    expect(env.ctxs().length).toBe(0);
    a.unlock();
    vi.advanceTimersByTime(300);
    expect(a.debugInfo().bpm).toBeGreaterThan(0);
    expect(a.debugInfo().notes).toBeGreaterThan(0);
    a.dispose();
  });

  it('the LAST requested track wins (and null means silence on unlock)', () => {
    const a = createAudioEngine();
    a.setMusic('wake');
    a.setMusic('boss');
    expect(a.music).toBe('boss');
    a.setMusic(null);
    expect(a.music).toBeNull();
    a.unlock();
    vi.advanceTimersByTime(500);
    expect(a.debugInfo().bpm).toBe(0);
    a.dispose();
  });

  it('sfx and babble before unlock are ignored (no context, nothing queued)', () => {
    const a = createAudioEngine();
    a.play('blackBrushSting');
    a.babble('heidi', 'Good morning!', 'excited');
    expect(env.ctxs().length).toBe(0);
    a.unlock();
    vi.advanceTimersByTime(100);
    expect(a.debugInfo().voices).toBe(0);
    expect(a.debugInfo().babbles).toBe(0);
    a.dispose();
  });

  it('a loop requested before unlock keeps its parameters and starts on unlock', () => {
    const a = createAudioEngine();
    const h = a.loop('brushing');
    h.set(0.4, 1.3);
    expect(a.debugInfo().loops).toBe(1);
    a.unlock();
    // Attached on unlock: its looping noise source was created on the new context.
    expect(env.last().sources().some((s) => s.loop)).toBe(true);
    h.stop();
    expect(a.debugInfo().loops).toBe(0);
    h.stop(); // idempotent
    a.dispose();
  });

  it('a loop stopped before unlock never starts', () => {
    const a = createAudioEngine();
    a.loop('rain').stop();
    a.unlock();
    expect(a.debugInfo().loops).toBe(0);
    expect(env.last().sources().some((s) => s.loop)).toBe(false);
    a.dispose();
  });

  it('muted state is remembered before unlock', () => {
    const a = createAudioEngine();
    a.setMuted(true);
    a.unlock();
    expect(a.muted).toBe(true);
    expect(nodesFor(() => a.play('whistle'))).toBe(0);
    a.dispose();
  });
});

describe('sound scheduling', () => {
  it('play() schedules nodes once unlocked', () => {
    const a = createAudioEngine();
    a.unlock();
    expect(nodesFor(() => a.play('blackBrushSting'))).toBeGreaterThan(20);
    a.dispose();
  });

  it('per-sound cooldown drops rapid repeats (brush stroke spam)', () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(100);
    expect(nodesFor(() => a.play('brushStroke'))).toBeGreaterThan(0);
    expect(nodesFor(() => a.play('brushStroke'))).toBe(0); // same instant: inside the cooldown
    vi.advanceTimersByTime(Math.ceil(SFX_META.brushStroke.cooldown * 1000) + 20);
    expect(nodesFor(() => a.play('brushStroke'))).toBeGreaterThan(0);
    a.dispose();
  });

  it('a burst of 30 detangle pops in 30 ms plays at most the voice limit (no machine-gun)', () => {
    const a = createAudioEngine();
    a.unlock();
    let played = 0;
    for (let i = 0; i < 30; i++) {
      vi.advanceTimersByTime(1);
      if (nodesFor(() => a.play('detangle')) > 0) played++;
    }
    expect(played).toBeGreaterThan(0);
    expect(played).toBeLessThanOrEqual(SFX_META.detangle.maxVoices);
    a.dispose();
  });

  it('every sound at once: spammy ones are dropped past the budget, majors + stingers still play', () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(50);
    for (const id of SFX_IDS) a.play(id);
    const important = SFX_IDS.filter((id) => SFX_META[id].priority >= 2).length;
    const v = a.debugInfo().voices;
    expect(v).toBeLessThanOrEqual(GLOBAL_VOICES + important);
    expect(v).toBeLessThan(SFX_IDS.length); // some low-priority sounds were refused
    expect(v).toBeGreaterThan(10);
    a.dispose();
  });

  it('delay: the sound starts later', () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(100);
    const ctx = env.last();
    const now = ctx.currentTime;
    const from = ctx.created.length;
    a.play('pop', { delay: 0.5 });
    const starts = ctx.sources(from).map((s) => s.startAt!);
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) expect(s).toBeGreaterThanOrEqual(now + 0.5);
    // Hostile delays are clamped, never thrown.
    expect(() => a.play('boing', { delay: Infinity, volume: NaN, pitch: -1, pan: 99 })).not.toThrow();
    a.dispose();
  });

  it('muted: nothing is scheduled; unmuted: sounds again', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMuted(true);
    expect(a.muted).toBe(true);
    expect(nodesFor(() => a.play('found'))).toBe(0);
    expect(nodesFor(() => a.babble('chris', 'Morning!'))).toBe(0);
    a.setMuted(false);
    expect(nodesFor(() => a.play('found'))).toBeGreaterThan(0);
    a.dispose();
  });

  it('stingers duck the music; duck() does too, and a shallower duck never cuts a deeper one short', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('brushing');
    vi.advanceTimersByTime(200);
    a.play('blackBrushSting');
    expect(a.debugInfo().duck).toBeCloseTo(SFX_META.blackBrushSting.duck!.amount, 5);
    a.duck(0.2, 0.5); // shallower and shorter: ignored while the sting's duck lasts
    expect(a.debugInfo().duck).toBeCloseTo(SFX_META.blackBrushSting.duck!.amount, 5);
    vi.advanceTimersByTime(4000);
    expect(a.debugInfo().duck).toBe(0);
    a.duck(0.5, 2);
    expect(a.debugInfo().duck).toBeCloseTo(0.5, 5);
    expect(() => a.duck(NaN, NaN)).not.toThrow();
    a.dispose();
  });
});

describe('pause', () => {
  it('UI blips still play, gameplay sounds and babble are dropped, music keeps going', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('rush');
    vi.advanceTimersByTime(300);
    a.setPaused(true);
    expect(a.debugInfo().paused).toBe(true);
    const notes = a.debugInfo().notes;
    vi.advanceTimersByTime(1000);
    expect(a.debugInfo().notes).toBeGreaterThan(notes); // music continues (quieter)
    expect(nodesFor(() => a.play('uiConfirm'))).toBeGreaterThan(0);
    expect(nodesFor(() => a.play('uiMove'))).toBeGreaterThan(0);
    expect(nodesFor(() => a.play('dogBark'))).toBe(0);
    expect(nodesFor(() => a.babble('ashley', 'Paused?'))).toBe(0);
    a.setPaused(false);
    expect(nodesFor(() => a.play('dogBark'))).toBeGreaterThan(0);
    a.dispose();
  });

  it('pausing cuts a babble line in progress', () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(50);
    a.babble('heidi', 'This is a long line that keeps going and going', 'normal');
    expect(a.debugInfo().babbles).toBe(1);
    a.setPaused(true);
    expect(a.debugInfo().babbles).toBe(0);
    a.dispose();
  });
});

describe('music', () => {
  it('setMusic is idempotent; unknown ids are ignored', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('title');
    vi.advanceTimersByTime(200);
    expect(nodesFor(() => a.setMusic('title'))).toBe(0);
    a.setMusic('nope' as never);
    expect(a.music).toBe('title');
    a.setMusic(null);
    expect(a.music).toBeNull();
    a.dispose();
  });

  it('crossfading through every track in a burst never throws or piles up tails', () => {
    const a = createAudioEngine();
    a.unlock();
    for (const id of ['title', 'predawn', 'wake', 'brushing', 'boss', 'rush', 'drive', 'results'] as const) {
      a.setMusic(id, { fade: 0.5 });
      vi.advanceTimersByTime(40);
    }
    expect(a.music).toBe('results');
    vi.advanceTimersByTime(3000);
    expect(a.debugInfo().bpm).toBeGreaterThan(0);
    a.setMusic('wake', { fade: 0 }); // hard cut
    vi.advanceTimersByTime(500);
    expect(a.music).toBe('wake');
    a.dispose();
  });

  it('intensity raises the layer level, and the rush pushes its tempo at bar lines', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('rush');
    vi.advanceTimersByTime(300);
    expect(a.debugInfo().intensityLevel).toBe(0);
    a.setIntensity(1);
    expect(a.debugInfo().intensityLevel).toBe(2);
    const bpm0 = a.debugInfo().bpm;
    vi.advanceTimersByTime(8000);
    expect(a.debugInfo().bpm).toBeGreaterThan(bpm0);
    a.setIntensity(NaN);
    expect(a.debugInfo().intensityLevel).toBe(0);
    a.dispose();
  });

  it('intensity set before the track starts is applied to it', () => {
    const a = createAudioEngine();
    a.setIntensity(0.8);
    a.setMusic('drive');
    a.unlock();
    vi.advanceTimersByTime(200);
    expect(a.debugInfo().intensityLevel).toBe(2);
    a.dispose();
  });

  it('while muted the transport keeps moving but schedules no notes', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('wake');
    vi.advanceTimersByTime(500);
    a.setMuted(true);
    vi.advanceTimersByTime(200); // let the last lookahead drain
    const n = a.debugInfo().notes;
    vi.advanceTimersByTime(3000);
    expect(a.debugInfo().notes).toBe(n);
    a.setMuted(false);
    vi.advanceTimersByTime(500);
    expect(a.debugInfo().notes).toBeGreaterThan(n);
    a.dispose();
  });
});

describe('babble', () => {
  it('speaks, ignores the same line repeated every frame, replaces a different line', () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(50);
    expect(nodesFor(() => a.babble('addy', 'I called it!', 'excited'))).toBeGreaterThan(5);
    expect(nodesFor(() => a.babble('addy', 'I called it!', 'excited'))).toBe(0);
    expect(nodesFor(() => a.babble('addy', 'Fiiine.', 'dramatic'))).toBeGreaterThan(5);
    expect(a.debugInfo().babbles).toBe(1);
    vi.advanceTimersByTime(3000);
    expect(a.debugInfo().babbles).toBe(0);
    a.dispose();
  });

  it(`at most ${MAX_BABBLES} voices talk at once; bad input is ignored`, () => {
    const a = createAudioEngine();
    a.unlock();
    vi.advanceTimersByTime(50);
    for (const v of ['chris', 'ashley', 'addy', 'ellie', 'heidi', 'dog', 'extra'] as const) a.babble(v, 'Everybody talking at once!', 'excited');
    expect(a.debugInfo().babbles).toBe(MAX_BABBLES);
    expect(nodesFor(() => a.babble('nobody' as never, 'hi'))).toBe(0);
    expect(nodesFor(() => a.babble('dog', ''))).toBe(0);
    expect(nodesFor(() => a.babble('dog', null as unknown as string))).toBe(0);
    a.dispose();
  });
});

describe('loops', () => {
  it(`caps loops per id (${MAX_LOOPS_PER_ID}) and in total (${MAX_LOOPS}): a runaway loop() never piles up`, () => {
    const a = createAudioEngine();
    a.unlock();
    for (let i = 0; i < 10; i++) a.loop('water');
    expect(a.debugInfo().loops).toBe(MAX_LOOPS_PER_ID);
    for (let i = 0; i < 30; i++) a.loop((['brew', 'engine', 'rain', 'brushing', 'pourStream'] as const)[i % 5]!);
    expect(a.debugInfo().loops).toBeLessThanOrEqual(MAX_LOOPS);
    a.dispose();
  });

  it('set() every frame is cheap (no new nodes) and survives hostile values', () => {
    const a = createAudioEngine();
    a.unlock();
    const h = a.loop('pourStream');
    vi.advanceTimersByTime(50);
    expect(
      nodesFor(() => {
        for (let i = 0; i < 100; i++) h.set(i / 100, 1 + i / 50);
        h.set(NaN, NaN);
        h.set(-4, 99);
      }),
    ).toBe(0);
    h.stop();
    a.dispose();
  });

  it('unknown loop ids and loops after dispose are harmless no-ops', () => {
    const a = createAudioEngine();
    a.unlock();
    const bad = a.loop('vacuum' as never);
    expect(() => {
      bad.set(1);
      bad.stop();
    }).not.toThrow();
    a.dispose();
    const late = a.loop('rain');
    expect(() => {
      late.set(1, 1);
      late.stop();
    }).not.toThrow();
  });
});

describe('update & dispose', () => {
  it('update() is cheap and never throws (it only runs the scheduler when the timer is late)', () => {
    const a = createAudioEngine();
    expect(() => a.update(0.016)).not.toThrow();
    a.unlock();
    a.setMusic('title');
    vi.advanceTimersByTime(100);
    expect(nodesFor(() => a.update(0.016))).toBe(0);
    expect(() => {
      for (let i = 0; i < 1000; i++) a.update(0.016);
    }).not.toThrow();
    a.dispose();
    expect(() => a.update(0.016)).not.toThrow();
  });

  it('dispose closes the context and stops every loop; everything after is a no-op', () => {
    const a = createAudioEngine();
    a.unlock();
    a.setMusic('title');
    const h = a.loop('rain');
    vi.advanceTimersByTime(200);
    a.dispose();
    expect(env.last().state).toBe('closed');
    expect(a.unlocked).toBe(false);
    expect(a.debugInfo().state).toBe('disposed');
    expect(a.debugInfo().loops).toBe(0);
    expect(() => {
      h.set(1, 1);
      a.play('pop');
      a.babble('dog', 'woof');
      a.setMusic('wake');
      a.unlock();
      vi.advanceTimersByTime(500);
    }).not.toThrow();
    expect(env.ctxs().length).toBe(1); // no zombie rebuild after dispose
  });
});
