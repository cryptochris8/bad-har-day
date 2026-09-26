// Mixer structure (the master limiter + soft-clip ceiling is the last thing before the speakers;
// every bus reaches the output; the pause gates exist) and the LoopVoice handle (remembers its
// parameters, attaches / detaches across contexts, stops exactly once).
import { describe, expect, it } from 'vitest';
import { LoopVoice } from '../../src/audio/loops';
import { buildMixer, duckParam, MIX_TRIM, PAUSE_MUSIC } from '../../src/audio/mixer';
import { asFake, bareContext, FakeNode, pathGain } from './fakeAudio';

describe('mixer', () => {
  it('ends in compressor → trim → soft clipper → destination, with the clip ceiling ≤ −0.6 dBFS', () => {
    const { ctx, fake } = bareContext();
    const mix = buildMixer(ctx);
    const out = asFake(mix.out);
    expect(out.kind).toBe('WaveShaper');
    expect(out.outputs).toEqual([fake.destination]);
    let max = 0;
    for (const v of out.curve!) max = Math.max(max, Math.abs(v));
    expect(max).toBeLessThanOrEqual(0.93);
    // master → compressor → … → clipper.
    const master = asFake(mix.master);
    const comp = asFake(mix.compressor);
    expect(master.outputs).toContain(comp);
    expect(pathGain(comp, out)).toBeGreaterThan(0);
    expect(asFake(mix.compressor).threshold).toBeDefined();
  });

  it('every bus reaches the speakers (through the limiter)', () => {
    const { ctx, fake } = bareContext();
    const mix = buildMixer(ctx);
    for (const bus of [mix.music, mix.ui, mix.game, mix.loops, mix.voice, mix.wet, mix.sfx]) {
      expect(pathGain(asFake(bus), fake.destination as FakeNode)).toBeGreaterThan(0);
      expect(pathGain(asFake(bus), asFake(mix.compressor))).toBeGreaterThan(0);
    }
  });

  it('gameplay, loops and voices pass through their pause gates; UI does not', () => {
    const { ctx } = bareContext();
    const mix = buildMixer(ctx);
    expect(pathGain(asFake(mix.game), asFake(mix.gamePause))).toBeGreaterThan(0);
    expect(pathGain(asFake(mix.loops), asFake(mix.loopPause))).toBeGreaterThan(0);
    expect(pathGain(asFake(mix.voice), asFake(mix.voicePause))).toBeGreaterThan(0);
    expect(pathGain(asFake(mix.ui), asFake(mix.gamePause))).toBe(0);
    expect(pathGain(asFake(mix.music), asFake(mix.musicPause))).toBeGreaterThan(0);
    expect(PAUSE_MUSIC).toBeGreaterThan(0.1);
    expect(PAUSE_MUSIC).toBeLessThan(0.6);
    expect(MIX_TRIM.output).toBeLessThanOrEqual(1);
  });

  it('duckParam dips and recovers without throwing', () => {
    const { ctx } = bareContext();
    const mix = buildMixer(ctx);
    expect(() => duckParam(mix.musicDuck.gain, 1, 0.6, 2, 0.5)).not.toThrow();
    expect((asFake(mix.musicDuck).gain as { values: number[] }).values).toContain(1);
  });
});

describe('LoopVoice', () => {
  it('remembers parameters before it is attached, applies them on attach, stops once', () => {
    let stops = 0;
    const v = new LoopVoice('water', () => stops++);
    v.set(0.3, 1.7);
    expect(v.volume).toBeCloseTo(0.3, 9);
    expect(v.pitch).toBeCloseTo(1.7, 9);
    v.set(NaN, NaN);
    expect(v.volume).toBe(0);
    expect(v.pitch).toBeCloseTo(1, 9);
    v.set(9, 99);
    expect(v.volume).toBe(1.5);
    expect(v.pitch).toBe(4);
    v.set(0.5, 1.2);
    expect(v.attached).toBe(false);
    const { ctx, fake } = bareContext();
    v.attach(ctx, ctx.createGain(), 0);
    expect(v.attached).toBe(true);
    expect(fake.sources().length).toBeGreaterThan(0);
    const before = fake.nodes;
    v.set(0.9, 1.1);
    expect(fake.nodes).toBe(before); // live parameter changes create no nodes
    v.stop();
    v.stop();
    expect(stops).toBe(1);
    expect(v.attached).toBe(false);
    v.attach(ctx, ctx.createGain(), 1); // a stopped loop never restarts
    expect(v.attached).toBe(false);
  });

  it('detach (context lost) then attach again (rebuilt context) keeps the parameters', () => {
    const v = new LoopVoice('engine', () => undefined);
    const a = bareContext();
    v.attach(a.ctx, a.ctx.createGain(), 0);
    v.set(0.4, 1.6);
    v.detach();
    expect(v.attached).toBe(false);
    const b = bareContext();
    v.attach(b.ctx, b.ctx.createGain(), 0);
    expect(v.attached).toBe(true);
    expect(v.volume).toBeCloseTo(0.4, 9);
    expect(b.fake.sources().length).toBeGreaterThan(0);
    v.stop();
  });
});
