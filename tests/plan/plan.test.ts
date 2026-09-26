import { describe, expect, it } from 'vitest';
import { GIRLS } from '../../src/family/types';
import { ACTS, HIDE_SPOTS, T, buildReport, dailySeed, dateKeyOf, generatePlan, gradeFor, pickAwards, shuffle } from '../../src/plan';
import type { ActivityRecord, ReportInput } from '../../src/plan';
import { Rng } from '../../src/core/rng';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 2654435761) >>> 0);

describe('generatePlan', () => {
  it('is deterministic per seed', () => {
    expect(generatePlan(1234)).toEqual(generatePlan(1234));
    expect(generatePlan(1234)).not.toEqual(generatePlan(1235));
  });

  it('always has dog + coffee first and 3..5 distinct chores', () => {
    for (const s of SEEDS) {
      const p = generatePlan(s);
      expect(p.chores.slice(0, 2)).toEqual(['dog', 'coffee']);
      expect(p.chores.length).toBeGreaterThanOrEqual(3);
      expect(p.chores.length).toBeLessThanOrEqual(5);
      expect(new Set(p.chores).size).toBe(p.chores.length);
    }
  });

  it('rotates traits: wake styles and backup brushes are permutations, grabber varies', () => {
    const grabbers = new Set<string>();
    const burritos = new Set<string>();
    for (const s of SEEDS) {
      const p = generatePlan(s);
      expect(new Set(GIRLS.map((g) => p.wake[g])).size).toBe(3);
      expect(new Set(GIRLS.map((g) => p.backupBrush[g])).size).toBe(3);
      grabbers.add(p.blackBrushGrabber);
      burritos.add(GIRLS.find((g) => p.wake[g] === 'burrito')!);
    }
    expect(grabbers.size).toBe(3);
    expect(burritos.size).toBe(3);
  });

  it('missing items: 3..5, distinct kinds and spots, valid girls; no yard spot in drizzle', () => {
    for (const s of SEEDS) {
      const p = generatePlan(s);
      expect(p.missing.length).toBeGreaterThanOrEqual(3);
      expect(p.missing.length).toBeLessThanOrEqual(5);
      expect(new Set(p.missing.map((m) => m.item)).size).toBe(p.missing.length);
      expect(new Set(p.missing.map((m) => m.spot)).size).toBe(p.missing.length);
      for (const m of p.missing) {
        expect(GIRLS).toContain(m.girl);
        expect(HIDE_SPOTS).toContain(m.spot);
        if (p.weather === 'drizzle') expect(m.spot).not.toBe('yardGrass');
      }
    }
  });

  it('hair plans are sane and drizzle guarantees a rainy-day head', () => {
    for (const s of SEEDS) {
      const p = generatePlan(s);
      for (const g of GIRLS) {
        expect(p.hair[g].doneAt).toBeGreaterThanOrEqual(0.7);
        expect(p.hair[g].doneAt).toBeLessThanOrEqual(0.9);
        if (p.weather !== 'drizzle') expect(p.hair[g].condition).not.toBe('rainy');
      }
      if (p.weather === 'drizzle') expect(GIRLS.some((g) => p.hair[g].condition === 'rainy')).toBe(true);
    }
  });

  it('drive always has the crossing guard and 4..5 distinct events', () => {
    for (const s of SEEDS) {
      const p = generatePlan(s);
      expect(p.drive).toContain('crossingGuard');
      expect(p.drive.length).toBeGreaterThanOrEqual(4);
      expect(p.drive.length).toBeLessThanOrEqual(5);
      expect(new Set(p.drive).size).toBe(p.drive.length);
    }
  });

  it('daily seeds depend only on the date', () => {
    expect(dailySeed('2026-09-26')).toBe(dailySeed('2026-09-26'));
    expect(dailySeed('2026-09-26')).not.toBe(dailySeed('2026-09-27'));
    expect(dateKeyOf(new Date(2026, 8, 6))).toBe('2026-09-06');
    const p = generatePlan(dailySeed('2026-09-26'), { daily: true, dateKey: '2026-09-26' });
    expect(p.daily).toBe(true);
    expect(p.dateKey).toBe('2026-09-26');
  });

  it('shuffle is a permutation', () => {
    const r = new Rng(7);
    const a = shuffle(r, [1, 2, 3, 4, 5, 6]);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('acts', () => {
  it('are contiguous from 5:15 to 8:05 with positive rates', () => {
    expect(ACTS[0]!.start).toBe(T(5, 15));
    expect(ACTS[ACTS.length - 1]!.end).toBe(T(8, 5));
    for (let i = 0; i < ACTS.length; i++) {
      expect(ACTS[i]!.end).toBeGreaterThan(ACTS[i]!.start);
      expect(ACTS[i]!.rate).toBeGreaterThan(0);
      if (i > 0) expect(ACTS[i]!.start).toBe(ACTS[i - 1]!.end);
    }
  });
});

function input(over: Partial<ReportInput> = {}): ReportInput {
  const records: ActivityRecord[] = [
    { id: 'dog', label: 'Dog', stars: 2, flags: [] },
    { id: 'coffee', label: 'Coffee', stars: 3, flags: [] },
    { id: 'wake', label: 'Wake', stars: 2, flags: [] },
    { id: 'hair', label: 'Hair', stars: 2, flags: [] },
    { id: 'rush', label: 'Rush', stars: 1, flags: [] },
    { id: 'drive', label: 'Drive', stars: 2, flags: [] },
  ];
  return {
    plan: generatePlan(42),
    records,
    arrival: T(8, 1),
    playSeconds: 700,
    flags: [],
    hair: {
      addy: { smooth: 0.9, momFinished: true, blackBrushSeconds: 30, solo: false },
      ellie: { smooth: 0.97, momFinished: false, blackBrushSeconds: 55, solo: true },
      heidi: { smooth: 0.8, momFinished: true, blackBrushSeconds: 0, solo: false },
    },
    loud: 2,
    dogName: 'Biscuit',
    bestArrival: T(7, 58),
    ...over,
  };
}

describe('report', () => {
  it('grades are always positive and ordered', () => {
    expect(gradeFor(1).title).toBe('PANCAKE-LEVEL PERFECT');
    expect(gradeFor(0.75).title).toBe('SMOOTH OPERATOR');
    expect(gradeFor(0.6).title).toBe('WE MADE IT!');
    expect(gradeFor(0).title).toBe('CONTROLLED CHAOS');
  });

  it('builds totals, 2..4 awards and best-arrival flag', () => {
    const r = buildReport(input());
    expect(r.totalStars).toBe(12);
    expect(r.maxStars).toBe(18);
    expect(r.awards.length).toBeGreaterThanOrEqual(2);
    expect(r.awards.length).toBeLessThanOrEqual(4);
    expect(r.newBestArrival).toBe(false);
    expect(buildReport(input({ arrival: T(7, 50) })).newBestArrival).toBe(true);
    expect(buildReport(input({ bestArrival: null })).newBestArrival).toBe(true);
  });

  it('awards reflect what happened', () => {
    const a = pickAwards(input());
    expect(a.map((x) => x.id)).toContain('coffeeArtisan');
    expect(a.map((x) => x.id)).toContain('solo');
    const mvp = pickAwards(input({ records: [] })).find((x) => x.id === 'blackBrushMvp');
    expect(mvp?.title).toContain('ELLIE');
  });

  it('never returns fewer than 2 awards even for a quiet morning', () => {
    const a = pickAwards(
      input({
        records: [],
        hair: {
          addy: { smooth: 0.5, momFinished: true, blackBrushSeconds: 0, solo: false },
          ellie: { smooth: 0.5, momFinished: true, blackBrushSeconds: 0, solo: false },
          heidi: { smooth: 0.5, momFinished: true, blackBrushSeconds: 0, solo: false },
        },
      }),
    );
    expect(a.length).toBeGreaterThanOrEqual(2);
  });
});
