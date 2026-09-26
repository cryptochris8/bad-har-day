import { describe, expect, it } from 'vitest';
import { DECLARED_SELF, HairSession } from '../../../src/activities/hair/session';
import { BRUSH_SPECS, SELF_RATE, smoothness } from '../../../src/activities/hair/rules';
import type { GirlId } from '../../../src/family/types';
import type { GirlHairPlan } from '../../../src/plan/types';

const GIRLS: GirlId[] = ['addy', 'ellie', 'heidi'];
const plan = (over: Partial<Record<GirlId, Partial<GirlHairPlan>>> = {}): Record<GirlId, GirlHairPlan> => ({
  addy: { condition: 'bedhead', doneAt: 0.8, seed: 11, ...over.addy },
  ellie: { condition: 'sleepMess', doneAt: 0.85, seed: 22, ...over.ellie },
  heidi: { condition: 'light', doneAt: 0.75, seed: 33, ...over.heidi },
});
const make = (p = plan(), holder: GirlId = 'ellie') =>
  new HairSession({ girls: GIRLS, plan: p, holder, backup: { addy: 'purple', ellie: 'pink', heidi: 'teal' }, cols: 9, rows: 4 });

describe('HairSession', () => {
  it('starts with the holder on THE BLACK BRUSH and everyone else on their backup brush', () => {
    const s = make();
    expect(s.holder).toBe('ellie');
    expect(s.focus).toBe('ellie');
    expect(s.brushOf('ellie')).toBe('black');
    expect(s.brushOf('addy')).toBe('purple');
    expect(s.brushOf('heidi')).toBe('teal');
    expect(s.spec('ellie')).toBe(BRUSH_SPECS.black);
    for (const g of GIRLS) expect(s.smooth(g)).toBeLessThan(1);
  });

  it('passing swaps brushes (the old holder gets the receiver’s brush) and counts passes', () => {
    const s = make();
    expect(s.pass('ellie')).toBe(null); // already hers
    const r = s.pass('heidi')!;
    expect(r).toEqual({ from: 'ellie', to: 'heidi', fromGets: 'teal' });
    expect(s.holder).toBe('heidi');
    expect(s.brushOf('heidi')).toBe('black');
    expect(s.brushOf('ellie')).toBe('teal');
    expect(s.brushOf('addy')).toBe('purple');
    s.pass('addy');
    expect(s.brushOf('addy')).toBe('black');
    expect(s.brushOf('heidi')).toBe('purple');
    expect(s.passes).toBe(2);
    // Exactly one black brush at any time.
    expect(GIRLS.filter((g) => s.brushOf(g) === 'black').length).toBe(1);
  });

  it('tracks black-brush seconds for whoever holds it', () => {
    const s = make();
    s.tick(2);
    s.pass('addy');
    s.tick(3);
    expect(s.g.ellie.blackSeconds).toBeCloseTo(2, 6);
    expect(s.g.addy.blackSeconds).toBeCloseTo(3, 6);
    expect(s.g.heidi.blackSeconds).toBe(0);
  });

  it('unfocused girls brush themselves (faster with the black brush); the focused one waits for the player', () => {
    const s = make(plan({ addy: { condition: 'sleepMess', seed: 5 }, heidi: { condition: 'sleepMess', seed: 5 } }), 'addy');
    s.setFocus('ellie');
    const a0 = s.smooth('addy');
    const h0 = s.smooth('heidi');
    const e0 = s.smooth('ellie');
    for (let i = 0; i < 100; i++) s.tick(0.1);
    const da = s.smooth('addy') - a0; // black brush
    const dh = s.smooth('heidi') - h0; // teal
    expect(s.smooth('ellie')).toBeCloseTo(e0, 9);
    expect(dh).toBeGreaterThan(0);
    expect(da).toBeGreaterThan(dh * 1.4);
    // Rate check: 10 s of self-brushing removes SELF_RATE × 10 total tangle (over 36 cells).
    expect(dh).toBeCloseTo((SELF_RATE * BRUSH_SPECS.teal.self * 10) / 36, 3);
  });

  it('declares "I\'M DONE!" once at the girl’s own threshold, then keeps brushing (slower)', () => {
    const s = make(plan({ heidi: { condition: 'light', doneAt: 0.9, seed: 3 } }), 'heidi');
    s.setFocus('addy');
    let declared: GirlId[] = [];
    let at = 0;
    for (let i = 0; i < 4000 && !s.g.heidi.declared; i++) {
      const ev = s.tick(0.1);
      declared = declared.concat(ev.declared);
      at = s.smooth('heidi');
    }
    expect(s.g.heidi.declared).toBe(true);
    expect(declared.filter((g) => g === 'heidi').length).toBe(1);
    expect(at).toBeGreaterThanOrEqual(0.9);
    const at5 = s.smooth('heidi');
    s.tick(5);
    expect(s.smooth('heidi')).toBeGreaterThan(at5); // she keeps fussing with it
    expect(s.g.heidi.declared).toBe(true);
  });

  it('manual DONE for the focused girl confirms her (Mom may inspect); self-declares only declare', () => {
    const s = make();
    expect(s.declare('ellie', true)).toBe(true);
    expect(s.declare('ellie', true)).toBe(false);
    expect(s.g.ellie.declaredByPlayer).toBe(true);
    expect(s.g.ellie.confirmed).toBe(true);
    expect(s.allDeclared).toBe(false);
    s.declare('addy');
    s.declare('heidi');
    expect(s.allDeclared).toBe(true);
    expect(s.allConfirmed).toBe(false); // everyone SAYS so — the player still decides (or calls Mom)
    s.confirmAll();
    expect(s.allConfirmed).toBe(true);
  });

  it('the FOCUSED girl never declares herself done — only DONE or 100 % does', () => {
    const s = make(plan({ ellie: { condition: 'light', doneAt: 0.7, seed: 3 } }), 'ellie');
    s.g.ellie.field.fill(0.05); // 95 % — way past her threshold
    for (let i = 0; i < 300; i++) s.tick(0.1);
    expect(s.g.ellie.declared).toBe(false);
    s.g.ellie.field.fill(0);
    const ev = s.tick(0.1);
    expect(ev.perfect).toContain('ellie');
    expect(s.g.ellie.declared && s.g.ellie.confirmed).toBe(true);
  });

  it('declared girls keep brushing themselves, a bit slower', () => {
    const s = make(plan({ addy: { condition: 'sleepMess', seed: 5 }, heidi: { condition: 'sleepMess', seed: 5 } }), 'ellie');
    s.g.addy.declared = true; // same hair and brush speed class (purple vs teal); one of them says she's done
    const a0 = s.smooth('addy');
    const h0 = s.smooth('heidi');
    for (let i = 0; i < 50; i++) s.tick(0.1);
    const da = s.smooth('addy') - a0;
    const dh = s.smooth('heidi') - h0;
    expect(da).toBeGreaterThan(0);
    expect(da).toBeLessThan(dh);
    expect(da / dh).toBeCloseTo(DECLARED_SELF, 1);
  });

  it('picture day: a one-time "perfect" event at 100 %', () => {
    const s = make(plan({ addy: { condition: 'pictureDay', seed: 8 } }), 'addy');
    s.setFocus('ellie');
    s.g.addy.field.fill(0.0005);
    const ev = s.tick(0.1);
    expect(ev.perfect).toContain('addy');
    expect(s.tick(0.1).perfect).not.toContain('addy');
  });

  it('player strokes use the girl’s brush and her condition’s rate', () => {
    const s = make(plan({ addy: { condition: 'extraLong', seed: 4 }, heidi: { condition: 'extraLong', seed: 4 } }), 'addy');
    const before = smoothness(s.g.addy.field);
    const r1 = s.stroke('addy', 0.5, 0.76, 0.5, 0.99, 0.2, 0.76);
    const r2 = s.stroke('heidi', 0.5, 0.76, 0.5, 0.99, 0.2, 0.76);
    expect(r1.removed).toBeGreaterThan(r2.removed); // black vs teal on identical hair
    expect(smoothness(s.g.addy.field)).toBeGreaterThan(before);
  });

  it('focus cycling wraps around', () => {
    const s = make();
    s.setFocus('addy');
    expect(s.cycleFocus(-1)).toBe('heidi');
    expect(s.cycleFocus(1)).toBe('addy');
    expect(s.cycleFocus(1)).toBe('ellie');
    expect(s.setFocus('ellie')).toBe(false);
  });
});
