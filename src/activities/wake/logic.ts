// ACT II "WAKE UP, GIRLS!" — pure gameplay logic (no three.js, no DOM): each girl's wake-up state machine, the
// 4-beat wake-up song (timing + judging), the sleepwalker guiding rules and the star rating. Tested in
// tests/activities/wake/.
import type { Stars, WakeStyle } from '../../plan/types';
import type { AnchorId } from '../../world/types';

// ── the per-girl state machine ──────────────────────────────────────────────

export type WakePhase =
  | 'asleep' // in bed, waiting for Chris
  | 'burrito' // hiding under the blanket — needs sunshine (curtains)
  | 'sunny' // curtains open — needs the wake-up song
  | 'singing' // the beat track is running
  | 'sleepwalking' // up, eyes closed, shuffling toward the wrong spot
  | 'guided' // following Chris, still asleep
  | 'toSeat' // up (and awake, or about to be), heading to her breakfast seat
  | 'seated';

export type WakeEvent =
  | 'use' // Chris uses her bedside
  | 'curtains' // the curtains in her room opened
  | 'songStart'
  | 'songDone'
  | 'catch' // Chris takes the sleepwalker's hand
  | 'drift' // Chris got too far ahead — she wanders off again
  | 'arrive' // the guided sleepwalker reached the table
  | 'sit'
  | 'rescue'; // the act's clock is up: everybody gets up by themselves (graceful wrap-up)

/** Next phase for an event (unknown / out-of-order events keep the phase). */
export function wakeNext(style: WakeStyle, phase: WakePhase, ev: WakeEvent): WakePhase {
  if (ev === 'rescue') return phase === 'seated' ? 'seated' : 'toSeat';
  switch (phase) {
    case 'asleep':
      if (ev !== 'use') return phase;
      return style === 'popUp' ? 'toSeat' : style === 'burrito' ? 'burrito' : 'sleepwalking';
    case 'burrito':
      return ev === 'curtains' ? 'sunny' : phase;
    case 'sunny':
      return ev === 'songStart' ? 'singing' : phase;
    case 'singing':
      return ev === 'songDone' ? 'toSeat' : phase;
    case 'sleepwalking':
      return ev === 'catch' ? 'guided' : phase;
    case 'guided':
      return ev === 'drift' ? 'sleepwalking' : ev === 'arrive' ? 'toSeat' : phase;
    case 'toSeat':
      return ev === 'sit' ? 'seated' : phase;
    case 'seated':
      return phase;
  }
}

/** Out of bed (state.girlsUp). */
export function isUp(phase: WakePhase): boolean {
  return phase === 'sleepwalking' || phase === 'guided' || phase === 'toSeat' || phase === 'seated';
}

/** Her HUD task ("Wake Addy") state. The sleepwalker counts as awake only once she sits and wakes up. */
export function taskState(style: WakeStyle, phase: WakePhase): 'todo' | 'active' | 'done' {
  if (phase === 'asleep') return 'todo';
  if (phase === 'seated') return 'done';
  if (phase === 'toSeat') return style === 'sleepwalker' ? 'active' : 'done';
  return 'active';
}

/** Chris can use her bedside now. */
export function bedsideUsable(phase: WakePhase): boolean {
  return phase === 'asleep' || phase === 'sunny';
}

/** Prompt at her bedside for the phase ('' = none). */
export function bedsideLabel(phase: WakePhase, name: string): string {
  if (phase === 'asleep') return `Wake ${name}`;
  if (phase === 'sunny') return `Sing ${name} the wake-up song`;
  return '';
}

/** The one-line objective for the whole act, from every girl's phase (first thing still to do). */
export function wakeObjective(girls: readonly { name: string; phase: WakePhase }[]): string {
  for (const g of girls) {
    if (g.phase === 'burrito') return `${g.name} is a blanket burrito — open the curtains!`;
    if (g.phase === 'sunny') return `Sing ${g.name} the wake-up song!`;
    if (g.phase === 'singing') return `Wake-up song for ${g.name} — tap on the beat!`;
    if (g.phase === 'sleepwalking') return `${g.name} is sleepwalking — catch up and guide her!`;
    if (g.phase === 'guided') return `Walk ${g.name} to the kitchen — gently, no hurrying!`;
  }
  if (girls.some((g) => g.phase === 'asleep')) return 'Wake the girls — every one wakes up her own way.';
  return 'Everybody to breakfast!';
}

/** Where a sleepwalker heads by mistake (seeded pick). */
export const WRONG_SPOTS: readonly AnchorId[] = ['dogBed', 'couch', 'bathDoor'];

/** Sleep-talk while she shuffles (cosmetic rotation). */
export const SLEEP_TALK: readonly string[] = [
  '…five more minutes…',
  '…is it Saturday…?',
  '…pancakes… mmm…',
  '…the unicorn says hi…',
  '…I know the answer, Miss…',
  '…zzz… puppy…',
];

// ── the wake-up song (4-beat beat track) ────────────────────────────────────

export interface BeatConfig {
  /** Seconds per beat. */
  interval: number;
  /** Notes in a phrase. */
  notes: number;
  /** Count-in ticks before the first note. */
  countIn: number;
  /** Silence before the first count-in tick (s). */
  offset: number;
  /** Seconds a note is visible before its beat (slide-in time). */
  lead: number;
  /** Judging windows (± s). */
  perfect: number;
  good: number;
}

/** A comfortable, bouncy tempo (≈ 92 BPM) with generous windows — it's a lullaby in reverse, not a rhythm exam. */
export const SONG: BeatConfig = { interval: 60 / 92, notes: 4, countIn: 2, offset: 0.35, lead: 1.5, perfect: 0.11, good: 0.22 };

/** Phrases before the song succeeds anyway (misses just repeat the phrase). */
export const SONG_TRIES = 3;
/** Hits needed in a phrase to wake her. */
export const SONG_PASS = 3;

export type Grade = 'perfect' | 'good' | 'miss';

/** Pitch multipliers for the 4 notes (do–mi–sol–DO). */
export const SONG_PITCH: readonly number[] = [1, 1.26, 1.5, 2];

/** One phrase of the wake-up song: note times, judging and misses. Time only advances with advance(dt). */
export class BeatPhrase {
  readonly times: number[];
  readonly ticks: number[];
  readonly grades: (Grade | null)[];
  t = 0;
  private readonly missed: number[] = [];

  constructor(readonly cfg: BeatConfig = SONG) {
    this.ticks = [];
    for (let i = 0; i < cfg.countIn; i++) this.ticks.push(cfg.offset + i * cfg.interval);
    this.times = [];
    for (let i = 0; i < cfg.notes; i++) this.times.push(cfg.offset + (cfg.countIn + i) * cfg.interval);
    this.grades = this.times.map(() => null);
  }

  /** When the phrase is over (last note's window passed + a breath). */
  get end(): number {
    return this.times[this.times.length - 1]! + this.cfg.good + 0.35;
  }

  get finished(): boolean {
    return this.t >= this.end;
  }

  get hits(): number {
    let n = 0;
    for (const g of this.grades) if (g === 'perfect' || g === 'good') n++;
    return n;
  }

  get perfects(): number {
    let n = 0;
    for (const g of this.grades) if (g === 'perfect') n++;
    return n;
  }

  passed(min = SONG_PASS): boolean {
    return this.hits >= min;
  }

  /** 0..1 accuracy (perfect 1, good 0.7). */
  get accuracy(): number {
    let s = 0;
    for (const g of this.grades) s += g === 'perfect' ? 1 : g === 'good' ? 0.7 : 0;
    return s / Math.max(1, this.grades.length);
  }

  /** Advance time (judge this frame's presses next, then sweep()). */
  advance(dt: number): void {
    if (dt > 0) this.t += dt;
  }

  /**
   * Notes that slid past their window unplayed become 'miss'; returns their indices (the array is reused between
   * calls — copy it if you keep it).
   */
  sweep(): readonly number[] {
    this.missed.length = 0;
    for (let i = 0; i < this.times.length; i++) {
      if (this.grades[i] === null && this.t > this.times[i]! + this.cfg.good) {
        this.grades[i] = 'miss';
        this.missed.push(i);
      }
    }
    return this.missed;
  }

  /** A press now: judges the nearest unplayed note within the good window; null = no note there (no penalty). */
  press(): { index: number; grade: Grade } | null {
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.times.length; i++) {
      if (this.grades[i] !== null) continue;
      const d = Math.abs(this.t - this.times[i]!);
      if (d <= this.cfg.good && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    if (best < 0) return null;
    const grade: Grade = bestD <= this.cfg.perfect ? 'perfect' : 'good';
    this.grades[best] = grade;
    return { index: best, grade };
  }

  /** Slide position of note i: 0 = at the hit line, 1 = just entering at the far edge (>1 not yet visible). */
  slide(i: number): number {
    return (this.times[i]! - this.t) / this.cfg.lead;
  }
}

/** The song succeeds when the phrase passed, or after the last allowed try (misses only repeat the phrase). */
export function songSucceeded(phrasePassed: boolean, tries: number, maxTries = SONG_TRIES): boolean {
  return phrasePassed || tries >= maxTries;
}

// ── sleepwalker guiding ─────────────────────────────────────────────────────

export const GUIDE = {
  /** Chris must be this close to take her hand (m). */
  catchDist: 1.25,
  /**
   * Further than this for `driftGrace` seconds while guiding → she drifts off (m). Beyond the NPC director's
   * catch-up boost (follow distance + 2.5 m), so walking normally she always keeps up — HURRYING makes her drift.
   */
  driftDist: 3.7,
  driftGrace: 0.6,
  /** Within this of her seat (and in the kitchen) → she sits down (m). */
  arriveDist: 2.6,
  /** Chris's gentle guiding pace (m/s) and hers following him (a touch faster, so she keeps up). */
  chrisSpeed: 1.8,
  followSpeed: 1.85,
  followDist: 0.85,
} as const;

export function canCatch(dist: number): boolean {
  return dist <= GUIDE.catchDist;
}

/** Counts how long Chris has been too far ahead while guiding. */
export class DriftWatch {
  over = 0;

  /** Returns true the frame she should drift off (then resets). */
  update(dist: number, dt: number): boolean {
    if (dist > GUIDE.driftDist) this.over += Math.max(0, dt);
    else this.over = 0;
    if (this.over >= GUIDE.driftGrace) {
      this.over = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.over = 0;
  }
}

/** 0..1 "how gentle" (1 = right beside him, 0 = about to drift) — the guiding meter. */
export function guideCloseness(dist: number): number {
  const k = (GUIDE.driftDist - dist) / (GUIDE.driftDist - GUIDE.followDist);
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

export function arrivedAtTable(inKitchen: boolean, distToSeat: number): boolean {
  return inKitchen && distToSeat <= GUIDE.arriveDist;
}

// ── stars ───────────────────────────────────────────────────────────────────

export interface WakeScoreInput {
  /** Real seconds of play until everybody sat down. */
  seconds: number;
  /** Final phrase accuracy of the wake-up song (null = no burrito this morning). */
  songAccuracy: number | null;
  /** Phrases sung. */
  songTries: number;
  /** Seconds from the sleepwalker getting up to sitting at the table (null = none). */
  guideSeconds: number | null;
  drifts: number;
  /** Girls who got up by themselves at the wrap-up. */
  rescued: number;
}

/** 1..3 stars: speed + beat accuracy + how quickly the sleepwalker was guided. Never 0. */
export function wakeStars(i: WakeScoreInput): Stars {
  let p = 1;
  p += i.seconds <= 75 ? 1 : i.seconds <= 105 ? 0.5 : 0;
  if (i.songAccuracy === null) p += 0.5;
  else p += i.songAccuracy >= 0.8 && i.songTries <= 1 ? 0.5 : i.songAccuracy >= 0.5 ? 0.25 : 0;
  if (i.guideSeconds === null) p += 0.5;
  else p += i.guideSeconds <= 28 && i.drifts === 0 ? 0.5 : i.guideSeconds <= 45 ? 0.25 : 0;
  p -= 0.5 * i.rescued;
  const r = Math.round(p + 1e-9);
  return (r <= 1 ? 1 : r >= 3 ? 3 : 2) as Stars;
}

/** Report-card flags for the act. */
export function wakeFlags(i: WakeScoreInput, coffeePayoff: boolean): string[] {
  const f: string[] = [];
  if (i.seconds <= 75 && i.rescued === 0) f.push('wake:fast');
  if (i.songAccuracy !== null && i.songAccuracy >= 0.99) f.push('wake:dj');
  if (i.guideSeconds !== null && i.drifts === 0) f.push('wake:gentle');
  if (coffeePayoff) f.push('coffee:heart');
  return f;
}

/** Who greets whom (cosmetic): Ashley's warm hello when a girl sits down. */
export const ASHLEY_GREETINGS: readonly string[] = ['Morning, sweetie!', 'Good morning, sunshine!', 'There’s my girl!', 'Hi, sleepyhead!'];

