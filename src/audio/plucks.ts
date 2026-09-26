// ─────────────────────────────────────────────────────────────────────────────
// Pluck bank: lazily renders & caches Karplus–Strong notes as AudioBuffers, per
// AudioContext and per instrument. warmPlucks() pre-renders in small timer batches
// so unlocking audio never janks a frame. Adapted from TRASH PANDA TROUBLE's plucks.ts.
//
//   bass — round pizzicato upright bass (walking lines, bouncy roots)
//   pizz — pizzicato strings (the bustling morning ostinato, sneaky boss bits)
//   uke  — a soft nylon ukulele (the school-run strums, brushing arps)
//   harp — a longer, rounder harp-ish pluck (glissandi, sparkly arps)
// ─────────────────────────────────────────────────────────────────────────────
import { renderPluck, type PluckParams } from './ks';
import { type Ctx, gainNode, monoBuffer } from './synth';
import { BASS_HIGH, BASS_LOW, midiToFreq } from './theory';

export type PluckKind = 'bass' | 'pizz' | 'uke' | 'harp';

export interface Pluck {
  buffer: AudioBuffer;
  /** playbackRate that lands exactly on the requested pitch. */
  rate: number;
}

/** Playable range per instrument (MIDI, inclusive). Notes outside are octave-folded. */
export const PLUCK_RANGE: Readonly<Record<PluckKind, readonly [number, number]>> = {
  bass: [BASS_LOW, BASS_HIGH],
  pizz: [48, 89],
  uke: [55, 84],
  harp: [55, 96],
};

/** Fold a note into an instrument's range by octaves. */
export function foldToRange(kind: PluckKind, midi: number): number {
  const [lo, hi] = PLUCK_RANGE[kind];
  let m = Math.round(midi);
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
}

/** Timbre recipes. */
export function pluckParams(kind: PluckKind, midi: number): PluckParams {
  const freq = midiToFreq(midi);
  switch (kind) {
    case 'bass':
      return { freq, duration: 1.3, brightness: 0.3, decay: 1.5, pickPos: 0.27, damping: 0.85, seed: midi * 71 + 3 };
    case 'pizz':
      // Plucked mid-string with the flesh of the finger — soft attack, short ring.
      return { freq, duration: 0.7, brightness: 0.55, decay: Math.max(0.35, 0.8 - (midi - 60) * 0.015), pickPos: 0.21, damping: 0.45, seed: midi * 37 + 5 };
    case 'uke':
      // Nylon strings: warm, a little woody, medium ring.
      return { freq, duration: 1.2, brightness: 0.5, decay: 1.1, pickPos: 0.17, damping: 0.55, seed: midi * 53 + 11 };
    case 'harp':
      return { freq, duration: 1.5, brightness: 0.45, decay: 1.6, pickPos: 0.3, damping: 0.4, seed: midi * 29 + 17 };
  }
}

const banks = new WeakMap<Ctx, Map<string, Pluck>>();

export function getPluck(ctx: Ctx, kind: PluckKind, midi: number): Pluck {
  let bank = banks.get(ctx);
  if (!bank) {
    bank = new Map();
    banks.set(ctx, bank);
  }
  const m = foldToRange(kind, midi);
  const key = kind + m;
  let p = bank.get(key);
  if (!p) {
    const r = renderPluck(pluckParams(kind, m), ctx.sampleRate);
    p = { buffer: monoBuffer(ctx, r.data), rate: r.rate };
    bank.set(key, p);
  }
  return p;
}

/** Every note in every range, so warmPlucks() can pre-render them. */
export const WARM_LIST: ReadonlyArray<readonly [PluckKind, number]> = (['pizz', 'uke', 'bass', 'harp'] as const).flatMap((kind) => {
  const [lo, hi] = PLUCK_RANGE[kind];
  return Array.from({ length: hi - lo + 1 }, (_, i) => [kind, lo + i] as const);
});

/** Pre-render the warm list a few notes per macrotask. Returns a cancel function. */
export function warmPlucks(ctx: Ctx, perTick = 2): () => void {
  let i = 0;
  let cancelled = false;
  const tick = (): void => {
    if (cancelled) return;
    try {
      for (let k = 0; k < perTick && i < WARM_LIST.length; k++, i++) {
        const [kind, midi] = WARM_LIST[i]!;
        getPluck(ctx, kind, midi);
      }
    } catch {
      return; // a dead context: stop warming
    }
    if (i < WARM_LIST.length) setTimeout(tick, 16);
  };
  setTimeout(tick, 0);
  return () => {
    cancelled = true;
  };
}

/** Play a cached pluck at `t`. `ring` > 0 damps it after that many seconds. Returns the end time. */
export function playPluck(ctx: Ctx, dest: AudioNode, kind: PluckKind, t: number, midi: number, vel: number, ring = 0): number {
  const p = getPluck(ctx, kind, midi);
  const src = ctx.createBufferSource();
  src.buffer = p.buffer;
  src.playbackRate.value = p.rate;
  const g = gainNode(ctx, vel, dest);
  src.connect(g);
  src.start(t);
  let end = t + p.buffer.duration / p.rate + 0.01;
  if (ring > 0) {
    g.gain.setValueAtTime(vel, t);
    g.gain.setTargetAtTime(0, t + ring, 0.035);
    end = Math.min(end, t + ring + 0.22);
  }
  src.stop(end);
  return end;
}
