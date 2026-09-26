// Props + FX dev page (dev server only). Every prop in a labelled grid on a kitchen counter,
// or the FX gallery. See dev/props.html for the URL params.
import * as THREE from 'three';
import { createHarness } from './harness';
import { PAL } from '../src/render/palette';
import { countTriangles } from '../src/render/models/builder';
import { BURST_KINDS, createFx } from '../src/render/fx/index';
import type { BurstKind } from '../src/render/types';
import {
  COFFEE_COLORS,
  DISH_KINDS,
  FOOD_KINDS,
  GIRL_COLORS,
  ITEM_KINDS,
  MISC_KINDS,
  MUG_DESIGNS,
  fitInSlot,
  makeDish,
  makeFood,
  makeItem,
  makeLunchbox,
  makeMug,
  makeProp,
  makeTrashBag,
  type DishProp,
  type FoodKind,
  type MugDesign,
  type MugProp,
  type Prop,
} from '../src/props/index';

const params = new URLSearchParams(location.search);
const fxParam = params.get('fx');
const zoom = Math.max(0.1, Number(params.get('zoom')) || 1);
const showLabels = params.get('labels') !== '0';
const h = createHarness({ ground: false, background: fxParam ? 0xcfe3ee : 0xe9dcc8 });
const labelsEl = document.getElementById('labels')!;
const userCam = params.has('cam');

interface Labelled {
  obj: THREE.Object3D;
  offset: THREE.Vector3;
  el: HTMLDivElement;
}
const labels: Labelled[] = [];
function label(obj: THREE.Object3D, text: string, sub: string, offset: THREE.Vector3): void {
  if (!showLabels) return;
  const el = document.createElement('div');
  el.textContent = text + ' ';
  if (sub) {
    const s = document.createElement('small');
    s.textContent = sub;
    el.appendChild(s);
  }
  labelsEl.appendChild(el);
  labels.push({ obj, offset, el });
}
const tmpV = new THREE.Vector3();
function updateLabels(): void {
  const w = innerWidth;
  const hh = innerHeight;
  for (const l of labels) {
    l.obj.getWorldPosition(tmpV).add(l.offset).project(h.camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05;
    l.el.style.display = vis ? '' : 'none';
    l.el.style.left = `${((tmpV.x + 1) / 2) * w}px`;
    l.el.style.top = `${((1 - tmpV.y) / 2) * hh}px`;
  }
}

function frameOn(center: THREE.Vector3, width: number, depth: number, elevDeg = 38, fov = 40): void {
  if (userCam) return;
  const view = params.get('view');
  if (view === 'dollhouse') {
    const pitch = THREE.MathUtils.degToRad(52);
    const dist = 13.5 / zoom;
    h.frame([center.x, center.y + Math.sin(pitch) * dist, center.z + Math.cos(pitch) * dist], [center.x, center.y, center.z], 38);
    return;
  }
  const el = THREE.MathUtils.degToRad(elevDeg);
  const aspect = innerWidth / Math.max(1, innerHeight);
  const vHalf = THREE.MathUtils.degToRad(fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const dist = (Math.max(width / 2 / Math.tan(hHalf), (depth * Math.sin(el) + 0.25) / 2 / Math.tan(vHalf)) * 1.12 + depth * 0.5 * Math.cos(el)) / zoom;
  h.frame([center.x, center.y + Math.sin(el) * dist, center.z + Math.cos(el) * dist], [center.x, center.y, center.z], fov);
}

// ── kitchen counter ─────────────────────────────────────────────────────────
function counter(w: number, d: number, cx: number, cz: number): void {
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), new THREE.MeshToonMaterial({ color: PAL.countertop }));
  top.position.set(cx, -0.025, cz);
  top.receiveShadow = true;
  h.scene.add(top);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.8, d - 0.08), new THREE.MeshToonMaterial({ color: PAL.cabinetSage }));
  cab.position.set(cx, -0.45, cz - 0.02);
  h.scene.add(cab);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.05), new THREE.MeshToonMaterial({ color: PAL.wallSage }));
  wall.position.set(cx, 0.55, cz - d / 2 - 0.025);
  wall.receiveShadow = true;
  h.scene.add(wall);
  const tiles = new THREE.Mesh(new THREE.BoxGeometry(w, 0.28, 0.02), new THREE.MeshToonMaterial({ color: PAL.floorTile }));
  tiles.position.set(cx, 0.14, cz - d / 2 + 0.005);
  h.scene.add(tiles);
  for (let x = -w / 2 + 0.15; x < w / 2; x += 0.15) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.28, 0.024), new THREE.MeshToonMaterial({ color: PAL.floorTileGrout }));
    g.position.set(cx + x, 0.14, cz - d / 2 + 0.005);
    h.scene.add(g);
  }
}

// ── props grid ──────────────────────────────────────────────────────────────
interface Entry {
  name: string;
  make: () => Prop;
}
const girlOrder = [GIRL_COLORS.addy, GIRL_COLORS.ellie, GIRL_COLORS.heidi];
const forcedGirl = params.get('color');
const girlColor = (i: number) => (forcedGirl && forcedGirl in GIRL_COLORS ? GIRL_COLORS[forcedGirl as keyof typeof GIRL_COLORS] : girlOrder[i % 3]!);
const liquidName = (params.get('liquid') ?? 'black') as keyof typeof COFFEE_COLORS;
const fill = params.has('fill') ? Number(params.get('fill')) : 0.78;
const lunchOpen = params.get('lunch') === 'open';

const LUNCH_FILL: FoodKind[][] = [
  ['sandwich', 'crackers', 'juiceBox', 'grapes'],
  ['wrap', 'pretzels', 'milkCarton', 'clementine'],
  ['pbj', 'granolaBar', 'waterBottle', 'appleSlices'],
];

function entries(cat: string): { list: Entry[]; cols: number; cell: number } {
  switch (cat) {
    case 'food':
      return { list: FOOD_KINDS.map((k) => ({ name: k, make: () => makeFood(k) })), cols: 4, cell: 0.3 };
    case 'dish':
      return { list: DISH_KINDS.map((k, i) => ({ name: k, make: () => makeDish(k, i % 2 ? girlColor(i) : undefined) })), cols: 3, cell: 0.48 };
    case 'mug': {
      const one = params.get('mug') as MugDesign | null;
      const designs = one && MUG_DESIGNS.includes(one) ? [one] : MUG_DESIGNS;
      return { list: designs.map((d) => ({ name: d, make: () => makeMug(d) })), cols: designs.length === 1 ? 1 : 3, cell: 0.3 };
    }
    case 'lunch':
      return {
        list: [0, 1, 2].map((i) => ({
          name: ['addy', 'ellie', 'heidi'][i]!,
          make: () => {
            const lb = makeLunchbox(girlOrder[i]!);
            if (lunchOpen) {
              lb.setOpen(1);
              LUNCH_FILL[i]!.forEach((k, s) => fitInSlot(makeFood(k), lb.slots[s]!));
              fitInSlot(makeFood('loveNote'), lb.noteSlot);
            }
            return lb;
          },
        })),
        cols: 3,
        cell: 0.45,
      };
    case 'items':
      return { list: ITEM_KINDS.map((k, i) => ({ name: k, make: () => makeItem(k, girlColor(i)) })), cols: 4, cell: 0.46 };
    case 'misc':
      return {
        list: MISC_KINDS.filter((k) => k !== 'stopSign').map((k) => ({ name: k, make: () => makeProp(k) })),
        cols: 5,
        cell: 0.36,
      };
    case 'big':
      return {
        list: [
          { name: 'trashBag', make: () => makeTrashBag() },
          { name: 'stopSign', make: () => makeProp('stopSign') },
          { name: 'backpack', make: () => makeItem('backpack', girlColor(2)) },
        ],
        cols: 3,
        cell: 0.7,
      };
    default:
      return { list: [], cols: 1, cell: 0.3 };
  }
}

/** `only=a,b` keeps just those props (close inspection). */
function filtered(cat: string): { list: Entry[]; cols: number; cell: number } {
  const e = entries(cat);
  const only = params.get('only');
  if (!only) return e;
  const names = only.split(',');
  const list = e.list.filter((x) => names.includes(x.name));
  return { list, cols: Math.min(list.length, Number(params.get('cols')) || 3), cell: e.cell };
}

const mugs: MugProp[] = [];
const all: Prop[] = [];
const tris: Record<string, number> = {};

function buildGrid(cat: string, origin: THREE.Vector3): { w: number; d: number } {
  const { list, cols, cell } = filtered(cat);
  const rows = Math.ceil(list.length / cols);
  const w = cols * cell;
  const d = rows * cell;
  list.forEach((e, i) => {
    const p = e.make();
    const c = i % cols;
    const r = Math.floor(i / cols);
    const bb = p.root.userData.bounds as THREE.Box3 | undefined;
    const cx = bb ? (bb.min.x + bb.max.x) / 2 : 0;
    const cz = bb ? (bb.min.z + bb.max.z) / 2 : 0;
    p.root.position.set(origin.x - w / 2 + (c + 0.5) * cell - cx, origin.y, origin.z - d / 2 + (r + 0.5) * cell - cz);
    h.scene.add(p.root);
    all.push(p);
    const n = countTriangles(p.root, true);
    tris[`${cat}:${e.name}`] = n;
    if ('setFill' in p) {
      const m = p as MugProp;
      m.setFill(fill);
      m.setLiquid(COFFEE_COLORS[liquidName] ?? COFFEE_COLORS.black);
      m.setSteam(params.get('steam') !== '0');
      mugs.push(m);
    }
    if (params.get('dirty') === '1' && 'setDirty' in p) (p as DishProp).setDirty(1);
    if (params.get('peek') && 'setPeek' in p) (p as unknown as { setPeek(v: number): void }).setPeek(Number(params.get('peek')));
    label(p.root, e.name, `${n}`, new THREE.Vector3(cx, -0.01, Math.min(bb ? bb.max.z : p.radius, cz + cell * 0.45) + 0.015));
  });
  return { w, d };
}

function propsPage(): void {
  const cat = params.get('cat') ?? 'all';
  const cats = cat === 'all' ? ['food', 'dish', 'mug', 'lunch', 'items', 'misc', 'big'] : [cat];
  let z = 0;
  let maxW = 0;
  const blocks: { cat: string; z: number; d: number; w: number }[] = [];
  // Measure first (rows × cell) so blocks stack front → back.
  for (const c of cats) {
    const { list, cols, cell } = filtered(c);
    if (!list.length) continue;
    const d = Math.ceil(list.length / cols) * cell;
    blocks.push({ cat: c, z: 0, d, w: cols * cell });
  }
  for (const b of blocks) {
    b.z = z - b.d / 2;
    z -= b.d + 0.08;
    maxW = Math.max(maxW, b.w);
  }
  const totalD = -z;
  for (const b of blocks) buildGrid(b.cat, new THREE.Vector3(0, 0, b.z + totalD / 2));
  counter(maxW + 0.3, totalD + 0.2, 0, 0);
  frameOn(new THREE.Vector3(0, cat === 'big' ? 0.55 : 0.03, 0), maxW, totalD + (cat === 'big' ? 1.2 : 0));
  const hl = params.get('highlight');
  if (hl) {
    const v = Number(hl);
    all.forEach((p, i) => p.setHighlight(params.get('hlall') === '1' || i % 2 === 0 ? (Number.isFinite(v) ? v : 1) : 0));
  }
  h.onUpdate((dt) => {
    for (const m of mugs) m.update(dt);
    updateLabels();
  });
  const total = Object.values(tris).reduce((a, b) => a + b, 0);
  h.setInfo(`${all.length} props · ${(total / 1000).toFixed(1)}k tris (props)`);
  window.__DEV__ = { ...window.__DEV__, tris, props: all.length };
}

// ── FX gallery ─────────────────────────────────────────────────────────────
function fxPage(): void {
  const fx = createFx();
  h.scene.add(fx.root);
  const dark = params.get('dark') === '1';
  if (dark) h.scene.background = new THREE.Color(PAL.skyNightTop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshToonMaterial({ color: dark ? PAL.grassNight : PAL.countertop }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  h.scene.add(floor);
  const one = params.get('fxkind')?.split(',') ?? null;
  type Cell = { name: string; period: number; y: number; fire: (at: THREE.Vector3) => void };
  const bursts: Cell[] = BURST_KINDS.map((k: BurstKind) => ({
    name: k,
    period: ({ fire: 0.18, sparkle: 0.3, steam: 0.45, bubble: 0.5, heart: 0.8, leaf: 1.1, dust: 0.7 } as Partial<Record<BurstKind, number>>)[k] ?? 1.0,
    y: k === 'leaf' ? 0.8 : k === 'steam' ? 0.13 : k === 'crumb' ? 0.12 : k === 'bubble' ? 0.08 : k === 'dust' || k === 'turf' || k === 'foam' || k === 'splash' ? 0.05 : 0.35,
    fire: (at) => fx.burst(k, at),
  }));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshToonMaterial({ color: PAL.ballYellow }));
  h.scene.add(ball);
  const extras: Cell[] = [
    { name: 'confetti', period: 3.2, y: 0, fire: (at) => fx.confetti(at, 0.45, 0.25) },
    { name: 'ring', period: 0.9, y: 0.01, fire: (at) => fx.ring(at, PAL.interact, 0.45, 0.8) },
    { name: 'trail', period: 99, y: 0.4, fire: () => {} },
  ];
  const cells = one ? [...bursts, ...extras].filter((c) => one.includes(c.name)) : [...bursts, ...extras];
  const cols = Math.min(cells.length, Number(params.get('cols')) || 4);
  const cell = 0.9;
  const rows = Math.ceil(cells.length / cols);
  const pos = cells.map((_, i) => new THREE.Vector3(-((cols - 1) * cell) / 2 + (i % cols) * cell, 0, -((rows - 1) * cell) / 2 + Math.floor(i / cols) * cell));
  const timers = cells.map((c, i) => (i * 0.37) % c.period);
  cells.forEach((c, i) => {
    const anchor = new THREE.Object3D();
    anchor.position.copy(pos[i]!);
    h.scene.add(anchor);
    label(anchor, c.name, '', new THREE.Vector3(0, Math.max(0, c.y - 0.12), 0.05));
    if (c.name === 'steam') {
      const m = makeMug('sunflower');
      m.setFill(0.8);
      m.root.position.copy(pos[i]!);
      h.scene.add(m.root);
    }
    if (c.name === 'crumb') {
      const b = makeProp('cerealBowl');
      b.root.position.copy(pos[i]!);
      h.scene.add(b.root);
    }
    if (c.name === 'bubble') {
      const b = makeDish('plate');
      b.root.position.copy(pos[i]!);
      h.scene.add(b.root);
    }
  });
  const trailIdx = cells.findIndex((c) => c.name === 'trail');
  if (trailIdx >= 0) fx.trail(ball, PAL.great, 0.08);
  else ball.visible = false;
  if (fxParam === 'fireworks') fx.fireworks(4, { x: 0, y: 0, z: -8 });
  frameOn(new THREE.Vector3(0, 0.3, 0), cols * cell, rows * cell, 24, 40);
  let t = 0;
  h.onUpdate((dt) => {
    t += dt;
    cells.forEach((c, i) => {
      timers[i]! -= dt;
      if (timers[i]! <= 0) {
        timers[i] = c.period;
        tmpV.copy(pos[i]!);
        tmpV.y += c.y;
        c.fire(tmpV);
      }
    });
    if (trailIdx >= 0) {
      const p = pos[trailIdx]!;
      ball.position.set(p.x + Math.cos(t * 3) * 0.3, 0.35 + Math.sin(t * 6) * 0.12, p.z + Math.sin(t * 3) * 0.3);
    }
    if (fxParam === 'fireworks' && fx.activeShells === 0 && Math.floor(t * 10) % 25 === 0) fx.fireworks(3, { x: 0, y: 0, z: -8 });
    fx.update(dt, h.camera);
    updateLabels();
  });
  h.setInfo('FX gallery');
  window.__DEV__ = { ...window.__DEV__, fx: cells.length };
}

if (fxParam) fxPage();
else propsPage();
h.start();
