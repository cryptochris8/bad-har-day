// STUB (integration) — the school-run route (Act V). Owned by the drive activity's author (wave 2).
import * as THREE from 'three';
import { PAL } from '../render/palette';
import type { DriveRoute, World } from './types';

export function createDriveRoute(world: World, _seed: number): DriveRoute {
  const root = new THREE.Group();
  root.position.set(200, 0, 0);
  world.root.add(root);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 600), new THREE.MeshToonMaterial({ color: PAL.asphalt }));
  road.rotation.x = -Math.PI / 2;
  road.position.z = -300;
  root.add(road);
  return {
    root,
    length: 600,
    pointAt(s, x, out) {
      return out.set(200 + x, 0, -s);
    },
    crosswalks: [120, 300],
    lights: [200, 420],
    setLight() {},
    dropoff: { s0: 560, s1: 590, x: 5.5 },
    update() {},
    dispose() {
      root.removeFromParent();
    },
  };
}
