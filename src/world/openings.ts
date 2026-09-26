// ─────────────────────────────────────────────────────────────────────────────
// Swinging doors (contract `Door`, block movement while closed), animated
// curtains (contract `Curtains`) on the girls' north windows, and the warm
// sunbeam that pours through once the curtains open and the sun is up.
// Door leaves and curtains squash with their wall (cut-away).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { GeoBuilder, shadeHex } from '../render/models/builder';
import { Frame } from './kit';
import { DOORS, DOOR_HEAD, WALLS, type DoorSpec, type Opening, type WallDef } from './layout';
import { buildWithSeg, cutMesh } from './cutMaterial';
import type { DynRect } from './collision';
import type { Curtains, Door } from './types';

const ease = (t: number): number => t * t * (3 - 2 * t);

function doorLeaf(spec: DoorSpec): GeoBuilder {
  const b = new GeoBuilder(true, true);
  const f = new Frame(b, 0, 0, 0, 0, spec.wall.id);
  const w = spec.width;
  const h = DOOR_HEAD - 0.03;
  const T = 0.05;
  if (spec.id === 'front') {
    const col = PAL.frontDoor;
    f.rbox(w, h, T, 0.015, col, w / 2, h / 2 + 0.01, 0, {}, 1);
    for (const s of [-1, 1]) {
      // raised panels on both faces
      f.span(0.12, w - 0.12, 0.2, 0.9, s * (T / 2), s * (T / 2 + 0.012), shadeHex(col, 1.08), { ink: false });
      f.span(0.12, w / 2 - 0.04, 1.05, 1.5, s * (T / 2), s * (T / 2 + 0.012), shadeHex(col, 1.08), { ink: false });
      f.span(w / 2 + 0.04, w - 0.12, 1.05, 1.5, s * (T / 2), s * (T / 2 + 0.012), shadeHex(col, 1.08), { ink: false });
      f.ball(0.035, 1, PAL.knobBrass, w - 0.09, 1.0, s * (T / 2 + 0.035), { smooth: true });
    }
    // little half-moon window
    f.cyl(0.2, 0.2, T + 0.02, 16, PAL.trim, w / 2, 1.72, 0, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55] });
    f.cyl(0.16, 0.16, T + 0.03, 16, PAL.windowDay, w / 2, 1.72, 0, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55], ink: false });
    f.span(0.3, w - 0.3, 0.05, 0.12, T / 2, T / 2 + 0.01, PAL.knobBrass, { ink: false });
  } else {
    const col = PAL.cabinetCream;
    f.rbox(w, h, T, 0.015, col, w / 2, h / 2 + 0.01, 0, {}, 1);
    f.span(0.12, w - 0.12, 1.0, 1.9, -T / 2 - 0.004, T / 2 + 0.004, PAL.windowDay, { ink: false });
    for (const s of [-1, 1]) {
      f.span(w / 2 - 0.015, w / 2 + 0.015, 1.0, 1.9, s * (T / 2), s * (T / 2 + 0.014), col, { ink: false });
      for (const y of [1.3, 1.6]) f.span(0.12, w - 0.12, y - 0.015, y + 0.015, s * (T / 2), s * (T / 2 + 0.014), col, { ink: false });
      f.span(0.12, w - 0.12, 0.2, 0.85, s * (T / 2), s * (T / 2 + 0.012), shadeHex(col, 1.04), { ink: false });
      f.ball(0.035, 1, PAL.knobBrass, w - 0.09, 0.98, s * (T / 2 + 0.035), { smooth: true });
    }
    // dog flap
    f.span(w / 2 - 0.18, w / 2 + 0.18, 0.08, 0.4, -T / 2 - 0.006, T / 2 + 0.006, shadeHex(col, 0.8), { ink: false });
  }
  return b;
}

export interface DoorSet {
  readonly group: THREE.Group;
  door(id: 'front' | 'back'): Door;
  update(dt: number): void;
  dispose(): void;
}

export function buildDoors(mat: THREE.Material, depth: THREE.Material, blockers: Record<'front' | 'back', DynRect>): DoorSet {
  const group = new THREE.Group();
  group.name = 'doors';
  const handles = new Map<'front' | 'back', Door>();
  const tickers: ((dt: number) => void)[] = [];
  const geos: THREE.BufferGeometry[] = [];
  for (const spec of DOORS) {
    const pivot = new THREE.Group();
    pivot.name = 'door:' + spec.id;
    pivot.position.set(spec.hingeX, 0, spec.hingeZ);
    pivot.rotation.y = spec.closedYaw;
    const g = buildWithSeg(doorLeaf(spec));
    geos.push(g);
    const m = cutMesh(g, mat, depth);
    pivot.add(m);
    group.add(pivot);
    let open = 0;
    let target = 0;
    const blocker = blockers[spec.id];
    const h: Door = {
      id: spec.id,
      get openness() {
        return open;
      },
      get isOpen() {
        return open > 0.5;
      },
      open() {
        target = 1;
      },
      close() {
        target = 0;
      },
    };
    handles.set(spec.id, h);
    tickers.push((dt) => {
      if (open !== target) {
        const step = dt * 2.2;
        open = target > open ? Math.min(target, open + step) : Math.max(target, open - step);
      }
      pivot.rotation.y = spec.closedYaw + spec.swing * ease(open);
      blocker.active = open < 0.35;
    });
  }
  return {
    group,
    door: (id) => handles.get(id)!,
    update(dt) {
      for (let i = 0; i < tickers.length; i++) tickers[i]!(dt);
    },
    dispose() {
      for (const g of geos) g.dispose();
      group.removeFromParent();
    },
  };
}

// ── curtains + sunbeams ───────────────────────────────────────────────────────

const BEAM_VERT = /* glsl */ `
attribute float aFade;
varying float vFade;
void main() { vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vFade;
void main() {
  float a = vFade * uLevel;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** Light shaft from a north window down into the room (+Z) and a warm patch where it lands. */
function beamGeometry(w: WallDef, o: Opening): THREE.BufferGeometry {
  const face = w.c + w.t / 2 + 0.01;
  const sill = o.sill ?? 0.95;
  const head = o.head ?? 2.05;
  const dx = -0.32;
  const dz = 0.95; // per metre of drop
  const top: [number, number, number][] = [
    [o.a + 0.05, head - 0.05, face],
    [o.b - 0.05, head - 0.05, face],
    [o.b - 0.05, sill + 0.05, face],
    [o.a + 0.05, sill + 0.05, face],
  ];
  const land = (p: [number, number, number]): [number, number, number] => [p[0] + dx * p[1], 0.012, p[2] + dz * p[1]];
  const bot = top.map(land);
  const pos: number[] = [];
  const fade: number[] = [];
  const quad = (a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], fa: number, fb: number, fc: number, fd: number) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    fade.push(fa, fb, fc, fa, fc, fd);
  };
  const k = 0.07;
  // shaft sides (double-sided material)
  quad(top[0]!, top[1]!, bot[1]!, bot[0]!, k, k, 0.01, 0.01);
  quad(top[3]!, top[2]!, bot[2]!, bot[3]!, k, k, 0.01, 0.01);
  quad(top[0]!, top[3]!, bot[3]!, bot[0]!, k, k, 0.01, 0.01);
  quad(top[1]!, top[2]!, bot[2]!, bot[1]!, k, k, 0.01, 0.01);
  // landing patch (window-shaped, warm)
  const lift = (p: [number, number, number]): [number, number, number] => [p[0], 0.015, p[2]];
  quad(lift(bot[3]!), lift(bot[2]!), lift(bot[1]!), lift(bot[0]!), 0.2, 0.2, 0.2, 0.2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  g.computeBoundingSphere();
  return g;
}

export interface CurtainSet {
  readonly group: THREE.Group;
  curtains(room: 'twins' | 'heidi'): Curtains;
  update(dt: number): void;
  /** Sun strength for the beams (0..1). */
  setSun(k: number): void;
  dispose(): void;
}

export function buildCurtains(mat: THREE.Material, depth: THREE.Material): CurtainSet {
  const group = new THREE.Group();
  group.name = 'curtains';
  const handles = new Map<'twins' | 'heidi', Curtains>();
  const tickers: ((dt: number) => void)[] = [];
  const disposables: { dispose(): void }[] = [];
  let sun = 0;
  for (const w of WALLS)
    for (const o of w.openings) {
      if (!o.curtains) continue;
      const room = o.curtains;
      const face = w.c + w.t / 2; // north walls: room on the +Z side
      const head = o.head ?? 2.05;
      const sill = o.sill ?? 0.95;
      const top = head + 0.14;
      const bottom = sill - 0.14;
      const spanW = o.b - o.a + 0.3;
      const half = spanW / 2;
      const cols: [number, number] = room === 'twins' ? [PAL.addyMain, PAL.ellieMain] : [PAL.heidiMain, PAL.heidiMain];
      // rod + finials (static, cut with the wall)
      const rb = new GeoBuilder(true, true);
      const rf = new Frame(rb, (o.a + o.b) / 2, 0, face, 0, w.id);
      rf.cyl(0.014, 0.014, spanW + 0.2, 8, PAL.knobBrass, 0, top + 0.03, 0.09, { rot: [0, 0, Math.PI / 2] });
      for (const s of [-1, 1]) rf.ball(0.03, 1, PAL.knobBrass, s * (half + 0.1), top + 0.03, 0.09, { smooth: true });
      for (const s of [-1, 1]) rf.box(0.02, 0.04, 0.09, PAL.knobBrass, s * (half + 0.02), top + 0.03, 0.045);
      const rodGeo = buildWithSeg(rb);
      disposables.push(rodGeo);
      group.add(cutMesh(rodGeo, mat, depth));
      // two panels, pivots at the outer edges; scale.x folds them open
      const pivots: THREE.Group[] = [];
      [-1, 1].forEach((side, i) => {
        const pb = new GeoBuilder(true, true);
        const pf = new Frame(pb, 0, 0, 0, 0, w.id);
        const n = 6;
        const pw = half / n;
        const col = cols[i]!;
        for (let k = 0; k < n; k++) {
          const x = -side * (pw * (k + 0.5));
          const zz = 0.09 + (k % 2 ? 0.03 : 0);
          pf.rbox(pw + 0.012, top - bottom, 0.035, 0.012, k % 2 ? shadeHex(col, 0.92) : col, x, (top + bottom) / 2, zz, {}, 1);
          if (room === 'heidi')
            for (let r = 0; r < 4; r++) pf.ball(0.018, 0, PAL.starPrint, x, bottom + 0.15 + r * ((top - bottom - 0.3) / 3) + (k % 2) * 0.08, zz + 0.02, { ink: false });
        }
        pf.rbox(half + 0.02, 0.08, 0.05, 0.02, shadeHex(col, 0.85), -side * (half / 2), bottom + 0.03, 0.105);
        const g = buildWithSeg(pb);
        disposables.push(g);
        const pivot = new THREE.Group();
        pivot.position.set(side < 0 ? (o.a + o.b) / 2 - half : (o.a + o.b) / 2 + half, 0, face);
        // panel geometry extends from the pivot toward the window centre
        pivot.add(cutMesh(g, mat, depth));
        pivot.scale.x = 1;
        group.add(pivot);
        pivots.push(pivot);
      });
      // Note: panel boxes were authored extending to −side·x from 0 (toward the centre) — pivot at the outer edge.
      // sunbeam
      const beamU = { uColor: { value: new THREE.Color(PAL.sunbeam) }, uLevel: { value: 0 } };
      const beamMat = new THREE.ShaderMaterial({
        name: 'bhd-sunbeam',
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        uniforms: beamU,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const beamGeo = beamGeometry(w, o);
      disposables.push(beamGeo, beamMat);
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.renderOrder = 6;
      beam.frustumCulled = false;
      beam.visible = false;
      group.add(beam);
      let open = 0;
      let target = 0;
      const h: Curtains = {
        room,
        get isOpen() {
          return target > 0.5;
        },
        open() {
          target = 1;
        },
        close() {
          target = 0;
        },
      };
      handles.set(room, h);
      tickers.push((dt) => {
        if (open !== target) open = target > open ? Math.min(target, open + dt * 1.6) : Math.max(target, open - dt * 1.6);
        const k = ease(open);
        for (const p of pivots) p.scale.x = 1 - 0.72 * k;
        const lvl = k * sun;
        beamU.uLevel.value = lvl;
        beam.visible = lvl > 0.01;
      });
    }
  return {
    group,
    curtains: (room) => handles.get(room)!,
    update(dt) {
      for (let i = 0; i < tickers.length; i++) tickers[i]!(dt);
    },
    setSun(k) {
      sun = Math.max(0, Math.min(1, k));
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}
