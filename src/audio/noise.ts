// ─────────────────────────────────────────────────────────────────────────────
// Pure sample generators (DOM-free, unit-tested): noise, the cosy-room reverb IR,
// the soft-clip / drive curves and the lo-fi "vinyl" bed. Rendered once per
// AudioContext and cached as AudioBuffers by synth.ts.
// Adapted from ATHLETE MAYHEM's audio/noise.ts (room IR + vinyl bed are new).
// ─────────────────────────────────────────────────────────────────────────────

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Tiny deterministic LCG → floats in [-1, 1). */
export function makeLcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2147483648 - 1;
  };
}

/** Remove DC and peak-normalise in place to `peak`. */
function normalise(out: Float32Array, peak: number): void {
  const n = out.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i]!;
  mean /= Math.max(1, n);
  let pk = 0;
  for (let i = 0; i < n; i++) {
    out[i]! -= mean;
    pk = Math.max(pk, Math.abs(out[i]!));
  }
  if (pk > 1e-9) {
    const k = peak / pk;
    for (let i = 0; i < n; i++) out[i]! *= k;
  }
}

/** Deterministic noise, DC-free, peak-normalised to ~0.95. */
export function makeNoise(kind: NoiseKind, length: number, seed = 1234): Float32Array {
  const out = new Float32Array(length);
  const rnd = makeLcg(seed);
  if (kind === 'white') {
    for (let i = 0; i < length; i++) out[i] = rnd();
  } else if (kind === 'pink') {
    // Paul Kellet's economy pink filter (−3 dB/oct).
    let b0 = 0,
      b1 = 0,
      b2 = 0;
    for (let i = 0; i < length; i++) {
      const w = rnd();
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = b0 + b1 + b2 + w * 0.1848;
    }
  } else {
    // Brown (red) noise: leaky integrated white (−6 dB/oct) — rumbles, engine beds.
    let y = 0;
    for (let i = 0; i < length; i++) {
      y = 0.985 * y + 0.15 * rnd();
      out[i] = y;
    }
  }
  normalise(out, 0.95);
  return out;
}

/**
 * Stereo reverb impulse response: a few early reflections (a cosy room: close walls,
 * soft furnishings) and an exponentially decaying noise tail that darkens quickly
 * (curtains, carpets, blankets). `decay` is T60 in seconds. Energy-normalised.
 */
export function makeReverbIR(sampleRate: number, duration: number, decay: number, seed = 77, predelay = 0.01): [Float32Array, Float32Array] {
  const len = Math.max(1, Math.floor(duration * sampleRate));
  const chans: [Float32Array, Float32Array] = [new Float32Array(len), new Float32Array(len)];
  const pre = Math.min(len - 1, Math.floor(predelay * sampleRate));
  for (let c = 0; c < 2; c++) {
    const ch = chans[c]!;
    const rnd = makeLcg(seed + c * 7919);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sampleRate;
      const env = Math.pow(10, (-3 * t) / decay); // −60 dB at t = decay
      const a = 0.62 - 0.52 * Math.min(1, t / duration); // soft furnishings: the tail darkens fast
      lp += a * (rnd() - lp);
      ch[i] = lp * env;
    }
    // Early reflections: close walls, a little different per side for width.
    const taps = [0.007, 0.013, 0.021, 0.031, 0.044];
    for (let k = 0; k < taps.length; k++) {
      const idx = pre + Math.floor((taps[k]! + (c ? 0.0023 * (k + 1) : 0)) * sampleRate);
      if (idx < len) ch[idx]! += (k % 2 ? -0.35 : 0.4) * Math.pow(0.72, k);
    }
    const fin = Math.min(len - pre, Math.floor(0.002 * sampleRate));
    for (let i = 0; i < fin; i++) ch[pre + i]! *= i / fin;
    const fout = Math.min(len, Math.floor(0.05 * sampleRate));
    for (let i = 0; i < fout; i++) ch[len - 1 - i]! *= i / fout;
  }
  let energy = 0;
  for (const ch of chans) for (let i = 0; i < len; i++) energy += ch[i]! * ch[i]!;
  const k = energy > 0 ? 1 / Math.sqrt(energy / 2) : 0;
  for (const ch of chans) for (let i = 0; i < len; i++) ch[i]! *= k * 0.5;
  return chans;
}

/**
 * Soft-clip transfer curve for a WaveShaperNode fed through a ½ pre-gain: curve
 * index maps input u ∈ [−2, 2]. Linear below `knee`, tanh saturation above it,
 * never exceeding `ceiling` — the hard safety net after the compressor.
 */
export function makeSoftClipCurve(points = 4096, ceiling = 0.93, knee = 0.62): Float32Array {
  const curve = new Float32Array(points);
  const room = ceiling - knee;
  for (let i = 0; i < points; i++) {
    const u = (i / (points - 1)) * 4 - 2;
    const a = Math.abs(u);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(u) * y;
  }
  return curve;
}

/** Symmetric saturating curve for gentle warmth (drive ≥ 0.1). */
export function makeDriveCurve(drive: number, points = 1024): Float32Array {
  const curve = new Float32Array(points);
  const d = Math.max(0.1, drive);
  const norm = Math.tanh(d);
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    curve[i] = Math.tanh(d * x) / norm;
  }
  return curve;
}

/**
 * Lo-fi "vinyl" bed (mono, loops cleanly): a soft, dark hiss plus sparse, tiny,
 * rounded crackles (`crackles` per second). The pre-dawn theme's gentle noise floor —
 * one looping BufferSource instead of per-step scheduling. Peak-normalised to 0.95.
 */
export function makeVinyl(sampleRate: number, seconds: number, crackles = 7, seed = 515): Float32Array {
  const len = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(len);
  const rnd = makeLcg(seed);
  // Hiss: pink-ish noise through a one-pole lowpass (~2.5 kHz), quiet.
  const a = 1 - Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let lp = 0;
  let b0 = 0,
    b1 = 0;
  for (let i = 0; i < len; i++) {
    const w = rnd();
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    lp += a * (b0 + b1 + w * 0.1 - lp);
    out[i] = lp * 0.22;
  }
  // Crackles: short decaying bumps (5–40 samples), rounded by a one-pole.
  const count = Math.max(1, Math.round(seconds * crackles));
  for (let c = 0; c < count; c++) {
    const start = Math.floor(((rnd() + 1) / 2) * len);
    const amp = (0.25 + 0.75 * ((rnd() + 1) / 2)) * (rnd() > 0 ? 1 : -1);
    const decay = 5 + Math.floor(((rnd() + 1) / 2) * 35);
    let y = 0;
    for (let i = 0; i < decay * 4; i++) {
      const x = i < 2 ? amp : 0;
      y += 0.45 * (x - y);
      out[(start + i) % len]! += y * Math.exp(-i / decay);
    }
  }
  normalise(out, 0.95);
  return out;
}
