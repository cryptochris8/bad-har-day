// Procedural models for the drive events (inked toy style, cached geometry): a cartoon goose (+ wing for
// flapping), a friendly garbage truck with a lifting side arm and blinking hazards, a jogging stroller with a
// baby, a playground ball, and a puddle.
import * as THREE from 'three';
import { PAL, SKIN_TONES } from '../../render/palette';
import { GeoBuilder, shadeHex } from '../../render/models/builder';
import { basicMaterial, modelMaterial, sceneryMaterial } from '../../render/models/materials';
import { cachedGeo } from '../../render/models/common';

/** Goose body facing +Z, feet at y = 0 (≈ 0.95 m tall — cartoon big). */
export function gooseGeometry(): THREE.BufferGeometry {
  return cachedGeo('drive:goose', () => {
    const b = new GeoBuilder(true, true);
    b.ball(0.3, 1, PAL.goose, { at: [0, 0.42, -0.02], scale: [0.78, 0.72, 1.18], smooth: true });
    b.cone(0.13, 0.26, 6, PAL.gooseShade, { at: [0, 0.5, -0.36], rot: [-2.2, 0, 0] });
    b.cyl(0.055, 0.075, 0.42, 6, PAL.goose, { at: [0, 0.72, 0.2], rot: [0.28, 0, 0], smooth: true });
    b.ball(0.11, 1, PAL.goose, { at: [0, 0.94, 0.27], smooth: true, scale: [0.9, 1, 1.1] });
    b.cone(0.05, 0.16, 6, PAL.gooseBeak, { at: [0, 0.92, 0.42], rot: [Math.PI / 2, 0, 0] });
    for (const sx of [-1, 1]) {
      b.ball(0.022, 0, 0x2a1c22, { at: [sx * 0.07, 0.97, 0.33], ink: false });
      b.cyl(0.018, 0.018, 0.22, 4, PAL.gooseBeak, { at: [sx * 0.08, 0.12, 0.02], ink: false });
      b.box(0.1, 0.02, 0.14, PAL.gooseBeak, { at: [sx * 0.08, 0.01, 0.07], ink: false });
      // folded wing shading on the body
      b.ball(0.2, 0, PAL.gooseShade, { at: [sx * 0.2, 0.45, -0.06], scale: [0.25, 0.6, 1.05], ink: false });
    }
    return b.build();
  });
}

/** One wing (pivot at the shoulder, extends along +X; mirror with scale.x = −1). */
export function wingGeometry(): THREE.BufferGeometry {
  return cachedGeo('drive:gooseWing', () => {
    const b = new GeoBuilder(true, true);
    b.ball(0.2, 0, PAL.goose, { at: [0.18, 0, -0.04], scale: [1.2, 0.18, 0.75], smooth: true });
    return b.build();
  });
}

export function ballGeometry(): THREE.BufferGeometry {
  return cachedGeo('drive:ball', () => {
    const b = new GeoBuilder(true, true);
    b.ball(0.3, 1, PAL.playRed, { smooth: true });
    b.torus(0.3, 0.035, 5, 20, 0xfff4e0, { ink: false });
    b.torus(0.3, 0.035, 5, 20, PAL.playYellow, { rot: [Math.PI / 2, 0, 0], ink: false });
    return b.build();
  });
}

/** Jogging stroller facing +Z, handle at z ≈ −0.55 (the jogger pushes it). */
export function strollerGroup(skinIndex: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'stroller';
  const geo = cachedGeo(`drive:stroller|${skinIndex}`, () => {
    const b = new GeoBuilder(true, true);
    b.box(0.5, 0.3, 0.55, PAL.strollerCoral, { at: [0, 0.55, 0] });
    b.box(0.5, 0.5, 0.12, PAL.strollerCoral, { at: [0, 0.78, -0.24], rot: [-0.25, 0, 0] });
    b.sphere(0.32, 10, 6, PAL.strollerCanopy, { at: [0, 0.82, -0.12], scale: [0.85, 0.75, 0.9], smooth: true });
    // baby peeking out (beanie!)
    b.ball(0.11, 1, SKIN_TONES[skinIndex % SKIN_TONES.length]!, { at: [0, 0.8, 0.12], smooth: true });
    b.ball(0.1, 1, PAL.playYellow, { at: [0, 0.87, 0.1], scale: [1.05, 0.7, 1.05], smooth: true });
    for (const sx of [-1, 1]) b.ball(0.015, 0, 0x2a1c22, { at: [sx * 0.04, 0.81, 0.22], ink: false });
    // frame + wheels
    for (const sx of [-1, 1]) {
      b.box(0.03, 0.03, 0.9, 0x5a5d68, { at: [sx * 0.22, 0.4, 0.05], rot: [0.35, 0, 0], ink: false });
      b.torus(0.2, 0.035, 5, 14, PAL.tire, { at: [sx * 0.3, 0.2, -0.2], rot: [0, Math.PI / 2, 0] });
      b.box(0.03, 0.55, 0.03, 0x5a5d68, { at: [sx * 0.22, 0.85, -0.45], rot: [-0.5, 0, 0], ink: false });
    }
    b.torus(0.15, 0.03, 5, 12, PAL.tire, { at: [0, 0.15, 0.5], rot: [0, Math.PI / 2, 0] });
    b.cyl(0.02, 0.02, 0.5, 5, 0x3a3f4a, { at: [0, 1.08, -0.56], rot: [0, 0, Math.PI / 2], ink: false });
    return b.build();
  });
  g.add(new THREE.Mesh(geo, modelMaterial()));
  return g;
}

export interface TruckModel {
  readonly root: THREE.Group;
  /** Side-arm lift 0..1, wheel roll (m), hazard blink time (s). */
  set(arm: number, roll: number, t: number): void;
}

/** Friendly garbage truck facing +Z (length ≈ 7.8 m). The lifting arm is on its right (−X) side. */
export function garbageTruck(): TruckModel {
  const root = new THREE.Group();
  root.name = 'garbageTruck';
  const body = cachedGeo('drive:truckBody', () => {
    const b = new GeoBuilder(true, true);
    b.box(2.2, 0.4, 7.4, 0x3a3f4a, { at: [0, 0.75, 0], ink: false });
    // cab
    b.taper(2.3, 1.9, 2.2, 1.5, 2.0, PAL.garbageCab, { at: [0, 1.95, 2.9], sz: -0.15 });
    b.taper(2.2, 1.5, 2.1, 1.1, 0.8, 0x9fc6e6, { at: [0, 2.35, 3.0], sz: -0.12, ink: false });
    b.box(2.34, 0.3, 0.3, PAL.carTrim, { at: [0, 0.9, 3.85], ink: false });
    for (const sx of [-1, 1]) b.ball(0.13, 0, 0xfff4c8, { at: [sx * 0.8, 1.25, 3.86], scale: [1.2, 1, 0.4], ink: false });
    // container with a rounded top + stripes
    b.box(2.4, 2.4, 5.2, PAL.garbageGreen, { at: [0, 2.2, -0.75], shade: 0.03, seed: 4 });
    b.cyl(1.2, 1.2, 5.2, 12, PAL.garbageGreen, { at: [0, 3.4, -0.75], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.45] });
    for (const sx of [-1, 1]) {
      b.box(0.04, 0.24, 5.0, PAL.garbageStripe, { at: [sx * 1.21, 1.55, -0.75], ink: false });
      b.box(0.04, 0.24, 5.0, 0xffffff, { at: [sx * 1.21, 1.25, -0.75], ink: false });
    }
    // rear hopper
    b.taper(2.4, 1.1, 2.2, 0.8, 2.2, shadeHex(PAL.garbageGreen, 0.85), { at: [0, 2.0, -3.7], sz: 0.1 });
    for (const sx of [-1, 1]) b.box(0.25, 0.12, 0.05, 0xe05a5a, { at: [sx * 0.9, 1.0, -4.27], ink: false });
    return b.build();
  });
  root.add(new THREE.Mesh(body, modelMaterial()));
  // wheels (instanced-free: 6 small meshes sharing one geometry)
  const wgeo = cachedGeo('drive:truckWheel', () => {
    const b = new GeoBuilder(true, true);
    b.cyl(0.52, 0.52, 0.36, 12, PAL.tire, { rot: [0, 0, Math.PI / 2] });
    b.cyl(0.26, 0.26, 0.38, 8, 0xd8dde3, { rot: [0, 0, Math.PI / 2], ink: false });
    return b.build();
  });
  const wheels: THREE.Mesh[] = [];
  for (const z of [2.7, -1.6, -2.8])
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(wgeo, modelMaterial());
      w.position.set(sx * 1.08, 0.52, z);
      root.add(w);
      wheels.push(w);
    }
  // side arm + bin
  const arm = new THREE.Group();
  arm.position.set(-1.25, 1.0, -0.3);
  const agu = cachedGeo('drive:truckArm', () => {
    const b = new GeoBuilder(true, true);
    b.box(0.14, 1.4, 0.14, 0x5a5d68, { at: [-0.05, 0.7, 0] });
    b.box(0.5, 0.12, 0.6, 0x5a5d68, { at: [-0.3, 1.35, 0] });
    b.box(0.7, 0.95, 0.7, PAL.binTrash, { at: [-0.45, 0.85, 0] });
    b.box(0.76, 0.08, 0.76, shadeHex(PAL.binTrash, 0.85), { at: [-0.45, 1.34, 0] });
    return b.build();
  });
  arm.add(new THREE.Mesh(agu, modelMaterial()));
  root.add(arm);
  // hazard lights (unlit, blink)
  const hz = new THREE.Group();
  const hgeo = cachedGeo('drive:truckHazard', () => new THREE.BoxGeometry(0.24, 0.14, 0.24));
  for (const sx of [-0.7, 0.7]) {
    const m = new THREE.Mesh(hgeo, basicMaterial(0xffa53a));
    m.position.set(sx, 3.02, 2.55);
    hz.add(m);
  }
  root.add(hz);
  let rolled = 0;
  return {
    root,
    set(a, roll, t) {
      const k = Math.max(0, Math.min(1, a));
      arm.rotation.z = -k * 2.3;
      arm.position.y = 1.0 + k * 1.4;
      rolled = roll;
      for (const w of wheels) w.rotation.x = rolled / 0.52;
      hz.visible = Math.sin(t * 7) > 0;
    },
  };
}

/** A big rain puddle lying on the road (flat scenery + a lighter sheen). */
export function puddleMesh(): THREE.Mesh {
  const geo = cachedGeo('drive:puddle', () => {
    const b = new GeoBuilder(false, false);
    b.cyl(1, 1, 0.02, 24, PAL.puddleRim, { at: [0, 0.006, 0], scale: [1.75, 1, 3.3] });
    b.cyl(1, 1, 0.02, 24, PAL.puddle, { at: [0.1, 0.014, 0.3], scale: [1.5, 1, 2.9] });
    b.cyl(1, 1, 0.02, 20, PAL.puddle, { at: [-0.5, 0.012, -1.6], scale: [1.1, 1, 1.4] });
    b.cyl(1, 1, 0.02, 16, 0xd6ecff, { at: [0.4, 0.02, 0.9], scale: [0.35, 1, 0.9] });
    return b.build();
  });
  const m = new THREE.Mesh(geo, sceneryMaterial());
  m.name = 'puddle';
  m.receiveShadow = true;
  return m;
}
