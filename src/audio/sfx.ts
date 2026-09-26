// ─────────────────────────────────────────────────────────────────────────────
// Sound effects. Each recipe schedules Web Audio nodes into `out` at time t and
// returns roughly when it ends. Everything is synthesized — warm, soft, rounded,
// cartoony and never harsh (sines, triangles, lowpassed noise, gentle attacks; no
// raw squares, nothing shrill above ~8 kHz, no pain sounds). Loudness, variation,
// voice limits, routing (ui / game), reverb send and music ducking live in SFX_META
// (levels tuned with the offline QA meter in qa.ts).
//
// SfxOpts.volume is plain gain for most sounds; "dynamic" sounds (brush strokes,
// footsteps) also read it as intensity (a gentle stroke is quieter AND softer).
// SfxOpts.pitch multiplies every frequency (sectionClear / star climb with it).
// Structure adapted from ATHLETE MAYHEM's sfx.ts; every recipe is new.
// ─────────────────────────────────────────────────────────────────────────────
import {
  brassChord,
  brassNote,
  celestaNote,
  choirChord,
  clapHit,
  cymbalHit,
  formantBank,
  glockNote,
  kalimbaNote,
  marimbaNote,
  padChord,
  pluckNote,
  rimHit,
  timpHit,
  timpRoll,
  triangleHit,
  VOWELS,
  type Vowel,
  bellNote,
} from './instruments';
import type { Priority, VoiceRule } from './limits';
import { ahr, type Ctx, filterNode, gainNode, glide, modal, noiseBurst, noiseNode, oscNode, pannerNode, perc, ping, thump } from './synth';
import { midiToFreq } from './theory';
import type { SfxId } from './types';

export interface SfxParams {
  /** Pitch multiplier (already includes random variation). */
  pitch: number;
  /** 0..1 intensity (SfxOpts.volume for dynamic sounds, 1 otherwise). */
  intensity: number;
}

export type SfxRecipe = (ctx: Ctx, out: AudioNode, t: number, o: SfxParams) => number;

export interface SfxMeta extends VoiceRule {
  /** Output gain multiplier. */
  level: number;
  /** ± random pitch variation (fraction). 0 for anything melodic. */
  jitter: number;
  /** 'ui' keeps playing in the pause menu; 'game' is gated by pause. */
  bus: 'ui' | 'game';
  /** Extra send into the room reverb (sparkles, stingers). */
  wet: number;
  /** Dynamic sound: volume also drives intensity; gain = level × (dyn + (1 − dyn) × volume). */
  dyn?: number;
  /** Ducks the music when it plays. */
  duck?: { amount: number; seconds: number };
}

// ── Building blocks ─────────────────────────────────────────────────────────

const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** A MIDI note shifted by a pitch multiplier. */
const mp = (midi: number, o: SfxParams): number => midi + 12 * Math.log2(o.pitch);

/** Pitched glide blip (pops, bloops, boops). */
function blip(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine'): number {
  const g = gainNode(ctx, 0, out);
  const end = perc(g.gain, t, peak, 0.003, dur / 2.5);
  const o = oscNode(ctx, type, f0, t, end - t + 0.02, g);
  glide(o.frequency, t, f0, f1, dur);
  return end;
}

/** Band-passed pink-noise sweep (swishes, whooshes). Optional stereo pan sweep. */
function swish(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, f2: number, dur: number, peak: number, q = 1.2, pan?: readonly [number, number]): number {
  let dest: AudioNode = out;
  if (pan) {
    const p = pannerNode(ctx, pan[0], out);
    p.pan.setValueAtTime(pan[0], t);
    p.pan.linearRampToValueAtTime(pan[1], t + dur);
    dest = p;
  }
  const g = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 7500, 0.5, dest));
  const f = filterNode(ctx, 'bandpass', f0, q, g);
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
  f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
  g.gain.linearRampToValueAtTime(0, t + dur);
  noiseNode(ctx, 'pink', t, dur + 0.02, f);
  return t + dur;
}

/** Scattered soft high pings (sparkle, glitter). */
function sparkle(ctx: Ctx, out: AudioNode, t: number, count: number, spread: number, peak: number, lo = 2400, hi = 5600): number {
  let end = t;
  for (let i = 0; i < count; i++) {
    const ti = t + Math.random() * spread;
    const p = pannerNode(ctx, Math.random() * 1.2 - 0.6, out);
    end = Math.max(end, ping(ctx, p, ti, lo + Math.random() * (hi - lo), { peak: peak * (0.5 + Math.random() * 0.5), attack: 0.002, tc: 0.025 + Math.random() * 0.035 }));
  }
  return end;
}

/** Fabric / plastic rustle: pink noise through a drifting bandpass with a fluttering AM. */
function rustle(ctx: Ctx, out: AudioNode, t: number, dur: number, peak: number, freq: number, flutter = 18): number {
  const env = gainNode(ctx, 0, out);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + Math.min(0.05, dur * 0.2));
  env.gain.setTargetAtTime(0, t + dur * 0.35, dur * 0.22);
  const am = gainNode(ctx, 0.55, env);
  const lfo = oscNode(ctx, 'triangle', flutter + Math.random() * flutter * 0.6, t, dur + 0.02);
  const la = gainNode(ctx, 0.42);
  lfo.connect(la);
  la.connect(am.gain);
  const bp = filterNode(ctx, 'bandpass', freq, 0.9, am);
  bp.frequency.setValueAtTime(freq * rand(0.85, 1.05), t);
  bp.frequency.linearRampToValueAtTime(freq * rand(0.6, 0.8), t + dur);
  noiseNode(ctx, 'pink', t, dur + 0.02, bp);
  return t + dur;
}

/** Cartoon spring "boing": sine gliding up with a wide vibrato that settles — soft, low-mid. */
function spring(ctx: Ctx, out: AudioNode, t: number, f0: number, dur: number, peak: number): number {
  const g = gainNode(ctx, 0, out);
  const end = perc(g.gain, t, peak, 0.005, dur / 4);
  const o = oscNode(ctx, 'sine', f0, t, end - t, g);
  o.frequency.setValueAtTime(f0 * 0.72, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 1.45, t + dur * 0.55);
  const o2 = oscNode(ctx, 'triangle', f0 * 2, t, end - t, gainNode(ctx, 0.14, g));
  o2.frequency.setValueAtTime(f0 * 1.44, t);
  o2.frequency.exponentialRampToValueAtTime(f0 * 2.9, t + dur * 0.55);
  const lfo = oscNode(ctx, 'sine', 12, t, end - t);
  const depth = gainNode(ctx, 0);
  depth.gain.setValueAtTime(260, t);
  depth.gain.setTargetAtTime(0, t, dur / 3);
  lfo.connect(depth);
  depth.connect(o.detune);
  depth.connect(o2.detune);
  return end;
}

/** Friendly wood creak: a triangle with a stick-slip wobble through a soft bandpass (never spooky: short, mid, quiet). */
function creak(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, dur: number, peak: number): number {
  const g = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 2200, 0.6, out));
  ahr(g.gain, t, peak, 0.03, dur * 0.6, dur * 0.35);
  const bp = filterNode(ctx, 'bandpass', 1100, 1.4, g);
  const o = oscNode(ctx, 'sawtooth', f0, t, dur + 0.05, bp);
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dur);
  const lfo = oscNode(ctx, 'square', 34, t, dur + 0.05);
  const lg = gainNode(ctx, f0 * 0.04);
  lfo.connect(lg);
  lg.connect(o.frequency);
  return t + dur + 0.05;
}

/** Little water bubble: a sine that chirps upward. */
function bubble(ctx: Ctx, out: AudioNode, t: number, f: number, peak: number): number {
  const g = gainNode(ctx, 0, out);
  const end = perc(g.gain, t, peak, 0.002, 0.018);
  const o = oscNode(ctx, 'sine', f, t, end - t + 0.02, g);
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.7, t + 0.035);
  return end;
}

/** Short click (switches, latches, buckles). */
function click(ctx: Ctx, out: AudioNode, t: number, freq: number, peak: number, body = 0): number {
  const end = noiseBurst(ctx, out, t, { type: 'bandpass', freq, q: 2, peak, attack: 0.0006, tc: 0.004 }).end;
  if (body > 0) ping(ctx, out, t, freq * 0.45, { peak: body, attack: 0.0008, tc: 0.01 });
  return end;
}

/** A sequence of chime notes (instrument by name) — the jingle workhorse. */
function chime(ctx: Ctx, out: AudioNode, t: number, midis: readonly number[], spacing: number, vel: number, kind: 'glock' | 'celesta' | 'marimba' | 'kalimba' = 'glock', dur = 0.25): number {
  let end = t;
  for (let i = 0; i < midis.length; i++) {
    const ti = t + i * spacing;
    const m = midis[i]!;
    const e =
      kind === 'glock'
        ? glockNote(ctx, out, ti, m, vel, dur)
        : kind === 'celesta'
          ? celestaNote(ctx, out, ti, m, vel, dur)
          : kind === 'marimba'
            ? marimbaNote(ctx, out, ti, m, vel, dur)
            : kalimbaNote(ctx, out, ti, m, vel, dur);
    end = Math.max(end, e);
  }
  return end;
}

/**
 * A tiny formant "voice" (cheers, the dog, the goose, the "mwah"): a sawtooth gliding
 * f0 → f0End through two vowel formants moving v0 → v1, with a breathy onset.
 */
function voice(ctx: Ctx, out: AudioNode, t: number, dur: number, f0: number, f0End: number, v0: Vowel, v1: Vowel, scale: number, peak: number, breath = 0.3): number {
  const env = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 3600, 0.7, out));
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + Math.min(0.03, dur * 0.2));
  env.gain.setTargetAtTime(peak * 0.7, t + 0.03, dur * 0.4);
  env.gain.linearRampToValueAtTime(0, t + dur);
  const [a1, a2] = VOWELS[v0];
  const [b1, b2] = VOWELS[v1];
  const f1 = filterNode(ctx, 'bandpass', a1 * scale, 4.5, gainNode(ctx, 2.4, env));
  const f2 = filterNode(ctx, 'bandpass', a2 * scale, 6, gainNode(ctx, 1.3, env));
  f1.frequency.setValueAtTime(a1 * scale, t);
  f1.frequency.linearRampToValueAtTime(b1 * scale, t + dur * 0.8);
  f2.frequency.setValueAtTime(a2 * scale, t);
  f2.frequency.linearRampToValueAtTime(b2 * scale, t + dur * 0.8);
  const src = oscNode(ctx, 'sawtooth', f0, t, dur + 0.02);
  glide(src.frequency, t, f0, f0End, dur);
  src.connect(f1);
  src.connect(f2);
  src.connect(gainNode(ctx, 0.07, env));
  if (breath > 0) noiseBurst(ctx, env, t, { kind: 'pink', type: 'bandpass', freq: a2 * scale, q: 1.2, peak: breath, tc: 0.02 });
  return t + dur;
}

/** Soft bristle stroke: pink noise, high-passed, a bristly flutter, band-limited so it never fizzes. */
function bristle(ctx: Ctx, out: AudioNode, t: number, dur: number, peak: number, center: number, flutter = 85): number {
  const env = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 7000, 0.5, out));
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + Math.min(0.025, dur * 0.25));
  env.gain.setTargetAtTime(0, t + dur * 0.45, dur * 0.2);
  const am = gainNode(ctx, 0.72, env);
  const lfo = oscNode(ctx, 'triangle', flutter, t, dur + 0.05);
  const la = gainNode(ctx, 0.28);
  lfo.connect(la);
  la.connect(am.gain);
  const bp = filterNode(ctx, 'bandpass', center, 0.75, am);
  bp.frequency.setValueAtTime(center * 0.8, t);
  bp.frequency.linearRampToValueAtTime(center * 1.15, t + dur);
  noiseNode(ctx, 'pink', t, dur + 0.05, filterNode(ctx, 'highpass', 900, 0.6, bp));
  return t + dur + 0.05;
}

let tock = false;

// ── Recipes ──────────────────────────────────────────────────────────────────

export const SFX: Record<SfxId, SfxRecipe> = {
  // ── UI ──
  uiMove: (ctx, out, t, o) => {
    const f = 988 * o.pitch;
    const end = ping(ctx, out, t, f, { peak: 0.5, attack: 0.002, tc: 0.035 });
    ping(ctx, out, t, f * 3.93, { peak: 0.1, attack: 0.001, tc: 0.008 });
    return end;
  },
  uiConfirm: (ctx, out, t, o) => chime(ctx, out, t, [mp(79, o), mp(86, o)], 0.06, 0.5, 'celesta', 0.2),
  uiBack: (ctx, out, t, o) => chime(ctx, out, t, [mp(86, o), mp(79, o)], 0.06, 0.38, 'celesta', 0.12),
  uiToggle: (ctx, out, t, o) => {
    click(ctx, out, t, 3000, 0.4);
    return blip(ctx, out, t + 0.005, 660 * o.pitch, 990 * o.pitch, 0.05, 0.45);
  },
  actCard: (ctx, out, t, o) => {
    swish(ctx, out, t, 300, 1800, 900, 0.55, 0.45, 1.0, [-0.5, 0.5]);
    const t2 = t + 0.42;
    thump(ctx, out, t2, 90, 50, 0.3, 0.35);
    padChord(ctx, out, t2, [60, 64, 67, 72].map((m) => mp(m, o)), 0.28, 0.7, 0.05);
    return Math.max(chime(ctx, out, t2, [84, 88, 91, 96].map((m) => mp(m, o)), 0.045, 0.3, 'glock', 0.4), t2 + 1.4);
  },
  banner: (ctx, out, t, o) => {
    thump(ctx, out, t, 150, 60, 0.18, 0.75);
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 1800, q: 0.7, peak: 0.45, attack: 0.001, tc: 0.025 });
    const e = glockNote(ctx, out, t + 0.05, mp(91, o), 0.32, 0.3);
    return Math.max(e, celestaNote(ctx, out, t + 0.05, mp(84, o), 0.25, 0.3));
  },
  taskDone: (ctx, out, t, o) => {
    marimbaNote(ctx, out, t, mp(88, o), 0.45, 0.1);
    const end = marimbaNote(ctx, out, t + 0.08, mp(93, o), 0.5, 0.2);
    return Math.max(end, sparkle(ctx, out, t + 0.12, 3, 0.15, 0.1));
  },
  star: (ctx, out, t, o) => {
    thump(ctx, out, t, 220, 110, 0.08, 0.28);
    const end = glockNote(ctx, out, t + 0.01, mp(84, o), 0.45, 0.35);
    ping(ctx, out, t + 0.01, midiToFreq(mp(96, o)), { peak: 0.1, tc: 0.08 });
    return Math.max(end, sparkle(ctx, out, t + 0.05, 4, 0.2, 0.08, 3000 * Math.min(1.5, o.pitch), 6000 * Math.min(1.3, o.pitch)));
  },
  award: (ctx, out, t, o) => {
    for (let i = 0; i < 10; i++) noiseBurst(ctx, out, t + i * 0.045, { kind: 'pink', type: 'bandpass', freq: 2400, q: 0.7, peak: 0.1 + 0.03 * i, attack: 0.002, tc: 0.03 });
    const t2 = t + 0.48;
    let e = brassChord(ctx, out, t2, [60, 64, 67, 72].map((m) => mp(m, o)), 0.55, 0.5);
    e = Math.max(e, chime(ctx, out, t2, [84, 91].map((m) => mp(m, o)), 0.05, 0.3, 'glock', 0.4));
    e = Math.max(e, cymbalHit(ctx, out, t2, 0.25));
    const g = gainNode(ctx, 0, out);
    ahr(g.gain, t2 - 0.05, 0.12, 0.03, 0.18, 0.06);
    const sw = oscNode(ctx, 'sine', 600, t2 - 0.05, 0.3, g);
    glide(sw.frequency, t2 - 0.05, 600 * o.pitch, 1400 * o.pitch, 0.25);
    return e;
  },
  clockTick: (ctx, out, t, o) => {
    tock = !tock;
    return rimHit(ctx, out, t, 0.5, (tock ? 1500 : 1900) * o.pitch);
  },
  clockChime: (ctx, out, t, o) => {
    chime(ctx, out, t, [72, 76, 79].map((m) => mp(m, o)), 0.3, 0.3, 'celesta', 0.5);
    const tb = t + 0.95;
    const end = bellNote(ctx, out, tb, midiToFreq(mp(60, o)), 0.45, 0.42, 3.5, 1.6);
    ping(ctx, out, tb, midiToFreq(mp(72, o)), { peak: 0.15, tc: 0.35 });
    return end;
  },
  alarm: (ctx, out, t, o) => {
    chime(ctx, out, t, [84, 88, 91].map((m) => mp(m, o)), 0.11, 0.45, 'kalimba', 0.2);
    chime(ctx, out, t + 0.62, [88, 91, 96].map((m) => mp(m, o)), 0.11, 0.48, 'kalimba', 0.3);
    return chime(ctx, out, t + 0.62, [100], 0.22, 0.12, 'glock', 0.4) + 0.2;
  },

  // ── Hair ──
  brushStroke: (ctx, out, t, o) => {
    const v = o.intensity;
    const center = 2300 * o.pitch * (0.9 + 0.25 * v);
    const end = bristle(ctx, out, t, 0.2 + 0.06 * (1 - v), 0.55, center, 70 + 35 * v);
    return Math.max(end, noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 700, q: 0.6, peak: 0.12 * v, attack: 0.02, tc: 0.035 }).end);
  },
  brushSnag: (ctx, out, t, o) => {
    thump(ctx, out, t, 180 * o.pitch, 120 * o.pitch, 0.06, 0.3);
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'bandpass', freq: 2000, q: 0.8, peak: 0.1, attack: 0.003, tc: 0.02 });
    return spring(ctx, out, t + 0.02, 250 * o.pitch, 0.42, 0.45);
  },
  detangle: (ctx, out, t, o) => {
    blip(ctx, out, t, 900 * o.pitch, 420 * o.pitch, 0.035, 0.42);
    const f = 1568 * o.pitch;
    ping(ctx, out, t + 0.02, f * 2.7, { peak: 0.06, attack: 0.001, tc: 0.012 });
    return ping(ctx, out, t + 0.02, f, { peak: 0.3, attack: 0.002, tc: 0.07 });
  },
  sectionClear: (ctx, out, t, o) => {
    const end = chime(ctx, out, t, [84, 88, 91, 96].map((m) => mp(m, o)), 0.045, 0.3, 'glock', 0.3);
    return Math.max(end, sparkle(ctx, out, t + 0.15, 5, 0.3, 0.09, 3000, 6500));
  },
  sparkle: (ctx, out, t) => {
    const e = noiseBurst(ctx, out, t, { type: 'highpass', freq: 6500, q: 0.6, peak: 0.05, attack: 0.02, tc: 0.08 }).end;
    return Math.max(e, sparkle(ctx, out, t, 7, 0.35, 0.16));
  },
  shine: (ctx, out, t, o) => {
    const f = 2637 * o.pitch;
    const end = bellNote(ctx, out, t, f, 0.3, 0.18, 1.4, 1.0);
    ping(ctx, out, t + 0.01, f * 2, { peak: 0.06, tc: 0.05 });
    const g = gainNode(ctx, 0, out);
    perc(g.gain, t, 0.08, 0.01, 0.04);
    glide(oscNode(ctx, 'sine', f, t, 0.2, g).frequency, t, f * 1.1, f * 1.6, 0.12);
    return end;
  },
  hairFlip: (ctx, out, t, o) => swish(ctx, out, t, 500 * o.pitch, 2200 * o.pitch, 900 * o.pitch, 0.32, 0.8, 1.1, [-0.4, 0.4]),
  blackBrushSting: (ctx, out, t, o) => {
    // Sub boom + a soft timpani to open…
    thump(ctx, out, t, 70, 36, 0.9, 0.75);
    timpHit(ctx, out, t, 38, 0.7);
    // …then the LEGENDARY choir: detuned "aaah" voices through a shared formant bank, with vibrato.
    const vib = oscNode(ctx, 'sine', 5.2, t, 3.2);
    const vd = gainNode(ctx, 12);
    vib.connect(vd);
    const bank = formantBank(ctx, out, 'a', 1.0, 1.0);
    choirChord(ctx, bank, t + 0.02, [50, 57, 62, 66, 69, 74].map((m) => mp(m, o)), 0.6, 2.3, 0.45, vd);
    // Shimmer: a rising glock arpeggio, twinkles and an airy swell.
    chime(ctx, out, t + 0.3, [86, 90, 93, 98, 102].map((m) => mp(m, o)), 0.07, 0.18, 'glock', 0.5);
    sparkle(ctx, out, t + 0.4, 12, 1.6, 0.09, 3000, 7000);
    const air = gainNode(ctx, 0, out);
    air.gain.setValueAtTime(0, t);
    air.gain.linearRampToValueAtTime(0.05, t + 1.2);
    air.gain.linearRampToValueAtTime(0, t + 2.8);
    noiseNode(ctx, 'pink', t, 2.9, filterNode(ctx, 'highpass', 6000, 0.6, air));
    return t + 3.4;
  },
  blackBrushGleam: (ctx, out, t, o) => {
    const g = gainNode(ctx, 0, out);
    perc(g.gain, t, 0.16, 0.004, 0.03);
    glide(oscNode(ctx, 'sine', 2800, t, 0.2, g).frequency, t, 2800 * o.pitch, 5600 * o.pitch, 0.1);
    ping(ctx, out, t + 0.02, 6272 * Math.min(1.3, o.pitch), { peak: 0.06, tc: 0.05 });
    return ping(ctx, out, t + 0.02, 4186 * o.pitch, { peak: 0.16, tc: 0.12 });
  },
  brushPass: (ctx, out, t, o) => {
    const bank = formantBank(ctx, out, 'a', 1.05, 1.0);
    let end = choirChord(ctx, bank, t, [62, 66, 69].map((m) => mp(m, o)), 0.45, 0.6, 0.12);
    end = Math.max(end, timpHit(ctx, out, t, 43, 0.4));
    const gl = [74, 76, 78, 81, 83, 86];
    for (let i = 0; i < gl.length; i++) end = Math.max(end, pluckNote(ctx, out, 'harp', t + 0.05 + i * 0.035, mp(gl[i]!, o), 0.32));
    return end;
  },
  girlDone: (ctx, out, t, o) => {
    let e = blip(ctx, out, t, 500 * o.pitch, 900 * o.pitch, 0.06, 0.42);
    e = Math.max(e, chime(ctx, out, t + 0.02, [mp(79, o), mp(84, o)], 0.09, 0.4, 'celesta', 0.2));
    return Math.max(e, sparkle(ctx, out, t + 0.12, 3, 0.2, 0.09));
  },
  bossIntro: (ctx, out, t, o) => {
    const d2 = mp(38, o);
    let e = timpRoll(ctx, out, t, d2, 0.42, 0.75);
    // "da — da — DAAA!" (mock-epic, D minor) — then a cheeky triangle ding.
    const t1 = t + 0.45;
    brassNote(ctx, out, t1, mp(57, o), 0.55, 0.13, true);
    timpHit(ctx, out, t1, d2, 0.55);
    brassNote(ctx, out, t1 + 0.18, mp(57, o), 0.55, 0.13, true);
    timpHit(ctx, out, t1 + 0.18, d2, 0.55);
    const t3 = t1 + 0.36;
    e = Math.max(e, brassChord(ctx, out, t3, [50, 57, 62, 65].map((m) => mp(m, o)), 0.85, 0.9));
    e = Math.max(e, timpHit(ctx, out, t3, d2, 0.9));
    thump(ctx, out, t3, 80, 40, 0.5, 0.55);
    e = Math.max(e, cymbalHit(ctx, out, t3, 0.35));
    return Math.max(e, triangleHit(ctx, out, t3 + 1.05, 0.25));
  },
  momInspect: (ctx, out, t, o) => {
    // A warm thoughtful "hmm?" (rise-fall hum) and a glassy magnifier sweep across the stereo field.
    voice(ctx, out, t, 0.7, 200 * o.pitch, 185 * o.pitch, 'u', 'u', 1.1, 0.22, 0.05);
    const g = gainNode(ctx, 0, out);
    perc(g.gain, t + 0.1, 0.05, 0.1, 0.2);
    glide(oscNode(ctx, 'sine', 1800, t + 0.1, 0.9, g).frequency, t + 0.1, 1800 * o.pitch, 2400 * o.pitch, 0.7);
    return swish(ctx, out, t + 0.05, 1200, 3200, 1800, 0.9, 0.16, 1.4, [-0.6, 0.6]);
  },
  momApproved: (ctx, out, t, o) => {
    const notes = [67, 72, 76, 79];
    let e = t;
    for (let i = 0; i < notes.length; i++) {
      const ti = t + i * 0.12;
      const last = i === notes.length - 1;
      e = Math.max(e, brassNote(ctx, out, ti, mp(notes[i]!, o), last ? 0.55 : 0.45, last ? 0.6 : 0.1, !last));
      e = Math.max(e, glockNote(ctx, out, ti, mp(notes[i]! + 12, o), 0.18, last ? 0.4 : 0.1));
    }
    const t3 = t + 0.36;
    e = Math.max(e, timpHit(ctx, out, t3, mp(48, o), 0.5));
    e = Math.max(e, padChord(ctx, out, t3, [60, 64, 67, 72].map((m) => mp(m, o)), 0.25, 0.7, 0.04));
    return Math.max(e, sparkle(ctx, out, t3 + 0.05, 8, 0.6, 0.1));
  },
  momFinish: (ctx, out, t, o) => {
    for (let i = 0; i < 6; i++) bristle(ctx, out, t + i * 0.055, 0.07, 0.32, (2000 + 250 * i) * o.pitch, 110);
    const t2 = t + 0.36;
    const e = chime(ctx, out, t2, [79, 84, 88, 91].map((m) => mp(m, o)), 0.035, 0.28, 'glock', 0.3);
    return Math.max(e, sparkle(ctx, out, t2 + 0.05, 8, 0.4, 0.1));
  },

  // ── Kitchen ──
  mugPick: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'bandpass', freq: 1500, q: 0.8, peak: 0.08, tc: 0.02 });
    return modal(ctx, out, t, 1150 * o.pitch, [[1, 1, 0.03], [2.32, 0.5, 0.018], [4.1, 0.2, 0.01]], 0.4);
  },
  mugPlace: (ctx, out, t, o) => {
    thump(ctx, out, t, 170, 110, 0.07, 0.38);
    noiseBurst(ctx, out, t, { type: 'highpass', freq: 2000, q: 0.7, peak: 0.12, attack: 0.0006, tc: 0.004 });
    return modal(ctx, out, t, 880 * o.pitch, [[1, 1, 0.06], [2.37, 0.55, 0.035], [4.2, 0.26, 0.02], [6.5, 0.1, 0.01]], 0.32);
  },
  brewStart: (ctx, out, t, o) => {
    click(ctx, out, t, 2600, 0.5, 0.2);
    const g = gainNode(ctx, 0, out);
    ahr(g.gain, t + 0.08, 0.1, 0.005, 0.07, 0.02);
    oscNode(ctx, 'sine', 1320 * o.pitch, t + 0.08, 0.12, g);
    const hum = gainNode(ctx, 0, out);
    hum.gain.setValueAtTime(0, t + 0.2);
    hum.gain.linearRampToValueAtTime(0.12, t + 0.7);
    hum.gain.linearRampToValueAtTime(0, t + 1.1);
    noiseNode(ctx, 'brown', t + 0.2, 0.95, filterNode(ctx, 'lowpass', 260, 0.7, hum));
    let end = t + 1.15;
    for (let i = 0; i < 5; i++) end = Math.max(end, bubble(ctx, out, t + 0.35 + i * 0.13 + rand(0, 0.05), rand(280, 650) * o.pitch, rand(0.12, 0.22)));
    return end;
  },
  pour: (ctx, out, t, o) => {
    const env = gainNode(ctx, 0, out);
    ahr(env.gain, t, 0.7, 0.05, 0.5, 0.12);
    const am = gainNode(ctx, 0.7, env);
    const lfo = oscNode(ctx, 'sine', 17, t, 0.7);
    const lg = gainNode(ctx, 0.3);
    lfo.connect(lg);
    lg.connect(am.gain);
    const bp = filterNode(ctx, 'bandpass', 500 * o.pitch, 4, am);
    bp.frequency.setValueAtTime(500 * o.pitch, t);
    bp.frequency.exponentialRampToValueAtTime(1400 * o.pitch, t + 0.65);
    noiseNode(ctx, 'white', t, 0.7, bp);
    bubble(ctx, out, t + 0.2, 520 * o.pitch, 0.1);
    bubble(ctx, out, t + 0.45, 700 * o.pitch, 0.08);
    return t + 0.7;
  },
  stir: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 5; i++) end = Math.max(end, modal(ctx, out, t + i * 0.14 + rand(0, 0.02), rand(3000, 3400) * o.pitch, [[1, 1, 0.02], [1.52, 0.5, 0.015], [2.7, 0.25, 0.008]], 0.16));
    const sw = gainNode(ctx, 0, out);
    ahr(sw.gain, t, 0.05, 0.1, 0.4, 0.15);
    noiseNode(ctx, 'pink', t, 0.7, filterNode(ctx, 'lowpass', 900, 0.8, sw));
    return Math.max(end, t + 0.66);
  },
  coffeeSecured: (ctx, out, t, o) => {
    let e = chime(ctx, out, t, [77, 81, 84].map((m) => mp(m, o)), 0.09, 0.42, 'marimba', 0.15);
    const t2 = t + 0.3;
    e = Math.max(e, glockNote(ctx, out, t2, mp(89, o), 0.35, 0.4));
    e = Math.max(e, padChord(ctx, out, t2, [65, 69, 72].map((m) => mp(m, o)), 0.2, 0.6, 0.05));
    return Math.max(e, sparkle(ctx, out, t2 + 0.05, 4, 0.3, 0.09));
  },
  fridgeOpen: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 500, q: 0.7, peak: 0.5, attack: 0.004, tc: 0.05 });
    thump(ctx, out, t, 120, 70, 0.1, 0.3);
    ping(ctx, out, t + 0.08, 2100 * o.pitch, { peak: 0.1, tc: 0.08 });
    ping(ctx, out, t + 0.12, 2730 * o.pitch, { peak: 0.08, tc: 0.07 });
    const hum = gainNode(ctx, 0, out);
    hum.gain.setValueAtTime(0, t);
    hum.gain.linearRampToValueAtTime(0.07, t + 0.3);
    hum.gain.linearRampToValueAtTime(0, t + 0.8);
    noiseNode(ctx, 'brown', t, 0.82, filterNode(ctx, 'lowpass', 300, 0.7, hum));
    return t + 0.82;
  },
  lunchSnap: (ctx, out, t, o) => {
    click(ctx, out, t, 2600 * o.pitch, 0.55);
    click(ctx, out, t + 0.035, 1900 * o.pitch, 0.45);
    ping(ctx, out, t + 0.035, 1240 * o.pitch, { peak: 0.1, attack: 0.001, tc: 0.012 });
    return ping(ctx, out, t + 0.035, 620 * o.pitch, { peak: 0.28, attack: 0.001, tc: 0.025 });
  },
  itemPick: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { type: 'bandpass', freq: 3000, q: 1, peak: 0.06, tc: 0.02 });
    return blip(ctx, out, t, 420 * o.pitch, 760 * o.pitch, 0.07, 0.55);
  },
  itemPlace: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 700, q: 0.7, peak: 0.25, attack: 0.002, tc: 0.03 });
    return thump(ctx, out, t, 150 * o.pitch, 85 * o.pitch, 0.1, 0.5);
  },
  dishClink: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t + 0.02, { type: 'bandpass', freq: 3500, q: 1.2, peak: 0.08, tc: 0.015 });
    modal(ctx, out, t + 0.02, 1900 * o.pitch, [[1, 1, 0.03], [2.3, 0.4, 0.015]], 0.12);
    return modal(ctx, out, t, 1400 * o.pitch, [[1, 1, 0.05], [2.1, 0.55, 0.03], [3.9, 0.28, 0.018], [5.6, 0.1, 0.01]], 0.3);
  },
  glassClink: (ctx, out, t, o) => {
    modal(ctx, out, t + 0.045, 2250 * o.pitch, [[1, 1, 0.08], [2.76, 0.3, 0.03]], 0.1);
    return modal(ctx, out, t, 2200 * o.pitch, [[1, 1, 0.14], [2.76, 0.35, 0.06], [5.4, 0.1, 0.02]], 0.22);
  },
  cutlery: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 7; i++) end = Math.max(end, modal(ctx, out, t + rand(0, 0.2), rand(2500, 4200) * o.pitch, [[1, 1, 0.025], [2.4, 0.4, 0.012]], 0.11));
    return Math.max(end, noiseBurst(ctx, out, t, { type: 'highpass', freq: 5000, q: 0.7, peak: 0.05, attack: 0.005, tc: 0.05 }).end);
  },
  rinse: (ctx, out, t, o) => {
    const env = gainNode(ctx, 0, out);
    ahr(env.gain, t, 0.6, 0.03, 0.25, 0.15);
    const am = gainNode(ctx, 0.75, env);
    const lfo = oscNode(ctx, 'sine', 23, t, 0.45);
    const lg = gainNode(ctx, 0.25);
    lfo.connect(lg);
    lg.connect(am.gain);
    noiseNode(ctx, 'pink', t, 0.45, filterNode(ctx, 'bandpass', 1800 * o.pitch, 0.8, am));
    noiseBurst(ctx, out, t, { type: 'highpass', freq: 3000, q: 0.6, peak: 0.1, attack: 0.005, tc: 0.05 });
    return t + 0.45;
  },
  dishwasherShut: (ctx, out, t, o) => {
    thump(ctx, out, t, 95 * o.pitch, 55 * o.pitch, 0.2, 0.6);
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 600, q: 0.7, peak: 0.2, tc: 0.04 });
    click(ctx, out, t + 0.04, 2400, 0.4);
    return modal(ctx, out, t + 0.02, 900 * o.pitch, [[1, 1, 0.03], [2.3, 0.4, 0.015]], 0.1) + 0.2;
  },
  suds: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 8; i++) end = Math.max(end, bubble(ctx, out, t + rand(0, 0.5), rand(500, 1300) * o.pitch, rand(0.1, 0.22)));
    return end;
  },
  crunch: (ctx, out, t, o) => {
    let end = t;
    for (const dt of [0, 0.05, 0.1, 0.16]) end = Math.max(end, noiseBurst(ctx, out, t + dt + rand(0, 0.015), { type: 'bandpass', freq: rand(1400, 3200) * o.pitch, q: 1.2, peak: rand(0.3, 0.45), attack: 0.001, tc: 0.02 }).end);
    for (let i = 0; i < 6; i++) noiseBurst(ctx, out, t + rand(0, 0.2), { type: 'highpass', freq: 4000, q: 0.7, peak: 0.08, attack: 0.0005, tc: 0.003 });
    return end;
  },

  // ── House ──
  footstep: (ctx, out, t, o) => {
    const v = o.intensity;
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 700 * o.pitch * (0.8 + 0.4 * v), q: 0.7, peak: 0.8, attack: 0.006, tc: 0.03 });
    return thump(ctx, out, t, 110 * o.pitch, 70 * o.pitch, 0.05, 0.3) + 0.02;
  },
  doorOpen: (ctx, out, t, o) => {
    click(ctx, out, t, 2200, 0.5, 0.15);
    creak(ctx, out, t + 0.05, 330 * o.pitch, 420 * o.pitch, 0.35, 0.14);
    return swish(ctx, out, t + 0.05, 300, 800, 500, 0.45, 0.24, 0.9);
  },
  doorClose: (ctx, out, t, o) => {
    thump(ctx, out, t, 120 * o.pitch, 70 * o.pitch, 0.15, 0.6);
    modal(ctx, out, t, 240 * o.pitch, [[1, 1, 0.04], [2.6, 0.4, 0.02]], 0.22);
    return click(ctx, out, t + 0.03, 2200, 0.3) + 0.3;
  },
  lightSwitch: (ctx, out, t, o) => {
    click(ctx, out, t, 3200 * o.pitch, 0.9, 0.3);
    return click(ctx, out, t + 0.018, 2600 * o.pitch, 0.35) + 0.03;
  },
  curtain: (ctx, out, t, o) => {
    const end = swish(ctx, out, t, 900 * o.pitch, 2400 * o.pitch, 1500 * o.pitch, 0.7, 0.6, 0.8, [-0.5, 0.5]);
    for (let i = 0; i < 5; i++) ping(ctx, out, t + 0.05 + i * 0.1 + rand(0, 0.03), rand(4200, 5200), { peak: 0.04, attack: 0.001, tc: 0.01 });
    return end;
  },
  blanketRustle: (ctx, out, t, o) => rustle(ctx, out, t, 0.6, 0.6, 1300 * o.pitch, 9),
  bedCreak: (ctx, out, t, o) => {
    thump(ctx, out, t, 90, 60, 0.1, 0.22);
    creak(ctx, out, t, 220 * o.pitch, 300 * o.pitch, 0.3, 0.08);
    return spring(ctx, out, t + 0.05, 330 * o.pitch, 0.25, 0.1);
  },
  trashRustle: (ctx, out, t, o) => rustle(ctx, out, t, 0.5, 0.6, 2800 * o.pitch, 28),
  binLid: (ctx, out, t, o) => {
    thump(ctx, out, t, 180 * o.pitch, 110 * o.pitch, 0.08, 0.42);
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 1500, q: 0.7, peak: 0.28, attack: 0.001, tc: 0.02 });
    return modal(ctx, out, t, 240 * o.pitch, [[1, 1, 0.05], [2.54, 0.45, 0.03], [4.1, 0.2, 0.015]], 0.3);
  },
  binThud: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 900, q: 0.7, peak: 0.25, attack: 0.003, tc: 0.08 });
    return thump(ctx, out, t, 95 * o.pitch, 50 * o.pitch, 0.22, 0.6);
  },
  pickup: (ctx, out, t, o) => {
    ping(ctx, out, t + 0.03, 2080 * o.pitch, { type: 'triangle', peak: 0.06, tc: 0.02 });
    return blip(ctx, out, t, 520 * o.pitch, 1040 * o.pitch, 0.09, 0.55);
  },
  deliver: (ctx, out, t, o) => {
    const end = chime(ctx, out, t, [84, 88, 91].map((m) => mp(m, o)), 0.07, 0.35, 'celesta', 0.25);
    return Math.max(end, sparkle(ctx, out, t + 0.2, 4, 0.25, 0.08));
  },
  zipper: (ctx, out, t, o) => {
    const env = gainNode(ctx, 0, out);
    ahr(env.gain, t, 0.3, 0.02, 0.3, 0.06);
    const am = gainNode(ctx, 0.5, env);
    const lfo = oscNode(ctx, 'square', 45, t, 0.4);
    glide(lfo.frequency, t, 45, 90, 0.35);
    const lg = gainNode(ctx, 0.5);
    lfo.connect(lg);
    lg.connect(am.gain);
    const bp = filterNode(ctx, 'bandpass', 1800 * o.pitch, 1.2, am);
    bp.frequency.setValueAtTime(1800 * o.pitch, t);
    bp.frequency.linearRampToValueAtTime(3200 * o.pitch, t + 0.36);
    noiseNode(ctx, 'white', t, 0.4, bp);
    return t + 0.4;
  },
  found: (ctx, out, t, o) => {
    celestaNote(ctx, out, t + 0.05, mp(88, o), 0.3, 0.3);
    const end = chime(ctx, out, t, [91, 96].map((m) => mp(m, o)), 0.1, 0.38, 'glock', 0.4);
    noiseBurst(ctx, out, t + 0.1, { type: 'highpass', freq: 6500, q: 0.6, peak: 0.04, attack: 0.03, tc: 0.12 });
    return Math.max(end, sparkle(ctx, out, t + 0.08, 9, 0.5, 0.1));
  },
  whoosh: (ctx, out, t, o) => swish(ctx, out, t, 400 * o.pitch, 1600 * o.pitch, 700 * o.pitch, 0.35, 0.8, 1.2, [-0.3, 0.3]),
  pop: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { type: 'highpass', freq: 2500, q: 0.7, peak: 0.08, attack: 0.0005, tc: 0.003 });
    return blip(ctx, out, t, 1000 * o.pitch, 320 * o.pitch, 0.05, 0.5);
  },
  boing: (ctx, out, t, o) => spring(ctx, out, t, 330 * o.pitch, 0.5, 0.45),
  thud: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 400, q: 0.7, peak: 0.2, tc: 0.03 });
    return thump(ctx, out, t, 110 * o.pitch, 55 * o.pitch, 0.18, 0.7);
  },
  shh: (ctx, out, t, o) => {
    const env = gainNode(ctx, 0, out);
    ahr(env.gain, t, 0.45, 0.08, 0.32, 0.16);
    const src = noiseNode(ctx, 'pink', t, 0.6, undefined);
    src.connect(filterNode(ctx, 'bandpass', 2700 * o.pitch, 1.2, env));
    src.connect(filterNode(ctx, 'bandpass', 4800 * o.pitch, 2, gainNode(ctx, 0.35, env)));
    return t + 0.58;
  },
  heart: (ctx, out, t, o) => {
    blip(ctx, out, t, 600 * o.pitch, 300 * o.pitch, 0.04, 0.32);
    thump(ctx, out, t + 0.03, 150, 110, 0.08, 0.32);
    thump(ctx, out, t + 0.18, 130, 95, 0.08, 0.26);
    const end = chime(ctx, out, t + 0.12, [mp(88, o), mp(93, o)], 0.1, 0.3, 'celesta', 0.25);
    return Math.max(end, sparkle(ctx, out, t + 0.25, 3, 0.2, 0.07));
  },
  kiss: (ctx, out, t, o) => {
    // "m" (a soft closed hum) → "wah" (the formant opens) → a tiny lip pop.
    const m = gainNode(ctx, 0, out);
    ahr(m.gain, t, 0.08, 0.01, 0.03, 0.02);
    oscNode(ctx, 'sine', 190 * o.pitch, t, 0.08, m);
    voice(ctx, out, t + 0.05, 0.14, 330 * o.pitch, 300 * o.pitch, 'u', 'a', 1.3, 0.12, 0);
    return blip(ctx, out, t + 0.19, 900 * o.pitch, 1400 * o.pitch, 0.025, 0.18);
  },

  // ── Dog ──
  dogBark: (ctx, out, t, o) => {
    noiseBurst(ctx, out, t, { kind: 'pink', type: 'bandpass', freq: 1200, q: 1, peak: 0.25, tc: 0.03 });
    return voice(ctx, out, t, 0.16, 420 * o.pitch, 290 * o.pitch, 'a', 'o', 0.9, 0.55, 0.2);
  },
  dogBarkSmall: (ctx, out, t, o) => voice(ctx, out, t, 0.1, 600 * o.pitch, 470 * o.pitch, 'a', 'e', 1.05, 0.42, 0.15),
  dogPant: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 6; i++) end = Math.max(end, noiseBurst(ctx, out, t + i * 0.12, { kind: 'pink', type: 'bandpass', freq: (i % 2 ? 1900 : 1400) * o.pitch, q: 1.4, peak: i % 2 ? 0.65 : 0.5, attack: 0.02, tc: 0.035 }).end);
    return end;
  },
  dogWhine: (ctx, out, t, o) => {
    const g = gainNode(ctx, 0, filterNode(ctx, 'bandpass', 1100, 1.5, out));
    ahr(g.gain, t, 0.26, 0.04, 0.45, 0.1);
    const w = oscNode(ctx, 'triangle', 700 * o.pitch, t, 0.62, g);
    w.frequency.setValueAtTime(700 * o.pitch, t);
    w.frequency.linearRampToValueAtTime(980 * o.pitch, t + 0.15);
    w.frequency.linearRampToValueAtTime(820 * o.pitch, t + 0.45);
    w.frequency.linearRampToValueAtTime(900 * o.pitch, t + 0.58);
    const lfo = oscNode(ctx, 'sine', 7, t, 0.62);
    const lg = gainNode(ctx, 25);
    lfo.connect(lg);
    lg.connect(w.detune);
    return t + 0.62;
  },
  dogCollar: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 4; i++) end = Math.max(end, modal(ctx, out, t + rand(0, 0.25), rand(3300, 5200) * o.pitch, [[1, 1, 0.05], [2.7, 0.4, 0.02]], 0.12));
    return end;
  },
  dogPaws: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 5; i++) {
      const p = pannerNode(ctx, i % 2 ? 0.15 : -0.15, out);
      noiseBurst(ctx, p, t + i * 0.075, { kind: 'pink', type: 'lowpass', freq: 1200 * o.pitch, q: 0.7, peak: 0.45, attack: 0.002, tc: 0.012 });
      end = Math.max(end, thump(ctx, p, t + i * 0.075, 200, 140, 0.03, 0.25));
    }
    return end;
  },
  whistle: (ctx, out, t, o) => {
    const note = (ts: number, f0: number, f1: number, dur: number, peak: number): number => {
      const g = gainNode(ctx, 0, out);
      ahr(g.gain, ts, peak, 0.02, dur - 0.05, 0.03);
      const w = oscNode(ctx, 'sine', f0, ts, dur + 0.02, g);
      glide(w.frequency, ts, f0, f1, dur * 0.7);
      return Math.max(ts + dur + 0.02, noiseBurst(ctx, out, ts, { kind: 'pink', type: 'bandpass', freq: f1, q: 5, peak: peak * 0.2, attack: 0.01, tc: 0.03 }).end);
    };
    note(t, 1500 * o.pitch, 2100 * o.pitch, 0.16, 0.25);
    return note(t + 0.22, 1400 * o.pitch, 2300 * o.pitch, 0.28, 0.27);
  },
  treatShake: (ctx, out, t, o) => {
    for (let s = 0; s < 3; s++) {
      const ts = t + s * 0.18;
      for (let i = 0; i < 6; i++) noiseBurst(ctx, out, ts + rand(0, 0.07), { type: 'bandpass', freq: rand(2500, 5000) * o.pitch, q: 3, peak: rand(0.2, 0.32), attack: 0.0005, tc: 0.004 });
      noiseBurst(ctx, out, ts, { type: 'highpass', freq: 3000, q: 0.7, peak: 0.08, attack: 0.005, tc: 0.03 });
    }
    return t + 0.5;
  },
  sniff: (ctx, out, t, o) => {
    let end = t;
    for (let i = 0; i < 3; i++) {
      const ts = t + i * 0.11;
      const g = gainNode(ctx, 0, out);
      g.gain.setValueAtTime(0, ts);
      g.gain.linearRampToValueAtTime(0.5, ts + 0.04);
      g.gain.linearRampToValueAtTime(0, ts + 0.06);
      noiseNode(ctx, 'pink', ts, 0.08, filterNode(ctx, 'bandpass', 2400 * o.pitch, 0.9, filterNode(ctx, 'highpass', 1200, 0.7, g)));
      end = ts + 0.08;
    }
    return end;
  },

  // ── Car / school run ──
  carDoor: (ctx, out, t, o) => {
    const e = thump(ctx, out, t, 85 * o.pitch, 48 * o.pitch, 0.25, 0.7);
    ping(ctx, out, t, 240 * o.pitch, { peak: 0.22, tc: 0.05 });
    click(ctx, out, t + 0.01, 2000, 0.3);
    return Math.max(e, noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 1200, q: 0.7, peak: 0.2, tc: 0.04 }).end);
  },
  slidingDoor: (ctx, out, t, o) => {
    const env = gainNode(ctx, 0, out);
    ahr(env.gain, t, 0.35, 0.05, 0.4, 0.1);
    const am = gainNode(ctx, 0.8, env);
    const lfo = oscNode(ctx, 'sine', 14, t, 0.6);
    const lg = gainNode(ctx, 0.2);
    lfo.connect(lg);
    lg.connect(am.gain);
    noiseNode(ctx, 'brown', t, 0.6, filterNode(ctx, 'lowpass', 500 * o.pitch, 0.7, am));
    const e = thump(ctx, out, t + 0.5, 110, 60, 0.15, 0.55);
    return Math.max(e, click(ctx, out, t + 0.52, 1900, 0.3));
  },
  seatbelt: (ctx, out, t, o) => {
    click(ctx, out, t, 3200 * o.pitch, 0.5);
    ping(ctx, out, t, 2600 * o.pitch, { peak: 0.16, attack: 0.0008, tc: 0.012 });
    click(ctx, out, t + 0.045, 2600 * o.pitch, 0.45);
    return ping(ctx, out, t + 0.045, 2100 * o.pitch, { peak: 0.14, attack: 0.0008, tc: 0.012 });
  },
  carStart: (ctx, out, t, o) => {
    for (let i = 0; i < 4; i++) {
      noiseBurst(ctx, out, t + i * 0.09, { kind: 'pink', type: 'bandpass', freq: 420, q: 1, peak: 0.28, attack: 0.01, tc: 0.03 });
      thump(ctx, out, t + i * 0.09, 90, 70, 0.05, 0.18);
    }
    // The engine catches with a cheerful little "vroom".
    const tc = t + 0.4;
    const env = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 380 * o.pitch, 1.2, out));
    env.gain.setValueAtTime(0, tc);
    env.gain.linearRampToValueAtTime(0.5, tc + 0.06);
    env.gain.setTargetAtTime(0.25, tc + 0.4, 0.15);
    env.gain.setTargetAtTime(0, tc + 0.7, 0.08);
    for (const det of [0, 11]) {
      const e = oscNode(ctx, 'sawtooth', 38, tc, 1.0, env);
      e.detune.value = det;
      e.frequency.setValueAtTime(38 * o.pitch, tc);
      e.frequency.linearRampToValueAtTime(62 * o.pitch, tc + 0.3);
      e.frequency.linearRampToValueAtTime(46 * o.pitch, tc + 0.7);
    }
    return tc + 1.0;
  },
  carHorn: (ctx, out, t, o) => {
    const lp = filterNode(ctx, 'lowpass', 1600, 0.8, out);
    for (const ts of [t, t + 0.18]) {
      const g = gainNode(ctx, 0, lp);
      ahr(g.gain, ts, 0.18, 0.01, 0.1, 0.03);
      oscNode(ctx, 'sawtooth', 440 * o.pitch, ts, 0.16, g);
      oscNode(ctx, 'sawtooth', 554 * o.pitch, ts, 0.16, g);
    }
    return t + 0.35;
  },
  brake: (ctx, out, t, o) => {
    const g = gainNode(ctx, 0, out);
    ahr(g.gain, t, 0.14, 0.03, 0.2, 0.08);
    const s = oscNode(ctx, 'sine', 1500 * o.pitch, t, 0.33, g);
    glide(s.frequency, t, 1500 * o.pitch, 1250 * o.pitch, 0.3);
    const lfo = oscNode(ctx, 'sine', 20, t, 0.33);
    const lg = gainNode(ctx, 30);
    lfo.connect(lg);
    lg.connect(s.frequency);
    return Math.max(t + 0.35, noiseBurst(ctx, out, t, { kind: 'pink', type: 'lowpass', freq: 800, q: 0.7, peak: 0.1, attack: 0.02, tc: 0.06 }).end);
  },
  turnSignal: (ctx, out, t, o) => {
    rimHit(ctx, out, t, 0.35, 2000 * o.pitch);
    return rimHit(ctx, out, t + 0.33, 0.3, 1500 * o.pitch);
  },
  honkGoose: (ctx, out, t, o) => {
    const honk = (ts: number): number => {
      const env = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 3000, 0.7, out));
      ahr(env.gain, ts, 0.35, 0.015, 0.11, 0.04);
      const am = gainNode(ctx, 0.7, env);
      const lfo = oscNode(ctx, 'sine', 45, ts, 0.18);
      const lg = gainNode(ctx, 0.35);
      lfo.connect(lg);
      lg.connect(am.gain);
      const src = oscNode(ctx, 'sawtooth', 330 * o.pitch, ts, 0.18);
      glide(src.frequency, ts, 330 * o.pitch, 290 * o.pitch, 0.16);
      src.connect(filterNode(ctx, 'bandpass', 900, 3, gainNode(ctx, 1.6, am)));
      src.connect(filterNode(ctx, 'bandpass', 1900, 5, gainNode(ctx, 0.9, am)));
      return ts + 0.18;
    };
    honk(t);
    return honk(t + 0.22);
  },
  splash: (ctx, out, t, o) => {
    const b = noiseBurst(ctx, out, t, { kind: 'pink', type: 'bandpass', freq: 2500 * o.pitch, q: 0.8, peak: 0.5, attack: 0.004, tc: 0.08 });
    b.filter.frequency.setValueAtTime(2500 * o.pitch, t);
    b.filter.frequency.exponentialRampToValueAtTime(700 * o.pitch, t + 0.2);
    let end = b.end;
    for (let i = 0; i < 7; i++) end = Math.max(end, bubble(ctx, out, t + 0.05 + rand(0, 0.45), rand(900, 2600) * o.pitch, rand(0.06, 0.13)));
    return end;
  },
  schoolBell: (ctx, out, t, o) => {
    // A cheerful hand bell, rung side to side (not a harsh electric bell).
    let end = t;
    for (let i = 0; i < 8; i++) {
      const p = pannerNode(ctx, i % 2 ? 0.2 : -0.2, out);
      end = Math.max(end, modal(ctx, p, t + i * 0.13, 1318 * o.pitch, [[1, 1, 0.25], [2.02, 0.45, 0.1], [3.01, 0.2, 0.05]], i % 2 ? 0.18 : 0.26));
    }
    return end;
  },
  cheer: (ctx, out, t, o) => {
    const voices: ReadonlyArray<readonly [number, number]> = [
      [130, 1.0],
      [220, 1.12],
      [300, 1.24],
      [320, 1.24],
      [380, 1.34],
    ];
    let end = t;
    voices.forEach(([f0, sc], i) => {
      const p = pannerNode(ctx, (i - 2) * 0.25, out);
      const f = f0 * rand(0.97, 1.03) * o.pitch;
      end = Math.max(end, voice(ctx, p, t + i * 0.02, 0.55, f, f * 1.25, 'e', 'a', sc, 0.16, 0.08));
    });
    for (const dt of [0.3, 0.45, 0.62]) end = Math.max(end, clapHit(ctx, out, t + dt, 0.3));
    return end;
  },
  kidsYay: (ctx, out, t, o) => {
    let end = t;
    [300, 330, 380].forEach((f0, i) => {
      const p = pannerNode(ctx, (i - 1) * 0.35, out);
      const f = f0 * rand(0.97, 1.03) * o.pitch;
      end = Math.max(end, voice(ctx, p, t + i * 0.025, 0.45, f, f * 1.3, 'e', 'a', 1.28, 0.14, 0.08));
    });
    return Math.max(end, sparkle(ctx, out, t + 0.2, 3, 0.2, 0.07));
  },
};

// ── Metadata ─────────────────────────────────────────────────────────────────

const M = (level: number, rule: { cd?: number; v?: number; p?: Priority; jitter?: number; bus?: 'ui' | 'game'; wet?: number; dyn?: number; duck?: [number, number] } = {}): SfxMeta => ({
  level,
  cooldown: rule.cd ?? 0.04,
  maxVoices: rule.v ?? 3,
  priority: rule.p ?? 1,
  jitter: rule.jitter ?? 0,
  bus: rule.bus ?? 'game',
  wet: rule.wet ?? 0,
  ...(rule.dyn !== undefined ? { dyn: rule.dyn } : {}),
  ...(rule.duck ? { duck: { amount: rule.duck[0], seconds: rule.duck[1] } } : {}),
});

export const SFX_META: Record<SfxId, SfxMeta> = {
  // UI (never paused)
  uiMove: M(0.5, { cd: 0.03, v: 2, p: 0, bus: 'ui' }),
  uiConfirm: M(0.6, { cd: 0.05, v: 2, p: 2, bus: 'ui' }),
  uiBack: M(0.55, { cd: 0.05, v: 2, bus: 'ui' }),
  uiToggle: M(0.6, { cd: 0.04, v: 2, bus: 'ui' }),
  actCard: M(0.75, { cd: 0.5, v: 1, p: 3, wet: 0.25, duck: [0.45, 1.6] }),
  banner: M(0.7, { cd: 0.25, v: 2, p: 2, wet: 0.1 }),
  taskDone: M(0.6, { cd: 0.15, v: 2, p: 2, wet: 0.12 }),
  star: M(0.6, { cd: 0.08, v: 4, p: 2, wet: 0.15 }),
  award: M(0.7, { cd: 0.4, v: 1, p: 3, wet: 0.15, duck: [0.4, 1.3] }),
  clockTick: M(0.35, { cd: 0.2, v: 2, p: 0 }),
  clockChime: M(0.6, { cd: 1, v: 1, p: 3, wet: 0.3, duck: [0.35, 2.0] }),
  alarm: M(0.6, { cd: 1, v: 1, p: 3, wet: 0.2, duck: [0.3, 1.4] }),
  // Hair
  brushStroke: M(0.55, { cd: 0.06, v: 3, p: 0, jitter: 0.05, dyn: 0.25 }),
  brushSnag: M(0.6, { cd: 0.25, v: 2, p: 2 }),
  detangle: M(0.55, { cd: 0.05, v: 4, p: 1, jitter: 0.04 }),
  sectionClear: M(0.55, { cd: 0.1, v: 3, p: 2, wet: 0.2 }),
  sparkle: M(0.5, { cd: 0.08, v: 3, p: 0, wet: 0.25 }),
  shine: M(0.5, { cd: 0.1, v: 2, p: 1, wet: 0.2 }),
  hairFlip: M(0.7, { cd: 0.15, v: 2, p: 1, jitter: 0.05 }),
  blackBrushSting: M(0.8, { cd: 1.5, v: 1, p: 3, wet: 0.5, duck: [0.85, 3.0] }),
  blackBrushGleam: M(0.5, { cd: 0.3, v: 2, p: 1, wet: 0.3 }),
  brushPass: M(0.65, { cd: 0.5, v: 1, p: 3, wet: 0.3, duck: [0.35, 1.0] }),
  girlDone: M(0.6, { cd: 0.2, v: 2, p: 2, wet: 0.1 }),
  bossIntro: M(0.75, { cd: 1.5, v: 1, p: 3, wet: 0.3, duck: [0.85, 2.2] }),
  momInspect: M(0.6, { cd: 0.4, v: 1, p: 2, wet: 0.15 }),
  momApproved: M(0.7, { cd: 0.6, v: 1, p: 3, wet: 0.25, duck: [0.6, 1.5] }),
  momFinish: M(0.6, { cd: 0.4, v: 1, p: 2, wet: 0.2 }),
  // Kitchen
  mugPick: M(0.6, { cd: 0.08, v: 2, jitter: 0.04 }),
  mugPlace: M(0.6, { cd: 0.08, v: 2, jitter: 0.04 }),
  brewStart: M(0.6, { cd: 0.5, v: 1, p: 2 }),
  pour: M(0.6, { cd: 0.2, v: 2, jitter: 0.05 }),
  stir: M(0.5, { cd: 0.3, v: 1, jitter: 0.03 }),
  coffeeSecured: M(0.6, { cd: 0.5, v: 1, p: 2, wet: 0.15 }),
  fridgeOpen: M(0.55, { cd: 0.3, v: 1 }),
  lunchSnap: M(0.55, { cd: 0.06, v: 3, jitter: 0.05 }),
  itemPick: M(0.6, { cd: 0.05, v: 3, jitter: 0.05 }),
  itemPlace: M(0.55, { cd: 0.05, v: 3, jitter: 0.06 }),
  dishClink: M(0.5, { cd: 0.05, v: 3, jitter: 0.06 }),
  glassClink: M(0.45, { cd: 0.05, v: 3, jitter: 0.05 }),
  cutlery: M(0.5, { cd: 0.08, v: 2, jitter: 0.05 }),
  rinse: M(0.65, { cd: 0.12, v: 2, jitter: 0.05 }),
  dishwasherShut: M(0.6, { cd: 0.4, v: 1, p: 2 }),
  suds: M(0.45, { cd: 0.1, v: 2, p: 0, jitter: 0.08 }),
  crunch: M(0.5, { cd: 0.08, v: 3, p: 0, jitter: 0.08 }),
  // House
  footstep: M(0.6, { cd: 0.09, v: 3, p: 0, jitter: 0.08, dyn: 0.35 }),
  doorOpen: M(0.7, { cd: 0.25, v: 2 }),
  doorClose: M(0.6, { cd: 0.25, v: 2 }),
  lightSwitch: M(0.7, { cd: 0.1, v: 2, jitter: 0.03 }),
  curtain: M(0.7, { cd: 0.3, v: 2 }),
  blanketRustle: M(0.65, { cd: 0.15, v: 2, p: 0, jitter: 0.06 }),
  bedCreak: M(0.65, { cd: 0.25, v: 2, jitter: 0.06 }),
  trashRustle: M(0.6, { cd: 0.12, v: 2, p: 0, jitter: 0.06 }),
  binLid: M(0.55, { cd: 0.2, v: 2, jitter: 0.04 }),
  binThud: M(0.6, { cd: 0.2, v: 2, jitter: 0.04 }),
  pickup: M(0.6, { cd: 0.06, v: 3 }),
  deliver: M(0.6, { cd: 0.15, v: 2, p: 2, wet: 0.15 }),
  zipper: M(0.45, { cd: 0.2, v: 2, jitter: 0.05 }),
  found: M(0.65, { cd: 0.2, v: 2, p: 2, wet: 0.2 }),
  whoosh: M(0.65, { cd: 0.06, v: 3, p: 0, jitter: 0.06 }),
  pop: M(0.5, { cd: 0.04, v: 4, p: 0, jitter: 0.06 }),
  boing: M(0.5, { cd: 0.1, v: 2, jitter: 0.04 }),
  thud: M(0.6, { cd: 0.08, v: 3, jitter: 0.06 }),
  shh: M(0.55, { cd: 0.5, v: 1 }),
  heart: M(0.6, { cd: 0.15, v: 3, p: 2, wet: 0.15 }),
  kiss: M(0.45, { cd: 0.2, v: 2, jitter: 0.04 }),
  // Dog
  dogBark: M(0.55, { cd: 0.15, v: 2, jitter: 0.06 }),
  dogBarkSmall: M(0.5, { cd: 0.1, v: 2, jitter: 0.06 }),
  dogPant: M(0.6, { cd: 0.5, v: 1, p: 0, jitter: 0.05 }),
  dogWhine: M(0.45, { cd: 0.5, v: 1, jitter: 0.04 }),
  dogCollar: M(0.4, { cd: 0.15, v: 2, p: 0, jitter: 0.04 }),
  dogPaws: M(0.55, { cd: 0.2, v: 2, p: 0, jitter: 0.06 }),
  whistle: M(0.5, { cd: 0.4, v: 1, p: 2 }),
  treatShake: M(0.6, { cd: 0.3, v: 1, jitter: 0.04 }),
  sniff: M(0.65, { cd: 0.3, v: 1, p: 0, jitter: 0.05 }),
  // Car / school run
  carDoor: M(0.6, { cd: 0.2, v: 2, jitter: 0.04 }),
  slidingDoor: M(0.45, { cd: 0.5, v: 1 }),
  seatbelt: M(0.5, { cd: 0.08, v: 3, jitter: 0.04 }),
  carStart: M(0.45, { cd: 1, v: 1, p: 2 }),
  carHorn: M(0.5, { cd: 0.5, v: 1, p: 2 }),
  brake: M(0.55, { cd: 0.4, v: 1, jitter: 0.04 }),
  turnSignal: M(0.4, { cd: 0.3, v: 1, p: 0 }),
  honkGoose: M(0.5, { cd: 0.3, v: 2, jitter: 0.05 }),
  splash: M(0.55, { cd: 0.2, v: 2, jitter: 0.05 }),
  schoolBell: M(0.7, { cd: 1.5, v: 1, p: 3, wet: 0.2 }),
  cheer: M(0.6, { cd: 0.6, v: 1, p: 2, wet: 0.1 }),
  kidsYay: M(0.6, { cd: 0.5, v: 1, p: 2, wet: 0.1 }),
};

export const SFX_IDS = Object.keys(SFX) as SfxId[];

export interface PlaySfxOptions {
  volume?: number;
  pitch?: number;
  pan?: number;
  /** Room reverb input for the per-sound wet send. */
  wet?: AudioNode;
}

/** Gain and intensity for a volume option (dynamic sounds keep a floor so a gentle stroke still reads). */
export function sfxGain(meta: Pick<SfxMeta, 'level' | 'dyn'>, volume: number | undefined): { gain: number; intensity: number } {
  const v = Number.isFinite(volume) ? Math.max(0, Math.min(1.5, volume!)) : 1;
  if (meta.dyn !== undefined) return { gain: v <= 0 ? 0 : meta.level * (meta.dyn + (1 - meta.dyn) * Math.min(1, v)), intensity: clamp01(v) };
  return { gain: meta.level * v, intensity: 1 };
}

/** Sanitised pitch multiplier (0.25..4). */
export function sfxPitch(pitch: number | undefined): number {
  return Number.isFinite(pitch) && pitch! > 0 ? Math.min(4, Math.max(0.25, pitch!)) : 1;
}

/**
 * Play an effect into `dest` at time t with volume/pan/pitch applied.
 * Returns the effect's approximate end time (t when nothing was scheduled).
 */
export function playSfx(ctx: Ctx, dest: AudioNode, id: SfxId, t: number, opts: PlaySfxOptions = {}): number {
  const meta = SFX_META[id];
  const recipe = SFX[id];
  if (!meta || !recipe) return t;
  const { gain, intensity } = sfxGain(meta, opts.volume);
  if (gain <= 0.0005) return t;
  let node: AudioNode = dest;
  const pan = Number.isFinite(opts.pan) ? Math.max(-1, Math.min(1, opts.pan!)) : 0;
  if (Math.abs(pan) > 0.01) node = pannerNode(ctx, pan, node);
  const g = gainNode(ctx, gain, node);
  if (opts.wet && meta.wet > 0) g.connect(gainNode(ctx, meta.wet, opts.wet));
  const pitch = sfxPitch(opts.pitch) * (1 + (Math.random() * 2 - 1) * meta.jitter);
  return recipe(ctx, g, t, { pitch, intensity });
}
