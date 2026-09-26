// CPU / voice budget (mobile): how many Web Audio nodes each music track creates per second and how
// many sources ring at once, at full intensity — measured on the recording fake context. Guards
// against an arrangement change quietly turning a track into a node storm on phones.
import { describe, expect, it } from 'vitest';
import { buildMixer } from '../../src/audio/mixer';
import { MusicPlayer } from '../../src/audio/music';
import { MUSIC_IDS } from '../../src/audio/song';
import { bareContext } from './fakeAudio';

/** Nodes created per second of music. */
export const MAX_NODES_PER_SECOND = 300;
/** Sources (oscillators / buffer players) sounding at the same instant. */
export const MAX_LIVE_SOURCES = 90;

function measure(id: (typeof MUSIC_IDS)[number], intensity: number, seconds: number): { perSecond: number; peakLive: number } {
  const { ctx, fake } = bareContext();
  const mix = buildMixer(ctx);
  const before = fake.nodes;
  const p = new MusicPlayer(ctx, mix.music, id, 0, { intensity });
  p.pump(seconds);
  const perSecond = (fake.nodes - before) / seconds;
  // Peak number of sources alive at once, sampled every 50 ms (long-running LFOs / the bed count too).
  const srcs = fake.sources();
  let peakLive = 0;
  for (let t = 1; t < seconds - 1; t += 0.05) {
    let live = 0;
    for (const s of srcs) if (s.startAt! <= t && (s.stopAt === null || s.stopAt > t)) live++;
    peakLive = Math.max(peakLive, live);
  }
  p.kill();
  return { perSecond, peakLive };
}

describe('music CPU budget', () => {
  it(`every track at full intensity stays under ${MAX_NODES_PER_SECOND} nodes/s and ${MAX_LIVE_SOURCES} live sources`, () => {
    const rows: string[] = [];
    for (const id of MUSIC_IDS) {
      const m = measure(id, 1, 24);
      rows.push(`${id.padEnd(9)} ${m.perSecond.toFixed(0).padStart(4)} nodes/s  peak ${m.peakLive} live sources`);
      expect(m.perSecond, id).toBeLessThanOrEqual(MAX_NODES_PER_SECOND);
      expect(m.peakLive, id).toBeLessThanOrEqual(MAX_LIVE_SOURCES);
    }
    console.log('music budget @ intensity 1\n' + rows.join('\n'));
  });

  it('the hushed pre-dawn theme is the lightest of the gameplay tracks at rest', () => {
    const predawn = measure('predawn', 0, 20).perSecond;
    for (const id of ['wake', 'brushing', 'rush', 'drive'] as const) expect(predawn, id).toBeLessThan(measure(id, 0, 20).perSecond);
  });
});
