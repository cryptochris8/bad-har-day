// Split a merged (non-indexed) geometry into regional chunks by triangle centroid, so big merged meshes can be
// frustum-culled piecewise. Every attribute is carried over.
import * as THREE from 'three';

export function splitGeometry(geo: THREE.BufferGeometry, n: number, bucket: (x: number, y: number, z: number) => number): THREE.BufferGeometry[] {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position') as THREE.BufferAttribute;
  const tris = pos.count / 3;
  const which = new Int32Array(tris);
  const counts = new Int32Array(n);
  for (let t = 0; t < tris; t++) {
    const i = t * 3;
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const b = Math.max(0, Math.min(n - 1, bucket(x, y, z)));
    which[t] = b;
    counts[b]!++;
  }
  const out: THREE.BufferGeometry[] = [];
  const names = Object.keys(src.attributes);
  for (let b = 0; b < n; b++) {
    const g = new THREE.BufferGeometry();
    const vcount = counts[b]! * 3;
    for (const name of names) {
      const a = src.getAttribute(name) as THREE.BufferAttribute;
      const size = a.itemSize;
      const arr = new Float32Array(vcount * size);
      let k = 0;
      for (let t = 0; t < tris; t++) {
        if (which[t] !== b) continue;
        for (let v = 0; v < 3; v++) {
          const vi = t * 3 + v;
          for (let c = 0; c < size; c++) arr[k++] = a.array[vi * size + c] as number;
        }
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    out.push(g);
  }
  if (src !== geo) src.dispose();
  return out.filter((g) => g.getAttribute('position').count > 0);
}
