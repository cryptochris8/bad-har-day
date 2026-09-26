// Pure DSP generators and meters: deterministic noise, the room reverb IR, the soft-clip ceiling,
// the drive curve, the vinyl bed, level meters, and Karplus–Strong plucks (pitch-exact, decaying,
// deterministic). Adapted from ATHLETE MAYHEM's noise-meter tests; vinyl + KS are new.
import { describe, expect, it } from 'vitest';
import { renderPluck } from '../../src/audio/ks';
import { audibleSpan, bandLevels, envelope, fromDb, measureLevels, toDb } from '../../src/audio/meter';
import { makeDriveCurve, makeLcg, makeNoise, makeReverbIR, makeSoftClipCurve, makeVinyl } from '../../src/audio/noise';
import { foldToRange, PLUCK_RANGE, pluckParams, WARM_LIST } from '../../src/audio/plucks';
import { midiToFreq } from '../../src/audio/theory';

const SR = 44100;

function sine(freq: number, seconds: number, amp = 1): Float32Array {
  const n = Math.floor(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR);
  return out;
}

const rms = (a: Float32Array, from = 0, to = a.length): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! ** 2;
  return Math.sqrt(s / Math.max(1, to - from));
};

const diffEnergy = (a: Float32Array): number => {
  let s = 0;
  let e = 0;
  for (let i = 1; i < a.length; i++) {
    s += (a[i]! - a[i - 1]!) ** 2;
    e += a[i]! ** 2;
  }
  return s / e;
};

describe('generators', () => {
  it('LCG is deterministic and in [-1, 1)', () => {
    const a = makeLcg(5);
    const b = makeLcg(5);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThan(1);
    }
  });

  it('noise is finite, DC-free and normalised; white > pink > brown in HF content', () => {
    for (const kind of ['white', 'pink', 'brown'] as const) {
      const n = makeNoise(kind, SR);
      let peak = 0;
      let mean = 0;
      for (const v of n) {
        expect(Number.isFinite(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
        mean += v;
      }
      expect(peak).toBeCloseTo(0.95, 5);
      expect(Math.abs(mean / n.length)).toBeLessThan(1e-4);
    }
    expect(diffEnergy(makeNoise('white', SR))).toBeGreaterThan(diffEnergy(makeNoise('pink', SR)));
    expect(diffEnergy(makeNoise('pink', SR))).toBeGreaterThan(diffEnergy(makeNoise('brown', SR)));
  });

  it('room reverb IR: stereo, finite, decorrelated, decaying, with a predelay', () => {
    const [l, r] = makeReverbIR(SR, 1.4, 1.1, 77, 0.012);
    expect(l.length).toBe(Math.floor(1.4 * SR));
    for (let i = 0; i < Math.floor(0.012 * SR) - 1; i++) expect(l[i]).toBe(0);
    expect(rms(l, Math.floor(0.05 * SR), Math.floor(0.15 * SR))).toBeGreaterThan(rms(l, Math.floor(0.9 * SR), Math.floor(1.0 * SR)) * 10);
    let same = 0;
    for (let i = 0; i < l.length; i++) if (l[i] === r[i]) same++;
    expect(same / l.length).toBeLessThan(0.05);
    for (const v of l) expect(Number.isFinite(v)).toBe(true);
  });

  it('soft clip: linear below the knee, monotonic, never above the ceiling (the no-clip guarantee)', () => {
    const c = makeSoftClipCurve(4096, 0.93, 0.62);
    let max = 0;
    for (let i = 1; i < c.length; i++) {
      expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
      max = Math.max(max, Math.abs(c[i]!));
    }
    expect(max).toBeLessThanOrEqual(0.93);
    // Input u = 0.3 (well below the knee) passes unchanged.
    const idx = Math.round(((0.3 + 2) / 4) * (c.length - 1));
    expect(c[idx]!).toBeCloseTo(0.3, 2);
  });

  it('drive curve is odd-symmetric and bounded', () => {
    const d = makeDriveCurve(3);
    expect(d[0]).toBeCloseTo(-1, 6);
    expect(d[d.length - 1]).toBeCloseTo(1, 6);
    for (let i = 0; i < d.length; i++) expect(d[i]!).toBeCloseTo(-d[d.length - 1 - i]!, 5);
  });

  it('vinyl bed: finite, normalised, a quiet hiss with sparse crackles, deterministic', () => {
    const v = makeVinyl(SR, 2, 7, 1);
    expect(v).toEqual(makeVinyl(SR, 2, 7, 1));
    let peak = 0;
    for (const x of v) {
      expect(Number.isFinite(x)).toBe(true);
      peak = Math.max(peak, Math.abs(x));
    }
    expect(peak).toBeCloseTo(0.95, 5);
    // Crest factor: crackles stand well above a soft hiss.
    expect(peak / rms(v)).toBeGreaterThan(4);
  });
});

describe('meters', () => {
  it('peak / RMS of a full-scale sine; silence is -inf; NaNs are counted', () => {
    const r = measureLevels([sine(440, 1)], SR);
    expect(r.peakDb).toBeCloseTo(0, 1);
    expect(r.rmsDb).toBeCloseTo(-3.01, 1);
    expect(r.nonFinite).toBe(0);
    const s = measureLevels([new Float32Array(SR)], SR);
    expect(s.peakDb).toBe(-Infinity);
    const bad = new Float32Array(100);
    bad[5] = NaN;
    expect(measureLevels([bad], SR).nonFinite).toBe(1);
    expect(toDb(fromDb(-6))).toBeCloseTo(-6, 9);
  });

  it('audible span, envelope and band split', () => {
    const a = new Float32Array(SR);
    a.set(sine(1000, 0.2), Math.floor(0.3 * SR));
    const span = audibleSpan([a], SR);
    expect(span.start).toBeCloseTo(0.3, 1);
    expect(span.end).toBeCloseTo(0.5, 1);
    const env = envelope([a], 10);
    expect(env[0]).toBe(0);
    expect(env[3]!).toBeGreaterThan(0.9);
    const low = bandLevels(sine(100, 0.5), SR);
    expect(low.lowDb).toBeGreaterThan(low.highDb + 20);
    const high = bandLevels(sine(6000, 0.5), SR);
    expect(high.highDb).toBeGreaterThan(high.lowDb + 20);
  });
});

describe('Karplus–Strong plucks', () => {
  it('pitch-exact: natural frequency × rate = the requested frequency; measured pitch matches', () => {
    for (const midi of [40, 57, 69, 81]) {
      const f = midiToFreq(midi);
      const r = renderPluck({ freq: f, duration: 0.5, brightness: 0.5, decay: 1, pickPos: 0.2, damping: 0.4, seed: 3 }, SR);
      expect(r.naturalFreq * r.rate).toBeCloseTo(f, 6);
      expect(r.rate).toBeGreaterThan(0.9);
      expect(r.rate).toBeLessThan(1.1);
      // Autocorrelation peak near the natural period.
      const period = SR / r.naturalFreq;
      const lagAt = (lag: number): number => {
        let s = 0;
        for (let i = 2000; i < 6000; i++) s += r.data[i]! * r.data[i + lag]!;
        return s;
      };
      const p = Math.round(period);
      expect(lagAt(p)).toBeGreaterThan(lagAt(Math.round(p * 1.5)));
    }
  });

  it('decays, is normalised and deterministic', () => {
    const params = pluckParams('uke', 64);
    const a = renderPluck(params, SR);
    const b = renderPluck(params, SR);
    expect(a.data).toEqual(b.data);
    let peak = 0;
    for (const v of a.data) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeCloseTo(0.98, 5);
    expect(rms(a.data, 0, 4000)).toBeGreaterThan(rms(a.data, a.data.length - 8000, a.data.length - 4000) * 4);
  });

  it('instrument ranges fold notes by octaves; the warm list covers every range', () => {
    for (const kind of ['bass', 'pizz', 'uke', 'harp'] as const) {
      const [lo, hi] = PLUCK_RANGE[kind];
      expect(foldToRange(kind, lo - 12)).toBe(lo);
      expect(foldToRange(kind, hi + 12)).toBe(hi);
      expect(foldToRange(kind, lo + 3)).toBe(lo + 3);
      expect(WARM_LIST.filter(([k]) => k === kind).length).toBe(hi - lo + 1);
    }
  });
});
