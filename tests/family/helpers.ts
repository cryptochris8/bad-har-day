// Shared helpers for the family tests (re-exports + a tiny hair-module stub for rig tests).
import * as THREE from 'three';
import { ringTube } from '../../src/family/geo';
import type { HairBuildOpts, HairRig } from '../../src/hair/types';

export { lockGeometry, ringAt, ringTube, sstep, starPoints, tubePoint } from '../../src/family/geo';

/** A V-opened ring tube leaves the front open (no vertices at phi = 0). */
export function vRingOpenCheck(): boolean {
  const g = ringTube(
    [
      { y: 0, w: 0.2, d: 0.2, open: 0.5 },
      { y: 1, w: 0.2, d: 0.2, open: 0.5 },
    ],
    8,
  );
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (Math.abs(Math.atan2(x, z)) < 0.49) return false;
  }
  return true;
}

/** Minimal HairRig stand-in (the real hair module is built in parallel; rig tests must not depend on it). */
export function stubGirlHair(opts: HairBuildOpts): HairRig {
  const root = new THREE.Group();
  root.name = 'stub-hair';
  const cols = opts.cols ?? 9;
  const rows = opts.rows ?? 4;
  const proxy = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.4), new THREE.MeshBasicMaterial({ visible: false }));
  root.add(proxy);
  let updates = 0;
  const rig: HairRig & { updates(): number; fit: HairBuildOpts } = {
    root,
    cols,
    rows,
    tangle: new Float32Array(cols * rows),
    commit() {},
    setBedhead() {},
    setShine() {},
    setKnotMarkers() {},
    setBrush() {},
    snag() {},
    proxy,
    surfacePoint: (_u, _v, out) => out.set(0, 0, 0),
    surfaceNormal: (_u, _v, out) => out.set(0, 0, -1),
    update() {
      updates++;
    },
    dispose() {
      root.removeFromParent();
    },
    updates: () => updates,
    fit: opts,
  };
  return rig;
}
