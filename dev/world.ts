// World dev page: the family home with its own lights / sky.
//   ?time=5:15|6:00|7:00|8:00 (or minutes)   ?focus=<RoomId>|x,z   ?view=dollhouse|overview|closeup:<station>
//   ?weather=clear|cloudy|drizzle   ?markers=1   ?anchors=1   ?nav=<fromAnchor>,<toAnchor>   ?cut=0   ?quality=low
//   fixtures: ?blanket=burrito|thrown|made|tucked  ?curtains=1  ?doors=1  ?dw=1  ?fridge=1  ?brew=1  ?water=1  ?trash=1  ?carDoors=1  ?wiggle=1
import * as THREE from 'three';
import { createHarness } from './harness';
import { createWorld, type WorldDebug } from '../src/world';
import { ANCHORS, roomBounds } from '../src/world/layout';
import { parseClock } from '../src/world/lighting';
import { DOLLHOUSE_VIEW, type AnchorId, type RoomId, type World } from '../src/world/types';

const params = new URLSearchParams(location.search);
const quality = params.get('quality') === 'low' ? 'low' : 'high';
const h = createHarness({ lights: false, ground: false, background: 0x0f1a3e });
const world = createWorld({ quality }) as World & { debug: WorldDebug };
h.scene.add(world.root);

// ── clock / weather ──
const t = parseClock(params.get('time'));
world.setClock(Number.isFinite(t) ? t : 315);
const w = params.get('weather');
if (w === 'cloudy' || w === 'drizzle') world.setWeather(w);

// ── framing ──
type Shot = { pos: [number, number, number]; look: [number, number, number]; fov: number };
const CLOSEUPS: Record<string, Shot> = {
  coffeeMaker: { pos: [5.5, 1.78, -4.45], look: [5.4, 1.1, -6.15], fov: 42 },
  sink: { pos: [6.75, 1.95, -4.3], look: [6.7, 0.85, -6.05], fov: 44 },
  lunchCounter: { pos: [4.4, 2.05, -4.35], look: [4.4, 0.9, -6.0], fov: 44 },
  vanity: { pos: [0.9, 1.48, -3.45], look: [0.9, 1.3, -6.3], fov: 50 },
  bedAddy: { pos: [-3.7, 2.3, -2.7], look: [-4.6, 0.55, -5.3], fov: 46 },
  bedHeidi: { pos: [-7.1, 2.3, -2.7], look: [-8.1, 0.55, -5.3], fov: 46 },
  backDoor: { pos: [7.0, 2.3, -1.6], look: [9.2, 0.9, -4.8], fov: 50 },
  yard: { pos: [14.5, 6.2, 2.5], look: [15.0, 0.4, -7.5], fov: 50 },
  driveway: { pos: [-10.5, 4.2, 11.5], look: [-13.6, 0.8, 2.8], fov: 46 },
};
const viewParam = params.get('view') ?? 'dollhouse';
let focus: [number, number] = [ANCHORS.chrisStart.x, ANCHORS.chrisStart.z];
const fp = params.get('focus');
if (fp) {
  const xz = fp.split(',').map(Number);
  if (xz.length === 2 && xz.every(Number.isFinite)) focus = [xz[0]!, xz[1]!];
  else {
    try {
      const b = roomBounds(fp as RoomId);
      focus = [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2];
    } catch {
      /* unknown room: keep default */
    }
  }
}
const DEG = Math.PI / 180;
if (viewParam.startsWith('closeup:')) {
  const s = CLOSEUPS[viewParam.slice(8)] ?? CLOSEUPS.vanity!;
  h.frame(s.pos, s.look, s.fov);
  world.setFocus(s.look[0], s.look[2], 'closeup');
  world.lighting.setShadowFocus(s.look[0], s.look[2]);
} else if (viewParam === 'overview') {
  const c: [number, number, number] = [1.5, 0, -1.5];
  h.frame([c[0], 30, c[2] + 24], c, 48);
  world.setFocus(focus[0], focus[1], 'dollhouse');
  world.debug.setCutEnabled(params.get('cut') === '1');
  world.lighting.setShadowFocus(c[0], c[2]);
} else {
  const d = DOLLHOUSE_VIEW.distance;
  const p = DOLLHOUSE_VIEW.pitchDeg * DEG;
  h.frame([focus[0], DOLLHOUSE_VIEW.focusY + Math.sin(p) * d, focus[1] + Math.cos(p) * d], [focus[0], DOLLHOUSE_VIEW.focusY, focus[1]], DOLLHOUSE_VIEW.fov);
  world.setFocus(focus[0], focus[1], 'dollhouse');
  world.lighting.setShadowFocus(focus[0], focus[1]);
}
if (params.get('cut') === '0') world.debug.setCutEnabled(false);

// ── fixture / state toggles ──
const blanket = params.get('blanket');
if (blanket === 'burrito' || blanket === 'thrown' || blanket === 'made' || blanket === 'tucked')
  for (const id of ['addy', 'ellie', 'heidi', 'master'] as const) world.bed(id).setBlanket(blanket);
if (params.get('curtains') === '1') {
  world.curtains('twins').open();
  world.curtains('heidi').open();
}
if (params.get('doors') === '1') {
  world.door('front').open();
  world.door('back').open();
}
const fx = world.fixtures;
if (params.get('dw') === '1') {
  fx.dishwasher.setDoor(1);
  fx.dishwasher.setRacks(1);
}
if (params.get('fridge') === '1') fx.fridge.setDoor(1);
if (params.get('brew') === '1') fx.coffeeMaker.setBrewing(true);
if (params.get('water') === '1') fx.sink.setWater(true);
if (params.get('trash') === '1') {
  fx.kitchenTrash.setLid(1);
  fx.outdoorBin.setLid(1);
}
if (params.get('carDoors') === '1') {
  const van = world.car('minivan');
  van.setDoor(0, 1);
  van.setDoor(2, 1);
  van.setDoor(3, 1);
  van.setHeadlights(true);
  van.setBrakeLights(true);
  world.car('ashley').setDoor(0, 1);
}
if (params.get('markers') === '1') for (const id of ['coffeeMaker', 'sink', 'lunchCounter', 'backDoorIn', 'kitchenTrash'] as AnchorId[]) world.marker(ANCHORS[id]);

// ── debug overlays ──
const labels: { el: HTMLDivElement; p: THREE.Vector3 }[] = [];
if (params.get('anchors') === '1') {
  const dotGeo = new THREE.SphereGeometry(0.07, 8, 6);
  for (const id of Object.keys(ANCHORS) as AnchorId[]) {
    const a = world.anchor(id);
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xff3d7f, depthTest: false }));
    dot.position.set(a.x, a.y + 0.05, a.z);
    dot.renderOrder = 20;
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.25, 6), new THREE.MeshBasicMaterial({ color: 0xffe27a, depthTest: false }));
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, 0, 0.18);
    const g = new THREE.Group();
    g.position.copy(dot.position);
    g.rotation.y = a.yaw;
    g.add(arrow);
    g.renderOrder = 20;
    h.scene.add(dot, g);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.textContent = id;
    document.body.appendChild(el);
    labels.push({ el, p: dot.position.clone() });
  }
  for (const hs of world.hideSpots) {
    const it = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0x5cf2ff, depthTest: false }));
    it.position.set(hs.item.x, hs.item.y + 0.06, hs.item.z);
    it.renderOrder = 20;
    h.scene.add(it);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.style.background = 'rgba(0,80,90,0.75)';
    el.textContent = hs.id;
    document.body.appendChild(el);
    labels.push({ el, p: it.position.clone() });
  }
}
const nav = params.get('nav');
if (nav) {
  const [a, b] = nav.split(',') as [AnchorId, AnchorId];
  const A = ANCHORS[a];
  const B = ANCHORS[b];
  if (A && B) {
    const pts = world.navPath(A, B);
    const line = [new THREE.Vector3(A.x, 0.08, A.z), ...pts.map((p) => new THREE.Vector3(p.x, 0.08, p.z))];
    const lg = new THREE.BufferGeometry().setFromPoints(line);
    const ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff3d7f, depthTest: false }));
    ln.renderOrder = 21;
    h.scene.add(ln);
    for (const p of line) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe27a, depthTest: false }));
      s.position.copy(p);
      s.renderOrder = 21;
      h.scene.add(s);
    }
  }
}

const proj = new THREE.Vector3();
let settled = false;
const wiggle = params.get('wiggle') === '1';
h.onUpdate((dt) => {
  world.update(dt, h.camera);
  if (!settled) {
    world.debug.settle();
    settled = true;
  }
  if (wiggle) world.bed('addy').wiggle(1);
  for (const l of labels) {
    proj.copy(l.p).project(h.camera);
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05;
    l.el.style.display = vis ? 'block' : 'none';
    l.el.style.left = `${((proj.x + 1) / 2) * innerWidth}px`;
    l.el.style.top = `${((1 - proj.y) / 2) * innerHeight}px`;
  }
  const s = h.renderer.stats();
  h.setInfo(`clock ${Math.floor(world.debug.clock / 60)}:${String(Math.round(world.debug.clock % 60)).padStart(2, '0')} · ${quality} · ${viewParam}`);
  window.__DEV__!.stats = s;
});
window.__DEV__ = { ready: false, frames: 0 };
(window as unknown as { world: World }).world = world;
h.start();
