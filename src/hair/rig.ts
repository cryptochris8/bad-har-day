// ─────────────────────────────────────────────────────────────────────────────
// GirlHairRig — implements HairRig (src/hair/types.ts).
//
// Per frame (allocation-free): head motion → sway sim (hanging nodes) → Catmull-Rom rings
// per lock → brushable proxy surface (undeformed) → gameplay deformations (tangle twist/kink/
// knots/frizz, brush part/flatten/drag, snag wobble) → vertex writes → sprites.
// Draw calls: hair body + hair ink (+ sprites only while any is visible). The proxy is
// invisible (never drawn).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { hairPalette, mix } from './colors';
import { crPoint, crTangent } from './curve';
import type { Chain, HairLayout } from './layout';
import { buildLayout, HANG_HALF_D } from './layout';
import { CELL_FRIZZ, CELL_KNOT, CELL_STAR, CELL_STRAND, CELL_SWIRL, createHairUniforms, hairBodyMaterial, hairInkMaterial, hairSpriteMaterial } from './material';
import type { HairGeometry, TubeRec } from './mesh';
import { buildHairGeometry, writeTube } from './mesh';
import { COLLIDE_BACK, COLLIDE_FRONT, COLLIDE_HEAD, HairSim } from './sim';
import { brushFalloffU, brushFalloffV, brushPartPush, clamp01, colOf, sampleLock, snagEnvelope } from './space';
import type { BrushContact, HairBuildOpts, HairRig } from './types';

const sstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const damp = (a: number, b: number, rate: number, dt: number): number => a + (b - a) * (1 - Math.exp(-rate * dt));
/** Fixed-arity integer hash → 0..1 (no rest-parameter array: called hundreds of times per frame). */
function rnd(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** Runtime state of one lock. */
interface ChainRT {
  readonly c: Chain;
  readonly rec: TubeRec;
  /** First sim node (the pinned junction) or −1 when rigid. */
  readonly simBase: number;
  readonly cps: Float32Array;
  readonly C: Float32Array;
  readonly T: Float32Array;
  readonly S: Float32Array;
  readonly O: Float32Array;
  readonly hw: Float32Array;
  readonly hd: Float32Array;
  readonly twist: Float32Array;
  readonly frizz: Float32Array;
  readonly tg: Float32Array;
  /** Undeformed outer surface point per ring (outer locks → proxy). */
  readonly surf: Float32Array;
  readonly tip: Float32Array;
}

function makeRT(c: Chain, rec: TubeRec, simBase: number): ChainRT {
  const R = c.rings;
  return {
    c,
    rec,
    simBase,
    cps: new Float32Array(c.cp * 3),
    C: new Float32Array(R * 3),
    T: new Float32Array(R * 3),
    S: new Float32Array(R * 3),
    O: new Float32Array(R * 3),
    hw: new Float32Array(R),
    hd: new Float32Array(R),
    twist: new Float32Array(R),
    frizz: new Float32Array(R),
    tg: new Float32Array(R),
    surf: new Float32Array(R * 3),
    tip: new Float32Array(3),
  };
}

// Proxy resolution.
const PV = 16;

// Sprite kinds laid out in one buffer: markers, frizz ×2, flyaways, glints.
const FLYAWAYS = 7;
const GLINTS = 6;

const _m4 = new THREE.Matrix4();
const _d4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _n3 = new THREE.Vector3();
const _tmp = new Float32Array(3);
const _col = new THREE.Color();
const _gd = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _qg = new THREE.Quaternion();
const _qId = new THREE.Quaternion();

export class GirlHairRig implements HairRig {
  readonly root = new THREE.Group();
  readonly cols: number;
  readonly rows: number;
  readonly tangle: Float32Array;
  readonly proxy: THREE.Mesh;
  /** Layout (read-only; exposed for tests / tools). */
  readonly layout: HairLayout;
  readonly geo: HairGeometry;
  readonly bodyMesh: THREE.Mesh;
  readonly inkMesh: THREE.Mesh;
  readonly spriteMesh: THREE.Mesh;
  readonly sim: HairSim;

  private readonly uniforms = createHairUniforms();
  private readonly bodyMat: THREE.MeshToonMaterial;
  private readonly outer: ChainRT[] = [];
  private readonly front: ChainRT[] = [];
  private readonly rigid: ChainRT[] = [];
  private readonly tufts: ChainRT[] = [];
  private readonly under: { rec: TubeRec; C: Float32Array; T: Float32Array; S: Float32Array; O: Float32Array; hw: Float32Array; hd: Float32Array; frizz: Float32Array; tg: Float32Array }[] = [];

  private readonly target: Float32Array;
  private readonly display: Float32Array;
  private tangleDirty = true;
  private bedTarget = 0;
  private bed = 0;
  private bedApplied = -1;
  private shineTarget = 1;
  private shine = 1;
  private markers: 'off' | 'soft' | 'inspect' = 'off';
  private readonly brush: BrushContact = { u: 0.5, v: 0.5, pressure: 0, width: 0.22, du: 0, dv: 0 };
  private brushTarget = 0;
  private brushLive = false;
  private readonly snagT: Float32Array;
  private time = 0;
  private dirty = true;
  private hasPrev = false;
  private readonly prevM = new THREE.Matrix4();
  private readonly headR: THREE.Vector3;
  /** Hanging-node rest positions in the head frame (bedhead-lerped), before the gravity alignment. */
  private readonly restBase: Float32Array;
  /** Rotation that keeps the hanging rest shape hanging "down" in the world when the head tilts. */
  private readonly qGrav = new THREE.Quaternion();

  // proxy grid
  private readonly PU: number;
  private readonly proxyPos: Float32Array;
  private readonly proxyNrm: Float32Array;

  // sprites
  private readonly spriteCount: number;
  private readonly sPos: Float32Array;
  private readonly sParam: Float32Array;
  private readonly sTint: Float32Array;
  private readonly sAdd: Float32Array;
  private readonly sAlpha: Float32Array;
  private readonly frizzHex: number;
  private readonly spriteSeed: number;
  private disposed = false;

  constructor(opts: HairBuildOpts) {
    const L = (this.layout = buildLayout(opts));
    this.cols = L.cols;
    this.rows = L.rows;
    const n = this.cols * this.rows;
    this.tangle = new Float32Array(n);
    this.target = new Float32Array(n);
    this.display = new Float32Array(n);
    this.snagT = new Float32Array(n).fill(99);
    this.root.name = 'girlHair';
    const pal = hairPalette(opts.color);
    this.frizzHex = pal.frizz;
    this.spriteSeed = opts.seed | 0;

    // Geometry + materials.
    this.geo = buildHairGeometry(L, pal);
    const u = this.uniforms;
    u.uSheen.value.setHex(pal.sheen);
    u.uRoot.value.setHex(pal.root);
    u.uDull.value.setHex(pal.dull);
    this.headR = u.uHeadR.value.set(L.fit.rx, L.fit.ry, L.fit.rz);
    u.uPart.value.set(L.partX, -0.03, L.fit.rz * 0.95);
    this.bodyMat = hairBodyMaterial(u);
    this.bodyMesh = new THREE.Mesh(this.geo.geometry, this.bodyMat);
    this.bodyMesh.name = 'hairBody';
    this.bodyMesh.castShadow = true;
    this.bodyMesh.frustumCulled = false;
    this.inkMesh = new THREE.Mesh(this.geo.inkGeometry, hairInkMaterial());
    this.inkMesh.name = 'hairInk';
    this.inkMesh.frustumCulled = false;
    this.root.add(this.bodyMesh, this.inkMesh);

    // Sim nodes: hanging parts of the outer + front locks.
    let nodes = 0;
    const simBases: number[] = [];
    for (const c of [...L.outer, ...L.front]) {
      simBases.push(nodes);
      nodes += c.cp - c.pinned + 1;
    }
    const fit = L.fit;
    this.sim = new HairSim(nodes, {
      rx: fit.rx,
      ry: fit.ry,
      rz: fit.rz,
      neckY: fit.neckY,
      backZ: fit.backZ,
      shoulderY: fit.shoulderY,
      shoulderHalfWidth: fit.shoulderHalfWidth,
      shoulderX: L.body.shoulderX,
      shoulderCY: L.body.shoulderCY,
      shoulderR: L.body.shoulderR,
      torsoZ: L.body.torsoZ,
      chestZ: L.body.chestZ,
    });
    this.restBase = new Float32Array(nodes * 3);
    let k = 0;
    L.outer.forEach((c, i) => this.outer.push(makeRT(c, this.geo.outer[i]!, simBases[k++]!)));
    L.front.forEach((c, i) => this.front.push(makeRT(c, this.geo.front[i]!, simBases[k++]!)));
    L.bangs.forEach((c, i) => this.rigid.push(makeRT(c, this.geo.bangs[i]!, -1)));
    L.tufts.forEach((c, i) => this.tufts.push(makeRT(c, this.geo.tufts[i]!, -1)));
    for (const [list, frontLocks] of [
      [this.outer, false],
      [this.front, true],
    ] as const) {
      list.forEach((rt, ci) => {
        const count = rt.c.cp - rt.c.pinned + 1;
        const style = frontLocks ? L.frontStyle[ci]! : 'behind';
        for (let j = 0; j < count; j++) {
          const i = rt.simBase + j;
          this.sim.parent[i] = j === 0 ? -1 : i - 1;
          this.sim.pinned[i] = j === 0 ? 1 : 0;
          const f = count > 1 ? j / (count - 1) : 0;
          this.sim.shape[i] = j === 0 ? 1 : 0.13 * Math.pow(1 - f, 1.6) + 0.009;
          this.sim.margin[i] = (frontLocks ? 0.012 : HANG_HALF_D) + 0.004;
          this.sim.flags[i] = COLLIDE_HEAD | (frontLocks && style === 'front' ? COLLIDE_FRONT : COLLIDE_BACK);
        }
      });
    }
    L.under.forEach((ul, i) => {
      const R = ul.rings;
      this.under.push({
        rec: this.geo.under[i]!,
        C: new Float32Array(R * 3),
        T: new Float32Array(R * 3),
        S: new Float32Array(R * 3),
        O: new Float32Array(R * 3),
        hw: new Float32Array(R),
        hd: new Float32Array(R),
        frizz: new Float32Array(R),
        tg: new Float32Array(R),
      });
    });

    // Proxy (hit-test surface; uv = hair space).
    this.PU = L.outer.length * 2 + 1;
    const PU = this.PU;
    this.proxyPos = new Float32Array(PU * PV * 3);
    this.proxyNrm = new Float32Array(PU * PV * 3);
    const uv = new Float32Array(PU * PV * 2);
    const idx: number[] = [];
    for (let b = 0; b < PV; b++)
      for (let a = 0; a < PU; a++) {
        uv[(b * PU + a) * 2] = a / (PU - 1);
        uv[(b * PU + a) * 2 + 1] = b / (PV - 1);
      }
    for (let b = 0; b < PV - 1; b++)
      for (let a = 0; a < PU - 1; a++) {
        const i00 = b * PU + a;
        const i10 = i00 + 1;
        const i01 = i00 + PU;
        const i11 = i01 + 1;
        idx.push(i00, i10, i01, i11, i01, i10);
      }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.proxyPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    pg.setIndex(idx);
    const span = fit.ry - L.tipY;
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, (fit.ry + L.tipY) / 2, -0.05), span / 2 + 0.4);
    this.proxy = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    this.proxy.name = 'hairProxy';
    this.proxy.castShadow = false;
    this.root.add(this.proxy);

    // Sprites.
    const cells = n;
    this.spriteCount = cells * 3 + FLYAWAYS + GLINTS;
    const S = this.spriteCount;
    this.sPos = new Float32Array(S * 4 * 3);
    this.sParam = new Float32Array(S * 4 * 4);
    this.sTint = new Float32Array(S * 4 * 3);
    this.sAdd = new Float32Array(S * 4);
    this.sAlpha = new Float32Array(S);
    const corner = new Float32Array(S * 4 * 2);
    const sIdx = new Uint16Array(S * 6);
    for (let i = 0; i < S; i++) {
      corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      sIdx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    sg.setAttribute('aParam', new THREE.BufferAttribute(this.sParam, 4).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aTint', new THREE.BufferAttribute(this.sTint, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aAdd', new THREE.BufferAttribute(this.sAdd, 1));
    sg.setIndex(new THREE.BufferAttribute(sIdx, 1));
    this.spriteMesh = new THREE.Mesh(sg, hairSpriteMaterial());
    this.spriteMesh.name = 'hairSprites';
    this.spriteMesh.frustumCulled = false;
    this.spriteMesh.renderOrder = 2;
    this.spriteMesh.visible = false;
    this.root.add(this.spriteMesh);
    // Static sprite kinds.
    for (let i = 0; i < S; i++) {
      const kind = this.spriteKind(i);
      const add = kind === 4 ? 1 : 0;
      for (let c = 0; c < 4; c++) {
        this.sAdd[i * 4 + c] = add;
        this.sParam[(i * 4 + c) * 4 + 3] = kind === 0 ? CELL_SWIRL : kind === 1 ? CELL_FRIZZ : kind === 2 ? CELL_KNOT : kind === 3 ? CELL_STRAND : CELL_STAR;
      }
    }

    // Static: cap normals + first full evaluation.
    const cap = L.cap;
    this.geo.nrm.set(cap.nrm, 0);
    this.applyBedhead();
    this.sim.reset();
    this.evaluate(0);
  }

  /** 0 marker, 1 frizz squiggle, 2 knot scribble (tangled cluster), 3 flyaway, 4 glint. */
  private spriteKind(i: number): number {
    const n = this.cols * this.rows;
    if (i < n) return 0;
    if (i < n * 2) return 1;
    if (i < n * 3) return 2;
    if (i < n * 3 + FLYAWAYS) return 3;
    return 4;
  }

  // ── contract API ──────────────────────────────────────────────────────────

  commit(): void {
    for (let i = 0; i < this.target.length; i++) {
      const v = this.tangle[i]!;
      this.target[i] = v > 1 ? 1 : v < 0 || !(v === v) ? 0 : v;
    }
    this.dirty = true;
  }

  setBedhead(v: number): void {
    this.bedTarget = clamp01(v);
    this.dirty = true;
  }

  setShine(v: number): void {
    this.shineTarget = clamp01(v);
    this.dirty = true;
  }

  setKnotMarkers(mode: 'off' | 'soft' | 'inspect'): void {
    this.markers = mode;
    this.dirty = true;
  }

  setBrush(contact: BrushContact | null): void {
    if (!contact) {
      this.brushTarget = 0;
    } else {
      const b = this.brush;
      if (!this.brushLive) {
        b.u = contact.u;
        b.v = contact.v;
      }
      b.u = contact.u;
      b.v = contact.v;
      b.width = Math.max(0.02, contact.width);
      b.du = Number.isFinite(contact.du) ? contact.du : 0;
      b.dv = Number.isFinite(contact.dv) ? contact.dv : 0;
      this.brushTarget = clamp01(contact.pressure);
      this.brushLive = true;
    }
    this.dirty = true;
  }

  snag(col: number, row: number): void {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return;
    this.snagT[row * this.cols + col] = 0;
    // A sideways kick to the lock's hanging nodes.
    const cu = (col + 0.5) / this.cols;
    for (let _i1 = 0; _i1 < this.outer.length; _i1++) {
      const rt = this.outer[_i1]!;
      if (colOf(rt.c.u, this.cols) !== col) continue;
      const count = rt.c.cp - rt.c.pinned + 1;
      for (let j = 1; j < count; j++) {
        const s = (j % 2 === 0 ? 1 : -1) * 0.004;
        this.sim.kick(rt.simBase + j, s * (cu < 0.5 ? 1 : -1), 0.001, -0.002);
      }
    }
    this.dirty = true;
  }

  surfacePoint(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    this.gridSample(this.proxyPos, u, v, out);
    return out.applyMatrix4(this.root.matrixWorld);
  }

  surfaceNormal(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    this.gridSample(this.proxyNrm, u, v, out);
    return out.transformDirection(this.root.matrixWorld);
  }

  /** Head-space surface point (no world transform) — same triangulation as the proxy. */
  surfacePointLocal(u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    return this.gridSample(this.proxyPos, u, v, out);
  }

  update(dt: number): void {
    if (this.disposed) return;
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    if (step <= 0 && !this.dirty) return;
    this.dirty = false;
    this.time += step;
    this.uniforms.uTime.value = this.time;

    // Head motion → sim frame transfer.
    this.root.updateWorldMatrix(true, false);
    const M = this.root.matrixWorld;
    _m4.copy(M).invert();
    if (!this.hasPrev) {
      this.hasPrev = true;
      this.prevM.copy(M);
      this.sim.reset();
    } else if (step > 0) {
      _d4.multiplyMatrices(_m4, this.prevM);
      const e = _d4.elements;
      // Tip test point (0, −0.4, 0): how far did it jump in head space?
      const jx = e[4]! * -0.4 + e[12]!;
      const jy = e[5]! * -0.4 + e[13]! + 0.4;
      const jz = e[6]! * -0.4 + e[14]!;
      if (Math.sqrt(e[12]! * e[12]! + e[13]! * e[13]! + e[14]! * e[14]!) > 0.6 || Math.sqrt(jx * jx + jy * jy + jz * jz) > 0.7) this.sim.reset();
      else this.sim.transfer(e);
      this.prevM.copy(M);
    }
    const me = _m4.elements;
    const gx = me[4]! * -9.81;
    const gy = me[5]! * -9.81;
    const gz = me[6]! * -9.81;
    // Keep the styled fall hanging with gravity when the head tilts (hair flips, looking up/down, lying down).
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
    if (gl > 1e-6) {
      _gd.set(gx / gl, gy / gl, gz / gl);
      _qg.setFromUnitVectors(_down, _gd);
      _qg.slerpQuaternions(_qId, _qg, 0.9);
      if (this.qGrav.angleTo(_qg) > 0.003) {
        this.qGrav.copy(_qg);
        this.orientRest();
      }
    }

    // Animated gameplay values.
    if (step > 0) {
      this.bed = damp(this.bed, this.bedTarget, 3.5, step);
      if (Math.abs(this.bed - this.bedTarget) < 1e-4) this.bed = this.bedTarget;
      this.shine = damp(this.shine, this.shineTarget, 3, step);
      if (Math.abs(this.shine - this.shineTarget) < 1e-3) this.shine = this.shineTarget;
      let moving = false;
      for (let i = 0; i < this.display.length; i++) {
        const a = this.display[i]!;
        const b = this.target[i]!;
        if (a !== b) {
          const nv = Math.abs(a - b) < 2e-4 ? b : damp(a, b, 6, step);
          this.display[i] = nv;
          moving = true;
        }
        if (this.snagT[i]! < 5) this.snagT[i]! += step;
      }
      if (moving) this.tangleDirty = true;
      this.brush.pressure = damp(this.brush.pressure, this.brushTarget, this.brushTarget > this.brush.pressure ? 18 : 9, step);
      if (this.brushTarget === 0 && this.brush.pressure < 0.01) {
        this.brush.pressure = 0;
        this.brushLive = false;
      }
      if (this.bed !== this.bedTarget || this.shine !== this.shineTarget || moving || this.brushLive) this.dirty = true;
    } else {
      // Paused with pending changes: jump straight to targets.
      this.bed = this.bedTarget;
      this.shine = this.shineTarget;
      this.display.set(this.target);
      this.tangleDirty = true;
      this.brush.pressure = this.brushTarget;
    }
    this.uniforms.uShine.value = this.shine;
    if (Math.abs(this.bed - this.bedApplied) > 1e-4) this.applyBedhead();

    if (step > 0) {
      this.brushKicks();
      this.sim.advance(step, gx, gy, gz);
    }
    this.evaluate(step);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geo.geometry.dispose();
    this.geo.inkGeometry.dispose();
    this.bodyMat.dispose();
    this.proxy.geometry.dispose();
    (this.proxy.material as THREE.Material).dispose();
    this.spriteMesh.geometry.dispose();
    this.root.removeFromParent();
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Displayed (animated) tangle of a cell. */
  displayTangle(i: number): number {
    return this.display[i] ?? 0;
  }

  /** Current displayed bedhead / shine (animated values). */
  get state(): { bedhead: number; shine: number; brush: number } {
    return { bedhead: this.bed, shine: this.shine, brush: this.brush.pressure };
  }

  private applyBedhead(): void {
    const b = this.bed;
    this.bedApplied = b;
    const cap = this.layout.cap;
    const pos = this.geo.pos;
    for (let i = 0; i < cap.count * 3; i++) pos[i] = cap.pos0[i]! + (cap.pos1[i]! - cap.pos0[i]!) * b;
    for (let i = 0; i < this.outer.length; i++) this.lerpCps(this.outer[i]!, b);
    for (let i = 0; i < this.front.length; i++) this.lerpCps(this.front[i]!, b);
    for (let i = 0; i < this.rigid.length; i++) this.lerpCps(this.rigid[i]!, b);
    const g = Math.sqrt(b); // tufts pop out early so half-bedhead already reads
    for (let i = 0; i < this.tufts.length; i++) this.lerpCps(this.tufts[i]!, g);
    this.orientRest();
    this.sim.updateRestLengths();
  }

  /** Control points from the bedhead lerp; hanging ones go to the (unrotated) sim rest base. */
  private lerpCps(rt: ChainRT, b: number): void {
    const c = rt.c;
    for (let i = 0; i < c.cp * 3; i++) rt.cps[i] = c.rest0[i]! + (c.rest1[i]! - c.rest0[i]!) * b;
    if (rt.simBase < 0) return;
    const r = this.restBase;
    for (let j = 0; j <= c.cp - c.pinned; j++) {
      const cp = c.pinned - 1 + j;
      r[(rt.simBase + j) * 3] = rt.cps[cp * 3]!;
      r[(rt.simBase + j) * 3 + 1] = rt.cps[cp * 3 + 1]!;
      r[(rt.simBase + j) * 3 + 2] = rt.cps[cp * 3 + 2]!;
    }
  }

  /** sim.rest = each lock's hanging rest shape rotated about its junction by the gravity alignment. */
  private orientRest(): void {
    const base = this.restBase;
    const rest = this.sim.rest;
    const q = this.qGrav;
    for (let list = 0; list < 2; list++) {
      const chains = list === 0 ? this.outer : this.front;
      for (let c = 0; c < chains.length; c++) {
        const rt = chains[c]!;
        const count = rt.c.cp - rt.c.pinned + 1;
        const j0 = rt.simBase * 3;
        const jx = base[j0]!;
        const jy = base[j0 + 1]!;
        const jz = base[j0 + 2]!;
        rest[j0] = jx;
        rest[j0 + 1] = jy;
        rest[j0 + 2] = jz;
        for (let j = 1; j < count; j++) {
          const o = (rt.simBase + j) * 3;
          _v3.set(base[o]! - jx, base[o + 1]! - jy, base[o + 2]! - jz).applyQuaternion(q);
          rest[o] = jx + _v3.x;
          rest[o + 1] = jy + _v3.y;
          rest[o + 2] = jz + _v3.z;
        }
      }
    }
  }

  /** Brush drag → small velocity kicks on the hanging nodes it touches (follow-through swing). */
  private brushKicks(): void {
    const b = this.brush;
    if (b.pressure <= 0.02) return;
    const hwU = b.width / 2;
    for (let _i2 = 0; _i2 < this.outer.length; _i2++) {
      const rt = this.outer[_i2]!;
      const wu = brushFalloffU(rt.c.u - b.u, hwU * 1.3);
      if (wu <= 0) continue;
      const count = rt.c.cp - rt.c.pinned + 1;
      for (let j = 1; j < count; j++) {
        // v of node j ≈ ringV at its spline parameter.
        const t = rt.c.pinned - 1 + j;
        let v = 1;
        for (let r = 0; r < rt.c.rings; r++)
          if (rt.c.ringT[r]! >= t - 1e-4) {
            v = rt.c.ringV[r]!;
            break;
          }
        const w = wu * brushFalloffV(v - b.v, 0.12, 0.3) * b.pressure;
        if (w <= 0) continue;
        const k = 0.00005 * w;
        // du > 0 → toward −X (u grows toward head-space −X); dv > 0 → down.
        this.sim.kick(rt.simBase + j, -b.du * k, -Math.abs(b.dv) * k * 0.5, -0.0003 * w);
      }
    }
  }

  /** Full evaluation: rings, proxy, deformations, vertex writes, sprites. Split into small stages so the
   *  JIT inlines the math helpers (keeps the per-frame path free of boxed-number garbage). */
  private evaluate(step: number): void {
    const b = this.bed;
    for (let i = 0; i < this.outer.length; i++) this.outerBase(this.outer[i]!, b);
    this.updateProxy();
    for (let i = 0; i < this.outer.length; i++) this.deformOuter(this.outer[i]!, b);
    for (let k = 0; k < this.under.length; k++) this.writeUnder(k);
    for (let i = 0; i < this.front.length; i++) this.writeSimple(this.front[i]!, b, 1, 0.004, 0.5);
    for (let i = 0; i < this.rigid.length; i++) this.writeSimple(this.rigid[i]!, b, 1, 0.003, 0);
    const grow = sstep(0.02, 0.35, b); // bedhead tufts grow out
    for (let i = 0; i < this.tufts.length; i++) this.writeSimple(this.tufts[i]!, b, grow, 0.003, 0);
    if (this.tangleDirty) this.writeTangleAttr();
    const g = this.geo.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    this.updateSprites(step, this.time);
  }

  /** Outer lock rings + its undeformed outer surface (for the proxy). */
  private outerBase(rt: ChainRT, b: number): void {
    this.fillCps(rt);
    this.rings(rt, b, 1);
    const c = rt.c;
    for (let r = 0; r < c.rings; r++) {
      const o = r * 3;
      const k = rt.hd[r]! * 1.05;
      rt.surf[o] = rt.C[o]! + rt.O[o]! * k;
      rt.surf[o + 1] = rt.C[o + 1]! + rt.O[o + 1]! * k;
      rt.surf[o + 2] = rt.C[o + 2]! + rt.O[o + 2]! * k;
    }
    const lo = (c.rings - 1) * 3;
    const tl = rt.hw[c.rings - 1]! * c.tipK;
    rt.tip[0] = rt.C[lo]! + rt.T[lo]! * tl;
    rt.tip[1] = rt.C[lo + 1]! + rt.T[lo + 1]! * tl;
    rt.tip[2] = rt.C[lo + 2]! + rt.T[lo + 2]! * tl;
  }

  /** Gameplay deformations on one outer lock (tangle twist/kink/knots/frizz, snag wobble, brush), then write it. */
  private deformOuter(rt: ChainRT, b: number): void {
    const c = rt.c;
    const cols = this.cols;
    const rows = this.rows;
    const col = colOf(c.u, cols);
    for (let r = 0; r < c.rings; r++) {
      const v = c.ringV[r]!;
      const tg = sampleLock(this.display, cols, rows, c.u, v);
      rt.tg[r] = tg;
      const o = r * 3;
      // Knot blobs sit at section centres.
      const fr = v * rows;
      const dc = fr - Math.floor(fr) - 0.5;
      const knot = tg * (0.25 + 0.55 * Math.exp(-(dc * dc) / 0.03));
      rt.twist[r] = tg * 1.15 * Math.sin(v * 19 + c.rnd * 6.3);
      rt.frizz[r] = tg * 0.008 + knot * 0.012 + b * 0.0035;
      rt.hw[r]! *= 1 + knot * 0.45;
      rt.hd[r]! *= 1 + knot * 0.9;
      let sk = tg * 0.012 * Math.sin(v * 23 + c.rnd * 9);
      const okk = tg * 0.008 * Math.cos(v * 29 + c.rnd * 4) + knot * 0.006;
      // Snag wobble (the cell this ring is in).
      const row = Math.min(rows - 1, Math.floor(v * rows));
      const st = this.snagT[row * cols + col]!;
      const env = snagEnvelope(st);
      if (env > 0) sk += Math.sin(st * 55) * env * 0.016;
      rt.C[o]! += rt.S[o]! * sk + rt.O[o]! * okk;
      rt.C[o + 1]! += rt.S[o + 1]! * sk + rt.O[o + 1]! * okk;
      rt.C[o + 2]! += rt.S[o + 2]! * sk + rt.O[o + 2]! * okk;
      if (this.brush.pressure > 0.005) this.brushRing(rt, r, v);
    }
    writeTube(this.geo, rt.rec, rt.C, rt.T, rt.S, rt.O, rt.hw, rt.hd, rt.twist, rt.frizz, c.tipK);
  }

  /** Brush contact on one ring: flatten + part + drag along the stroke. */
  private brushRing(rt: ChainRT, r: number, v: number): void {
    const br = this.brush;
    const hwU = br.width / 2;
    const du = rt.c.u - br.u;
    const inf = br.pressure * brushFalloffU(du, hwU) * brushFalloffV(v - br.v);
    const push = brushPartPush(du, hwU) * br.pressure * brushFalloffV(v - br.v, 0.1, 0.22);
    if (inf <= 0 && push === 0) return;
    const o = r * 3;
    const press = -inf * rt.hd[r]! * 1.6;
    // +u = -side (u grows toward head-space -X, side ~ +X for a downward lock).
    const side = -push * 0.022 - Math.max(-1, Math.min(1, br.du * 0.8)) * inf * 0.012;
    const drag = Math.max(-1, Math.min(1, br.dv * 0.8)) * inf * 0.014;
    rt.C[o]! += rt.O[o]! * press + rt.S[o]! * side + rt.T[o]! * drag;
    rt.C[o + 1]! += rt.O[o + 1]! * press + rt.S[o + 1]! * side + rt.T[o + 1]! * drag;
    rt.C[o + 2]! += rt.O[o + 2]! * press + rt.S[o + 2]! * side + rt.T[o + 2]! * drag;
    // Combed flat and a touch narrower (bristles gather the lock) -> visible parting lines.
    rt.hd[r]! *= 1 - 0.55 * inf;
    rt.hw[r]! *= 1 - 0.12 * inf;
    rt.twist[r]! *= 1 - inf;
    rt.frizz[r]! *= 1 - 0.8 * inf;
  }

  /** Under lock k: between its outer neighbours, tucked in behind them. */
  private writeUnder(k: number): void {
    const ul = this.layout.under[k]!;
    const U = this.under[k]!;
    const A = this.outer[ul.left]!;
    const B = this.outer[ul.right]!;
    for (let r = 0; r < ul.rings; r++) {
      const ra = ul.ringStart + r;
      const o = r * 3;
      const oa = ra * 3;
      for (let a = 0; a < 3; a++) {
        U.O[o + a] = A.O[oa + a]! + B.O[oa + a]!;
        U.T[o + a] = A.T[oa + a]! + B.T[oa + a]!;
        U.S[o + a] = A.S[oa + a]! + B.S[oa + a]!;
      }
      normalize3(U.O, o);
      normalize3(U.T, o);
      normalize3(U.S, o);
      const hd = (A.hd[ra]! + B.hd[ra]!) * 0.5;
      const inset = ul.inset + hd * 0.35;
      for (let a = 0; a < 3; a++) U.C[o + a] = (A.C[oa + a]! + B.C[oa + a]!) * 0.5 - U.O[o + a]! * inset;
      U.hw[r] = (A.hw[ra]! + B.hw[ra]!) * 0.5 * ul.widthK;
      U.hd[r] = hd * 0.8;
      U.frizz[r] = (A.frizz[ra]! + B.frizz[ra]!) * 0.4;
    }
    writeTube(this.geo, U.rec, U.C, U.T, U.S, U.O, U.hw, U.hd, null, U.frizz, 1.3);
  }

  /** Face-framing locks, bangs, tufts: rings + bedhead frizz (+ a messy twist) and write. */
  private writeSimple(rt: ChainRT, b: number, widthScale: number, frizzK: number, twistK: number): void {
    this.fillCps(rt);
    this.rings(rt, b, widthScale);
    const c = rt.c;
    for (let r = 0; r < c.rings; r++) {
      rt.frizz[r] = b * frizzK;
      rt.twist[r] = twistK > 0 ? b * twistK * Math.sin(c.ringV[r]! * 14 + c.rnd * 5) : 0;
    }
    writeTube(this.geo, rt.rec, rt.C, rt.T, rt.S, rt.O, rt.hw, rt.hd, twistK > 0 ? rt.twist : null, rt.frizz, c.tipK);
  }

  /** Per-vertex tangle attribute (only when the displayed field changed). */
  private writeTangleAttr(): void {
    this.tangleDirty = false;
    const ta = this.geo.tangle;
    for (let i = 0; i < this.outer.length; i++) {
      const rt = this.outer[i]!;
      const rec = rt.rec;
      for (let r = 0; r < rec.rings; r++) {
        const v = rt.tg[r]!;
        for (let j = 0; j < rec.sides; j++) ta[rec.v0 + r * rec.sides + j] = v;
      }
      ta[rec.v0 + rec.rings * rec.sides] = rt.tg[rec.rings - 1]!;
    }
    for (let k = 0; k < this.under.length; k++) {
      const ul = this.layout.under[k]!;
      const rec = this.under[k]!.rec;
      const A = this.outer[ul.left]!;
      const B = this.outer[ul.right]!;
      for (let r = 0; r < rec.rings; r++) {
        const v = (A.tg[ul.ringStart + r]! + B.tg[ul.ringStart + r]!) * 0.5;
        for (let j = 0; j < rec.sides; j++) ta[rec.v0 + r * rec.sides + j] = v;
      }
    }
    (this.geo.geometry.getAttribute('aTangle') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Control points: rigid ones from the (bedhead-lerped) rest, hanging ones from the sim. */
  private fillCps(rt: ChainRT): void {
    if (rt.simBase < 0) return;
    const c = rt.c;
    const p = this.sim.pos;
    for (let j = 1; j <= c.cp - c.pinned; j++) {
      const cp = c.pinned - 1 + j;
      const s = (rt.simBase + j) * 3;
      rt.cps[cp * 3] = p[s]!;
      rt.cps[cp * 3 + 1] = p[s + 1]!;
      rt.cps[cp * 3 + 2] = p[s + 2]!;
    }
  }

  /** Ring centres, tangents, frames, widths (bedhead-lerped, × widthScale). */
  private rings(rt: ChainRT, b: number, widthScale: number): void {
    const c = rt.c;
    let psx = 1;
    let psy = 0;
    let psz = 0;
    for (let r = 0; r < c.rings; r++) {
      const o = r * 3;
      crPoint(rt.cps, 0, c.cp, c.ringT[r]!, rt.C, o);
      crTangent(rt.cps, 0, c.cp, c.ringT[r]!, rt.T, o);
      normalize3(rt.T, o);
      const tx = rt.T[o]!;
      const ty = rt.T[o + 1]!;
      const tz = rt.T[o + 2]!;
      const rx = c.out0[o]!;
      const ry = c.out0[o + 1]!;
      const rz = c.out0[o + 2]!;
      // side = T × out_ref
      let sx = ty * rz - tz * ry;
      let sy = tz * rx - tx * rz;
      let sz = tx * ry - ty * rx;
      const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sl < 0.08) {
        sx = psx;
        sy = psy;
        sz = psz;
      } else {
        sx /= sl;
        sy /= sl;
        sz /= sl;
      }
      psx = sx;
      psy = sy;
      psz = sz;
      rt.S[o] = sx;
      rt.S[o + 1] = sy;
      rt.S[o + 2] = sz;
      // out = side × T
      rt.O[o] = sy * tz - sz * ty;
      rt.O[o + 1] = sz * tx - sx * tz;
      rt.O[o + 2] = sx * ty - sy * tx;
      normalize3(rt.O, o);
      rt.hw[r] = (c.halfW0[r]! + (c.halfW1[r]! - c.halfW0[r]!) * b) * widthScale;
      rt.hd[r] = (c.halfD0[r]! + (c.halfD1[r]! - c.halfD0[r]!) * b) * widthScale;
    }
  }

  /** Rebuild the proxy grid (head space) from the outer locks' undeformed surfaces. */
  private updateProxy(): void {
    const PU = this.PU;
    const N = this.outer.length;
    const P = this.proxyPos;
    const Nn = this.proxyNrm;
    for (let bI = 0; bI < PV; bI++) {
      const v = bI / (PV - 1);
      for (let a = 0; a < PU; a++) {
        const u = a / (PU - 1);
        const o = (bI * PU + a) * 3;
        const f = u * N - 0.5;
        if (f <= 0 || f >= N - 1) {
          // Outer edge: from the edge lock's side edge to its centre surface.
          const edge = f <= 0 ? 0 : N - 1;
          const rt = this.outer[edge]!;
          const k = f <= 0 ? 1 + f / 0.5 : 1 - (f - (N - 1)) / 0.5; // 0 at the proxy edge, 1 at the lock centre
          const sgn = f <= 0 ? 1 : -1; // u 0 side = +side direction
          this.lockSurface(rt, v, P, o, Nn);
          const r = this.ringAt(rt, v);
          const e = (1 - clamp01(k)) * rt.hw[r]! * 1.02;
          P[o]! += rt.S[r * 3]! * sgn * e - rt.O[r * 3]! * e * 0.35;
          P[o + 1]! += rt.S[r * 3 + 1]! * sgn * e - rt.O[r * 3 + 1]! * e * 0.35;
          P[o + 2]! += rt.S[r * 3 + 2]! * sgn * e - rt.O[r * 3 + 2]! * e * 0.35;
        } else {
          const i0 = Math.floor(f);
          const w = f - i0;
          this.lockSurface(this.outer[i0]!, v, P, o, Nn);
          const x = P[o]!;
          const y = P[o + 1]!;
          const z = P[o + 2]!;
          const nx = Nn[o]!;
          const ny = Nn[o + 1]!;
          const nz = Nn[o + 2]!;
          this.lockSurface(this.outer[i0 + 1]!, v, P, o, Nn);
          P[o] = x + (P[o]! - x) * w;
          P[o + 1] = y + (P[o + 1]! - y) * w;
          P[o + 2] = z + (P[o + 2]! - z) * w;
          Nn[o] = nx + (Nn[o]! - nx) * w;
          Nn[o + 1] = ny + (Nn[o + 1]! - ny) * w;
          Nn[o + 2] = nz + (Nn[o + 2]! - nz) * w;
        }
        normalize3(Nn, o);
      }
    }
    (this.proxy.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Index of the ring at or below v on a lock. */
  private ringAt(rt: ChainRT, v: number): number {
    const R = rt.c.rings;
    for (let r = R - 1; r >= 0; r--) if (rt.c.ringV[r]! <= v) return r;
    return 0;
  }

  /** Undeformed outer surface of one lock at length v → P[o..], normal → N[o..]. */
  private lockSurface(rt: ChainRT, v: number, P: Float32Array, o: number, N: Float32Array): void {
    const c = rt.c;
    const R = c.rings;
    const r = this.ringAt(rt, v);
    const s = rt.surf;
    if (r >= R - 1) {
      const v0 = c.ringV[R - 1]!;
      const k = v0 >= 1 ? 1 : clamp01((v - v0) / (1 - v0));
      const q = (R - 1) * 3;
      // Toward the tip point, pulled in so the surface stays on the rounded end.
      P[o] = s[q]! + (rt.tip[0]! - s[q]!) * k * 0.85;
      P[o + 1] = s[q + 1]! + (rt.tip[1]! - s[q + 1]!) * k * 0.85;
      P[o + 2] = s[q + 2]! + (rt.tip[2]! - s[q + 2]!) * k * 0.85;
      N[o] = rt.O[q]!;
      N[o + 1] = rt.O[q + 1]!;
      N[o + 2] = rt.O[q + 2]!;
      return;
    }
    const v0 = c.ringV[r]!;
    const v1 = c.ringV[r + 1]!;
    const k = v1 > v0 ? clamp01((v - v0) / (v1 - v0)) : 0;
    const a = r * 3;
    const b = a + 3;
    P[o] = s[a]! + (s[b]! - s[a]!) * k;
    P[o + 1] = s[a + 1]! + (s[b + 1]! - s[a + 1]!) * k;
    P[o + 2] = s[a + 2]! + (s[b + 2]! - s[a + 2]!) * k;
    N[o] = rt.O[a]! + (rt.O[b]! - rt.O[a]!) * k;
    N[o + 1] = rt.O[a + 1]! + (rt.O[b + 1]! - rt.O[a + 1]!) * k;
    N[o + 2] = rt.O[a + 2]! + (rt.O[b + 2]! - rt.O[a + 2]!) * k;
  }

  /** Triangle-exact interpolation over the proxy grid (matches the raycast's barycentric uv). */
  private gridSample(arr: Float32Array, u: number, v: number, out: THREE.Vector3): THREE.Vector3 {
    const PU = this.PU;
    const fu = clamp01(u) * (PU - 1);
    const fv = clamp01(v) * (PV - 1);
    const a = Math.min(PU - 2, Math.floor(fu));
    const b = Math.min(PV - 2, Math.floor(fv));
    const x = fu - a;
    const y = fv - b;
    const i00 = (b * PU + a) * 3;
    const i10 = i00 + 3;
    const i01 = i00 + PU * 3;
    const i11 = i01 + 3;
    if (x + y <= 1) {
      out.set(
        arr[i00]! + (arr[i10]! - arr[i00]!) * x + (arr[i01]! - arr[i00]!) * y,
        arr[i00 + 1]! + (arr[i10 + 1]! - arr[i00 + 1]!) * x + (arr[i01 + 1]! - arr[i00 + 1]!) * y,
        arr[i00 + 2]! + (arr[i10 + 2]! - arr[i00 + 2]!) * x + (arr[i01 + 2]! - arr[i00 + 2]!) * y,
      );
    } else {
      const X = 1 - x;
      const Y = 1 - y;
      out.set(
        arr[i11]! + (arr[i01]! - arr[i11]!) * X + (arr[i10]! - arr[i11]!) * Y,
        arr[i11 + 1]! + (arr[i01 + 1]! - arr[i11 + 1]!) * X + (arr[i10 + 1]! - arr[i11 + 1]!) * Y,
        arr[i11 + 2]! + (arr[i01 + 2]! - arr[i11 + 2]!) * X + (arr[i10 + 2]! - arr[i11 + 2]!) * Y,
      );
    }
    return out;
  }

  private updateSprites(step: number, t: number): void {
    const n = this.cols * this.rows;
    const S = this.spriteCount;
    const knotSoft = mix(PAL.knot, PAL.sparkle, 0.55);
    let any = false;
    const rate = step > 0 ? 1 - Math.exp(-8 * step) : 1;
    const seed = this.spriteSeed;
    for (let i = 0; i < S; i++) {
      const kind = this.spriteKind(i);
      let target = 0;
      let size = 0.03;
      let rot = 0;
      let hex = 0xffffff;
      let lift = 0.01;
      let u = 0.5;
      let v = 0.5;
      if (kind <= 2) {
        const cell = kind === 0 ? i : kind === 1 ? i - n : i - n * 2;
        const col = cell % this.cols;
        const row = Math.floor(cell / this.cols);
        const tg = this.display[cell]!;
        if (kind === 0) {
          u = (col + 0.5) / this.cols;
          v = (row + 0.5) / this.rows;
          if (this.markers !== 'off' && tg > 0.15) {
            const inspect = this.markers === 'inspect';
            const pulse = inspect ? 0.5 + 0.5 * Math.sin(t * 7 + cell) : 0;
            target = inspect ? 0.75 + 0.25 * pulse : 0.72;
            size = (inspect ? 0.034 + 0.012 * pulse : 0.027) + 0.012 * tg;
            hex = inspect ? PAL.knot : knotSoft;
          }
          rot = -t * (this.markers === 'inspect' ? 2.4 : 1.1) + cell * 1.7;
          lift = 0.012;
        } else if (kind === 1) {
          u = (col + 0.2 + 0.6 * rnd(seed, cell, 3)) / this.cols;
          v = (row + 0.15 + 0.7 * rnd(seed, cell, 4)) / this.rows;
          target = sstep(0.2, 0.55, tg) * 0.95;
          size = 0.02 + 0.016 * tg;
          rot = (rnd(seed, cell, 9) - 0.5) * 2.2 + Math.sin(t * 1.3 + cell) * 0.05;
          hex = this.frizzHex;
          lift = 0.004;
        } else {
          // Tangled cluster: a little looped scribble near the section centre.
          u = (col + 0.35 + 0.3 * rnd(seed, cell, 7)) / this.cols;
          v = (row + 0.4 + 0.2 * rnd(seed, cell, 8)) / this.rows;
          target = sstep(0.38, 0.7, tg) * 0.9;
          size = 0.018 + 0.02 * tg;
          rot = rnd(seed, cell, 10) * 6.28;
          hex = this.frizzHex;
          lift = 0.006;
        }
      } else if (kind === 3) {
        const f = i - n * 3;
        target = sstep(0.2, 0.7, this.bed) * 0.95;
        size = 0.045 * (0.8 + 0.4 * rnd(seed, f, 11)) * (0.5 + 0.5 * this.bed);
        u = 0.1 + 0.8 * rnd(seed, f, 12);
        v = 0.02 + 0.14 * rnd(seed, f, 13);
        rot = (u - 0.5) * 2.2 + (rnd(seed, f, 14) - 0.5) * 0.8;
        hex = this.frizzHex;
        lift = 0.018;
      } else {
        const g = i - n * 3 - FLYAWAYS;
        u = 0.22 + 0.56 * rnd(seed, g, 21);
        v = 0.22 + 0.45 * rnd(seed, g, 22);
        const tg = sampleLock(this.display, this.cols, this.rows, u, v);
        const tw = Math.max(0, Math.sin(t * (1.6 + rnd(seed, g, 23)) + g * 2.1));
        target = sstep(0.25, 0.8, this.shine) * (1 - tg) * tw * tw * tw * 0.95;
        size = 0.02 + 0.012 * tw;
        rot = t * 0.4 + g;
        hex = PAL.sparkle;
        lift = 0.012;
      }
      if (target < 0.01) target = 0;
      const a = this.sAlpha[i]! + (target - this.sAlpha[i]!) * rate;
      this.sAlpha[i] = a < 0.01 && target === 0 ? 0 : a;
      if (this.sAlpha[i]! <= 0) {
        for (let c = 0; c < 4; c++) this.sParam[(i * 4 + c) * 4 + 2] = 0;
        continue;
      }
      any = true;
      const uEdge = 0.5 / this.outer.length;
      if (u < uEdge) u = uEdge;
      else if (u > 1 - uEdge) u = 1 - uEdge;
      this.gridSample(this.proxyPos, u, v, _v3);
      this.gridSample(this.proxyNrm, u, v, _n3);
      _n3.normalize();
      _tmp[0] = _v3.x + _n3.x * lift;
      _tmp[1] = _v3.y + _n3.y * lift;
      _tmp[2] = _v3.z + _n3.z * lift;
      _col.setHex(hex);
      for (let c = 0; c < 4; c++) {
        const q = i * 4 + c;
        this.sPos[q * 3] = _tmp[0]!;
        this.sPos[q * 3 + 1] = _tmp[1]!;
        this.sPos[q * 3 + 2] = _tmp[2]!;
        this.sParam[q * 4] = size;
        this.sParam[q * 4 + 1] = rot;
        this.sParam[q * 4 + 2] = this.sAlpha[i]!;
        this.sTint[q * 3] = _col.r;
        this.sTint[q * 3 + 1] = _col.g;
        this.sTint[q * 3 + 2] = _col.b;
      }
    }
    this.spriteMesh.visible = any;
    if (any) {
      const g = this.spriteMesh.geometry;
      (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute('aParam') as THREE.BufferAttribute).needsUpdate = true;
      (g.getAttribute('aTint') as THREE.BufferAttribute).needsUpdate = true;
      this.dirty = true; // keep animating (swirls spin, glints twinkle)
    }
  }
}

function normalize3(a: Float32Array, o: number): void {
  const l = Math.sqrt(a[o]! * a[o]! + a[o + 1]! * a[o + 1]! + a[o + 2]! * a[o + 2]!);
  if (l > 1e-9) {
    a[o]! /= l;
    a[o + 1]! /= l;
    a[o + 2]! /= l;
  }
}

