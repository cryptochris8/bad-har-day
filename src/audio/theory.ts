// ─────────────────────────────────────────────────────────────────────────────
// Music theory helpers (pure, unit-tested): pitch maths, note names, chord symbols,
// scales and voicings for the arranger. Adapted from ATHLETE MAYHEM's theory.ts
// (scales + scale snapping are new — the "sing" babble mood and song checks use them).
// ─────────────────────────────────────────────────────────────────────────────

/** MIDI note → frequency in Hz (A4 = 69 = 440 Hz, equal temperament). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Frequency → (fractional) MIDI note. */
export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Cents → frequency ratio. */
export function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

/** Semitones → frequency ratio. */
export function semis(n: number): number {
  return Math.pow(2, n / 12);
}

const PITCH_CLASS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * Parse a note name like "G3", "F#4", "Bb2" (C4 = 60) into a MIDI number.
 * Throws on malformed input — note names only appear in hand-written song data.
 */
export function noteToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name.trim());
  if (!m) throw new Error(`noteToMidi: bad note "${name}"`);
  const letter = m[1]!.toUpperCase();
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + PITCH_CLASS[letter]! + acc;
}

/** Pitch class (0..11) of a note letter with optional accidental: "F#", "Bb", "C". */
export function pitchClassOf(name: string): number {
  const m = /^([A-G])([#b]?)$/.exec(name.trim());
  if (!m) throw new Error(`pitchClassOf: bad name "${name}"`);
  return (PITCH_CLASS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
}

/** Chord qualities as semitone intervals above the root (root first). */
export const QUALITIES: Readonly<Record<string, readonly number[]>> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  add9: [0, 4, 7, 14],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  dim: [0, 3, 6],
};

export interface Chord {
  /** Root pitch class 0..11 (0 = C). */
  root: number;
  /** Intervals above the root, root (0) first. */
  intervals: readonly number[];
}

const chordCache = new Map<string, Chord>();

/** Parse a chord symbol: "Em", "Bbmaj7", "A7", "D5", "Gsus4", "F#m9". Throws on unknown symbols. */
export function parseChord(symbol: string): Chord {
  const hit = chordCache.get(symbol);
  if (hit) return hit;
  const m = /^([A-G])([#b]?)(maj9|maj7|m9|m7|m6|add9|sus2|sus4|dim|m|7|6|5|)$/.exec(symbol.trim());
  if (!m || !QUALITIES[m[3]!]) throw new Error(`parseChord: bad chord "${symbol}"`);
  const root = (PITCH_CLASS[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const c: Chord = { root, intervals: QUALITIES[m[3]!]! };
  chordCache.set(symbol, c);
  return c;
}

/** Pitch classes of a chord's tones, root first. */
export function chordPcs(symbol: string): number[] {
  const c = parseChord(symbol);
  return c.intervals.map((i) => (c.root + i) % 12);
}

export const pitchClass = (midi: number): number => ((midi % 12) + 12) % 12;

// ── Scales ───────────────────────────────────────────────────────────────────

export type ScaleName = 'major' | 'minor' | 'harmonicMinor' | 'dorian' | 'mixolydian' | 'majorPent' | 'minorPent';

export const SCALES: Readonly<Record<ScaleName, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
};

/** Whether a MIDI note belongs to the scale on `tonic` (pitch class). */
export function inScale(midi: number, tonic: number, scale: ScaleName): boolean {
  return SCALES[scale].includes(pitchClass(midi - tonic));
}

/**
 * The MIDI note of scale degree `degree` (0-based, may be negative or exceed the
 * scale length — wraps into octaves) above the tonic `tonicMidi`.
 */
export function scaleNote(tonicMidi: number, scale: ScaleName, degree: number): number {
  const s = SCALES[scale];
  const n = s.length;
  const oct = Math.floor(degree / n);
  const i = ((degree % n) + n) % n;
  return tonicMidi + oct * 12 + s[i]!;
}

/** Snap a (fractional) MIDI note to the nearest note of a scale on `tonic`. */
export function snapToScale(midi: number, tonic: number, scale: ScaleName): number {
  const base = Math.round(midi);
  for (let d = 0; d <= 6; d++) {
    const lo = base - d;
    const hi = base + d;
    const loOk = inScale(lo, tonic, scale);
    const hiOk = inScale(hi, tonic, scale);
    if (loOk && hiOk) return Math.abs(midi - lo) <= Math.abs(hi - midi) ? lo : hi;
    if (loOk) return lo;
    if (hiOk) return hi;
  }
  return base;
}

// ── Voicings ─────────────────────────────────────────────────────────────────

/** Bass range used by the arranger (E1..C4). */
export const BASS_LOW = 28;
export const BASS_HIGH = 60;

/** Bass root for a chord: the pitch class placed in [low, low + 12) (default C2..B2 — audible on phones). */
export function bassRoot(symbol: string, low = 36): number {
  return low + ((parseChord(symbol).root - pitchClass(low) + 12) % 12);
}

/** The chord tone `interval` semitones above the bass root, kept inside the bass range. */
export function bassTone(symbol: string, interval: number, low = 36): number {
  let n = bassRoot(symbol, low) + interval;
  while (n > BASS_HIGH) n -= 12;
  while (n < BASS_LOW) n += 12;
  return n;
}

/**
 * Close voicing of a chord with every tone placed in [low, low + 12), sorted
 * ascending. Extensions above the octave (9ths) fold down into the same window.
 */
export function closeVoicing(symbol: string, low = 57): number[] {
  const c = parseChord(symbol);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const iv of c.intervals) {
    const p = (c.root + iv) % 12;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(low + ((p - pitchClass(low) + 12) % 12));
  }
  return out.sort((a, b) => a - b);
}

/** Chord tones spread upward from `low` over `octaves` (arpeggio material). */
export function arpTones(symbol: string, low = 64, octaves = 2): number[] {
  const base = closeVoicing(symbol, low);
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const n of base) out.push(n + 12 * o);
  return out;
}
