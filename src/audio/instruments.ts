// ─────────────────────────────────────────────────────────────────────────────
// The family band — warm, rounded, cosy instruments, all synthesized:
//   musicBox   comb-tine music box (sine + short inharmonic tine + octave shimmer)
//   celesta    soft bell-piano (sine + 2nd/4th partials)
//   bell       FM glockenspiel
//   marimba    / xylo  mallets (sine + tuned overtones)
//   kalimba    thumb piano (sine with a pitch "thumb" drop + a tine)
//   epiano     FM electric piano (tine attack), bus tremolo + lo-fi wow
//   pizz / uke / harp / pluckBass   Karplus–Strong plucks (plucks.ts)
//   bass       round soft synth bass (sine + triangle + a phone-audible 2nd harmonic)
//   pad        warm detuned string pad
//   choir      detuned saws through a shared vowel formant bank ("aah" / "ooh")
//   brass      soft detuned-saw brass (melody) / stabs
//   whistle    a sing-along whistle (sine, chiff, delayed vibrato)
//   drums      felt kick, brush snare, rim, clap, shaker, tambourine, hat,
//              triangle, finger snap, timpani, soft cymbal (+ swell)
// A Band owns one music track's instrument buses (created lazily: level + pan, a
// tempo-synced echo for the twinkly leads, shared LFOs) and plays notes on them. The
// free note functions are shared with the SFX so stingers sound like the band.
// Structure adapted from ATHLETE MAYHEM's instruments.ts; every instrument is new.
// ─────────────────────────────────────────────────────────────────────────────
import { playPluck, type PluckKind } from './plucks';
import { type Ctx, filterNode, gainNode, holdAt, noiseBurst, noiseNode, oscNode, pannerNode, perc, ping, thump, vinylBuffer } from './synth';
import { midiToFreq } from './theory';

/** Instrument bus levels — the band's mix. Tuned with the offline QA meter (qa.ts). */
export const MIX = {
  musicBox: 0.2,
  celesta: 0.2,
  bell: 0.15,
  marimba: 0.34,
  xylo: 0.22,
  kalimba: 0.3,
  epiano: 0.26,
  pizz: 0.36,
  uke: 0.3,
  harp: 0.26,
  pluckBass: 0.55,
  bass: 0.36,
  pad: 0.1,
  choir: 0.2,
  brass: 0.15,
  stab: 0.1,
  whistle: 0.17,
  kick: 0.44,
  snare: 0.24,
  rim: 0.13,
  clap: 0.2,
  shaker: 0.16,
  tamb: 0.13,
  hat: 0.1,
  triangle: 0.06,
  snap: 0.13,
  timp: 0.38,
  cymbal: 0.08,
  bed: 0.07,
} as const;

export type BandInstrument = keyof typeof MIX;

/** Stereo placement per bus. */
const PAN: Readonly<Record<BandInstrument, number>> = {
  musicBox: 0.18,
  celesta: -0.12,
  bell: 0.3,
  marimba: -0.08,
  xylo: 0.1,
  kalimba: 0.12,
  epiano: -0.22,
  pizz: -0.28,
  uke: -0.25,
  harp: 0.28,
  pluckBass: 0,
  bass: 0,
  pad: 0,
  choir: 0.05,
  brass: 0.15,
  stab: -0.15,
  whistle: 0,
  kick: 0,
  snare: 0.05,
  rim: 0.2,
  clap: -0.06,
  shaker: 0.35,
  tamb: -0.35,
  hat: 0.3,
  triangle: 0.4,
  snap: -0.2,
  timp: -0.1,
  cymbal: -0.3,
  bed: 0,
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// ── Vowels (shared with babble + the choir stingers) ─────────────────────────

export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

/** Formant centres (Hz) F1, F2, F3 — a soft, rounded, slightly "cartoon choir" set. */
export const VOWELS: Readonly<Record<Vowel, readonly [number, number, number]>> = {
  a: [820, 1200, 2750],
  e: [480, 1850, 2650],
  i: [330, 2250, 2950],
  o: [520, 880, 2650],
  u: [360, 720, 2550],
};

/**
 * A parallel formant bank (3 band-passes + a warm body path) feeding `dest`.
 * Returns its input. Shared by every voice routed into it — one bank per band/sting.
 */
export function formantBank(ctx: Ctx, dest: AudioNode, vowel: Vowel = 'a', scale = 1, gain = 1): GainNode {
  const input = gainNode(ctx, 1);
  const [f1, f2, f3] = VOWELS[vowel];
  const bands: ReadonlyArray<readonly [number, number, number]> = [
    [f1, 4.5, 2.6],
    [f2, 6, 1.5],
    [f3, 8, 0.6],
  ];
  for (const [f, q, g] of bands) input.connect(filterNode(ctx, 'bandpass', f * scale, q, gainNode(ctx, g * gain, dest)));
  input.connect(filterNode(ctx, 'lowpass', 700 * scale, 0.7, gainNode(ctx, 0.14 * gain, dest)));
  return input;
}

// ── Melodic note functions (shared with SFX) ────────────────────────────────

/** Music box: a pure comb-tine sine, a short inharmonic tine "tink" and a soft octave shimmer. */
export function musicBoxNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const f = midiToFreq(midi);
  const tc = Math.min(0.42, 0.16 + dur * 0.3);
  const g = gainNode(ctx, 0, dest);
  const end = perc(g.gain, t, vel, 0.002, tc);
  oscNode(ctx, 'sine', f, t, end - t + 0.02, g);
  if (f * 5.4 < 15000) ping(ctx, dest, t, f * 5.4, { peak: vel * 0.13, attack: 0.001, tc: 0.025 });
  ping(ctx, dest, t, f * 2, { peak: vel * 0.12, tc: tc * 0.4 });
  return end;
}

/** Celesta: a soft bell-piano (sine + 2nd and 4th partials that die first). */
export function celestaNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const f = midiToFreq(midi);
  const tc = Math.min(0.4, 0.14 + dur * 0.25);
  const end = ping(ctx, dest, t, f, { peak: vel, attack: 0.003, tc });
  ping(ctx, dest, t, f * 2, { peak: vel * 0.24, attack: 0.002, tc: tc * 0.4 });
  if (f * 4 < 15000) ping(ctx, dest, t, f * 4, { peak: vel * 0.06, attack: 0.001, tc: 0.03 });
  return end;
}

/** FM bell: bright metallic attack that mellows (ratio ≈ 3.5 bell, 1.4 glassy, 2 glock-ish). */
export function bellNote(ctx: Ctx, dest: AudioNode, t: number, freq: number, peak: number, tc: number, ratio = 3.5, index = 2.2): number {
  const g = gainNode(ctx, 0, dest);
  const end = perc(g.gain, t, peak, 0.002, tc);
  const car = oscNode(ctx, 'sine', freq, t, end - t + 0.02, g);
  const mod = oscNode(ctx, 'sine', freq * ratio, t, end - t + 0.02);
  const mg = gainNode(ctx, 0);
  perc(mg.gain, t, freq * index, 0.001, tc * 0.35);
  mod.connect(mg);
  mg.connect(car.frequency);
  return end;
}

/** Glockenspiel note (the band's "bell"). */
export function glockNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const f = midiToFreq(midi);
  const end = bellNote(ctx, dest, t, f, vel, Math.min(0.45, 0.16 + dur * 0.3), 2.0, 1.2);
  ping(ctx, dest, t, f * 2, { peak: vel * 0.2, tc: 0.05 });
  return end;
}

/** Marimba: woody sine body + the tuned 4th partial (≈ ×3.93) that gives the "tok". Lower notes ring longer. */
export function marimbaNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, _dur: number, xylo = false): number {
  const f = midiToFreq(midi);
  const low = clamp01((76 - midi) / 30);
  const tc = xylo ? 0.07 + 0.05 * low : 0.1 + 0.2 * low;
  const end = ping(ctx, dest, t, f, { peak: vel, attack: 0.002, tc });
  ping(ctx, dest, t, f * (xylo ? 3.0 : 3.93), { peak: vel * (xylo ? 0.32 : 0.26), attack: 0.001, tc: tc * 0.28 });
  if (xylo && f * 6 < 14000) ping(ctx, dest, t, f * 6.1, { peak: vel * 0.08, attack: 0.0008, tc: 0.012 });
  return end;
}

/** Kalimba: a thumb-plucked tine — sine with a tiny pitch drop, a short inharmonic tine partial. */
export function kalimbaNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const f = midiToFreq(midi);
  const tc = Math.min(0.38, 0.18 + dur * 0.15);
  const g = gainNode(ctx, 0, dest);
  const end = perc(g.gain, t, vel, 0.003, tc);
  const o = oscNode(ctx, 'sine', f * 1.012, t, end - t + 0.02, g);
  o.frequency.setTargetAtTime(f, t, 0.012);
  if (f * 5.9 < 15000) ping(ctx, dest, t, f * 5.9, { peak: vel * 0.12, attack: 0.001, tc: 0.018 });
  return end;
}

/**
 * FM electric piano: 1:1 modulator for the body, a fast 14:1 "tine" on the attack.
 * `wow` (optional) is a shared LFO node wired to the carrier's detune (lo-fi tape wobble).
 */
export function epianoNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number, wow?: AudioNode): number {
  const f = midiToFreq(midi);
  const g = gainNode(ctx, 0, dest);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.setTargetAtTime(vel * 0.32, t + 0.004, 0.55);
  const off = t + Math.max(0.1, dur);
  g.gain.setTargetAtTime(0, off, 0.09);
  const end = off + 0.55;
  const car = oscNode(ctx, 'sine', f, t, end - t, g);
  const mod = oscNode(ctx, 'sine', f, t, end - t);
  const mg = gainNode(ctx, 0);
  mg.gain.setValueAtTime(f * (0.45 + 0.8 * vel), t);
  mg.gain.setTargetAtTime(f * 0.12, t, 0.3);
  mod.connect(mg);
  mg.connect(car.frequency);
  const tine = oscNode(ctx, 'sine', f * 14, t, 0.12);
  const tg = gainNode(ctx, 0);
  perc(tg.gain, t, f * 0.9 * vel, 0.001, 0.01);
  tine.connect(tg);
  tg.connect(car.frequency);
  if (wow) wow.connect(car.detune);
  return end;
}

/** Round soft synth bass: sine body, a lowpassed triangle for warmth and a quiet 2nd harmonic (audible on phones). */
export function softBassNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const f = midiToFreq(midi);
  const amp = gainNode(ctx, 0, dest);
  const hold = Math.max(0.08, dur * 0.9);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel, t + 0.012);
  amp.gain.setTargetAtTime(vel * 0.7, t + 0.012, 0.25);
  amp.gain.setTargetAtTime(0, t + hold, 0.06);
  const end = t + hold + 0.35;
  oscNode(ctx, 'sine', f, t, end - t, gainNode(ctx, 0.8, amp));
  oscNode(ctx, 'triangle', f, t, end - t, gainNode(ctx, 0.4, filterNode(ctx, 'lowpass', 600, 0.7, amp)));
  oscNode(ctx, 'sine', f * 2, t, end - t, gainNode(ctx, 0.2, amp));
  return end;
}

/** Pizzicato upright bass: KS pluck + a soft sine thump for weight. */
export function pluckBassNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number): number {
  const end = playPluck(ctx, dest, 'bass', t, midi, vel, Math.max(0.1, dur - 0.03) + 0.05);
  const sub = gainNode(ctx, 0, dest);
  perc(sub.gain, t, 0.38 * vel, 0.004, Math.min(0.12, dur * 0.4));
  oscNode(ctx, 'sine', midiToFreq(midi), t, 0.6, sub);
  return end;
}

/** Plucked string note (pizz / uke / harp). `ring` > 0 damps it (staccato). */
export function pluckNote(ctx: Ctx, dest: AudioNode, kind: PluckKind, t: number, midi: number, vel: number, ring = 0): number {
  return playPluck(ctx, dest, kind, t, midi, vel, ring);
}

/** Warm string pad chord: two detuned saws per note, slow attack, soft lowpass. `vib` wires a shared vibrato LFO. */
export function padChord(ctx: Ctx, dest: AudioNode, t: number, midis: readonly number[], vel: number, dur: number, attack = 0.35, vib?: AudioNode): number {
  const lp = filterNode(ctx, 'lowpass', 1100, 0.6, dest);
  const g = gainNode(ctx, 0, lp);
  const rel = t + Math.max(attack + 0.05, dur - 0.05);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setValueAtTime(vel, rel);
  g.gain.setTargetAtTime(0, rel, 0.25);
  const end = rel + 1.4;
  const k = 1 / Math.sqrt(Math.max(1, midis.length));
  for (const m of midis) {
    const f = midiToFreq(m);
    for (const det of [-7, 7]) {
      const o = oscNode(ctx, 'sawtooth', f, t, end - t, gainNode(ctx, 0.2 * k, g));
      o.detune.value = det;
      if (vib) vib.connect(o.detune);
    }
  }
  return end;
}

/**
 * Choir chord: two detuned saws per note into a formant bank input (see formantBank) —
 * a soft "aaah"/"oooh". `vib` wires a shared vibrato LFO node to every voice.
 */
export function choirChord(ctx: Ctx, formantIn: AudioNode, t: number, midis: readonly number[], vel: number, dur: number, attack = 0.25, vib?: AudioNode): number {
  const g = gainNode(ctx, 0, formantIn);
  const rel = t + Math.max(attack + 0.05, dur - 0.05);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.setValueAtTime(vel, rel);
  g.gain.setTargetAtTime(0, rel, 0.2);
  const end = rel + 1.2;
  const k = 1 / Math.sqrt(Math.max(1, midis.length));
  for (const m of midis) {
    const f = midiToFreq(m);
    for (const det of [-9, 10]) {
      const o = oscNode(ctx, 'sawtooth', f, t, end - t, gainNode(ctx, 0.3 * k, g));
      o.detune.value = det;
      if (vib) vib.connect(o.detune);
    }
  }
  return end;
}

/** Soft brass: three detuned saws, a pitch scoop and a gentle filter swell. `stab` = short and punchy. */
export function brassNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number, stab = false): number {
  const f = midiToFreq(midi);
  const amp = gainNode(ctx, 0, dest);
  const lp = filterNode(ctx, 'lowpass', 450, 1.0, filterNode(ctx, 'peaking', 1100, 1.1, amp, 3));
  const attack = stab ? 0.012 : 0.04;
  const hold = Math.max(0.04, stab ? Math.min(0.13, dur * 0.6) : dur * 0.9);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel, t + attack);
  amp.gain.setTargetAtTime(vel * 0.8, t + attack, 0.1);
  amp.gain.setTargetAtTime(0, t + attack + hold, stab ? 0.045 : 0.08);
  const end = t + attack + hold + 0.5;
  lp.frequency.setValueAtTime(420, t);
  lp.frequency.linearRampToValueAtTime(900 + 2200 * vel, t + attack + 0.03);
  lp.frequency.setTargetAtTime(800 + 1100 * vel, t + attack + 0.04, 0.18);
  lp.frequency.setTargetAtTime(450, t + attack + hold, 0.06);
  for (const det of [-8, 0, 9]) {
    const o = oscNode(ctx, 'sawtooth', f, t, end - t, gainNode(ctx, 0.34, lp));
    o.detune.setValueAtTime(det - 40, t);
    o.detune.setTargetAtTime(det, t, 0.025);
  }
  return end;
}

export function brassChord(ctx: Ctx, dest: AudioNode, t: number, midis: readonly number[], vel: number, dur: number, stab = false): number {
  let end = t;
  const v = vel / Math.sqrt(Math.max(1, midis.length));
  for (const m of midis) end = Math.max(end, brassNote(ctx, dest, t, m, v, dur, stab));
  return end;
}

/** Sing-along whistle: sine with a breathy "chiff", optional slide from `glideFrom`, delayed vibrato. */
export function whistleNote(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number, dur: number, glideFrom?: number): number {
  const f = midiToFreq(midi);
  const g = gainNode(ctx, 0, dest);
  const hold = Math.max(0.05, dur * 0.88);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.025);
  g.gain.setTargetAtTime(vel * 0.85, t + 0.025, 0.1);
  g.gain.setTargetAtTime(0, t + hold, 0.04);
  const end = t + hold + 0.2;
  const o = oscNode(ctx, 'sine', f, t, end - t, g);
  if (glideFrom !== undefined && glideFrom !== midi) {
    o.frequency.setValueAtTime(midiToFreq(glideFrom), t);
    o.frequency.setTargetAtTime(f, t, 0.028);
  }
  if (dur > 0.28) {
    const lfo = oscNode(ctx, 'sine', 5.4, t, end - t);
    const depth = gainNode(ctx, 0);
    depth.gain.setValueAtTime(0, t);
    depth.gain.setTargetAtTime(16, t + 0.14, 0.08);
    lfo.connect(depth);
    depth.connect(o.detune);
  }
  noiseBurst(ctx, dest, t, { kind: 'pink', type: 'bandpass', freq: Math.min(9000, f * 2), q: 3, peak: vel * 0.18, attack: 0.004, tc: 0.02 });
  return end;
}

// ── Percussion ─────────────────────────────────────────────────────────────

/** Felt kick: a round pitch-dropping sine and a soft beater touch. */
export function kickHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  const end = thump(ctx, dest, t, 115, 46, 0.2, vel);
  ping(ctx, dest, t, 700, { type: 'triangle', peak: 0.05 * vel, attack: 0.001, tc: 0.005 });
  return end;
}

/** Brush snare: a soft swish of pink noise over a gentle drum body. */
export function snareHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  const end = noiseBurst(ctx, dest, t, { kind: 'pink', type: 'bandpass', freq: 2600, q: 0.6, peak: vel, attack: 0.004, tc: 0.065 }).end;
  thump(ctx, dest, t, 230, 165, 0.09, 0.3 * vel);
  return end;
}

/** Rim / woodblock tick. */
export function rimHit(ctx: Ctx, dest: AudioNode, t: number, vel: number, freq = 1700): number {
  const end = ping(ctx, dest, t, freq, { peak: vel, attack: 0.001, tc: 0.014 });
  noiseBurst(ctx, dest, t, { type: 'bandpass', freq: freq * 2, q: 2, peak: 0.25 * vel, attack: 0.0006, tc: 0.004 });
  return end;
}

export function clapHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  for (let i = 0; i < 3; i++) noiseBurst(ctx, dest, t + i * 0.01, { type: 'bandpass', freq: 1150, q: 1.3, peak: vel * (0.65 + i * 0.12), attack: 0.0008, tc: 0.006 });
  return noiseBurst(ctx, dest, t + 0.03, { kind: 'pink', type: 'bandpass', freq: 1100, q: 0.9, peak: vel * 0.7, tc: 0.045 }).end;
}

export function shakerHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  return noiseBurst(ctx, dest, t, { type: 'highpass', freq: 5200, q: 0.7, peak: vel, attack: 0.012, tc: 0.028 }).end;
}

export function tambHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  const end = noiseBurst(ctx, dest, t, { type: 'highpass', freq: 6200, q: 0.7, peak: vel, attack: 0.002, tc: 0.05 }).end;
  ping(ctx, dest, t, 5300, { peak: 0.22 * vel, attack: 0.001, tc: 0.04 });
  ping(ctx, dest, t + 0.004, 7650, { peak: 0.14 * vel, attack: 0.001, tc: 0.03 });
  return end;
}

export function hatHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  return noiseBurst(ctx, dest, t, { type: 'highpass', freq: 7200, q: 0.7, peak: vel, tc: 0.016 }).end;
}

export function triangleHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  const end = ping(ctx, dest, t, 2900, { peak: vel, attack: 0.001, tc: 0.32 });
  ping(ctx, dest, t, 2900 * 2.76, { peak: vel * 0.3, attack: 0.001, tc: 0.1 });
  return end;
}

export function snapHit(ctx: Ctx, dest: AudioNode, t: number, vel: number): number {
  const end = noiseBurst(ctx, dest, t, { type: 'bandpass', freq: 2300, q: 2.4, peak: vel, attack: 0.0008, tc: 0.012 }).end;
  ping(ctx, dest, t, 1400, { peak: 0.3 * vel, attack: 0.0005, tc: 0.007 });
  return end;
}

/** Timpani: tuned drum with a pitch settle and a soft felt mallet. */
export function timpHit(ctx: Ctx, dest: AudioNode, t: number, midi: number, vel: number): number {
  const f = midiToFreq(midi);
  const g = gainNode(ctx, 0, dest);
  const end = perc(g.gain, t, vel, 0.004, 0.4);
  const o = oscNode(ctx, 'sine', f * 1.05, t, end - t, g);
  o.frequency.setTargetAtTime(f, t, 0.03);
  const o2 = oscNode(ctx, 'sine', f * 1.5, t, end - t, gainNode(ctx, 0.35, g));
  o2.frequency.setTargetAtTime(f * 1.5, t, 0.03);
  noiseBurst(ctx, dest, t, { type: 'lowpass', freq: 600, q: 0.7, peak: 0.35 * vel, tc: 0.03 });
  return end;
}

/** Timpani roll (crescendo of light mallet taps) into a full hit. */
export function timpRoll(ctx: Ctx, dest: AudioNode, t: number, midi: number, len: number, vel: number): number {
  const f = midiToFreq(midi);
  const hits = Math.max(2, Math.floor(len / 0.06));
  for (let i = 0; i < hits; i++) ping(ctx, dest, t + i * 0.06, f * 1.01, { peak: vel * (0.18 + 0.45 * (i / hits)), attack: 0.004, tc: 0.12 });
  return timpHit(ctx, dest, t + len, midi, vel);
}

/** Soft cymbal: a dark noise wash. `swell` = reverse-style swell into the next downbeat. */
export function cymbalHit(ctx: Ctx, dest: AudioNode, t: number, vel: number, swell = false, len = 1): number {
  const g = gainNode(ctx, 0, filterNode(ctx, 'lowpass', 9000, 0.5, dest));
  const hp = filterNode(ctx, 'highpass', 4200, 0.6, g);
  let end: number;
  if (swell) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.3, t + len * 0.6);
    g.gain.linearRampToValueAtTime(vel, t + len);
    g.gain.setTargetAtTime(0, t + len, 0.03);
    end = t + len + 0.2;
  } else end = perc(g.gain, t, vel, 0.003, 0.45);
  noiseNode(ctx, 'white', t, end - t + 0.02, hp);
  return end;
}

// ── The band ───────────────────────────────────────────────────────────────

/** One music track's instruments. Connects to `dest` through `out` (the track fader). */
export class Band {
  readonly out: GainNode;
  private readonly ctx: Ctx;
  private readonly buses = new Map<BandInstrument, AudioNode>();
  /** Oscillators / sources that run for the band's life (LFOs, the vinyl bed). */
  private readonly sources: AudioScheduledSourceNode[] = [];
  private echoIn: GainNode | null = null;
  private echoDelay: DelayNode | null = null;
  private echoFb: GainNode | null = null;
  private vib: GainNode | null = null;
  private wowNode: GainNode | null = null;
  private choirIns = new Map<Vowel, GainNode>();
  private bedGain: GainNode | null = null;
  private bpm: number;

  constructor(ctx: Ctx, dest: AudioNode, bpm: number) {
    this.ctx = ctx;
    this.bpm = bpm;
    this.out = gainNode(ctx, 0, dest);
  }

  /** A long-running LFO (stopped on dispose). */
  private lfo(freq: number, depth: number, dest?: AudioParam): GainNode {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = gainNode(this.ctx, depth);
    o.connect(g);
    if (dest) g.connect(dest);
    o.start();
    this.sources.push(o);
    return g;
  }

  /** Tempo-synced dotted-8th echo (twinkly leads). */
  private echo(): GainNode {
    if (this.echoIn) return this.echoIn;
    const ctx = this.ctx;
    const inp = gainNode(ctx, 1);
    const d = ctx.createDelay(2);
    d.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = gainNode(ctx, 0.28);
    const tone = filterNode(ctx, 'lowpass', 2600, 0.5);
    inp.connect(d);
    d.connect(tone);
    tone.connect(fb);
    fb.connect(d);
    tone.connect(pannerNode(ctx, -0.4, gainNode(ctx, 0.3, this.out)));
    this.echoIn = inp;
    this.echoDelay = d;
    this.echoFb = fb;
    return inp;
  }

  /** The instrument bus (created on first use). */
  bus(name: BandInstrument): AudioNode {
    const hit = this.buses.get(name);
    if (hit) return hit;
    const ctx = this.ctx;
    const pan = pannerNode(ctx, PAN[name], this.out);
    let input: AudioNode;
    if (name === 'epiano') {
      // Bus tremolo: one LFO for every note (cheap) — gently rounded Rhodes wobble.
      const am = gainNode(ctx, 0.88, pan);
      this.lfo(4.2, 0.12, am.gain);
      input = gainNode(ctx, MIX.epiano, filterNode(ctx, 'lowpass', 3200, 0.6, am));
    } else if (name === 'bass') {
      input = gainNode(ctx, MIX.bass, filterNode(ctx, 'highpass', 38, 0.7, pan));
    } else {
      input = gainNode(ctx, MIX[name], pan);
    }
    if (name === 'musicBox' || name === 'whistle' || name === 'kalimba' || name === 'celesta') input.connect(gainNode(ctx, 0.5, this.echo()));
    this.buses.set(name, input);
    return input;
  }

  /** Shared vibrato (≈ ±9 cents at 5 Hz) for pads and the choir. */
  vibrato(): GainNode {
    if (!this.vib) this.vib = this.lfo(5.1, 9);
    return this.vib;
  }

  /** Shared lo-fi "wow" (slow ±5 cent pitch drift) for the e-piano. */
  wow(): GainNode {
    if (!this.wowNode) this.wowNode = this.lfo(0.55, 5);
    return this.wowNode;
  }

  /** Shared choir formant bank per vowel → choir bus. */
  choirIn(vowel: Vowel): GainNode {
    let c = this.choirIns.get(vowel);
    if (!c) {
      c = formantBank(this.ctx, this.bus('choir'), vowel, 1, 1);
      this.choirIns.set(vowel, c);
    }
    return c;
  }

  /** Start / level the vinyl bed (the pre-dawn noise floor). */
  bed(level: number, at: number): void {
    const ctx = this.ctx;
    if (!this.bedGain) {
      this.bedGain = gainNode(ctx, 0, this.bus('bed'));
      const src = ctx.createBufferSource();
      src.buffer = vinylBuffer(ctx);
      src.loop = true;
      src.connect(filterNode(ctx, 'lowpass', 3800, 0.6, this.bedGain));
      src.start(at);
      this.sources.push(src);
    }
    this.bedGain.gain.setTargetAtTime(Math.max(0, level), at, 0.4);
  }

  /** Re-sync the echo when the tempo changes. */
  setTempo(bpm: number, at: number): void {
    this.bpm = bpm;
    if (!this.echoDelay) return;
    const d = this.echoDelay.delayTime;
    holdAt(d, at);
    d.setTargetAtTime((60 / bpm) * 0.75, at, 0.05);
  }

  /** Stop the band's LFOs / bed and detach it (breaks the echo loop so the graph can be collected). */
  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.length = 0;
    try {
      this.out.disconnect();
      this.echoFb?.disconnect();
    } catch {
      /* already gone */
    }
  }
}
