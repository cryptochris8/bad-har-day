// Hair dev page: mannequin girls + the brushable hair rig + the four brushes.
//
// URL params:
//   view=back|front|side|three4|dollhouse   (camera; back = the brushing close-up, girl facing the mirror)
//   pattern=clean|light|heavy|rainy|sleepMess   tangle=0..1 (scales the pattern / uniform fill)
//   bedhead=0..1  shine=0..1  markers=off|soft|inspect  color=hex  seed=N  length=m  cols=N rows=N
//   brush=u,v (a brush in contact)  press=0..1  dv=… du=… brushKind=black|purple|pink|teal
//   sway=1 (animated head motion)  three=1 (three girls on stools)  brushes=1 (the four brushes, black glowing)
//   yaw=deg (girl yaw override)  dist=m (dollhouse distance override)  flip=1 (hair flip loop)
//   fam=1 (use the real family girls from src/family instead of the mannequin)  nobrush=1 (hide the brush mesh)
//   mirror=1 (with three=1: a vanity mirror with the Act III reflection; __DEV__.mirrorImage() dumps the RT)
//   cam=x,y,z&look=x,y,z&fov=… (explicit framing)
// Drag on the hair to brush it (downward strokes clear tangles, work from the ends up); drag elsewhere to orbit.
// Keys: M markers · B bedhead · R re-roll tangles · F hair flip · 1-4 brush kind
// window.__DEV__: rigs, camera, pattern(name, scale), stroke(u, v0, v1, steps?, release?) → { before, after }
import * as THREE from 'three';
import { Rng } from '../src/core/rng';
import { brushPoseOnHair, createBrush, createGirlHair, fieldMean, sweepCells } from '../src/hair';
import type { GirlHairRig } from '../src/hair/rig';
import type { Brush, BrushKind, HairFit } from '../src/hair/types';
import { GeoBuilder, mixHex } from '../src/render/models/builder';
import { eyeParts } from '../src/render/models/common';
import { modelMaterial } from '../src/render/models/materials';
import { HAIR_COLORS, PAL, SKIN_TONES } from '../src/render/palette';
import { createHarness } from './harness';
import { MirrorReflection } from '../src/activities/hair/mirror';
import { createCharacter, DEFAULT_LOOKS } from '../src/family';
import type { Character, GirlId } from '../src/family/types';

const P = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = P.get(k);
  const n = v === null ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const view = P.get('view') ?? (P.get('three') === '1' ? 'three' : P.get('brushes') === '1' ? 'brushes' : 'back');
const three = P.get('three') === '1';
const brushesMode = P.get('brushes') === '1';
const sway = P.get('sway') === '1';
const fam = P.get('fam') === '1';

const h = createHarness({ ground: true, camera: { pos: [0, 1.4, 1.2], look: [0, 1.0, 0] } });
const info = document.createElement('div');
info.className = 'hud';
document.body.appendChild(info);

// ── mannequin (twin proportions from the family spec: big cartoon head) ────────
interface GirlSpec {
  height: number;
  rx: number;
  ry: number;
  rz: number;
  shoulderY: number;
  shoulderX: number;
  torsoW: number;
  torsoD: number;
  hipsY: number;
  armR: number;
}
const TWIN: GirlSpec = { height: 1.36, rx: 0.19, ry: 0.2, rz: 0.185, shoulderY: 0.905, shoulderX: 0.165, torsoW: 0.148, torsoD: 0.108, hipsY: 0.62, armR: 0.045 };
const HEIDI: GirlSpec = { height: 1.2, rx: 0.19, ry: 0.182, rz: 0.18, shoulderY: 0.79, shoulderX: 0.148, torsoW: 0.142, torsoD: 0.108, hipsY: 0.52, armR: 0.043 };

interface Girl {
  root: THREE.Group;
  head: THREE.Object3D;
  hair: GirlHairRig;
  fit: HairFit;
  headY: number;
  seated: boolean;
  /** Real family character (fam=1) — it updates its own hair. */
  character?: Character;
}

function fitFor(s: GirlSpec): HairFit {
  const headC = s.height - s.ry;
  const shoulderTop = s.shoulderY + s.armR * 0.7;
  return {
    rx: s.rx,
    ry: s.ry,
    rz: s.rz,
    shoulderY: shoulderTop - headC,
    shoulderHalfWidth: s.shoulderX + s.armR * 1.05,
    backZ: -(s.torsoD * 0.96 + 0.012) - 0.01,
    neckY: -0.165,
  };
}

function mannequin(s: GirlSpec, o: { pj: number; skin: number; hair: number; seed: number; length: number; seated: boolean; cols?: number; rows?: number }): Girl {
  const root = new THREE.Group();
  const drop = o.seated ? s.hipsY - 0.42 : 0; // seated: hips on a 0.42 m stool
  const headC = s.height - s.ry - drop;
  const b = new GeoBuilder(true, true);
  const hip = s.hipsY - drop;
  const sh = s.shoulderY - drop;
  // torso + shoulders + neck
  b.add(new THREE.CapsuleGeometry(0.12, Math.max(0.05, sh - hip - 0.17), 4, 14), o.pj, { at: [0, (hip + sh) / 2 + 0.01, 0], scale: [s.torsoW / 0.12, 1, s.torsoD / 0.12], smooth: true });
  for (const sd of [-1, 1]) {
    b.sphere(s.armR * 1.25, 12, 8, o.pj, { at: [sd * s.shoulderX, sh, 0], smooth: true });
    b.add(new THREE.CapsuleGeometry(s.armR, 0.26, 4, 10), o.pj, { at: [sd * (s.shoulderX + 0.02), sh - 0.17, o.seated ? 0.06 : 0], rot: [o.seated ? -0.5 : 0, 0, sd * 0.12], smooth: true });
    b.sphere(s.armR * 1.15, 10, 8, o.skin, { at: [sd * (s.shoulderX + 0.045), sh - 0.34, o.seated ? 0.17 : 0.01], smooth: true });
    if (o.seated) {
      b.add(new THREE.CapsuleGeometry(0.06, 0.22, 4, 10), mixHex(o.pj, PAL.outline, 0.12), { at: [sd * 0.075, hip, 0.14], rot: [Math.PI / 2, 0, 0], smooth: true });
      b.add(new THREE.CapsuleGeometry(0.055, 0.3, 4, 10), mixHex(o.pj, PAL.outline, 0.12), { at: [sd * 0.075, hip - 0.19, 0.28], smooth: true });
    } else {
      b.add(new THREE.CapsuleGeometry(0.06, hip - 0.12, 4, 10), mixHex(o.pj, PAL.outline, 0.12), { at: [sd * 0.075, hip / 2 + 0.02, 0], smooth: true });
    }
  }
  b.cyl(0.052, 0.056, 0.12, 12, o.skin, { at: [0, sh + 0.06, 0], smooth: true });
  const body = new THREE.Mesh(b.build(), modelMaterial());
  body.castShadow = true;
  root.add(body);
  if (o.seated) {
    const st = new GeoBuilder(true, true);
    st.cyl(0.19, 0.19, 0.05, 20, PAL.woodWarm, { at: [0, 0.395, 0], smooth: true });
    for (const [x, z] of [
      [0.12, 0.12],
      [-0.12, 0.12],
      [0.12, -0.12],
      [-0.12, -0.12],
    ] as const)
      st.cyl(0.02, 0.022, 0.38, 8, PAL.woodDark, { at: [x, 0.19, z] });
    root.add(new THREE.Mesh(st.build(), modelMaterial()));
  }
  // head (own group so it can turn/flip; hair attaches here)
  const head = new THREE.Group();
  head.position.set(0, headC, 0.01);
  root.add(head);
  const hb = new GeoBuilder(true, true);
  hb.sphere(1, 28, 20, o.skin, { scale: [s.rx, s.ry, s.rz], smooth: true });
  for (const sd of [-1, 1]) {
    hb.sphere(0.04, 10, 8, o.skin, { at: [sd * s.rx * 0.98, -0.01, -0.005], scale: [0.55, 1, 0.8], smooth: true });
    const yaw = sd * 0.35;
    const pitch = -0.1;
    const d = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
    eyeParts(hb, [d[0]! * s.rx * 0.93, d[1]! * s.ry * 0.93, d[2]! * s.rz * 0.93], 0.058, 0x3a2418, 0);
    const bd = [Math.sin(sd * 0.55), Math.sin(-0.33), Math.cos(0.55)];
    hb.sphere(0.03, 8, 6, PAL.blush, { at: [bd[0]! * s.rx * 0.96, bd[1]! * s.ry * 0.96, bd[2]! * s.rz * 0.93], scale: [1.3, 0.7, 0.4], ink: false, smooth: true });
    hb.box(0.05, 0.009, 0.012, PAL.eyeInk ?? PAL.outline, { at: [sd * 0.072, 0.075, s.rz * 0.93], rot: [0, 0, sd * -0.12], ink: false });
  }
  hb.torus(0.028, 0.006, 4, 10, PAL.lipLine ?? PAL.outline, { at: [0, -0.1, s.rz * 0.94], rot: [0, 0, Math.PI], ink: false }, Math.PI);
  const headMesh = new THREE.Mesh(hb.build(), modelMaterial());
  headMesh.castShadow = true;
  head.add(headMesh);
  const fit = fitFor(s);
  const hair = createGirlHair({ fit, color: o.hair, length: o.length, seed: o.seed, cols: o.cols, rows: o.rows }) as GirlHairRig;
  head.add(hair.root);
  return { root, head, hair, fit, headY: headC, seated: o.seated };
}

/** A real family girl (fam=1). The character owns and updates the hair rig. */
function familyGirl(id: GirlId, hairHex: number | null, seated: boolean): Girl {
  const look = { ...DEFAULT_LOOKS.members[id], ...(hairHex !== null ? { hair: hairHex } : {}) };
  const c = createCharacter(id, look);
  if (seated) c.setPose('sit', { seatHeight: 0.42 });
  const head = c.socket('head');
  c.root.updateMatrixWorld(true);
  const hp = head.getWorldPosition(new THREE.Vector3());
  if (seated) {
    const st = new GeoBuilder(true, true);
    st.cyl(0.19, 0.19, 0.05, 20, PAL.woodWarm, { at: [0, 0.395, -0.12], smooth: true });
    for (const [x, z] of [
      [0.12, 0.0],
      [-0.12, 0.0],
      [0.12, -0.24],
      [-0.12, -0.24],
    ] as const)
      st.cyl(0.02, 0.022, 0.38, 8, PAL.woodDark, { at: [x, 0.19, z] });
    c.root.add(new THREE.Mesh(st.build(), modelMaterial()));
  }
  const hair = c.hair as GirlHairRig;
  return { root: c.root, head, hair, fit: hair.layout.fit, headY: hp.y, seated, character: c };
}

// ── tangle presets ────────────────────────────────────────────────────────────
function applyPattern(rig: GirlHairRig, name: string, scale: number, seed: number): void {
  const rng = new Rng(seed * 7919 + 13);
  const { cols, rows } = rig;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const low = r / Math.max(1, rows - 1); // 0 scalp → 1 ends
      let v = 0;
      switch (name) {
        case 'light':
          v = rng.chance(0.28) ? rng.range(0.2, 0.5) : rng.range(0, 0.08);
          break;
        case 'heavy':
          v = rng.chance(0.8) ? rng.range(0.35, 0.95) * (0.6 + 0.4 * low) : rng.range(0, 0.15);
          break;
        case 'rainy':
          v = low > 0.7 ? rng.range(0.65, 1) : low > 0.4 ? rng.range(0.25, 0.6) : rng.range(0, 0.18);
          break;
        case 'sleepMess':
          v = rng.range(0.3, 0.7) * (0.7 + 0.3 * low);
          break;
        default:
          v = 0;
      }
      rig.tangle[r * cols + c] = Math.min(1, v * scale);
    }
  rig.commit();
}

// ── scene ─────────────────────────────────────────────────────────────────────
const girls: Girl[] = [];
const seed = num('seed', 7);
const colorParam = P.get('color');
const hairHex = colorParam ? Number.parseInt(colorParam.replace('#', ''), 16) : 0x6b3d24;
const pattern = P.get('pattern') ?? (P.get('tangle') ? 'fill' : 'clean');
const tScale = num('tangle', 1);
const skin = SKIN_TONES[1]!;

if (three) {
  const looks = [
    { spec: TWIN, pj: PAL.addyMain, hair: HAIR_COLORS[2]!.hex, len: 0.55 },
    { spec: TWIN, pj: PAL.ellieMain, hair: HAIR_COLORS[0]!.hex, len: 0.55 },
    { spec: HEIDI, pj: PAL.heidiMain, hair: HAIR_COLORS[6]!.hex, len: 0.48 },
  ];
  looks.forEach((lk, i) => {
    const g = fam
      ? familyGirl((['addy', 'ellie', 'heidi'] as const)[i]!, colorParam ? hairHex : lk.hair, true)
      : mannequin(lk.spec, { pj: lk.pj, skin: SKIN_TONES[i === 2 ? 0 : 1]!, hair: colorParam ? hairHex : lk.hair, seed: seed + i * 31, length: lk.len, seated: true });
    g.root.position.set((i - 1) * 0.72, 0, P.get('mirror') === '1' ? -0.45 : 0);
    g.root.rotation.y = Math.PI;
    h.scene.add(g.root);
    girls.push(g);
  });
} else if (!brushesMode) {
  const g = fam
    ? familyGirl('addy', colorParam ? hairHex : null, false)
    : mannequin(TWIN, { pj: PAL.addyMain, skin, hair: hairHex, seed, length: num('length', 0.55), seated: false, cols: num('cols', 9), rows: num('rows', 4) });
  const yawDefault = view === 'front' || view === 'dollhouse' ? 0 : view === 'side' ? Math.PI / 2 : Math.PI;
  g.root.rotation.y = P.get('yaw') !== null ? (num('yaw', 0) * Math.PI) / 180 : yawDefault;
  h.scene.add(g.root);
  girls.push(g);
  if (view === 'dollhouse' && P.get('solo') !== '1') {
    // Two friends for comparison at dollhouse distance: neat (left) and bedhead (right).
    const a = fam ? familyGirl('ellie', HAIR_COLORS[0]!.hex, false) : mannequin(TWIN, { pj: PAL.ellieMain, skin, hair: HAIR_COLORS[0]!.hex, seed: seed + 5, length: 0.55, seated: false });
    a.root.position.set(-0.9, 0, 0.2);
    a.root.rotation.y = 0.5;
    h.scene.add(a.root);
    girls.push(a);
    const c = fam ? familyGirl('heidi', HAIR_COLORS[6]!.hex, false) : mannequin(HEIDI, { pj: PAL.heidiMain, skin: SKIN_TONES[0]!, hair: HAIR_COLORS[6]!.hex, seed: seed + 9, length: 0.48, seated: false });
    c.root.position.set(0.9, 0, 0.1);
    c.root.rotation.y = -0.7;
    h.scene.add(c.root);
    girls.push(c);
  }
}

for (const [i, g] of girls.entries()) {
  if (pattern === 'fill') {
    g.hair.tangle.fill(tScale);
    g.hair.commit();
  } else applyPattern(g.hair, pattern, tScale, seed + i);
  const bedDefault = pattern === 'sleepMess' ? 1 : 0;
  g.hair.setBedhead(num('bedhead', bedDefault));
  g.hair.setShine(num('shine', pattern === 'clean' ? 1 : 0.55));
  const mk = P.get('markers');
  g.hair.setKnotMarkers(mk === 'soft' || mk === 'inspect' ? mk : 'off');
}
// Dollhouse comparison: the middle girl uses the URL bedhead; the left one neat, the right one full bedhead.
if (view === 'dollhouse' && girls.length === 3 && !three) {
  girls[1]!.hair.setBedhead(0);
  girls[2]!.hair.setBedhead(1);
}

// ── brushes ───────────────────────────────────────────────────────────────────
const brushes: Brush[] = [];
if (brushesMode) {
  const cb = new GeoBuilder(true, true);
  cb.box(1.1, 0.06, 0.5, PAL.countertop, { at: [0, 0.87, 0] });
  cb.box(1.06, 0.84, 0.46, PAL.cabinetSage, { at: [0, 0.42, -0.01] });
  h.scene.add(new THREE.Mesh(cb.build(), modelMaterial()));
  const kinds: BrushKind[] = ['purple', 'black', 'pink', 'teal'];
  kinds.forEach((k, i) => {
    const br = createBrush(k);
    // Lying on the counter, bristles up, heads away from the camera; the round brush lies on its side.
    if (k === 'pink') {
      br.root.position.set((i - 1.5) * 0.2, 0.9 + 0.03, 0.03);
      br.root.rotation.set(-Math.PI / 2, 0, -0.1);
    } else {
      br.root.position.set((i - 1.5) * 0.2, 0.9 + 0.01, 0.03 + (k === 'black' ? 0.03 : 0));
      br.root.rotation.set(-Math.PI / 2, 0, k === 'black' ? 0.18 : (i - 1.5) * 0.12);
    }
    if (k === 'black') br.setGlow(num('glow', 1));
    h.scene.add(br.root);
    brushes.push(br);
  });
}

// The hand brush (brush=u,v or interactive).
let brushKind: BrushKind = (P.get('brushKind') as BrushKind | null) ?? 'black';
let handBrush = createBrush(brushKind);
handBrush.root.visible = false;
h.scene.add(handBrush.root);
const brushParam = P.get('brush');
const staticContact = brushParam ? brushParam.split(',').map(Number) : null;

// ── mirror test (mirror=1, with three=1): a vanity mirror in front of the seated girls + a wall behind it ──
let mirrorFx: MirrorReflection | null = null;
if (P.get('mirror') === '1') {
  const wb = new GeoBuilder(true, true);
  wb.box(4, 2.6, 0.12, PAL.wallSky, { at: [0, 1.3, -1.12] }); // wall BEHIND the mirror (must be clipped)
  wb.box(2.4, 1.05, 0.06, PAL.woodWarm, { at: [0, 1.35, -1.02] }); // frame
  wb.box(2.6, 0.86, 0.5, PAL.cabinetCream, { at: [0, 0.43, -0.8] }); // vanity
  wb.box(5, 0.02, 5, PAL.floorTile, { at: [0, 0.01, 0] });
  wb.box(4, 2.6, 0.12, PAL.wallButter, { at: [0, 1.3, 2.4] }); // wall behind the camera (seen in the mirror)
  const room = new THREE.Mesh(wb.build(), modelMaterial());
  h.scene.add(room);
  const mirrorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.92), new THREE.MeshBasicMaterial({ color: PAL.mirror }));
  mirrorMesh.position.set(0, 1.35, -0.985);
  h.scene.add(mirrorMesh);
  mirrorFx = new MirrorReflection(h.renderer.renderer, h.scene, mirrorMesh, { width: 640, height: 320, hz: 30 });
  mirrorFx.include(room);
  for (const g of girls) mirrorFx.include(g.root);
  h.scene.traverse((o) => {
    if ((o as THREE.Light).isLight) mirrorFx!.includeOne(o);
  });
  (window.__DEV__ ??= {}).mirrorImage = () => mirrorFx!.image();
  (window.__DEV__ ??= {}).mirrorProbe = () => mirrorFx!.probe();
}

// ── camera ────────────────────────────────────────────────────────────────────
function frameView(): void {
  if (P.get('cam') && P.get('look')) {
    const c = P.get('cam')!.split(',').map(Number) as [number, number, number];
    const l = P.get('look')!.split(',').map(Number) as [number, number, number];
    h.frame(c, l, num('fov', 40));
    return;
  }
  if (brushesMode) {
    h.frame([0.02, 1.42, 0.72], [0, 0.9, -0.02], 34);
    return;
  }
  if (three) {
    h.frame([0.35, 1.5, 2.15], [0, 0.82, 0], 38);
    return;
  }
  const g = girls[0]!;
  const hc = g.character ? g.head.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, g.headY, 0.01).applyMatrix4(g.root.matrixWorld);
  const yaw = g.root.rotation.y;
  const rel = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(hc);
  let pos: THREE.Vector3;
  let look: THREE.Vector3;
  let fov = 40;
  switch (view) {
    case 'front':
      pos = rel(0, 0.05, 1.25);
      look = rel(0, -0.1, 0);
      break;
    case 'side':
      pos = rel(-1.25, 0.05, -0.1);
      look = rel(0, -0.14, -0.05);
      break;
    case 'three4':
      pos = rel(0.78, 0.25, -0.82);
      look = rel(0, -0.14, -0.05);
      break;
    case 'dollhouse': {
      const d = num('dist', 13.5);
      const pitch = (52 * Math.PI) / 180;
      look = new THREE.Vector3(0, 0.9, 0);
      pos = look.clone().add(new THREE.Vector3(0, Math.sin(pitch) * d, Math.cos(pitch) * d));
      fov = 38;
      break;
    }
    default:
      // Brushing close-up: behind, a touch right and above.
      pos = rel(-0.26, 0.3, -1.38);
      look = rel(0, -0.22, -0.06);
  }
  h.frame([pos.x, pos.y, pos.z], [look.x, look.y, look.z], fov);
}
for (const g of girls) g.root.updateMatrixWorld(true);
frameView();

// ── interactive brushing ─────────────────────────────────────────────────────
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let active: Girl | null = null;
let lastU = 0;
let lastV = 0;
let lastT = 0;
let snagCooldown = 0;
const bpos = new THREE.Vector3();
const bq = new THREE.Quaternion();
const hitUV = (e: PointerEvent): { g: Girl; u: number; v: number } | null => {
  const rect = h.renderer.canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, h.camera);
  let best: { g: Girl; u: number; v: number; d: number } | null = null;
  for (const g of girls) {
    const hits = ray.intersectObject(g.hair.proxy, false);
    const hit = hits[0];
    if (hit?.uv && (!best || hit.distance < best.d)) best = { g, u: hit.uv.x, v: hit.uv.y, d: hit.distance };
  }
  return best;
};
const width = () => (brushKind === 'black' ? 0.29 : 0.22);
function brushStep(g: Girl, u: number, v: number, dt: number): void {
  const du = dt > 0 ? (u - lastU) / dt : 0;
  const dv = dt > 0 ? (v - lastV) / dt : 0;
  g.hair.setBrush({ u, v, pressure: 1, width: width(), du, dv });
  if (v > lastV + 1e-4) {
    const rig = g.hair;
    const speed = Math.hypot(du, dv);
    let snagged = false;
    sweepCells(lastU, lastV, u, v, width() / 2, rig.cols, rig.rows, (col, row, cov) => {
      if (snagged) return;
      const i = row * rig.cols + col;
      const t = rig.tangle[i]!;
      if (t <= 0) return;
      const below = row + 1 < rig.rows ? rig.tangle[(row + 1) * rig.cols + col]! : 0;
      if ((below > 0.35 || (speed > 2.2 && t > 0.4)) && snagCooldown <= 0) {
        rig.snag(col, row);
        snagged = true;
        snagCooldown = 0.35;
        return;
      }
      rig.tangle[i] = Math.max(0, t - cov * (v - lastV) * (brushKind === 'black' ? 5.2 : 4));
    });
    rig.commit();
    rig.setShine(1 - fieldMean(rig.tangle) * 0.8);
  }
  lastU = u;
  lastV = v;
}
h.renderer.canvas.addEventListener(
  'pointerdown',
  (e) => {
    const hit = hitUV(e);
    if (!hit) return;
    e.stopImmediatePropagation();
    active = hit.g;
    lastU = hit.u;
    lastV = hit.v;
    lastT = performance.now();
    active.hair.setBrush({ u: hit.u, v: hit.v, pressure: 1, width: width(), du: 0, dv: 0 });
    active.hair.setKnotMarkers(P.get('markers') === 'inspect' ? 'inspect' : 'soft');
  },
  { capture: true },
);
window.addEventListener('pointermove', (e) => {
  if (!active) return;
  const hit = hitUV(e);
  if (!hit || hit.g !== active) return;
  const now = performance.now();
  brushStep(active, hit.u, hit.v, Math.max(1e-3, (now - lastT) / 1000));
  lastT = now;
});
window.addEventListener('pointerup', () => {
  active?.hair.setBrush(null);
  active = null;
});
let bedOn = num('bedhead', 0) > 0.5;
window.addEventListener('keydown', (e) => {
  const g = girls[0];
  if (!g) return;
  if (e.code === 'KeyM') {
    const order = ['off', 'soft', 'inspect'] as const;
    const cur = (g.hair as unknown as { markers: (typeof order)[number] }).markers;
    const next = order[(order.indexOf(cur) + 1) % 3]!;
    for (const x of girls) x.hair.setKnotMarkers(next);
  } else if (e.code === 'KeyB') {
    bedOn = !bedOn;
    for (const x of girls) x.hair.setBedhead(bedOn ? 1 : 0);
  } else if (e.code === 'KeyR') {
    for (const [i, x] of girls.entries()) applyPattern(x.hair, 'heavy', 1, seed + i + Math.floor(performance.now()));
  } else if (e.code === 'KeyF') {
    if (fam) for (const x of girls) x.character?.play('hairFlip');
    else flipT = 0;
  }
  else if (/^Digit[1-4]$/.test(e.code)) {
    brushKind = (['black', 'purple', 'pink', 'teal'] as const)[Number(e.code.slice(5)) - 1]!;
    handBrush.dispose();
    handBrush = createBrush(brushKind);
    handBrush.root.visible = false;
    h.scene.add(handBrush.root);
  }
});

// ── animation ────────────────────────────────────────────────────────────────
let flipT = P.get('flip') === '1' ? 0 : 99;
let walkA = 0;
h.onUpdate((dt, t) => {
  snagCooldown -= dt;
  if (sway && girls[0] && !three) {
    const g = girls[0];
    // Walk a gentle loop, head turning, a hair flip every 4 s.
    walkA += dt * 0.9;
    g.root.position.set(Math.sin(walkA) * 0.5, g.character ? 0 : Math.abs(Math.sin(walkA * 6)) * 0.02, Math.cos(walkA) * 0.3 - 0.2);
    g.root.rotation.y = (view === 'front' ? 0 : Math.PI) + Math.sin(walkA) * 0.5;
    if (g.character) {
      g.character.setMotion(0.9);
      if (t % 4 < dt) g.character.play('hairFlip');
    } else {
      g.head.rotation.y = Math.sin(t * 1.7) * 0.45;
      if (t % 4 < dt) flipT = 0;
    }
  } else if (sway && three) {
    for (const [i, g] of girls.entries()) if (!g.character) g.head.rotation.y = Math.sin(t * 1.3 + i * 2) * 0.35;
  }
  if (fam && P.get('flip') === '1' && t % 2.4 < dt) for (const g of girls) g.character?.play('hairFlip');
  if (!fam && flipT < 0.9) {
    flipT += dt;
    const k = flipT / 0.9;
    const env = Math.sin(Math.min(1, k) * Math.PI);
    for (const g of girls) {
      g.head.rotation.x = -0.5 * env;
      g.head.rotation.z = 0.35 * env * Math.sin(k * Math.PI * 2);
      g.head.rotation.y = (sway ? g.head.rotation.y : 0) + 0.7 * env;
    }
    if (P.get('flip') === '1' && flipT >= 0.9) flipT = -1.2; // loop with a pause
  } else if (flipT < 0) flipT += dt;
  // Static brush contact from the URL.
  if (staticContact && girls[0]) {
    const [u = 0.5, v = 0.5] = staticContact;
    girls[0].hair.setBrush({ u, v, pressure: num('press', 1), width: width(), du: num('du', 0), dv: num('dv', 0.7) });
  }
  for (const g of girls) {
    if (g.character) g.character.update(dt);
    else g.hair.update(dt);
  }
  for (const b of brushes) b.update(dt);
  mirrorFx?.update(dt, h.camera);
  handBrush.update(dt);
  // Brush mesh placement.
  const bg = active ?? (staticContact ? girls[0]! : null);
  if (bg) {
    const u = active ? lastU : staticContact![0]!;
    const v = active ? lastV : staticContact![1]!;
    brushPoseOnHair(bg.hair, u, v, bpos, bq);
    handBrush.root.position.copy(bpos);
    handBrush.root.quaternion.copy(bq);
    handBrush.root.visible = P.get('nobrush') !== '1';
  } else handBrush.root.visible = false;
  const g0 = girls[0];
  if (g0) {
    const geo = g0.hair.geo;
    const hairTris = geo.bodyTriangles + geo.inkTriangles;
    info.textContent = `hair: ${hairTris} tris (${geo.bodyTriangles} body + ${geo.inkTriangles} ink) · ${geo.vertexCount} verts\nsprites ${g0.hair.spriteMesh.visible ? 'on' : 'off'} · mean tangle ${fieldMean(g0.hair.tangle).toFixed(2)}`;
    const d = window.__DEV__;
    if (d) {
      d.hairTris = hairTris;
      d.girls = girls.length;
    }
  }
});

const d = (window.__DEV__ ??= {});
const tmpV = new THREE.Vector3();
/** Scripted drag on girl 0 through real pointer events (raycast → uv → sweep): u, v0 → v1. */
async function stroke(u: number, v0: number, v1: number, steps = 14, release = true, ms = 35): Promise<{ before: number[]; after: number[] }> {
  const g = girls[0]!;
  const canvas = h.renderer.canvas;
  const rect = canvas.getBoundingClientRect();
  const toScreen = (uu: number, vv: number) => {
    g.hair.surfacePoint(uu, vv, tmpV).project(h.camera);
    return { x: rect.left + ((tmpV.x + 1) / 2) * rect.width, y: rect.top + ((1 - tmpV.y) / 2) * rect.height };
  };
  const before = Array.from(g.hair.tangle);
  let p = toScreen(u, v0);
  canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, ms));
    p = toScreen(u, v0 + ((v1 - v0) * i) / steps);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y }));
  }
  if (release) window.dispatchEvent(new PointerEvent('pointerup', {}));
  return { before, after: Array.from(g.hair.tangle) };
}
Object.assign(d, {
  rigs: girls.map((g) => g.hair),
  camera: h.camera,
  stroke,
  pattern: (name: string, s = 1) => girls.forEach((g, i) => applyPattern(g.hair, name, s, seed + i)),
});
h.start();
