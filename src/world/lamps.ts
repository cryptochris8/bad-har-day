// ─────────────────────────────────────────────────────────────────────────────
// World lighting: hemisphere + ONE shadow-casting key light (moon → sun) whose
// shadow camera follows the focus; an invisible "shadow roof" that keeps the
// moonlight out of the house before sunrise (so the lamps make warm pools in a
// dark cosy interior); lamp glow parts (toon + emissive driven by the clock),
// camera-facing halo sprites, soft additive light pools on floors/walls, and up
// to 3 real point lights re-assigned to the lamps nearest the focus.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import type { GeoBuilder } from '../render/models/builder';
import { HOUSE, LAMPS, WALLS, WALL_H, roomAt, roomBounds, type LampDef, type LampGroup } from './layout';
import { MAX_SEGS, SQUASH_VERT, buildWithSeg, cutToonMaterial, cutDepthMaterial, type CutUniforms } from './cutMaterial';
import type { LightingState } from './lighting';
import type { Glows } from './kit';
import type { WorldLighting } from './types';

const GROUP_INDEX: Record<LampGroup, number> = { night: 0, house: 1, outdoor: 2 };
const EXT_OFF = 0.12;

/** Segment (wall id) a lamp is mounted on (0 = free standing). */
export function lampSegment(l: LampDef): number {
  for (const w of WALLS) {
    const h = w.t / 2;
    if (w.axis === 'x') {
      if (l.x < w.a || l.x > w.b) continue;
      const d = Math.min(Math.abs(l.z - (w.c + h)), Math.abs(l.z - (w.c - h)));
      if (d < 0.2 && l.y > 1.2) return w.id;
    } else {
      if (l.z < w.a || l.z > w.b) continue;
      const d = Math.min(Math.abs(l.x - (w.c + h)), Math.abs(l.x - (w.c - h)));
      if (d < 0.2 && l.y > 1.2) return w.id;
    }
  }
  return 0;
}

/** Wall behind a lamp for its wall pool (north walls only): wall id and face z. */
function wallBehind(l: LampDef): { id: number; face: number } | null {
  let best: { id: number; face: number } | null = null;
  let bestD = Infinity;
  for (const w of WALLS) {
    if (w.axis !== 'x' || l.x < w.a || l.x > w.b) continue;
    const face = w.c + w.t / 2;
    const d = l.z - face;
    if (d >= -0.01 && d < 0.8 && d < bestD) {
      bestD = d;
      best = { id: w.id, face };
    }
  }
  return best;
}

// ── halos (billboards) ────────────────────────────────────────────────────────
const HALO_VERT = /* glsl */ `
attribute vec2 aCorner;
attribute float aGroup;
attribute float aSize;
attribute float aSeg;
uniform vec3 uLevels;
uniform float uCut[${MAX_SEGS}];
uniform float uCutBase;
uniform float uTime;
varying vec2 vUv;
varying float vK;
void main() {
  vec3 transformed = position;
  ${SQUASH_VERT}
  vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
  float dist = length(mv.xyz);
  // pull toward the camera so the halo isn't clipped by its own lamp — but never through a wall (outdoor lamps)
  mv.xyz += normalize(-mv.xyz) * (aGroup > 1.5 ? 0.04 : min(0.18, dist * 0.3));
  mv.xy += aCorner * aSize;
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  float lv = aGroup < 0.5 ? uLevels.x : (aGroup < 1.5 ? uLevels.y : uLevels.z);
  vK = lv * (0.94 + 0.06 * sin(uTime * 2.3 + position.x * 3.1)) * smoothstep(0.8, 4.5, dist);
}`;
const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vK;
void main() {
  float r = length(vUv);
  float a = pow(max(0.0, 1.0 - r), 3.0) * vK * 0.38;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

// ── pools (floor + wall) ──────────────────────────────────────────────────────
const POOL_VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aGroup;
attribute float aSeg;
uniform vec3 uLevels;
uniform float uCut[${MAX_SEGS}];
uniform float uCutBase;
varying vec2 vUv;
varying float vK;
void main() {
  vec3 transformed = position;
  ${SQUASH_VERT}
  vUv = aUv;
  float gi = mod(aGroup, 3.0);
  vK = gi < 0.5 ? uLevels.x : (gi < 1.5 ? uLevels.y : uLevels.z);
  if (aGroup > 2.5) vK *= 0.36;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}`;
const POOL_FRAG = /* glsl */ `
uniform vec3 uColor;
varying vec2 vUv;
varying float vK;
void main() {
  float r = length(vUv);
  float a = pow(max(0.0, 1.0 - r), 2.2) * vK * 0.34;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

export interface LampSystem {
  readonly group: THREE.Group;
  readonly lighting: WorldLighting;
  apply(s: LightingState): void;
  update(dt: number, fx: number, fz: number): void;
  dispose(): void;
}

export function buildLampSystem(glows: Glows, cut: CutUniforms, quality: 'high' | 'low'): LampSystem {
  const group = new THREE.Group();
  group.name = 'lighting';
  const disposables: { dispose(): void }[] = [];

  // Lights
  const hemi = new THREE.HemisphereLight(PAL.hemiSkyNight, PAL.hemiGroundNight, 1);
  const key = new THREE.DirectionalLight(PAL.keyNight, 0.9);
  key.castShadow = true;
  const size = quality === 'high' ? 2048 : 1024;
  key.shadow.mapSize.set(size, size);
  const sc = key.shadow.camera;
  const ext = quality === 'high' ? 15 : 13;
  sc.left = -ext;
  sc.right = ext;
  sc.top = ext;
  sc.bottom = -ext;
  sc.near = 1;
  sc.far = 90;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.025;
  group.add(hemi, key, key.target);
  const keyDir = new THREE.Vector3(-0.42, 0.82, 0.39).normalize();
  const shadowFocus = new THREE.Vector3();
  const placeKey = () => {
    key.position.set(shadowFocus.x + keyDir.x * 40, keyDir.y * 40, shadowFocus.z + keyDir.z * 40);
    key.target.position.set(shadowFocus.x, 0, shadowFocus.z);
    key.target.updateMatrixWorld();
  };
  placeKey();

  // Night "shadow roof": invisible, casts the house's shadow so moonlight stays outside.
  const roofGeo = new THREE.BoxGeometry(HOUSE.x1 - HOUSE.x0 + 0.1, 1.75, HOUSE.z1 - HOUSE.z0 + 0.1);
  const roofMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  // three renders back faces into shadow maps by default — that would record the box's BOTTOM (y ≈ 0.95) and leave
  // everything above it moonlit. Front faces record the top, so the whole interior is in the roof's shadow.
  roofMat.shadowSide = THREE.FrontSide;
  disposables.push(roofGeo, roofMat);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.name = 'shadowRoof';
  roof.position.set((HOUSE.x0 + HOUSE.x1) / 2, 0.95 + 1.75 / 2, (HOUSE.z0 + HOUSE.z1) / 2);
  roof.castShadow = true;
  roof.receiveShadow = false;
  group.add(roof);

  // Glowing lamp parts (one mesh per group, toon + emissive).
  const glowMats: THREE.MeshToonMaterial[] = [];
  const depth = cutDepthMaterial(cut);
  disposables.push(depth);
  (['night', 'house', 'outdoor'] as const).forEach((gname) => {
    const b: GeoBuilder = glows[gname];
    if (b.triangles === 0) {
      glowMats.push(cutToonMaterial(cut, 'glow-' + gname));
      return;
    }
    const geo = buildWithSeg(b);
    const mat = cutToonMaterial(cut, 'glow-' + gname);
    glowMats.push(mat);
    disposables.push(geo, mat);
    const m = new THREE.Mesh(geo, mat);
    m.name = 'lampGlow:' + gname;
    m.customDepthMaterial = depth;
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
  });

  // Halos + pools
  const levels = new THREE.Vector3(1, 0, 1);
  const time = { value: 0 };
  {
    const pos: number[] = [];
    const corner: number[] = [];
    const grp: number[] = [];
    const sz: number[] = [];
    const seg: number[] = [];
    const idx: number[] = [];
    const C = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    LAMPS.forEach((l, i) => {
      const s = lampSegment(l);
      for (let k = 0; k < 4; k++) {
        pos.push(l.x, l.y, l.z);
        corner.push(C[k]![0]!, C[k]![1]!);
        grp.push(GROUP_INDEX[l.group]);
        sz.push(l.halo);
        seg.push(s);
      }
      const b0 = i * 4;
      idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute('aGroup', new THREE.Float32BufferAttribute(grp, 1));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-halos',
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: { uLevels: { value: levels }, uColor: { value: new THREE.Color(PAL.lampWarm) }, uTime: time, uCut: cut.uCut, uCutBase: cut.uCutBase },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    disposables.push(g, mat);
    const halos = new THREE.Mesh(g, mat);
    halos.name = 'lampHalos';
    halos.frustumCulled = false;
    halos.renderOrder = 9;
    group.add(halos);
  }
  {
    const pos: number[] = [];
    const uv: number[] = [];
    const grp: number[] = [];
    const seg: number[] = [];
    const quadUv = (p: [number, number, number][], u: [number, number][], g: number, sg: number) => {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(...p[k]!);
        uv.push(u[k]![0]! * 1.0, u[k]![1]! * 1.0);
        grp.push(g + 3); // wall pools: dimmer (group index + 3)
        seg.push(sg);
      }
    };
    for (const l of LAMPS) {
      if (l.pool <= 0) continue;
      const g = GROUP_INDEX[l.group];
      const r = l.pool;
      const y = 0.016;
      // outdoor wall lamps: push the pool away from the house so it never shows through the wall
      let px = l.x;
      let pz = l.z;
      if (l.group === 'outdoor') {
        if (Math.abs(l.x - HOUSE.x1) < 0.4) px = HOUSE.x1 + EXT_OFF + r * 0.8;
        else if (Math.abs(l.z - HOUSE.z1) < 0.4) pz = HOUSE.z1 + EXT_OFF + r * 0.8;
      }
      // floor pool (CCW from above → faces +Y), clipped to the lamp's room so it never leaks through walls
      let x0 = px - r;
      let x1 = px + r;
      let z0 = pz - r;
      let z1 = pz + r;
      const lroom = roomAt(l.x, l.z);
      if (lroom && l.group !== 'outdoor') {
        const b = roomBounds(lroom);
        const inset = 0.07;
        x0 = Math.max(x0, b.x0 + inset);
        x1 = Math.min(x1, b.x1 - inset);
        z0 = Math.max(z0, b.z0 + inset);
        z1 = Math.min(z1, b.z1 - inset);
      }
      if (x1 > x0 && z1 > z0) {
        const u = (x: number) => (x - px) / r;
        const v = (z: number) => (z - pz) / r;
        quadUv(
          [
            [x0, y, z1],
            [x1, y, z1],
            [x1, y, z0],
            [x0, y, z0],
          ],
          [
            [u(x0), v(z1)],
            [u(x1), v(z1)],
            [u(x1), v(z0)],
            [u(x0), v(z0)],
          ],
          g - 3,
          0,
        );
      }
      const wb = l.wall === 'z+' ? wallBehind(l) : null;
      if (wb) {
        const wr = r * 0.6;
        const z = wb.face + 0.012;
        const cy = l.y;
        const y0 = Math.max(0.02, cy - wr);
        const y1 = Math.min(WALL_H - 0.04, cy + wr);
        const v0 = (y0 - cy) / wr;
        const v1 = (y1 - cy) / wr;
        quadUv(
          [
            [l.x - wr, y0, z],
            [l.x + wr, y0, z],
            [l.x + wr, y1, z],
            [l.x - wr, y1, z],
          ],
          [
            [-1, v0],
            [1, v0],
            [1, v1],
            [-1, v1],
          ],
          g,
          wb.id,
        );
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aGroup', new THREE.Float32BufferAttribute(grp, 1));
    geo.setAttribute('aSeg', new THREE.Float32BufferAttribute(seg, 1));
    geo.computeBoundingSphere();
    const mat = new THREE.ShaderMaterial({
      name: 'bhd-pools',
      vertexShader: POOL_VERT,
      fragmentShader: POOL_FRAG,
      uniforms: { uLevels: { value: levels }, uColor: { value: new THREE.Color(PAL.lampWarm) }, uCut: cut.uCut, uCutBase: cut.uCutBase },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    disposables.push(geo, mat);
    const pools = new THREE.Mesh(geo, mat);
    pools.name = 'lampPools';
    pools.frustumCulled = false;
    pools.renderOrder = 5;
    group.add(pools);
  }

  // Up to 3 point lights on high; ONE on low (phones default to low — without it station close-ups at 5:15 lose all
  // their warm lamp light and turn flat navy).
  const POINTS: number = quality === 'high' ? 3 : 1;
  const points: THREE.PointLight[] = [];
  for (let i = 0; i < POINTS; i++) {
    const p = new THREE.PointLight(PAL.lampWarm, 0, 3.4, 1.8);
    p.castShadow = false;
    points.push(p);
    group.add(p);
  }
  // point-light positions: above/in front of the lamp but kept ≥ 0.9 m from the room's walls (no hot spots)
  const candidates = LAMPS.map((l, i) => {
    const room = roomAt(l.x, l.z);
    let px = l.x;
    let pz = l.z + 0.6;
    if (room) {
      const b = roomBounds(room);
      const m = 0.9;
      px = Math.min(Math.max(px, b.x0 + m), b.x1 - m);
      pz = Math.min(Math.max(pz, b.z0 + m), b.z1 - m);
    }
    return { l, i, px, py: Math.max(0.9, l.y + 0.35), pz, room };
  }).filter((c) => c.l.point > 0);
  const pick = new Int32Array(POINTS + 1);
  const pickD = new Float64Array(POINTS + 1);
  const lampLevel = new Float32Array(3);
  const warm = new THREE.Color(PAL.lampWarm);
  const tmp = new THREE.Color();

  const lighting: WorldLighting = {
    hemi,
    key,
    setShadowFocus(x: number, z: number) {
      shadowFocus.set(x, 0, z);
      placeKey();
    },
  };

  return {
    group,
    lighting,
    apply(s: LightingState) {
      hemi.color.setHex(s.hemiSky);
      hemi.groundColor.setHex(s.hemiGround);
      hemi.intensity = s.hemiIntensity;
      key.color.setHex(s.keyColor);
      key.intensity = s.keyIntensity;
      keyDir.set(s.keyX, s.keyY, s.keyZ);
      placeKey();
      roof.castShadow = s.sunAmount < 0.5;
      lampLevel[0] = s.nightLamps;
      lampLevel[1] = s.houseLamps;
      lampLevel[2] = s.outdoorLamps;
      levels.set(s.nightLamps, s.houseLamps, s.outdoorLamps);
      for (let i = 0; i < 3; i++) {
        const m = glowMats[i];
        if (!m) continue;
        tmp.copy(warm).multiplyScalar(0.95 * lampLevel[i]!);
        m.emissive.copy(tmp);
      }
    },
    update(dt: number, fx: number, fz: number) {
      time.value += dt;
      if (POINTS === 0) return;
      // choose the nearest lit lamps IN THE FOCUS ROOM (point lights have no shadows: never light other rooms)
      const focusRoom = roomAt(fx, fz);
      let n = 0;
      for (let c = 0; c < candidates.length; c++) {
        const cand = candidates[c]!;
        if (cand.room !== focusRoom) continue;
        const l = cand.l;
        const lv = lampLevel[GROUP_INDEX[l.group]]!;
        if (lv < 0.04) continue;
        const d = (l.x - fx) * (l.x - fx) + (l.z - fz) * (l.z - fz);
        if (d > 15 * 15) continue;
        let j: number;
        if (n < POINTS) j = n++;
        else if (d < pickD[POINTS - 1]!) j = POINTS - 1;
        else continue;
        while (j > 0 && pickD[j - 1]! > d) {
          pickD[j] = pickD[j - 1]!;
          pick[j] = pick[j - 1]!;
          j--;
        }
        pickD[j] = d;
        pick[j] = c;
      }
      for (let i = 0; i < POINTS; i++) {
        const p = points[i]!;
        if (i >= n) {
          p.intensity = 0;
          continue;
        }
        const cand = candidates[pick[i]!]!;
        const l = cand.l;
        const lv = lampLevel[GROUP_INDEX[l.group]]!;
        p.position.set(cand.px, cand.py, cand.pz);
        p.intensity = l.point * lv * 0.42;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      key.shadow.map?.dispose();
      group.removeFromParent();
    },
  };
}
