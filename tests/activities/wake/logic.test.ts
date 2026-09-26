import { describe, expect, it } from 'vitest';
import {
  BeatPhrase,
  DriftWatch,
  GUIDE,
  SONG,
  SONG_PASS,
  SONG_TRIES,
  arrivedAtTable,
  bedsideLabel,
  bedsideUsable,
  canCatch,
  guideCloseness,
  isUp,
  songSucceeded,
  taskState,
  wakeFlags,
  wakeNext,
  wakeObjective,
  wakeStars,
  type WakeEvent,
  type WakePhase,
} from '../../../src/activities/wake/logic';
import type { WakeStyle } from '../../../src/plan/types';

const STYLES: WakeStyle[] = ['popUp', 'burrito', 'sleepwalker'];

/** Run a sequence of events from 'asleep'. */
function run(style: WakeStyle, events: WakeEvent[]): WakePhase {
  let p: WakePhase = 'asleep';
  for (const e of events) p = wakeNext(style, p, e);
  return p;
}

describe('wake state machine', () => {
  it('pop-up: one use and she heads to breakfast', () => {
    expect(run('popUp', ['use'])).toBe('toSeat');
    expect(run('popUp', ['use', 'sit'])).toBe('seated');
  });

  it('burrito: use → curtains → song → up (in that order only)', () => {
    expect(run('burrito', ['use'])).toBe('burrito');
    // the song can't start before the curtains are open
    expect(run('burrito', ['use', 'songStart'])).toBe('burrito');
    expect(run('burrito', ['use', 'curtains'])).toBe('sunny');
    expect(run('burrito', ['use', 'curtains', 'songStart'])).toBe('singing');
    expect(run('burrito', ['use', 'curtains', 'songStart', 'songDone'])).toBe('toSeat');
    expect(run('burrito', ['use', 'curtains', 'songStart', 'songDone', 'sit'])).toBe('seated');
  });

  it('curtains before waking her change nothing', () => {
    expect(run('burrito', ['curtains'])).toBe('asleep');
    expect(run('burrito', ['curtains', 'use'])).toBe('burrito');
  });

  it('sleepwalker: use → catch → (drift → catch)* → arrive → sit', () => {
    expect(run('sleepwalker', ['use'])).toBe('sleepwalking');
    expect(run('sleepwalker', ['use', 'catch'])).toBe('guided');
    expect(run('sleepwalker', ['use', 'catch', 'drift'])).toBe('sleepwalking');
    expect(run('sleepwalker', ['use', 'catch', 'drift', 'catch', 'arrive'])).toBe('toSeat');
    expect(run('sleepwalker', ['use', 'catch', 'drift', 'catch', 'arrive', 'sit'])).toBe('seated');
    // can't arrive without being guided
    expect(run('sleepwalker', ['use', 'arrive'])).toBe('sleepwalking');
  });

  it('rescue (the act clock is up) sends anyone not seated to the table', () => {
    for (const style of STYLES) {
      expect(run(style, ['rescue'])).toBe('toSeat');
      expect(run(style, ['use', 'rescue'])).toBe('toSeat');
    }
    expect(run('popUp', ['use', 'sit', 'rescue'])).toBe('seated');
  });

  it('every style permutation reaches the table', () => {
    const paths: Record<WakeStyle, WakeEvent[]> = {
      popUp: ['use', 'sit'],
      burrito: ['use', 'curtains', 'songStart', 'songDone', 'sit'],
      sleepwalker: ['use', 'catch', 'arrive', 'sit'],
    };
    const perms: WakeStyle[][] = [
      ['popUp', 'burrito', 'sleepwalker'],
      ['popUp', 'sleepwalker', 'burrito'],
      ['burrito', 'popUp', 'sleepwalker'],
      ['burrito', 'sleepwalker', 'popUp'],
      ['sleepwalker', 'popUp', 'burrito'],
      ['sleepwalker', 'burrito', 'popUp'],
    ];
    for (const perm of perms) for (const s of perm) expect(run(s, paths[s])).toBe('seated');
  });

  it('isUp / taskState / bedside prompts', () => {
    expect(isUp('asleep')).toBe(false);
    expect(isUp('burrito')).toBe(false);
    expect(isUp('singing')).toBe(false);
    expect(isUp('sleepwalking')).toBe(true);
    expect(isUp('seated')).toBe(true);
    expect(taskState('popUp', 'asleep')).toBe('todo');
    expect(taskState('popUp', 'toSeat')).toBe('done');
    expect(taskState('sleepwalker', 'toSeat')).toBe('active');
    expect(taskState('sleepwalker', 'seated')).toBe('done');
    expect(taskState('burrito', 'sunny')).toBe('active');
    expect(bedsideUsable('asleep')).toBe(true);
    expect(bedsideUsable('sunny')).toBe(true);
    expect(bedsideUsable('burrito')).toBe(false);
    expect(bedsideLabel('asleep', 'Addy')).toBe('Wake Addy');
    expect(bedsideLabel('sunny', 'Heidi')).toContain('wake-up song');
    expect(bedsideLabel('guided', 'Ellie')).toBe('');
  });

  it('objective follows the most urgent girl', () => {
    expect(wakeObjective([{ name: 'Addy', phase: 'asleep' }])).toMatch(/Wake the girls/);
    expect(wakeObjective([{ name: 'Addy', phase: 'seated' }, { name: 'Heidi', phase: 'burrito' }])).toMatch(/curtains/);
    expect(wakeObjective([{ name: 'Ellie', phase: 'guided' }])).toMatch(/kitchen/);
    expect(wakeObjective([{ name: 'Heidi', phase: 'singing' }, { name: 'Addy', phase: 'asleep' }])).toMatch(/beat/);
    expect(wakeObjective([{ name: 'Ellie', phase: 'seated' }])).toMatch(/breakfast/);
  });
});

describe('wake-up song (BeatPhrase)', () => {
  it('lays out a count-in and 4 notes one beat apart', () => {
    const b = new BeatPhrase(SONG);
    expect(b.ticks).toHaveLength(SONG.countIn);
    expect(b.times).toHaveLength(4);
    for (let i = 1; i < b.times.length; i++) expect(b.times[i]! - b.times[i - 1]!).toBeCloseTo(SONG.interval, 6);
    expect(b.times[0]!).toBeCloseTo(SONG.offset + SONG.countIn * SONG.interval, 6);
    // a comfortable tempo
    expect(60 / SONG.interval).toBeGreaterThan(70);
    expect(60 / SONG.interval).toBeLessThan(120);
  });

  it('judges perfect / good by distance to the nearest note; far presses are ignored', () => {
    const b = new BeatPhrase(SONG);
    b.advance(b.times[0]! - 0.5);
    expect(b.press()).toBeNull(); // too early: no penalty
    b.advance(0.5 - 0.05);
    expect(b.press()).toEqual({ index: 0, grade: 'perfect' });
    b.advance(b.times[1]! - b.t + 0.16);
    expect(b.press()).toEqual({ index: 1, grade: 'good' });
    // pressing again right away can't re-judge note 1 (and note 2 is far)
    expect(b.press()).toBeNull();
    expect(b.hits).toBe(2);
    expect(b.perfects).toBe(1);
  });

  it('notes that slide past their window become misses (reported once)', () => {
    const b = new BeatPhrase(SONG);
    b.advance(b.times[1]! + SONG.good + 0.01);
    const missed = [...b.sweep()];
    expect(missed).toEqual([0, 1]);
    expect(b.sweep()).toHaveLength(0);
    expect(b.grades.slice(0, 2)).toEqual(['miss', 'miss']);
  });

  it('a perfect phrase passes with accuracy 1; finished after the last window', () => {
    const b = new BeatPhrase(SONG);
    for (const t of b.times) {
      b.advance(t - b.t);
      expect(b.press()?.grade).toBe('perfect');
    }
    expect(b.finished).toBe(false);
    b.advance(b.end - b.t + 0.01);
    b.sweep();
    expect(b.finished).toBe(true);
    expect(b.passed()).toBe(true);
    expect(b.accuracy).toBeCloseTo(1, 6);
  });

  it('needs SONG_PASS hits to pass; misses just repeat, and it succeeds by the last try', () => {
    const b = new BeatPhrase(SONG);
    b.advance(b.times[0]! - b.t);
    b.press();
    b.advance(b.times[1]! - b.t);
    b.press();
    b.advance(b.end - b.t + 0.1);
    b.sweep();
    expect(b.hits).toBe(2);
    expect(b.passed()).toBe(SONG_PASS <= 2);
    expect(songSucceeded(false, 1)).toBe(false);
    expect(songSucceeded(false, SONG_TRIES)).toBe(true);
    expect(songSucceeded(true, 1)).toBe(true);
  });

  it('slide() goes from 1 (entering) to 0 (at the hit line)', () => {
    const b = new BeatPhrase(SONG);
    b.advance(b.times[0]! - SONG.lead);
    expect(b.slide(0)).toBeCloseTo(1, 6);
    b.advance(SONG.lead);
    expect(b.slide(0)).toBeCloseTo(0, 6);
  });
});

describe('sleepwalker guiding', () => {
  it('catch distance', () => {
    expect(canCatch(GUIDE.catchDist - 0.01)).toBe(true);
    expect(canCatch(GUIDE.catchDist + 0.01)).toBe(false);
  });

  it('drifts only after staying too far for the grace time', () => {
    const d = new DriftWatch();
    const far = GUIDE.driftDist + 0.5;
    expect(d.update(far, GUIDE.driftGrace * 0.6)).toBe(false);
    // coming back close resets the count
    expect(d.update(1, 0.1)).toBe(false);
    expect(d.update(far, GUIDE.driftGrace * 0.6)).toBe(false);
    expect(d.update(far, GUIDE.driftGrace * 0.6)).toBe(true);
    // and it resets after firing
    expect(d.over).toBe(0);
  });

  it('she can keep up with Chris at the guiding pace (no drift walking in a straight line)', () => {
    expect(GUIDE.followSpeed).toBeGreaterThanOrEqual(GUIDE.chrisSpeed - 0.15);
    // the NPC director boosts a follower beyond follow distance + 2.5 m: she must get that chance before drifting
    expect(GUIDE.driftDist).toBeGreaterThan(GUIDE.followDist + 2.5);
  });

  it('closeness meter 1 → 0', () => {
    expect(guideCloseness(GUIDE.followDist)).toBe(1);
    expect(guideCloseness(GUIDE.driftDist)).toBe(0);
    expect(guideCloseness(0)).toBe(1);
    expect(guideCloseness(99)).toBe(0);
  });

  it('arrives only in the kitchen near her seat', () => {
    expect(arrivedAtTable(true, GUIDE.arriveDist - 0.1)).toBe(true);
    expect(arrivedAtTable(false, 0.5)).toBe(false);
    expect(arrivedAtTable(true, GUIDE.arriveDist + 0.1)).toBe(false);
  });
});

describe('wake stars', () => {
  const base = { seconds: 60, songAccuracy: 1, songTries: 1, guideSeconds: 20, drifts: 0, rescued: 0 };

  it('a quick, on-beat, gentle morning is 3 stars', () => {
    expect(wakeStars(base)).toBe(3);
  });

  it('never below 1, never above 3', () => {
    expect(wakeStars({ seconds: 999, songAccuracy: 0, songTries: 3, guideSeconds: 99, drifts: 5, rescued: 3 })).toBe(1);
    expect(wakeStars({ seconds: 0, songAccuracy: null, songTries: 0, guideSeconds: null, drifts: 0, rescued: 0 })).toBe(3);
  });

  it('slow + sloppy lands in the middle', () => {
    expect(wakeStars({ ...base, seconds: 100, songAccuracy: 0.6, songTries: 2, guideSeconds: 40, drifts: 1 })).toBe(2);
  });

  it('a wrap-up rescue costs', () => {
    expect(wakeStars({ ...base, rescued: 2 })).toBeLessThan(3);
  });

  it('flags', () => {
    expect(wakeFlags(base, true)).toEqual(expect.arrayContaining(['wake:fast', 'wake:dj', 'wake:gentle', 'coffee:heart']));
    expect(wakeFlags({ ...base, seconds: 200, songAccuracy: 0.5, drifts: 2 }, false)).toEqual([]);
  });
});
