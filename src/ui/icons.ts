// Inline SVG icons in the BAD HAIR DAY! house style: little stickers with soft plum ink outlines
// (PAL.uiPlum), candy-but-warm fills from src/render/palette.ts, 48×48 viewBox, readable at 20–48 px.
// Every string here is a TRUSTED CONSTANT — never interpolate user data into these.
import type { IconId } from './types';

export const INK = '#3a2330';
export const C = {
  cream: '#fff6e9',
  paper: '#fffaf1',
  coral: '#ff7a6b',
  coralD: '#e85d50',
  sun: '#ffc94a',
  sunD: '#f0a92a',
  mint: '#6fd6b6',
  mintD: '#3fb896',
  lilac: '#b79cf5',
  sky: '#7cc4f2',
  skyL: '#dff1ff',
  heart: '#ff6b8a',
  white: '#ffffff',
  brown: '#b9824f',
  brownD: '#8a5a36',
  coffee: '#6b4428',
  golden: '#e0a458',
  goldenL: '#f6d7a4',
  goldenD: '#b97a3a',
  black: '#1f1a26',
  sheen: '#b9a6ff',
  skin: '#f9d0ae',
  sage: '#8fb39a',
  brick: '#d0705a',
  slate: '#5b6b84',
} as const;

/** Standard ink outline attributes. */
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
const S2 = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const f = (c: string): string => `fill="${c}" ${S}`;
const f2 = (c: string): string => `fill="${c}" ${S2}`;

/** A coloured line with an ink outline (ink drawn first, wider). */
export function inkLine(d: string, w: number, color: string): string {
  return (
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w + 3.2}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/** Plain ink stroke. */
const ink = (d: string, w = 2.5): string => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

/** 5-point star path. */
export function starPath(cx: number, cy: number, R: number, r: number): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
  }
  return d + 'Z';
}

/** Chunky 4-point sparkle path. */
export function sparklePath(cx: number, cy: number, r: number): string {
  const k = r * 0.22;
  return (
    `M${cx} ${cy - r}Q${cx + k} ${cy - k} ${cx + r} ${cy}Q${cx + k} ${cy + k} ${cx} ${cy + r}` +
    `Q${cx - k} ${cy + k} ${cx - r} ${cy}Q${cx - k} ${cy - k} ${cx} ${cy - r}Z`
  );
}

const HEART_D = 'M24 41.5S6 31 6 18.5a9 9 0 0 1 18-3.2 9 9 0 0 1 18 3.2C42 31 24 41.5 24 41.5z';
const shine = (d: string, w = 2.6): string => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" opacity=".85"/>`;

const BODIES: Readonly<Record<IconId, string>> = {
  dog:
    `<ellipse cx="24" cy="26" rx="13.5" ry="13" ${f(C.golden)}/>` +
    `<path d="M15.5 13.5c-5.5-.5-9.5 4-9.5 11 0 4.5 1.8 7.5 4 7.5 3 0 5-4.5 6.5-9z" ${f(C.goldenD)}/>` +
    `<path d="M32.5 13.5c5.5-.5 9.5 4 9.5 11 0 4.5-1.8 7.5-4 7.5-3 0-5-4.5-6.5-9z" ${f(C.goldenD)}/>` +
    `<ellipse cx="24" cy="32" rx="8" ry="6" ${f(C.goldenL)}/>` +
    `<path d="M22.3 36.6c0 3 3.4 3 3.4 0" ${f2(C.heart)}/>` +
    ink('M24 31.6v2.6M20.6 34.2c1.6 1.4 5.2 1.4 6.8 0', 2) +
    `<ellipse cx="24" cy="29.4" rx="3.4" ry="2.5" fill="${INK}"/>` +
    `<circle cx="18.6" cy="23.4" r="2.3" fill="${INK}"/><circle cx="29.4" cy="23.4" r="2.3" fill="${INK}"/>` +
    `<circle cx="19.3" cy="22.7" r=".8" fill="#fff"/><circle cx="30.1" cy="22.7" r=".8" fill="#fff"/>`,
  coffee:
    ink('M18.5 4.5c-2.2 2.2 2.2 3.6 0 6.6M25.5 3.5c-2.2 2.2 2.2 3.6 0 6.6', 2.4) +
    inkLine('M34 21h2.6a5 5 0 0 1 0 10H34', 3.4, C.coral) +
    `<path d="M10.5 16.5h24v17.5a7 7 0 0 1-7 7h-10a7 7 0 0 1-7-7z" ${f(C.coral)}/>` +
    `<ellipse cx="22.5" cy="16.5" rx="12" ry="3.4" ${f(C.coffee)}/>` +
    `<path d="M22.5 34.6l-4.2-4a2.5 2.5 0 0 1 4.2-2.8 2.5 2.5 0 0 1 4.2 2.8z" fill="${C.cream}"/>` +
    shine('M14 24v6', 2.2),
  lunch:
    inkLine('M17.5 14v-2.5a3.5 3.5 0 0 1 3.5-3.5h6a3.5 3.5 0 0 1 3.5 3.5V14', 2.6, C.sun) +
    `<rect x="6.5" y="14" width="35" height="26.5" rx="6.5" ${f(C.mint)}/>` +
    ink('M6.5 22.5h35', 2.4) +
    `<rect x="20.5" y="19.5" width="7" height="6.5" rx="2" ${f2(C.sun)}/>` +
    `<circle cx="15" cy="32" r="4.2" ${f2(C.coral)}/>` +
    `<path d="M15 27.8c.6-1.8 2-2.6 3.4-2.4-.3 1.6-1.6 2.6-3.4 2.4z" ${f2(C.mintD)}/>` +
    shine('M34 28.5v5', 2.2),
  trash:
    `<rect x="20" y="6.5" width="8" height="5" rx="2" ${f(C.sky)}/>` +
    `<path d="M11.5 18.5h25l-2.4 20.4a3.2 3.2 0 0 1-3.2 2.8H17.1a3.2 3.2 0 0 1-3.2-2.8z" ${f(C.sage)}/>` +
    `<rect x="8" y="11.5" width="32" height="7" rx="3.5" ${f(C.sky)}/>` +
    `<path d="M19.2 23.5l.9 12.5M24 23.5v12.5M28.8 23.5l-.9 12.5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>`,
  dishes:
    `<circle cx="21" cy="27" r="15" ${f(C.white)}/>` +
    `<circle cx="21" cy="27" r="9.2" fill="none" stroke="${C.sky}" stroke-width="2.6"/>` +
    shine('M12.5 20.5a10 10 0 0 1 5-4', 2.4).replace('#fff', C.sky) +
    `<circle cx="37.5" cy="13.5" r="5" ${f2(C.skyL)}/><circle cx="41" cy="25" r="3" ${f2(C.skyL)}/><circle cx="31.5" cy="6.5" r="2.6" ${f2(C.skyL)}/>` +
    shine('M35.6 11.6a2.6 2.6 0 0 1 2-1.4', 1.6),
  bed:
    `<path d="M6 13a3 3 0 0 1 3-3h3.5a3 3 0 0 1 3 3v24H6z" ${f(C.brown)}/>` +
    ink('M9 37v4M41 36v5', 3.2) +
    `<path d="M15 24.5h25.5a3 3 0 0 1 3 3v9.5H15z" ${f(C.cream)}/>` +
    `<path d="M24 24.5h16.5a3 3 0 0 1 3 3v9.5H24c-2-4-2-8.5 0-12.5z" ${f(C.lilac)}/>` +
    `<rect x="15.5" y="18.5" width="10" height="7" rx="3.5" ${f2(C.white)}/>` +
    ink('M31 8h5l-5 5h5M38.5 3.5h3.5l-3.5 3.5h3.5', 2),
  sun:
    [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const r = (a * Math.PI) / 180;
        const x1 = 24 + Math.cos(r) * 15.5;
        const y1 = 24 + Math.sin(r) * 15.5;
        const x2 = 24 + Math.cos(r) * 20.5;
        const y2 = 24 + Math.sin(r) * 20.5;
        return inkLine(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`, 3, C.sun);
      })
      .join('') +
    `<circle cx="24" cy="24" r="11.5" ${f(C.sun)}/>` +
    `<circle cx="20" cy="22.5" r="1.6" fill="${INK}"/><circle cx="28" cy="22.5" r="1.6" fill="${INK}"/>` +
    ink('M19.8 27c2.4 2.4 6 2.4 8.4 0', 2.2) +
    `<circle cx="17.4" cy="26.4" r="1.6" fill="${C.coral}" opacity=".7"/><circle cx="30.6" cy="26.4" r="1.6" fill="${C.coral}" opacity=".7"/>`,
  brush:
    inkLine('M29 29l11 11', 5.2, C.lilac) +
    `<ellipse cx="19.5" cy="19.5" rx="14.5" ry="11" transform="rotate(-45 19.5 19.5)" ${f(C.lilac)}/>` +
    `<ellipse cx="19.5" cy="19.5" rx="10" ry="6.8" transform="rotate(-45 19.5 19.5)" ${f2(C.cream)}/>` +
    `<g fill="${INK}"><circle cx="15" cy="20" r="1.2"/><circle cx="19.5" cy="15.5" r="1.2"/><circle cx="19.5" cy="20.5" r="1.2"/><circle cx="24" cy="19" r="1.2"/><circle cx="18.5" cy="24.5" r="1.2"/><circle cx="23" cy="24" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/></g>`,
  blackBrush:
    `<ellipse cx="20" cy="20" rx="18" ry="14.5" transform="rotate(-45 20 20)" fill="${C.sheen}" opacity=".45"/>` +
    inkLine('M29 29l11 11', 5.2, C.black) +
    `<ellipse cx="19.5" cy="19.5" rx="14.5" ry="11" transform="rotate(-45 19.5 19.5)" ${f(C.black)}/>` +
    `<ellipse cx="19.5" cy="19.5" rx="10" ry="6.8" transform="rotate(-45 19.5 19.5)" fill="#3b3348" stroke="${C.sheen}" stroke-width="1.6"/>` +
    `<g fill="${C.sheen}"><circle cx="15" cy="20" r="1.1"/><circle cx="19.5" cy="15.5" r="1.1"/><circle cx="19.5" cy="20.5" r="1.1"/><circle cx="24" cy="19" r="1.1"/><circle cx="18.5" cy="24.5" r="1.1"/><circle cx="23" cy="24" r="1.1"/><circle cx="15.5" cy="15.5" r="1.1"/></g>` +
    `<path d="M9.5 16.5a13 13 0 0 1 7-7" fill="none" stroke="${C.sheen}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<path d="${sparklePath(39, 10, 6.5)}" ${f2(C.sun)}/><path d="${sparklePath(8, 38, 4.2)}" ${f2(C.cream)}/>`,
  crown:
    `<path d="M8 35.5L5.5 16l10.5 8.5L24 11l8 13.5L42.5 16 40 35.5z" ${f(C.sun)}/>` +
    `<rect x="7.5" y="33" width="33" height="7.5" rx="3" ${f(C.sunD)}/>` +
    `<circle cx="16" cy="36.8" r="2.1" fill="${C.coral}" ${S2}/><circle cx="24" cy="36.8" r="2.1" fill="${C.mint}" ${S2}/><circle cx="32" cy="36.8" r="2.1" fill="${C.sky}" ${S2}/>` +
    `<circle cx="5.5" cy="15" r="2.6" ${f2(C.sun)}/><circle cx="24" cy="9.5" r="2.6" ${f2(C.sun)}/><circle cx="42.5" cy="15" r="2.6" ${f2(C.sun)}/>` +
    shine('M13 28l-1-5', 2),
  heart: `<path d="${HEART_D}" ${f(C.heart)}/>` + shine('M11.5 18a6 6 0 0 1 5.5-5.5', 3),
  star: `<path d="${starPath(24, 25.5, 19.5, 9)}" fill="${C.sun}" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>` + shine('M17.5 20.5l2.5-5', 2.4),
  clock:
    `<circle cx="12.5" cy="11.5" r="6.2" ${f(C.coral)}/><circle cx="35.5" cy="11.5" r="6.2" ${f(C.coral)}/>` +
    ink('M15 39.5l-3.5 4.5M33 39.5l3.5 4.5', 3.2) +
    `<circle cx="24" cy="27" r="15" ${f(C.coral)}/>` +
    `<circle cx="24" cy="27" r="10.8" ${f2(C.cream)}/>` +
    ink('M24 27v-6.8M24 27l5 3', 2.8) +
    `<circle cx="24" cy="27" r="1.6" fill="${INK}"/>` +
    `<rect x="20.5" y="7.5" width="7" height="4.5" rx="1.5" ${f2(C.sun)}/>`,
  check: `<circle cx="24" cy="24" r="18" ${f(C.mint)}/>` + inkLine('M15 24.5l6.2 6.2L33.5 18', 4.2, C.cream),
  shoe:
    `<path d="M6.5 31c0-6.5 1.8-12.5 4.6-15l5.4.8c2 3.2 6.2 5.2 11 6.2l11.6 2.8c3 .9 4.4 3 4.4 5.9v1.3H6.5z" ${f(C.coral)}/>` +
    `<path d="M5 31.5h39v3.8a3.4 3.4 0 0 1-3.4 3.4H8.4A3.4 3.4 0 0 1 5 35.3z" ${f(C.cream)}/>` +
    ink('M16.8 20.4l4.2-2M19.6 23.6l4.2-2.4M23.4 26l3.8-2.4', 2.2) +
    `<path d="M33 27.5l6 1.4" stroke="${C.cream}" stroke-width="2.4" stroke-linecap="round"/>`,
  backpack:
    inkLine('M18.5 11a5.5 5.5 0 0 1 11 0', 2.4, C.lilac) +
    `<path d="M10.5 21a10.5 10.5 0 0 1 10.5-10.5h6A10.5 10.5 0 0 1 37.5 21v17a4 4 0 0 1-4 4h-19a4 4 0 0 1-4-4z" ${f(C.lilac)}/>` +
    `<path d="M15 28.5h18v7.5a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3z" ${f2(C.sun)}/>` +
    ink('M10.8 22.5h26.4', 2.4) +
    ink('M19.5 32.5h9', 2.2) +
    `<circle cx="24" cy="18" r="1.6" fill="${INK}"/>`,
  book:
    `<path d="M10 9h24.5a3 3 0 0 1 3 3v27H13a3 3 0 0 1-3-3z" ${f(C.sky)}/>` +
    `<path d="M13 35.5h24.5V41H13a2.75 2.75 0 0 1 0-5.5z" ${f2(C.cream)}/>` +
    ink('M16 9.5v25.5', 2.4) +
    `<rect x="20" y="14.5" width="12.5" height="7" rx="2" ${f2(C.cream)}/>` +
    `<path d="${starPath(26.2, 28.5, 4.2, 2)}" fill="${C.sun}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  bottle:
    `<rect x="17.5" y="4.5" width="13" height="7.5" rx="2.6" ${f(C.coral)}/>` +
    `<path d="M15.5 15.5a3.5 3.5 0 0 1 3.5-3.5h10a3.5 3.5 0 0 1 3.5 3.5V39a4.5 4.5 0 0 1-4.5 4.5h-8a4.5 4.5 0 0 1-4.5-4.5z" ${f(C.skyL)}/>` +
    `<path d="M15.5 24c3-1.4 5.5 1.4 8.5 0s5.5 1.4 8.5 0V39a4.5 4.5 0 0 1-4.5 4.5h-8a4.5 4.5 0 0 1-4.5-4.5z" fill="${C.sky}"/>` +
    `<path d="M15.5 15.5a3.5 3.5 0 0 1 3.5-3.5h10a3.5 3.5 0 0 1 3.5 3.5V39a4.5 4.5 0 0 1-4.5 4.5h-8a4.5 4.5 0 0 1-4.5-4.5z" fill="none" ${S}/>` +
    shine('M19.5 17v6', 2.2) +
    `<circle cx="27" cy="33" r="1.6" fill="#fff" opacity=".8"/><circle cx="22" cy="37" r="1.1" fill="#fff" opacity=".8"/>`,
  hairTie:
    `<circle cx="24" cy="24" r="14" fill="none" stroke="${INK}" stroke-width="14"/>` +
    `<circle cx="24" cy="24" r="14" fill="none" stroke="${C.lilac}" stroke-width="8.6"/>` +
    [0, 40, 80, 120, 160, 200, 240, 280, 320]
      .map((a) => {
        const r = (a * Math.PI) / 180;
        return `<path d="M${(24 + Math.cos(r) * 10).toFixed(1)} ${(24 + Math.sin(r) * 10).toFixed(1)}L${(24 + Math.cos(r) * 18).toFixed(1)} ${(24 + Math.sin(r) * 18).toFixed(1)}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`;
      })
      .join('') +
    shine('M14 17a12 12 0 0 1 6-5', 2),
  slip:
    `<path d="M10.5 5.5h20.5l8 8v29h-28.5z" ${f(C.white)}/>` +
    `<path d="M31 5.5v8h8" ${f2(C.cream)}/>` +
    `<path d="M15.5 18h12M15.5 24h17M15.5 30h14" stroke="${C.sky}" stroke-width="2.6" stroke-linecap="round"/>` +
    ink('M15.5 37.5c2.6-4 3.6 2.2 6.4-1s3 2.4 6 .2', 2.1) +
    `<path d="${sparklePath(35, 36, 4)}" fill="${C.coral}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  jacket:
    `<path d="M17 8.5l7 4.5 7-4.5 8.5 4.5 4.5 18-6.2 1.3-1.3-8V42.5H11.5V24.3l-1.3 8L4 31l4.5-18z" ${f(C.mint)}/>` +
    ink('M24 13.5V42.5', 2.4) +
    `<path d="M17 8.5l7 7.5 7-7.5" fill="none" ${S2}/>` +
    `<rect x="14" y="31" width="6" height="4.5" rx="1.4" ${f2(C.mintD)}/><rect x="28" y="31" width="6" height="4.5" rx="1.4" ${f2(C.mintD)}/>`,
  car:
    `<path d="M3.5 31v-6.5c0-2 1.2-3.2 3.2-4.2l6.4-7.4c1-1.2 2.3-1.9 3.9-1.9h16.4c1.7 0 3 .8 4 2l5.4 7.3c2 .9 3.2 2.1 3.2 4.2V31a3.2 3.2 0 0 1-3.2 3.2H6.7A3.2 3.2 0 0 1 3.5 31z" ${f(C.sky)}/>` +
    `<path d="M15.5 15h8v7.5H10z" ${f2(C.skyL)}/><path d="M26.5 15h6.5l5 7.5H26.5z" ${f2(C.skyL)}/>` +
    `<circle cx="14" cy="34.5" r="5.2" ${f(C.slate)}/><circle cx="14" cy="34.5" r="2" fill="${C.cream}"/>` +
    `<circle cx="35" cy="34.5" r="5.2" ${f(C.slate)}/><circle cx="35" cy="34.5" r="2" fill="${C.cream}"/>` +
    `<circle cx="42.3" cy="26.5" r="1.8" fill="${C.sun}" ${S2}/>`,
  school:
    `<path d="M24 3.5v6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M24 3.5h7l-2 2 2 2h-7z" ${f2(C.coral)}/>` +
    `<rect x="18.5" y="9.5" width="11" height="10" rx="1.5" ${f(C.cream)}/>` +
    `<path d="M24 12.5a2.4 2.4 0 0 1 2.4 2.4v2h-4.8v-2a2.4 2.4 0 0 1 2.4-2.4z" fill="${C.sun}" ${S2}/>` +
    `<path d="M4.5 24L24 14l19.5 10z" ${f(C.slate)}/>` +
    `<rect x="8" y="23.5" width="32" height="18" rx="1.5" ${f(C.brick)}/>` +
    `<path d="M20 41.5v-7.5a4 4 0 0 1 8 0v7.5" ${f2(C.sun)}/>` +
    `<rect x="11" y="27" width="6" height="6" rx="1" ${f2(C.skyL)}/><rect x="31" y="27" width="6" height="6" rx="1" ${f2(C.skyL)}/>`,
  sparkle:
    `<path d="${sparklePath(21, 25, 16)}" fill="${C.sun}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="${sparklePath(37.5, 11, 7)}" fill="${C.cream}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<circle cx="38" cy="36" r="2.6" fill="${C.coral}" ${S2}/>`,
  music:
    `<path d="M18 12.5l20-5.5v6.5l-20 5.5z" fill="${INK}"/>` +
    ink('M18 34V13M38 29V8', 3.4) +
    `<ellipse cx="13.2" cy="35" rx="6.4" ry="4.8" transform="rotate(-20 13.2 35)" ${f(C.lilac)}/>` +
    `<ellipse cx="33.2" cy="30" rx="6.4" ry="4.8" transform="rotate(-20 33.2 30)" ${f(C.lilac)}/>` +
    shine('M10.4 33.6l2.2-1', 1.8),
  eye:
    inkLine('M31.5 31.5l10 10', 5, C.coral) +
    `<circle cx="21" cy="21" r="15" ${f(C.sun)}/>` +
    `<circle cx="21" cy="21" r="11" fill="${C.skyL}" ${S2}/>` +
    `<path d="M12 21c4.8-6.4 13.2-6.4 18 0-4.8 6.4-13.2 6.4-18 0z" fill="#fff" ${S2}/>` +
    `<circle cx="21" cy="21" r="3.9" fill="#3f6f9f"/><circle cx="21" cy="21" r="2" fill="${INK}"/><circle cx="22.2" cy="19.8" r=".9" fill="#fff"/>` +
    shine('M13.5 12.5a11 11 0 0 1 5-2.5', 2),
  whistle:
    ink('M40.5 9.5l3-3M42 16l4-.8M35 8l.8-4', 2.6) +
    `<circle cx="9.5" cy="14.5" r="3.2" fill="none" ${S2}/>` +
    `<path d="M17.5 17.5h19.5a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-9.5a10 10 0 1 1-10-10z" ${f(C.sun)}/>` +
    `<circle cx="17.5" cy="27.5" r="4" fill="${INK}"/>` +
    shine('M11 24a7 7 0 0 1 3.5-4', 2),
  hand:
    `<rect x="13.2" y="10" width="6" height="19" rx="3" ${f(C.skin)}/>` +
    `<rect x="19.6" y="6.5" width="6" height="21" rx="3" ${f(C.skin)}/>` +
    `<rect x="26" y="8" width="6" height="20" rx="3" ${f(C.skin)}/>` +
    `<rect x="32.4" y="12.5" width="5.6" height="16" rx="2.8" ${f(C.skin)}/>` +
    `<rect x="5.5" y="22" width="6" height="15" rx="3" transform="rotate(-42 8.5 29.5)" ${f(C.skin)}/>` +
    `<path d="M12.6 24h25.4v6.5c0 7.6-5.6 12.5-12.7 12.5S12.6 38.1 12.6 30.5z" fill="${C.skin}" ${S}/>` +
    `<path d="M14.4 24.2h22" stroke="${C.skin}" stroke-width="3.4"/>` +
    ink('M5.5 11.5l3.2 2.6M4 18.5l3.6.6M41.5 6.5l-2.4 3', 2.2),
};

export const ICON_IDS: readonly IconId[] = Object.freeze(Object.keys(BODIES) as IconId[]);

export function isIconId(v: unknown): v is IconId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BODIES, v);
}

/** Inline SVG for an IconId (unknown ids → 'star'; never injects markup). */
export function iconSvg(id: IconId | string | null | undefined, cls = ''): string {
  const name: IconId = isIconId(id) ? id : 'star';
  return `<svg class="bhd-i bhd-i--${name}${cls ? ' ' + cls : ''}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${BODIES[name]}</svg>`;
}

// ── UI chrome icons (buttons, menus). Drawn in ink on transparent; colour via currentColor. ─────

const UI_BODIES = {
  pause: `<rect x="13" y="11" width="8" height="26" rx="3" fill="currentColor" ${S}/><rect x="27" y="11" width="8" height="26" rx="3" fill="currentColor" ${S}/>`,
  play: `<path d="M16 10.5l22 13.5-22 13.5z" fill="currentColor" ${S}/>`,
  back: inkLine('M29 12L17 24l12 12', 5, 'currentColor'),
  next: inkLine('M19 12l12 12-12 12', 5, 'currentColor'),
  close: inkLine('M14 14l20 20M34 14L14 34', 5, 'currentColor'),
  check: inkLine('M12 25l8 8 16-17', 5.5, 'currentColor'),
  gear:
    `<path d="M21 5h6l1 5 4 2 4.5-3 4.2 4.3-3 4.5 1.8 4.2 5 1v6l-5 1-1.8 4.2 3 4.5-4.2 4.3-4.5-3-4 1.8-1 5h-6l-1-5-4.2-1.8-4.4 3-4.3-4.3 3-4.5L10 29l-5-1v-6l5-1 1.9-4.2-3-4.5 4.3-4.3 4.4 3L21.8 10z" fill="currentColor" ${S}/>` +
    `<circle cx="24" cy="24" r="6" fill="${C.cream}" ${S}/>`,
  fullscreen: inkLine('M8 18V9h9M31 9h9v9M40 30v9h-9M17 39H8v-9', 4, 'currentColor'),
  dice:
    `<rect x="8" y="8" width="32" height="32" rx="8" fill="currentColor" ${S}/>` +
    `<g fill="${INK}"><circle cx="17" cy="17" r="3"/><circle cx="31" cy="17" r="3"/><circle cx="24" cy="24" r="3"/><circle cx="17" cy="31" r="3"/><circle cx="31" cy="31" r="3"/></g>`,
  sound:
    `<path d="M8 19h7l10-8v26l-10-8H8z" fill="currentColor" ${S}/>` + ink('M31 18a8 8 0 0 1 0 12M35.5 13.5a14 14 0 0 1 0 21', 3),
  restart: inkLine('M36 18A13 13 0 1 0 37 30', 4.5, 'currentColor') + `<path d="M29.5 17.5h8.5V9z" fill="${INK}"/>`,
  home:
    `<path d="M7 23L24 8l17 15" fill="none" ${S}/><path d="M11 21v18h26V21L24 10z" fill="currentColor" ${S}/>` +
    `<path d="M20.5 39v-8a3.5 3.5 0 0 1 7 0v8" fill="${C.cream}" ${S2}/>`,
  question:
    `<circle cx="24" cy="24" r="18" fill="currentColor" ${S}/>` +
    ink('M18.5 19a5.5 5.5 0 1 1 7.8 5c-1.6.8-2.3 2-2.3 3.8v1', 4) +
    `<circle cx="24" cy="35" r="2.6" fill="${INK}"/>`,
  sliders: ink('M9 14h30M9 24h30M9 34h30', 3.4) + `<circle cx="17" cy="14" r="4.6" fill="currentColor" ${S}/><circle cx="31" cy="24" r="4.6" fill="currentColor" ${S}/><circle cx="21" cy="34" r="4.6" fill="currentColor" ${S}/>`,
  family:
    `<circle cx="14" cy="16" r="6" fill="currentColor" ${S}/><circle cx="34" cy="16" r="6" fill="currentColor" ${S}/><circle cx="24" cy="25" r="5" fill="currentColor" ${S}/>` +
    `<path d="M5 38a9 9 0 0 1 18 0zM25 38a9 9 0 0 1 18 0z" fill="currentColor" ${S}/><path d="M16.5 42a7.5 7.5 0 0 1 15 0z" fill="currentColor" ${S}/>`,
  calendar:
    `<rect x="7" y="10" width="34" height="31" rx="5" fill="currentColor" ${S}/>` +
    `<path d="M7 19h34" ${S}/>` +
    ink('M16 6v7M32 6v7', 3.2) +
    `<path d="${starPath(24, 30, 6.5, 3)}" fill="${C.sun}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`,
  sunrise:
    `<path d="M9 34a15 15 0 0 1 30 0z" fill="currentColor" ${S}/>` +
    ink('M4 38h40', 3.4) +
    ink('M24 7v6M10 13l4 4M38 13l-4 4', 3.2),
  mouse:
    `<rect x="13" y="6" width="22" height="36" rx="11" fill="currentColor" ${S}/>` +
    ink('M24 6v12M13 18h22', 2.4) +
    `<path d="M13.5 18V17a10.5 10.5 0 0 1 10.5-10.5V18z" fill="${C.coral}" ${S2}/>`,
  drag:
    `<path d="M14 36V17a3 3 0 0 1 6 0v8-12a3 3 0 0 1 6 0v12-10a3 3 0 0 1 6 0v11-6a3 3 0 0 1 6 0v12c0 7-5 12-11.5 12S20 40 17 36l-6-7a3 3 0 0 1 4.5-4z" fill="currentColor" ${S}/>` +
    ink('M4 10h8M4 10l3-3M4 10l3 3', 2.4),
} as const;

export type UiIconId = keyof typeof UI_BODIES;

export function uiIcon(id: UiIconId, cls = ''): string {
  return `<svg class="bhd-ui-i bhd-ui-i--${id}${cls ? ' ' + cls : ''}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${UI_BODIES[id]}</svg>`;
}

/** Decorative 4-point sparkle (used in logos, stamps, focus rings). */
export function sparkleSvg(cls = '', color: string = C.sun): string {
  return `<svg class="bhd-spark ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${sparklePath(12, 12, 10)}" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

/** A single rating star (filled or empty) for report cards / task lists. */
export function starSvg(cls = ''): string {
  return `<svg class="bhd-star ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="bhd-star__p" d="${starPath(24, 25.5, 20, 9.4)}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/></svg>`;
}

/** A heart outline for boss bars (fill via CSS). */
export function heartSvg(cls = ''): string {
  return `<svg class="bhd-heart ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path class="bhd-heart__p" d="${HEART_D}" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/></svg>`;
}
