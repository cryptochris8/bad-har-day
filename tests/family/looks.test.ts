import { describe, expect, it } from 'vitest';
import { DOG_COATS, SKIN_TONES } from '../../src/render/palette';
import { DEFAULT_DOG_NAME, DEFAULT_LOOKS, cloneLooks, isDogCoat, lookKey, sanitizeColor, sanitizeDogName, sanitizeLooks, sanitizeSkin } from '../../src/family/looks';
import { MEMBERS } from '../../src/family/types';

describe('DEFAULT_LOOKS', () => {
  it('has the requested defaults', () => {
    for (const id of MEMBERS) expect(DEFAULT_LOOKS.members[id].skin).toBe(1);
    expect(DEFAULT_LOOKS.members.chris.hair).toBe(0x44291b);
    expect(DEFAULT_LOOKS.members.chris.beard).toBe('beard');
    expect(DEFAULT_LOOKS.members.ashley.hair).toBe(0x6b3d24);
    expect(DEFAULT_LOOKS.members.addy.hair).toBe(0x6b3d24);
    expect(DEFAULT_LOOKS.members.ellie.hair).toBe(0x6b3d24);
    expect(DEFAULT_LOOKS.members.heidi.hair).toBe(0x7a4a2a);
    expect(DEFAULT_LOOKS.dog).toEqual({ name: 'Biscuit', coat: 'golden' });
  });

  it('is a valid look (sanitizing it is the identity)', () => {
    expect(sanitizeLooks(DEFAULT_LOOKS)).toEqual(DEFAULT_LOOKS);
  });
});

describe('sanitizeLooks', () => {
  it('never throws and fills defaults for garbage input', () => {
    for (const bad of [undefined, null, 0, 1, 'x', [], [1, 2], true, () => 1, Symbol('s'), { members: 5 }, { members: [] }, { dog: 'x' }]) {
      const l = sanitizeLooks(bad);
      expect(l).toEqual(DEFAULT_LOOKS);
    }
  });

  it('survives hostile getters', () => {
    const evil = {
      get members(): unknown {
        throw new Error('boom');
      },
    };
    expect(sanitizeLooks(evil)).toEqual(DEFAULT_LOOKS);
    const evil2 = { members: { chris: new Proxy({}, { get: () => { throw new Error('x'); } }) } };
    expect(sanitizeLooks(evil2)).toEqual(DEFAULT_LOOKS);
  });

  it('returns a fresh object each time (defaults are never shared)', () => {
    const a = sanitizeLooks({});
    a.members.chris.hair = 0x123456;
    a.dog.name = 'Rex';
    expect(DEFAULT_LOOKS.members.chris.hair).toBe(0x44291b);
    expect(sanitizeLooks({}).dog.name).toBe('Biscuit');
  });

  it('fills defaults per field', () => {
    const l = sanitizeLooks({ members: { chris: { hair: 0x112233 } }, dog: { name: 'Pip' } });
    expect(l.members.chris.hair).toBe(0x112233);
    expect(l.members.chris.skin).toBe(1);
    expect(l.members.chris.beard).toBe('beard');
    expect(l.members.ashley).toEqual(DEFAULT_LOOKS.members.ashley);
    expect(l.dog).toEqual({ name: 'Pip', coat: 'golden' });
  });

  it('clamps skin to 0..7 and rounds it', () => {
    expect(sanitizeLooks({ members: { addy: { skin: -3 } } }).members.addy.skin).toBe(0);
    expect(sanitizeLooks({ members: { addy: { skin: 99 } } }).members.addy.skin).toBe(SKIN_TONES.length - 1);
    expect(sanitizeLooks({ members: { addy: { skin: 2.6 } } }).members.addy.skin).toBe(3);
    expect(sanitizeLooks({ members: { addy: { skin: NaN } } }).members.addy.skin).toBe(1);
    expect(sanitizeLooks({ members: { addy: { skin: '4' } } }).members.addy.skin).toBe(1);
    expect(SKIN_TONES.length - 1).toBe(7);
  });

  it('accepts only integer colours 0..0xffffff', () => {
    const c = (v: unknown) => sanitizeLooks({ members: { heidi: { hair: v, eyes: v } } }).members.heidi;
    expect(c(0).hair).toBe(0);
    expect(c(0xffffff).hair).toBe(0xffffff);
    expect(c(0x1000000).hair).toBe(0x7a4a2a);
    expect(c(-1).hair).toBe(0x7a4a2a);
    expect(c(12.5).hair).toBe(0x7a4a2a);
    expect(c('#ff0000').hair).toBe(0x7a4a2a);
    expect(c(Infinity).eyes).toBe(DEFAULT_LOOKS.members.heidi.eyes);
    expect(sanitizeColor(0xabcdef, 1)).toBe(0xabcdef);
    expect(sanitizeColor(null, 7)).toBe(7);
  });

  it('validates beard and glasses', () => {
    expect(sanitizeLooks({ members: { chris: { beard: 'stubble' } } }).members.chris.beard).toBe('stubble');
    expect(sanitizeLooks({ members: { chris: { beard: 'none' } } }).members.chris.beard).toBe('none');
    expect(sanitizeLooks({ members: { chris: { beard: 'goatee' } } }).members.chris.beard).toBe('beard');
    expect(sanitizeLooks({ members: { chris: { glasses: true } } }).members.chris.glasses).toBe(true);
    expect(sanitizeLooks({ members: { chris: { glasses: 'yes' } } }).members.chris.glasses).toBe(false);
  });

  it('sanitizes the dog name', () => {
    expect(sanitizeDogName('  Rex  ')).toBe('Rex');
    expect(sanitizeDogName('')).toBe(DEFAULT_DOG_NAME);
    expect(sanitizeDogName('   ')).toBe(DEFAULT_DOG_NAME);
    expect(sanitizeDogName(42)).toBe(DEFAULT_DOG_NAME);
    expect(sanitizeDogName('Ab\u0000c\u0007d\n\te\u007f\u009b')).toBe('Abcde');
    expect(sanitizeDogName('Sir Wigglesworth the Third')).toBe('Sir Wigglesworth the Third'.slice(0, 14).trim());
    expect(sanitizeDogName('Sir Wigglesworth the Third').length).toBeLessThanOrEqual(14);
    expect(sanitizeDogName('\u0001\u0002')).toBe(DEFAULT_DOG_NAME);
    expect(sanitizeDogName('<b>Bo</b>')).toBe('<b>Bo</b>');
    // Emoji count as single characters (never split a surrogate pair).
    const e = sanitizeDogName('🐶'.repeat(20));
    expect(Array.from(e).length).toBe(14);
    expect(e.includes('\ud83d\u0000')).toBe(false);
    expect(sanitizeLooks({ dog: { name: 'Max' + ' '.repeat(11) + 'Power!' } }).dog.name).toBe('Max');
  });

  it('accepts only DOG_COATS keys', () => {
    for (const k of Object.keys(DOG_COATS)) expect(sanitizeLooks({ dog: { coat: k } }).dog.coat).toBe(k);
    expect(sanitizeLooks({ dog: { coat: 'purple' } }).dog.coat).toBe('golden');
    expect(sanitizeLooks({ dog: { coat: 'toString' } }).dog.coat).toBe('golden');
    expect(isDogCoat('__proto__')).toBe(false);
  });

  it('helpers', () => {
    expect(sanitizeSkin(3.4, 1)).toBe(3);
    const c = cloneLooks(DEFAULT_LOOKS);
    expect(c).toEqual(DEFAULT_LOOKS);
    expect(c.members.chris).not.toBe(DEFAULT_LOOKS.members.chris);
    expect(lookKey(DEFAULT_LOOKS.members.chris)).not.toBe(lookKey({ ...DEFAULT_LOOKS.members.chris, glasses: true }));
  });
});
