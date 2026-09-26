// Theory (pitch maths, chords, scales, voicings) and the transport (4/4 and 3/4 bars, swing,
// tempo changes at bar lines, resync after stalls). Adapted from ATHLETE MAYHEM's tests.
import { describe, expect, it } from 'vitest';
import {
  arpTones,
  BASS_HIGH,
  BASS_LOW,
  bassRoot,
  bassTone,
  centsToRatio,
  chordPcs,
  closeVoicing,
  freqToMidi,
  inScale,
  midiToFreq,
  noteToMidi,
  parseChord,
  pitchClass,
  pitchClassOf,
  SCALES,
  scaleNote,
  semis,
  snapToScale,
} from '../../src/audio/theory';
import { barDuration, STEPS_PER_BAR, stepOffsetInBar, stepOffsetInBeat, Transport } from '../../src/audio/transport';

describe('pitch maths', () => {
  it('midi ↔ frequency, cents and semitones', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 9);
    expect(midiToFreq(81)).toBeCloseTo(880, 9);
    expect(freqToMidi(261.6255653)).toBeCloseTo(60, 5);
    expect(centsToRatio(1200)).toBeCloseTo(2, 12);
    expect(semis(12)).toBeCloseTo(2, 12);
    expect(semis(-12)).toBeCloseTo(0.5, 12);
  });

  it('note names', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('F#5')).toBe(78);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(noteToMidi('C#6')).toBe(85);
    expect(() => noteToMidi('H2')).toThrow();
    expect(pitchClassOf('Bb')).toBe(10);
    expect(pitchClassOf('F#')).toBe(6);
    expect(() => pitchClassOf('X')).toThrow();
  });

  it('pitch classes wrap negatives', () => {
    expect(pitchClass(-1)).toBe(11);
    expect(pitchClass(60)).toBe(0);
  });
});

describe('chords', () => {
  it('parses symbols incl. sus, sixths, 7ths and 9ths', () => {
    expect(chordPcs('C')).toEqual([0, 4, 7]);
    expect(chordPcs('Em')).toEqual([4, 7, 11]);
    expect(chordPcs('C6')).toEqual([0, 4, 7, 9]);
    expect(chordPcs('Asus4')).toEqual([9, 2, 4]);
    expect(chordPcs('F#m7')).toEqual([6, 9, 1, 4]);
    expect(chordPcs('Gmaj7')).toEqual([7, 11, 2, 6]);
    expect(parseChord('Bb').root).toBe(10);
    expect(() => parseChord('Xm')).toThrow();
    expect(() => parseChord('Cmadd9')).toThrow();
  });

  it('close voicings stay inside one octave window and contain every chord tone', () => {
    for (const sym of ['C', 'Em7', 'Dmaj7', 'Gsus4', 'F#m9', 'Bdim', 'C6', 'A7']) {
      const v = closeVoicing(sym, 57);
      for (const n of v) {
        expect(n).toBeGreaterThanOrEqual(57);
        expect(n).toBeLessThan(69);
      }
      expect(new Set(v.map(pitchClass))).toEqual(new Set(chordPcs(sym)));
      for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThan(v[i - 1]!);
    }
  });

  it('bass notes stay in the bass range (default roots C2..B2: audible on phones)', () => {
    for (const sym of ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']) {
      const r = bassRoot(sym);
      expect(r).toBeGreaterThanOrEqual(36);
      expect(r).toBeLessThanOrEqual(47);
      expect(pitchClass(r)).toBe(parseChord(sym).root);
      for (const iv of [0, 7, 12, 19, 24]) {
        const n = bassTone(sym, iv);
        expect(n).toBeGreaterThanOrEqual(BASS_LOW);
        expect(n).toBeLessThanOrEqual(BASS_HIGH);
      }
    }
  });

  it('arp tones climb over the requested octaves', () => {
    expect(arpTones('C', 60, 2)).toEqual([60, 64, 67, 72, 76, 79]);
  });
});

describe('scales', () => {
  it('membership, degrees across octaves, snapping', () => {
    expect(SCALES.major).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(inScale(noteToMidi('F#4'), 2, 'major')).toBe(true); // D major
    expect(inScale(noteToMidi('F4'), 2, 'major')).toBe(false);
    expect(inScale(noteToMidi('Bb4'), 2, 'minor')).toBe(true); // D minor
    expect(scaleNote(60, 'major', 0)).toBe(60);
    expect(scaleNote(60, 'major', 7)).toBe(72);
    expect(scaleNote(60, 'major', -1)).toBe(59);
    expect(scaleNote(0, 'majorPent', 5)).toBe(12);
    expect(snapToScale(61, 0, 'major')).toBe(60); // C# → C (ties go down)
    expect(snapToScale(61.6, 0, 'major')).toBe(62);
    expect(snapToScale(66, 0, 'majorPent')).toBe(67);
    for (let m = 40; m < 90; m += 0.37) expect(inScale(snapToScale(m, 7, 'major'), 7, 'major')).toBe(true);
  });
});

describe('transport', () => {
  it('straight and swung step offsets', () => {
    expect([0, 1, 2, 3].map((i) => stepOffsetInBeat(i, 0.5, 0.5))).toEqual([0, 0.25, 0.5, 0.75]);
    const sw = [0, 1, 2, 3].map((i) => stepOffsetInBeat(i, 0.5, 0.58));
    for (let i = 1; i < 4; i++) expect(sw[i]!).toBeGreaterThan(sw[i - 1]!);
    expect(sw[1]).toBeGreaterThan(0.25); // swung 16th arrives late
    expect(barDuration(120)).toBeCloseTo(2, 12);
    expect(barDuration(120, 12)).toBeCloseTo(1.5, 12); // a 3/4 bar
    expect(stepOffsetInBar(4, 120, 0.5, 0.5)).toBeCloseTo(0.5, 12);
  });

  it('advances 16 steps per bar; tempo changes land on the bar line', () => {
    const tr = new Transport(0, 120);
    for (let i = 0; i < 5; i++) tr.advance();
    tr.setTempo(150);
    expect(tr.bpm).toBe(120);
    let newBar = false;
    while (!newBar) newBar = tr.advance();
    expect(tr.bpm).toBe(150);
    expect(tr.barStart).toBeCloseTo(2, 12);
    let prev = -1;
    for (let i = 0; i < STEPS_PER_BAR * 4; i++) {
      expect(tr.time).toBeGreaterThan(prev);
      prev = tr.time;
      tr.advance();
    }
  });

  it('waltz bars: 12 steps, three beats', () => {
    const tr = new Transport(0, 108, 0.5, 0.5, 12);
    let steps = 0;
    while (!tr.advance()) steps++;
    expect(steps + 1).toBe(12);
    expect(tr.barStart).toBeCloseTo(3 * (60 / 108), 12);
  });

  it('resync skips whole bars after a stall, keeping the groove position', () => {
    const tr = new Transport(0, 120);
    for (let i = 0; i < 6; i++) tr.advance();
    const step = tr.step;
    tr.resync(7.3);
    expect(tr.step).toBe(step);
    expect(tr.time).toBeGreaterThanOrEqual(7.3);
    expect(tr.time - 7.3).toBeLessThan(barDuration(120));
  });
});
