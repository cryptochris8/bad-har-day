// Dev/e2e hook for the station chores: window.__BHD_STATION__ = { id, phase(), info() } while one runs (?test=1).
// Read-only introspection for tools/walk.mjs scripted walkthroughs — never used by gameplay.

export interface StationDebug {
  id: string;
  phase(): string;
  info(): Record<string, unknown>;
}

declare global {
  interface Window {
    __BHD_STATION__?: StationDebug | null;
  }
}

function enabled(): boolean {
  try {
    return typeof window !== 'undefined' && /[?&](test|debug)=1/.test(window.location.search);
  } catch {
    return false;
  }
}

export function exposeStation(d: StationDebug | null): void {
  if (!enabled()) return;
  if (d === null && window.__BHD_STATION__ === undefined) return;
  window.__BHD_STATION__ = d;
}
