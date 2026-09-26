import { describe, expect, it } from 'vitest';
import { Chatter, CUE_LINES, IDLE_LINES, SPOT_LINES } from '../../../src/activities/drive/chatter';
import { ACT5_START, DRIVE_RATE, HURRY_AT, LOAD_RATE, SKIP_ARRIVAL, arrivalFor, cleanScore, scoreDrive, timeScore } from '../../../src/activities/drive/scoring';
import type { DriveSummary } from '../../../src/activities/drive/sim';
import { Rng } from '../../../src/core/rng';
import { SCHOOL_DEADLINE, T } from '../../../src/plan/types';

const sum = (o: Partial<DriveSummary> = {}): DriveSummary => ({ stopsOk: 3, stopsTotal: 3, bumps: 0, greens: 0, splashes: 0, honked: false, guard: 'thanks', results: [], ...o });

describe('arrival time', () => {
  it('maps drive seconds to the clock, clamped at 8:05', () => {
    expect(arrivalFor(0, 0)).toBe(ACT5_START);
    expect(arrivalFor(10, 0)).toBeCloseTo(ACT5_START + 10 * DRIVE_RATE, 9);
    expect(arrivalFor(0, 10)).toBeCloseTo(ACT5_START + 10 * LOAD_RATE, 9);
    expect(arrivalFor(10_000, 10)).toBe(SCHOOL_DEADLINE);
    expect(arrivalFor(Number.NaN, -5)).toBe(ACT5_START);
    expect(HURRY_AT).toBeLessThan(SCHOOL_DEADLINE);
    expect(SKIP_ARRIVAL).toBe(T(8, 1));
  });
  it('timeScore: 7:57 → 1, 8:01 → 0.5, 8:05 → 0', () => {
    expect(timeScore(T(7, 55))).toBe(1);
    expect(timeScore(T(7, 57))).toBe(1);
    expect(timeScore(T(8, 1))).toBeCloseTo(0.5, 9);
    expect(timeScore(T(8, 5))).toBe(0);
    expect(timeScore(Number.NaN)).toBe(0.5);
  });
  it('cleanScore falls off per bump', () => {
    expect(cleanScore(0)).toBe(1);
    expect(cleanScore(1)).toBeLessThan(1);
    expect(cleanScore(2)).toBeLessThan(cleanScore(1));
    expect(cleanScore(9)).toBe(0);
  });
});

describe('scoreDrive', () => {
  it('perfect → 3 stars + clean/guard flags', () => {
    const r = scoreDrive(sum({ greens: 1, splashes: 1, honked: true }), T(7, 57));
    expect(r.stars).toBe(3);
    expect(r.flags).toEqual(expect.arrayContaining(['drive:clean', 'drive:guard', 'drive:green', 'drive:splash', 'drive:honk']));
  });
  it('careful but slow → 2 stars', () => {
    expect(scoreDrive(sum(), T(8, 1)).stars).toBe(2);
  });
  it('bumps + missed stops + late → still at least 1 star, never 0', () => {
    const r = scoreDrive(sum({ stopsOk: 0, bumps: 4, guard: 'tsk' }), T(8, 5));
    expect(r.stars).toBe(1);
    expect(r.flags).not.toContain('drive:clean');
    expect(r.flags).not.toContain('drive:guard');
  });
  it('no stop events at all counts as fully obeyed', () => {
    expect(scoreDrive(sum({ stopsOk: 0, stopsTotal: 0 }), T(7, 57)).stars).toBe(3);
  });
});

describe('chatter', () => {
  it('has lines for every event and never repeats the same line twice in a row', () => {
    for (const lines of Object.values(SPOT_LINES)) expect(lines.length).toBeGreaterThan(0);
    const ch = new Chatter(new Rng(3));
    let last = '';
    for (let i = 0; i < 60; i++) {
      const l = ch.pick(IDLE_LINES)!;
      expect(l.text).not.toBe(last);
      last = l.text;
      const who = ch.speaker(l);
      expect(['addy', 'ellie', 'heidi', 'chris']).toContain(who);
    }
    expect(ch.pick([])).toBeNull();
    expect(ch.pick(CUE_LINES.bump)).not.toBeNull();
  });
  it('keeps the tone warm (no harsh words)', () => {
    const all = [...IDLE_LINES, ...Object.values(SPOT_LINES).flat(), ...Object.values(CUE_LINES).flat()].map((l) => l.text.toLowerCase());
    for (const t of all) for (const bad of ['crash', 'hurt', 'stupid', 'bad driver', 'dead', 'hate']) expect(t).not.toContain(bad);
  });
});
