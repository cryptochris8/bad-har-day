import { describe, expect, it } from 'vitest';
import {
  DOG_HINT_AFTER,
  DogHelper,
  EMPTY_QUIPS,
  ITEM_ICON,
  ITEM_NAME,
  RushBook,
  ashleyShouldLeave,
  bezier,
  bezierLength,
  bezierTangent,
  emptyQuip,
  foundLine,
  forwardYaw,
  needLine,
  pickHint,
  reverseYaw,
  rushFlags,
  rushStars,
  stepAlong,
  turnsUpLine,
} from '../../../src/activities/rush/logic';
import { ASHLEY_LEAVES, T, type MissingItem } from '../../../src/plan/types';
import { generatePlan } from '../../../src/plan';
import type { ItemKind } from '../../../src/props/types';

const MISSING: MissingItem[] = [
  { item: 'shoe', girl: 'addy', spot: 'couchCushion' },
  { item: 'libraryBook', girl: 'ellie', spot: 'dogBed' },
  { item: 'hairTie', girl: 'heidi', spot: 'bathCounter' },
  { item: 'backpack', girl: 'addy', spot: 'hallBasket' },
];

describe('RushBook — search, carry, deliver', () => {
  it('looking finds the item there (one at a time); empty spots are remembered', () => {
    const b = new RushBook(MISSING);
    expect(b.remaining).toBe(4);
    expect(b.look('twinsFloor')).toEqual({ kind: 'empty' });
    expect(b.canLook('twinsFloor')).toBe(false);
    expect(b.look('twinsFloor')).toEqual({ kind: 'searched' });
    const r = b.look('couchCushion');
    expect(r.kind).toBe('found');
    expect(b.carried?.item).toBe('shoe');
    expect(b.found).toBe(1);
    // hands full: can't look anywhere else
    expect(b.canLook('dogBed')).toBe(false);
    expect(b.look('dogBed')).toEqual({ kind: 'handsFull' });
    expect(b.at('dogBed')?.item).toBe('libraryBook');
  });

  it('only the owner takes it; wrong girls say whose it is', () => {
    const b = new RushBook(MISSING);
    expect(b.give('addy')).toEqual({ kind: 'emptyHands' });
    b.look('dogBed');
    const wrong = b.give('addy');
    expect(wrong.kind).toBe('notHers');
    if (wrong.kind === 'notHers') expect(wrong.owner).toBe('ellie');
    expect(b.wrongGives).toBe(1);
    expect(b.carried?.item).toBe('libraryBook');
    const ok = b.give('ellie');
    expect(ok.kind).toBe('delivered');
    if (ok.kind === 'delivered') expect(ok.girlDone).toBe(true);
    expect(b.carried).toBeNull();
    expect(b.delivered).toBe(1);
  });

  it('girlDone only when her last item arrives', () => {
    const b = new RushBook(MISSING);
    b.look('couchCushion');
    const first = b.give('addy');
    expect(first.kind === 'delivered' && first.girlDone).toBe(false);
    expect(b.needs('addy').map((i) => i.item)).toEqual(['backpack']);
    b.look('hallBasket');
    const second = b.give('addy');
    expect(second.kind === 'delivered' && second.girlDone).toBe(true);
    expect(b.needs('addy')).toHaveLength(0);
    expect(b.wants('addy')).toHaveLength(2);
  });

  it('everything delivered → allDone; turnUpAll handles leftovers (incl. the carried one)', () => {
    const b = new RushBook(MISSING);
    for (const m of MISSING) {
      b.look(m.spot);
      b.give(m.girl);
    }
    expect(b.allDone).toBe(true);
    expect(b.turnUpAll()).toHaveLength(0);

    const c = new RushBook(MISSING);
    c.look('couchCushion'); // carrying the shoe
    const up = c.turnUpAll();
    expect(up.map((i) => i.item).sort()).toEqual(['backpack', 'hairTie', 'libraryBook', 'shoe']);
    expect(c.carried).toBeNull();
    expect(c.allDone).toBe(true);
    expect(c.delivered).toBe(0);
  });

  it('undiscovered = still hidden (not carried)', () => {
    const b = new RushBook(MISSING);
    b.look('couchCushion');
    expect(b.undiscovered().map((i) => i.spot)).toEqual(['dogBed', 'bathCounter', 'hallBasket']);
    expect(b.hiddenCount).toBe(3);
  });

  it('works for every seeded plan: all items findable and deliverable, distinct spots', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const plan = generatePlan(seed);
      const b = new RushBook(plan.missing);
      expect(b.items.length).toBeGreaterThanOrEqual(3);
      expect(new Set(plan.missing.map((m) => m.spot)).size).toBe(plan.missing.length);
      for (const m of plan.missing) {
        expect(b.look(m.spot).kind).toBe('found');
        expect(b.give(m.girl).kind).toBe('delivered');
      }
      expect(b.allDone).toBe(true);
    }
  });
});

describe('Ashley leaves at 7:45 or when everything is delivered', () => {
  it('whichever first, once, never mid-animation', () => {
    expect(ashleyShouldLeave(T(7, 30), false, false, false)).toBe(false);
    expect(ashleyShouldLeave(T(7, 30), true, false, false)).toBe(true);
    expect(ashleyShouldLeave(ASHLEY_LEAVES, false, false, false)).toBe(true);
    expect(ashleyShouldLeave(ASHLEY_LEAVES + 2, false, true, false)).toBe(false);
    expect(ashleyShouldLeave(ASHLEY_LEAVES + 2, false, false, true)).toBe(false);
  });
});

describe('the dog helps', () => {
  it('hints after DOG_HINT_AFTER s without progress, then restarts the timer', () => {
    const d = new DogHelper();
    expect(d.update(DOG_HINT_AFTER - 1, true, true)).toBe(false);
    d.progress();
    expect(d.update(DOG_HINT_AFTER - 1, true, true)).toBe(false);
    expect(d.update(1.01, true, true)).toBe(true);
    expect(d.hints).toBe(1);
    expect(d.update(1, true, true)).toBe(false);
  });

  it('waits while it can’t hint and never hints with nothing hidden', () => {
    const d = new DogHelper();
    expect(d.update(DOG_HINT_AFTER + 5, true, false)).toBe(false);
    expect(d.update(0.01, true, true)).toBe(true);
    expect(d.update(DOG_HINT_AFTER * 2, false, true)).toBe(false);
  });

  it('pickHint goes to the spot furthest from Chris', () => {
    const c = [
      { x: 1, z: 0, id: 'a' },
      { x: 10, z: 0, id: 'b' },
      { x: -3, z: 0, id: 'c' },
    ];
    expect(pickHint(c, 0, 0)?.id).toBe('b');
    expect(pickHint([], 0, 0)).toBeNull();
  });
});

describe('rush stars', () => {
  it('3 stars: everything delivered fast and before Ashley left', () => {
    expect(rushStars({ total: 4, delivered: 4, allBeforeAshley: true, seconds: 70 })).toBe(3);
  });
  it('slower but complete before 7:45 → 2–3', () => {
    expect(rushStars({ total: 4, delivered: 4, allBeforeAshley: true, seconds: 110 })).toBe(3);
    expect(rushStars({ total: 4, delivered: 4, allBeforeAshley: true, seconds: 200 })).toBe(2);
  });
  it('things turned up at the wrap-up → never 0', () => {
    expect(rushStars({ total: 5, delivered: 0, allBeforeAshley: false, seconds: 150 })).toBe(1);
    expect(rushStars({ total: 5, delivered: 3, allBeforeAshley: false, seconds: 150 })).toBe(2);
  });
  it('flags', () => {
    const f = rushFlags({ total: 3, delivered: 3, allBeforeAshley: true, seconds: 60 }, { dogHints: 1, lunches: true });
    expect(f).toEqual(expect.arrayContaining(['rush:beforeAshley', 'rush:fast', 'rush:dogHelped', 'rush:lunches']));
    expect(rushFlags({ total: 3, delivered: 1, allBeforeAshley: false, seconds: 60 }, { dogHints: 0, lunches: false })).toEqual([]);
  });
});

describe('lines', () => {
  it('needLine lists one or more items', () => {
    expect(needLine(['shoe'])).toBe('I need my left shoe!');
    expect(needLine(['backpack', 'hairTie'])).toBe('I need my backpack AND my hair tie!');
    expect(needLine(['backpack', 'hairTie', 'jacket'])).toBe('I need my backpack, my hair tie AND my jacket!');
    expect(needLine([])).toMatch(/ready/);
  });

  it('every item has a name, an icon and a "turned up" joke (the whole time)', () => {
    const kinds: ItemKind[] = ['shoe', 'backpack', 'libraryBook', 'waterBottle', 'hairTie', 'permissionSlip', 'jacket', 'lunchbox'];
    for (const k of kinds) {
      expect(ITEM_NAME[k].length).toBeGreaterThan(2);
      expect(ITEM_ICON[k]).toBeTruthy();
      expect(turnsUpLine(k, 'Ellie')).toMatch(/^Ellie/);
      expect(turnsUpLine(k, 'Ellie')).toMatch(/The whole time\.$/);
    }
    expect(turnsUpLine('libraryBook', 'Ellie')).toBe('Ellie found her library book. In her backpack. The whole time.');
  });

  it('quips rotate safely; the dog gets credit for the dog bed', () => {
    expect(emptyQuip(0)).toBe(EMPTY_QUIPS[0]);
    expect(emptyQuip(EMPTY_QUIPS.length)).toBe(EMPTY_QUIPS[0]);
    expect(emptyQuip(-1)).toBe(EMPTY_QUIPS[EMPTY_QUIPS.length - 1]);
    expect(foundLine('shoe', 'Addy', 'dogBed', 'Biscuit')).toMatch(/^Biscuit was guarding Addy’s left shoe/);
    expect(foundLine('shoe', 'Addy', 'couchCushion', 'Biscuit')).toMatch(/Aha!/);
  });
});

describe('Ashley’s car backing out', () => {
  const p0 = { x: -16, z: 2.8 };
  const c = { x: -16, z: 14.4 };
  const p2 = { x: -13.4, z: 14.4 };

  it('the curve starts at the parking spot and ends in the street', () => {
    const o = { x: 0, z: 0 };
    expect(bezier(p0, c, p2, 0, o)).toEqual({ x: -16, z: 2.8 });
    bezier(p0, c, p2, 1, o);
    expect(o.x).toBeCloseTo(-13.4, 6);
    expect(o.z).toBeCloseTo(14.4, 6);
  });

  it('reversing out of a nose-in spot: yaw π at the start, tail swinging to the house side at the end', () => {
    const t = { x: 0, z: 0 };
    bezierTangent(p0, c, p2, 0, t);
    expect(Math.abs(reverseYaw(t.x, t.z))).toBeCloseTo(Math.PI, 6);
    bezierTangent(p0, c, p2, 1, t);
    expect(reverseYaw(t.x, t.z)).toBeCloseTo(-Math.PI / 2, 6);
    // …so driving off forward goes away from the house (−X) with the same yaw
    expect(forwardYaw(-1, 0)).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('stepAlong covers the curve at a steady speed', () => {
    const len = bezierLength(p0, c, p2);
    expect(len).toBeGreaterThan(11.6);
    expect(len).toBeLessThan(15);
    const tmp = { x: 0, z: 0 };
    let u = 0;
    let steps = 0;
    while (u < 1 && steps < 10000) {
      u = stepAlong(p0, c, p2, u, 0.05, tmp);
      steps++;
    }
    expect(u).toBe(1);
    expect(steps * 0.05).toBeGreaterThan(len * 0.85);
    expect(steps * 0.05).toBeLessThan(len * 1.25);
  });
});
