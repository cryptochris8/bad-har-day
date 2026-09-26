// Contract coverage: every SfxId / LoopId / MusicId / Voice / BabbleMood in src/audio/types.ts has
// a definition, and every definition schedules cleanly on the recording fake context:
// finite end times, a real (non-zero-gain) path from a started source to the output, and every
// source stopped by the time the recipe says it ends (no leaked oscillators).
import { describe, expect, it } from 'vitest';
import { babblePlan, MOODS, playBabble, VOICE_IDS, VOICES } from '../../src/audio/babble';
import { buildMixer } from '../../src/audio/mixer';
import { LOOP_META, startLoop } from '../../src/audio/loops';
import { MusicPlayer } from '../../src/audio/music';
import { playSfx, SFX, SFX_IDS, SFX_META } from '../../src/audio/sfx';
import { MUSIC_IDS, SONGS } from '../../src/audio/song';
import type { BabbleMood, LoopId, MusicId, SfxId, Voice } from '../../src/audio/types';
import { asFake, bareContext, loudestPath } from './fakeAudio';

/** The full SfxId union, spelled out. `satisfies` + the exhaustiveness check keep it honest. */
const ALL_SFX = [
  'uiMove', 'uiConfirm', 'uiBack', 'uiToggle', 'actCard', 'banner', 'taskDone', 'star', 'award', 'clockTick', 'clockChime', 'alarm',
  'brushStroke', 'brushSnag', 'detangle', 'sectionClear', 'sparkle', 'shine', 'hairFlip', 'blackBrushSting', 'blackBrushGleam', 'brushPass',
  'girlDone', 'bossIntro', 'momInspect', 'momApproved', 'momFinish',
  'mugPick', 'mugPlace', 'brewStart', 'pour', 'stir', 'coffeeSecured', 'fridgeOpen', 'lunchSnap', 'itemPick', 'itemPlace', 'dishClink',
  'glassClink', 'cutlery', 'rinse', 'dishwasherShut', 'suds', 'crunch',
  'footstep', 'doorOpen', 'doorClose', 'lightSwitch', 'curtain', 'blanketRustle', 'bedCreak', 'trashRustle', 'binLid', 'binThud', 'pickup',
  'deliver', 'zipper', 'found', 'whoosh', 'pop', 'boing', 'thud', 'shh', 'heart', 'kiss',
  'dogBark', 'dogBarkSmall', 'dogPant', 'dogWhine', 'dogCollar', 'dogPaws', 'whistle', 'treatShake', 'sniff',
  'carDoor', 'slidingDoor', 'seatbelt', 'carStart', 'carHorn', 'brake', 'turnSignal', 'honkGoose', 'splash', 'schoolBell', 'cheer', 'kidsYay',
] as const satisfies readonly SfxId[];
type MissingSfx = Exclude<SfxId, (typeof ALL_SFX)[number]>;
const exhaustiveSfx: [MissingSfx] extends [never] ? true : false = true;

const ALL_LOOPS = ['brew', 'water', 'engine', 'rain', 'brushing', 'pourStream'] as const satisfies readonly LoopId[];
type MissingLoop = Exclude<LoopId, (typeof ALL_LOOPS)[number]>;
const exhaustiveLoops: [MissingLoop] extends [never] ? true : false = true;

const ALL_MUSIC = ['title', 'predawn', 'wake', 'brushing', 'boss', 'rush', 'drive', 'results'] as const satisfies readonly MusicId[];
type MissingMusic = Exclude<MusicId, (typeof ALL_MUSIC)[number]>;
const exhaustiveMusic: [MissingMusic] extends [never] ? true : false = true;

const ALL_VOICES = ['chris', 'ashley', 'addy', 'ellie', 'heidi', 'dog', 'extra'] as const satisfies readonly Voice[];
type MissingVoice = Exclude<Voice, (typeof ALL_VOICES)[number]>;
const exhaustiveVoices: [MissingVoice] extends [never] ? true : false = true;

const ALL_MOODS = ['normal', 'excited', 'sleepy', 'dramatic', 'whisper', 'sing'] as const satisfies readonly BabbleMood[];
type MissingMood = Exclude<BabbleMood, (typeof ALL_MOODS)[number]>;
const exhaustiveMoods: [MissingMood] extends [never] ? true : false = true;

describe('contract coverage', () => {
  it('the lists above cover the whole contract', () => {
    expect(exhaustiveSfx && exhaustiveLoops && exhaustiveMusic && exhaustiveVoices && exhaustiveMoods).toBe(true);
  });

  it('every SfxId has a recipe and metadata, and nothing extra', () => {
    expect(new Set(SFX_IDS)).toEqual(new Set(ALL_SFX));
    for (const id of ALL_SFX) {
      expect(typeof SFX[id], id).toBe('function');
      const m = SFX_META[id];
      expect(m.level, id).toBeGreaterThan(0);
      expect(m.level, id).toBeLessThanOrEqual(1);
      expect(m.maxVoices, id).toBeGreaterThanOrEqual(1);
      expect(m.cooldown, id).toBeGreaterThanOrEqual(0);
      expect(m.jitter, id).toBeLessThan(0.15);
      expect(m.wet, id).toBeGreaterThanOrEqual(0);
      expect(m.wet, id).toBeLessThanOrEqual(0.6);
      if (m.duck) {
        expect(m.duck.amount, id).toBeGreaterThan(0);
        expect(m.duck.amount, id).toBeLessThanOrEqual(0.9);
      }
    }
  });

  it('every LoopId, MusicId, Voice and mood has a definition', () => {
    expect(new Set(Object.keys(LOOP_META))).toEqual(new Set(ALL_LOOPS));
    expect(new Set(MUSIC_IDS)).toEqual(new Set(ALL_MUSIC));
    for (const id of ALL_MUSIC) expect(SONGS[id].id).toBe(id);
    expect(new Set(VOICE_IDS)).toEqual(new Set(ALL_VOICES));
    for (const v of ALL_VOICES) expect(VOICES[v].f0).toBeGreaterThan(0);
    expect(new Set(MOODS)).toEqual(new Set(ALL_MOODS));
  });

  it('only UI navigation sounds survive the pause menu; spammy sounds are cooled down and low priority', () => {
    const ui = ALL_SFX.filter((id) => SFX_META[id].bus === 'ui');
    expect(new Set(ui)).toEqual(new Set(['uiMove', 'uiConfirm', 'uiBack', 'uiToggle']));
    for (const id of ['brushStroke', 'footstep', 'clockTick', 'sparkle', 'pop', 'crunch'] as const) {
      expect(SFX_META[id].cooldown, id).toBeGreaterThanOrEqual(0.03);
      expect(SFX_META[id].priority, id).toBe(0);
    }
    for (const id of ['blackBrushSting', 'bossIntro', 'momApproved', 'actCard', 'clockChime', 'alarm'] as const) {
      expect(SFX_META[id].priority, id).toBe(3);
      expect(SFX_META[id].duck, id).toBeDefined();
    }
  });

  it('melodic / pitch-meaningful sounds get no random pitch jitter', () => {
    for (const id of ['sectionClear', 'star', 'uiMove', 'uiConfirm', 'uiBack', 'alarm', 'clockChime', 'momApproved', 'coffeeSecured', 'deliver', 'found', 'taskDone', 'actCard', 'blackBrushSting', 'bossIntro'] as const)
      expect(SFX_META[id].jitter, id).toBe(0);
  });
});

describe('every SFX schedules a real, bounded sound', () => {
  it('any volume / pitch / pan: finite end, an audible path to the output, every source stopped by the end', () => {
    for (const id of ALL_SFX) {
      for (const volume of [0.1, 1]) {
        for (const pitch of [0.6, 1, 1.8]) {
          const { ctx, fake } = bareContext();
          const out = ctx.createGain();
          const t = 0.1;
          const end = playSfx(ctx, out, id, t, { volume, pitch, pan: 0.3 });
          const tag = `${id} v${volume} p${pitch}`;
          expect(Number.isFinite(end), tag).toBe(true);
          expect(end, tag).toBeGreaterThan(t);
          expect(end - t, tag).toBeLessThan(4.5); // the longest tails: bells / cymbal rings on the stingers
          // Structural non-silence: some started source reaches `out` through non-zero gains.
          expect(loudestPath(fake, asFake(out)), tag).toBeGreaterThan(0.02 * volume);
          // No leaks: every source starts at/after t and is stopped by (about) the declared end.
          for (const s of fake.sources()) {
            expect(s.startAt!, tag).toBeGreaterThanOrEqual(t - 1e-9);
            expect(s.stopAt, tag).not.toBeNull();
            expect(s.stopAt!, tag).toBeLessThanOrEqual(end + 0.1);
          }
        }
      }
    }
  });

  it('silent volume schedules nothing', () => {
    const { ctx, fake } = bareContext();
    const out = ctx.createGain();
    expect(playSfx(ctx, out, 'blackBrushSting', 1, { volume: 0 })).toBe(1);
    expect(fake.sources().length).toBe(0);
  });

  it('no SFX is a node storm (mobile budget)', () => {
    for (const id of ALL_SFX) {
      const { ctx, fake } = bareContext();
      const before = fake.nodes;
      playSfx(ctx, ctx.createGain(), id, 0.1, {});
      // The big stingers (choir, brass, shimmer) are the heaviest; everything else is far lighter.
      const big = ['blackBrushSting', 'bossIntro', 'momApproved', 'momFinish', 'cheer', 'award'].includes(id);
      expect(fake.nodes - before, id).toBeLessThanOrEqual(big ? 130 : 90);
    }
  });
});

describe('loops, music and babble schedule on a (fake) context', () => {
  it('every loop starts audible, takes any parameters, and stops every source', () => {
    for (const id of ALL_LOOPS) {
      const { ctx, fake } = bareContext();
      const out = ctx.createGain();
      const l = startLoop(ctx, out, id, 0, 1, 1);
      expect(loudestPath(fake, asFake(out)), id).toBeGreaterThan(0.01);
      for (const [v, p] of [
        [0, 1],
        [1, 2],
        [NaN, NaN],
        [9, -3],
        [0.5, 0.5],
      ] as const)
        expect(() => l.set(v, p, 0.5)).not.toThrow();
      l.pump(3, 0.5);
      l.stop(3, 0.2);
      for (const s of fake.sources()) {
        expect(s.stopAt, id).not.toBeNull();
        // One-shot events already scheduled (a brew bubble's noise tail) may ring ≤ 0.4 s past the stop — silently,
        // the loop's master gain is already at 0 — but every source still has a finite stop time (no leaks).
        expect(s.stopAt!, id).toBeLessThanOrEqual(3 + 0.2 + 0.4);
      }
      expect(() => l.set(1, 1, 4)).not.toThrow();
    }
  });

  it('every music track pumps a minute of bars at every intensity, audible and stoppable', () => {
    for (const id of ALL_MUSIC) {
      const { ctx, fake } = bareContext();
      const mix = buildMixer(ctx);
      const p = new MusicPlayer(ctx, mix.music, id, 0, { intensity: 0 });
      p.pump(20);
      p.setIntensity(0.5);
      p.pump(40);
      p.setIntensity(1);
      p.pump(60);
      expect(p.bar, id).toBeGreaterThan(14);
      expect(p.notes, id).toBeGreaterThan(100);
      expect(loudestPath(fake, asFake(mix.music)), id).toBeGreaterThan(0.01);
      p.stop(60, 1);
      expect(p.stopping).toBe(true);
      p.kill();
      // After kill, even the band's long-running LFOs / vinyl bed are stopped.
      for (const s of fake.sources()) expect(s.stopAt, id).not.toBeNull();
    }
  });

  it('every voice × mood babble line is audible, compact and fully stopped', () => {
    for (const v of ALL_VOICES) {
      for (const m of ALL_MOODS) {
        const { ctx, fake } = bareContext();
        const out = ctx.createGain();
        const plan = babblePlan(v, 'Good morning! Is it time for school?', m);
        const before = fake.nodes;
        const line = playBabble(ctx, out, 0.1, plan);
        const tag = `${v}/${m}`;
        expect(fake.nodes - before, tag).toBeLessThanOrEqual(20); // one oscillator + shared filters, whatever the length
        expect(loudestPath(fake, asFake(out)), tag).toBeGreaterThan(0.01);
        expect(line.end, tag).toBeGreaterThan(0.1 + plan.duration - 1e-9);
        for (const s of fake.sources()) expect(s.stopAt!, tag).toBeLessThanOrEqual(line.end + 0.1);
        line.cut(0.3);
        for (const s of fake.sources()) expect(s.stopAt!, tag).toBeLessThanOrEqual(0.3 + 0.11);
      }
    }
  });
});
