// ─────────────────────────────────────────────────────────────────────────────
// STORAGE CONTRACT — settings, family setup and lifetime stats (localStorage).
// Owner: integration (src/storage/*). SHARED CONTRACT (frozen).
// ─────────────────────────────────────────────────────────────────────────────
import type { FamilyLooks } from '../family/types';
import type { CoffeeOrder } from '../plan/types';
import type { Quality } from '../render/types';

export interface Settings {
  master: number; // 0..1
  music: number;
  sfx: number;
  muted: boolean;
  screenShake: boolean;
  reducedMotion: boolean;
  quality: Quality;
  touchControls: 'auto' | 'on' | 'off';
  touchHand: 'right' | 'left';
  vibration: boolean;
  /** Show gentle hint bubbles ("Start lower — work the ends first!"). */
  hints: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  master: 0.85,
  music: 0.7,
  sfx: 0.9,
  muted: false,
  screenShake: true,
  reducedMotion: false,
  quality: 'auto',
  touchControls: 'auto',
  touchHand: 'right',
  vibration: true,
  hints: true,
});

export interface FamilySetup {
  looks: FamilyLooks;
  coffee: CoffeeOrder;
}

export interface Stats {
  mornings: number;
  /** Best (earliest) arrival (minutes since midnight) or null. */
  bestArrival: number | null;
  totalStars: number;
  bestStars: number;
  /** Award id → times earned. */
  awards: Record<string, number>;
  /** Daily morning dateKey → best stars that day. */
  daily: Record<string, number>;
  /** Mom-approved hair checks (lifetime). */
  momApproved: number;
  /** Seconds played (lifetime). */
  playSeconds: number;
}

export interface SaveData {
  version: 1;
  settings: Settings;
  family: FamilySetup;
  stats: Stats;
  /** First-run flags: tutorials / hints seen. */
  seen: Record<string, boolean>;
}

export interface SaveStore {
  readonly data: Readonly<SaveData>;
  setSettings(patch: Partial<Settings>): void;
  setFamily(family: FamilySetup): void;
  markSeen(key: string): void;
  /** Record a finished morning; returns whether the arrival is a new best. */
  recordMorning(report: import('../plan/types').MorningReport): boolean;
  resetStats(): void;
}
