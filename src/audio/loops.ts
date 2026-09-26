// ─────────────────────────────────────────────────────────────────────────────
// Continuous sounds with live parameters (LoopId): each recipe builds a small,
// persistent graph (a looping noise buffer or two, a few filters, maybe an LFO) and
// maps set(volume, pitch) onto it with smoothed params — safe to call every frame.
// Sparse random events (coffee bubbles, rain drops) are scheduled by pump() from the
// engine's scheduler tick, a few per second at most.
//
//   brew        coffee-maker gurgle: warm hum + steam hiss + bubbling pops (pitch = bubble rate/pitch)
//   water       running tap: a soft band of pink noise with a gentle flutter (pitch = brightness)
//   engine      a cartoon car engine: two detuned low saws, rumble + a phone-audible harmonic (pitch = rpm)
//   rain        a soft wash with scattered drops on the window (pitch = heaviness)
//   brushing    the bristle bed under continuous brushing (volume = stroke speed, pitch = brightness)
//   pourStream  a pouring stream whose resonance rises as the cup fills (pitch = fill)
//
// LoopVoice is the handle the engine gives out: it remembers its parameters, so a loop
// requested before unlock (or across a rebuilt AudioContext) starts with the right values.
// ─────────────────────────────────────────────────────────────────────────────
import { type Ctx, filterNode, gainNode, noiseBurst, noiseNode, oscNode, perc, ping, smoothSet } from './synth';
import type { LoopHandle, LoopId } from './types';

export interface LoopSynth {
  /** Apply volume (0..1) and pitch (> 0) at context time `now`. */
  set(volume: number, pitch: number, now: number): void;
  /** Schedule sparse random events up to `until`. */
  pump(until: number, now: number): void;
  /** Fade out over `fade` seconds from `now`, then stop every source. */
  stop(now: number, fade: number): void;
}

export interface LoopMeta {
  /** Output level. */
  level: number;
  /** Fade-in on start (s). */
  fadeIn: number;
}

export const LOOP_META: Readonly<Record<LoopId, LoopMeta>> = {
  brew: { level: 0.42, fadeIn: 0.3 },
  water: { level: 0.42, fadeIn: 0.08 },
  engine: { level: 0.22, fadeIn: 0.25 },
  rain: { level: 0.4, fadeIn: 1.0 },
  brushing: { level: 0.45, fadeIn: 0.03 },
  pourStream: { level: 0.42, fadeIn: 0.05 },
};

const clampVol = (v: number): number => (Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : 0);
const clampPitch = (p: number | undefined): number => (p !== undefined && Number.isFinite(p) && p > 0 ? Math.min(4, Math.max(0.25, p)) : 1);

type Builder = (ctx: Ctx, out: GainNode, t: number) => { apply(v: number, p: number, now: number): void; pump?(until: number, now: number): void; sources: AudioScheduledSourceNode[] };

/** A long-running LFO feeding `param` (returned so the loop can stop it). */
function lfo(ctx: Ctx, freq: number, depth: number, param: AudioParam, t: number, type: OscillatorType = 'sine'): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = gainNode(ctx, depth);
  o.connect(g);
  g.connect(param);
  o.start(t);
  return o;
}

const BUILDERS: Record<LoopId, Builder> = {
  brew: (ctx, out, t) => {
    const hum = gainNode(ctx, 0.5, out);
    const humSrc = noiseNode(ctx, 'brown', t, Infinity, filterNode(ctx, 'bandpass', 320, 0.8, hum));
    const hiss = gainNode(ctx, 0.05, out);
    const hissSrc = noiseNode(ctx, 'pink', t, Infinity, filterNode(ctx, 'highpass', 3200, 0.6, hiss));
    let pitch = 1;
    let next = t + 0.1;
    return {
      sources: [humSrc, hissSrc],
      apply(_v, p) {
        pitch = p;
      },
      pump(until) {
        // Bubbles: ~7 per second at pitch 1, rarer and lower when pitch drops.
        while (next < until) {
          const f = (260 + Math.random() * 480) * pitch;
          const g = gainNode(ctx, 0, out);
          perc(g.gain, next, 0.15 + Math.random() * 0.2, 0.002, 0.02);
          const o = oscNode(ctx, 'sine', f, next, 0.2, g);
          o.frequency.setValueAtTime(f, next);
          o.frequency.exponentialRampToValueAtTime(f * 1.8, next + 0.04);
          if (Math.random() < 0.15) noiseBurst(ctx, out, next, { kind: 'pink', type: 'lowpass', freq: 600, q: 0.8, peak: 0.25, attack: 0.01, tc: 0.05 });
          next += (0.06 + Math.random() * 0.16) / Math.max(0.3, pitch);
        }
      },
    };
  },
  water: (ctx, out, t) => {
    const am = gainNode(ctx, 0.85, out);
    const bp = filterNode(ctx, 'bandpass', 1500, 0.7, am);
    const src = noiseNode(ctx, 'pink', t, Infinity, bp);
    const splash = gainNode(ctx, 0.12, am);
    const src2 = noiseNode(ctx, 'white', t, Infinity, filterNode(ctx, 'highpass', 4200, 0.6, filterNode(ctx, 'lowpass', 8000, 0.6, splash)));
    const flutter = lfo(ctx, 11, 0.15, am.gain, t);
    return {
      sources: [src, src2, flutter],
      apply(_v, p, now) {
        smoothSet(bp.frequency, 1500 * p, now, 0.05);
      },
    };
  },
  engine: (ctx, out, t) => {
    const lp = filterNode(ctx, 'lowpass', 260, 1.4, out);
    const oscs = [oscNode(ctx, 'sawtooth', 42, t, 1e6, gainNode(ctx, 0.35, lp)), oscNode(ctx, 'sawtooth', 42.7, t, 1e6, gainNode(ctx, 0.35, lp))];
    const harm = oscNode(ctx, 'triangle', 84, t, 1e6, gainNode(ctx, 0.12, filterNode(ctx, 'lowpass', 500, 0.7, out)));
    const rumble = gainNode(ctx, 0.3, out);
    const src = noiseNode(ctx, 'brown', t, Infinity, filterNode(ctx, 'lowpass', 180, 0.7, rumble));
    return {
      sources: [...oscs, harm, src],
      apply(_v, p, now) {
        smoothSet(oscs[0]!.frequency, 42 * p, now, 0.08);
        smoothSet(oscs[1]!.frequency, 42.7 * p, now, 0.08);
        smoothSet(harm.frequency, 84 * p, now, 0.08);
        smoothSet(lp.frequency, 220 + 160 * p, now, 0.08);
      },
    };
  },
  rain: (ctx, out, t) => {
    const wash = gainNode(ctx, 0.5, out);
    const lp = filterNode(ctx, 'lowpass', 4500, 0.5, wash);
    const src = noiseNode(ctx, 'pink', t, Infinity, filterNode(ctx, 'highpass', 400, 0.6, lp));
    let pitch = 1;
    let next = t + 0.05;
    return {
      sources: [src],
      apply(_v, p, now) {
        pitch = p;
        smoothSet(lp.frequency, 3000 + 1800 * p, now, 0.2);
      },
      pump(until) {
        // Drops on the window: soft plinks and ticks, ~10 per second at pitch 1.
        while (next < until) {
          if (Math.random() < 0.55) ping(ctx, out, next, 1500 + Math.random() * 2500, { peak: 0.03 + Math.random() * 0.05, attack: 0.001, tc: 0.012 });
          else noiseBurst(ctx, out, next, { type: 'highpass', freq: 3000, q: 0.7, peak: 0.05, attack: 0.0005, tc: 0.003 });
          next += (0.04 + Math.random() * 0.14) / Math.max(0.3, pitch);
        }
      },
    };
  },
  brushing: (ctx, out, t) => {
    const am = gainNode(ctx, 0.72, filterNode(ctx, 'lowpass', 7000, 0.5, out));
    const bp = filterNode(ctx, 'bandpass', 2600, 0.7, am);
    const src = noiseNode(ctx, 'pink', t, Infinity, filterNode(ctx, 'highpass', 900, 0.6, bp));
    const bristles = lfo(ctx, 82, 0.28, am.gain, t, 'triangle');
    const drift = lfo(ctx, 2.7, 280, bp.frequency, t);
    return {
      sources: [src, bristles, drift],
      apply(v, p, now) {
        smoothSet(bp.frequency, 2600 * p * (0.9 + 0.2 * Math.min(1, v)), now, 0.04);
      },
    };
  },
  pourStream: (ctx, out, t) => {
    const am = gainNode(ctx, 0.7, out);
    const bp = filterNode(ctx, 'bandpass', 700, 5, am);
    const src = noiseNode(ctx, 'white', t, Infinity, bp);
    const splash = gainNode(ctx, 0.3, out);
    const src2 = noiseNode(ctx, 'pink', t, Infinity, filterNode(ctx, 'lowpass', 900, 0.7, splash));
    const gurgle = lfo(ctx, 16, 0.3, am.gain, t);
    const wobble = lfo(ctx, 3.3, 110, bp.frequency, t);
    return {
      sources: [src, src2, gurgle, wobble],
      apply(_v, p, now) {
        smoothSet(bp.frequency, 700 * p, now, 0.06);
      },
    };
  },
};

/** Build a loop's synth into `dest`, faded in from `t`. */
export function startLoop(ctx: Ctx, dest: AudioNode, id: LoopId, t: number, volume: number, pitch: number): LoopSynth {
  const meta = LOOP_META[id];
  const master = gainNode(ctx, 0, dest);
  const inner = gainNode(ctx, 1, master);
  const b = BUILDERS[id](ctx, inner, t);
  const level = (v: number): number => meta.level * clampVol(v);
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(level(volume), t + meta.fadeIn);
  b.apply(clampVol(volume), clampPitch(pitch), t);
  let stopped = false;
  return {
    set(v, p, now) {
      if (stopped) return;
      smoothSet(master.gain, level(v), now, id === 'brushing' ? 0.03 : 0.06);
      b.apply(clampVol(v), clampPitch(p), now);
    },
    pump(until, now) {
      if (stopped || !b.pump) return;
      b.pump(Math.max(until, now), now);
    },
    stop(now, fade) {
      if (stopped) return;
      stopped = true;
      smoothSet(master.gain, 0, now, Math.max(0.01, fade / 4));
      const end = now + Math.max(0.02, fade) + 0.05;
      for (const s of b.sources) {
        try {
          s.stop(end);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

/**
 * The public LoopHandle. Remembers volume/pitch; attaches to a live context when one is
 * available (engine unlock / rebuild) and detaches when it is torn down.
 */
export class LoopVoice implements LoopHandle {
  volume = 1;
  pitch = 1;
  stopped = false;
  private synth: LoopSynth | null = null;
  private ctx: Ctx | null = null;

  constructor(
    readonly id: LoopId,
    private readonly onStop: (v: LoopVoice) => void,
  ) {}

  get attached(): boolean {
    return this.synth !== null;
  }

  set(volume: number, pitch?: number): void {
    if (this.stopped) return;
    this.volume = clampVol(volume);
    if (pitch !== undefined) this.pitch = clampPitch(pitch);
    try {
      if (this.synth && this.ctx) this.synth.set(this.volume, this.pitch, this.ctx.currentTime);
    } catch {
      /* audio is optional */
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    try {
      if (this.synth && this.ctx) this.synth.stop(this.ctx.currentTime, 0.12);
    } catch {
      /* audio is optional */
    }
    this.synth = null;
    this.ctx = null;
    this.onStop(this);
  }

  /** Start sounding on a live context (no-op when stopped or already attached). */
  attach(ctx: Ctx, dest: AudioNode, t: number): void {
    if (this.stopped || this.synth) return;
    this.ctx = ctx;
    this.synth = startLoop(ctx, dest, this.id, t, this.volume, this.pitch);
  }

  /** The context went away (its nodes die with it). */
  detach(): void {
    this.synth = null;
    this.ctx = null;
  }

  pump(until: number, now: number): void {
    this.synth?.pump(until, now);
  }
}
