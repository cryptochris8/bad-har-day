// ─────────────────────────────────────────────────────────────────────────────
// Family looks: the default FAMILY SETUP values and a never-throwing sanitizer for
// looks read back from storage / URL / user input (pure, no THREE).
// ─────────────────────────────────────────────────────────────────────────────
import { DOG_COATS, SKIN_TONES, type DogCoat } from '../render/palette';
import { MEMBERS, type DogLook, type FamilyLooks, type MemberId, type MemberLook } from './types';

export const DEFAULT_DOG_NAME = 'Biscuit';
export const DOG_NAME_MAX = 14;
/** C0/C1 control characters + Unicode line/paragraph separators. */
const CONTROL_CHARS = new RegExp('[\u0000-\u001f\u007f-\u009f\u2028\u2029]', 'g');
const BEARDS: readonly MemberLook['beard'][] = ['none', 'stubble', 'beard'];

export const DEFAULT_LOOKS: FamilyLooks = {
  members: {
    chris: { skin: 1, hair: 0x44291b, eyes: 0x4a2e1f, glasses: false, beard: 'beard' },
    ashley: { skin: 1, hair: 0x6b3d24, eyes: 0x4f7f4f, glasses: false, beard: 'none' },
    addy: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
    ellie: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
    heidi: { skin: 1, hair: 0x7a4a2a, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
  },
  dog: { name: DEFAULT_DOG_NAME, coat: 'golden' },
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Integer colour 0..0xffffff, else the fallback. */
export function sanitizeColor(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : fallback;
}

/** Skin index clamped to the SKIN_TONES range (rounded), else the fallback. */
export function sanitizeSkin(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(0, Math.min(SKIN_TONES.length - 1, Math.round(v)));
}

/** Dog name: control characters stripped, trimmed, ≤ 14 characters, empty → "Biscuit". */
export function sanitizeDogName(v: unknown): string {
  if (typeof v !== 'string') return DEFAULT_DOG_NAME;
  const clean = v.replace(CONTROL_CHARS, '').trim();
  const chars = Array.from(clean).slice(0, DOG_NAME_MAX).join('').trim();
  return chars.length > 0 ? chars : DEFAULT_DOG_NAME;
}

export function isDogCoat(v: unknown): v is DogCoat {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DOG_COATS, v);
}

export function sanitizeMember(input: unknown, def: MemberLook): MemberLook {
  const o = isRecord(input) ? input : {};
  const beard = o.beard;
  return {
    skin: sanitizeSkin(o.skin, def.skin),
    hair: sanitizeColor(o.hair, def.hair),
    eyes: sanitizeColor(o.eyes, def.eyes),
    glasses: typeof o.glasses === 'boolean' ? o.glasses : def.glasses,
    beard: typeof beard === 'string' && (BEARDS as readonly string[]).includes(beard) ? (beard as MemberLook['beard']) : def.beard,
  };
}

export function sanitizeDog(input: unknown): DogLook {
  const o = isRecord(input) ? input : {};
  return { name: sanitizeDogName(o.name), coat: isDogCoat(o.coat) ? o.coat : DEFAULT_LOOKS.dog.coat };
}

export function cloneLooks(l: FamilyLooks): FamilyLooks {
  const members = {} as Record<MemberId, MemberLook>;
  for (const id of MEMBERS) members[id] = { ...l.members[id] };
  return { members, dog: { ...l.dog } };
}

/** Never throws; every missing / invalid field falls back to its default. Always returns a fresh object. */
export function sanitizeLooks(input: unknown): FamilyLooks {
  try {
    const o = isRecord(input) ? input : {};
    const mem = isRecord(o.members) ? o.members : {};
    const members = {} as Record<MemberId, MemberLook>;
    for (const id of MEMBERS) members[id] = sanitizeMember(mem[id], DEFAULT_LOOKS.members[id]);
    return { members, dog: sanitizeDog(o.dog) };
  } catch {
    // Hostile getters / proxies: fall back to the defaults.
    return cloneLooks(DEFAULT_LOOKS);
  }
}

/** Stable cache key for a member look (geometry sharing). */
export function lookKey(l: MemberLook): string {
  return `${l.skin}|${l.hair.toString(16)}|${l.eyes.toString(16)}|${l.glasses ? 1 : 0}|${l.beard}`;
}
