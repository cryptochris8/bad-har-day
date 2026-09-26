import { describe, expect, it } from 'vitest';
import {
  DishTally,
  ZONE_OF,
  buildQueue,
  clinkPitch,
  dishesStars,
  rackSlot,
  wrongHint,
  zoneForDir,
} from '../../../src/activities/dishes/logic';
import { Rng } from '../../../src/core/rng';
import { DISH_KINDS } from '../../../src/props';

describe('sorting rules', () => {
  it('maps every dish kind to its zone', () => {
    for (const k of DISH_KINDS) expect(['bottom', 'top', 'basket']).toContain(ZONE_OF[k]);
    expect(ZONE_OF.plate).toBe('bottom');
    expect(ZONE_OF.bowl).toBe('bottom');
    expect(ZONE_OF.pan).toBe('bottom');
    expect(ZONE_OF.cup).toBe('top');
    expect(ZONE_OF.glass).toBe('top');
    expect(ZONE_OF.sippy).toBe('top');
    expect(ZONE_OF.fork).toBe('basket');
    expect(ZONE_OF.spoon).toBe('basket');
    expect(ZONE_OF.butterKnife).toBe('basket');
  });
  it('maps directions: left = bottom rack, up = top rack, right = basket', () => {
    expect(zoneForDir('left')).toBe('bottom');
    expect(zoneForDir('up')).toBe('top');
    expect(zoneForDir('right')).toBe('basket');
    expect(zoneForDir('down')).toBeNull();
    expect(zoneForDir(null)).toBeNull();
  });
  it('gives gentle hints', () => {
    expect(wrongHint('cup')).toBe('Cups go on top!');
    expect(wrongHint('plate')).toMatch(/bottom rack/);
    expect(wrongHint('fork')).toMatch(/basket/);
  });
});

describe('dish queue', () => {
  it('is 9–12 dishes using every zone, with some sticky ones (not the first)', () => {
    for (let seed = 1; seed < 120; seed++) {
      const r = new Rng(seed);
      const q = buildQueue(() => r.next(), 4);
      expect(q.length).toBeGreaterThanOrEqual(9);
      expect(q.length).toBeLessThanOrEqual(12);
      const zones = new Set(q.map((d) => ZONE_OF[d.kind]));
      expect(zones.size).toBe(3);
      const dirty = q.filter((d) => d.dirty).length;
      expect(dirty).toBeGreaterThanOrEqual(2);
      expect(dirty).toBeLessThanOrEqual(Math.ceil(q.length / 2));
      expect(q[0]!.dirty).toBe(false);
      for (const d of q) {
        expect(d.color).toBeGreaterThanOrEqual(0);
        expect(d.color).toBeLessThan(4);
      }
      expect(q.filter((d) => d.kind === 'pan').length).toBeLessThanOrEqual(1);
    }
  });
  it('is deterministic', () => {
    const a = new Rng(3);
    const b = new Rng(3);
    expect(buildQueue(() => a.next())).toEqual(buildQueue(() => b.next()));
  });
});

describe('tally + stars', () => {
  it('tracks streaks and accuracy', () => {
    const t = new DishTally();
    expect(t.accuracy).toBe(1);
    t.record(true);
    t.record(true);
    t.record(false);
    t.record(true);
    expect(t.streak).toBe(1);
    expect(t.best).toBe(2);
    expect(t.accuracy).toBeCloseTo(0.75);
  });
  it('clink pitch rises with the streak and caps', () => {
    expect(clinkPitch(1)).toBe(1);
    expect(clinkPitch(5)).toBeGreaterThan(clinkPitch(2));
    expect(clinkPitch(100)).toBe(1.6);
  });
  it('3 stars for a clean, quick run; never 0', () => {
    const clean = new DishTally();
    for (let i = 0; i < 10; i++) clean.record(true);
    clean.rinses = 3;
    expect(dishesStars(clean, 10, 30)).toBe(3);
    expect(dishesStars(clean, 10, 200)).toBe(2);
    const messy = new DishTally();
    for (let i = 0; i < 10; i++) {
      messy.record(i % 2 === 0);
      messy.record(true);
    }
    expect(dishesStars(messy, 10, 200)).toBe(1);
    expect(dishesStars(new DishTally(), 10, Number.NaN)).toBeGreaterThanOrEqual(1);
  });
});

describe('rack slots', () => {
  it('gives distinct neat slots inside each rack', () => {
    for (const zone of ['bottom', 'top', 'basket'] as const) {
      const seen = new Set<string>();
      const kind = zone === 'top' ? 'cup' : zone === 'basket' ? 'fork' : 'plate';
      for (let i = 0; i < 6; i++) {
        const s = rackSlot(zone, i, kind);
        expect(Math.abs(s.x)).toBeLessThan(0.26);
        expect(Math.abs(s.z)).toBeLessThan(0.25);
        seen.add(`${s.x.toFixed(3)},${s.z.toFixed(3)}`);
      }
      expect(seen.size).toBe(6);
    }
    expect(rackSlot('top', 0, 'glass').pose).toBe('inverted');
    expect(rackSlot('basket', 0, 'spoon').pose).toBe('standing');
    expect(rackSlot('bottom', 0, 'pan').pose).toBe('tilted');
  });
});
