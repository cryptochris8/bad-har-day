import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBrush } from '../../src/hair';
import { insideRoundedRect, roundedRect } from '../../src/hair/brush';
import { BRUSH_NAMES, type BrushKind } from '../../src/hair/types';

const KINDS: BrushKind[] = ['black', 'purple', 'pink', 'teal'];

function modelMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!found && m.isMesh && (m.material as THREE.Material).name.startsWith('bhd-model')) found = m;
  });
  if (!found) throw new Error('no model mesh');
  return found;
}

describe.each(KINDS)('createBrush(%s)', (kind) => {
  const b = createBrush(kind);
  const mesh = modelMesh(b.root);
  const g = mesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox!;

  it('has a name and the right kind', () => {
    expect(b.kind).toBe(kind);
    expect(BRUSH_NAMES[kind].length).toBeGreaterThan(3);
  });

  it('is 300–900 triangles (incl. the baked ink hull)', () => {
    const t = g.getAttribute('position').count / 3;
    expect(t).toBeGreaterThanOrEqual(300);
    expect(t).toBeLessThanOrEqual(900);
  });

  it('is ≈ 0.24 m along +Y with the origin at the grip and the head above it', () => {
    const len = bb.max.y - bb.min.y;
    expect(len).toBeGreaterThan(0.21);
    expect(len).toBeLessThan(0.3);
    expect(bb.min.y).toBeLessThan(-0.05); // handle below the grip
    expect(bb.max.y).toBeGreaterThan(0.14); // head above
    expect(bb.min.x).toBeLessThan(0);
    expect(bb.max.x).toBeGreaterThan(0);
  });

  it('has bristles toward +Z', () => {
    expect(bb.max.z).toBeGreaterThan(0.025);
  });

  it('setGlow is safe; only the black brush glows', () => {
    b.setGlow(1);
    for (let i = 0; i < 30; i++) b.update(1 / 30);
    let glowing = false;
    b.root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && o !== mesh) glowing = true;
    });
    expect(glowing).toBe(kind === 'black');
    b.setGlow(Number.NaN);
    for (let i = 0; i < 90; i++) b.update(1 / 30);
    let still = false;
    b.root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && o !== mesh) still = true;
    });
    expect(still).toBe(false);
  });

  it('dispose detaches without touching the shared geometry', () => {
    const parent = new THREE.Group();
    const b2 = createBrush(kind);
    parent.add(b2.root);
    b2.dispose();
    expect(b2.root.parent).toBe(null);
    expect(modelMesh(createBrush(kind).root).geometry).toBe(g); // cached per kind
  });
});

describe('rounded rect helpers', () => {
  it('outline stays inside its box and the inside test agrees', () => {
    const pts = roundedRect(0.07, 0.1, 0.03, 0.1);
    for (const [x, y] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.035 + 1e-9);
      expect(Math.abs(y - 0.1)).toBeLessThanOrEqual(0.05 + 1e-9);
    }
    expect(insideRoundedRect(0, 0.1, 0.07, 0.1, 0.03, 0.1)).toBe(true);
    expect(insideRoundedRect(0.034, 0.149, 0.07, 0.1, 0.03, 0.1)).toBe(false); // clipped corner
    expect(insideRoundedRect(0.1, 0.1, 0.07, 0.1, 0.03, 0.1)).toBe(false);
  });
});
