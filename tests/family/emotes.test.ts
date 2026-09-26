import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EMOTES, EMOTE_DEFAULT_SECONDS, EMOTE_POP_IN, EMOTE_POP_OUT, EmoteSprite, emoteBob, emoteDone, emoteScale, emoteTexture } from '../../src/family/emotes';
import { isShared } from '../../src/render/models/shared';
import type { Emote } from '../../src/family/types';

const ALL: Emote[] = ['exclaim', 'question', 'heart', 'zzz', 'sweat', 'sparkle', 'music', 'shh', 'idea', 'check', 'star', 'huff'];

describe('emote timing', () => {
  it('covers every contract Emote', () => {
    expect([...EMOTES].sort()).toEqual([...ALL].sort());
  });

  it('pops in with an overshoot, holds, pops out', () => {
    expect(emoteScale(0, 1.6, false)).toBeCloseTo(0, 5);
    // Overshoot during the pop-in.
    let peak = 0;
    for (let t = 0; t <= EMOTE_POP_IN; t += 0.005) peak = Math.max(peak, emoteScale(t, 1.6, false));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.3);
    expect(emoteScale(0.8, 1.6, false)).toBeGreaterThan(0.95);
    expect(emoteScale(0.8, 1.6, false)).toBeLessThan(1.05);
    // Pops out at the end.
    expect(emoteScale(1.6 - 0.001, 1.6, false)).toBeLessThan(0.1);
    expect(emoteDone(1.59, 1.6, false)).toBe(false);
    expect(emoteDone(1.6, 1.6, false)).toBe(true);
    expect(EMOTE_DEFAULT_SECONDS).toBeCloseTo(1.6);
  });

  it('looping emotes never end until dismissed, then pop out quickly', () => {
    expect(emoteDone(100, 1.6, true)).toBe(false);
    expect(emoteScale(100, 1.6, true)).toBeGreaterThan(0.9);
    expect(emoteScale(100, 1.6, true, EMOTE_POP_OUT * 0.99)).toBeLessThan(0.1);
    expect(emoteDone(100, 1.6, true, EMOTE_POP_OUT)).toBe(true);
    expect(emoteScale(-1, 1, false)).toBe(0);
  });

  it('bobs gently (zzz more lazily)', () => {
    for (let t = 0; t < 5; t += 0.1) {
      expect(Math.abs(emoteBob('heart', t))).toBeLessThanOrEqual(0.021);
      expect(Math.abs(emoteBob('zzz', t))).toBeLessThanOrEqual(0.061);
    }
  });
});

describe('emote sprite', () => {
  it('textures are cached + shared (headless placeholder in node)', () => {
    for (const k of ALL) {
      const t = emoteTexture(k);
      expect(t).toBe(emoteTexture(k));
      expect(isShared(t)).toBe(true);
    }
  });

  it('shows, scales and hides', () => {
    const parent = new THREE.Object3D();
    const e = new EmoteSprite(parent);
    expect(e.sprite.visible).toBe(false);
    e.show('heart', 1);
    expect(e.current).toBe('heart');
    e.update(0.5);
    expect(e.sprite.visible).toBe(true);
    expect(e.sprite.scale.x).toBeGreaterThan(0.3);
    e.update(0.6);
    expect(e.sprite.visible).toBe(false);
    expect(e.current).toBeNull();
    e.show('zzz');
    for (let i = 0; i < 100; i++) e.update(0.1);
    expect(e.current).toBe('zzz');
    e.show(null);
    expect(e.current).toBeNull();
    e.update(0.25);
    expect(e.sprite.visible).toBe(false);
    e.dispose();
    expect(parent.children.length).toBe(0);
  });
});
