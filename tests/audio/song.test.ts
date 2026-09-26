// Song structures: bar lengths (3/4 vs 4/4 slot counts), key / scale validity (chord roots in the
// key, melody notes in the scale or the bar's chord), ranges, loop lengths, deterministic
// arrangement, intensity levels only ADD layers, every bar sounds, section fills / pass variations.
import { describe, expect, it } from 'vitest';
import { MusicPlayer } from '../../src/audio/music';
import {
  arrangeBar,
  barSpec,
  HOLD,
  intensityLevel,
  introBars,
  layersFor,
  locateBar,
  loopBars,
  MUSIC_IDS,
  type NoteEvent,
  parseMelody,
  REST,
  secondsPerBar,
  section,
  SONGS,
  type SongDef,
  stepTempo,
  tempoFor,
} from '../../src/audio/song';
import { BASS_HIGH, BASS_LOW, chordPcs, inScale, parseChord, pitchClass } from '../../src/audio/theory';
import type { MusicId } from '../../src/audio/types';
import { bareContext } from './fakeAudio';

const allSongs = Object.values(SONGS);

function arrange(id: MusicId, bar: number, level: 0 | 1 | 2 = 0): NoteEvent[] {
  const song = SONGS[id];
  const out: NoteEvent[] = [];
  arrangeBar(song, bar, layersFor(song, bar, level), out);
  return out;
}

const allBars = (song: SongDef) => [...song.intro, ...song.loop].flatMap((s) => s.bars);

describe('song data', () => {
  it('parseMelody: slots, holds and rests; wrong counts throw', () => {
    expect(parseMelody('C4 - . D#4 - - Bb3 .')).toEqual([60, HOLD, REST, 63, HOLD, HOLD, 58, REST]);
    expect(parseMelody('C4 - - E4 G4 -', 6)).toEqual([60, HOLD, HOLD, 64, 67, HOLD]);
    expect(() => parseMelody('C4 D4')).toThrow();
    expect(() => section('x', ['Xm | C4 - - - - - - -'])).toThrow();
  });

  it('eight tracks, each in 4/4 (16 steps) or 3/4 (12 steps); the title is a waltz', () => {
    expect(MUSIC_IDS.length).toBe(8);
    for (const song of allSongs) expect([12, 16]).toContain(song.stepsPerBar);
    expect(SONGS.title.stepsPerBar).toBe(12);
  });

  it('bar lengths: every bar has stepsPerBar / 2 eighth slots and never starts with a hold', () => {
    for (const song of allSongs) {
      for (const bar of allBars(song)) {
        expect(bar.melody.length, song.id).toBe(song.stepsPerBar / 2);
        expect(bar.melody[0], song.id).not.toBe(HOLD);
      }
    }
  });

  it('key validity: every chord root is in the key; every melody note is in the scale or the chord under it', () => {
    for (const song of allSongs) {
      for (const bar of allBars(song)) {
        for (const sym of bar.chords) expect(inScale(parseChord(sym).root, song.tonic, song.scale), `${song.id} ${sym}`).toBe(true);
        bar.melody.forEach((m, slot) => {
          if (m <= 0) return;
          const chord = bar.chords[slot * 2 < 8 ? 0 : 1];
          const ok = inScale(m, song.tonic, song.scale) || chordPcs(chord).includes(pitchClass(m));
          expect(ok, `${song.id}: ${m} over ${chord}`).toBe(true);
        });
      }
    }
  });

  it('melodies sit in a singable, speaker-friendly range', () => {
    for (const song of allSongs) {
      for (const bar of allBars(song)) {
        for (const m of bar.melody) {
          if (m <= 0) continue;
          expect(m, song.id).toBeGreaterThanOrEqual(62 - 10);
          expect(m, song.id).toBeLessThanOrEqual(88);
        }
      }
    }
  });

  it('loops are long enough not to wear thin (≥ 16 bars, ≥ 2 sections, ≥ 45 s)', () => {
    for (const song of allSongs) {
      expect(loopBars(song), song.id).toBeGreaterThanOrEqual(16);
      expect(song.loop.length, song.id).toBeGreaterThanOrEqual(2);
      expect(loopBars(song) * secondsPerBar(song), song.id).toBeGreaterThan(45);
    }
  });

  it('distinct characters: tempos, keys and time signatures differ where they should', () => {
    expect(SONGS.predawn.bpm).toBeLessThan(80); // sleepy lo-fi
    expect(SONGS.predawn.bed).toBeGreaterThan(0); // the vinyl noise bed
    expect(SONGS.rush.bpm).toBeGreaterThan(140); // busy
    expect(SONGS.boss.scale).toBe('minor'); // mock-epic
    expect(SONGS.rush.swing8).toBeGreaterThan(0.55); // swung comedy
    expect(new Set(allSongs.map((s) => `${s.tonic}/${s.bpm}`)).size).toBe(8);
  });

  it('locateBar walks intro, sections and cycles', () => {
    const s = SONGS.wake;
    const intro = introBars(s);
    const loop = loopBars(s);
    expect(locateBar(s, 0).intro).toBe(true);
    expect(locateBar(s, intro).section.name).toBe('A');
    expect(locateBar(s, intro + 8).section.name).toBe('B');
    const again = locateBar(s, intro + loop + 9);
    expect(again.cycle).toBe(1);
    expect(again.section.name).toBe('B');
    expect(again.barInSection).toBe(1);
    expect(barSpec(s, intro + loop)).toBe(barSpec(s, intro));
    expect(locateBar(s, -5).barInPart).toBe(0);
  });
});

describe('intensity', () => {
  it('levels with hysteresis', () => {
    expect(intensityLevel(0, 0)).toBe(0);
    expect(intensityLevel(0.35, 0)).toBe(1);
    expect(intensityLevel(0.32, 1)).toBe(1); // hysteresis keeps it
    expect(intensityLevel(0.29, 1)).toBe(0);
    expect(intensityLevel(0.7, 1)).toBe(2);
    expect(intensityLevel(0.67, 2)).toBe(2);
    expect(intensityLevel(0.64, 2)).toBe(1);
    expect(intensityLevel(NaN, 2)).toBe(0);
    expect(intensityLevel(9, 0)).toBe(2);
  });

  it('only the rush pushes its tempo, in bounded steps', () => {
    expect(tempoFor(SONGS.rush, 0)).toBe(SONGS.rush.bpm);
    expect(tempoFor(SONGS.rush, 2)).toBeGreaterThan(tempoFor(SONGS.rush, 1));
    for (const id of ['title', 'predawn', 'boss', 'drive'] as const) expect(tempoFor(SONGS[id], 2)).toBe(SONGS[id].bpm);
    expect(stepTempo(152, 162, 4)).toBe(156);
    expect(stepTempo(160, 162, 4)).toBe(162);
    expect(stepTempo(162, 152, 4)).toBe(158);
  });

  it('higher levels only ADD layers (instrument sets grow) and add notes overall, for every track', () => {
    for (const song of allSongs) {
      const insts = (bar: number, level: 0 | 1 | 2): Set<string> => new Set(arrange(song.id, bar, level).map((e) => e.inst));
      let total0 = 0;
      let total2 = 0;
      const bars = introBars(song) + loopBars(song);
      for (let bar = 0; bar < bars; bar++) {
        const [a, b, c] = [insts(bar, 0), insts(bar, 1), insts(bar, 2)];
        for (const i of a) expect(b.has(i), `${song.id} bar ${bar} L1 lost ${i}`).toBe(true);
        for (const i of b) expect(c.has(i), `${song.id} bar ${bar} L2 lost ${i}`).toBe(true);
        total0 += arrange(song.id, bar, 0).length;
        total2 += arrange(song.id, bar, 2).length;
      }
      expect(total2, song.id).toBeGreaterThan(total0 * 1.1);
    }
  });

  it('the pre-dawn theme has no drums until the intensity rises (everyone is asleep)', () => {
    const drums = (level: 0 | 1 | 2): number => arrange('predawn', 3, level).filter((e) => e.inst === 'kick' || e.inst === 'rim' || e.inst === 'snare').length;
    expect(drums(0)).toBe(0);
    expect(drums(1)).toBeGreaterThan(0);
  });
});

describe('arrangement', () => {
  it('every event sits on its grid with sane values, for every track, bar of two passes and level', () => {
    const bad: string[] = [];
    let checked = 0;
    for (const song of allSongs) {
      const bars = introBars(song) + loopBars(song) * 2;
      for (let bar = 0; bar < bars; bar++) {
        for (const level of [0, 1, 2] as const) {
          const out: NoteEvent[] = [];
          arrangeBar(song, bar, layersFor(song, bar, level), out);
          for (const e of out) {
            checked++;
            const tag = `${song.id} bar ${bar} L${level} ${e.inst}@${e.step}`;
            if (!(e.step >= 0 && e.step < song.stepsPerBar)) bad.push(`${tag}: step`);
            if (!(e.len > 0)) bad.push(`${tag}: len`);
            if (!(e.vel > 0 && e.vel <= 1)) bad.push(`${tag}: vel ${e.vel}`);
            if (!Number.isFinite(e.midi)) bad.push(`${tag}: midi`);
            if ((e.inst === 'bass' || e.inst === 'pluckBass') && (e.midi < BASS_LOW || e.midi > BASS_HIGH)) bad.push(`${tag}: bass ${e.midi}`);
            if (e.chord && e.chord.length < 2) bad.push(`${tag}: chord`);
            if (e.glide !== undefined && Math.abs(e.glide - e.midi) > 2) bad.push(`${tag}: glide`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(10000);
  });

  it('deterministic: the same bar arranges identically every time', () => {
    for (const song of allSongs) {
      for (const bar of [0, 3, 11, 20]) expect(JSON.stringify(arrange(song.id, bar, 1))).toBe(JSON.stringify(arrange(song.id, bar, 1)));
    }
  });

  it('every track makes sound in every bar (no dead bars)', () => {
    for (const song of allSongs) {
      for (let bar = 0; bar < introBars(song) + loopBars(song); bar++) expect(arrange(song.id, bar).length, `${song.id} bar ${bar}`).toBeGreaterThan(2);
    }
  });

  it('the title is an oom-pah-pah: bass on 1, pizzicato chords on 2 and 3', () => {
    const bar = arrange('title', introBars(SONGS.title));
    expect(bar.some((e) => e.inst === 'bass' && e.step === 0)).toBe(true);
    const pizz = bar.filter((e) => e.inst === 'pizz').map((e) => e.step);
    expect(pizz).toEqual([4, 8]);
  });

  it('the rush walks: four bass notes a bar', () => {
    const bar = arrange('rush', introBars(SONGS.rush) + 1);
    expect(bar.filter((e) => e.inst === 'pluckBass').map((e) => e.step)).toEqual([0, 4, 8, 12]);
  });

  it('sections with drums end with a pickup fill', () => {
    const lastA = introBars(SONGS.wake) + 7;
    expect(arrange('wake', lastA).filter((e) => e.step >= 12 && e.inst === 'snare').length).toBe(4);
  });

  it('passes vary: the second pass of a loop is arranged differently', () => {
    for (const song of allSongs) {
      const sig = (bar: number): string =>
        arrange(song.id, bar)
          .map((e) => e.inst)
          .sort()
          .join(',');
      const a = introBars(song);
      const half = loopBars(song) / 2;
      let differs = false;
      for (let b = 0; b < half; b++) if (sig(a + b) !== sig(a + half + b)) differs = true;
      expect(differs, song.id).toBe(true);
    }
  });

  it('the music player is deterministic too (same notes, same velocities)', () => {
    const run = (): number[] => {
      const { ctx, fake } = bareContext();
      const p = new MusicPlayer(ctx, ctx.createGain(), 'brushing', 0, { intensity: 0.5 });
      p.pump(8);
      return fake.created.filter((n) => n.kind === 'Gain').map((n) => (n.gain as { peak(): number }).peak());
    };
    expect(run()).toEqual(run());
  });
});
