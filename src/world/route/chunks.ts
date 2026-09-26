// Route geometry is merged per ~110 m chunk (one flat scenery mesh + one inked props mesh each) so the camera
// frustum culls whole chunks behind the car and the draw-call count stays tiny.
import * as THREE from 'three';
import { GeoBuilder, type V3 } from '../../render/models/builder';
import { modelMaterial, sceneryMaterial } from '../../render/models/materials';
import { Frame } from '../kit';
import { proxyMesh } from '../shadows';
import { S_MAX, S_MIN } from './layout';

export const CHUNK_LEN = 112;

/** Route space (s, x) → route-root local position (x, y, −s). */
export const P = (s: number, x: number, y = 0): V3 => [x, y, -s];

/** Frame yaw that turns a model's front (+Z) toward the road from a side (+1 right → faces −X). */
export const faceRoadYaw = (side: 1 | -1): number => (side > 0 ? -Math.PI / 2 : Math.PI / 2);

export class Chunks {
  readonly n: number;
  readonly flat: GeoBuilder[] = [];
  readonly ink: GeoBuilder[] = [];
  /** Invisible low-poly shadow casters (the detailed props only receive shadows). */
  readonly shadow: GeoBuilder[] = [];
  /** Always-visible far scenery (backdrop hills + tree lines) and far inked props (the row past the T). */
  readonly far = new GeoBuilder(false, false);
  readonly farInk = new GeoBuilder(true, true);
  /** Built chunk meshes with their s range (distance culling). */
  readonly meshes: { mesh: THREE.Mesh; s0: number; s1: number }[] = [];

  constructor() {
    this.n = Math.ceil((S_MAX - S_MIN) / CHUNK_LEN);
    for (let i = 0; i < this.n; i++) {
      this.flat.push(new GeoBuilder(false, false));
      this.ink.push(new GeoBuilder(true, true));
      this.shadow.push(new GeoBuilder(false, false));
    }
  }

  index(s: number): number {
    return Math.max(0, Math.min(this.n - 1, Math.floor((s - S_MIN) / CHUNK_LEN)));
  }

  flatAt(s: number): GeoBuilder {
    return this.flat[this.index(s)]!;
  }

  inkAt(s: number): GeoBuilder {
    return this.ink[this.index(s)]!;
  }

  /** Shadow proxy: a box (route space: s range, x range, heights). */
  proxyBox(s0: number, s1: number, x0: number, x1: number, y0: number, y1: number): void {
    if (s1 - s0 < 0.05 || x1 - x0 < 0.05 || y1 - y0 < 0.05) return;
    this.shadow[this.index((s0 + s1) / 2)]!.box(x1 - x0, y1 - y0, s1 - s0, 0xffffff, { at: [(x0 + x1) / 2, (y0 + y1) / 2, -(s0 + s1) / 2], ink: false });
  }

  /** Shadow proxy: a low-poly ball (tree crowns). */
  proxyBall(s: number, x: number, y: number, r: number, sy = 1): void {
    this.shadow[this.index(s)]!.ball(r, 0, 0xffffff, { at: [x, y, -s], scale: [1, sy, 1], ink: false });
  }

  /** A tree's shadow caster (trunk + crown). */
  proxyTree(s: number, x: number, h: number, r: number): void {
    this.proxyBox(s - r * 0.12, s + r * 0.12, x - r * 0.12, x + r * 0.12, 0, h * 0.55);
    this.proxyBall(s, x, h * 0.72, r * 1.1, 0.9);
  }

  /** Placement frame at (s, x) on the inked builder of that chunk. */
  frame(s: number, x: number, yaw = 0, flat = false): Frame {
    return new Frame(flat ? this.flatAt(s) : this.inkAt(s), x, 0, -s, yaw);
  }

  /** A flat box spanning s0..s1 × x0..x1 (top at y + h/2), split at chunk borders. */
  strip(s0: number, s1: number, x0: number, x1: number, y: number, h: number, color: number): void {
    if (s1 - s0 < 0.01 || x1 - x0 < 0.001) return;
    let a = s0;
    while (a < s1 - 1e-6) {
      const ci = this.index(a + 1e-3);
      const end = Math.min(s1, S_MIN + (ci + 1) * CHUNK_LEN);
      const b = end <= a + 1e-3 ? s1 : end;
      this.flat[ci]!.box(x1 - x0, h, b - a, color, { at: [(x0 + x1) / 2, y, -(a + b) / 2] });
      a = b;
    }
  }

  /** Build every chunk's meshes under `parent`; returns the geometries to dispose. */
  build(parent: THREE.Object3D, castShadows: boolean): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    for (let i = 0; i < this.n; i++) out.push(...this.buildChunk(i, parent, castShadows));
    out.push(...this.buildFar(parent));
    return out;
  }

  /** The always-visible far meshes. */
  buildFar(parent: THREE.Object3D): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    if (this.far.triangles > 0) {
      const g = this.far.build();
      out.push(g);
      const m = new THREE.Mesh(g, sceneryMaterial());
      m.name = 'route:far';
      parent.add(m);
    }
    if (this.farInk.triangles > 0) {
      const g = this.farInk.build();
      out.push(g);
      const m = new THREE.Mesh(g, modelMaterial());
      m.name = 'route:farProps';
      m.receiveShadow = true;
      parent.add(m);
    }
    return out;
  }

  /** Hide detail chunks far ahead of / behind the camera (s of the camera). */
  cull(camS: number, ahead = 250, behind = 70): void {
    for (const c of this.meshes) c.mesh.visible = c.s0 < camS + ahead && c.s1 > camS - behind;
  }

  /** Build one chunk's meshes (flat scenery + inked props). */
  buildChunk(i: number, parent: THREE.Object3D, castShadows: boolean): THREE.BufferGeometry[] {
    const out: THREE.BufferGeometry[] = [];
    {
      const fb = this.flat[i]!;
      if (fb.triangles > 0) {
        const g = fb.build();
        out.push(g);
        const m = new THREE.Mesh(g, sceneryMaterial());
        m.name = `route:flat${i}`;
        m.receiveShadow = true;
        parent.add(m);
        this.meshes.push({ mesh: m, s0: S_MIN + i * CHUNK_LEN, s1: S_MIN + (i + 1) * CHUNK_LEN });
      }
      const ib = this.ink[i]!;
      if (ib.triangles > 0) {
        const g = ib.build();
        out.push(g);
        const m = new THREE.Mesh(g, modelMaterial());
        m.name = `route:props${i}`;
        m.castShadow = false;
        m.receiveShadow = true;
        parent.add(m);
        this.meshes.push({ mesh: m, s0: S_MIN + i * CHUNK_LEN, s1: S_MIN + (i + 1) * CHUNK_LEN });
      }
      const sb = this.shadow[i]!;
      if (castShadows && sb.triangles > 0) {
        const g = sb.build();
        out.push(g);
        const m = proxyMesh(g, `route:shadow${i}`);
        parent.add(m);
        this.meshes.push({ mesh: m, s0: S_MIN + i * CHUNK_LEN, s1: S_MIN + (i + 1) * CHUNK_LEN });
      }
    }
    return out;
  }
}
