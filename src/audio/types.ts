// ─────────────────────────────────────────────────────────────────────────────
// AUDIO CONTRACT — 100 % synthesized at runtime (Web Audio). No audio files.
// Owner: audio module (src/audio/*). SHARED CONTRACT (frozen).
//
// Everything is safe to call before unlock() (calls are ignored / music is
// remembered and starts on unlock) and safe to call every frame (rate limited).
// ─────────────────────────────────────────────────────────────────────────────
import type { MemberId } from '../family/types';

export type SfxId =
  // ── UI ──
  | 'uiMove'
  | 'uiConfirm'
  | 'uiBack'
  | 'uiToggle'
  | 'actCard' // big act title card whoosh + chime
  | 'banner' // "COFFEE: SECURED"-style banner stamp
  | 'taskDone' // chore ticked off the list
  | 'star' // a star lands on the report card (pitch rises with opts.pitch)
  | 'award' // funny award reveal
  | 'clockTick'
  | 'clockChime' // act boundary (6:00!)
  | 'alarm' // gentle morning alarm chime (6:00)
  // ── hair ──
  | 'brushStroke' // soft bristle "fffft" (volume = stroke speed)
  | 'brushSnag' // soft cartoon "boing" when the brush catches a knot (NOT painful)
  | 'detangle' // little satisfying "pop/plink" as a knot releases
  | 'sectionClear' // sparkle chime when a section becomes smooth (pitch rises with progress)
  | 'sparkle'
  | 'shine' // glossy "ting"
  | 'hairFlip' // swish
  | 'blackBrushSting' // LEGENDARY: choir "aaah" + shimmer + low boom (the reveal)
  | 'blackBrushGleam' // short glint
  | 'brushPass' // passing the black brush (dramatic mini sting)
  | 'girlDone' // "I'M DONE!" pop
  | 'bossIntro' // mock-epic boss hit (timpani + brass stab)
  | 'momInspect' // magnifying-glass sweep "hmmm"
  | 'momApproved' // triumphant approval jingle
  | 'momFinish' // speedy brushing flourish + sparkle
  // ── kitchen ──
  | 'mugPick'
  | 'mugPlace' // ceramic clink
  | 'brewStart' // coffee maker click + gurgle start
  | 'pour' // liquid pour (short)
  | 'stir' // spoon tinkle
  | 'coffeeSecured'
  | 'fridgeOpen'
  | 'lunchSnap' // lunchbox lid snap
  | 'itemPick'
  | 'itemPlace' // soft pack thud
  | 'dishClink' // plate into rack
  | 'glassClink'
  | 'cutlery' // cutlery jingle into basket
  | 'rinse' // quick water burst
  | 'dishwasherShut'
  | 'suds' // bubbly
  | 'crunch' // cereal crunch
  // ── house ──
  | 'footstep' // soft slipper step (pitch/volume vary)
  | 'doorOpen'
  | 'doorClose'
  | 'lightSwitch'
  | 'curtain' // curtains swoosh open
  | 'blanketRustle'
  | 'bedCreak'
  | 'trashRustle'
  | 'binLid'
  | 'binThud'
  | 'pickup'
  | 'deliver' // item handed to a girl (happy chime)
  | 'zipper'
  | 'found' // found a missing item (bright sparkle)
  | 'whoosh'
  | 'pop'
  | 'boing'
  | 'thud'
  | 'shh'
  | 'heart' // warm heart pop (Ashley's coffee payoff, hugs)
  | 'kiss' // tiny "mwah" pop
  // ── dog ──
  | 'dogBark'
  | 'dogBarkSmall'
  | 'dogPant'
  | 'dogWhine' // playful whine
  | 'dogCollar' // tag jingle
  | 'dogPaws' // paw patter
  | 'whistle' // Chris calls the dog
  | 'treatShake' // treat bag rattle
  | 'sniff'
  // ── car / school run ──
  | 'carDoor'
  | 'slidingDoor'
  | 'seatbelt' // click
  | 'carStart'
  | 'carHorn' // friendly beep-beep
  | 'brake' // soft squeak
  | 'turnSignal'
  | 'honkGoose' // goose honk
  | 'splash'
  | 'schoolBell'
  | 'cheer' // small family cheer
  | 'kidsYay';

/** Continuous sounds with live parameters. */
export type LoopId = 'brew' | 'water' | 'engine' | 'rain' | 'brushing' | 'pourStream';

export interface LoopHandle {
  /** volume 0..1, pitch/rate multiplier (1 = normal). */
  set(volume: number, pitch?: number): void;
  stop(): void;
}

export type MusicId =
  | 'title' // gentle, warm, whimsical (music-box + soft bass)
  | 'predawn' // cosy lo-fi, very quiet and sparse (Act I — everyone asleep)
  | 'wake' // bright bustling morning (Act II)
  | 'brushing' // playful, focused, satisfying (Act III brushing)
  | 'boss' // mock-dramatic "MOM" boss theme (tongue-in-cheek epic)
  | 'rush' // quick, busy, comedic (Act IV)
  | 'drive' // bouncy sing-along road tune (Act V)
  | 'results'; // warm triumphant wrap-up

export type Voice = MemberId | 'dog' | 'extra';

export type BabbleMood = 'normal' | 'excited' | 'sleepy' | 'dramatic' | 'whisper' | 'sing';

export interface AudioSettings {
  master: number; // 0..1
  music: number;
  sfx: number;
}

export interface SfxOpts {
  volume?: number; // multiplier, default 1
  pitch?: number; // multiplier, default 1
  pan?: number; // −1..1
  delay?: number; // seconds
}

export interface AudioEngine {
  /** Call from a trusted user gesture (creates/resumes the AudioContext). */
  unlock(): void;
  readonly unlocked: boolean;
  play(id: SfxId, opts?: SfxOpts): void;
  loop(id: LoopId): LoopHandle;
  /** Crossfades (default 1.2 s). null = silence. Remembered until unlock. */
  setMusic(id: MusicId | null, opts?: { fade?: number }): void;
  readonly music: MusicId | null;
  /** 0..1 energy for adaptive layers (e.g. extra percussion as the clock runs down). */
  setIntensity(v: number): void;
  /** Gibberish speech for a speech bubble; duration scales with text length (≈ 0.05 s per char, max 2.2 s). */
  babble(voice: Voice, text: string, mood?: BabbleMood): void;
  /** Duck the music by `amount` (0..1) for `seconds` (act cards, cutscene lines). */
  duck(amount: number, seconds: number): void;
  setVolumes(v: AudioSettings): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Suspend / resume everything (tab hidden, pause menu keeps music at a lower level). */
  setPaused(paused: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

/*
 * src/audio/index.ts exports:
 *   export function createAudio(): AudioEngine;
 */
