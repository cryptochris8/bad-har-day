// ─────────────────────────────────────────────────────────────────────────────
// The school-run route (Act V) — implements DriveRoute (src/world/types.ts).
// A cheerful fictional neighbourhood street built far behind the house (route
// root at ROUTE_ORIGIN, under world.root) and lit by the world's shared lights /
// sky: colourful seeded houses, maple street trees, crosswalks, two signalled
// intersections, Maple Grove Park, and Maple Grove Elementary with its drop-off
// bay. Layout data: route/layout.ts (pure). Builders: route/*.ts.
// Budget (route view): ≲ 40 draw calls and ≲ 150 k triangles for the scenery.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { sceneryMaterial } from '../render/models/materials';
import { groundGeometry, buildBackdrop } from './route/backdrop';
import { Chunks, faceRoadYaw } from './route/chunks';
import { buildFurniture } from './route/furniture';
import { buildEndRow, buildLot, type FenceSink } from './route/houses';
import {
  CROSSWALKS,
  CROSS_HALF,
  DROPOFF,
  INTERSECTIONS,
  LIGHTS,
  ROUTE_LENGTH,
  ROUTE_ORIGIN,
  SCHOOL,
  T_JUNCTION,
  makeLots,
} from './route/layout';
import { PARK_SIGN, buildPark } from './route/park';
import { SCHOOL_PARTS, buildSchool } from './route/school';
import { buildSignals, type SignalColor } from './route/signals';
import { QuadBatch, REGIONS, createSignAtlas } from './route/signs';
import { Spray } from './route/sprinkler';
import { buildStreet } from './route/street';
import { PAL } from '../render/palette';
import type { DriveRoute, World } from './types';

/** Extra (non-contract) handles for the drive activity and dev pages. */
export interface RouteExtras {
  readonly seed: number;
  /** Current colour of a traffic light. */
  lightColor(index: number): SignalColor;
  /** Where the school door is (route space) — the girls walk there. */
  readonly schoolDoor: { readonly s: number; readonly x: number };
  /** World position of the flag top (fireworks / confetti anchor). */
  readonly flagTop: THREE.Vector3;
}

export type RouteWithExtras = DriveRoute & { readonly extras: RouteExtras };

export function createDriveRoute(world: World, seed: number): DriveRoute {
  return buildRoute(world, Number.isFinite(seed) ? Math.floor(seed) : 1);
}

/** Build the whole route now (dev pages, tests). */
export function buildRoute(world: World, seed: number): RouteWithExtras {
  const it = routeBuilder(world, seed);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * Incremental route build: each `next()` does one slice of work (~1/12 of the total) so the activity can spread
 * it over the loading cutscene's frames. The final result is the finished route.
 */
export function* routeBuilder(world: World, seed: number): Generator<number, RouteWithExtras, void> {
  const root = new THREE.Group();
  root.name = 'route';
  root.position.set(ROUTE_ORIGIN.x, ROUTE_ORIGIN.y, ROUTE_ORIGIN.z);
  world.root.add(root);
  const disposables: { dispose(): void }[] = [];

  // ── static geometry, merged per chunk ──
  const lots = makeLots(seed);
  const ch = new Chunks();
  const atlas = createSignAtlas();
  const fenceQuads = atlas ? new QuadBatch() : null;
  const fence: FenceSink = fenceQuads ? (x, z, len, yaw) => fenceQuads.add('fence', x, 0.52, z, len + 0.02, 0.9, yaw) : null;
  root.visible = false;
  try {
    buildStreet(ch, lots);
    yield 1;
    const half = Math.ceil(lots.length / 3);
    for (let i = 0; i < lots.length; i += half) {
      for (const l of lots.slice(i, i + half)) buildLot(ch, l, fence);
      yield 2;
    }
    buildEndRow(ch, lots, seed);
    buildFurniture(ch, lots, seed);
    yield 3;
    buildPark(ch, seed);
    yield 4;
    buildSchool(ch, seed);
    yield 5;
    buildBackdrop(ch, seed);
    buildSignPosts(ch);
    yield 6;
    for (let i = 0; i < ch.n; i++) {
      disposables.push(...ch.buildChunk(i, root, true));
      if (i % 3 === 2) yield 7;
    }
    disposables.push(...ch.buildFar(root));
  } finally {
    root.visible = true;
  }

  const gGeo = groundGeometry();
  disposables.push(gGeo);
  const ground = new THREE.Mesh(gGeo, sceneryMaterial());
  ground.name = 'route:ground';
  ground.receiveShadow = true;
  root.add(ground);

  // ── traffic-light bulbs ──
  const signals = buildSignals();
  root.add(signals.group);

  // ── sign faces + road paint (canvas atlas; skipped without a DOM) ──
  let flag: { mesh: THREE.Mesh; base: Float32Array } | null = null;
  if (atlas) {
    disposables.push(atlas);
    const signs = new QuadBatch();
    const paint = new QuadBatch();
    const np = SCHOOL_PARTS.namePanel;
    signs.add('schoolName', SCHOOL.front - 0.16, np.y, -np.s, np.w, np.h, -Math.PI / 2);
    const mo = SCHOOL_PARTS.monument;
    signs.add('monument', mo.x - 0.27, 1.3, -mo.s, 3.9, 0.98, -Math.PI / 2);
    const ds = SCHOOL_PARTS.dropSign;
    signs.add('dropoff', ds.x, 2.55, -ds.s + 0.07, 1.8, 0.9, 0);
    signs.add('schoolZone', 6.0, 2.6, -(442) + 0.06, 0.9, 0.9, 0);
    signs.add('kidsAtPlay', -6.0, 2.6, -(176) + 0.06, 0.95, 0.95, 0);
    signs.add('park', PARK_SIGN.x + 0.12, 1.45, -PARK_SIGN.s, 3.3, 0.82, Math.PI / 2);
    [...INTERSECTIONS, T_JUNCTION].forEach((c, i) => signs.add(`street${(i % 3) + 1}` as 'street1', 6.0, 3.35, -(c - CROSS_HALF - 1.4) + 0.04, 1.5, 0.37, 0));
    INTERSECTIONS.forEach((c) => signs.add('street0', 6.0, 3.0, -(c - CROSS_HALF - 1.4), 1.5, 0.37, -Math.PI / 2));
    for (const x of [-1.8, 1.8]) paint.add('paintSchool', x, 0.012, -452, 2.8, 1.5, 0, true);
    paint.add('paintDropoff', DROPOFF.x, 0.02, -(DROPOFF.s0 + 6), 2.1, 1.3, 0, true);
    if (fenceQuads && !fenceQuads.empty) {
      const fg0 = fenceQuads.build();
      disposables.push(fg0);
      const fm0 = new THREE.Mesh(fg0, atlas.signMat);
      fm0.name = 'route:fences';
      root.add(fm0);
    }
    const sg = signs.build();
    const pg = paint.build();
    disposables.push(sg, pg);
    const sm = new THREE.Mesh(sg, atlas.signMat);
    sm.name = 'route:signFaces';
    const pm = new THREE.Mesh(pg, atlas.paintMat);
    pm.name = 'route:paint';
    pm.receiveShadow = true;
    root.add(sm, pm);
    // the school flag (waves in update)
    const F = SCHOOL_PARTS.flag;
    const fg = new THREE.PlaneGeometry(2.3, 1.45, 10, 3);
    fg.translate(1.15, F.h - 0.8, 0);
    const [rx, ry, rw, rh] = REGIONS.flag;
    const uv = fg.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / 1024, 1 - (ry + (1 - uv.getY(i)) * rh) / 1024);
    disposables.push(fg);
    const fm = new THREE.Mesh(fg, atlas.flagMat);
    fm.name = 'route:flag';
    fm.position.set(F.x + 0.06, 0, -F.s);
    fm.castShadow = true;
    root.add(fm);
    flag = { mesh: fm, base: Float32Array.from(fg.getAttribute('position').array as ArrayLike<number>) };
  }

  // ── a sprinkler on a front lawn (scenery; the sprinkler EVENT has its own over the road) ──
  const lawnLot = lots.find((l) => l.side < 0 && l.hs > 90 && l.hs < 125) ?? lots.find((l) => l.side < 0);
  let lawnSpray: Spray | null = null;
  if (lawnLot) {
    lawnSpray = new Spray({ yaw: Math.PI / 2 + 0.2, sweep: 0.9, speed: 5.2, elevation: 0.85, count: 40, period: 3.2 });
    lawnSpray.group.position.set(-(lawnLot.front - 3.2), 0, -(lawnLot.s0 + 3.5));
    root.add(lawnSpray.group);
  }

  const camPos = new THREE.Vector3();
  const flagTop = new THREE.Vector3(ROUTE_ORIGIN.x + SCHOOL_PARTS.flag.x, SCHOOL_PARTS.flag.h, ROUTE_ORIGIN.z - SCHOOL_PARTS.flag.s);
  let time = 0;
  const lights = LIGHTS.slice();
  yield 8;
  const route: RouteWithExtras = {
    root,
    length: ROUTE_LENGTH,
    pointAt(s, x, out) {
      return out.set(root.position.x + x, root.position.y, root.position.z - s);
    },
    crosswalks: CROSSWALKS.slice(),
    lights,
    setLight(index, color) {
      signals.set(index, color);
    },
    dropoff: { s0: DROPOFF.s0, s1: DROPOFF.s1, x: DROPOFF.x },
    update(dt, camera) {
      const d = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
      time += d;
      if (camera) {
        camera.getWorldPosition(camPos);
        ch.cull(root.position.z - camPos.z);
      }
      signals.update(time);
      if (flag) {
        const pos = flag.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const b = flag.base;
        for (let i = 0; i < pos.count; i++) {
          const x = b[i * 3]!;
          const u = x / 2.3;
          const z = Math.sin(x * 2.4 - time * 5.2) * 0.16 * u + Math.sin(time * 1.3) * 0.12 * u;
          pos.setXYZ(i, x - Math.abs(z) * 0.15, b[i * 3 + 1]! - u * 0.06 + Math.sin(x * 1.7 - time * 4) * 0.03 * u, z);
        }
        pos.needsUpdate = true;
      }
      lawnSpray?.update(d);
    },
    dispose() {
      signals.dispose();
      lawnSpray?.dispose();
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
    extras: {
      seed,
      lightColor: (i) => signals.get(i),
      schoolDoor: { s: SCHOOL.door, x: SCHOOL_PARTS.steps.x },
      flagTop,
    },
  };
  return route;
}

/** Posts + back plates for the sign faces (the text is on the atlas quads). */
function buildSignPosts(ch: Chunks): void {
  const post = (s: number, x: number, h: number) => ch.frame(s, x, 0).cyl(0.05, 0.05, h, 6, PAL.poleGrey, 0, h / 2, 0);
  post(442, 6.0, 3.1);
  ch.frame(442, 6.0, 0).box(0.98, 0.98, 0.05, 0x3a3040, 0, 2.6, 0.01, { rot: [0, 0, 0] });
  post(176, -6.0, 3.1);
  ch.frame(176, -6.0, 0).box(0.72, 0.72, 0.05, 0x3a3040, 0, 2.6, 0.01, { rot: [0, 0, Math.PI / 4] });
  for (const c of [...INTERSECTIONS, T_JUNCTION]) {
    const s = c - CROSS_HALF - 1.4;
    post(s, 6.0, 3.6);
    ch.frame(s, 6.0, 0).box(1.56, 0.42, 0.04, PAL.streetSign, 0, 3.35, 0.0, { ink: false });
    if (c !== T_JUNCTION) ch.frame(s, 6.0, faceRoadYaw(1)).box(1.56, 0.42, 0.04, PAL.streetSign, 0, 3.0, 0.0, { ink: false });
  }
}
