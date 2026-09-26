import { describe, expect, it } from 'vitest';
import {
  CATS,
  FOODS_BY_CAT,
  allDone,
  autoPack,
  boxDone,
  buildSpread,
  favoritesPacked,
  fitsSomewhere,
  fullLine,
  lunchStars,
  newPacking,
  packedCount,
  place,
  spreadCells,
  suggestFood,
} from '../../../src/activities/lunch/logic';
import { Rng } from '../../../src/core/rng';
import { GIRLS, type GirlId } from '../../../src/family/types';
import { FOOD_CATEGORY, type FoodKind } from '../../../src/props/types';

const favSets: Record<GirlId, FoodKind>[] = [
  { addy: 'grapes', ellie: 'pretzels', heidi: 'juiceBox' },
  { addy: 'grapes', ellie: 'grapes', heidi: 'grapes' },
  { addy: 'pbj', ellie: 'wrap', heidi: 'sandwich' },
  { addy: 'milkCarton', ellie: 'milkCarton', heidi: 'waterBottle' },
];

describe('food spread', () => {
  it('has 13–14 foods, 3–4 per category, every favourite (once per girl), 1–2 notes', () => {
    for (let seed = 1; seed < 80; seed++) {
      for (const fav of favSets) {
        const r = new Rng(seed);
        const s = buildSpread(() => r.next(), fav);
        expect(s.foods.length).toBeGreaterThanOrEqual(13);
        expect(s.foods.length).toBeLessThanOrEqual(14);
        expect(s.notes === 1 || s.notes === 2).toBe(true);
        for (const cat of CATS) {
          const n = s.foods.filter((k) => FOOD_CATEGORY[k] === cat).length;
          expect(n).toBeGreaterThanOrEqual(3);
          expect(n).toBeLessThanOrEqual(4);
        }
        // Each girl's favourite is on the counter — as many copies as girls who love it.
        const need = new Map<FoodKind, number>();
        for (const g of GIRLS) need.set(fav[g], (need.get(fav[g]) ?? 0) + 1);
        for (const [k, n] of need) expect(s.foods.filter((f) => f === k).length).toBeGreaterThanOrEqual(n);
        expect(s.foods.includes('loveNote')).toBe(false);
      }
    }
  });
  it('is deterministic per seed', () => {
    const a = new Rng(9);
    const b = new Rng(9);
    expect(buildSpread(() => a.next(), favSets[0]!)).toEqual(buildSpread(() => b.next(), favSets[0]!));
  });
  it('every category pool is non-empty', () => {
    for (const c of CATS) expect(FOODS_BY_CAT[c].length).toBeGreaterThanOrEqual(3);
  });
});

describe('counter layout', () => {
  it('groups by category (two columns each), tall items in the back row, notes in free cells, no overlaps', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = new Rng(seed);
      const s = buildSpread(() => r.next(), favSets[seed % favSets.length]!);
      const h = (k: FoodKind) => (k === 'juiceBox' ? 0.17 : k === 'appleSlices' ? 0.02 : 0.08);
      const cells = spreadCells(s, h);
      expect(cells.length).toBe(s.foods.length + s.notes);
      const keys = new Set(cells.map((c) => `${c.col},${c.row}`));
      expect(keys.size).toBe(cells.length);
      for (const c of cells) {
        expect(c.col).toBeGreaterThanOrEqual(0);
        expect(c.col).toBeLessThan(8);
        expect(c.row === 0 || c.row === 1).toBe(true);
        const cat = FOOD_CATEGORY[c.kind];
        if (cat !== 'extra') expect(Math.floor(c.col / 2)).toBe(CATS.indexOf(cat));
      }
      // Within a category column pair, the back row is never shorter than the front row.
      for (let ci = 0; ci < 4; ci++) {
        const back = cells.filter((c) => Math.floor(c.col / 2) === ci && c.row === 0 && c.kind !== 'loveNote').map((c) => h(c.kind));
        const front = cells.filter((c) => Math.floor(c.col / 2) === ci && c.row === 1 && c.kind !== 'loveNote').map((c) => h(c.kind));
        if (back.length && front.length) expect(Math.min(...back)).toBeGreaterThanOrEqual(Math.max(...front));
      }
    }
  });
});

describe('packing', () => {
  it('fills one compartment per category and bounces the second one', () => {
    const p = newPacking();
    expect(place(p, 'addy', 'sandwich')).toBe('placed');
    expect(place(p, 'addy', 'wrap')).toBe('full');
    expect(p.addy.main).toBe('sandwich');
    expect(place(p, 'addy', 'loveNote')).toBe('note');
    expect(place(p, 'addy', 'loveNote')).toBe('noteFull');
    expect(packedCount(p.addy)).toBe(1);
    expect(boxDone(p.addy)).toBe(false);
    place(p, 'addy', 'crackers');
    place(p, 'addy', 'milkCarton');
    place(p, 'addy', 'banana');
    expect(boxDone(p.addy)).toBe(true);
    expect(allDone(p)).toBe(false);
  });
  it('knows whose favourite made it into her own box', () => {
    const p = newPacking();
    const fav = { addy: 'grapes', ellie: 'pretzels', heidi: 'juiceBox' } as const;
    place(p, 'ellie', 'grapes'); // Addy's favourite in Ellie's box: fine, just not a heart for Addy
    place(p, 'heidi', 'juiceBox');
    expect(favoritesPacked(p, fav)).toEqual({ addy: false, ellie: false, heidi: true });
  });
  it('has a gentle line for every category', () => {
    for (const k of ['sandwich', 'pretzels', 'juiceBox', 'banana', 'loveNote'] as FoodKind[]) expect(fullLine(k)).toMatch(/She already has/);
  });
});

describe('auto-pack', () => {
  it('completes every box from the spread, favourites first', () => {
    for (let seed = 1; seed < 60; seed++) {
      const fav = favSets[seed % favSets.length]!;
      const r = new Rng(seed);
      const s = buildSpread(() => r.next(), fav);
      const p = newPacking();
      // a few manual placements first
      place(p, 'addy', s.foods.find((k) => FOOD_CATEGORY[k] === 'snack')!);
      const avail = s.foods.slice();
      avail.splice(avail.indexOf(p.addy.snack!), 1);
      const moves = autoPack(p, avail, fav);
      const usedIdx = new Set(moves.map((m) => m.index));
      expect(usedIdx.size).toBe(moves.length);
      for (const m of moves) {
        expect(avail[m.index]).toBe(m.kind);
        expect(place(p, m.girl, m.kind)).toBe('placed');
      }
      expect(allDone(p)).toBe(true);
      // every girl whose favourite was still on the counter (and slot free) gets it
      const got = favoritesPacked(p, fav);
      const favCount = GIRLS.filter((g) => got[g]).length;
      expect(favCount).toBeGreaterThanOrEqual(fav.addy === fav.ellie && fav.ellie === fav.heidi ? 3 : 2);
    }
  });
  it('does nothing when every box is already full', () => {
    const p = newPacking();
    for (const g of GIRLS) {
      place(p, g, 'sandwich');
      place(p, g, 'crackers');
      place(p, g, 'waterBottle');
      place(p, g, 'banana');
    }
    expect(autoPack(p, ['wrap', 'grapes'], {})).toEqual([]);
  });
});

describe('lunch stars', () => {
  it('rewards favourites + pace, never 0', () => {
    expect(lunchStars(3, 30)).toBe(3);
    expect(lunchStars(3, 60)).toBe(3);
    expect(lunchStars(3, 120)).toBe(2);
    expect(lunchStars(2, 30)).toBe(2);
    expect(lunchStars(1, 30)).toBe(2);
    expect(lunchStars(1, 200)).toBe(1);
    expect(lunchStars(0, 200)).toBe(1);
  });
});

describe('cursor suggestions (keys / gamepad)', () => {
  const fav = { addy: 'grapes', ellie: 'pretzels', heidi: 'juiceBox' } as const;
  const at = (kind: FoodKind, x: number, packed = false) => ({ kind, packed, x, z: 0 });
  it('knows when a food still fits somewhere', () => {
    const p = newPacking();
    expect(fitsSomewhere(p, 'milkCarton')).toBe(true);
    for (const g of GIRLS) place(p, g, 'waterBottle');
    expect(fitsSomewhere(p, 'milkCarton')).toBe(false);
    expect(fitsSomewhere(p, 'loveNote')).toBe(true);
    for (const g of GIRLS) place(p, g, 'loveNote');
    expect(fitsSomewhere(p, 'loveNote')).toBe(false);
  });
  it('never suggests a food that fits in no box (the "already has a drink" loop)', () => {
    const p = newPacking();
    for (const g of GIRLS) place(p, g, 'waterBottle');
    const foods = [at('milkCarton', 0.01), at('sandwich', 0.5)];
    expect(suggestFood(foods, p, fav, 0, 0)).toBe(1);
  });
  it('prefers a still-needed favourite, then the nearest missing category, notes last', () => {
    const p = newPacking();
    const foods = [at('loveNote', 0), at('crackers', 0.1), at('grapes', 0.9), at('wrap', 0.2)];
    expect(suggestFood(foods, p, fav, 0, 0)).toBe(2); // Addy's grapes
    place(p, 'addy', 'grapes');
    foods[2]!.packed = true;
    expect(suggestFood(foods, p, fav, 0, 0)).toBe(1); // nearest food, not the note
    expect(suggestFood([at('loveNote', 0)], p, fav, 0, 0)).toBe(0);
  });
  it('returns −1 when everything is packed or nothing fits', () => {
    const p = newPacking();
    expect(suggestFood([at('banana', 0, true)], p, fav, 0, 0)).toBe(-1);
    for (const g of GIRLS) place(p, g, 'banana');
    expect(suggestFood([at('grapes', 0)], p, fav, 0, 0)).toBe(-1);
  });
});
