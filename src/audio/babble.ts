// ─────────────────────────────────────────────────────────────────────────────
// Babble: Animal-Crossing-style gibberish for speech bubbles.
//
// babblePlan() (pure, deterministic, unit-tested) turns (voice, text, mood) into a
// list of syllables — start, length, pitch glide, vowel, consonant, loudness — seeded
// by a hash of the TEXT + mood, so a line always "says" the same thing and different
// characters say it with the same contour in their own voice. The text shapes it:
// vowels pick the formants, consonants the onsets, spaces make word gaps, "?" rises,
// "!" lifts and "…" trails off. Duration ≈ 0.05 s per character (≤ 2.2 s).
//
// playBabble() renders a plan with ONE sawtooth + two automated formant band-passes
// + one noise source for consonants/breath (~14 nodes per line, whatever its length):
// cheap on phones and easy to cut when the next line interrupts.
//
// Voices: chris low-mid & warm · ashley mid & bright · addy high & bright · ellie high,
// a touch softer · heidi highest & cutest · dog = little "boof"s · extra = neutral.
// ─────────────────────────────────────────────────────────────────────────────
import { VOWELS, type Vowel } from './instruments';
import { type Ctx, filterNode, gainNode, holdAt, noiseNode, oscNode } from './synth';
import { scaleNote, semis } from './theory';
import type { BabbleMood, Voice } from './types';

export interface VoiceProfile {
  /** Base pitch (Hz). */
  f0: number;
  /** Formant scale (1 = adult male; higher = a smaller vocal tract). */
  formant: number;
  /** 0..1 brightness (lowpass opening). */
  bright: number;
  /** 0..1 breathiness mixed under the voiced sound. */
  breath: number;
  /** Speaking-rate multiplier (> 1 = shorter syllables). */
  rate: number;
  /** Output level. */
  level: number;
}

export const VOICES: Readonly<Record<Voice, VoiceProfile>> = {
  chris: { f0: 118, formant: 1.0, bright: 0.3, breath: 0.1, rate: 0.95, level: 1.0 },
  ashley: { f0: 205, formant: 1.12, bright: 0.75, breath: 0.08, rate: 1.0, level: 0.9 },
  addy: { f0: 300, formant: 1.24, bright: 0.8, breath: 0.06, rate: 1.05, level: 0.82 },
  ellie: { f0: 292, formant: 1.22, bright: 0.45, breath: 0.16, rate: 1.0, level: 0.84 },
  heidi: { f0: 360, formant: 1.34, bright: 0.7, breath: 0.08, rate: 1.1, level: 0.8 },
  dog: { f0: 210, formant: 0.95, bright: 0.4, breath: 0.25, rate: 1.0, level: 0.95 },
  extra: { f0: 165, formant: 1.08, bright: 0.5, breath: 0.1, rate: 1.0, level: 0.85 },
};

export const VOICE_IDS = Object.keys(VOICES) as Voice[];
export const MOODS: readonly BabbleMood[] = ['normal', 'excited', 'sleepy', 'dramatic', 'whisper', 'sing'];

/** Semitone window every syllable of a voice stays inside (relative to its f0). */
export const PITCH_WINDOW = { lo: -8, hi: 10 } as const;

interface MoodShape {
  /** Duration multiplier on 0.05 s/char. */
  tempo: number;
  /** Target syllable length (s) before the voice's rate. */
  syl: number;
  /** Overall pitch shift (semitones). */
  shift: number;
  /** Contour start / end (semitones), interpolated across the line. */
  start: number;
  end: number;
  /** Random per-syllable pitch spread (± semitones). */
  jitter: number;
  /** Loudness. */
  amp: number;
  /** Glide inside each syllable (semitones, + rises). */
  glide: number;
  /** Alternating wobble (dramatic). */
  wobble: number;
  /** Breathy (whisper): voiced part almost off, noise through the formants. */
  breathy: boolean;
  /** Melodic (sing): pitches on a pentatonic walk, legato. */
  sing: boolean;
  /** Vibrato depth (cents). */
  vibrato: number;
}

export const MOOD_SHAPES: Readonly<Record<BabbleMood, MoodShape>> = {
  normal: { tempo: 1, syl: 0.085, shift: 0, start: 1, end: -1.5, jitter: 2, amp: 1, glide: 0.4, wobble: 0, breathy: false, sing: false, vibrato: 0 },
  excited: { tempo: 0.85, syl: 0.068, shift: 2.5, start: 0, end: 4, jitter: 2.5, amp: 1.1, glide: 1.5, wobble: 0, breathy: false, sing: false, vibrato: 0 },
  sleepy: { tempo: 1.3, syl: 0.13, shift: -2, start: 0.5, end: -5, jitter: 0.8, amp: 0.72, glide: -1.5, wobble: 0, breathy: false, sing: false, vibrato: 0 },
  dramatic: { tempo: 1.15, syl: 0.11, shift: 0.5, start: 2, end: -3, jitter: 1.5, amp: 1.05, glide: 0, wobble: 2.5, breathy: false, sing: false, vibrato: 45 },
  whisper: { tempo: 1, syl: 0.09, shift: 0, start: 0, end: -1, jitter: 1.2, amp: 0.6, glide: 0, wobble: 0, breathy: true, sing: false, vibrato: 0 },
  sing: { tempo: 1.25, syl: 0.15, shift: 0, start: 0, end: 0, jitter: 0, amp: 0.95, glide: 0, wobble: 0, breathy: false, sing: true, vibrato: 30 },
};

export type Consonant = 'none' | 'plosive' | 'fricative' | 'nasal' | 'liquid';

export interface Syllable {
  /** Offset from the line start (s). */
  start: number;
  dur: number;
  /** Pitch at the start / end of the syllable (Hz). */
  f0: number;
  f0End: number;
  vowel: Vowel;
  consonant: Consonant;
  /** 0..~1.2 loudness. */
  amp: number;
}

export interface BabblePlan {
  voice: Voice;
  mood: BabbleMood;
  /** Seconds (≈ 0.05 s × characters × mood tempo, ≤ MAX_BABBLE). */
  duration: number;
  syllables: Syllable[];
  /** Vibrato depth in cents (dramatic / sing). */
  vibrato: number;
  breathy: boolean;
}

export const SECONDS_PER_CHAR = 0.05;
export const MAX_BABBLE = 2.2;
export const MIN_BABBLE = 0.12;

/** FNV-1a 32-bit hash of a string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic 0..1 generator (mulberry32). */
export function rng01(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normalise a line: trim, collapse whitespace. */
export function cleanText(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Line length in seconds for a text/mood (the contract's ≈ 0.05 s per character, capped). */
export function babbleDuration(text: string, mood: BabbleMood = 'normal'): number {
  const n = cleanText(text).length;
  if (n === 0) return 0;
  const shape = MOOD_SHAPES[mood] ?? MOOD_SHAPES.normal;
  return Math.min(MAX_BABBLE, Math.max(MIN_BABBLE, n * SECONDS_PER_CHAR * shape.tempo));
}

const VOWEL_OF: Readonly<Record<string, Vowel>> = { a: 'a', e: 'e', i: 'i', o: 'o', u: 'u', y: 'i' };
const VOWEL_LIST: readonly Vowel[] = ['a', 'e', 'i', 'o', 'u'];

function consonantOf(ch: string | undefined): Consonant {
  if (!ch) return 'none';
  const c = ch.toLowerCase();
  if ('pbtdkgcq'.includes(c)) return 'plosive';
  if ('sfhzxvj'.includes(c)) return 'fricative';
  if ('mn'.includes(c)) return 'nasal';
  if ('lrwy'.includes(c)) return 'liquid';
  return 'none';
}

/**
 * Plan a babble line (pure). Empty / whitespace text → no syllables.
 */
export function babblePlan(voice: Voice, text: string, mood: BabbleMood = 'normal'): BabblePlan {
  const prof = VOICES[voice] ?? VOICES.extra;
  const shape = MOOD_SHAPES[mood] ?? MOOD_SHAPES.normal;
  const clean = cleanText(text);
  const duration = babbleDuration(clean, mood);
  const plan: BabblePlan = { voice, mood, duration, syllables: [], vibrato: shape.vibrato, breathy: shape.breathy };
  if (duration <= 0) return plan;
  const rnd = rng01(hashString(mood + '|' + clean));
  const question = /\?\s*$/.test(clean);
  const exclaim = /!\s*$/.test(clean);
  const trail = /(\.\.\.|…)\s*$/.test(clean);

  if (voice === 'dog') {
    // Little "boof"s: one per ~6 characters (1..4), spread over the line.
    const n = Math.min(4, Math.max(1, Math.round(clean.length / 6)));
    const slot = Math.max(0.18, duration / n);
    const lift = mood === 'excited' ? 3 : mood === 'sleepy' ? -3 : mood === 'whisper' ? -1 : 0;
    for (let i = 0; i < n; i++) {
      const dur = Math.min(slot * 0.8, (mood === 'sleepy' ? 0.2 : mood === 'excited' ? 0.11 : 0.14) + rnd() * 0.03);
      const f0 = prof.f0 * semis(lift + (rnd() - 0.5) * 2 + (question && i === n - 1 ? 3 : 0));
      plan.syllables.push({ start: i * slot, dur, f0, f0End: f0 * semis(-5), vowel: rnd() < 0.5 ? 'o' : 'u', consonant: 'fricative', amp: (0.85 + rnd() * 0.2) * (exclaim ? 1.1 : 1) * (mood === 'whisper' ? 0.5 : 1) });
    }
    plan.duration = Math.max(duration, (n - 1) * slot + (plan.syllables[n - 1]?.dur ?? 0));
    plan.duration = Math.min(MAX_BABBLE, plan.duration);
    return plan;
  }

  const sylLen = shape.syl / prof.rate;
  const n = Math.max(1, Math.round(duration / sylLen));
  const slot = duration / n;
  const chars = clean.length;
  let degree = Math.floor(rnd() * 5);
  let prevVowel: Vowel | undefined;
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * chars) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * chars) / n));
    const span = clean.slice(a, b).toLowerCase();
    const wordStart = a === 0 || clean[a - 1] === ' ' || span[0] === ' ';
    // Vowel from the span's letters, else a seeded one.
    let vowel: Vowel | undefined;
    for (const ch of span) {
      const v = VOWEL_OF[ch];
      if (v) {
        vowel = v;
        break;
      }
    }
    // A span with no vowel (a space, "zzz"): borrow the next vowel in the line, else the last one.
    for (let k = b; !vowel && k < chars; k++) vowel = VOWEL_OF[clean[k]!.toLowerCase()];
    vowel ??= prevVowel ?? VOWEL_LIST[Math.floor(rnd() * VOWEL_LIST.length)]!;
    prevVowel = vowel;
    const firstLetter = span.replace(/[^a-z]/g, '')[0];
    const consonant = VOWEL_OF[firstLetter ?? ''] ? 'none' : consonantOf(firstLetter);

    const p = n > 1 ? i / (n - 1) : 0;
    let st: number;
    let glideSt = shape.glide;
    if (shape.sing) {
      // A gentle pentatonic walk (legato, mostly stepwise).
      const step = Math.floor(rnd() * 5) - 2;
      degree = Math.min(5, Math.max(-1, degree + (step === 0 ? 1 : step)));
      st = scaleNote(0, 'majorPent', degree) - 3;
      glideSt = 0;
    } else {
      st = shape.start + (shape.end - shape.start) * p + (rnd() * 2 - 1) * shape.jitter;
      if (shape.wobble > 0) {
        st += i % 2 === 0 ? shape.wobble : -shape.wobble;
        glideSt = i % 2 === 0 ? -shape.wobble : shape.wobble;
      }
    }
    st += shape.shift;
    if (exclaim) st += 1.5;
    const last = i === n - 1;
    if (question && last) {
      st += 3;
      glideSt = 4;
    }
    if (trail && i >= n - 2) {
      st -= 2;
      glideSt = -2;
    }
    if (exclaim && last) glideSt += 1.5;
    const stClamped = Math.min(PITCH_WINDOW.hi - 1, Math.max(PITCH_WINDOW.lo + 1, st));
    const endSt = Math.min(PITCH_WINDOW.hi, Math.max(PITCH_WINDOW.lo, stClamped + glideSt));
    const gap = wordStart && i > 0 ? 0.28 : 0.12;
    const start = i * slot + slot * gap * 0.5;
    // Never run into the next syllable's slot.
    const dur = Math.max(0.035, Math.min(slot * (1 - gap * 0.5) - 0.002, slot * (shape.sing ? 0.94 : 1 - gap) * (0.9 + rnd() * 0.1)));
    let amp = shape.amp * (0.86 + rnd() * 0.14) * (wordStart ? 1.08 : 1);
    if (exclaim) amp *= 1.08;
    if (trail && last) amp *= 0.7;
    plan.syllables.push({ start, dur, f0: prof.f0 * semis(stClamped), f0End: prof.f0 * semis(endSt), vowel, consonant, amp: Math.min(1.25, amp) });
  }
  return plan;
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** Consonant noise colour (Hz) and length (s). */
const CONSONANT: Readonly<Record<Consonant, readonly [number, number, number]>> = {
  none: [0, 0, 0],
  plosive: [2200, 0.012, 0.5],
  fricative: [4200, 0.035, 0.28],
  nasal: [0, 0, 0],
  liquid: [0, 0, 0],
};

export interface BabbleVoice {
  /** Context time the line ends. */
  end: number;
  /** Fade the line out quickly at `at` (a new line interrupts it). */
  cut(at: number): void;
}

/** Schedule a planned line into `dest` starting at `t`. */
export function playBabble(ctx: Ctx, dest: AudioNode, t: number, plan: BabblePlan): BabbleVoice {
  const prof = VOICES[plan.voice] ?? VOICES.extra;
  const end = t + plan.duration + 0.08;
  const out = gainNode(ctx, prof.level, dest);
  const lp = filterNode(ctx, 'lowpass', 1800 + 3600 * prof.bright, 0.6, out);
  const f1 = filterNode(ctx, 'bandpass', 700, 4, gainNode(ctx, 2.4, lp));
  const f2 = filterNode(ctx, 'bandpass', 1400, 6, gainNode(ctx, 1.25, lp));
  // The voiced envelope sits BEFORE the formants so the breath path (below) is independent of it.
  const env = gainNode(ctx, 0);
  env.connect(f1);
  env.connect(f2);
  env.connect(gainNode(ctx, 0.12, lp));
  const first = plan.syllables[0];
  const osc = oscNode(ctx, 'sawtooth', first ? first.f0 : prof.f0, t, end - t + 0.05, env);
  // Consonants + breath: one noise source, two gated paths.
  const noise = noiseNode(ctx, 'white', t, end - t + 0.05);
  const cbp = filterNode(ctx, 'bandpass', 3000, 1.2, lp);
  const cgain = gainNode(ctx, 0, cbp);
  noise.connect(cgain);
  const breath = gainNode(ctx, 0);
  noise.connect(breath);
  breath.connect(f1);
  breath.connect(f2);
  const sources: AudioScheduledSourceNode[] = [osc, noise];
  if (plan.vibrato > 0) {
    const lfo = oscNode(ctx, 'sine', 5.8, t, end - t + 0.05);
    const depth = gainNode(ctx, plan.vibrato);
    lfo.connect(depth);
    depth.connect(osc.detune);
    sources.push(lfo);
  }
  const voiced = plan.breathy ? 0.06 : 1;
  const breathAmt = plan.breathy ? 1.2 : prof.breath * 0.35;
  const sc = prof.formant;
  env.gain.setValueAtTime(0, t);
  breath.gain.setValueAtTime(0, t);
  cgain.gain.setValueAtTime(0, t);
  const dog = plan.voice === 'dog';
  for (const s of plan.syllables) {
    const a = t + s.start;
    const [cf, clen, cpk] = CONSONANT[s.consonant];
    const onset = a + (s.consonant === 'plosive' ? clen : s.consonant === 'fricative' ? clen * 0.6 : 0);
    const d = Math.max(0.03, a + s.dur - onset);
    const att = Math.min(0.012, d * 0.25);
    const rel = Math.min(0.03, d * 0.3);
    // Pitch.
    osc.frequency.setValueAtTime(s.f0, onset);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, s.f0End), onset + d);
    // Formants: nasals / liquids start closed-ish and open into the vowel.
    const [v1, v2] = VOWELS[s.vowel];
    const from1 = s.consonant === 'nasal' ? 280 : s.consonant === 'liquid' ? 380 : dog ? 550 : v1;
    const from2 = s.consonant === 'nasal' ? 1000 : s.consonant === 'liquid' ? 1100 : dog ? 1100 : v2;
    f1.frequency.setValueAtTime(from1 * sc, onset);
    f1.frequency.linearRampToValueAtTime((dog ? v1 * 0.8 : v1) * sc, onset + Math.min(0.045, d * 0.5));
    f2.frequency.setValueAtTime(from2 * sc, onset);
    f2.frequency.linearRampToValueAtTime((dog ? v2 * 0.8 : v2) * sc, onset + Math.min(0.045, d * 0.5));
    // Voiced envelope + the breath under it.
    const pk = s.amp * voiced * 0.5;
    env.gain.setValueAtTime(0, onset);
    env.gain.linearRampToValueAtTime(pk, onset + att);
    env.gain.setValueAtTime(pk * 0.85, onset + d - rel);
    env.gain.linearRampToValueAtTime(0, onset + d);
    const bpk = s.amp * breathAmt * 0.5;
    breath.gain.setValueAtTime(0, onset);
    breath.gain.linearRampToValueAtTime(bpk, onset + att * 2);
    breath.gain.linearRampToValueAtTime(0, onset + d);
    // Consonant burst.
    if (cpk > 0) {
      cbp.frequency.setValueAtTime(cf * (0.9 + 0.2 * (sc - 1)), a);
      cgain.gain.setValueAtTime(0, a);
      cgain.gain.linearRampToValueAtTime(cpk * s.amp * (plan.breathy ? 0.6 : 0.35), a + 0.003);
      cgain.gain.linearRampToValueAtTime(0, a + clen);
    }
  }
  return {
    end,
    cut(at: number): void {
      try {
        holdAt(out.gain, at);
        out.gain.setTargetAtTime(0, at, 0.015);
        for (const s of sources) s.stop(at + 0.1);
      } catch {
        /* already stopped */
      }
    },
  };
}
