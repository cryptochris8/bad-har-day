// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CONTROL_ICONS, controlIconSvg } from '../../src/input';
import { isControlIcon } from '../../src/input/icons';
import type { ControlIcon } from '../../src/input/types';

const ALL: ControlIcon[] = ['go', 'hand', 'whistle', 'treat', 'brush', 'pass', 'done', 'pour', 'toss', 'catch', 'drop', 'rinse', 'music', 'run', 'gas', 'brake', 'honk'];

describe('control icons', () => {
  it('covers every ControlIcon value exactly', () => {
    expect([...CONTROL_ICONS].sort()).toEqual([...ALL].sort());
  });

  it('every icon parses as a single <svg> with drawn content and uses currentColor', () => {
    const parser = new DOMParser();
    for (const icon of ALL) {
      const markup = controlIconSvg(icon);
      const doc = parser.parseFromString(markup, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      const svg = doc.documentElement;
      expect(svg.nodeName).toBe('svg');
      expect(svg.getAttribute('viewBox')).toBe('0 0 48 48');
      expect(svg.getAttribute('class')).toContain(`bhd-ico--${icon}`);
      expect(svg.querySelectorAll('path, circle, rect, ellipse').length).toBeGreaterThan(0);
      expect(markup).toContain('currentColor');
    }
  });

  it('icons are distinct drawings', () => {
    const bodies = new Set(ALL.map((i) => controlIconSvg(i).replace(/class="[^"]*"/, '')));
    expect(bodies.size).toBe(ALL.length);
  });

  it('unknown / inherited keys fall back to "go" (never inject, never blank)', () => {
    expect(isControlIcon('constructor')).toBe(false);
    expect(isControlIcon('__proto__')).toBe(false);
    expect(isControlIcon('brush')).toBe(true);
    const bad = controlIconSvg('<script>' as unknown as ControlIcon);
    expect(bad).toBe(controlIconSvg('go'));
    expect(controlIconSvg('constructor' as unknown as ControlIcon)).toBe(controlIconSvg('go'));
  });
});
