// ─────────────────────────────────────────────────────────────────────────────
// BaseProp — the shared implementation behind every prop: a root group, a `grip`
// empty, inked parts built from CACHED geometry with the SHARED model material,
// lazily-created highlight shells, measured radius/height, and a dispose() that
// frees only this instance's own resources (highlight / liquid / steam
// materials), never the shared caches.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { INK_BASE } from '../render/models/builder';
import { cachedGeo } from '../render/models/common';
import { modelMaterial } from '../render/models/materials';
import type { Prop } from './types';
import { clampAmount, highlightMaterial, tickHighlight, type HighlightMaterial } from './highlight';

const box = new THREE.Box3();
const partBox = new THREE.Box3();

/**
 * Baked outline thickness for props (m). GeoBuilder bakes INK_BASE (1.2 cm — sized for people);
 * on a 10 cm mug that swamps the shape in close-ups. Props pull their hull back to this; the
 * model material still widens it with camera distance (beyond ~6 m), so props keep a ~1.5 px
 * outline in the dollhouse view and a crisp ~4 px one in close-ups.
 */
export const PROP_INK = 0.004;

/** Pull an inked geometry's hull vertices in from INK_BASE to `ink` (in place). */
export function thinInk(g: THREE.BufferGeometry, ink = PROP_INK): THREE.BufferGeometry {
  const inkA = g.getAttribute('aInk') as THREE.BufferAttribute | undefined;
  if (!inkA) return g;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const k = INK_BASE - ink;
  for (let i = 0; i < pos.count; i++) {
    const x = inkA.getX(i);
    const y = inkA.getY(i);
    const z = inkA.getZ(i);
    if (x === 0 && y === 0 && z === 0) continue;
    pos.setXYZ(i, pos.getX(i) - x * k, pos.getY(i) - y * k, pos.getZ(i) - z * k);
  }
  pos.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Cached prop geometry: `key` must encode everything that changes the mesh (kind, colour…). */
export function propGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  return cachedGeo('props|' + key, () => thinInk(make()));
}

const noRaycast = (): void => {};

export class BaseProp implements Prop {
  readonly root = new THREE.Group();
  readonly grip = new THREE.Object3D();
  radius = 0.1;
  height = 0.1;
  /** Inked meshes that receive a highlight shell. */
  protected readonly parts: THREE.Mesh[] = [];
  /** Per-instance resources freed by dispose(). */
  protected readonly owned: { dispose(): void }[] = [];
  private shells: THREE.Mesh[] | null = null;
  private hlMat: HighlightMaterial | null = null;
  private hl = 0;
  private disposed = false;

  constructor(name: string) {
    this.root.name = 'prop:' + name;
    this.grip.name = 'grip';
    this.root.add(this.grip);
  }

  /** Add a mesh with shared geometry + the shared model material (gets a highlight shell). */
  addPart(geo: THREE.BufferGeometry, parent: THREE.Object3D = this.root, x = 0, y = 0, z = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, modelMaterial());
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = false;
    parent.add(m);
    this.parts.push(m);
    if (this.shells) this.addShell(m);
    return m;
  }

  /** Set the grip point (root space). */
  setGrip(x: number, y: number, z: number): this {
    this.grip.position.set(x, y, z);
    return this;
  }

  /**
   * Measure radius (max horizontal extent from the origin) and height (top) from the parts'
   * geometry bounds in root space. Call after building (root must be un-transformed).
   */
  measure(extra?: readonly THREE.Object3D[]): this {
    this.root.updateMatrixWorld(true);
    box.makeEmpty();
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const rel = new THREE.Matrix4();
    for (const m of [...this.parts, ...(extra ?? [])]) {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) continue;
      const g = mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      rel.multiplyMatrices(inv, mesh.matrixWorld);
      partBox.copy(g.boundingBox!).applyMatrix4(rel);
      box.union(partBox);
    }
    if (box.isEmpty()) return this;
    this.root.userData.bounds = box.clone();
    this.height = Math.max(0.005, box.max.y);
    this.radius = Math.max(0.005, Math.abs(box.min.x), Math.abs(box.max.x), Math.abs(box.min.z), Math.abs(box.max.z));
    return this;
  }

  private addShell(src: THREE.Mesh): void {
    const s = new THREE.Mesh(src.geometry, this.hlMat!);
    s.name = 'highlight';
    s.renderOrder = 4;
    s.raycast = noRaycast;
    s.onBeforeRender = tickHighlight;
    s.visible = this.hl > 0.001;
    src.add(s);
    this.shells!.push(s);
  }

  setHighlight(v: number): void {
    const a = clampAmount(v);
    this.hl = a;
    if (!this.shells) {
      if (a <= 0.001 || this.disposed) return;
      this.hlMat = highlightMaterial();
      this.shells = [];
      for (const p of this.parts) this.addShell(p);
    }
    this.hlMat!.uniforms.uAmt.value = a;
    for (const s of this.shells) s.visible = a > 0.001;
  }

  /** Current highlight amount (0..1). */
  get highlight(): number {
    return this.hl;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.shells) for (const s of this.shells) s.removeFromParent();
    this.shells = null;
    this.hlMat?.dispose();
    this.hlMat = null;
    for (const r of this.owned) r.dispose();
    this.owned.length = 0;
    this.root.removeFromParent();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
