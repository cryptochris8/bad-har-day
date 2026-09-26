// BAD HAIR DAY! — bootstrap. Everything interesting lives in src/game/app.ts.
//
// Dev/test URL params: ?seed=N, ?act=1..5 / ?activity=<id> (jump in), ?autostart=1, ?quality=auto|high|low,
//   ?noboot=1, ?test=1 / ?debug=1 (expose window.__BHD__ in production builds).
import { App, type AppParams } from './game/app';
import { installDebugHooks } from './game/debug';
import type { ActNumber, ActivityId } from './plan';
import type { Quality } from './render/types';

const ACTIVITY_IDS: readonly string[] = ['dog', 'coffee', 'lunch', 'trash', 'dishes', 'wake', 'hair', 'rush', 'drive'];

function parseParams(search: string): AppParams {
  const q = new URLSearchParams(search);
  const num = (key: string): number | null => {
    const raw = q.get(key);
    const n = raw !== null && raw.trim() !== '' ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const seed = num('seed');
  const act = num('act');
  const quality = q.get('quality');
  const activity = q.get('activity');
  return {
    seed: seed !== null ? Math.floor(seed) >>> 0 : null,
    quality: quality === 'high' || quality === 'low' || quality === 'auto' ? (quality as Quality) : null,
    act: act !== null && act >= 1 && act <= 5 ? (Math.floor(act) as ActNumber) : null,
    activity: activity !== null && ACTIVITY_IDS.includes(activity) ? (activity as ActivityId) : null,
    autostart: q.get('autostart') === '1',
    noBoot: q.get('noboot') === '1' || q.get('autostart') === '1',
    debug: import.meta.env.DEV || q.has('test') || q.has('debug'),
  };
}

const appEl = document.getElementById('app');
if (!appEl) throw new Error('#app root missing');
const params = parseParams(location.search);

/** Friendly full-screen message instead of a blank page (e.g. no WebGL). textContent only. */
function showFatal(root: HTMLElement, error: unknown): void {
  console.error(error);
  root.textContent = '';
  const box = document.createElement('div');
  box.className = 'bhd-fatal';
  const title = document.createElement('strong');
  title.textContent = 'BAD HAIR DAY! can’t start on this browser.';
  const body = document.createElement('p');
  body.textContent = /webgl/i.test(String(error))
    ? 'It needs WebGL (3D graphics). Turn on hardware acceleration in your browser settings, or try a current Chrome, Edge, Firefox or Safari.'
    : 'Something went wrong while loading. Try reloading the page, or a current Chrome, Edge, Firefox or Safari.';
  box.append(title, body);
  root.appendChild(box);
}

function hideSplash(): void {
  const el = document.getElementById('bhd-loading');
  if (!el) return;
  el.classList.add('bhd-done');
  setTimeout(() => el.remove(), 400);
}

try {
  const app = new App(appEl, params);
  if (params.debug) installDebugHooks(app);
  app.start();
} catch (error) {
  showFatal(appEl, error);
} finally {
  hideSplash();
}
