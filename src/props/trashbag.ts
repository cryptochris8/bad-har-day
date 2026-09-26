// ─────────────────────────────────────────────────────────────────────────────
// Trash bag: a bulgy, lumpy plum-grey bag with a gathered neck, a "bunny ears"
// knot and a coral drawstring. setPeek(v): the bag bulges a little more and a
// banana peel pokes out over the knot — the "something almost falls out!" beat.
// Grip = the knot (hold 'bag': the bag hangs below the hand).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { inked } from '../render/models/common';
import { BaseProp, propGeo } from './base';
import { bananaPeelGeo } from './misc';
import { smoothPath, tube } from './shapes';
import type { TrashBagProp } from './types';

function bagGeo(): THREE.BufferGeometry {
  const b = inked();
  const c = PAL.trashBag;
  b.ball(0.2, 1, c, { at: [0, 0.225, 0], scale: [1.05, 1.08, 0.95], jitter: 0.012, seed: 5, smooth: true });
  b.ball(0.11, 1, c, { at: [0.13, 0.14, 0.06], jitter: 0.008, seed: 6, smooth: true });
  b.ball(0.1, 1, c, { at: [-0.12, 0.3, 0.05], jitter: 0.008, seed: 7, smooth: true });
  b.cyl(0.035, 0.1, 0.1, 10, c, { at: [0, 0.43, 0], jitter: 0.006, seed: 8, smooth: true });
  b.sphere(0.036, 7, 5, c, { at: [0, 0.49, 0], smooth: true });
  for (const s of [-1, 1]) b.sphere(0.042, 8, 5, c, { at: [s * 0.048, 0.515, 0], scale: [1.4, 0.55, 0.85], rot: [0, 0, s * 0.6], smooth: true });
  // Drawstring tie.
  b.torus(0.043, 0.0085, 3, 12, PAL.bagTie, { at: [0, 0.462, 0], rot: [Math.PI / 2, 0, 0] });
  tube(b, smoothPath([[0.03, 0.465, 0.03], [0.045, 0.44, 0.05], [0.05, 0.41, 0.055]], 5), 0.006, PAL.bagTie, {}, 4);
  // Plastic sheen streaks.
  b.ball(0.05, 0, PAL.trashBagSheen, { at: [-0.085, 0.29, 0.172], scale: [0.35, 1.5, 0.2], rot: [0, -0.45, 0.25], ink: false });
  b.ball(0.035, 0, PAL.trashBagSheen, { at: [-0.03, 0.36, 0.165], scale: [0.35, 1.2, 0.2], rot: [0, -0.2, 0.3], ink: false });
  b.ball(0.03, 0, PAL.trashBagSheen, { at: [0.15, 0.17, 0.155], scale: [0.35, 1.2, 0.2], rot: [0, 0.5, -0.2], ink: false });
  return b.build();
}

export class TrashBag extends BaseProp implements TrashBagProp {
  private readonly body: THREE.Group;
  private readonly peek: THREE.Group;
  private peekAmt = 0;

  constructor() {
    super('trashBag');
    this.body = new THREE.Group();
    this.body.name = 'body';
    this.root.add(this.body);
    this.addPart(propGeo('trashBag', bagGeo), this.body);
    this.peek = new THREE.Group();
    this.peek.name = 'peek';
    this.peek.visible = false;
    this.body.add(this.peek);
    this.addPart(propGeo('misc|bananaPeel', bananaPeelGeo), this.peek);
    this.peek.scale.setScalar(0.8);
    // Bounds from the bag alone (the peel is hidden until setPeek).
    this.measureBagOnly();
    this.setGrip(0, 0.5, 0);
    this.setPeek(0);
  }

  private measureBagOnly(): void {
    const g = this.parts[0]!.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    this.height = bb.max.y;
    this.radius = Math.max(Math.abs(bb.min.x), bb.max.x, Math.abs(bb.min.z), bb.max.z);
    this.root.userData.bounds = bb.clone();
  }

  /** Current peek amount 0..1. */
  get peekAmount(): number {
    return this.peekAmt;
  }

  setPeek(v: number): void {
    const k = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.peekAmt = k;
    this.body.scale.set(1 + 0.05 * k, 1 - 0.02 * k, 1 + 0.05 * k);
    this.peek.visible = k > 0.02;
    // Slides from inside the neck up and over the knot, tipping outward.
    this.peek.position.set(0.02 + 0.06 * k, 0.36 + 0.13 * k, 0.02 + 0.05 * k);
    this.peek.rotation.set(0.9 * k, 0.4, -1.4 * k);
  }
}
