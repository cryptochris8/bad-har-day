// ─────────────────────────────────────────────────────────────────────────────
// The family home (world module) — implements src/world/types.ts.
//   createWorld(opts) → World: dollhouse cut-away house, yard, driveway, cars,
//   street, neighbours, sky + time-of-day lighting, fixtures, beds, doors,
//   curtains, markers, collision + navigation.
// Layout data lives in layout.ts (pure); lighting keyframes in lighting.ts (pure).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GeoBuilder } from '../render/models/builder';
import { instanceMaterial, modelMaterial, sceneryMaterial } from '../render/models/materials';
import type { Vec3Like } from '../render/types';
import { buildBeds } from './beds';
import { buildAshleyCar, buildMinivan } from './cars';
import { CUT_S, MAX_SEGS, buildWithSeg, createCutUniforms, cutDepthMaterial, cutMesh, cutToonMaterial } from './cutMaterial';
import { computeCutTargets, type CutView } from './cutaway';
import { buildExterior } from './exterior';
import { buildFixtures } from './fixtures';
import { buildFloors } from './floors';
import { buildKitchen } from './furnKitchen';
import { buildBath, buildEntry, buildHall, buildHeidi, buildLiving, buildMaster, buildTwins } from './furnRooms';
import { buildGlass, buildWalls, glassMaterial } from './house';
import type { Glows } from './kit';
import { buildLampSystem } from './lamps';
import { ANCHORS, CAR_PARK, HIDE_SPOTS, WALLS, WALL_COUNT, roomAt, roomDef } from './layout';
import { createLightingState, lightingAt, type Weather } from './lighting';
import { MarkerSystem } from './markers';
import { buildCurtains, buildDoors } from './openings';
import { buildPhysics, navPathOn } from './physics';
import { Rain } from './rain';
import { Sky } from './sky';
import { splitGeometry } from './split';
import { furnitureProxies, outdoorProxies, proxyMesh } from './shadows';
import type { CarHandle, HideSpot, HideSpotId, RoomId, World } from './types';

export { BED_MATTRESS_H, CHAIR_SEAT_H, COUCH_SEAT_H, COUNTER_H, TABLE_H, VANITY_H } from './layout';

/** Extra introspection for dev pages / tests (not part of the contract). */
export interface WorldDebug {
  readonly quality: 'high' | 'low';
  /** Current wall levels (1 full … 0 cut) by segment id. */
  readonly wallLevels: Float32Array;
  /** Force every wall to full height (true) or back to automatic (false). */
  setCutEnabled(on: boolean): void;
  /** Instantly settle animated state (cut-away levels, doors, curtains) — for screenshots. */
  settle(): void;
  readonly clock: number;
}

export function createWorld(opts: { quality: 'high' | 'low' }): World {
  const quality: 'high' | 'low' = opts.quality === 'low' ? 'low' : 'high';
  const root = new THREE.Group();
  root.name = 'world';

  // ── cut-away state ──
  const cutU = createCutUniforms();
  const levels = new Float32Array(MAX_SEGS).fill(1);
  const targets = new Float32Array(WALL_COUNT + 1).fill(1);
  let cutEnabled = true;
  const view: CutView = { mode: 'dollhouse', fx: ANCHORS.chrisStart.x, fz: ANCHORS.chrisStart.z, camX: 0, camY: 10, camZ: 10 };
  const writeCut = () => {
    for (let i = 1; i <= WALL_COUNT; i++) {
      const l = levels[i]!;
      const e = l * l * (3 - 2 * l);
      cutU.uCut.value[i] = CUT_S + (1 - CUT_S) * e;
    }
  };

  const physics = buildPhysics();
  // one tintable material for the house interior (warm "lights on!" cast at dawn)
  const interior = instanceMaterial();
  const interiorTint = interior.uniforms.uTint;
  const wallMat = cutToonMaterial(cutU, 'walls', interiorTint);
  const depthMat = cutDepthMaterial(cutU);
  const disposables: { dispose(): void }[] = [wallMat, depthMat, interior.material];

  // ── builders ──
  const wallB = new GeoBuilder(true, true);
  const glows: Glows = { night: new GeoBuilder(true, true), house: new GeoBuilder(true, true), outdoor: new GeoBuilder(true, true) };
  const wallShadowB = new GeoBuilder(false, false);
  const proxyB = new GeoBuilder(false, false);
  buildWalls(wallB, wallShadowB);
  furnitureProxies(proxyB);
  outdoorProxies(proxyB);
  const rooms: [RoomId, (b: GeoBuilder, wb: GeoBuilder, g: Glows) => void][] = [
    ['kitchen', buildKitchen],
    ['living', buildLiving],
    ['entry', buildEntry],
    ['hall', buildHall],
    ['master', buildMaster],
    ['heidi', buildHeidi],
    ['twins', buildTwins],
    ['bath', buildBath],
  ];
  const houseGroup = new THREE.Group();
  houseGroup.name = 'house';
  root.add(houseGroup);
  for (const [id, build] of rooms) {
    const b = new GeoBuilder(true, true);
    build(b, wallB, glows);
    const g = b.build();
    disposables.push(g);
    const m = new THREE.Mesh(g, modelMaterial());
    m.name = 'furniture:' + id;
    m.castShadow = false;
    m.receiveShadow = true;
    houseGroup.add(m);
  }
  const exterior = buildExterior(quality, wallB, glows, proxyB);
  root.add(exterior.group);

  const wallGeoAll = buildWithSeg(wallB);
  splitGeometry(wallGeoAll, 4, (x, _y, z) => (x < 0 ? 0 : 1) + (z < -1.4 ? 0 : 2)).forEach((g, i) => {
    disposables.push(g);
    const walls = cutMesh(g, wallMat, depthMat, { cast: false });
    walls.name = 'walls' + i;
    houseGroup.add(walls);
  });
  wallGeoAll.dispose();
  const wallShadowGeo = buildWithSeg(wallShadowB);
  const proxyGeo = proxyB.build();
  disposables.push(wallShadowGeo, proxyGeo);
  houseGroup.add(proxyMesh(wallShadowGeo, 'wallShadows', depthMat), proxyMesh(proxyGeo, 'shadowProxies'));

  const glass = glassMaterial(cutU);
  const glassGeo = buildGlass();
  disposables.push(glassGeo, glass.material);
  const glassMesh = new THREE.Mesh(glassGeo, glass.material);
  glassMesh.name = 'windowGlass';
  houseGroup.add(glassMesh);

  const floorGeo = buildFloors();
  disposables.push(floorGeo);
  const floors = new THREE.Mesh(floorGeo, sceneryMaterial());
  floors.name = 'floors';
  floors.receiveShadow = true;
  houseGroup.add(floors);

  const fixtures = buildFixtures();
  houseGroup.add(fixtures.group);
  const beds = buildBeds();
  houseGroup.add(beds.group);
  const doors = buildDoors(wallMat, depthMat, physics.doors);
  houseGroup.add(doors.group);
  const curtains = buildCurtains(wallMat, depthMat);
  houseGroup.add(curtains.group);

  // interior meshes share the tintable material (furniture, floors, fixtures, beds)
  const shared = [modelMaterial(), sceneryMaterial()];
  houseGroup.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && shared.includes(m.material as THREE.MeshToonMaterial)) m.material = interior.material;
  });
  const lamps = buildLampSystem(glows, cutU, quality);
  root.add(lamps.group);
  const sky = new Sky(quality);
  root.add(sky.group);
  const markers = new MarkerSystem();
  root.add(markers.group);
  const rain = new Rain(quality);
  root.add(rain.lines);

  // ── cars ──
  const minivan = buildMinivan();
  const ashleyCar = buildAshleyCar();
  const park = (c: CarHandle, p: { x: number; z: number; yaw: number }) => {
    c.root.position.set(p.x, 0, p.z);
    c.root.rotation.y = p.yaw;
    root.add(c.root);
  };
  park(minivan.handle, CAR_PARK.minivan);
  park(ashleyCar.handle, CAR_PARK.ashley);
  const carColliders: { car: CarHandle; rc: (typeof physics.cars)['minivan']; w: number; l: number }[] = [
    { car: minivan.handle, rc: physics.cars.minivan, w: CAR_PARK.minivan.w, l: CAR_PARK.minivan.l },
    { car: ashleyCar.handle, rc: physics.cars.ashley, w: CAR_PARK.ashley.w, l: CAR_PARK.ashley.l },
  ];

  // ── time of day ──
  const state = createLightingState();
  let clock = 315;
  let weather: Weather = 'clear';
  const applyLighting = () => {
    lightingAt(clock, weather, state);
    sky.apply(state);
    lamps.apply(state);
    const gu = glass.uniforms;
    gu.uTop.value.setHex(state.skyTop);
    gu.uHorizon.value.setHex(state.skyHorizon);
    gu.uGlowCol.value.setHex(state.glowColor);
    gu.uGlow.value = state.glow;
    gu.uStars.value = state.stars;
    gu.uTree.value.setHex(0x1d2a3a).lerp(tmpColor.setHex(0x5c9a64), state.daylight);
    gu.uWarmK.value = state.windowGlow;
    curtains.setSun(state.sunbeam);
    exterior.setWindows(state.neighbourWindows);
    fixtures.setClock(clock);
    fixtures.setDaylight(state.daylight);
    rain.setAmount(state.rain);
    const k = state.interiorWarm;
    interiorTint.value.setRGB(1 + 0.2 * k, 1 + 0.05 * k, 1 - 0.14 * k);
  };
  const tmpColor = new THREE.Color();
  applyLighting();

  // ── hide spots ──
  const hideSpots: HideSpot[] = HIDE_SPOTS.map((h) => ({ id: h.id, stand: h.stand, item: { x: h.item.x, y: h.item.y, z: h.item.z }, label: h.label }));
  const hideById = new Map<HideSpotId, HideSpot>(hideSpots.map((h) => [h.id, h]));

  let time = 0;
  const settle = () => {
    computeTargets();
    for (let i = 1; i <= WALL_COUNT; i++) levels[i] = targets[i]!;
    writeCut();
  };
  const computeTargets = () => {
    if (!cutEnabled) {
      targets.fill(1);
      return;
    }
    computeCutTargets(WALLS, view, targets);
  };

  const debug: WorldDebug = {
    quality,
    wallLevels: levels,
    setCutEnabled(on: boolean) {
      cutEnabled = on;
    },
    settle() {
      settle();
      doors.update(10);
      curtains.update(10);
    },
    get clock() {
      return clock;
    },
  };

  const world: World & { debug: WorldDebug } = {
    root,
    debug,
    anchor: (id) => ANCHORS[id],
    hideSpots,
    hideSpot: (id) => hideById.get(id)!,
    roomAt: (x, z) => roomAt(x, z),
    roomName: (id) => roomDef(id).name,
    fixtures: fixtures.fixtures,
    door: (id) => doors.door(id),
    bed: (id) => beds.bed(id),
    curtains: (room) => curtains.curtains(room),
    car: (id) => (id === 'minivan' ? minivan.handle : ashleyCar.handle),
    move(x, z, r, dx, dz, out) {
      physics.col.move(x, z, r, dx, dz, out);
    },
    free: (x, z, r) => physics.col.free(x, z, r),
    navPath(from: Vec3Like, to: Vec3Like): Vec3Like[] {
      return navPathOn(physics.nav, from.x, from.z, to.x, to.z);
    },
    setClock(minutes: number) {
      if (!Number.isFinite(minutes)) return;
      if (Math.abs(minutes - clock) < 1e-4) return;
      clock = minutes;
      applyLighting();
    },
    setWeather(w) {
      weather = w === 'cloudy' || w === 'drizzle' ? w : 'clear';
      applyLighting();
    },
    floorAt: () => 0,
    setFocus(x, z, mode) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      view.fx = x;
      view.fz = z;
      view.mode = mode === 'closeup' ? 'closeup' : 'dollhouse';
    },
    marker: (at, color) => markers.add(at, color),
    update(dt: number, camera: THREE.Camera) {
      const d = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
      time += d;
      camera.getWorldPosition(camPos);
      view.camX = camPos.x;
      view.camY = camPos.y;
      view.camZ = camPos.z;
      computeTargets();
      const k = 1 - Math.exp(-7 * d);
      for (let i = 1; i <= WALL_COUNT; i++) levels[i] = levels[i]! + (targets[i]! - levels[i]!) * k;
      writeCut();
      sky.update(camera, d);
      glass.uniforms.uTime.value = time;
      lamps.update(d, view.fx, view.fz);
      fixtures.update(d, time);
      beds.update(d);
      doors.update(d);
      curtains.update(d);
      markers.update(d);
      rain.update(d, view.fx, view.fz);
      for (let ci = 0; ci < carColliders.length; ci++) {
        const cc = carColliders[ci]!;
        const rc = cc.rc;
        const w = cc.w;
        const l = cc.l;
        const car = cc.car;
        const p = car.root.position;
        const along = Math.abs(Math.cos(car.root.rotation.y)) > 0.7;
        const hx = (along ? w : l) / 2;
        const hz = (along ? l : w) / 2;
        rc.x0 = p.x - hx;
        rc.x1 = p.x + hx;
        rc.z0 = p.z - hz;
        rc.z1 = p.z + hz;
      }
    },
    lighting: lamps.lighting,
    dispose() {
      fixtures.dispose();
      beds.dispose();
      doors.dispose();
      curtains.dispose();
      lamps.dispose();
      sky.dispose();
      markers.dispose();
      rain.dispose();
      exterior.dispose();
      minivan.dispose();
      ashleyCar.dispose();
      for (const d2 of disposables) d2.dispose();
      root.removeFromParent();
    },
  };
  const camPos = new THREE.Vector3();
  settle();
  return world;
}

export { createDriveRoute } from './route';
