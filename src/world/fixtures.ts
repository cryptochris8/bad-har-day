// ─────────────────────────────────────────────────────────────────────────────
// Interactive fixtures (contract `Fixtures`): coffee maker (brewing light + drip),
// mug shelf slots, sink (+ running water), dishwasher (drop-down door + sliding
// racks), kitchen trash (lid + bag), outdoor bins (lid), fridge (door + light),
// vanity (counter + mirror), dining table, and the kitchen wall clock hands.
// Static bodies merge into one inked mesh; moving parts are small meshes.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, shadeHex } from '../render/models/builder';
import { basicMaterial, modelMaterial } from '../render/models/materials';
import { isShared } from '../render/models/shared';
import { Frame } from './kit';
import { COUNTER_D, COUNTER_H, FURN, IN, OUT, TABLE_H, VANITY_H } from './layout';
import type { Fixtures } from './types';

const empty = (parent: THREE.Object3D, x: number, y: number, z: number, name: string): THREE.Object3D => {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  return o;
};

function meshOf(b: GeoBuilder, parent: THREE.Object3D, name: string, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(b.build(), modelMaterial());
  m.name = name;
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const MIRROR_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MIRROR_FRAG = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform float uDim;
varying vec2 vUv;
void main() {
  vec3 col = mix(uA, uB, vUv.y);
  float s1 = smoothstep(0.05, 0.0, abs(vUv.x * 0.9 + vUv.y * 0.5 - 0.42) - 0.03);
  float s2 = smoothstep(0.03, 0.0, abs(vUv.x * 0.9 + vUv.y * 0.5 - 0.58) - 0.01);
  col += vec3(0.22) * (s1 + s2 * 0.7);
  gl_FragColor = vec4(col * uDim, 1.0);
  #include <colorspace_fragment>
}`;

export interface FixtureSet {
  readonly fixtures: Fixtures;
  readonly group: THREE.Group;
  update(dt: number, t: number): void;
  setClock(minutes: number): void;
  /** 0 night … 1 day: dims the (unlit) mirror sheen at night. */
  setDaylight(k: number): void;
  dispose(): void;
}

export function buildFixtures(): FixtureSet {
  const group = new THREE.Group();
  group.name = 'fixtures';
  const S = new GeoBuilder(true, true); // merged static bodies
  const W = new Frame(S, 0, 0, 0, 0);
  const disposables: { dispose(): void }[] = [];

  // ── coffee maker (retro coral) ──
  const cmX = 5.3;
  const cmZ = IN.NORTH_IN + 0.2;
  const coffeeRoot = empty(group, cmX, COUNTER_H, cmZ, 'coffeeMaker');
  const CM = new Frame(S, cmX, COUNTER_H, cmZ, 0);
  CM.rbox(0.26, 0.03, 0.28, 0.012, PAL.stoveDark, 0, 0.015, 0);
  CM.rbox(0.24, 0.36, 0.13, 0.03, PAL.frontDoor, 0, 0.2, -0.075);
  CM.rbox(0.26, 0.09, 0.25, 0.03, PAL.frontDoor, 0, 0.34, 0.0);
  CM.span(-0.07, 0.07, 0.035, 0.045, 0.02, 0.12, 0x2a2d38, { ink: false });
  CM.cyl(0.025, 0.02, 0.03, 8, PAL.stainless, 0, 0.285, 0.06);
  CM.rbox(0.05, 0.22, 0.1, 0.02, 0xbfe3f0, 0.145, 0.2, -0.08);
  CM.cyl(0.018, 0.018, 0.02, 8, PAL.stainless, -0.07, 0.345, 0.126, { rot: [Math.PI / 2, 0, 0] });
  const mugSpot = empty(coffeeRoot, 0, 0.045, 0.06, 'mugSpot');
  const lightOff = basicMaterial(0x5a2a26);
  const lightOn = basicMaterial(0xffb347);
  const brewLight = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), lightOff);
  disposables.push(brewLight.geometry);
  brewLight.position.set(0.06, 0.345, 0.126);
  coffeeRoot.add(brewLight);
  const drip = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 6), basicMaterial(0x6b3d24));
  disposables.push(drip.geometry);
  drip.position.set(0, 0.2, 0.06);
  drip.scale.set(1, 0.14, 1);
  drip.visible = false;
  coffeeRoot.add(drip);
  let brewing = false;

  // ── mug shelf (wall shelf above the coffee maker) ──
  const shelfY = 1.45;
  const shelfRoot = empty(group, 5.55, shelfY, IN.NORTH_IN, 'mugShelf');
  W.span(5.18, 5.92, shelfY - 0.03, shelfY, IN.NORTH_IN, IN.NORTH_IN + 0.2, PAL.woodWarm);
  for (const x of [5.24, 5.86]) W.span(x - 0.015, x + 0.015, shelfY - 0.14, shelfY - 0.03, IN.NORTH_IN, IN.NORTH_IN + 0.15, PAL.woodWarm, { ink: false });
  W.span(5.18, 5.92, shelfY + 0.28, shelfY + 0.3, IN.NORTH_IN, IN.NORTH_IN + 0.16, PAL.woodWarm);
  W.cyl(0.05, 0.05, 0.14, 10, PAL.cabinetCream, 5.3, shelfY + 0.37, IN.NORTH_IN + 0.08);
  W.cyl(0.04, 0.04, 0.1, 10, PAL.fabricRose, 5.45, shelfY + 0.35, IN.NORTH_IN + 0.08);
  const slots = [0, 1, 2, 3].map((i) => empty(shelfRoot, -0.3 + i * 0.2, 0.001, 0.1, 'mugSlot' + i));

  // ── sink (static basin in furniture) + running water ──
  const sinkX = (FURN.sinkCounter.r.x0 + FURN.sinkCounter.r.x1) / 2;
  const sinkRoot = empty(group, sinkX, COUNTER_H, IN.NORTH_IN + 0.32, 'sink');
  const basin = empty(group, sinkX, COUNTER_H - 0.02, IN.NORTH_IN + 0.32, 'basin');
  const waterMat = basicMaterial(0xbfe6ff, { opacity: 0.72 });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 1, 8, 1, true), waterMat);
  disposables.push(stream.geometry);
  stream.position.set(0, (0.32 + 0.015) / 2 + 0.0, -0.05);
  stream.scale.set(1, 0.3, 1);
  stream.visible = false;
  sinkRoot.add(stream);
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 18), basicMaterial(0xcfeeff, { opacity: 0.6 }));
  disposables.push(pool.geometry);
  pool.scale.set(1.5, 1, 1);
  pool.position.set(0, 0.012, 0);
  pool.visible = false;
  sinkRoot.add(pool);
  let waterOn = false;
  let waterLevel = 0;

  // ── dishwasher (hollow tub + drop-down door + sliding racks) ──
  const dw = FURN.dishwasher.r;
  const dwX = (dw.x0 + dw.x1) / 2;
  const dwW = dw.x1 - dw.x0 - 0.02;
  const front = IN.NORTH_IN + COUNTER_D - 0.03;
  const dwRoot = empty(group, dwX, 0, front, 'dishwasher');
  const DW = new Frame(S, dwX, 0, front, 0);
  const tub = 0x8e98a4;
  DW.span(-dwW / 2, dwW / 2, 0.1, 0.12, -COUNTER_D + 0.05, 0, tub, { ink: false });
  DW.span(-dwW / 2, dwW / 2, 0.82, 0.84, -COUNTER_D + 0.05, 0, tub, { ink: false });
  DW.span(-dwW / 2, -dwW / 2 + 0.02, 0.1, 0.84, -COUNTER_D + 0.05, 0, tub, { ink: false });
  DW.span(dwW / 2 - 0.02, dwW / 2, 0.1, 0.84, -COUNTER_D + 0.05, 0, tub, { ink: false });
  DW.span(-dwW / 2, dwW / 2, 0.1, 0.84, -COUNTER_D + 0.05, -COUNTER_D + 0.07, shadeHex(tub, 0.8), { ink: false });
  DW.span(-dwW / 2, dwW / 2, 0, 0.1, -0.06, 0, PAL.stoveDark, { ink: false });
  const doorPivot = empty(dwRoot, 0, 0.1, 0.012, 'dwDoor');
  const DB = new GeoBuilder(true, true);
  const DF = new Frame(DB, 0, 0, 0, 0);
  DF.rbox(dwW, 0.74, 0.04, 0.012, PAL.stainless, 0, 0.37, 0);
  DF.span(-dwW / 2 + 0.01, dwW / 2 - 0.01, 0.62, 0.72, 0.02, 0.024, PAL.stoveDark, { ink: false });
  DF.cyl(0.012, 0.012, dwW - 0.14, 6, shadeHex(PAL.stainless, 0.85), 0, 0.6, 0.045, { rot: [0, 0, Math.PI / 2] });
  DF.span(-dwW / 2 + 0.03, dwW / 2 - 0.03, 0.04, 0.7, -0.024, -0.02, tub, { ink: false });
  DF.ball(0.008, 0, 0x7fe0a0, dwW / 2 - 0.06, 0.67, 0.026, { ink: false });
  meshOf(DB, doorPivot, 'dwDoorMesh');
  const rack = (name: string, y: number, withBasket: boolean): THREE.Object3D => {
    const g = empty(dwRoot, 0, y, -COUNTER_D / 2 + 0.03, name);
    const RB = new GeoBuilder(false, true);
    const RF = new Frame(RB, 0, 0, 0, 0);
    const w = dwW - 0.06;
    const d = COUNTER_D - 0.12;
    const wire = 0xd8dde3;
    RF.span(-w / 2, w / 2, 0, 0.012, -d / 2, d / 2, wire);
    for (const s of [-1, 1]) {
      RF.span(-w / 2, w / 2, 0.012, 0.1, s * (d / 2) - 0.006, s * (d / 2) + 0.006, wire);
      RF.span(s * (w / 2) - 0.006, s * (w / 2) + 0.006, 0.012, 0.1, -d / 2, d / 2, wire);
    }
    for (let i = 1; i < 6; i++) RF.span(-w / 2 + (i * w) / 6 - 0.004, -w / 2 + (i * w) / 6 + 0.004, 0.012, 0.07, -d / 2, d / 2, wire);
    if (withBasket) {
      RF.span(w / 2 - 0.16, w / 2 - 0.02, 0.012, 0.16, d / 2 - 0.16, d / 2 - 0.02, 0xc8ced4);
    }
    const m = new THREE.Mesh(RB.build(), modelMaterial());
    g.add(m);
    return g;
  };
  const bottomRack = rack('bottomRack', 0.14, true);
  const topRack = rack('topRack', 0.47, false);
  const basket = empty(bottomRack, dwW / 2 - 0.12, 0.02, (COUNTER_D - 0.12) / 2 - 0.09, 'basket');
  const rackZ0 = bottomRack.position.z;

  // ── kitchen trash (pedal bin) ──
  const kt = FURN.kitchenTrash;
  const ktX = (kt.r.x0 + kt.r.x1) / 2;
  const ktZ = (kt.r.z0 + kt.r.z1) / 2;
  const trashRoot = empty(group, ktX, 0, ktZ, 'kitchenTrash');
  const KT = new Frame(S, ktX, 0, ktZ, 0);
  KT.cyl(0.19, 0.17, 0.56, 16, PAL.stainless, 0, 0.29, 0);
  KT.cyl(0.175, 0.175, 0.03, 16, PAL.stoveDark, 0, 0.015, 0);
  KT.rbox(0.12, 0.02, 0.06, 0.01, PAL.stoveDark, 0, 0.02, 0.19);
  const lidPivot = empty(trashRoot, 0, 0.575, -0.185, 'lid');
  const LB = new GeoBuilder(true, true);
  new Frame(LB, 0, 0, 0, 0).cyl(0.195, 0.195, 0.04, 16, shadeHex(PAL.stainless, 1.05), 0, 0.02, 0.185, { scale: [1, 1, 1] });
  meshOf(LB, lidPivot, 'lidMesh');
  const BG = new GeoBuilder(true, true);
  const BGF = new Frame(BG, 0, 0, 0, 0);
  BGF.torus(0.185, 0.02, 5, 16, 0x3f4450, 0, 0.56, 0, { rot: [Math.PI / 2, 0, 0], smooth: true });
  BGF.sphere(0.17, 12, 8, 0x3f4450, 0, 0.5, 0, { scale: [1, 0.5, 1] });
  const bag = meshOf(BG, trashRoot, 'bag', false);

  // ── outdoor bins (side path, against the house; fronts face +X) ──
  const bt = OUT.binTrash.r;
  const btX = (bt.x0 + bt.x1) / 2;
  const btZ = (bt.z0 + bt.z1) / 2;
  const binRoot = empty(group, btX, 0, btZ, 'outdoorBin');
  binRoot.rotation.y = Math.PI / 2;
  const bin = (f: Frame, col: number) => {
    f.taper(0.56, 0.6, 0.62, 0.66, 0.98, col, 0, 0.52, 0);
    f.span(-0.33, 0.33, 0.92, 0.98, -0.36, 0.36, shadeHex(col, 0.85));
    for (const s of [-1, 1]) f.cyl(0.08, 0.08, 0.06, 12, PAL.tire, s * 0.22, 0.08, -0.28, { rot: [0, 0, Math.PI / 2] });
    f.cyl(0.018, 0.018, 0.5, 6, shadeHex(col, 0.7), 0, 0.96, -0.36, { rot: [0, 0, Math.PI / 2] });
  };
  const BF = new Frame(S, btX, 0, btZ, Math.PI / 2);
  bin(BF, PAL.binTrash);
  const br = OUT.binRecycle.r;
  const RFr = new Frame(S, (br.x0 + br.x1) / 2, 0, (br.z0 + br.z1) / 2, Math.PI / 2);
  bin(RFr, PAL.binRecycle);
  RFr.span(-0.34, 0.34, 0.98, 1.03, -0.36, 0.36, shadeHex(PAL.binRecycle, 0.9));
  RFr.ball(0.06, 0, 0xffffff, 0, 0.6, 0.335, { scale: [1, 1, 0.2], ink: false });
  const binLidPivot = empty(binRoot, 0, 0.98, -0.34, 'binLid');
  const BL = new GeoBuilder(true, true);
  new Frame(BL, 0, 0, 0, 0).span(-0.34, 0.34, 0, 0.05, 0, 0.72, shadeHex(PAL.binTrash, 0.9));
  meshOf(BL, binLidPivot, 'binLidMesh');
  const mouth = empty(binRoot, 0, 1.0, 0, 'mouth');

  // ── fridge (hollow shell + door + interior light + goodies) ──
  const fr = FURN.fridge.r;
  const frW = fr.x1 - fr.x0;
  const frD = fr.z1 - fr.z0;
  const frH = 1.84;
  const fridgeRoot = empty(group, fr.x0, 0, fr.z1, 'fridge');
  const FF = new Frame(S, fr.x0 + frW / 2, 0, fr.z0, 0);
  const shell = PAL.appliance;
  FF.span(-frW / 2, frW / 2, 0, 0.06, 0, frD - 0.04, shell);
  FF.span(-frW / 2, frW / 2, frH - 0.05, frH, 0, frD - 0.04, shell);
  FF.span(-frW / 2, -frW / 2 + 0.04, 0, frH, 0, frD - 0.04, shell);
  FF.span(frW / 2 - 0.04, frW / 2, 0, frH, 0, frD - 0.04, shell);
  FF.span(-frW / 2, frW / 2, 0, frH, 0, 0.04, shell);
  const inside = 0xf2f6fa;
  FF.span(-frW / 2 + 0.04, frW / 2 - 0.04, 0.06, frH - 0.05, 0.04, 0.05, inside, { ink: false });
  for (const y of [0.5, 0.9, 1.3]) FF.span(-frW / 2 + 0.04, frW / 2 - 0.04, y, y + 0.015, 0.05, frD - 0.06, 0xdfe9f0, { ink: false });
  FF.rbox(0.12, 0.24, 0.12, 0.03, 0xffffff, -0.25, 1.05, 0.3);
  FF.rbox(0.1, 0.22, 0.1, 0.03, 0xffa94d, -0.08, 1.04, 0.28);
  FF.rbox(0.2, 0.08, 0.12, 0.02, PAL.flowerYellow, 0.2, 0.96, 0.35);
  FF.sphere(0.06, 10, 8, PAL.confettiA, 0.15, 0.58, 0.3);
  FF.sphere(0.05, 10, 8, 0x9ccf5a, 0.28, 0.57, 0.35);
  FF.rbox(0.3, 0.12, 0.2, 0.03, PAL.ellieMain, -0.18, 0.58, 0.35);
  FF.rbox(0.22, 0.14, 0.16, 0.03, PAL.heidiMain, 0.0, 1.38, 0.3);
  const frLight = new THREE.Mesh(new THREE.BoxGeometry(frW - 0.14, 0.02, 0.1), basicMaterial(PAL.lampBulb));
  disposables.push(frLight.geometry);
  frLight.position.set(fr.x0 + frW / 2, frH - 0.07, fr.z0 + 0.2);
  frLight.visible = false;
  group.add(frLight);
  const frPivot = empty(fridgeRoot, 0, 0, 0, 'fridgeDoor');
  const FD = new GeoBuilder(true, true);
  const FDF = new Frame(FD, 0, 0, 0, 0);
  FDF.rbox(frW, frH - 0.02, 0.07, 0.03, PAL.appliance, frW / 2, frH / 2, 0.035);
  FDF.span(0.04, frW - 0.04, 0.42, 0.44, 0.07, 0.074, shadeHex(PAL.appliance, 0.9), { ink: false });
  FDF.cyl(0.015, 0.015, 0.6, 6, PAL.stainless, frW - 0.08, 1.2, 0.1);
  FDF.cyl(0.015, 0.015, 0.25, 6, PAL.stainless, frW - 0.08, 0.28, 0.1);
  for (const y of [0.9, 1.5]) FDF.cyl(0.012, 0.012, 0.04, 6, PAL.stainless, frW - 0.08, y, 0.08, { rot: [Math.PI / 2, 0, 0] });
  // kids' drawings + magnets
  FDF.span(0.12, 0.42, 1.1, 1.46, 0.07, 0.074, 0xffffff, { rot: [0, 0, 0.05], ink: false });
  for (let i = 0; i < 4; i++)
    FDF.torus(0.1 - i * 0.02, 0.008, 3, 12, [PAL.confettiA, PAL.confettiB, PAL.confettiC, PAL.confettiE][i]!, 0.27, 1.22, 0.076, { ink: false }, Math.PI);
  FDF.span(0.36, 0.62, 0.62, 0.92, 0.07, 0.074, 0xfff3b0, { rot: [0, 0, -0.06], ink: false });
  FDF.ball(0.05, 1, PAL.flowerYellow, 0.48, 0.8, 0.078, { scale: [1, 1, 0.1], ink: false });
  for (const [x, y, c] of [
    [0.27, 1.45, PAL.heart],
    [0.49, 0.9, PAL.ellieMain],
    [0.6, 1.62, PAL.addyMain],
  ] as const)
    FDF.sphere(0.022, 8, 6, c, x, y, 0.082);
  meshOf(FD, frPivot, 'fridgeDoorMesh');

  // ── vanity + mirror ──
  const v = FURN.vanity.r;
  const vX = (v.x0 + v.x1) / 2;
  const vanityRoot = empty(group, vX, VANITY_H, (v.z0 + v.z1) / 2, 'vanity');
  const counter = empty(group, vX, VANITY_H + 0.001, v.z1 - 0.2, 'vanityCounter');
  const mirrorUniforms = { uA: { value: new THREE.Color(0xa9c4d6) }, uB: { value: new THREE.Color(PAL.mirror) }, uDim: { value: 1 } };
  const mirrorMat = new THREE.ShaderMaterial({ name: 'bhd-mirror', vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG, uniforms: mirrorUniforms });
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.92), mirrorMat);
  mirror.name = 'mirror';
  mirror.position.set(vX, 1.5, IN.NORTH_IN + 0.04);
  group.add(mirror);
  disposables.push(mirror.geometry, mirrorMat);

  // ── dining table ──
  const t = FURN.table.r;
  const tableRoot = empty(group, (t.x0 + t.x1) / 2, 0, (t.z0 + t.z1) / 2, 'table');
  const tableTop = empty(tableRoot, 0, TABLE_H, 0, 'tableTop');

  // ── kitchen clock hands ──
  const clockPivot = empty(group, 6.45, 2.34, IN.NORTH_IN + 0.066, 'clockHands');
  const handMat = modelMaterial();
  const hourGeo = new THREE.BoxGeometry(0.014, 0.07, 0.006);
  hourGeo.translate(0, 0.03, 0);
  const minGeo = new THREE.BoxGeometry(0.009, 0.1, 0.006);
  minGeo.translate(0, 0.045, 0.004);
  disposables.push(hourGeo, minGeo);
  const hourHand = new THREE.Mesh(hourGeo, handMat);
  const minHand = new THREE.Mesh(minGeo, handMat);
  clockPivot.add(hourHand, minHand);
  // aInk/aGlow-less geometry: give them zero attributes so the model material compiles cleanly
  for (const g of [hourGeo, minGeo]) {
    const n = g.getAttribute('position').count;
    g.setAttribute('aInk', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3).fill(0.02);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }

  const staticMesh = meshOf(S, group, 'fixturesStatic', false);
  disposables.push(staticMesh.geometry);

  // animated state
  let dwDoor = 0;
  let dwRacks = 0;
  let trashLid = 0;
  let binLid = 0;
  let fridgeOpen = 0;
  let time = 0;

  const fixtures: Fixtures = {
    coffeeMaker: {
      root: coffeeRoot,
      mugSpot,
      setBrewing(on: boolean) {
        brewing = on;
        drip.visible = on;
        brewLight.material = on ? lightOn : lightOff;
      },
    },
    mugShelf: { root: shelfRoot, slots },
    sink: {
      root: sinkRoot,
      basin,
      setWater(on: boolean) {
        waterOn = on;
        stream.visible = on;
      },
    },
    dishwasher: {
      root: dwRoot,
      bottomRack,
      topRack,
      basket,
      setDoor(open: number) {
        dwDoor = Math.max(0, Math.min(1, open));
        doorPivot.rotation.x = dwDoor * (Math.PI / 2) * 0.97;
      },
      setRacks(out: number) {
        dwRacks = Math.max(0, Math.min(1, out));
        bottomRack.position.z = rackZ0 + dwRacks * 0.42;
        topRack.position.z = rackZ0 + dwRacks * 0.36;
      },
    },
    lunchCounter: {
      root: empty(group, (FURN.lunchCounter.r.x0 + FURN.lunchCounter.r.x1) / 2, COUNTER_H, IN.NORTH_IN + COUNTER_D / 2, 'lunchCounter'),
      surface: empty(group, (FURN.lunchCounter.r.x0 + FURN.lunchCounter.r.x1) / 2, COUNTER_H + 0.001, IN.NORTH_IN + COUNTER_D / 2 + 0.08, 'lunchSurface'),
    },
    kitchenTrash: {
      root: trashRoot,
      setLid(open: number) {
        trashLid = Math.max(0, Math.min(1, open));
        lidPivot.rotation.x = -trashLid * 1.75;
      },
      setBag(visible: boolean) {
        bag.visible = visible;
      },
    },
    outdoorBin: {
      root: binRoot,
      mouth,
      setLid(open: number) {
        binLid = Math.max(0, Math.min(1, open));
        binLidPivot.rotation.x = -binLid * 1.9;
      },
    },
    fridge: {
      root: fridgeRoot,
      setDoor(open: number) {
        fridgeOpen = Math.max(0, Math.min(1, open));
        frPivot.rotation.y = -fridgeOpen * 1.95;
        frLight.visible = fridgeOpen > 0.04;
      },
    },
    vanity: { root: vanityRoot, counter, mirror },
    table: { root: tableRoot, top: tableTop },
  };

  return {
    fixtures,
    group,
    update(dt: number, tt: number) {
      time = tt;
      if (brewing) {
        drip.scale.x = drip.scale.z = 0.8 + 0.4 * Math.abs(Math.sin(time * 23));
        brewLight.material = Math.sin(time * 6) > -0.2 ? lightOn : lightOff;
      }
      if (waterOn) {
        stream.scale.x = stream.scale.z = 0.85 + 0.3 * Math.sin(time * 31);
        waterLevel = Math.min(1, waterLevel + dt * 0.25);
      } else waterLevel = Math.max(0, waterLevel - dt * 0.15);
      pool.visible = waterLevel > 0.02;
      pool.position.y = 0.0 + waterLevel * 0.02;
      pool.scale.set(0.8 + waterLevel * 0.7, 1, 0.8 + waterLevel * 0.6);
    },
    setClock(minutes: number) {
      const h = (((minutes / 60) % 12) + 12) % 12;
      const m = ((minutes % 60) + 60) % 60;
      hourHand.rotation.z = -(h / 12) * Math.PI * 2;
      minHand.rotation.z = -(m / 60) * Math.PI * 2;
    },
    setDaylight(k: number) {
      mirrorUniforms.uDim.value = 0.45 + 0.55 * k;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.geometry && !isShared(m.geometry)) m.geometry.dispose();
      });
      group.removeFromParent();
    },
  };
}
