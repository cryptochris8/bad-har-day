// Pure formatting helpers for the UI (no DOM). Unit-tested in tests/ui/format.test.ts.
import type { ActivityId, MorningReport } from '../plan/types';
import type { IconId } from './types';

/** 315 → "5:15 AM". Wraps past midnight; negative / NaN input is clamped to 0. */
export function formatClock(minutes: number): string {
  const p = clockParts(minutes);
  return `${p.h}:${p.mm} ${p.ampm}`;
}

export interface ClockParts {
  /** 12-hour hour as text, no leading zero ("5", "12"). */
  h: string;
  /** Two-digit minutes ("05"). */
  mm: string;
  ampm: 'AM' | 'PM';
  /** Hour hand angle (deg, 0 = 12 o'clock). */
  hourDeg: number;
  /** Minute hand angle (deg). */
  minDeg: number;
}

export function clockParts(minutes: number): ClockParts {
  const total = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  const h24 = Math.floor(total / 60) % 24;
  const m = total % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return {
    h: String(h12),
    mm: String(m).padStart(2, '0'),
    ampm: h24 < 12 ? 'AM' : 'PM',
    hourDeg: ((h24 % 12) + m / 60) * 30,
    minDeg: m * 6,
  };
}

/** A friendly stamp for the arrival time on the report card (always positive). */
export function arrivalStamp(report: Pick<MorningReport, 'arrival' | 'newBestArrival'>): { text: string; tone: 'best' | 'early' | 'ontime' | 'close' } {
  if (report.newBestArrival) return { text: 'NEW BEST!', tone: 'best' };
  const a = report.arrival;
  if (a <= 7 * 60 + 58) return { text: 'EARLY?!', tone: 'early' };
  if (a <= 8 * 60 + 2) return { text: 'ON TIME!', tone: 'ontime' };
  return { text: 'MADE IT!', tone: 'close' };
}

/** Control / invisible formatting characters that must never reach the dog's name tag. */
function isControlChar(cp: number): boolean {
  return cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x2028 && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) || cp === 0xfeff;
}

export function stripControls(s: string): string {
  let out = '';
  for (const ch of s) if (!isControlChar(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

/** The dog's name is user input: keep printable characters only, trim, ≤ 14 chars (never empty → default). */
export function sanitizeDogName(name: unknown, fallback = 'Biscuit'): string {
  if (typeof name !== 'string') return fallback;
  // Strip control / format characters, collapse whitespace.
  const cleaned = stripControls(name).replace(/\s+/g, ' ').trim();
  const chars = Array.from(cleaned).slice(0, 14).join('').trim();
  return chars.length > 0 ? chars : fallback;
}

/** Same as sanitizeDogName but keeps an empty string (while the player is still typing). */
export function clampDogNameInput(name: string): string {
  const cleaned = stripControls(name).replace(/\s+/g, ' ');
  return Array.from(cleaned).slice(0, 14).join('');
}

/** Cute names for the shuffle button (so a gamepad-only player can rename the dog too). */
export const DOG_NAME_IDEAS: readonly string[] = [
  'Biscuit', 'Waffles', 'Pickles', 'Noodle', 'Pancake', 'Muffin', 'Pretzel', 'Sprinkles', 'Nugget', 'Mochi',
  'Peanut', 'Toast', 'Bean', 'Marshmallow', 'Churro', 'Dumpling', 'Cocoa', 'Maple', 'Scout', 'Bubbles',
];

/** Next suggested name (never the current one). */
export function nextDogName(current: string, step = 1): string {
  const n = DOG_NAME_IDEAS.length;
  const i = DOG_NAME_IDEAS.findIndex((d) => d.toLowerCase() === current.trim().toLowerCase());
  const at = i < 0 ? 0 : (((i + step) % n) + n) % n;
  return DOG_NAME_IDEAS[at]!;
}

export const ACTIVITY_ICON: Readonly<Record<ActivityId, IconId>> = {
  dog: 'dog',
  coffee: 'coffee',
  lunch: 'lunch',
  trash: 'trash',
  dishes: 'dishes',
  wake: 'sun',
  hair: 'brush',
  rush: 'backpack',
  drive: 'car',
};

/** Kind words for a skipped (0-star) activity — never a failure. */
export const SKIPPED_LINES: Readonly<Partial<Record<ActivityId, string>>> = {
  dishes: 'The dishes will wait. They always do.',
  trash: 'Tomorrow’s problem!',
  lunch: 'Hot lunch day!',
};

export function skippedLine(id: ActivityId): string {
  return SKIPPED_LINES[id] ?? 'Saved for another morning.';
}

/** Arabic → Roman numeral for act numbers 1..10 ("ACT III"). */
export function roman(n: number): string {
  const R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return R[Math.max(0, Math.min(10, Math.floor(n)))] ?? '';
}

export const clamp01 = (v: number): number => (Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

/** Default seconds a speech bubble stays up, from its text length. */
export function bubbleSeconds(text: string): number {
  return Math.max(1.8, Math.min(6, 1.3 + text.length * 0.055));
}

/** Seconds played → "12 min" / "1 h 04 min". */
export function formatDuration(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const m = Math.round(s / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
