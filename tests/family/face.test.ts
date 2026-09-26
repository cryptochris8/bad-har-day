import { describe, expect, it } from 'vitest';
import { EXPRESSIONS, faceFor, type FaceFlavor } from '../../src/family/expressions';
import { EYE_SHAPES, MOUTHS } from '../../src/family/skeleton';
import { LOW_MOUTHS } from '../../src/family/head';
import type { Expression } from '../../src/family/types';

const ALL: Expression[] = ['neutral', 'happy', 'joy', 'sleepy', 'asleep', 'surprised', 'determined', 'worried', 'pout', 'smug', 'love', 'eek', 'dramatic', 'proud', 'yawn'];
const FLAVORS: FaceFlavor[] = ['chris', 'ashley', 'girl', 'extra'];

describe('expression table', () => {
  it('covers every contract Expression', () => {
    expect([...EXPRESSIONS].sort()).toEqual([...ALL].sort());
  });

  it('every target is complete, finite and in range', () => {
    for (const fl of FLAVORS) {
      for (const e of ALL) {
        const f = faceFor(e, fl);
        expect(EYE_SHAPES).toContain(f.eyeL);
        expect(EYE_SHAPES).toContain(f.eyeR);
        expect(MOUTHS).toContain(f.mouth);
        for (const k of ['lid', 'lidR', 'lidTilt', 'lowLid', 'browY', 'browTilt', 'browAsym', 'pupil', 'pupilY', 'mouthScale', 'blush', 'headX', 'headZ'] as const) {
          expect(Number.isFinite(f[k]), `${fl}.${e}.${k}`).toBe(true);
        }
        expect(f.lid).toBeGreaterThanOrEqual(-1);
        expect(f.lid).toBeLessThanOrEqual(1);
        expect(f.lowLid).toBeGreaterThanOrEqual(0);
        expect(f.lowLid).toBeLessThanOrEqual(0.6);
        expect(f.pupil).toBeGreaterThan(0.5);
        expect(f.pupil).toBeLessThan(1.5);
        expect(f.mouthScale).toBeGreaterThan(0.5);
        expect(f.blush).toBeGreaterThanOrEqual(0);
        expect(Math.abs(f.headX)).toBeLessThan(0.4);
      }
    }
  });

  it('is shared + frozen (no per-frame allocation)', () => {
    expect(faceFor('happy', 'girl')).toBe(faceFor('happy', 'girl'));
    expect(Object.isFrozen(faceFor('joy', 'chris'))).toBe(true);
  });

  it('reads the intended shapes', () => {
    expect(faceFor('joy', 'girl').eyeL).toBe('joy');
    expect(faceFor('asleep', 'girl').eyeL).toBe('closed');
    expect(faceFor('asleep', 'girl').eyeR).toBe('closed');
    expect(faceFor('yawn', 'girl').mouth).toBe('yawn');
    expect(faceFor('surprised', 'girl').mouth).toBe('o');
    expect(faceFor('surprised', 'girl').pupil).toBeLessThan(1);
    expect(faceFor('love', 'girl').pupil).toBeGreaterThan(1.2);
    expect(faceFor('pout', 'girl').mouth).toBe('pout');
    expect(faceFor('worried', 'girl').browTilt).toBeLessThan(0);
    // 'eek' = playful "eep! oops!" (brush snag), never a pain wince: eyes open wide, brows up,
    // small round mouth, no squeezed eyes and no gritted teeth.
    const eek = faceFor('eek', 'girl');
    expect(eek.eyeL).toBe('open');
    expect(eek.eyeR).toBe('open');
    expect(eek.lid).toBeLessThan(0);
    expect(eek.lidR).toBeLessThanOrEqual(0);
    expect(eek.browY).toBeGreaterThan(0.2);
    expect(eek.mouth).toBe('o');
    // 'dramatic' = theatrical, never crying: eyes open looking up, brows high, big round O.
    const dr = faceFor('dramatic', 'girl');
    expect(dr.eyeL).toBe('open');
    expect(dr.eyeR).toBe('open');
    expect(dr.lid).toBeLessThan(0);
    expect(dr.pupilY).toBeGreaterThan(0.5);
    expect(dr.browY).toBeGreaterThan(0.3);
    expect(dr.mouth).toBe('o');
    expect(dr.mouthScale).toBeGreaterThan(1.5);
    // 'proud' = chin up (negative pitch) + smile.
    expect(faceFor('proud', 'girl').headX).toBeLessThan(0);
    expect(['smile', 'bigSmile']).toContain(faceFor('proud', 'girl').mouth);
  });

  it('keeps Ashley warm: never stern brows, determined still smiles', () => {
    for (const e of ALL) {
      const f = faceFor(e, 'ashley');
      expect(f.browTilt, e).toBeLessThanOrEqual(0.06);
      expect(f.lidTilt, e).toBeLessThanOrEqual(0.05);
    }
    expect(faceFor('determined', 'ashley').mouth).toBe('smile');
  });

  it("gives Chris sleepy-kind eyes at rest", () => {
    expect(faceFor('neutral', 'chris').lid).toBeGreaterThan(faceFor('neutral', 'girl').lid);
  });

  it('eek and dramatic never squeeze the eyes shut (no pain, no crying)', () => {
    for (const fl of FLAVORS) {
      for (const e of ['eek', 'dramatic'] as const) {
        const f = faceFor(e, fl);
        expect(f.eyeL, `${fl}.${e}`).not.toBe('squeeze');
        expect(f.eyeR, `${fl}.${e}`).not.toBe('squeeze');
        expect(f.eyeL, `${fl}.${e}`).not.toBe('closed');
      }
    }
    expect(MOUTHS as readonly string[]).not.toContain('eek');
  });

  it('has no frown / sad mouth anywhere (tone rules)', () => {
    expect(MOUTHS as readonly string[]).not.toContain('frown');
    for (const fl of FLAVORS) for (const e of ALL) expect(faceFor(e, fl).mouth).not.toBe('frown' as never);
  });

  it('low-detail mouths are a subset of all mouths', () => {
    for (const m of LOW_MOUTHS) expect(MOUTHS).toContain(m);
  });
});
