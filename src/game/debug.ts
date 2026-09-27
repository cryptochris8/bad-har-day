// window.__BHD__ debug hooks (dev, ?test=1, ?debug=1) — used by tools/shot.mjs, tools/walk.mjs and e2e.
import type { ActNumber, ActivityId } from '../plan';
import type { App } from './app';

declare global {
  interface Window {
    __BHD__?: DebugHooks;
  }
}

export type DebugHooks = ReturnType<typeof createDebugHooks>;

const ACTIVITY_IDS: readonly string[] = ['dog', 'coffee', 'lunch', 'trash', 'dishes', 'wake', 'hair', 'rush', 'drive'];

export function installDebugHooks(app: App): void {
  window.__BHD__ = createDebugHooks(app);
}

export function createDebugHooks(app: App) {
  return {
    /** 'boot' | 'menus' | 'playing' | 'paused' | 'results' (+ the UI's own screen id). */
    screen: () => app.screen,
    uiScreen: () => app.ui.screen,
    act: () => app.morning?.act ?? null,
    activity: () => app.morning?.activityId ?? null,
    clock: () => app.clock.minutes,
    clockLabel: () => app.clock.label(),
    startMorning: (seed?: number) => app.newMorning({ seed: seed ?? null }),
    /** Jump to an act number (1–5) or play one activity id. */
    jumpTo: (target: number | string) => {
      if (typeof target === 'number' && target >= 1 && target <= 5) app.newMorning({ act: target as ActNumber, dev: true });
      else if (typeof target === 'string' && ACTIVITY_IDS.includes(target)) app.newMorning({ activity: target as ActivityId, dev: true });
    },
    skipActivity: () => app.morning?.skipActivity(),
    /** Let the morning play itself (starts chores, skips activities) — e2e / smoke runs. */
    autopilot: (on = true) => {
      if (app.morning) app.morning.autopilot = on;
    },
    setClock: (m: number) => app.clock.jumpTo(m),
    plan: () => app.morning?.plan ?? null,
    state: () => {
      const s = app.morning?.state;
      return s ? { ...s, flags: [...s.flags] } : null;
    },
    records: () => app.morning?.records ?? null,
    report: () => app.morning?.report ?? null,
    stats: () => app.renderer.stats(),
    walker: () => ({ x: app.walker.position.x, z: app.walker.position.z, enabled: app.walker.enabled }),
    pause: () => app.pause(),
    resume: () => app.resume(),
  };
}
