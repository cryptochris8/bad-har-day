import { describe, expect, it } from 'vitest';
import {
  arrivalStamp,
  bubbleSeconds,
  clampDogNameInput,
  clockParts,
  formatClock,
  formatDuration,
  nextDogName,
  roman,
  sanitizeDogName,
  skippedLine,
  DOG_NAME_IDEAS,
} from '../../src/ui/format';
import { bubbleShift } from '../../src/ui/bubbles';
import { enqueueBanner, type BannerSpec } from '../../src/ui/overlays';
import { moveFocus, spatialPick, stepFocus } from '../../src/ui/focus';
import { shade } from '../../src/ui/faces';
import { hexColor, safeColor, escapeHtml } from '../../src/ui/dom';

describe('formatClock', () => {
  it('formats minutes since midnight as a 12-hour clock', () => {
    expect(formatClock(315)).toBe('5:15 AM');
    expect(formatClock(360)).toBe('6:00 AM');
    expect(formatClock(7 * 60 + 58)).toBe('7:58 AM');
    expect(formatClock(8 * 60 + 5)).toBe('8:05 AM');
  });
  it('handles noon, midnight and the wrap', () => {
    expect(formatClock(0)).toBe('12:00 AM');
    expect(formatClock(720)).toBe('12:00 PM');
    expect(formatClock(779)).toBe('12:59 PM');
    expect(formatClock(13 * 60 + 5)).toBe('1:05 PM');
    expect(formatClock(1439)).toBe('11:59 PM');
    expect(formatClock(1440)).toBe('12:00 AM');
  });
  it('floors fractional minutes and survives junk', () => {
    expect(formatClock(315.99)).toBe('5:15 AM');
    expect(formatClock(Number.NaN)).toBe('12:00 AM');
    expect(formatClock(-30)).toBe('12:00 AM');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('12:00 AM');
  });
  it('clockParts gives hand angles', () => {
    const p = clockParts(3 * 60 + 30);
    expect(p.h).toBe('3');
    expect(p.mm).toBe('30');
    expect(p.minDeg).toBe(180);
    expect(p.hourDeg).toBeCloseTo(105);
    expect(clockParts(12 * 60).hourDeg).toBe(0);
  });
});

describe('report helpers', () => {
  it('arrival stamps are always positive', () => {
    expect(arrivalStamp({ arrival: 7 * 60 + 50, newBestArrival: true }).tone).toBe('best');
    expect(arrivalStamp({ arrival: 7 * 60 + 58, newBestArrival: false }).text).toBe('EARLY?!');
    expect(arrivalStamp({ arrival: 8 * 60, newBestArrival: false }).text).toBe('ON TIME!');
    expect(arrivalStamp({ arrival: 8 * 60 + 5, newBestArrival: false }).text).toBe('MADE IT!');
  });
  it('skipped activities get a kind line', () => {
    expect(skippedLine('dishes')).toMatch(/wait/);
    expect(skippedLine('drive')).toBe('Saved for another morning.');
  });
  it('roman numerals for acts', () => {
    expect([1, 2, 3, 4, 5].map(roman)).toEqual(['I', 'II', 'III', 'IV', 'V']);
  });
  it('formatDuration', () => {
    expect(formatDuration(30)).toBe('1 min');
    expect(formatDuration(14 * 60)).toBe('14 min');
    expect(formatDuration(64 * 60)).toBe('1 h 04 min');
  });
});

describe('dog name (user input)', () => {
  it('trims, collapses whitespace and caps at 14 characters', () => {
    expect(sanitizeDogName('  Sir   Barks  ')).toBe('Sir Barks');
    expect(sanitizeDogName('Bartholomew the Great')).toBe('Bartholomew th');
    expect(Array.from(sanitizeDogName('🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶')).length).toBe(14);
  });
  it('strips control / invisible characters and falls back when empty', () => {
    const weird = 'Bi' + String.fromCharCode(0) + 'sc' + String.fromCharCode(0x200b) + 'uit' + String.fromCharCode(0x202e);
    expect(sanitizeDogName(weird)).toBe('Biscuit');
    expect(sanitizeDogName('   ')).toBe('Biscuit');
    expect(sanitizeDogName(42)).toBe('Biscuit');
    expect(sanitizeDogName('', 'Rex')).toBe('Rex');
  });
  it('keeps markup-looking names as plain characters (rendered with textContent)', () => {
    expect(sanitizeDogName('<img onerror>')).toBe('<img onerror>');
  });
  it('clampDogNameInput keeps an empty string while typing', () => {
    expect(clampDogNameInput('')).toBe('');
    expect(clampDogNameInput('abcdefghijklmnopq')).toBe('abcdefghijklmn');
  });
  it('nextDogName cycles through ideas and never repeats the current one', () => {
    const first = DOG_NAME_IDEAS[0]!;
    expect(nextDogName(first)).toBe(DOG_NAME_IDEAS[1]);
    expect(nextDogName('Unknown Name')).toBe(first);
    expect(nextDogName(DOG_NAME_IDEAS[DOG_NAME_IDEAS.length - 1]!)).toBe(first);
  });
});

describe('bubbles / banners pure helpers', () => {
  it('bubbleSeconds scales with length within bounds', () => {
    expect(bubbleSeconds('Hi')).toBeGreaterThanOrEqual(1.8);
    expect(bubbleSeconds('x'.repeat(500))).toBe(6);
    expect(bubbleSeconds('A medium sized sentence here.')).toBeGreaterThan(bubbleSeconds('Hi'));
  });
  it('bubbleShift keeps the box on screen', () => {
    expect(bubbleShift(500, 200, 1000)).toBe(0);
    expect(bubbleShift(20, 200, 1000)).toBe(88); // left edge at 8 px
    expect(bubbleShift(990, 200, 1000)).toBe(-98);
    expect(bubbleShift(100, 2000, 1000)).toBe(400); // wider than the screen → centred
  });
  it('enqueueBanner lets legendary / boss jump the queue and drops ordinary ones first', () => {
    const b = (text: string, style: BannerSpec['style']): BannerSpec => ({ text, sub: '', style, seconds: 1, icon: null, pos: 'center' });
    let q: BannerSpec[] = [];
    q = enqueueBanner(q, b('a', 'info'));
    q = enqueueBanner(q, b('b', 'fun'));
    q = enqueueBanner(q, b('L', 'legendary'));
    expect(q.map((x) => x.text)).toEqual(['L', 'a', 'b']);
    q = enqueueBanner(q, b('c', 'info'), 3);
    expect(q.map((x) => x.text)).toEqual(['L', 'b', 'c']);
  });
});

describe('focus math', () => {
  it('moveFocus wraps rows and clamps columns', () => {
    expect(moveFocus([1, 2, 2], { row: 0, col: 0 }, 'down')).toEqual({ row: 1, col: 0 });
    expect(moveFocus([1, 2, 2], { row: 0, col: 0 }, 'up')).toEqual({ row: 2, col: 0 });
    expect(moveFocus([1, 2, 2], { row: 1, col: 0 }, 'right')).toEqual({ row: 1, col: 1 });
    expect(moveFocus([1, 2, 2], { row: 1, col: 1 }, 'right')).toEqual({ row: 1, col: 1 });
    expect(moveFocus([2, 0, 1], { row: 0, col: 1 }, 'down')).toEqual({ row: 2, col: 0 });
  });
  it('stepFocus walks reading order and wraps', () => {
    expect(stepFocus([2, 1], { row: 0, col: 1 }, 'next')).toEqual({ row: 1, col: 0 });
    expect(stepFocus([2, 1], { row: 1, col: 0 }, 'next')).toEqual({ row: 0, col: 0 });
    expect(stepFocus([2, 1], { row: 0, col: 0 }, 'prev')).toEqual({ row: 1, col: 0 });
  });
  it('spatialPick prefers items in the same row / column', () => {
    const r = (left: number, top: number) => ({ left, top, width: 100, height: 40 });
    const rects = [r(0, 0), r(120, 0), r(0, 60), r(120, 60)];
    expect(spatialPick(rects, 0, 'right')).toBe(1);
    expect(spatialPick(rects, 0, 'down')).toBe(2);
    expect(spatialPick(rects, 3, 'left')).toBe(2);
    expect(spatialPick(rects, 2, 'down')).toBe(0); // wraps to the top
    expect(spatialPick(rects, 1, 'right')).toBe(-1);
  });
});

describe('colour helpers', () => {
  it('hexColor always yields a 6-digit colour', () => {
    expect(hexColor(0xff7a6b)).toBe('#ff7a6b');
    expect(hexColor(0x12)).toBe('#000012');
    expect(hexColor(Number.NaN)).toBe('#000000');
    expect(hexColor(0x1000000)).toBe('#ffffff');
  });
  it('safeColor only lets harmless colour values through', () => {
    expect(safeColor('var(--bhd-addy)', 'x')).toBe('var(--bhd-addy)');
    expect(safeColor('#a78bfa', 'x')).toBe('#a78bfa');
    expect(safeColor('rgb(1, 2, 3)', 'x')).toBe('rgb(1, 2, 3)');
    expect(safeColor('red;background:url(evil)', 'x')).toBe('x');
    expect(safeColor('url(javascript:alert(1))', 'x')).toBe('x');
    expect(safeColor(undefined, 'x')).toBe('x');
  });
  it('shade darkens and lightens', () => {
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#808080', 2)).toBe('#ffffff');
  });
  it('escapeHtml', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});
