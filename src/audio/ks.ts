// ─────────────────────────────────────────────────────────────────────────────
// Karplus–Strong plucked-string synthesis (pure, DOM-free, unit-tested).
// Copied from TRASH PANDA TROUBLE's ks.ts.
//
// A noise burst circulates in a delay line of one period; a gentle lowpass in the
// loop makes high partials die faster than low ones — exactly how a real string
// behaves. Whole notes are rendered into Float32Arrays once and cached as
// AudioBuffers (plucks.ts), so playback costs one BufferSource per note.
//
// Tuning: the loop filter adds a fractional delay, so the natural period is
// N + filterDelay samples. Instead of a fractional-delay allpass we return the
// playbackRate that corrects the pitch exactly.
// ─────────────────────────────────────────────────────────────────────────────
import { makeLcg } from './noise';

export interface PluckParams {
  /** Target fundamental (Hz). */
  freq: number;
  /** Rendered length (s). A short fade-out is applied at the end. */
  duration: number;
  /** 0..1 excitation brightness (1 = raw white noise, lower = softer, rounder pluck). */
  brightness: number;
  /** Approximate T60 (s): time for the fundamental to decay by 60 dB. */
  decay: number;
  /** 0..0.5 pluck position along the string (comb filter). 0 disables. */
  pickPos: number;
  /** 0..1 extra loop damping: 0 = 2-tap average (bright), 1 = 3-tap (dark, fast HF decay). */
  damping: number;
  /** Seed for the deterministic excitation noise. */
  seed?: number;
}

export interface PluckResult {
  data: Float32Array;
  /** Multiply the playback rate by this to land exactly on `freq`. */
  rate: number;
  /** The natural fundamental of the rendered data (Hz) before rate correction. */
  naturalFreq: number;
}

/** Render a plucked note. Output peak is normalised to ~0.98. */
export function renderPluck(p: PluckParams, sampleRate: number): PluckResult {
  const w = Math.min(1, Math.max(0, p.damping));
  // Loop filter group delay: 2-tap average = 0.5, 3-tap [¼ ½ ¼] = 1.0 samples.
  const filterDelay = 0.5 + 0.5 * w;
  const ideal = sampleRate / p.freq;
  const N = Math.max(2, Math.floor(ideal - filterDelay));
  const period = N + filterDelay;
  const naturalFreq = sampleRate / period;

  const total = Math.max(N + 8, Math.floor(p.duration * sampleRate));
  const out = new Float32Array(total);

  // ── Excitation: one period of lowpassed, DC-free noise, optionally comb-filtered. ──
  const rnd = makeLcg(p.seed ?? Math.round(p.freq * 1000));
  const exc = new Float32Array(N);
  const a = Math.min(1, Math.max(0.02, p.brightness));
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < N; i++) {
    lp += a * (rnd() - lp);
    exc[i] = lp;
    mean += lp;
  }
  mean /= N;
  for (let i = 0; i < N; i++) exc[i]! -= mean;
  const pick = Math.floor(Math.min(0.5, Math.max(0, p.pickPos)) * N);
  if (pick > 0) {
    // Plucking at a fraction of the string length removes harmonics with a node there.
    const tmp = exc.slice();
    for (let i = 0; i < N; i++) exc[i] = tmp[i]! - tmp[(i - pick + N) % N]!;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(exc[i]!));
  const norm = peak > 1e-9 ? 1 / peak : 0;
  for (let i = 0; i < N; i++) out[i] = exc[i]! * norm;

  // ── Loop: y[n] = g · filter(y[n−N], y[n−N−1], y[n−N−2]). ──
  // Per-period gain so the fundamental reaches −60 dB after `decay` seconds.
  const g = Math.pow(10, -3 / Math.max(0.01, p.decay * p.freq));
  const c0 = 0.5 * (1 - w) + 0.25 * w;
  const c1 = 0.5 * (1 - w) + 0.5 * w;
  const c2 = 0.25 * w;
  for (let n = N; n < total; n++) {
    const y0 = out[n - N]!;
    const y1 = n - N - 1 >= 0 ? out[n - N - 1]! : 0;
    const y2 = n - N - 2 >= 0 ? out[n - N - 2]! : 0;
    out[n] = g * (c0 * y0 + c1 * y1 + c2 * y2);
  }

  // Fade the tail so a buffer that is cut off never clicks.
  const fade = Math.min(total - N, Math.floor(0.03 * sampleRate));
  for (let i = 0; i < fade; i++) out[total - 1 - i]! *= i / fade;

  // Normalise the whole note (the comb/loop can change the peak slightly).
  let pk = 0;
  for (let i = 0; i < total; i++) pk = Math.max(pk, Math.abs(out[i]!));
  if (pk > 1e-9) {
    const k = 0.98 / pk;
    for (let i = 0; i < total; i++) out[i]! *= k;
  }

  return { data: out, rate: p.freq / naturalFreq, naturalFreq };
}
