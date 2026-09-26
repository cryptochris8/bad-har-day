// ─────────────────────────────────────────────────────────────────────────────
// Mixer graph, shared by the live engine and the offline QA harness:
//
//   music ─► musicDuck ─► musicPause ─┬─────────────────────────► master ─► comp ─► trim ─► ½ ─► soft clip ─► out
//                                     └► musicSend ─► room reverb ─┘  ▲
//   ui ───────────────────────────────────────────► sfx ─┬───────────┤
//   game (one-shots) ─► gamePause ────────────────► sfx  ├► sfxSend ─► room reverb
//   loops ────────────► loopPause ────────────────► sfx  │
//   voice (babble) ───► voicePause ───────────────► sfx ─┘
//   wet (per-sound reverb sends) ─► room reverb
//
// • master = master volume × mute. ui/game/loops/voice follow the SFX volume, music the music volume.
// • Pause: music drops to PAUSE_MUSIC, gameplay one-shots / loops / voices fade out (UI stays).
// • musicDuck dips under stingers and duck() calls (act cards, cutscene lines).
// • The compressor is the master limiter (glues + catches peaks); the soft clipper after
//   it is a hard ceiling (≈ −0.6 dBFS) so nothing can ever clip, whatever stacks up.
// Adapted from ATHLETE MAYHEM's mixer.ts (new: ui/game/loop/voice buses, a warm room
// reverb instead of the stadium bowl + PA echo).
// ─────────────────────────────────────────────────────────────────────────────
import { type Ctx, filterNode, gainNode, holdAt, reverbBuffer, softClipCurve } from './synth';

export interface Mixer {
  ctx: Ctx;
  /** Master volume × mute. */
  master: GainNode;
  /** Music volume. */
  music: GainNode;
  /** Momentary ducks (stingers, duck()). */
  musicDuck: GainNode;
  /** Pause level for the music. */
  musicPause: GainNode;
  /** SFX volume (everything that isn't music). */
  sfx: GainNode;
  /** UI one-shots (never paused). */
  ui: GainNode;
  /** Gameplay one-shots input. */
  game: GainNode;
  /** Pause gate for gameplay one-shots. */
  gamePause: GainNode;
  /** Continuous loops input. */
  loops: GainNode;
  loopPause: GainNode;
  /** Babble voices input. */
  voice: GainNode;
  voicePause: GainNode;
  /** Room reverb input (extra per-sound sends). */
  wet: GainNode;
  compressor: DynamicsCompressorNode;
  /** The final node (soft clipper) — tap here for metering. */
  out: WaveShaperNode;
}

/** Fixed mix trims (tuned with the offline QA meter). */
export const MIX_TRIM = {
  music: 0.55,
  musicReverb: 0.12,
  sfxReverb: 0.07,
  loops: 0.9,
  voice: 0.55,
  /** Post-compressor trim (the compressor adds automatic makeup gain). */
  output: 0.8,
} as const;

/** Music level while paused (the pause menu keeps the music, quieter). */
export const PAUSE_MUSIC = 0.35;

/** Hold a param where it is, dip it by `amount` at `at`, and let it recover over ~`seconds`. */
export function duckParam(g: AudioParam, base: number, amount: number, seconds: number, at: number): void {
  holdAt(g, at);
  g.setTargetAtTime(base * (1 - amount), at, 0.03);
  g.setTargetAtTime(base, at + seconds * 0.6, Math.max(0.05, seconds * 0.2));
}

export function buildMixer(ctx: Ctx, destination: AudioNode = ctx.destination): Mixer {
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve(ctx);
  clip.oversample = 'none';
  clip.connect(destination);
  const half = gainNode(ctx, 0.5, clip);
  const trim = gainNode(ctx, MIX_TRIM.output, half);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 8;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.22;
  comp.connect(trim);
  const master = gainNode(ctx, 1, comp);

  // Warm room: the return is band-limited so the tail is soft and never muddy or fizzy.
  const reverb = ctx.createConvolver();
  reverb.normalize = false;
  reverb.buffer = reverbBuffer(ctx);
  reverb.connect(filterNode(ctx, 'highpass', 200, 0.6, filterNode(ctx, 'lowpass', 5500, 0.6, master)));
  const wet = gainNode(ctx, 1, reverb);

  const music = gainNode(ctx, MIX_TRIM.music);
  const musicDuck = gainNode(ctx, 1);
  const musicPause = gainNode(ctx, 1, master);
  music.connect(musicDuck);
  musicDuck.connect(musicPause);
  musicPause.connect(gainNode(ctx, MIX_TRIM.musicReverb, reverb));

  const sfx = gainNode(ctx, 1, master);
  sfx.connect(gainNode(ctx, MIX_TRIM.sfxReverb, reverb));
  const ui = gainNode(ctx, 1, sfx);
  const gamePause = gainNode(ctx, 1, sfx);
  const game = gainNode(ctx, 1, gamePause);
  const loopPause = gainNode(ctx, MIX_TRIM.loops, sfx);
  const loops = gainNode(ctx, 1, loopPause);
  const voicePause = gainNode(ctx, MIX_TRIM.voice, sfx);
  const voice = gainNode(ctx, 1, voicePause);

  return { ctx, master, music, musicDuck, musicPause, sfx, ui, game, gamePause, loops, loopPause, voice, voicePause, wet, compressor: comp, out: clip };
}
