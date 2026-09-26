// Parametric cartoon faces for the DOM UI (portrait row, choice cards, family setup previews, Mom's
// boss card, credits). 100×100 viewBox, soft plum ink outlines, the family's customised skin / hair
// colours. Colours come in as numbers (FamilyLooks) and are formatted with hexColor(), so the markup is
// always a trusted constant shape — no user string ever reaches these templates.
import type { FamilyLooks, MemberId, MemberLook } from '../family/types';
import { DOG_COATS, SKIN_TONES, type DogCoat } from '../render/palette';
import { hexColor } from './dom';
import { INK } from './icons';

export type FaceMood = 'happy' | 'neutral' | 'eek' | 'proud' | 'sleepy' | 'dramatic';

export const MEMBER_ACCENT: Readonly<Record<MemberId, string>> = {
  chris: '#33507a',
  ashley: '#f0b7c6',
  addy: '#a78bfa',
  ellie: '#4fd1b5',
  heidi: '#ff8a8a',
};

/** CSS custom property per speaker (bubbles, portraits, tabs). */
export const MEMBER_VAR: Readonly<Record<MemberId, string>> = {
  chris: 'var(--bhd-chris)',
  ashley: 'var(--bhd-ashley)',
  addy: 'var(--bhd-addy)',
  ellie: 'var(--bhd-ellie)',
  heidi: 'var(--bhd-heidi)',
};

/** UI fallback looks (used until the game passes the real FamilySetup). */
export const DEFAULT_LOOKS: FamilyLooks = {
  members: {
    chris: { skin: 1, hair: 0x44291b, eyes: 0x4a2e1f, glasses: false, beard: 'beard' },
    ashley: { skin: 1, hair: 0x6b3d24, eyes: 0x4f7f4f, glasses: false, beard: 'none' },
    addy: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
    ellie: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
    heidi: { skin: 1, hair: 0x9b6536, eyes: 0x3f6f9f, glasses: false, beard: 'none' },
  },
  dog: { name: 'Biscuit', coat: 'golden' },
};

/** Darken (k < 1) or lighten (k > 1 toward white) a #rrggbb colour. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return hex;
  const ch = (v: number): number => {
    const c = k <= 1 ? v * k : v + (255 - v) * (k - 1);
    return Math.max(0, Math.min(255, Math.round(c)));
  };
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return hexColor((r << 16) | (g << 8) | b);
}

export interface FaceSpec {
  who: MemberId;
  look?: Partial<MemberLook>;
  mood?: FaceMood;
  /** Outfit accent override (default: MEMBER_ACCENT). */
  accent?: string;
  /** Extra class on the <svg>. */
  cls?: string;
}

const O = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const O2 = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const line = (d: string, w = 2.6, c = INK): string => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

function skinHex(i: number | undefined): string {
  const idx = Number.isFinite(i) ? Math.max(0, Math.min(SKIN_TONES.length - 1, Math.floor(i as number))) : 1;
  return hexColor(SKIN_TONES[idx] ?? 0xf9d0ae);
}

function eyesFor(mood: FaceMood, iris: string, sleepyDefault: boolean): string {
  const L = 39;
  const R = 61;
  const Y = 55;
  const open = (x: number, rx = 4.6, ry = 6): string =>
    `<ellipse cx="${x}" cy="${Y}" rx="${rx}" ry="${ry}" fill="${INK}"/>` +
    `<ellipse cx="${x}" cy="${Y + 1.2}" rx="${rx * 0.62}" ry="${ry * 0.55}" fill="${iris}" opacity=".85"/>` +
    `<circle cx="${x + 1.5}" cy="${Y - 2.4}" r="1.8" fill="#fff"/><circle cx="${x - 1.4}" cy="${Y + 2.4}" r=".9" fill="#fff"/>`;
  switch (mood) {
    case 'proud':
      return line(`M${L - 5} ${Y + 1}q5-6 10 0`, 3) + line(`M${R - 5} ${Y + 1}q5-6 10 0`, 3);
    case 'sleepy':
      return (
        `<ellipse cx="${L}" cy="${Y + 1.5}" rx="4.4" ry="3" fill="${INK}"/><ellipse cx="${R}" cy="${Y + 1.5}" rx="4.4" ry="3" fill="${INK}"/>` +
        line(`M${L - 6} ${Y}h12M${R - 6} ${Y}h12`, 3)
      );
    case 'eek':
      return line(`M${L - 5} ${Y - 4}l7 4-7 4`, 3) + open(R, 5, 6.4);
    case 'dramatic':
      return (
        `<circle cx="${L}" cy="${Y}" r="6.6" fill="#fff" ${O2}/><circle cx="${R}" cy="${Y}" r="6.6" fill="#fff" ${O2}/>` +
        `<circle cx="${L}" cy="${Y + 1}" r="2.6" fill="${INK}"/><circle cx="${R}" cy="${Y + 1}" r="2.6" fill="${INK}"/>`
      );
    case 'neutral':
      if (sleepyDefault) return open(L, 4.4, 5.2) + open(R, 4.4, 5.2) + line(`M${L - 5.5} ${Y - 3.5}q5.5-2 11 0M${R - 5.5} ${Y - 3.5}q5.5-2 11 0`, 2.2);
      return open(L) + open(R);
    case 'happy':
    default:
      return open(L) + open(R);
  }
}

function browsFor(mood: FaceMood, hair: string): string {
  const c = shade(hair, 0.8);
  switch (mood) {
    case 'dramatic':
      return line('M31 44q6-6 12-3M69 44q-6-6-12-3', 3.2, c);
    case 'eek':
      return line('M32 45q6-2 11 1M57 41q6-3 12 1', 3.2, c);
    case 'proud':
      return line('M32 43q6-4 12-1M56 42q6-3 12 1', 3.2, c);
    case 'sleepy':
      return line('M33 47q6-1 11 1M56 48q6-2 11-1', 3, c);
    default:
      return line('M32 45q6-4 12-1M56 44q6-3 12 1', 3.2, c);
  }
}

function mouthFor(mood: FaceMood): string {
  switch (mood) {
    case 'happy':
      return `<path d="M41 66q9 11 18 0z" fill="#8a2f3f" ${O2}/><path d="M45.5 70.5q4.5 3 9 0" fill="none" stroke="#ff8fa0" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'proud':
      return line('M40 66q10 8 20 0', 3);
    case 'eek':
      return `<rect x="40" y="64.5" width="20" height="8" rx="4" fill="#fff" ${O2}/>` + line('M44 68.5h12M47 65v7M53 65v7', 1.6);
    case 'sleepy':
      return `<ellipse cx="50" cy="69" rx="3.2" ry="3.6" fill="#8a2f3f" ${O2}/>`;
    case 'dramatic':
      return `<ellipse cx="50" cy="70" rx="6.5" ry="8.5" fill="#8a2f3f" ${O2}/><ellipse cx="50" cy="74.5" rx="3.6" ry="2.6" fill="#ff8fa0"/>`;
    case 'neutral':
    default:
      return line('M43 67q7 5 14 0', 3);
  }
}

function glassesSvg(): string {
  return (
    `<circle cx="39" cy="55" r="9" fill="#fff" fill-opacity=".22" ${O}/><circle cx="61" cy="55" r="9" fill="#fff" fill-opacity=".22" ${O}/>` +
    line('M48 54q2-2 4 0M30 53l-5-2M70 53l5-2', 3)
  );
}

function cheeks(mood: FaceMood): string {
  const o = mood === 'proud' || mood === 'eek' ? 0.75 : 0.5;
  return `<ellipse cx="31" cy="64" rx="5" ry="3.2" fill="#ff8a8a" opacity="${o}"/><ellipse cx="69" cy="64" rx="5" ry="3.2" fill="#ff8a8a" opacity="${o}"/>`;
}

/** A family member's head-and-shoulders portrait (trusted SVG markup). */
export function faceSvg(spec: FaceSpec): string {
  const who = spec.who;
  const base = DEFAULT_LOOKS.members[who];
  const look: MemberLook = { ...base, ...(spec.look ?? {}) };
  const mood: FaceMood = spec.mood ?? 'happy';
  const skin = skinHex(look.skin);
  const skinD = shade(skin, 0.86);
  const hair = hexColor(look.hair);
  const hairD = shade(hair, 0.72);
  const hairL = shade(hair, 1.35);
  const iris = hexColor(look.eyes);
  const accent = spec.accent ?? MEMBER_ACCENT[who];
  const accentD = shade(accent.startsWith('#') ? accent : '#888888', 0.8);
  const girl = who === 'addy' || who === 'ellie' || who === 'heidi';
  const heidi = who === 'heidi';
  let back = '';
  let front = '';
  let extra = '';
  let head = '';
  let body = '';

  // Shoulders / pajama top.
  body = `<path d="M18 104c2-16 14-22 32-22s30 6 32 22z" fill="${accent}" ${O}/>`;

  if (girl || who === 'ashley') {
    const wavy = who === 'ashley';
    back = wavy
      ? `<path d="M50 20c-22 0-33 16-32 36-4 10-9 20-4 30 3 7 10 9 16 14h40c6-5 13-7 16-14 5-10 0-20-4-30 1-20-10-36-32-36z" fill="${hair}" ${O}/>`
      : `<path d="M50 21c-21 0-32 15-32 34 0 12-5 24-3 34 1 6 4 10 8 13h54c4-3 7-7 8-13 2-10-3-22-3-34 0-19-11-34-32-34z" fill="${hair}" ${O}/>`;
    back += `<path d="M26 64c-1 10-3 19 0 28M74 64c1 10 3 19 0 28" fill="none" stroke="${hairD}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
    if (who === 'ashley') body = `<path d="M18 104c2-16 14-22 32-22s30 6 32 22z" fill="${accent}" ${O}/><path d="M42 83l8 11 8-11" fill="none" ${O2}/>`;
    const rx = heidi ? 26.5 : 25;
    const ry = heidi ? 25 : 27;
    head = `<path d="M44 76h12v10H44z" fill="${skinD}" ${O2}/><ellipse cx="50" cy="${heidi ? 54 : 53}" rx="${rx}" ry="${ry}" fill="${skin}" ${O}/>`;
    // Bangs.
    front = wavy
      ? `<path d="M24 54c-2-19 11-31 27-31 15 0 27 10 26 27-6-9-14-14-25-14-7 5-17 11-28 18z" fill="${hair}" ${O}/>`
      : `<path d="M25 52c-1-18 11-29 25-29 15 0 26 11 25 28-4-7-9-10-15-10-3 3-7 5-12 5 2-2 3-4 3-6-6 5-15 9-26 12z" fill="${hair}" ${O}/>`;
    front += `<path d="M38 30q10-4 20 0" fill="none" stroke="${hairL}" stroke-width="3" stroke-linecap="round" opacity=".8"/>`;
    if (who === 'addy') {
      // Lavender headband.
      extra = `<path d="M26 44c4-15 14-22 24-22s20 7 24 22" fill="none" stroke="${INK}" stroke-width="8.5" stroke-linecap="round"/><path d="M26 44c4-15 14-22 24-22s20 7 24 22" fill="none" stroke="#a78bfa" stroke-width="4.8" stroke-linecap="round"/><circle cx="72" cy="40" r="5" fill="#c7b4ff" ${O2}/>`;
    } else if (who === 'ellie') {
      // Mint bow clip.
      extra = `<path d="M66 33l9-6v12zM66 33l-9-6v12z" fill="#4fd1b5" ${O2}/><circle cx="66" cy="33" r="3.2" fill="#8ff0da" ${O2}/>`;
    } else if (heidi) {
      // Coral star clip.
      extra = `<path d="M69 26l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#ff8a8a" ${O2}/>`;
    } else {
      // Ashley: a little tucked flower.
      extra = `<circle cx="27" cy="40" r="4.8" fill="#ffc94a" ${O2}/><circle cx="27" cy="40" r="1.8" fill="#ff7a6b"/>`;
    }
  } else {
    // Chris: short hair, ears, optional beard, hoodie.
    body =
      `<path d="M16 104c2-17 15-23 34-23s32 6 34 23z" fill="${accent}" ${O}/>` +
      `<path d="M40 82c2 6 18 6 20 0" fill="none" ${O2}/>` +
      line('M42 86v10M58 86v10', 2.4, '#fff6e9');
    head =
      `<path d="M44 74h12v11H44z" fill="${skinD}" ${O2}/>` +
      `<ellipse cx="24.5" cy="56" rx="4.5" ry="6" fill="${skin}" ${O2}/><ellipse cx="75.5" cy="56" rx="4.5" ry="6" fill="${skin}" ${O2}/>` +
      `<ellipse cx="50" cy="53" rx="25" ry="27.5" fill="${skin}" ${O}/>`;
    front =
      `<path d="M25.5 49c-2-16 9-27 25-27 15 0 26 9 24 26-3-5-7-8-12-9-7 2-15 1-22-2-4 3-10 7-15 12z" fill="${hair}" ${O}/>` +
      `<path d="M38 29q9-3 18 0" fill="none" stroke="${hairL}" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
    const beard = look.beard;
    if (beard === 'beard') {
      extra =
        `<path d="M26 58c0 16 10 26 24 26s24-10 24-26c-3 5-6 7-9 7-3-3-8-4-15-4s-12 1-15 4c-3 0-6-2-9-7z" fill="${hair}" ${O}/>` +
        `<ellipse cx="50" cy="68.5" rx="9.5" ry="5.6" fill="${skin}"/>` +
        `<path d="M36 62c4-4 9-5 14-3 5-2 10-1 14 3-4 1-9 1-14-1-5 2-10 2-14 1z" fill="${hair}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    } else if (beard === 'stubble') {
      let dots = '';
      const pts = [
        [33, 66], [37, 71], [42, 75], [48, 77], [54, 76], [59, 73], [64, 69], [67, 64], [36, 64], [40, 69], [46, 73], [52, 74], [58, 70], [63, 66], [45, 79], [51, 80], [56, 78],
      ];
      for (const [x, y] of pts) dots += `<circle cx="${x}" cy="${y}" r="1" fill="${hairD}" opacity=".75"/>`;
      extra = dots;
    }
  }

  const eyes = eyesFor(mood, iris, who === 'chris');
  const brows = browsFor(mood, hair);
  const mouth = who === 'chris' && look.beard === 'beard' && (mood === 'happy' || mood === 'neutral') ? `<path d="M43.5 66.5q6.5 7.5 13 0z" fill="#8a2f3f" ${O2}/>` : mouthFor(mood);
  const glasses = look.glasses ? glassesSvg() : '';
  const zzz = mood === 'sleepy' ? line('M78 18h7l-7 7h7M87 8h5l-5 5h5', 2.4) : '';
  const nose = `<path d="M48.5 60q2 2.4 3.5 0" fill="none" stroke="${shade(skin, 0.7)}" stroke-width="2.4" stroke-linecap="round"/>`;
  const cls = spec.cls ? ' ' + spec.cls : '';
  return (
    `<svg class="bhd-face bhd-face--${who}${cls}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    back +
    body +
    head +
    cheeks(mood) +
    eyes +
    nose +
    (who === 'chris' ? extra + mouth : mouth) +
    front +
    brows +
    (who === 'chris' ? '' : extra) +
    glasses +
    zzz +
    `</svg>`
  );
}

/** The dog's face (coat from DOG_COATS). */
export function dogFaceSvg(coat: DogCoat | string, cls = ''): string {
  const c = (DOG_COATS as Record<string, { main: number; light: number; dark: number }>)[coat] ?? DOG_COATS.golden;
  const main = hexColor(c.main);
  const light = hexColor(c.light);
  const dark = hexColor(c.dark);
  const spotted = coat === 'spotted';
  const darkCoat = coat === 'black' || coat === 'chocolate';
  const eyeHi = '#fff';
  return (
    `<svg class="bhd-face bhd-face--dog${cls ? ' ' + cls : ''}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">` +
    `<path d="M22 104c2-14 12-20 28-20s26 6 28 20z" fill="${main}" ${O}/>` +
    `<path d="M36 86q14 8 28 0l-2 7q-12 5-24 0z" fill="#ff7a6b" ${O2}/><circle cx="50" cy="93" r="3.4" fill="#ffc94a" ${O2}/>` +
    `<ellipse cx="50" cy="54" rx="27" ry="26" fill="${main}" ${O}/>` +
    (spotted ? `<ellipse cx="62" cy="42" rx="8" ry="7" fill="${dark}"/><circle cx="36" cy="66" r="4" fill="${dark}"/>` : '') +
    `<path d="M31 29c-12-2-20 8-20 23 0 9 4 16 9 16 6 0 10-9 13-19z" fill="${dark}" ${O}/>` +
    `<path d="M69 29c12-2 20 8 20 23 0 9-4 16-9 16-6 0-10-9-13-19z" fill="${dark}" ${O}/>` +
    `<ellipse cx="50" cy="66" rx="15" ry="11.5" fill="${light}" ${O}/>` +
    `<path d="M46.5 75c0 6 7 6 7 0z" fill="#ff8fa0" ${O2}/>` +
    line('M50 64.5v5M43 70q7 5 14 0', 2.4) +
    `<ellipse cx="50" cy="61" rx="6.5" ry="4.6" fill="${INK}"/><ellipse cx="48" cy="59.6" rx="2" ry="1.2" fill="#fff" opacity=".7"/>` +
    `<circle cx="39" cy="49" r="4.6" fill="${INK}" ${darkCoat ? `stroke="${light}" stroke-width="1.6"` : ''}/><circle cx="61" cy="49" r="4.6" fill="${INK}" ${darkCoat ? `stroke="${light}" stroke-width="1.6"` : ''}/>` +
    `<circle cx="40.6" cy="47.4" r="1.6" fill="${eyeHi}"/><circle cx="62.6" cy="47.4" r="1.6" fill="${eyeHi}"/>` +
    line('M33 40q5-4 10-1M57 39q5-3 10 1', 2.6, darkCoat ? light : shade(main, 0.7)) +
    `</svg>`
  );
}

/** Look for a member from a (possibly partial / missing) FamilyLooks. */
export function lookOf(looks: FamilyLooks | null | undefined, who: MemberId): MemberLook {
  const m = looks?.members?.[who];
  return { ...DEFAULT_LOOKS.members[who], ...(m ?? {}) };
}
