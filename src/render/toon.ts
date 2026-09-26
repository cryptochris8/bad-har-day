// Shared toon shading: one 3-band gradient map for every MeshToonMaterial in the
// game, so lighting bands match between world, models and scenery.
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 3-band (shadow / mid / lit) gradient map, NearestFilter so bands stay crisp. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  // Soft cosy bands (shadow 55 %, mid 80 %) — gentler than the arcade siblings' 35 / 67 %.
  const data = new Uint8Array([140, 140, 140, 255, 204, 204, 204, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/**
 * Shared, cached toon material for a flat colour. Do not mutate the returned
 * material (it is shared) — clone it if you need per-instance changes.
 */
export function toon(color: number, opts: { vertexColors?: boolean; emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshToonMaterial {
  const key = `${color}|${opts.vertexColors ? 1 : 0}|${opts.emissive ?? -1}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: toonGradient(),
      vertexColors: !!opts.vertexColors,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
    });
    if (opts.emissive !== undefined) m.emissive.setHex(opts.emissive);
    cache.set(key, m);
  }
  return m;
}
