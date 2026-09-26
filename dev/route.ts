// Route dev page: the school-run street + Maple Grove Elementary, lit by the world's shared sky/lights.
//   ?s=<metres along the route>   ?view=chase|overview|school|side|dropoff   ?time=H:MM (default 7:55)
//   ?seed=N   ?light=red|yellow|green (both traffic lights)   ?weather=clear|cloudy|drizzle   ?quality=low
//   ?van=0 (hide the minivan)   ?cam=x,y,z&look=x,y,z (route space: x, y, s)
import '@fontsource/luckiest-guy/latin-400.css';
import '@fontsource/baloo-2/latin-800.css';
import * as THREE from 'three';
import { createHarness } from './harness';
import { createWorld } from '../src/world';
import { buildRoute } from '../src/world/route';
import { parseClock } from '../src/world/lighting';
import { LANE_X } from '../src/world/types';

const params = new URLSearchParams(location.search);
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const h = createHarness({ lights: false, ground: false, background: 0x5fb0f0 });
const world = createWorld({ quality });
h.scene.add(world.root);
const t = parseClock(params.get('time'));
world.setClock(Number.isFinite(t) ? t : 475);
const w = params.get('weather');
if (w === 'cloudy' || w === 'drizzle') world.setWeather(w);
const seed = Number(params.get('seed') ?? 7) || 7;
const t0 = performance.now();
const route = buildRoute(world, seed);
const buildMs = performance.now() - t0;
const light = params.get('light');
if (light === 'red' || light === 'yellow' || light === 'green') route.lights.forEach((_l, i) => route.setLight(i, light));

const S0 = Number(params.get('s') ?? 20);
const view0 = params.get('view') ?? 'chase';
const van = world.car('minivan');
const showVan = params.get('van') !== '0';
if (showVan) route.root.add(van.root);
const p = (s: number, x: number, y: number): [number, number, number] => {
  const v = route.pointAt(s, x, new THREE.Vector3());
  return [v.x, y, v.z];
};
const vec = (q: string | null): [number, number, number] | null => {
  if (!q) return null;
  const a = q.split(',').map(Number);
  return a.length === 3 && a.every(Number.isFinite) ? [a[0]!, a[1]!, a[2]!] : null;
};
let label = '';
/** Frame a named view at route position S. */
function setView(view: string, S: number): void {
  label = `${view} @ ${S}`;
  const inBay = view === 'dropoff';
  van.root.position.set(inBay ? route.dropoff.x : (LANE_X[1] ?? 1.8), 0, -S);
  van.root.rotation.y = Math.PI;
  let focusS = S;
  const cam = vec(params.get('cam'));
  const look = vec(params.get('look'));
  if (cam && look) h.frame(p(cam[2], cam[0], cam[1]), p(look[2], look[0], look[1]), Number(params.get('fov')) || 55);
  else if (view === 'overview') {
    h.frame(p(S - 40, -30, 60), p(S + 80, 4, 0), 50);
    focusS = S + 40;
  } else if (view === 'school') {
    h.frame(p(500, -3.5, 4.4), p(522, 13, 3.4), 55);
    focusS = 520;
  } else if (view === 'dropoff') {
    h.frame(p(S - 9, -2.2, 3.4), p(S + 3, 10, 1.6), 52);
  } else if (view === 'side') {
    h.frame(p(S, -3, 2.2), p(S, 14, 2.6), 60);
  } else if (view === 'sideL') {
    h.frame(p(S, 3, 2.2), p(S, -16, 2.6), 60);
  } else h.frame(p(S - 8.2, 1.3, 3.9), p(S + 8, 1.8, 1.2), 55);
  const f = route.pointAt(focusS, 2, new THREE.Vector3());
  world.lighting.setShadowFocus(f.x, f.z);
}
setView(view0, S0);
world.setFocus(0, 0, 'dollhouse');
// ?tour=view@s,view@s,… : switch every 1.6 s (for multi-frame screenshots)
const tour = (params.get('tour') ?? '').split(',').filter(Boolean).map((t) => {
  const [v, s] = t.split('@');
  return { v: v ?? 'chase', s: Number(s ?? 20) };
});
let tourT = 0;
let tourI = 0;
h.onUpdate((dt) => {
  if (tour.length > 0) {
    tourT += dt;
    if (tourT > 1.6 && tourI < tour.length - 1) {
      tourT = 0;
      tourI++;
      setView(tour[tourI]!.v, tour[tourI]!.s);
    } else if (tourI === 0 && tourT < dt * 1.5) setView(tour[0]!.v, tour[0]!.s);
  }
  world.update(dt, h.camera);
  route.update(dt, h.camera);
  const s = h.renderer.stats();
  h.setInfo(`route seed ${seed} · ${label} · built in ${buildMs.toFixed(0)} ms`);
  window.__DEV__!.stats = s;
});
window.__DEV__ = { ready: false, frames: 0, route, setView };
h.start();
