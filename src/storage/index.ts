// localStorage save data (settings, family setup, lifetime stats). Everything read back is
// sanitised field by field — a corrupt or hand-edited save can never crash the game.
import { DEFAULT_LOOKS, sanitizeLooks } from '../family';
import type { CoffeeOrder, MorningReport } from '../plan/types';
import { DEFAULT_SETTINGS, type FamilySetup, type SaveData, type SaveStore, type Settings, type Stats } from './types';

export * from './types';

export const SAVE_KEY = 'bad-hair-day:save:v1';
const COFFEE: readonly CoffeeOrder[] = ['black', 'splash', 'creamSugar', 'latte'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, all: readonly T[], d: T): T => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : d);
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function sanitizeSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {};
  const d = DEFAULT_SETTINGS;
  return {
    master: num01(s.master, d.master),
    music: num01(s.music, d.music),
    sfx: num01(s.sfx, d.sfx),
    muted: bool(s.muted, d.muted),
    screenShake: bool(s.screenShake, d.screenShake),
    reducedMotion: bool(s.reducedMotion, d.reducedMotion),
    quality: oneOf(s.quality, ['auto', 'high', 'low'] as const, d.quality),
    touchControls: oneOf(s.touchControls, ['auto', 'on', 'off'] as const, d.touchControls),
    touchHand: oneOf(s.touchHand, ['right', 'left'] as const, d.touchHand),
    vibration: bool(s.vibration, d.vibration),
    hints: bool(s.hints, d.hints),
    startAct: typeof s.startAct === 'number' && [1, 2, 3, 4, 5].includes(s.startAct) ? (s.startAct as Settings['startAct']) : d.startAct,
  };
}

export function sanitizeFamily(v: unknown): FamilySetup {
  const f = isObj(v) ? v : {};
  return { looks: sanitizeLooks(f.looks), coffee: oneOf(f.coffee, COFFEE, 'splash') };
}

function countMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) if (k.length <= 64) out[k] = count(n);
  return out;
}

export function emptyStats(): Stats {
  return { mornings: 0, bestArrival: null, totalStars: 0, bestStars: 0, awards: {}, daily: {}, momApproved: 0, playSeconds: 0 };
}

export function sanitizeStats(v: unknown): Stats {
  const s = isObj(v) ? v : {};
  const best = s.bestArrival;
  return {
    mornings: count(s.mornings),
    bestArrival: typeof best === 'number' && Number.isFinite(best) && best > 0 && best < 24 * 60 ? best : null,
    totalStars: count(s.totalStars),
    bestStars: count(s.bestStars),
    awards: countMap(s.awards),
    daily: countMap(s.daily),
    momApproved: count(s.momApproved),
    playSeconds: count(s.playSeconds),
  };
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    family: { looks: structuredClone(DEFAULT_LOOKS), coffee: 'splash' },
    stats: emptyStats(),
    seen: {},
  };
}

export function sanitizeSave(v: unknown): SaveData {
  const s = isObj(v) ? v : {};
  const seen: Record<string, boolean> = {};
  if (isObj(s.seen)) for (const [k, b] of Object.entries(s.seen)) if (b === true && k.length <= 64) seen[k] = true;
  return {
    version: 1,
    settings: sanitizeSettings(s.settings),
    family: sanitizeFamily(s.family),
    stats: sanitizeStats(s.stats),
    seen,
  };
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // blocked (privacy mode / sandboxed iframe)
  }
}

export function createSaveStore(storage: Storage | null = safeStorage()): SaveStore {
  let data: SaveData = defaultSave();
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (raw) data = sanitizeSave(JSON.parse(raw));
  } catch {
    data = defaultSave();
  }
  const persist = () => {
    try {
      storage?.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Quota / blocked storage: the game keeps working with in-memory data.
    }
  };
  return {
    get data() {
      return data;
    },
    setSettings(patch) {
      data = { ...data, settings: sanitizeSettings({ ...data.settings, ...patch }) };
      persist();
    },
    setFamily(family) {
      data = { ...data, family: sanitizeFamily(family) };
      persist();
    },
    markSeen(key) {
      if (data.seen[key]) return;
      data = { ...data, seen: { ...data.seen, [key]: true } };
      persist();
    },
    recordMorning(report: MorningReport) {
      const st = data.stats;
      const newBest = st.bestArrival === null || report.arrival < st.bestArrival;
      const awards = { ...st.awards };
      for (const a of report.awards) awards[a.id] = (awards[a.id] ?? 0) + 1;
      const daily = { ...st.daily };
      if (report.daily && report.dateKey) daily[report.dateKey] = Math.max(daily[report.dateKey] ?? 0, report.totalStars);
      const approved = report.records.find((r) => r.id === 'hair')?.flags.filter((f) => f.startsWith('approved:')).length ?? 0;
      data = {
        ...data,
        stats: {
          mornings: st.mornings + 1,
          bestArrival: newBest ? report.arrival : st.bestArrival,
          totalStars: st.totalStars + report.totalStars,
          bestStars: Math.max(st.bestStars, report.totalStars),
          awards,
          daily,
          momApproved: st.momApproved + approved,
          playSeconds: st.playSeconds + Math.round(report.playSeconds),
        },
      };
      persist();
      return newBest;
    },
    resetStats() {
      data = { ...data, stats: emptyStats() };
      persist();
    },
  };
}
