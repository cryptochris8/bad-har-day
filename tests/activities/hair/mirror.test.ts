import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { reflectCamera } from '../../../src/activities/hair/mirror';

function setup(camPos: [number, number, number], look: [number, number, number], near = 0.05, far = 400) {
  const cam = new THREE.PerspectiveCamera(48, 16 / 9, near, far);
  cam.position.set(...camPos);
  cam.lookAt(...look);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.92));
  mirror.position.set(0, 1.35, -0.985);
  mirror.updateMatrixWorld(true);
  mirror.geometry.computeBoundingBox();
  const vc = new THREE.PerspectiveCamera();
  const tex = new THREE.Matrix4();
  const ok = reflectCamera(cam, mirror.matrixWorld, mirror.geometry.boundingBox!, vc, tex);
  return { cam, mirror, vc, tex, ok };
}

const clipOf = (vc: THREE.PerspectiveCamera, p: THREE.Vector3) => new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(vc.matrixWorldInverse).applyMatrix4(vc.projectionMatrix);
const inside = (c: THREE.Vector4) => c.w > 0 && Math.abs(c.x) <= c.w && Math.abs(c.y) <= c.w && c.z >= -c.w && c.z <= c.w;

describe('mirror reflection camera', () => {
  for (const [name, pos, look] of [
    ['behind + right', [0.55, 1.5, 0.9], [0, 1.0, -0.6]],
    ['high wide', [1.25, 2.2, 2.7], [-0.1, 0.9, -0.4]],
    ['low close', [0.3, 1.2, -0.2], [0, 1.1, -0.9]],
  ] as const) {
    it(`reflects the room and clips what is behind the glass (${name})`, () => {
      const { vc, tex, ok, mirror } = setup(pos as unknown as [number, number, number], look as unknown as [number, number, number]);
      expect(ok).toBe(true);
      // Virtual camera is behind the mirror, looking back into the room.
      expect(vc.position.z).toBeLessThan(-0.985);
      expect(vc.getWorldDirection(new THREE.Vector3()).z).toBeGreaterThan(0);
      // A face in the room, seen through the mirror, is inside the virtual frustum.
      const face = new THREE.Vector3(0, 1.3, -0.45);
      expect(inside(clipOf(vc, face))).toBe(true);
      // The wall right behind the glass — and a frame/ink hull a few mm in front of it — is clipped.
      for (const x of [-0.8, 0, 0.8]) {
        const wall = new THREE.Vector3(x, 1.35, -0.975);
        const c = clipOf(vc, wall);
        expect(c.z < -c.w || c.w <= 0).toBe(true);
      }
      // The mirror centre maps into the render target.
      const uv = new THREE.Vector4(0, 0, 0, 1).applyMatrix4(tex);
      expect(uv.x / uv.w).toBeGreaterThan(0);
      expect(uv.x / uv.w).toBeLessThan(1);
      expect(uv.y / uv.w).toBeGreaterThan(0);
      expect(uv.y / uv.w).toBeLessThan(1);
      void mirror;
    });
  }

  it('keeps depth ordering (nearer points get smaller depth) beyond the glass', () => {
    const { vc } = setup([0.55, 1.5, 0.9], [0, 1.0, -0.6]);
    const eye = vc.position.clone();
    const dir = new THREE.Vector3(0, 1.2, 0.5).sub(eye).normalize();
    let prev = -Infinity;
    const out: number[] = [];
    for (const d of [2.0, 2.5, 3.0, 4.0, 6.0]) {
      const c = clipOf(vc, eye.clone().addScaledVector(dir, d));
      const z = c.z / c.w;
      out.push(+z.toFixed(4));
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
    expect(out.length).toBe(5);
  });

  it('does nothing when the camera is behind the mirror', () => {
    const { ok } = setup([0, 1.3, -2], [0, 1.3, -3]);
    expect(ok).toBe(false);
  });
});
