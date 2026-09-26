import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createDriveRoute } from '../../src/world';
import { buildRoute, routeBuilder } from '../../src/world/route';
import {
  BAY,
  CROSSWALKS,
  CROSS_HALF,
  DROPOFF,
  EVENT_S0,
  EVENT_S1,
  INTERSECTIONS,
  LIGHTS,
  PARK,
  ROUTE_LENGTH,
  ROUTE_ORIGIN,
  SCHOOL,
  STOP_BACK,
  T_JUNCTION,
  XS,
  curbX,
  freeStretches,
  inIntersection,
  makeLots,
  nearCrosswalk,
  parkedCars,
  streetTrees,
} from '../../src/world/route/layout';
import { LANE_X, type World } from '../../src/world/types';

const fakeWorld = (): World => ({ root: new THREE.Group() }) as unknown as World;

function stats(root: THREE.Object3D): { meshes: number; tris: number } {
  let meshes = 0;
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    const n = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  });
  return { meshes, tris };
}

describe('route layout (pure)', () => {
  it('features sit on the street in a sensible order', () => {
    expect(ROUTE_LENGTH).toBeGreaterThanOrEqual(500);
    expect(ROUTE_LENGTH).toBeLessThanOrEqual(700);
    expect(LIGHTS).toEqual(INTERSECTIONS.map((c) => c - STOP_BACK));
    for (const cw of CROSSWALKS) {
      expect(inIntersection(cw, 8)).toBe(false);
      expect(cw).toBeGreaterThan(0);
      expect(cw).toBeLessThan(DROPOFF.s0);
    }
    expect([...CROSSWALKS].sort((a, b) => a - b)).toEqual([...CROSSWALKS]);
    expect(EVENT_S0).toBeGreaterThan(30);
    expect(EVENT_S1).toBeLessThan(DROPOFF.s0 - 40);
    // the drop-off bay is in front of the school, on the right, beyond the lanes
    expect(DROPOFF.s0).toBeGreaterThan(SCHOOL.s0);
    expect(DROPOFF.s1).toBeLessThan(SCHOOL.s1);
    expect(SCHOOL.door).toBeGreaterThan(DROPOFF.s0);
    expect(SCHOOL.door).toBeLessThan(DROPOFF.s1);
    expect(DROPOFF.x).toBeGreaterThan(LANE_X[1]! + 2);
    expect(DROPOFF.x + 1).toBeLessThan(BAY.curb);
    expect(T_JUNCTION).toBeGreaterThan(SCHOOL.s1);
    expect(PARK.side).toBe(-1);
  });

  it('the right curb swings out smoothly around the bay and nowhere else', () => {
    expect(curbX(0, 1)).toBe(XS.curb0);
    expect(curbX(DROPOFF.s0 - BAY.taperIn - 1, 1)).toBe(XS.curb0);
    expect(curbX((DROPOFF.s0 + DROPOFF.s1) / 2, 1)).toBeCloseTo(BAY.curb, 6);
    expect(curbX((DROPOFF.s0 + DROPOFF.s1) / 2, -1)).toBe(XS.curb0);
    let prev = curbX(DROPOFF.s0 - BAY.taperIn, 1);
    for (let s = DROPOFF.s0 - BAY.taperIn; s <= DROPOFF.s0; s += 0.5) {
      const x = curbX(s, 1);
      expect(x).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = x;
    }
  });

  it('lots never overlap each other, cross streets, the park or the school; seeded + deterministic', () => {
    for (const seed of [1, 7, 42, 999]) {
      const lots = makeLots(seed);
      expect(lots.length).toBeGreaterThan(30);
      expect(makeLots(seed)).toEqual(lots);
      for (const l of lots) {
        expect(l.s1).toBeGreaterThan(l.s0);
        expect(l.hs - l.hw / 2).toBeGreaterThanOrEqual(l.s0 - 1e-6);
        expect(l.hs + l.hw / 2).toBeLessThanOrEqual(l.s1 + 1e-6);
        for (const c of INTERSECTIONS) expect(l.s1 <= c - CROSS_HALF || l.s0 >= c + CROSS_HALF).toBe(true);
        if (l.side === PARK.side) expect(l.s1 <= PARK.s0 + 1e-6 || l.s0 >= PARK.s1 - 1e-6).toBe(true);
        if (l.side === SCHOOL.side) expect(l.s1 <= SCHOOL.s0 + 1e-6 || l.s0 >= SCHOOL.s1 - 1e-6).toBe(true);
        if (l.drive !== null) {
          expect(nearCrosswalk(l.drive, 3)).toBe(false);
          expect(l.drive).toBeGreaterThan(l.s0);
          expect(l.drive).toBeLessThan(l.s1);
        }
        expect(l.front).toBeGreaterThan(XS.walk1 + 4);
      }
      for (const side of [1, -1] as const) {
        const own = lots.filter((l) => l.side === side).sort((a, b) => a.s0 - b.s0);
        for (let i = 1; i < own.length; i++) expect(own[i]!.s0).toBeGreaterThanOrEqual(own[i - 1]!.s1 - 1e-6);
      }
    }
    const a = makeLots(1).map((l) => l.wall).join();
    const b = makeLots(2).map((l) => l.wall).join();
    expect(a).not.toBe(b);
    expect(freeStretches(1).length).toBeGreaterThan(2);
  });

  it('street trees and parked cars keep clear of driveways, crosswalks and the drop-off bay', () => {
    const lots = makeLots(7);
    for (const t of streetTrees(lots, 7)) {
      expect(nearCrosswalk(t.s, 3.9)).toBe(false);
      expect(inIntersection(t.s, 5.9)).toBe(false);
      if (t.side > 0) expect(t.s < DROPOFF.s0 - BAY.taperIn - 3 || t.s > DROPOFF.s1 + BAY.taperOut + 5).toBe(true);
      for (const l of lots) if (l.side === t.side && l.drive !== null) expect(Math.abs(l.drive - t.s)).toBeGreaterThanOrEqual(3.2);
    }
    for (const c of parkedCars(lots, 7)) {
      expect(nearCrosswalk(c.s, 7.9)).toBe(false);
      expect(inIntersection(c.s, 8.9)).toBe(false);
      if (c.side > 0) expect(c.s < DROPOFF.s0 - BAY.taperIn - 7 || c.s > DROPOFF.s1 + BAY.taperOut + 7).toBe(true);
    }
  });
});

describe('createDriveRoute', () => {
  const world = fakeWorld();
  const route = createDriveRoute(world, 7);

  it('honours the DriveRoute contract', () => {
    expect(route.root.parent).toBe(world.root);
    expect(route.length).toBe(ROUTE_LENGTH);
    expect(route.crosswalks).toEqual(CROSSWALKS);
    expect(route.lights).toEqual(LIGHTS);
    expect(route.dropoff).toEqual({ s0: DROPOFF.s0, s1: DROPOFF.s1, x: DROPOFF.x });
    const p = route.pointAt(100, LANE_X[1]!, new THREE.Vector3());
    expect(p.x).toBeCloseTo(ROUTE_ORIGIN.x + LANE_X[1]!, 6);
    expect(p.z).toBeCloseTo(ROUTE_ORIGIN.z - 100, 6);
    expect(p.y).toBe(0);
    // far behind the house: the dollhouse camera (looking toward −Z) never sees it
    expect(ROUTE_ORIGIN.z - ROUTE_LENGTH).toBeGreaterThan(1300);
  });

  it('traffic lights take colours (invalid input is ignored) and update never throws', () => {
    const r = route as ReturnType<typeof buildRoute>;
    route.setLight(0, 'red');
    expect(r.extras.lightColor(0)).toBe('red');
    route.setLight(1, 'yellow');
    expect(r.extras.lightColor(1)).toBe('yellow');
    route.setLight(7, 'red');
    route.setLight(-1, 'green');
    route.setLight(0, 'purple' as 'red');
    expect(r.extras.lightColor(0)).toBe('red');
    const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1300);
    for (let s = -20; s < 700; s += 37) {
      route.pointAt(s, 0, cam.position);
      cam.position.y = 4;
      route.update(1 / 60, cam);
    }
    route.update(Number.NaN, cam);
    route.update(-1, cam);
  });

  it('stays inside the perf budget (≤ 150 k tris, ≤ 40 meshes for the scenery)', () => {
    const s = stats(route.root);
    expect(s.meshes).toBeLessThanOrEqual(40);
    expect(s.tris).toBeLessThanOrEqual(150_000);
  });

  it('far chunks are culled by distance from the camera', () => {
    const cam = new THREE.PerspectiveCamera();
    route.pointAt(0, 0, cam.position);
    route.update(1 / 60, cam);
    let hidden = 0;
    route.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.visible) hidden++;
    });
    expect(hidden).toBeGreaterThan(0);
    route.pointAt(520, 0, cam.position);
    route.update(1 / 60, cam);
    const school = route.root.children.filter((o) => o.name.startsWith('route:props') && o.visible);
    expect(school.length).toBeGreaterThan(0);
  });

  it('builds incrementally (the drive spreads it over the loading cutscene) and disposes cleanly', () => {
    const w = fakeWorld();
    const it = routeBuilder(w, 3);
    let steps = 0;
    let r = it.next();
    while (!r.done) {
      steps++;
      r = it.next();
    }
    expect(steps).toBeGreaterThanOrEqual(8);
    expect(r.value.root.parent).toBe(w.root);
    expect(r.value.root.visible).toBe(true);
    r.value.dispose();
    expect(w.root.children).toHaveLength(0);
    // different seeds give different neighbourhoods but the same street
    const other = buildRoute(fakeWorld(), 11);
    expect(other.crosswalks).toEqual(route.crosswalks);
    expect(other.extras.seed).toBe(11);
    other.dispose();
  }, 120_000);
});
