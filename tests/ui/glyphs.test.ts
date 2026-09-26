// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { glyphHtml, glyphKey, renderGlyphText, deviceLabel, GLYPH_TOKENS, type GlyphContext } from '../../src/ui/glyphs';
import { ICON_IDS, iconSvg, isIconId, uiIcon } from '../../src/ui/icons';
import { dogFaceSvg, faceSvg } from '../../src/ui/faces';
import { MEMBERS } from '../../src/family/types';
import { DOG_COATS } from '../../src/render/palette';

const kb: GlyphContext = { device: 'keyboard', pad: 'generic' };
const pad = (p: GlyphContext['pad']): GlyphContext => ({ device: 'gamepad', pad: p });

function parses(markup: string): void {
  const doc = new DOMParser().parseFromString(`<div>${markup}</div>`, 'text/html');
  expect(doc.body.firstElementChild).not.toBeNull();
}

describe('glyphHtml', () => {
  it('keyboard uses the keymap labels', () => {
    expect(glyphHtml('primary', kb)).toContain('>SPACE<');
    expect(glyphHtml('secondary', kb)).toContain('>E<');
    expect(glyphHtml('alt', kb)).toContain('>SHIFT<');
    expect(glyphHtml('pause', kb)).toContain('>ESC<');
    expect(glyphHtml('pointer', kb)).toContain('data-g="mouse"');
    expect(glyphHtml('confirm', kb)).toContain('>ENTER<');
  });

  it('pad faces follow the pad family', () => {
    expect(glyphHtml('primary', pad('playstation'))).toContain('data-g="ps-cross"');
    expect(glyphHtml('secondary', pad('playstation'))).toContain('data-g="ps-circle"');
    expect(glyphHtml('switch', pad('playstation'))).toContain('data-g="shoulder-l1"');
    expect(glyphHtml('switch', pad('playstation'))).toContain('data-g="shoulder-r1"');
    expect(glyphHtml('pause', pad('playstation'))).toContain('data-g="menu-options"');
    expect(glyphHtml('primary', pad('xbox'))).toContain('data-g="xbox-a"');
    expect(glyphHtml('secondary', pad('xbox'))).toContain('data-g="xbox-b"');
    expect(glyphHtml('alt', pad('xbox'))).toContain('data-g="shoulder-rt"');
    expect(glyphHtml('primary', pad('nintendo'))).toContain('data-g="nintendo-b"');
    expect(glyphHtml('alt', pad('nintendo'))).toContain('data-g="shoulder-zr"');
    expect(glyphHtml('primary', pad('generic'))).toContain('data-g="generic-a"');
    expect(glyphHtml('move', pad('generic'))).toContain('data-g="stick"');
    expect(glyphHtml('back', pad('xbox'))).toContain('data-g="xbox-b"');
  });

  it('touch shows the overlay button (icon + label) or a sensible fallback', () => {
    const touch: GlyphContext = { device: 'touch', pad: 'generic', touch: (s) => (s === 'primary' ? { icon: 'pour', label: 'POUR' } : null) };
    expect(glyphHtml('primary', touch)).toContain('data-g="touch-primary-pour"');
    expect(glyphHtml('primary', touch)).toContain('POUR');
    expect(glyphHtml('secondary', touch)).toContain('data-g="touch-secondary-go"');
    expect(glyphHtml('move', touch)).toContain('data-g="joystick"');
    expect(glyphHtml('pointer', touch)).toContain('data-g="drag"');
    expect(glyphHtml('pause', touch)).toContain('data-g="touch-pause"');
  });

  it('every token renders well-formed markup on every device', () => {
    const ctxs: GlyphContext[] = [kb, pad('playstation'), pad('xbox'), pad('nintendo'), pad('generic'), { device: 'touch', pad: 'generic' }];
    for (const c of ctxs) for (const t of GLYPH_TOKENS) parses(glyphHtml(t, c));
  });

  it('touch labels are escaped', () => {
    const touch: GlyphContext = { device: 'touch', pad: 'generic', touch: () => ({ icon: 'go', label: '<b>X</b>' }) };
    const html = glyphHtml('primary', touch);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('renderGlyphText escapes text and replaces known tokens only', () => {
    const out = renderGlyphText('{confirm} Pick <me> {nope}', pad('playstation'));
    expect(out).toContain('ps-cross');
    expect(out).toContain('Pick &lt;me&gt; {nope}');
  });

  it('glyphKey changes with the device / pad / touch scheme', () => {
    expect(glyphKey(kb)).toBe('kb');
    expect(glyphKey(pad('xbox'))).not.toBe(glyphKey(pad('playstation')));
    const a = glyphKey({ device: 'touch', pad: 'generic', touch: () => ({ icon: 'go', label: 'A' }) });
    const b = glyphKey({ device: 'touch', pad: 'generic', touch: () => ({ icon: 'go', label: 'B' }) });
    expect(a).not.toBe(b);
    expect(deviceLabel('gamepad', 'playstation')).toBe('PLAYSTATION CONTROLLER');
  });
});

describe('icons & faces', () => {
  it('every IconId is a distinct well-formed SVG; unknown ids fall back', () => {
    const seen = new Set<string>();
    for (const id of ICON_IDS) {
      const svg = iconSvg(id);
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 48 48');
      seen.add(svg.replace(/class="[^"]*"/, ''));
    }
    expect(seen.size).toBe(ICON_IDS.length);
    expect(ICON_IDS.length).toBe(28);
    expect(isIconId('constructor')).toBe(false);
    expect(iconSvg('<script>')).toBe(iconSvg('star'));
    expect(uiIcon('pause')).toContain('bhd-ui-i--pause');
  });

  it('faces render for every member and mood, and every dog coat', () => {
    const moods = ['happy', 'neutral', 'eek', 'proud', 'sleepy', 'dramatic'] as const;
    for (const who of MEMBERS)
      for (const mood of moods) {
        const svg = faceSvg({ who, mood, look: { glasses: true, beard: 'stubble' } });
        const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        expect(doc.querySelector('parsererror')).toBeNull();
      }
    for (const coat of Object.keys(DOG_COATS)) {
      const doc = new DOMParser().parseFromString(dogFaceSvg(coat), 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
    }
    // Hostile / out-of-range look values can't break the markup.
    const odd = faceSvg({ who: 'addy', look: { skin: 99, hair: -5, eyes: Number.NaN } });
    expect(new DOMParser().parseFromString(odd, 'image/svg+xml').querySelector('parsererror')).toBeNull();
    expect(dogFaceSvg('"><script>')).toBe(dogFaceSvg('golden'));
  });
});
