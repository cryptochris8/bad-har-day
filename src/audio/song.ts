// ─────────────────────────────────────────────────────────────────────────────
// Songs & arrangement (pure, deterministic, unit-tested). Eight ORIGINAL tunes for
// one school morning (no existing melodies):
//
//   "Bedhead Waltz"          (title)    F major, 3/4, 108 — music box over an oom-pah-pah of
//                                        soft bass + pizzicato, celesta and strings on the repeats.
//   "Five-Fifteen"           (predawn)  D major, 70, swung 16ths — very quiet lo-fi: tremolo
//                                        e-piano chords, round sub bass, a sparse kalimba, a vinyl
//                                        hiss bed. Drums only arrive with intensity.
//   "Rise and Shine"         (wake)     G major, 124 — bustling pizzicato ostinato, claps,
//                                        marimba tune, shaker; xylophone and glock on the repeat.
//   "Smooth Strokes"         (brushing) A major, 100 — harp-pluck arpeggios, kalimba/marimba
//                                        melody, a light rim-and-shaker groove.
//   "The Hair Inspector"     (boss)     D minor, 96 — tongue-in-cheek mock epic: timpani, soft
//                                        brass theme, "aaah" choir, tiptoe pizzicato, a Picardy
//                                        major "ta-da" at the end of each phrase.
//   "Shoes! Bags! Go!"       (rush)     C major, 152, swung 8ths — walking bass, xylophone,
//                                        Charleston e-piano, brush snare; stabs + tempo push with intensity.
//   "Windows Down"           (drive)    D major, 118 — ukulele strums, whistled sing-along tune,
//                                        handclaps, "ooh" backing on the chorus.
//   "Report Card"            (results)  F major, 100 — a little brass/bell fanfare, then a warm,
//                                        proud loop (glock, strings, e-piano).
//
// arrangeBar() turns (song, bar, layers) into note events on a 12- or 16-step grid; the
// music player (music.ts) only schedules them. Every loop has sections and per-pass
// variations so it doesn't wear thin, and intensity levels only ever ADD layers.
// Structure adapted from ATHLETE MAYHEM's song.ts; every tune and pattern is new.
// ─────────────────────────────────────────────────────────────────────────────
import { arpTones, bassRoot, bassTone, closeVoicing, noteToMidi, parseChord, type ScaleName } from './theory';
import type { MusicId } from './types';

export type MelodyInst = 'musicBox' | 'celesta' | 'bell' | 'marimba' | 'xylo' | 'kalimba' | 'whistle' | 'brass' | 'choir';

export type InstName =
  | MelodyInst
  | 'epiano'
  | 'pizz'
  | 'uke'
  | 'harp'
  | 'bass'
  | 'pluckBass'
  | 'pad'
  | 'choirPad'
  | 'oohPad'
  | 'stab'
  | 'kick'
  | 'snare'
  | 'rim'
  | 'clap'
  | 'shaker'
  | 'tamb'
  | 'hat'
  | 'triangle'
  | 'timp'
  | 'cymbal';

export interface NoteEvent {
  inst: InstName;
  /** 16th step within the bar (0..stepsPerBar-1). */
  step: number;
  /** MIDI note (timpani pitch; unused for unpitched percussion). */
  midi: number;
  /** 0..1 velocity. */
  vel: number;
  /** Length in 16th steps. */
  len: number;
  /** Chord tones for chord instruments. */
  chord?: readonly number[];
  /** Strum direction (uke): true = up-strum (high → low, lighter). */
  up?: boolean;
  /** Short, damped note (plucks). */
  stacc?: boolean;
  /** Legato slide from this MIDI note (whistle). */
  glide?: number;
}

/** Melody slot codes: > 0 = MIDI onset, HOLD = sustain previous, REST = silence. */
export const HOLD = -1;
export const REST = 0;

export interface BarSpec {
  /** Chord symbol for the first part of the bar (steps 0–7) and the rest (steps 8+). */
  chords: readonly [string, string];
  /** Eighth-note melody slots (stepsPerBar / 2 of them). */
  melody: readonly number[];
}

export interface SectionDef {
  name: string;
  bars: readonly BarSpec[];
}

export interface SongDef {
  id: MusicId;
  title: string;
  bpm: number;
  /** 16 = 4/4, 12 = 3/4. */
  stepsPerBar: 12 | 16;
  swing8: number;
  swing16: number;
  /** Key: tonic pitch class + scale (checked by the tests). */
  tonic: number;
  scale: ScaleName;
  /** Vinyl bed level (0 = none). */
  bed: number;
  /** Played once. */
  intro: readonly SectionDef[];
  /** Repeats forever. */
  loop: readonly SectionDef[];
}

/** Parse "D4 - F4 . A4 -" into melody slots (must be exactly `slots` tokens). */
export function parseMelody(src: string, slots = 8): number[] {
  const out: number[] = [];
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '-') out.push(HOLD);
    else if (tok === '.') out.push(REST);
    else out.push(noteToMidi(tok));
  }
  if (out.length !== slots) throw new Error(`parseMelody: expected ${slots} slots, got ${out.length} in "${src}"`);
  return out;
}

/** Build a section from "chord [chord] | melody" lines. */
export function section(name: string, lines: readonly string[], slots = 8): SectionDef {
  const bars = lines.map((line): BarSpec => {
    const [chordStr, mel] = line.split('|');
    if (chordStr === undefined || mel === undefined) throw new Error(`section ${name}: bad line "${line}"`);
    const cs = chordStr.trim().split(/\s+/);
    const first = cs[0]!;
    parseChord(first);
    if (cs[1]) parseChord(cs[1]);
    return { chords: [first, cs[1] ?? first], melody: parseMelody(mel, slots) };
  });
  return { name, bars };
}

/** Same bars, new name (a variation pass arranged differently). */
const vary = (s: SectionDef, name: string): SectionDef => ({ name, bars: s.bars });

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, Bb: 10 } as const;

// ── "Bedhead Waltz" (title) ────────────────────────────────────────────────
const TI_A = section(
  'A',
  [
    'F    | A4 - - C5 F5 -',
    'F    | E5 - D5 - C5 -',
    'Bb   | D5 - - C5 Bb4 -',
    'F    | A4 - - - . .',
    'Gm   | Bb4 - - D5 G5 -',
    'C    | F5 - E5 - D5 -',
    'F    | C5 - - A4 C5 A4',
    'C7   | G4 - - - . .',
  ],
  6,
);
const TI_B = section(
  'B',
  [
    'Dm   | F5 - - E5 D5 -',
    'Am   | E5 - - C5 A4 -',
    'Bb   | D5 - C5 - Bb4 -',
    'F    | A4 - C5 - F5 -',
    'Gm   | G5 - F5 - D5 -',
    'Bb C | Bb4 - D5 - E5 -',
    'F    | F5 - - C5 A4 C5',
    'F    | F5 - - - . .',
  ],
  6,
);
export const TITLE_SONG: SongDef = {
  id: 'title',
  title: 'Bedhead Waltz',
  bpm: 108,
  stepsPerBar: 12,
  swing8: 0.5,
  swing16: 0.5,
  tonic: PC.F,
  scale: 'major',
  bed: 0,
  intro: [section('intro', ['F  | F5 - C5 - A4 -', 'C7 | G4 - - - . .'], 6)],
  loop: [TI_A, TI_B, vary(TI_A, 'A2'), vary(TI_B, 'B2')],
};

// ── "Five-Fifteen" (predawn) ───────────────────────────────────────────────
const PD_A = section('A', [
  'Gmaj7    | . . . . B4 - A4 -',
  'F#m7     | F#4 - - - . . . .',
  'Em7      | . . . . G4 - F#4 E4',
  'A7       | E4 - - - . . . .',
  'Gmaj7    | . . D5 - B4 - A4 -',
  'F#m7     | A4 - - - F#4 - . .',
  'Em7      | . . . . E4 - G4 -',
  'Asus4 A7 | A4 - - - . . . .',
]);
const PD_B = section('B', [
  'Bm7   | . . . . D5 - C#5 -',
  'Gmaj7 | B4 - - - . . . .',
  'Em7   | . . G4 - B4 - D5 -',
  'A7    | C#5 - - - . . . .',
  'Bm7   | . . . . F#5 - E5 -',
  'Gmaj7 | D5 - - - B4 - . .',
  'Em7   | . . . . G4 - E4 -',
  'Dmaj7 | F#4 - - - . . . .',
]);
export const PREDAWN_SONG: SongDef = {
  id: 'predawn',
  title: 'Five-Fifteen',
  bpm: 70,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.58,
  tonic: PC.D,
  scale: 'major',
  bed: 1,
  intro: [],
  loop: [PD_A, PD_B, vary(PD_A, 'A2'), vary(PD_B, 'B2')],
};

// ── "Rise and Shine" (wake) ────────────────────────────────────────────────
const WK_A = section('A', [
  'G  | D5 . D5 E5 D5 - B4 -',
  'D  | A4 - - - F#4 - A4 -',
  'Em | B4 . B4 C5 B4 - G4 -',
  'C  | E5 - - - C5 - . .',
  'G  | D5 . D5 E5 D5 - G5 -',
  'D  | F#5 - E5 - D5 - A4 -',
  'C  | E5 - D5 - C5 - A4 -',
  'D  | D5 - - - . . . .',
]);
const WK_B = section('B', [
  'C    | G4 - C5 - E5 - G5 -',
  'G    | G5 - F#5 - D5 - B4 -',
  'Am   | C5 - E5 - A5 - G5 E5',
  'D    | F#5 - - - D5 - . .',
  'C    | E5 - G5 - C6 - B5 A5',
  'G    | B5 - A5 - G5 - D5 -',
  'Am D | E5 - C5 - F#5 - A5 -',
  'G    | G5 - - - . . . .',
]);
export const WAKE_SONG: SongDef = {
  id: 'wake',
  title: 'Rise and Shine',
  bpm: 124,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.5,
  tonic: PC.G,
  scale: 'major',
  bed: 0,
  intro: [section('intro', ['G | . . . . . . . .', 'D | . . . . . . D5 -'])],
  loop: [WK_A, WK_B, vary(WK_A, 'A2'), vary(WK_B, 'B2')],
};

// ── "Smooth Strokes" (brushing) ────────────────────────────────────────────
const BR_A = section('A', [
  'Amaj7   | C#5 - E5 - A5 - G#5 E5',
  'C#m7    | G#5 - - - E5 - . .',
  'Dmaj7   | F#5 - A5 - F#5 - E5 D5',
  'E       | E5 - - - B4 - . .',
  'Amaj7   | C#5 - E5 - A5 - G#5 A5',
  'C#m7    | B5 - G#5 - E5 - . .',
  'Dmaj7 E | F#5 - E5 - D5 - B4 -',
  'A       | A4 - - - . . . .',
]);
const BR_B = section('B', [
  'F#m7  | A4 - C#5 - E5 - F#5 -',
  'Bm7   | D5 - - - B4 - . .',
  'Dmaj7 | C#5 - D5 - F#5 - A5 -',
  'E     | G#5 - - - E5 - . .',
  'F#m7  | A5 - F#5 - C#5 - E5 -',
  'Bm7   | D5 - - - F#5 - . .',
  'D E   | F#5 - D5 - E5 - G#5 -',
  'A     | A5 - - - . . . .',
]);
export const BRUSHING_SONG: SongDef = {
  id: 'brushing',
  title: 'Smooth Strokes',
  bpm: 100,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.55,
  tonic: PC.A,
  scale: 'major',
  bed: 0,
  intro: [section('intro', ['A | . . . . . . . .'])],
  loop: [BR_A, BR_B, vary(BR_A, 'A2'), vary(BR_B, 'B2')],
};

// ── "The Hair Inspector" (boss) ────────────────────────────────────────────
const BO_A = section('A', [
  'Dm   | D5 - - - A4 - D5 -',
  'Bb   | F5 - - - D5 - Bb4 -',
  'Gm   | G5 - F5 - D5 - Bb4 -',
  'A    | C#5 - - - E5 - A4 -',
  'Dm   | D5 - E5 - F5 - A5 -',
  'Bb   | Bb5 - - - A5 - F5 -',
  'Gm A | G5 - Bb5 - A5 - C#5 -',
  'D    | D5 - - - F#5 - A5 -',
]);
const BO_B = section('B', [
  'Gm   | Bb4 - D5 - G5 - - -',
  'Dm   | F5 - - - D5 - A4 -',
  'Bb   | D5 - F5 - Bb5 - A5 G5',
  'A    | A5 - - - E5 - C#5 -',
  'Gm   | G5 - - - Bb5 - G5 -',
  'Dm   | A5 - - - F5 - D5 -',
  'Bb A | F5 - D5 - E5 - C#5 -',
  'Dm   | D5 - - - . . . .',
]);
export const BOSS_SONG: SongDef = {
  id: 'boss',
  title: 'The Hair Inspector',
  bpm: 96,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.5,
  tonic: PC.D,
  scale: 'minor',
  bed: 0,
  intro: [section('intro', ['Dm | A4 . A4 . D5 - - -', 'A  | C#5 - - - E5 - . .'])],
  loop: [BO_A, BO_B, vary(BO_A, 'A2'), vary(BO_B, 'B2')],
};

// ── "Shoes! Bags! Go!" (rush) ──────────────────────────────────────────────
const RU_A = section('A', [
  'C6     | E5 G5 E5 C5 . G4 A4 C5',
  'A7     | C#5 - E5 - G5 - E5 -',
  'Dm7    | F5 A5 F5 D5 . C5 A4 F4',
  'G7     | G4 - B4 - D5 - F5 -',
  'C6     | E5 G5 E5 C5 . G4 A4 C5',
  'A7     | E5 - G5 - A5 - G5 E5',
  'Dm7 G7 | F5 - D5 - B4 - G4 -',
  'C6     | C5 - - - . . . .',
]);
const RU_B = section('B', [
  'E7    | G#4 - B4 - D5 - E5 -',
  'Am    | C5 - - - A4 - . .',
  'D7    | F#4 - A4 - C5 - D5 -',
  'G7    | B4 - - - G4 - . .',
  'E7    | E5 - D5 - B4 - G#4 -',
  'Am    | A4 - C5 - E5 - A5 -',
  'D7 G7 | F#5 - D5 - F5 - D5 -',
  'C     | C5 - - - . . . .',
]);
export const RUSH_SONG: SongDef = {
  id: 'rush',
  title: 'Shoes! Bags! Go!',
  bpm: 152,
  stepsPerBar: 16,
  swing8: 0.6,
  swing16: 0.5,
  tonic: PC.C,
  scale: 'major',
  bed: 0,
  intro: [section('intro', ['G7 | . . . . . . . .'])],
  loop: [RU_A, RU_B, vary(RU_A, 'A2'), vary(RU_B, 'B2')],
};

// ── "Windows Down" (drive) ─────────────────────────────────────────────────
const DR_V = section('verse', [
  'D   | A4 - F#4 - A4 - D5 -',
  'A   | C#5 - - - A4 - . .',
  'Bm  | B4 - D5 - F#5 - E5 D5',
  'G   | D5 - - - B4 - . .',
  'D   | A4 - F#4 - A4 - D5 -',
  'A   | E5 - - - C#5 - A4 -',
  'G A | B4 - D5 - C#5 - E5 -',
  'D   | D5 - - - . . . .',
]);
const DR_C = section('chorus', [
  'G    | B4 - - D5 - - G5 -',
  'D    | F#5 - - - E5 - D5 -',
  'A    | E5 - - C#5 - - A4 -',
  'D    | D5 - - - . . . .',
  'G    | B4 - - D5 - - G5 A5',
  'D    | F#5 - - - D5 - A4 -',
  'Em A | G5 - - - E5 - C#5 -',
  'D    | D5 - - - . . . .',
]);
export const DRIVE_SONG: SongDef = {
  id: 'drive',
  title: 'Windows Down',
  bpm: 118,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.52,
  tonic: PC.D,
  scale: 'major',
  bed: 0,
  intro: [section('intro', ['D | . . . . . . . .', 'A | . . . . . . . .'])],
  loop: [DR_V, DR_C, vary(DR_V, 'verse2'), vary(DR_C, 'chorus2')],
};

// ── "Report Card" (results) ────────────────────────────────────────────────
const RE_A = section('A', [
  'F    | A4 - C5 - F5 - - -',
  'C    | E5 - - - G5 - - -',
  'Dm   | F5 - E5 - D5 - A4 -',
  'Bb   | D5 - - - . . . .',
  'F    | A4 - C5 - F5 - G5 A5',
  'C    | G5 - - - E5 - C5 -',
  'Bb C | D5 - F5 - E5 - G5 -',
  'F    | F5 - - - . . . .',
]);
const RE_B = section('B', [
  'Bb   | D5 - F5 - Bb5 - A5 -',
  'F    | A5 - - - F5 - . .',
  'Gm   | G5 - Bb5 - A5 - G5 -',
  'C    | E5 - - - C5 - . .',
  'Bb   | D5 - F5 - Bb5 - C6 -',
  'F    | A5 - - - F5 - C5 -',
  'Gm C | Bb4 - D5 - E5 - G5 -',
  'F    | F5 - - - . . . .',
]);
export const RESULTS_SONG: SongDef = {
  id: 'results',
  title: 'Report Card',
  bpm: 100,
  stepsPerBar: 16,
  swing8: 0.5,
  swing16: 0.54,
  tonic: PC.F,
  scale: 'major',
  bed: 0,
  intro: [section('fanfare', ['Bb C | C5 D5 E5 . F5 . G5 -', 'F    | A5 - - - . . . .'])],
  loop: [RE_A, RE_B, vary(RE_A, 'A2'), vary(RE_B, 'B2')],
};

export const SONGS: Readonly<Record<MusicId, SongDef>> = {
  title: TITLE_SONG,
  predawn: PREDAWN_SONG,
  wake: WAKE_SONG,
  brushing: BRUSHING_SONG,
  boss: BOSS_SONG,
  rush: RUSH_SONG,
  drive: DRIVE_SONG,
  results: RESULTS_SONG,
};

export const MUSIC_IDS = Object.keys(SONGS) as MusicId[];

// ── Song position ──────────────────────────────────────────────────────────

export interface BarLocation {
  /** In the one-shot intro. */
  intro: boolean;
  /** Completed passes through the loop (0 during the intro). */
  cycle: number;
  section: SectionDef;
  barInSection: number;
  /** Bar index within the loop (or intro). */
  barInPart: number;
}

const sumBars = (secs: readonly SectionDef[]): number => secs.reduce((n, s) => n + s.bars.length, 0);

/** Where an absolute bar index lands in a song. */
export function locateBar(song: SongDef, bar: number): BarLocation {
  let b = Math.max(0, Math.floor(bar));
  const nIntro = sumBars(song.intro);
  let part = song.loop;
  let intro = false;
  let cycle = 0;
  if (b < nIntro) {
    part = song.intro;
    intro = true;
  } else {
    b -= nIntro;
    const nLoop = Math.max(1, sumBars(song.loop));
    cycle = Math.floor(b / nLoop);
    b %= nLoop;
  }
  const barInPart = b;
  for (const s of part) {
    if (b < s.bars.length) return { intro, cycle, section: s, barInSection: b, barInPart };
    b -= s.bars.length;
  }
  // Unreachable for well-formed songs; fall back to the first loop bar.
  return { intro: false, cycle, section: song.loop[0]!, barInSection: 0, barInPart: 0 };
}

export function barSpec(song: SongDef, bar: number): BarSpec {
  const loc = locateBar(song, bar);
  return loc.section.bars[loc.barInSection]!;
}

/** Length of the one-shot intro in bars. */
export function introBars(song: SongDef): number {
  return sumBars(song.intro);
}

/** Length of one loop pass in bars. */
export function loopBars(song: SongDef): number {
  return sumBars(song.loop);
}

/** Seconds per bar at the song's base tempo. */
export function secondsPerBar(song: SongDef): number {
  return (60 / song.bpm) * (song.stepsPerBar / 4);
}

// ── Intensity ───────────────────────────────────────────────────────────────

/** Intensity thresholds (level 1 and 2) with hysteresis. */
export const INTENSITY_THRESHOLDS = { mid: 0.35, high: 0.7 } as const;
const HYST = 0.05;

/** Discrete intensity level (0..2) with hysteresis against the previous level. */
export function intensityLevel(intensity: number, prevLevel: number): 0 | 1 | 2 {
  const v = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
  const gate = (threshold: number, wasOn: boolean): boolean => (wasOn ? v >= threshold - HYST : v >= threshold);
  if (gate(INTENSITY_THRESHOLDS.high, prevLevel >= 2)) return 2;
  if (gate(INTENSITY_THRESHOLDS.mid, prevLevel >= 1)) return 1;
  return 0;
}

/** Tempo by intensity level: only the rush pushes (the clock is running down). */
export function tempoFor(song: SongDef, level: number): number {
  if (song.id === 'rush') return song.bpm + (level >= 2 ? 10 : level >= 1 ? 4 : 0);
  return song.bpm;
}

/** Move a tempo toward its target by at most `maxStep` BPM (applied once per bar). */
export function stepTempo(current: number, target: number, maxStep = 4): number {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

// ── Layers ─────────────────────────────────────────────────────────────────

export type BassStyle = 'none' | 'waltz' | 'root' | 'lofi' | 'bounce' | 'walk' | 'ostinato' | 'groove';
export type CompStyle = 'none' | 'waltzPizz' | 'lofiKeys' | 'pizzOstinato' | 'pluckArp' | 'strum' | 'charleston' | 'bossPizz' | 'keysPad';
export type DrumStyle = 'none' | 'soft' | 'lofi' | 'bustle' | 'groove' | 'march' | 'swing' | 'bouncy';

/** Active instrument layers for a bar. */
export interface Layers {
  melody: MelodyInst | 'none';
  /** Semitone shift of the melody (music box plays an octave up). */
  melodyOct: number;
  double: MelodyInst | 'none';
  doubleOct: number;
  bass: BassStyle;
  bassInst: 'bass' | 'pluckBass';
  comp: CompStyle;
  pad: 'none' | 'strings' | 'choir' | 'ooh';
  /** Broken-chord sparkle in 8ths. */
  arp: 'none' | 'musicBox' | 'harp';
  drums: DrumStyle;
  /** 0 none · 1 eighths · 2 sixteenths. */
  shaker: 0 | 1 | 2;
  /** 0 none · 1 off-beat eighths · 2 sixteenths. */
  tamb: 0 | 1 | 2;
  hats: 0 | 1 | 2;
  clap: boolean;
  /** Brass stabs on the off-beats. */
  stabs: boolean;
  /** 0 none · 1 on the chord changes · 2 plus a roll into the next section. */
  timp: 0 | 1 | 2;
  /** Soft cymbal on the first bar of each section. */
  cymbal: boolean;
  /** Pickup fill on the last bar of each section (needs drums). */
  fill: boolean;
  /** Triangle "ding" on the first bar of each section. */
  triangle: boolean;
}

export const SILENT_LAYERS: Readonly<Layers> = {
  melody: 'none',
  melodyOct: 0,
  double: 'none',
  doubleOct: 0,
  bass: 'none',
  bassInst: 'bass',
  comp: 'none',
  pad: 'none',
  arp: 'none',
  drums: 'none',
  shaker: 0,
  tamb: 0,
  hats: 0,
  clap: false,
  stabs: false,
  timp: 0,
  cymbal: false,
  fill: false,
  triangle: false,
};

const L = (over: Partial<Layers>): Layers => ({ ...SILENT_LAYERS, ...over });
const up = <T extends number>(a: T, b: T): T => (a > b ? a : b);

/** Title: music box waltz; celesta / strings / sparkle arps on the repeats. Intensity adds a shaker, then a soft kick + glock. */
export function titleLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(TITLE_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ melody: 'musicBox', melodyOct: 12, triangle: true, pad: loc.barInSection === 1 ? 'strings' : 'none', bass: loc.barInSection === 1 ? 'root' : 'none' });
  else if (n === 'A') l = L({ melody: 'musicBox', melodyOct: 12, bass: 'waltz', comp: 'waltzPizz' });
  else if (n === 'B') l = L({ melody: 'musicBox', melodyOct: 12, double: 'celesta', bass: 'waltz', comp: 'waltzPizz', pad: 'strings' });
  else if (n === 'A2') l = L({ melody: 'celesta', melodyOct: 12, arp: 'musicBox', bass: 'waltz', comp: 'waltzPizz' });
  else l = L({ melody: 'musicBox', melodyOct: 12, double: 'bell', bass: 'waltz', comp: 'waltzPizz', pad: 'strings', triangle: true });
  if (level >= 1 && !loc.intro) l.shaker = up(l.shaker, 1);
  if (level >= 2 && !loc.intro) {
    l.drums = 'soft';
    if (l.double === 'none') l.double = 'bell';
  }
  return l;
}

/** Pre-dawn: lo-fi keys + sub bass + sparse kalimba over the vinyl bed. Drums only with intensity. */
export function predawnLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(PREDAWN_SONG, bar);
  const n = loc.section.name;
  const melody: MelodyInst = n === 'A' ? 'kalimba' : n === 'B' ? 'musicBox' : n === 'A2' ? 'celesta' : 'kalimba';
  const l = L({ melody, comp: 'lofiKeys', bass: 'lofi' });
  if (level >= 1) l.drums = 'lofi';
  if (level >= 2) {
    l.hats = 1;
    l.shaker = 1;
  }
  return l;
}

/** Wake: bustling pizzicato + claps + marimba; xylophone / glock / tambourine on the repeat. */
export function wakeLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(WAKE_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ comp: 'pizzOstinato', clap: loc.barInSection === 1, shaker: 1 });
  else {
    const second = n.endsWith('2');
    const b = n.startsWith('B');
    l = L({
      melody: n === 'A2' ? 'xylo' : 'marimba',
      double: n === 'B2' ? 'bell' : 'none',
      doubleOct: 12,
      comp: 'pizzOstinato',
      bass: 'bounce',
      bassInst: 'pluckBass',
      pad: b ? 'strings' : 'none',
      drums: 'bustle',
      clap: true,
      shaker: 1,
      tamb: second ? 1 : 0,
      cymbal: n === 'B2',
      fill: true,
    });
  }
  if (level >= 1) {
    l.shaker = 2;
    l.tamb = up(l.tamb, 1);
  }
  if (level >= 2 && !loc.intro) {
    if (l.double === 'none') {
      l.double = 'bell';
      l.doubleOct = 12;
    }
    l.cymbal = true;
    l.hats = 1;
  }
  return l;
}

/** Brushing: harp arps + a light rim groove; kalimba (A) / marimba (B) tune. Claps & glock with intensity. */
export function brushingLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(BRUSHING_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ comp: 'pluckArp' });
  else {
    const b = n.startsWith('B');
    l = L({
      melody: b ? 'marimba' : 'kalimba',
      double: n === 'A2' ? 'bell' : 'none',
      doubleOct: 12,
      comp: 'pluckArp',
      bass: 'groove',
      bassInst: 'pluckBass',
      pad: b ? 'strings' : 'none',
      drums: 'groove',
      shaker: 1,
      fill: true,
      triangle: n === 'B2',
    });
  }
  if (level >= 1 && !loc.intro) {
    l.clap = true;
    l.tamb = 1;
  }
  if (level >= 2 && !loc.intro) {
    l.shaker = 2;
    if (l.double === 'none') {
      l.double = 'bell';
      l.doubleOct = 12;
    }
  }
  return l;
}

/** Boss: timpani + soft brass theme + "aaah" choir; tiptoe pizzicato on B. Intensity adds a march, stabs, cymbals. */
export function bossLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(BOSS_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ melody: 'brass', pad: 'choir', timp: 2, cymbal: loc.barInSection === 0 });
  else {
    const b = n.startsWith('B');
    l = L({
      melody: 'brass',
      double: n === 'A2' ? 'bell' : 'none',
      doubleOct: 12,
      pad: 'choir',
      bass: b ? 'root' : 'ostinato',
      comp: b ? 'bossPizz' : 'none',
      timp: 1,
      triangle: b,
    });
  }
  if (level >= 1 && !loc.intro) {
    l.drums = 'march';
    l.stabs = true;
  }
  if (level >= 2) {
    l.cymbal = true;
    l.timp = 2;
    if (!loc.intro && l.double === 'none') {
      l.double = 'choir';
      l.doubleOct = 0;
    }
  }
  return l;
}

/** Rush: walking bass + xylophone + Charleston keys + brush kit. Stabs/claps, then tambourine + glock + tempo push. */
export function rushLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(RUSH_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ bass: 'walk', bassInst: 'pluckBass', drums: 'swing', shaker: 1, fill: true });
  else
    l = L({
      melody: n === 'A2' ? 'marimba' : 'xylo',
      double: n === 'B2' ? 'bell' : 'none',
      doubleOct: 12,
      bass: 'walk',
      bassInst: 'pluckBass',
      comp: 'charleston',
      drums: 'swing',
      shaker: 1,
      fill: true,
      cymbal: n === 'A2',
    });
  if (level >= 1) {
    l.stabs = !loc.intro;
    l.clap = true;
    l.hats = 1;
  }
  if (level >= 2) {
    l.tamb = 2;
    l.cymbal = true;
    if (!loc.intro && l.double === 'none') {
      l.double = 'bell';
      l.doubleOct = 12;
    }
  }
  return l;
}

/** Drive: uke strums + whistled tune + claps; "ooh" backing and tambourine on the chorus, glock on the repeats. */
export function driveLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(DRIVE_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ comp: 'strum', drums: loc.barInSection === 1 ? 'bouncy' : 'none' });
  else {
    const chorus = n.startsWith('chorus');
    l = L({
      melody: 'whistle',
      double: n === 'chorus2' || n === 'verse2' ? 'bell' : 'none',
      doubleOct: 12,
      comp: 'strum',
      bass: 'bounce',
      bassInst: 'pluckBass',
      pad: chorus ? 'ooh' : 'none',
      drums: 'bouncy',
      clap: true,
      tamb: chorus ? 1 : 0,
      cymbal: chorus,
      fill: true,
    });
  }
  if (level >= 1) l.tamb = up(l.tamb, 1);
  if (level >= 2) {
    l.shaker = 2;
    if (!loc.intro && l.double === 'none') {
      l.double = 'bell';
      l.doubleOct = 12;
    }
  }
  return l;
}

/** Results: brass + bell fanfare over timpani, then a warm proud loop. */
export function resultsLayers(bar: number, level: 0 | 1 | 2): Layers {
  const loc = locateBar(RESULTS_SONG, bar);
  const n = loc.section.name;
  let l: Layers;
  if (loc.intro) l = L({ melody: 'brass', double: 'bell', doubleOct: 12, pad: 'strings', timp: 2, cymbal: true, bass: 'root' });
  else {
    const b = n.startsWith('B');
    const second = n.endsWith('2');
    l = L({
      melody: second ? 'brass' : b ? 'marimba' : 'bell',
      melodyOct: !second && !b ? 12 : 0,
      double: b || second ? 'bell' : 'none',
      doubleOct: 12,
      comp: 'keysPad',
      pad: 'strings',
      bass: 'root',
      drums: 'soft',
      clap: true,
      triangle: loc.barInSection === 0 && b,
    });
  }
  if (level >= 1 && !loc.intro) l.shaker = 1;
  if (level >= 2 && !loc.intro) {
    l.tamb = 1;
    l.hats = 1;
  }
  return l;
}

/** Layers for any track at an intensity level. */
export function layersFor(song: SongDef, bar: number, level: 0 | 1 | 2 = 0): Layers {
  switch (song.id) {
    case 'title':
      return titleLayers(bar, level);
    case 'predawn':
      return predawnLayers(bar, level);
    case 'wake':
      return wakeLayers(bar, level);
    case 'brushing':
      return brushingLayers(bar, level);
    case 'boss':
      return bossLayers(bar, level);
    case 'rush':
      return rushLayers(bar, level);
    case 'drive':
      return driveLayers(bar, level);
    case 'results':
      return resultsLayers(bar, level);
  }
}

// ── Arrangement ────────────────────────────────────────────────────────────

function melodyEvents(spec: BarSpec, inst: MelodyInst, octave: number, velScale: number, out: NoteEvent[]): void {
  const slots = spec.melody.length;
  let prev = -1;
  for (let slot = 0; slot < slots; slot++) {
    const m = spec.melody[slot]!;
    if (m === HOLD) continue;
    if (m === REST) {
      prev = -1;
      continue;
    }
    let holds = 0;
    while (slot + 1 + holds < slots && spec.melody[slot + 1 + holds] === HOLD) holds++;
    const len = (1 + holds) * 2;
    const midi = m + octave;
    const ev: NoteEvent = { inst, step: slot * 2, midi, vel: (slot % 2 === 0 ? 0.9 : 0.76) * velScale, len };
    // The whistle slides between close neighbours (legato sing-along).
    if (inst === 'whistle' && prev > 0 && Math.abs(prev - midi) <= 2 && prev !== midi) ev.glide = prev;
    out.push(ev);
    prev = midi;
  }
}

/** Timpani pitch for a chord: the root placed in E2..D#3. */
function timpPitch(symbol: string): number {
  return 40 + ((parseChord(symbol).root - 4 + 12) % 12);
}

/**
 * Arrange one bar. Appends events to `out` (caller clears it).
 * @param bar absolute bar index since the track started
 */
export function arrangeBar(song: SongDef, bar: number, layers: Layers, out: NoteEvent[]): void {
  const spb = song.stepsPerBar;
  const loc = locateBar(song, bar);
  const spec = loc.section.bars[loc.barInSection]!;
  const next = barSpec(song, bar + 1);
  const split = spec.chords[1] !== spec.chords[0];
  const chordAt = (step: number): string => spec.chords[step < 8 ? 0 : 1];
  const firstOfSection = loc.barInSection === 0;
  const lastOfSection = loc.barInSection === loc.section.bars.length - 1;
  const halves: ReadonlyArray<readonly [number, number]> = split ? [[0, 8], [8, spb - 8]] : [[0, spb]];

  // ── Melody (+ doubling) ──
  if (layers.melody !== 'none') melodyEvents(spec, layers.melody, layers.melodyOct, 1, out);
  if (layers.double !== 'none' && (layers.double !== layers.melody || layers.doubleOct !== layers.melodyOct))
    melodyEvents(spec, layers.double, layers.doubleOct, 0.62, out);

  // ── Bass ──
  const bi = layers.bassInst;
  const root = (step: number): number => bassRoot(chordAt(step));
  const fifth = (step: number): number => bassTone(chordAt(step), 7);
  const third = (step: number): number => bassTone(chordAt(step), parseChord(chordAt(step)).intervals[1] ?? 4);
  const bass = (step: number, midi: number, vel: number, len: number): void => void out.push({ inst: bi, step, midi, vel, len });
  switch (layers.bass) {
    case 'waltz':
      bass(0, root(0), 0.9, 3);
      if (split) bass(8, root(8), 0.8, 3);
      break;
    case 'root':
      bass(0, root(0), 0.9, split ? 7 : spb - 1);
      if (split) bass(8, root(8), 0.85, spb - 9);
      break;
    case 'lofi':
      bass(0, root(0), 0.9, 6);
      if (split) bass(8, root(8), 0.8, 6);
      else bass(10, fifth(10), 0.6, 4);
      break;
    case 'bounce':
      bass(0, root(0), 0.95, 3);
      bass(4, fifth(4), 0.7, 3);
      bass(8, root(8), 0.9, 3);
      bass(12, fifth(12), 0.7, 3);
      break;
    case 'walk': {
      const target = bassRoot(next.chords[0]);
      const approach = target - 1 >= 28 && (bar % 2 === 0 || target + 1 > 60) ? target - 1 : target + 1;
      bass(0, root(0), 0.95, 4);
      bass(4, split ? fifth(0) : third(0), 0.75, 4);
      bass(8, split ? root(8) : fifth(8), 0.85, 4);
      bass(12, approach, 0.7, 4);
      break;
    }
    case 'ostinato': {
      const offs = [0, 0, 12, 0, 0, 0, 12, 7];
      for (let i = 0; i < 8; i++) {
        const s = i * 2;
        let m = root(s) + offs[i]!;
        while (m > 60) m -= 12;
        bass(s, m, s % 4 === 0 ? 0.9 : 0.6, 1);
      }
      break;
    }
    case 'groove': {
      bass(0, root(0), 0.95, 3);
      bass(3, root(0), 0.6, 1);
      bass(6, Math.min(60, root(0) + 12), 0.7, 2);
      bass(8, root(8), 0.9, 2);
      bass(10, fifth(8), 0.65, 2);
      const target = bassRoot(next.chords[0]);
      bass(14, target === root(8) ? fifth(8) : target > root(8) ? target - 1 : target + 1, 0.6, 2);
      break;
    }
    case 'none':
      break;
  }

  // ── Comping ──
  switch (layers.comp) {
    case 'waltzPizz':
      for (const s of [4, 8]) if (s < spb) out.push({ inst: 'pizz', step: s, midi: 0, vel: s === 4 ? 0.6 : 0.5, len: 2, chord: closeVoicing(chordAt(s), 60), stacc: true });
      break;
    case 'lofiKeys':
      out.push({ inst: 'epiano', step: 0, midi: 0, vel: 0.62, len: split ? 7 : 6, chord: closeVoicing(chordAt(0), 57) });
      if (split) out.push({ inst: 'epiano', step: 8, midi: 0, vel: 0.55, len: 7, chord: closeVoicing(chordAt(8), 57) });
      else out.push({ inst: 'epiano', step: 10, midi: 0, vel: 0.42, len: 5, chord: closeVoicing(chordAt(10), 57) });
      break;
    case 'pizzOstinato': {
      const pat = [0, 2, 1, 2];
      for (let i = 0; i < spb / 2; i++) {
        const s = i * 2;
        const tones = closeVoicing(chordAt(s), 62);
        out.push({ inst: 'pizz', step: s, midi: tones[Math.min(tones.length - 1, pat[i % 4]!)]!, vel: s % 4 === 0 ? 0.75 : 0.5, len: 1, stacc: true });
      }
      break;
    }
    case 'pluckArp': {
      const pat = [0, 1, 2, 3, 4, 3, 2, 1];
      for (let i = 0; i < spb / 2; i++) {
        const s = i * 2;
        const tones = arpTones(chordAt(s), 57, 2);
        out.push({ inst: 'harp', step: s, midi: tones[Math.min(tones.length - 1, pat[i % 8]!)]!, vel: s % 4 === 0 ? 0.6 : 0.42, len: 2 });
      }
      break;
    }
    case 'strum': {
      const pat: ReadonlyArray<readonly [number, boolean, number]> = [
        [0, false, 0.75],
        [4, false, 0.58],
        [6, true, 0.42],
        [10, true, 0.48],
        [12, false, 0.62],
        [14, true, 0.42],
      ];
      for (const [s, u, v] of pat) out.push({ inst: 'uke', step: s, midi: 0, vel: v, len: 2, chord: closeVoicing(chordAt(s), 60), up: u });
      break;
    }
    case 'charleston':
      out.push({ inst: 'epiano', step: 0, midi: 0, vel: 0.55, len: 2, chord: closeVoicing(chordAt(0), 60) });
      out.push({ inst: 'epiano', step: 6, midi: 0, vel: 0.45, len: 2, chord: closeVoicing(chordAt(6), 60) });
      if (split) out.push({ inst: 'epiano', step: 10, midi: 0, vel: 0.45, len: 2, chord: closeVoicing(chordAt(10), 60) });
      break;
    case 'bossPizz': {
      const pat = [0, 2, 0, 2, 0, 2, 1, 2];
      for (let i = 0; i < spb / 2; i++) {
        const s = i * 2;
        const tones = closeVoicing(chordAt(s), 50);
        out.push({ inst: 'pizz', step: s, midi: tones[Math.min(tones.length - 1, pat[i % 8]!)]!, vel: s % 4 === 0 ? 0.62 : 0.45, len: 1, stacc: true });
      }
      break;
    }
    case 'keysPad':
      for (const [s, len] of halves) out.push({ inst: 'epiano', step: s, midi: 0, vel: 0.45, len, chord: closeVoicing(chordAt(s), 57) });
      break;
    case 'none':
      break;
  }

  // ── Pads ──
  if (layers.pad !== 'none') {
    const inst: InstName = layers.pad === 'strings' ? 'pad' : layers.pad === 'choir' ? 'choirPad' : 'oohPad';
    for (const [s, len] of halves) out.push({ inst, step: s, midi: 0, vel: 0.8, len, chord: closeVoicing(chordAt(s), layers.pad === 'strings' ? 55 : 57) });
  }

  // ── Arp sparkle ──
  if (layers.arp !== 'none') {
    const pat = [0, 1, 2, 3, 4, 3, 2, 1];
    for (let i = 0; i < spb / 2; i++) {
      const s = i * 2;
      const tones = arpTones(chordAt(s), 67, 2);
      out.push({ inst: layers.arp === 'musicBox' ? 'musicBox' : 'harp', step: s, midi: tones[Math.min(tones.length - 1, pat[i % 8]!)]!, vel: s % 4 === 0 ? 0.5 : 0.36, len: 2 });
    }
  }

  // ── Brass stabs ──
  if (layers.stabs) for (const s of spb === 16 ? [6, 14] : [4, 8]) out.push({ inst: 'stab', step: s, midi: 0, vel: 0.75, len: 1, chord: closeVoicing(chordAt(s), 62) });

  // ── Timpani ──
  if (layers.timp > 0) {
    out.push({ inst: 'timp', step: 0, midi: timpPitch(chordAt(0)), vel: 0.9, len: 4 });
    const mid = 8; // beat 3 in both 4/4 and 3/4
    if (layers.timp === 2 && lastOfSection) {
      for (let s = mid; s < spb; s++) out.push({ inst: 'timp', step: s, midi: timpPitch(chordAt(s)), vel: 0.3 + (0.45 * (s - mid)) / Math.max(1, spb - mid), len: 1 });
    } else out.push({ inst: 'timp', step: mid, midi: timpPitch(chordAt(mid)), vel: 0.75, len: 4 });
  }

  // ── Colour percussion ──
  if (layers.cymbal && firstOfSection) out.push({ inst: 'cymbal', step: 0, midi: 0, vel: 0.9, len: 8 });
  if (layers.triangle && firstOfSection) out.push({ inst: 'triangle', step: 0, midi: 0, vel: 0.8, len: 4 });

  // ── Drum kit ──
  const fillBar = layers.fill && lastOfSection && layers.drums !== 'none';
  const drumSteps = fillBar ? spb - 4 : spb;
  const hit = (inst: InstName, s: number, v: number): void => void (s < drumSteps && out.push({ inst, step: s, midi: 0, vel: v, len: 1 }));
  switch (layers.drums) {
    case 'soft':
      hit('kick', 0, 0.55);
      if (spb === 16) hit('kick', 8, 0.45);
      break;
    case 'lofi':
      hit('kick', 0, 0.7);
      hit('kick', 10, 0.55);
      hit('rim', 4, 0.45);
      hit('rim', 12, 0.45);
      break;
    case 'bustle':
      hit('kick', 0, 0.9);
      hit('kick', 8, 0.8);
      if (bar % 2 === 1) hit('kick', 10, 0.6);
      break;
    case 'groove':
      hit('kick', 0, 0.85);
      hit('kick', 7, 0.55);
      hit('kick', 10, 0.7);
      hit('rim', 4, 0.7);
      hit('rim', 12, 0.7);
      hit('rim', 15, 0.22);
      break;
    case 'march':
      hit('kick', 0, 0.85);
      hit('kick', 8, 0.8);
      for (const [s, v] of [
        [0, 0.85],
        [3, 0.35],
        [4, 0.7],
        [6, 0.35],
        [7, 0.4],
        [8, 0.85],
        [11, 0.35],
        [12, 0.7],
        [14, 0.45],
        [15, 0.5],
      ] as const)
        hit('snare', s, v * 0.7);
      break;
    case 'swing':
      hit('kick', 0, 0.7);
      hit('kick', 8, 0.6);
      hit('snare', 4, 0.7);
      hit('snare', 12, 0.7);
      break;
    case 'bouncy':
      hit('kick', 0, 0.9);
      hit('kick', 6, 0.55);
      hit('kick', 8, 0.8);
      break;
    case 'none':
      break;
  }
  if (layers.clap) for (const s of spb === 16 ? [4, 12] : [4, 8]) hit('clap', s, 0.75);
  if (layers.shaker > 0) {
    const by = layers.shaker === 2 ? 1 : 2;
    for (let s = 0; s < drumSteps; s += by) hit('shaker', s, s % 4 === 2 ? 0.8 : s % 2 === 1 ? 0.35 : 0.55);
  }
  if (layers.tamb > 0) {
    if (layers.tamb === 1) for (let s = 2; s < drumSteps; s += 4) hit('tamb', s, 0.6);
    else for (let s = 0; s < drumSteps; s++) hit('tamb', s, s % 4 === 2 ? 0.7 : 0.28);
  }
  if (layers.hats > 0) {
    const by = layers.hats === 2 ? 1 : 2;
    for (let s = 0; s < drumSteps; s += by) hit('hat', s, s % 4 === 0 ? 0.7 : 0.5);
  }
  if (fillBar) {
    // Pickup: four soft 16ths (rim for the gentle tracks, brush snare for the busy ones).
    const inst: InstName = layers.drums === 'lofi' || layers.drums === 'groove' || layers.drums === 'soft' ? 'rim' : 'snare';
    for (let i = 0; i < 4; i++) out.push({ inst, step: spb - 4 + i, midi: 0, vel: 0.35 + 0.12 * i, len: 1 });
  }
}
