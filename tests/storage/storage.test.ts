import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SAVE_KEY, createSaveStore, sanitizeSave, sanitizeSettings } from '../../src/storage';
import type { MorningReport } from '../../src/plan/types';

class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.map.size;
  }
}

const report = (over: Partial<MorningReport> = {}): MorningReport => ({
  seed: 1,
  daily: false,
  dateKey: null,
  arrival: 480,
  records: [{ id: 'hair', label: 'Hair', stars: 3, flags: ['approved:addy', 'approved:ellie'] }],
  totalStars: 12,
  maxStars: 18,
  grade: { title: 'X', blurb: 'Y' },
  awards: [{ id: 'coffeeArtisan', title: 'C', blurb: 'B', icon: 'coffee' }],
  newBestArrival: true,
  playSeconds: 600.4,
  ...over,
});

describe('storage', () => {
  it('starts from defaults and survives garbage', () => {
    const mem = new MemStorage();
    mem.setItem(SAVE_KEY, '{not json');
    const s = createSaveStore(mem as unknown as Storage);
    expect(s.data.settings).toEqual(DEFAULT_SETTINGS);
    expect(s.data.stats.mornings).toBe(0);
    expect(s.data.family.coffee).toBe('splash');
  });

  it('sanitises every field', () => {
    const s = sanitizeSettings({ master: 7, music: -1, quality: 'ultra', touchHand: 'left', hints: 'yes' });
    expect(s.master).toBe(1);
    expect(s.music).toBe(0);
    expect(s.quality).toBe('auto');
    expect(s.touchHand).toBe('left');
    expect(s.hints).toBe(true);
    expect(s.startAct).toBe(1);
    expect(sanitizeSettings({ startAct: 3 }).startAct).toBe(3);
    expect(sanitizeSettings({ startAct: 9 }).startAct).toBe(1);
    expect(sanitizeSettings({ startAct: '3' }).startAct).toBe(1);
    const d = sanitizeSave({ stats: { mornings: -3, bestArrival: 99999, awards: { a: 2, b: 'x' } }, seen: { tip: true, bad: 1 } });
    expect(d.stats.mornings).toBe(0);
    expect(d.stats.bestArrival).toBeNull();
    expect(d.stats.awards).toEqual({ a: 2, b: 0 });
    expect(d.seen).toEqual({ tip: true });
  });

  it('persists settings, family and seen flags', () => {
    const mem = new MemStorage();
    const s = createSaveStore(mem as unknown as Storage);
    s.setSettings({ music: 0.2 });
    s.setFamily({ ...s.data.family, coffee: 'latte' });
    s.markSeen('hint:brush');
    const again = createSaveStore(mem as unknown as Storage);
    expect(again.data.settings.music).toBe(0.2);
    expect(again.data.family.coffee).toBe('latte');
    expect(again.data.seen['hint:brush']).toBe(true);
  });

  it('records mornings: best arrival, awards, daily best, approvals', () => {
    const mem = new MemStorage();
    const s = createSaveStore(mem as unknown as Storage);
    expect(s.recordMorning(report())).toBe(true);
    expect(s.recordMorning(report({ arrival: 485, daily: true, dateKey: '2026-09-26', totalStars: 9 }))).toBe(false);
    const st = s.data.stats;
    expect(st.mornings).toBe(2);
    expect(st.bestArrival).toBe(480);
    expect(st.awards.coffeeArtisan).toBe(2);
    expect(st.daily['2026-09-26']).toBe(9);
    expect(st.momApproved).toBe(4);
    expect(st.bestStars).toBe(12);
    s.resetStats();
    expect(s.data.stats.mornings).toBe(0);
  });

  it('works with no storage at all', () => {
    const s = createSaveStore(null);
    s.setSettings({ sfx: 0.1 });
    expect(s.data.settings.sfx).toBe(0.1);
  });
});
