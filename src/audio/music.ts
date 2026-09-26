// ─────────────────────────────────────────────────────────────────────────────
// MusicPlayer: one playing track. The engine calls pump(until, now) from a ~25 ms
// interval with until = currentTime + ~120 ms (lookahead scheduling); the offline
// QA harness calls pump(seconds) once to schedule a whole render.
//
// Intensity is quantised to levels (hysteresis) and re-arranges the REST of the
// current bar at once, so new layers kick in within a 16th; tempo pushes (rush) follow
// at bar lines, max 4 BPM per bar. Velocity humanisation uses a seeded LCG, so a track
// is fully deterministic. Adapted from ATHLETE MAYHEM's music.ts.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Band,
  brassChord,
  brassNote,
  celestaNote,
  choirChord,
  clapHit,
  cymbalHit,
  epianoNote,
  glockNote,
  hatHit,
  kalimbaNote,
  kickHit,
  marimbaNote,
  musicBoxNote,
  padChord,
  pluckBassNote,
  pluckNote,
  rimHit,
  shakerHit,
  snareHit,
  softBassNote,
  tambHit,
  timpHit,
  triangleHit,
  whistleNote,
} from './instruments';
import { makeLcg } from './noise';
import { arrangeBar, intensityLevel, layersFor, type NoteEvent, SONGS, type SongDef, stepTempo, tempoFor } from './song';
import { holdAt } from './synth';
import { Transport } from './transport';
import type { MusicId } from './types';

/** Per-track fader levels (tuned with the offline QA meter). The pre-dawn theme is deliberately hushed. */
export const TRACK_LEVEL: Readonly<Record<MusicId, number>> = {
  title: 1.0,
  predawn: 0.45,
  wake: 1.25,
  brushing: 1.2,
  boss: 0.8,
  rush: 1.15,
  drive: 1.2,
  results: 0.62,
};

export class MusicPlayer {
  readonly band: Band;
  private readonly ctx: BaseAudioContext;
  private readonly transport: Transport;
  private readonly song: SongDef;
  private readonly buckets: NoteEvent[][];
  private readonly scratch: NoteEvent[] = [];
  private readonly rnd: () => number;
  private arrangedBar = -1;
  private arrangedLevel = -1;
  private level: 0 | 1 | 2 = 0;
  private stopAt = Infinity;
  /** Notes scheduled so far (dev bench / CPU budget tests). */
  notes = 0;
  finished = false;

  constructor(
    ctx: BaseAudioContext,
    dest: AudioNode,
    readonly track: MusicId,
    t0: number,
    opts: { fadeIn?: number; intensity?: number } = {},
  ) {
    this.ctx = ctx;
    this.song = SONGS[track];
    this.level = intensityLevel(opts.intensity ?? 0, 0);
    const bpm = tempoFor(this.song, this.level);
    this.band = new Band(ctx, dest, bpm);
    this.buckets = Array.from({ length: this.song.stepsPerBar }, () => []);
    this.rnd = makeLcg(0x5eed + track.length * 977 + track.charCodeAt(0));
    const out = this.band.out.gain;
    const fadeIn = Math.max(0.01, opts.fadeIn ?? 0.3);
    out.setValueAtTime(0, t0);
    out.linearRampToValueAtTime(TRACK_LEVEL[track], t0 + fadeIn);
    if (this.song.bed > 0) this.band.bed(this.song.bed, t0);
    this.transport = new Transport(t0 + 0.05, bpm, this.song.swing8, this.song.swing16, this.song.stepsPerBar);
  }

  /** Music intensity 0..1. Cheap; safe to call every frame. */
  setIntensity(v: number): void {
    if (this.stopping) return;
    const lvl = intensityLevel(v, this.level);
    if (lvl !== this.level) {
      this.level = lvl;
      // Re-arrange the rest of the current bar right away; tempo follows at the bar line.
      this.transport.setTempo(stepTempo(this.transport.bpm, tempoFor(this.song, lvl), 4));
    }
  }

  /** Current intensity level (0..2). */
  get intensityLevel(): number {
    return this.level;
  }

  get bpm(): number {
    return this.transport.bpm;
  }

  get bar(): number {
    return this.transport.bar;
  }

  /**
   * Schedule every step that starts before `until`. Pass `now` in live mode so a stalled timer
   * skips instead of bursting. `silent` advances the transport without playing (muted), so the
   * song stays exactly in time and resumes on the right step when unmuted.
   */
  pump(until: number, now?: number, silent = false): void {
    if (this.finished) return;
    const tr = this.transport;
    if (now !== undefined) {
      tr.resync(now);
      if (now >= this.stopAt) {
        this.finish();
        return;
      }
    }
    if (this.arrangedBar === tr.bar && this.arrangedLevel !== this.level) this.arrange(tr.bar);
    while (tr.time < until && tr.time < this.stopAt) {
      if (tr.bar !== this.arrangedBar) this.arrange(tr.bar);
      if (!silent) this.playStep(tr.step, tr.time, tr.sixteenth);
      const bpmBefore = tr.bpm;
      if (tr.advance()) {
        if (tr.bpm !== bpmBefore) this.band.setTempo(tr.bpm, tr.barStart);
        const target = tempoFor(this.song, this.level);
        if (target !== tr.bpm) tr.setTempo(stepTempo(tr.bpm, target, 4));
      }
    }
  }

  /** Fade out over `fade` seconds from t (0 = a quick 20 ms cut). */
  stop(t: number, fade: number): void {
    if (this.stopAt !== Infinity) return;
    const f = Math.max(0.02, fade);
    this.stopAt = t + f;
    const g = this.band.out.gain;
    holdAt(g, t);
    g.setTargetAtTime(0, t, f / 5);
  }

  get stopping(): boolean {
    return this.stopAt !== Infinity;
  }

  /** Stop scheduling and release the band (LFOs, bed) once the tail has rung out. */
  private finish(): void {
    this.finished = true;
    const band = this.band;
    setTimeout(() => band.dispose(), 1500);
  }

  /** Release immediately (context teardown). */
  kill(): void {
    this.finished = true;
    this.band.dispose();
  }

  private arrange(bar: number): void {
    this.arrangedBar = bar;
    this.arrangedLevel = this.level;
    const ev = this.scratch;
    ev.length = 0;
    arrangeBar(this.song, bar, layersFor(this.song, bar, this.level), ev);
    for (const b of this.buckets) b.length = 0;
    for (const e of ev) this.buckets[e.step]?.push(e);
  }

  private playStep(step: number, t: number, sixteenth: number): void {
    const b = this.band;
    const ctx = this.ctx;
    const bucket = this.buckets[step];
    if (!bucket) return;
    for (const e of bucket) {
      this.notes++;
      // Humanise: ±6 % velocity (seeded → deterministic).
      const vel = Math.min(1, e.vel * (0.97 + this.rnd() * 0.06));
      const dur = e.len * sixteenth;
      const chord = e.chord ?? [e.midi];
      switch (e.inst) {
        case 'musicBox':
          musicBoxNote(ctx, b.bus('musicBox'), t, e.midi, vel, dur);
          break;
        case 'celesta':
          celestaNote(ctx, b.bus('celesta'), t, e.midi, vel, dur);
          break;
        case 'bell':
          glockNote(ctx, b.bus('bell'), t, e.midi, vel, dur);
          break;
        case 'marimba':
          marimbaNote(ctx, b.bus('marimba'), t, e.midi, vel, dur);
          break;
        case 'xylo':
          marimbaNote(ctx, b.bus('xylo'), t, e.midi, vel, dur, true);
          break;
        case 'kalimba':
          kalimbaNote(ctx, b.bus('kalimba'), t, e.midi, vel, dur);
          break;
        case 'whistle':
          whistleNote(ctx, b.bus('whistle'), t, e.midi, vel, dur, e.glide);
          break;
        case 'brass':
          brassNote(ctx, b.bus('brass'), t, e.midi, vel, dur);
          break;
        case 'choir':
          choirChord(ctx, b.choirIn('a'), t, [e.midi], vel * 0.8, dur, 0.06, b.vibrato());
          break;
        case 'epiano': {
          const k = 1 / Math.sqrt(Math.max(1, chord.length));
          const bus = b.bus('epiano');
          const wow = b.wow();
          for (let i = 0; i < chord.length; i++) epianoNote(ctx, bus, t + i * 0.007, chord[i]!, vel * k, dur, wow);
          break;
        }
        case 'pizz': {
          const k = 1 / Math.sqrt(Math.max(1, chord.length));
          const ring = e.stacc ? Math.min(0.16, dur + 0.04) : 0;
          for (let i = 0; i < chord.length; i++) pluckNote(ctx, b.bus('pizz'), 'pizz', t + i * 0.008, chord[i]!, vel * k, ring);
          break;
        }
        case 'uke': {
          const k = 0.8 / Math.sqrt(Math.max(1, chord.length));
          const bus = b.bus('uke');
          const n = chord.length;
          for (let i = 0; i < n; i++) {
            const note = e.up ? chord[n - 1 - i]! : chord[i]!;
            pluckNote(ctx, bus, 'uke', t + i * (e.up ? 0.009 : 0.013), note, vel * k * (e.up && i > 1 ? 0.7 : 1), Math.max(0.12, dur * 1.6));
          }
          break;
        }
        case 'harp':
          pluckNote(ctx, b.bus('harp'), 'harp', t, e.midi, vel, 0);
          break;
        case 'bass':
          softBassNote(ctx, b.bus('bass'), t, e.midi, vel, dur);
          break;
        case 'pluckBass':
          pluckBassNote(ctx, b.bus('pluckBass'), t, e.midi, vel, dur);
          break;
        case 'pad':
          padChord(ctx, b.bus('pad'), t, chord, vel, dur, 0.35, b.vibrato());
          break;
        case 'choirPad':
          choirChord(ctx, b.choirIn('a'), t, chord, vel * 0.7, dur, 0.3, b.vibrato());
          break;
        case 'oohPad':
          choirChord(ctx, b.choirIn('u'), t, chord, vel * 0.7, dur, 0.25, b.vibrato());
          break;
        case 'stab':
          brassChord(ctx, b.bus('stab'), t, chord, vel, dur, true);
          break;
        case 'kick':
          kickHit(ctx, b.bus('kick'), t, vel);
          break;
        case 'snare':
          snareHit(ctx, b.bus('snare'), t, vel);
          break;
        case 'rim':
          rimHit(ctx, b.bus('rim'), t, vel);
          break;
        case 'clap':
          clapHit(ctx, b.bus('clap'), t, vel);
          break;
        case 'shaker':
          shakerHit(ctx, b.bus('shaker'), t, vel);
          break;
        case 'tamb':
          tambHit(ctx, b.bus('tamb'), t, vel);
          break;
        case 'hat':
          hatHit(ctx, b.bus('hat'), t, vel);
          break;
        case 'triangle':
          triangleHit(ctx, b.bus('triangle'), t, vel);
          break;
        case 'timp':
          timpHit(ctx, b.bus('timp'), t, e.midi, vel);
          break;
        case 'cymbal':
          cymbalHit(ctx, b.bus('cymbal'), t, vel);
          break;
      }
    }
  }
}
