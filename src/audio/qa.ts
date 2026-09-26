// ─────────────────────────────────────────────────────────────────────────────
// Offline render QA. Renders every SFX, every loop, every music track (at each
// intensity level), a set of babble lines and a few worst-case "stack" scenes through
// the REAL mixer (compressor + soft clipper) into an OfflineAudioContext and measures
// peak / RMS / length / band balance. Driven from dev/audio.html (window.__audioQa) —
// never imported by the game bundle (it needs a real browser OfflineAudioContext).
//
// Checks: nothing clips (peak ≤ −0.5 dBFS), nothing is silent, no NaNs, SFX not too
// quiet, music loudness in a sane window (the pre-dawn theme quieter), nothing harsh
// (top band not towering over the mids, except the deliberately glittery sounds), and
// each effect's audible length agrees with the end time its recipe declares (the
// voice limiter relies on it). Adapted from ATHLETE MAYHEM's qa.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { babblePlan, playBabble } from './babble';
import { LOOP_META, startLoop } from './loops';
import { buildMixer, duckParam, type Mixer } from './mixer';
import { audibleSpan, bandLevels, type BandReport, type LevelReport, measureLevels } from './meter';
import { MusicPlayer } from './music';
import { playSfx, SFX_IDS, SFX_META } from './sfx';
import { MUSIC_IDS } from './song';
import type { BabbleMood, LoopId, MusicId, SfxId, Voice } from './types';

export const QA_RATE = 44100;

export type QaGroup = 'sfx' | 'loop' | 'music' | 'babble' | 'scene';

export interface QaItem {
  group: QaGroup;
  name: string;
  report: LevelReport;
  bands: BandReport;
  /** Audible length (s, within 30 dB of the loudest 10 ms). */
  audible: number;
  /** Length the recipe declared (s), when applicable. */
  declared: number;
  verdict: 'ok' | 'warn' | 'fail';
  notes: string[];
}

/** Target windows (dBFS / seconds / dB). */
export const QA_TARGETS = {
  ceiling: -0.5,
  silentPeak: -50,
  sfxPeakMin: -24,
  loopRmsMin: -42,
  loopRmsMax: -16,
  musicRmsMin: -28,
  musicRmsMax: -14,
  /** The pre-dawn theme is meant to be hushed. */
  quietMusicRmsMin: -36,
  quietMusicRmsMax: -21,
  babblePeakMin: -26,
  /** Audible length may exceed the declared end by this much (reverb tails). */
  tailAllowance: 1.2,
  /** Top band (> 2.5 kHz) more than this above the mids reads as harsh. */
  harshDb: 6,
} as const;

/** Sounds that are meant to be glittery / airy (exempt from the harshness check). */
const AIRY: ReadonlySet<string> = new Set(['sparkle', 'shine', 'blackBrushGleam', 'cutlery', 'dogCollar', 'treatShake', 'shh', 'seatbelt', 'lightSwitch', 'sniff', 'zipper', 'crunch', 'star', 'found', 'curtain', 'sectionClear']);

function judge(item: Omit<QaItem, 'verdict' | 'notes'>): { verdict: QaItem['verdict']; notes: string[] } {
  const r = item.report;
  const notes: string[] = [];
  let verdict: QaItem['verdict'] = 'ok';
  const fail = (n: string): void => {
    notes.push(n);
    verdict = 'fail';
  };
  const warn = (n: string): void => {
    notes.push(n);
    if (verdict === 'ok') verdict = 'warn';
  };
  if (r.nonFinite > 0) fail(`${r.nonFinite} non-finite samples`);
  if (r.peakDb > QA_TARGETS.ceiling) fail(`peak ${r.peakDb.toFixed(2)} > ${QA_TARGETS.ceiling}`);
  if (!(r.peakDb > QA_TARGETS.silentPeak)) fail('silent');
  const base = item.name.split(' ')[0]!;
  if (item.bands.highDb - item.bands.midDb > QA_TARGETS.harshDb && !AIRY.has(base)) warn(`harsh? high ${(item.bands.highDb - item.bands.midDb).toFixed(1)} dB over mids`);
  switch (item.group) {
    case 'sfx':
      // Gentle strokes ("@vol") are meant to be quiet: allow 10 dB more.
      if (r.peakDb < QA_TARGETS.sfxPeakMin - (item.name.includes('@vol') ? 10 : 0)) warn(`quiet (${r.peakDb.toFixed(1)})`);
      if (item.declared > 0 && item.audible > item.declared + QA_TARGETS.tailAllowance) warn(`rings ${item.audible.toFixed(2)}s > declared ${item.declared.toFixed(2)}s`);
      break;
    case 'loop':
      if (r.gatedRmsDb < QA_TARGETS.loopRmsMin) warn(`quiet (${r.gatedRmsDb.toFixed(1)})`);
      if (r.gatedRmsDb > QA_TARGETS.loopRmsMax) warn(`loud (${r.gatedRmsDb.toFixed(1)})`);
      break;
    case 'music': {
      const quiet = item.name.startsWith('predawn');
      const lo = quiet ? QA_TARGETS.quietMusicRmsMin : QA_TARGETS.musicRmsMin;
      const hi = quiet ? QA_TARGETS.quietMusicRmsMax : QA_TARGETS.musicRmsMax;
      if (r.gatedRmsDb < lo) warn(`quiet (${r.gatedRmsDb.toFixed(1)})`);
      if (r.gatedRmsDb > hi) warn(`loud (${r.gatedRmsDb.toFixed(1)})`);
      break;
    }
    case 'babble':
      if (r.peakDb < QA_TARGETS.babblePeakMin) warn(`quiet (${r.peakDb.toFixed(1)})`);
      break;
    case 'scene':
      break;
  }
  return { verdict, notes };
}

function analyse(group: QaGroup, name: string, buf: AudioBuffer, declared = 0, skip = 0): QaItem {
  const chans: Float32Array[] = [];
  const from = Math.floor(skip * buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c).subarray(from));
  const report = measureLevels(chans, buf.sampleRate);
  const span = audibleSpan(chans, buf.sampleRate, 30);
  const base = { group, name, report, bands: bandLevels(chans[0]!, buf.sampleRate), audible: span.end, declared };
  return { ...base, ...judge(base) };
}

function offline(seconds: number): { ctx: OfflineAudioContext; mix: Mixer } {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * QA_RATE), QA_RATE);
  return { ctx, mix: buildMixer(ctx) };
}

const T0 = 0.02;

/** Render one SFX through the mixer. Returns the buffer and the recipe's declared length. */
export async function renderSfx(id: SfxId, seconds: number, opts: { volume?: number; pitch?: number } = {}): Promise<{ buf: AudioBuffer; declared: number }> {
  const { ctx, mix } = offline(seconds);
  const meta = SFX_META[id];
  const end = playSfx(ctx, meta.bus === 'ui' ? mix.ui : mix.game, id, T0, { volume: opts.volume, pitch: opts.pitch, wet: mix.wet });
  return { buf: await ctx.startRendering(), declared: end - T0 };
}

export async function renderLoop(id: LoopId, seconds: number, volume = 1, pitch = 1): Promise<AudioBuffer> {
  const { ctx, mix } = offline(seconds);
  const l = startLoop(ctx, mix.loops, id, 0, volume, pitch);
  l.pump(seconds, 0);
  l.stop(seconds - 0.3, 0.1);
  return ctx.startRendering();
}

export async function renderMusic(id: MusicId, seconds: number, intensity = 0): Promise<AudioBuffer> {
  const { ctx, mix } = offline(seconds);
  const p = new MusicPlayer(ctx, mix.music, id, 0, { fadeIn: 0.05, intensity });
  p.pump(seconds);
  return ctx.startRendering();
}

export async function renderBabble(voice: Voice, text: string, mood: BabbleMood): Promise<{ buf: AudioBuffer; declared: number }> {
  const plan = babblePlan(voice, text, mood);
  const { ctx, mix } = offline(plan.duration + 0.8);
  const v = playBabble(ctx, mix.voice, T0, plan);
  return { buf: await ctx.startRendering(), declared: v.end - T0 };
}

type SceneCue = { at: number; sfx?: SfxId; volume?: number; babble?: [Voice, string, BabbleMood] };

/** Worst-case moment: SFX + babble + a loop + music together, with the real ducks. */
export async function renderScene(seconds: number, track: MusicId, intensity: number, loopId: LoopId | null, cues: readonly SceneCue[]): Promise<AudioBuffer> {
  const { ctx, mix } = offline(seconds);
  const music = new MusicPlayer(ctx, mix.music, track, 0, { fadeIn: 0.05, intensity });
  music.pump(seconds);
  if (loopId) {
    const l = startLoop(ctx, mix.loops, loopId, 0, 1, 1);
    l.pump(seconds, 0);
  }
  for (const c of cues) {
    if (c.sfx) {
      const meta = SFX_META[c.sfx];
      playSfx(ctx, meta.bus === 'ui' ? mix.ui : mix.game, c.sfx, c.at, { volume: c.volume, wet: mix.wet });
      if (meta.duck) duckParam(mix.musicDuck.gain, 1, meta.duck.amount, meta.duck.seconds, c.at);
    }
    if (c.babble) playBabble(ctx, mix.voice, c.at, babblePlan(c.babble[0], c.babble[1], c.babble[2]));
  }
  return ctx.startRendering();
}

export interface QaSummary {
  items: QaItem[];
  failures: number;
  warnings: number;
}

export type QaPart = 'all' | QaGroup;

/** Let the page breathe between renders (GC of finished offline contexts). */
const breathe = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/** Render length for an SFX: its declared length plus room for the reverb tail. */
function sfxSeconds(id: SfxId): number {
  const long: ReadonlySet<SfxId> = new Set(['blackBrushSting', 'bossIntro', 'clockChime', 'actCard', 'award', 'momApproved', 'alarm', 'schoolBell', 'carStart']);
  return long.has(id) ? 4.8 : 2.4;
}

const BABBLE_LINES: ReadonlyArray<readonly [Voice, string, BabbleMood]> = [
  ['chris', 'Morning, buddy. Quiet now, everyone is asleep.', 'whisper'],
  ['chris', 'Coffee is ready!', 'normal'],
  ['ashley', 'Love you! Have a great day!', 'excited'],
  ['ashley', 'Hmm... let me see that hair.', 'dramatic'],
  ['addy', 'I called it!', 'excited'],
  ['ellie', 'Five more minutes...', 'sleepy'],
  ['heidi', 'GOOD MORNING!!!', 'excited'],
  ['heidi', 'La la la, we are going to school', 'sing'],
  ['dog', 'Woof woof!', 'excited'],
  ['extra', 'Have a good one!', 'normal'],
];

/** QA pass. `quick` renders shorter music excerpts; `part` limits it to one group. */
export async function runQa(quick = false, part: QaPart = 'all'): Promise<QaSummary> {
  const items: QaItem[] = [];
  const want = (g: QaGroup): boolean => part === 'all' || part === g;
  if (want('sfx')) {
    for (const id of SFX_IDS) {
      const { buf, declared } = await renderSfx(id, sfxSeconds(id));
      items.push(analyse('sfx', id, buf, declared));
      await breathe();
    }
    // Gentle strokes must still read; high pitches must stay clean.
    for (const [id, volume] of [
      ['brushStroke', 0.15],
      ['footstep', 0.2],
    ] as const) {
      const { buf, declared } = await renderSfx(id, 2, { volume });
      items.push(analyse('sfx', `${id} @vol ${volume}`, buf, declared));
    }
    for (const id of ['sectionClear', 'star', 'brushStroke'] as const) {
      const { buf, declared } = await renderSfx(id, 2.4, { pitch: 1.6 });
      items.push(analyse('sfx', `${id} @pitch 1.6`, buf, declared));
    }
  }
  if (want('loop')) {
    for (const id of Object.keys(LOOP_META) as LoopId[]) {
      for (const [v, p] of [
        [1, 1],
        [0.5, 1.8],
      ] as const) {
        items.push(analyse('loop', `${id} v${v} p${p}`, await renderLoop(id, quick ? 3 : 5, v, p), 0, 1));
        await breathe();
      }
    }
  }
  if (want('music')) {
    const mlen = quick ? 12 : 24;
    for (const id of MUSIC_IDS) {
      for (const level of [0, 0.5, 1]) {
        items.push(analyse('music', `${id} · i${level}`, await renderMusic(id, mlen, level), 0, 0.5));
        await breathe();
      }
    }
  }
  if (want('babble')) {
    for (const [v, text, mood] of BABBLE_LINES) {
      const { buf, declared } = await renderBabble(v, text, mood);
      items.push(analyse('babble', `${v}/${mood} "${text.slice(0, 18)}"`, buf, declared));
      await breathe();
    }
  }
  if (want('scene')) {
    items.push(
      analyse(
        'scene',
        'BLACK BRUSH: sting+sparkle+gleam+babble · brushing i1',
        await renderScene(6, 'brushing', 0.5, 'brushing', [
          { at: 0.2, sfx: 'blackBrushGleam' },
          { at: 0.3, sfx: 'blackBrushSting' },
          { at: 0.5, sfx: 'sparkle' },
          { at: 1.2, babble: ['addy', 'I called it!', 'excited'] },
          { at: 1.3, babble: ['heidi', 'Hey!', 'excited'] },
          { at: 1.6, sfx: 'shine' },
        ]),
      ),
    );
    items.push(
      analyse(
        'scene',
        'MOM CHECK: bossIntro+inspect+approved+heart+cheer · boss i1',
        await renderScene(6, 'boss', 1, null, [
          { at: 0.2, sfx: 'bossIntro' },
          { at: 2.3, sfx: 'momInspect' },
          { at: 3.3, sfx: 'momApproved' },
          { at: 3.5, sfx: 'heart' },
          { at: 3.6, sfx: 'cheer' },
          { at: 3.7, sfx: 'hairFlip' },
          { at: 3.8, sfx: 'sparkle' },
        ]),
      ),
    );
    items.push(
      analyse(
        'scene',
        'RUSH: found+deliver+zipper+footsteps+dog · rush i1',
        await renderScene(5, 'rush', 1, null, [
          { at: 0.1, sfx: 'footstep' },
          { at: 0.35, sfx: 'footstep' },
          { at: 0.5, sfx: 'found' },
          { at: 0.6, sfx: 'dogBark' },
          { at: 0.9, sfx: 'pickup' },
          { at: 1.2, sfx: 'deliver' },
          { at: 1.3, sfx: 'zipper' },
          { at: 1.35, sfx: 'kidsYay' },
          { at: 1.5, sfx: 'taskDone' },
          { at: 1.6, sfx: 'banner' },
          { at: 1.8, sfx: 'clockTick' },
        ]),
      ),
    );
  }
  return summarize(items);
}

function summarize(items: QaItem[]): QaSummary {
  return { items, failures: items.filter((i) => i.verdict === 'fail').length, warnings: items.filter((i) => i.verdict === 'warn').length };
}

/** One line per item for console / tools output. */
export function formatQa(s: QaSummary): string[] {
  const f = (v: number, w = 6): string => (Number.isFinite(v) ? v.toFixed(1) : '-inf').padStart(w);
  const lines = s.items.map(
    (i) =>
      `${i.verdict.toUpperCase().padEnd(4)} ${i.group.padEnd(6)} ${i.name.padEnd(46).slice(0, 46)} peak ${f(i.report.peakDb)}  rms ${f(i.report.gatedRmsDb)}  len ${i.audible.toFixed(2).padStart(5)}s` +
      `${i.declared > 0 ? ` (decl ${i.declared.toFixed(2)})` : ''}  L/M/H ${[i.bands.lowDb, i.bands.midDb, i.bands.highDb].map((v) => (Number.isFinite(v) ? v.toFixed(0) : '-')).join('/')}` +
      `${i.notes.length ? '  <- ' + i.notes.join('; ') : ''}`,
  );
  lines.push(`${s.items.length} items · ${s.failures} fail · ${s.warnings} warn`);
  return lines;
}
