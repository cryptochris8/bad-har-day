// ─────────────────────────────────────────────────────────────────────────────
// Cars (contract `CarHandle`): the family's friendly blue minivan (sliding door
// on the right, see-through windows so the girls show inside) and Ashley's
// small rose hatchback. Car local frame: faces +Z, left (driver, US) side = +X,
// right side = −X. Doors: 0 driver, 1 front passenger, 2 sliding / rear right,
// 3 trunk (hatch). Wheels are one InstancedMesh (spin + front steer).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, shadeHex } from '../render/models/builder';
import { basicMaterial, modelMaterial } from '../render/models/materials';
import { Frame } from './kit';
import { proxyBox, proxyMesh } from './shadows';
import type { CarHandle } from './types';

interface CarSpec {
  len: number;
  width: number;
  roof: number;
  belt: number;
  floor: number;
  wheelR: number;
  wheelBase: number;
  track: number;
  color: number;
  /** z range of the front doors [rear edge, front edge]. */
  frontDoor: [number, number];
  /** z range of the rear-right door. */
  rearDoor: [number, number];
  sliding: boolean;
  seeThrough: boolean;
  /** z where the windshield meets the roof / hood. */
  windTop: number;
  windBottom: number;
  rearTop: number;
}

const VAN: CarSpec = {
  len: 4.9,
  width: 1.96,
  roof: 1.78,
  belt: 1.08,
  floor: 0.42,
  wheelR: 0.34,
  wheelBase: 3.0,
  track: 1.66,
  color: PAL.carBody,
  frontDoor: [0.32, 1.22],
  rearDoor: [-0.95, 0.26],
  sliding: true,
  seeThrough: true,
  windTop: 0.62,
  windBottom: 1.34,
  rearTop: -2.3,
};

const SMALL: CarSpec = {
  len: 4.0,
  width: 1.76,
  roof: 1.5,
  belt: 0.98,
  floor: 0.38,
  wheelR: 0.31,
  wheelBase: 2.5,
  track: 1.5,
  color: PAL.carAshley,
  frontDoor: [0.08, 1.02],
  rearDoor: [-0.82, 0.04],
  sliding: false,
  seeThrough: false,
  windTop: 0.3,
  windBottom: 1.05,
  rearTop: -1.72,
};

const INTERIOR = 0x3a3f4a;
const SEAT = 0x6d7690;

function doorPanel(b: GeoBuilder, s: CarSpec, len: number, side: 1 | -1, withGlass: boolean): void {
  const f = new Frame(b, 0, 0, 0, 0);
  const h = s.belt - 0.3;
  // local: door spans x ∈ [−0.06, 0] toward the outside (side), z from 0 (hinge/front edge) back to −len
  f.rbox(0.07, h, len - 0.02, 0.03, s.color, side * 0.035, 0.3 + h / 2, -len / 2, {}, 1);
  f.box(0.02, 0.03, 0.16, shadeHex(s.color, 0.8), side * 0.075, s.belt - 0.14, -len * 0.75, { ink: false });
  if (withGlass) {
    // window frame above the belt (glass itself is a separate transparent mesh for see-through doors)
    const wh = s.roof - s.belt - 0.12;
    f.box(0.05, wh, 0.05, PAL.carTrim, side * 0.03, s.belt + wh / 2, -len + 0.03);
    f.box(0.05, 0.05, len - 0.04, PAL.carTrim, side * 0.03, s.roof - 0.1, -len / 2);
  }
}

export interface CarBuild {
  readonly handle: CarHandle;
  dispose(): void;
}

function buildCar(s: CarSpec, name: string): CarBuild {
  const root = new THREE.Group();
  root.name = name;
  const disposables: { dispose(): void }[] = [];
  const L = s.len;
  const W = s.width;
  const zf = L / 2;
  const zr = -L / 2;
  const B = new GeoBuilder(true, true);
  const f = new Frame(B, 0, 0, 0, 0);
  const col = s.color;
  const dark = shadeHex(col, 0.75);
  // interior tub + floor + seats + dash + steering wheel
  f.rbox(W - 0.22, s.belt - 0.32, L - 0.3, 0.1, INTERIOR, 0, 0.3 + (s.belt - 0.32) / 2, 0, { ink: false });
  f.box(W - 0.3, 0.04, L - 0.5, 0x2c3038, 0, s.floor, -0.1, { ink: false });
  const seat = (x: number, z: number, w: number) => {
    f.rbox(w, 0.14, 0.5, 0.06, SEAT, x, s.floor + 0.37, z, {}, 2);
    f.rbox(w, 0.62, 0.14, 0.06, SEAT, x, s.floor + 0.72, z - 0.26, { rot: [-0.12, 0, 0] }, 2);
    f.rbox(w * 0.6, 0.14, 0.1, 0.04, shadeHex(SEAT, 0.9), x, s.floor + 1.08, z - 0.3, {}, 1);
    f.box(w * 0.6, 0.3, 0.3, INTERIOR, x, s.floor + 0.15, z, { ink: false });
  };
  seat(0.42, 0.55, 0.52);
  seat(-0.42, 0.55, 0.52);
  seat(0, -0.55, W - 0.4);
  if (s.len > 4.5) seat(0, -1.6, W - 0.4);
  f.rbox(W - 0.26, 0.28, 0.4, 0.08, INTERIOR, 0, s.belt - 0.06, s.windBottom - 0.12, {}, 1);
  f.torus(0.17, 0.028, 6, 16, 0x22252c, 0.42, s.floor + 0.72, 1.02, { rot: [-1.1, 0, 0] });
  f.cyl(0.03, 0.03, 0.3, 6, 0x22252c, 0.42, s.floor + 0.62, 1.12, { rot: [-1.1 + Math.PI / 2, 0, 0] });
  // body skins around the door openings
  const skin = (x0: number, x1: number, z0: number, z1: number) => {
    if (z1 - z0 < 0.02) return;
    f.rbox(x1 - x0, s.belt - 0.28, z1 - z0, 0.05, col, (x0 + x1) / 2, 0.28 + (s.belt - 0.28) / 2, (z0 + z1) / 2, {}, 1);
  };
  const sideSkins = (side: 1 | -1, doors: [number, number][]) => {
    const x0 = side > 0 ? W / 2 - 0.1 : -W / 2;
    const x1 = side > 0 ? W / 2 : -W / 2 + 0.1;
    const cuts = doors.slice().sort((a, b) => a[0] - b[0]);
    let z = zr + 0.35;
    for (const [a, bb] of cuts) {
      skin(x0, x1, z, a);
      z = bb;
    }
    skin(x0, x1, z, zf - 0.55);
  };
  sideSkins(1, [s.frontDoor]);
  sideSkins(-1, [s.frontDoor, s.rearDoor]);
  // nose (rounded, with a gently sloping hood) and tail
  const noseL = zf - s.windBottom;
  f.rbox(W, s.belt - 0.26, 0.7, 0.22, col, 0, 0.26 + (s.belt - 0.26) / 2, zf - 0.35, {}, 2);
  f.rbox(W - 0.04, 0.1, noseL + 0.02, 0.05, col, 0, s.belt - 0.06, (zf + s.windBottom) / 2 - 0.02, { rot: [0.07, 0, 0] }, 2);
  f.rbox(W, s.belt - 0.26, 0.46, 0.18, col, 0, 0.26 + (s.belt - 0.26) / 2, zr + 0.23, {}, 2);
  // bumpers, grille, lights (lenses), plate, mirrors
  f.rbox(W + 0.04, 0.2, 0.2, 0.09, PAL.carTrim, 0, 0.36, zf - 0.03, {}, 2);
  f.rbox(W + 0.04, 0.2, 0.2, 0.09, PAL.carTrim, 0, 0.36, zr + 0.03, {}, 2);
  f.rbox(W * 0.46, 0.14, 0.04, 0.05, shadeHex(PAL.carTrim, 1.3), 0, 0.64, zf + 0.0, {}, 1);
  for (const sx of [-1, 1]) {
    f.sphere(0.1, 12, 8, 0xfff6dc, sx * (W / 2 - 0.24), 0.74, zf - 0.04, { scale: [1.35, 0.85, 0.5] });
    f.rbox(0.26, 0.16, 0.05, 0.04, 0xe05a5a, sx * (W / 2 - 0.2), s.belt - 0.1, zr + 0.005, {}, 1);
    f.rbox(0.08, 0.11, 0.17, 0.04, dark, sx * (W / 2 + 0.06), s.belt + 0.08, s.frontDoor[1] - 0.06, {}, 1);
    // side trim line
    f.box(0.012, 0.035, L - 0.9, shadeHex(col, 0.7), sx * (W / 2 + 0.002), s.belt - 0.26, -0.05, { ink: false });
  }
  f.box(0.42, 0.13, 0.02, 0xfff6c8, 0, 0.47, zr - 0.08, { ink: false });
  // roof (overhanging, rounded) + pillars (slanted A and D, upright B/C) + roof rails on the van
  const roofZ0 = s.rearTop;
  const roofZ1 = s.windTop;
  f.rbox(W - 0.02, 0.1, roofZ1 - roofZ0 + 0.1, 0.05, col, 0, s.roof - 0.05, (roofZ0 + roofZ1) / 2, {}, 2);
  const slanted = (x: number, zBottom: number, zTop: number) => {
    const dz = zBottom - zTop;
    const dy = s.roof - s.belt;
    f.box(0.07, Math.hypot(dz, dy), 0.09, dark, x, (s.roof + s.belt) / 2, (zBottom + zTop) / 2, { rot: [-Math.atan2(dz, dy), 0, 0] });
  };
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.06);
    const pillar = (z: number) => f.box(0.07, s.roof - s.belt, 0.08, dark, x, (s.roof + s.belt) / 2, z);
    slanted(x, s.windBottom, s.windTop);
    slanted(x, zr + 0.08, roofZ0);
    pillar(s.frontDoor[0] - 0.02);
    if (s.len > 4.5) {
      pillar(s.rearDoor[0] - 0.04);
      f.box(0.04, 0.04, roofZ1 - roofZ0 - 0.4, PAL.carTrim, sx * (W / 2 - 0.2), s.roof + 0.03, (roofZ0 + roofZ1) / 2);
      for (const z of [roofZ0 + 0.3, roofZ1 - 0.3]) f.box(0.04, 0.05, 0.05, PAL.carTrim, sx * (W / 2 - 0.2), s.roof + 0.01, z, { ink: false });
    }
  }
  if (s.len > 4.5) {
    // stick-figure family decal on the rear window (abstract, never likenesses) + the dog
    const zD = zr + 0.13;
    const tilt = Math.atan2(roofZ0 - (zr + 0.06), s.roof - s.belt);
    const fig = (x: number, h: number) => {
      const y0 = s.belt + 0.08;
      const zz = zD - 0.012 + ((h * 0.6) / (s.roof - s.belt)) * (roofZ0 - zr - 0.06) * 0.5;
      f.box(0.012, h * 0.55, 0.004, 0xffffff, x, y0 + h * 0.3, zz, { rot: [tilt, 0, 0], ink: false });
      f.ball(h * 0.13, 0, 0xffffff, x, y0 + h * 0.66, zz + h * 0.1, { ink: false, scale: [1, 1, 0.3] });
    };
    [0.3, 0.28, 0.21, 0.21, 0.18].forEach((h, i) => fig(-0.5 + i * 0.1, h));
    f.box(0.07, 0.025, 0.004, 0xffffff, -0.0, s.belt + 0.11, zD - 0.005, { rot: [tilt, 0, 0], ink: false });
  }
  const body = new THREE.Mesh(B.build(), modelMaterial());
  body.castShadow = false;
  body.receiveShadow = true;
  body.name = name + ':body';
  root.add(body);
  disposables.push(body.geometry);

  // cabin glass: windshield, rear window, side panes not on doors
  const glassMat = s.seeThrough ? basicMaterial(PAL.glass, { opacity: 0.45, doubleSide: true }) : basicMaterial(shadeHex(PAL.glass, 0.72), { doubleSide: true });
  const gpos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => gpos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const hw = W / 2 - 0.07;
  quad([-hw, s.belt, s.windBottom], [hw, s.belt, s.windBottom], [hw, s.roof - 0.06, s.windTop], [-hw, s.roof - 0.06, s.windTop]);
  quad([-hw, s.belt, zr + 0.06], [hw, s.belt, zr + 0.06], [hw, s.roof - 0.06, roofZ0], [-hw, s.roof - 0.06, roofZ0]);
  const sidePane = (x: number, z0: number, z1: number) => quad([x, s.belt, z0], [x, s.belt, z1], [x, s.roof - 0.08, z1], [x, s.roof - 0.08, z0]);
  // left (+X): everything behind the driver door; right (−X): behind the rear door
  sidePane(W / 2 - 0.03, roofZ0 + 0.08, s.frontDoor[0] - 0.06);
  sidePane(-W / 2 + 0.03, roofZ0 + 0.08, s.rearDoor[0] - 0.08);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
  gg.computeVertexNormals();
  const glass = new THREE.Mesh(gg, glassMat);
  glass.name = name + ':glass';
  glass.renderOrder = 3;
  root.add(glass);
  disposables.push(gg);

  // doors
  const pivots: THREE.Group[] = [];
  const doorGlassGeo = (len: number, side: 1 | -1) => {
    const g = new THREE.BufferGeometry();
    const x = side * 0.03;
    const p: number[] = [];
    const z0 = -len + 0.05;
    const z1 = -0.03;
    const y0 = s.belt;
    const y1 = s.roof - 0.1;
    p.push(x, y0, z0, x, y0, z1, x, y1, z1, x, y0, z0, x, y1, z1, x, y1, z0);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    disposables.push(g);
    return g;
  };
  const makeDoor = (side: 1 | -1, z0: number, z1: number, pivotZ: number): THREE.Group => {
    const len = z1 - z0;
    const pivot = new THREE.Group();
    pivot.position.set(side * (W / 2 - 0.035), 0, pivotZ);
    const db = new GeoBuilder(true, true);
    doorPanel(db, s, len, side, true);
    const m = new THREE.Mesh(db.build(), modelMaterial());
    m.castShadow = false;
    disposables.push(m.geometry);
    pivot.add(m);
    const gm = new THREE.Mesh(doorGlassGeo(len, side), glassMat);
    gm.renderOrder = 3;
    pivot.add(gm);
    root.add(pivot);
    return pivot;
  };
  const driver = makeDoor(1, s.frontDoor[0], s.frontDoor[1], s.frontDoor[1]);
  const passenger = makeDoor(-1, s.frontDoor[0], s.frontDoor[1], s.frontDoor[1]);
  const rear = makeDoor(-1, s.rearDoor[0], s.rearDoor[1], s.rearDoor[1]);
  pivots.push(driver, passenger, rear);
  const rearZ = rear.position.z;
  const rearX = rear.position.x;
  // hatch (trunk): hinged at the roof's rear edge, lifts up
  const hatch = new THREE.Group();
  hatch.position.set(0, s.roof - 0.02, roofZ0);
  const hb = new GeoBuilder(true, true);
  const hf = new Frame(hb, 0, 0, 0, 0);
  const hh = s.roof - 0.3;
  const tilt = Math.atan2(roofZ0 - (zr + 0.06), s.roof - s.belt);
  hf.rbox(W - 0.1, hh, 0.06, 0.03, col, 0, -hh / 2, -0.03, { rot: [-tilt * 0.5, 0, 0] }, 1);
  hf.box(W - 0.4, 0.08, 0.03, PAL.carTrim, 0, -hh + 0.35, -0.08);
  hf.rbox(W - 0.34, hh * 0.45, 0.02, 0.02, shadeHex(PAL.glass, 0.8), 0, -hh * 0.28, -0.065, { rot: [-tilt * 0.5, 0, 0], ink: false });
  const hm = new THREE.Mesh(hb.build(), modelMaterial());
  hm.castShadow = true;
  disposables.push(hm.geometry);
  hatch.add(hm);
  root.add(hatch);
  hatch.visible = false; // hidden while closed (the rear window + tail cover the look); shown when opened

  // wheels (instanced)
  const wb = new GeoBuilder(true, true);
  wb.cyl(s.wheelR, s.wheelR, 0.24, 16, PAL.tire, { rot: [0, 0, Math.PI / 2] });
  wb.cyl(s.wheelR * 0.55, s.wheelR * 0.55, 0.26, 12, 0xd8dde3, { rot: [0, 0, Math.PI / 2], ink: false });
  wb.box(0.27, s.wheelR * 0.18, s.wheelR * 0.9, 0xb9c0c8, { ink: false });
  const wheelGeo = wb.build();
  disposables.push(wheelGeo);
  const wheels = new THREE.InstancedMesh(wheelGeo, modelMaterial(), 4);
  wheels.castShadow = false;
  // shadow proxy: lower body + cabin
  const sb = new GeoBuilder(false, false);
  proxyBox(sb, -W / 2, zr, W / 2, zf, 0.25, s.belt, 0.06);
  proxyBox(sb, -W / 2 + 0.08, roofZ0, W / 2 - 0.08, s.windTop + 0.3, s.belt, s.roof, 0.04);
  const shGeo = sb.build();
  disposables.push(shGeo);
  root.add(proxyMesh(shGeo, name + ':shadow'));
  wheels.name = name + ':wheels';
  root.add(wheels);
  const wheelPos = [
    [W / 2 - 0.12, s.wheelBase / 2],
    [-W / 2 + 0.12, s.wheelBase / 2],
    [W / 2 - 0.12, -s.wheelBase / 2],
    [-W / 2 + 0.12, -s.wheelBase / 2],
  ] as const;
  let spin = 0;
  let steer = 0;
  const m4 = new THREE.Matrix4();
  const tq = new THREE.Quaternion();
  const te = new THREE.Euler();
  const tp = new THREE.Vector3();
  const ts = new THREE.Vector3(1, 1, 1);
  const writeWheels = () => {
    for (let i = 0; i < 4; i++) {
      const [x, z] = wheelPos[i]!;
      tq.setFromEuler(te.set(spin, i < 2 ? steer : 0, 0, 'YXZ'));
      m4.compose(tp.set(x, s.wheelR, z), tq, ts);
      wheels.setMatrixAt(i, m4);
    }
    wheels.instanceMatrix.needsUpdate = true;
  };
  writeWheels();

  // lights (glow parts only visible when on)
  const hlGeo = new THREE.SphereGeometry(0.12, 10, 8);
  hlGeo.scale(1.4, 0.8, 0.4);
  const head = new THREE.Group();
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(hlGeo, basicMaterial(0xfff4c8));
    m.position.set(sx * (W / 2 - 0.22), 0.72, zf + 0.02);
    head.add(m);
  }
  head.visible = false;
  root.add(head);
  const blGeo = new THREE.BoxGeometry(0.3, 0.16, 0.04);
  const brake = new THREE.Group();
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(blGeo, basicMaterial(0xff4a4a));
    m.position.set(sx * (W / 2 - 0.2), s.belt - 0.08, zr - 0.02);
    brake.add(m);
  }
  brake.visible = false;
  root.add(brake);
  disposables.push(hlGeo, blGeo);

  const seats = [
    { x: 0.42, y: s.floor, z: 0.82, seatHeight: 0.4 },
    { x: -0.42, y: s.floor, z: 0.82, seatHeight: 0.4 },
    { x: 0.5, y: s.floor, z: -0.28, seatHeight: 0.4 },
    { x: 0, y: s.floor, z: -0.28, seatHeight: 0.4 },
    { x: -0.5, y: s.floor, z: -0.28, seatHeight: 0.4 },
  ] as const;

  const handle: CarHandle = {
    root,
    seats,
    setDoor(door, open) {
      const k = Math.max(0, Math.min(1, open));
      const e = k * k * (3 - 2 * k);
      if (door === 0) driver.rotation.y = -e * 1.15;
      else if (door === 1) passenger.rotation.y = e * 1.15;
      else if (door === 2) {
        if (s.sliding) {
          const outK = Math.min(1, e / 0.2);
          rear.position.x = rearX - 0.12 * outK;
          rear.position.z = rearZ - Math.max(0, (e - 0.15) / 0.85) * (s.rearDoor[1] - s.rearDoor[0] - 0.05);
        } else rear.rotation.y = e * 1.15;
      } else {
        hatch.visible = e > 0.001;
        hatch.rotation.x = e * 1.35;
      }
    },
    roll(distance, st) {
      if (Number.isFinite(distance)) spin = (spin + distance / s.wheelR) % (Math.PI * 2);
      steer = Math.max(-0.6, Math.min(0.6, Number.isFinite(st) ? st : 0));
      writeWheels();
    },
    setBrakeLights(on) {
      brake.visible = on;
    },
    setHeadlights(on) {
      head.visible = on;
    },
  };
  return {
    handle,
    dispose() {
      for (const d of disposables) d.dispose();
      wheels.dispose();
      root.removeFromParent();
    },
  };
}

export const buildMinivan = (): CarBuild => buildCar(VAN, 'minivan');
export const buildAshleyCar = (): CarBuild => buildCar(SMALL, 'ashleyCar');
