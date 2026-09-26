// Babble syllable planning (pure): deterministic per text, ≈ 0.05 s per character capped at 2.2 s,
// per-voice pitch windows (chris lowest … heidi highest), the same contour in every voice, mood
// shapes (sleepy slow + falling, excited fast + rising, dramatic wobbly, whisper breathy, sing on a
// pentatonic scale), punctuation, vowels from the letters, and the dog's little boofs.
import { describe, expect, it } from 'vitest';
import {
  babbleDuration,
  babblePlan,
  cleanText,
  hashString,
  MAX_BABBLE,
  MIN_BABBLE,
  MOOD_SHAPES,
  MOODS,
  PITCH_WINDOW,
  rng01,
  SECONDS_PER_CHAR,
  VOICE_IDS,
  VOICES,
} from '../../src/audio/babble';
import { freqToMidi, SCALES, semis } from '../../src/audio/theory';
import type { Voice } from '../../src/audio/types';

const LINE = 'Good morning, sleepyhead! Time to get up for school.';
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const humans = VOICE_IDS.filter((v) => v !== 'dog');

describe('hashing & helpers', () => {
  it('FNV hash and the seeded generator are deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    const a = rng01(42);
    const b = rng01(42);
    for (let i = 0; i < 500; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('text is trimmed and whitespace-collapsed', () => {
    expect(cleanText('  hi   there \n')).toBe('hi there');
    expect(cleanText(undefined as unknown as string)).toBe('');
  });
});

describe('duration', () => {
  it('≈ 0.05 s per character, min 0.12 s, max 2.2 s, 0 for empty text', () => {
    expect(SECONDS_PER_CHAR).toBe(0.05);
    expect(babbleDuration('Hello there!')).toBeCloseTo(12 * 0.05, 9);
    expect(babbleDuration('Hi')).toBe(MIN_BABBLE);
    expect(babbleDuration('x'.repeat(500))).toBe(MAX_BABBLE);
    expect(MAX_BABBLE).toBe(2.2);
    expect(babbleDuration('')).toBe(0);
    expect(babbleDuration('   ')).toBe(0);
  });

  it('moods stretch or squeeze the line (still ≤ 2.2 s)', () => {
    const t = 'Five more minutes please';
    expect(babbleDuration(t, 'sleepy')).toBeGreaterThan(babbleDuration(t, 'normal'));
    expect(babbleDuration(t, 'excited')).toBeLessThan(babbleDuration(t, 'normal'));
    for (const m of MOODS) expect(babbleDuration('y'.repeat(300), m)).toBeLessThanOrEqual(MAX_BABBLE);
  });

  it('every plan fits its duration: syllables in order, inside the line, positive lengths', () => {
    for (const v of VOICE_IDS) {
      for (const m of MOODS) {
        for (const text of ['Hi!', LINE, 'z'.repeat(200), 'Hmm...', 'Really?']) {
          const p = babblePlan(v, text, m);
          expect(p.duration).toBeLessThanOrEqual(MAX_BABBLE);
          expect(p.syllables.length, `${v}/${m}`).toBeGreaterThan(0);
          let prevEnd = -1;
          for (const s of p.syllables) {
            expect(s.dur).toBeGreaterThan(0);
            expect(s.start).toBeGreaterThanOrEqual(prevEnd - 1e-9);
            expect(s.start + s.dur).toBeLessThanOrEqual(p.duration + 1e-6);
            expect(s.amp).toBeGreaterThan(0);
            expect(s.amp).toBeLessThanOrEqual(1.25);
            prevEnd = s.start + s.dur;
          }
        }
      }
    }
  });

  it('empty text plans nothing', () => {
    expect(babblePlan('heidi', '').syllables.length).toBe(0);
    expect(babblePlan('dog', '  ').syllables.length).toBe(0);
  });
});

describe('determinism', () => {
  it('the same (voice, text, mood) always plans the same line; different text differs', () => {
    for (const v of VOICE_IDS) {
      for (const m of MOODS) expect(babblePlan(v, LINE, m)).toEqual(babblePlan(v, LINE, m));
    }
    expect(babblePlan('addy', 'I called it!')).not.toEqual(babblePlan('addy', 'I called it?'));
    expect(babblePlan('addy', 'Pancakes!')).not.toEqual(babblePlan('addy', 'Waffles!'));
  });

  it('seeded by the text: every character says a line with the same contour, in their own voice', () => {
    const rel = (v: Voice): number[] => babblePlan(v, LINE, 'normal').syllables.map((s) => +(s.f0 / VOICES[v].f0).toFixed(6));
    for (const v of humans) expect(rel(v).length).toBeGreaterThan(0);
    // Voices with the same speaking rate say it with an identical relative contour.
    expect(VOICES.ashley.rate).toBe(VOICES.ellie.rate);
    expect(rel('ellie')).toEqual(rel('ashley'));
    expect(rel('extra')).toEqual(rel('ashley'));
  });
});

describe('per-voice pitch', () => {
  it('every syllable stays inside its voice window', () => {
    for (const v of humans) {
      const f0 = VOICES[v].f0;
      for (const m of MOODS) {
        for (const text of [LINE, 'WOW!!!', 'hmm...', 'Are we there yet?']) {
          for (const s of babblePlan(v, text, m).syllables) {
            for (const f of [s.f0, s.f0End]) {
              expect(f, `${v}/${m}`).toBeGreaterThanOrEqual(f0 * semis(PITCH_WINDOW.lo) - 1e-6);
              expect(f, `${v}/${m}`).toBeLessThanOrEqual(f0 * semis(PITCH_WINDOW.hi) + 1e-6);
            }
          }
        }
      }
    }
  });

  it('chris low-mid < extra < ashley mid < ellie ≈ addy high < heidi highest', () => {
    const avg = (v: Voice): number => mean(babblePlan(v, LINE, 'normal').syllables.map((s) => s.f0));
    expect(avg('chris')).toBeLessThan(avg('extra'));
    expect(avg('extra')).toBeLessThan(avg('ashley'));
    expect(avg('ashley')).toBeLessThan(avg('ellie'));
    expect(avg('ellie')).toBeLessThanOrEqual(avg('addy'));
    expect(avg('addy')).toBeLessThan(avg('heidi'));
    // Whatever the mood, Chris's highest note is below Heidi's lowest.
    const all = (v: Voice): number[] => MOODS.flatMap((m) => babblePlan(v, LINE, m).syllables.flatMap((s) => [s.f0, s.f0End]));
    expect(Math.max(...all('chris'))).toBeLessThan(Math.min(...all('heidi')));
  });

  it('twins: same register, Ellie a touch softer (darker, breathier) than Addy', () => {
    expect(Math.abs(VOICES.addy.f0 - VOICES.ellie.f0)).toBeLessThan(20);
    expect(VOICES.ellie.bright).toBeLessThan(VOICES.addy.bright);
    expect(VOICES.ellie.breath).toBeGreaterThan(VOICES.addy.breath);
    expect(VOICES.heidi.formant).toBeGreaterThan(VOICES.addy.formant); // smallest, cutest voice
  });
});

describe('moods', () => {
  const contour = (v: Voice, m: (typeof MOODS)[number]): number[] => babblePlan(v, LINE, m).syllables.map((s) => freqToMidi(s.f0));
  const slope = (xs: number[]): number => {
    const n = xs.length;
    const mx = (n - 1) / 2;
    const my = mean(xs);
    let num = 0;
    let den = 0;
    xs.forEach((y, i) => {
      num += (i - mx) * (y - my);
      den += (i - mx) ** 2;
    });
    return den > 0 ? num / den : 0;
  };

  it('sleepy is slow and falling; excited is fast, higher and rising', () => {
    for (const v of humans) {
      const sleepy = babblePlan(v, LINE, 'sleepy');
      const excited = babblePlan(v, LINE, 'excited');
      expect(slope(contour(v, 'sleepy')), v).toBeLessThan(0);
      expect(slope(contour(v, 'excited')), v).toBeGreaterThan(0);
      expect(mean(sleepy.syllables.map((s) => s.dur)), v).toBeGreaterThan(mean(excited.syllables.map((s) => s.dur)));
      expect(mean(contour(v, 'excited')), v).toBeGreaterThan(mean(contour(v, 'sleepy')));
      expect(mean(sleepy.syllables.map((s) => s.amp))).toBeLessThan(mean(excited.syllables.map((s) => s.amp)));
    }
  });

  it('dramatic wobbles (alternating glides + vibrato); whisper is breathy; sing has vibrato', () => {
    const d = babblePlan('ashley', LINE, 'dramatic');
    expect(d.vibrato).toBeGreaterThan(0);
    const dirs = d.syllables.slice(0, -2).map((s) => Math.sign(s.f0End - s.f0));
    let flips = 0;
    for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) flips++;
    expect(flips).toBeGreaterThanOrEqual(dirs.length - 2);
    expect(babblePlan('chris', LINE, 'whisper').breathy).toBe(true);
    expect(babblePlan('chris', LINE, 'normal').breathy).toBe(false);
    expect(babblePlan('heidi', LINE, 'sing').vibrato).toBeGreaterThan(0);
    expect(MOOD_SHAPES.whisper.amp).toBeLessThan(MOOD_SHAPES.normal.amp);
  });

  it('sing is melodic: every note lands on the major pentatonic of the voice, and holds (no glide)', () => {
    for (const v of humans) {
      const p = babblePlan(v, 'La la la, we are going to school today', 'sing');
      for (const s of p.syllables) {
        const st = Math.round(12 * Math.log2(s.f0 / VOICES[v].f0));
        // Offsets are pentatonic degrees shifted down 3 semitones (so the tune centres on the voice).
        expect(SCALES.majorPent.includes((((st + 3) % 12) + 12) % 12), `${v} ${st}`).toBe(true);
        expect(s.f0End).toBeCloseTo(s.f0, 6);
      }
    }
  });

  it('a question rises at the end; an exclamation lifts the line; "…" trails off', () => {
    const q = babblePlan('ellie', 'Is it time for school?').syllables;
    const s = babblePlan('ellie', 'Is it time for school.').syllables;
    const lastQ = q[q.length - 1]!;
    const lastS = s[s.length - 1]!;
    expect(lastQ.f0End).toBeGreaterThan(lastQ.f0);
    expect(lastQ.f0).toBeGreaterThan(lastS.f0);
    const ex = babblePlan('addy', 'Pancakes for breakfast!').syllables;
    const flat = babblePlan('addy', 'Pancakes for breakfast.').syllables;
    expect(mean(ex.map((x) => x.f0))).toBeGreaterThan(mean(flat.map((x) => x.f0)));
    const tr = babblePlan('chris', 'Well, I guess...').syllables;
    const lastT = tr[tr.length - 1]!;
    expect(lastT.f0End).toBeLessThan(lastT.f0);
  });

  it('the letters pick the vowels and consonants', () => {
    expect(new Set(babblePlan('addy', 'aaaa aaaa aaaa').syllables.map((s) => s.vowel))).toEqual(new Set(['a']));
    expect(new Set(babblePlan('addy', 'oooo oooo oooo').syllables.map((s) => s.vowel))).toEqual(new Set(['o']));
    expect(babblePlan('addy', 'papa').syllables[0]!.consonant).toBe('plosive');
    expect(babblePlan('addy', 'mama').syllables[0]!.consonant).toBe('nasal');
    expect(babblePlan('addy', 'sasa').syllables[0]!.consonant).toBe('fricative');
  });
});

describe('the dog', () => {
  it('little falling "boof"s: one per ~6 characters, 1..4 of them', () => {
    expect(babblePlan('dog', 'Woof').syllables.length).toBe(1);
    expect(babblePlan('dog', 'Woof woof woof!').syllables.length).toBe(3);
    expect(babblePlan('dog', 'w'.repeat(200)).syllables.length).toBe(4);
    for (const s of babblePlan('dog', 'Woof woof!', 'excited').syllables) {
      expect(s.f0End).toBeLessThan(s.f0);
      expect(s.dur).toBeLessThan(0.25);
      expect(['o', 'u']).toContain(s.vowel);
    }
    const excited = mean(babblePlan('dog', 'Woof woof!', 'excited').syllables.map((s) => s.f0));
    const sleepy = mean(babblePlan('dog', 'Woof woof!', 'sleepy').syllables.map((s) => s.f0));
    expect(excited).toBeGreaterThan(sleepy);
  });
});
