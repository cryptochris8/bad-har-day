// An oscillating lawn sprinkler: a little green head that sweeps a fan of water droplets back and forth
// (instanced droplets on parabolic arcs) + a darker wet patch. Used as scenery on a front lawn and by the
// drive activity's sprinkler event (spraying over the right lane).
import * as THREE from 'three';
import { PAL } from '../../render/palette';
import { GeoBuilder } from '../../render/models/builder';
import { basicMaterial, modelMaterial, sceneryMaterial } from '../../render/models/materials';

export interface SprayOpts {
  /** Direction (yaw, 0 = +Z) the fan is centred on, sweep half-angle (rad), launch speed, elevation (rad). */
  yaw: number;
  sweep: number;
  speed: number;
  elevation: number;
  /** Droplets alive at once. */
  count?: number;
  /** Sweep period (s). */
  period?: number;
  /** Wet patch colour (lawn by default; darker asphalt for a road-side sprinkler). */
  wet?: number;
  /** Droplet radius (m). */
  drop?: number;
}

const G = 9.8;
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpE = new THREE.Euler();

export class Spray {
  readonly group = new THREE.Group();
  private readonly drops: THREE.InstancedMesh;
  private readonly head: THREE.Mesh;
  private readonly wet: THREE.Mesh;
  private readonly born: Float32Array;
  private readonly dir: Float32Array;
  private t = 0;
  private readonly life: number;
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(readonly opts: SprayOpts) {
    const n = opts.count ?? 60;
    this.group.name = 'sprinkler';
    const hb = new GeoBuilder(true, true);
    hb.cyl(0.14, 0.18, 0.1, 10, PAL.sprinklerHead, { at: [0, 0.05, 0] });
    hb.cyl(0.035, 0.035, 0.22, 6, 0x9aa0aa, { at: [0, 0.2, 0] });
    hb.cyl(0.03, 0.03, 0.34, 6, 0x9aa0aa, { at: [0, 0.3, 0], rot: [0, 0, Math.PI / 2], ink: false });
    const hg = hb.build();
    this.geos.push(hg);
    this.head = new THREE.Mesh(hg, modelMaterial());
    this.group.add(this.head);
    const range = (opts.speed * opts.speed * Math.sin(2 * opts.elevation)) / G;
    const wb = new GeoBuilder(false, false);
    wb.cyl(1, 1, 0.02, 20, opts.wet ?? 0x5f9f58, { at: [0, 0, 0], scale: [range * 0.55, 1, range * 0.55] });
    const wg = wb.build();
    wg.translate(Math.sin(opts.yaw) * range * 0.5, 0.004, Math.cos(opts.yaw) * range * 0.5);
    this.geos.push(wg);
    this.wet = new THREE.Mesh(wg, sceneryMaterial());
    this.wet.receiveShadow = true;
    this.group.add(this.wet);
    const dg = new THREE.IcosahedronGeometry(opts.drop ?? 0.05, 0);
    this.geos.push(dg);
    this.drops = new THREE.InstancedMesh(dg, basicMaterial(PAL.water, { opacity: 0.9 }), n);
    this.drops.frustumCulled = false;
    this.group.add(this.drops);
    this.born = new Float32Array(n);
    this.dir = new Float32Array(n);
    this.life = (2 * opts.speed * Math.sin(opts.elevation)) / G;
    for (let i = 0; i < n; i++) {
      this.born[i] = -((i / n) * this.life);
      this.dir[i] = this.sweepAt(this.born[i]!);
    }
    this.update(0);
  }

  private sweepAt(t: number): number {
    const p = this.opts.period ?? 2.6;
    return this.opts.yaw + Math.sin((t / p) * Math.PI * 2) * this.opts.sweep;
  }

  /** Current fan direction (yaw) — the drive event uses it to time the splash. */
  get angle(): number {
    return this.sweepAt(this.t);
  }

  update(dt: number): void {
    this.t += Math.max(0, Math.min(0.1, dt));
    const o = this.opts;
    const n = this.born.length;
    for (let i = 0; i < n; i++) {
      // each droplet has its own speed / elevation → a fan-shaped sheet of water, not a single thin arc
      const jv = 0.8 + ((i * 0.381966) % 1) * 0.28;
      const je = o.elevation + (((i * 0.618034) % 1) - 0.5) * 0.36;
      const vh = o.speed * jv * Math.cos(je);
      const vv = o.speed * jv * Math.sin(je);
      let age = this.t - this.born[i]!;
      const life = (2 * vv) / G + 0.08;
      if (age > life) {
        this.born[i] = this.t - ((age - life) % life);
        this.dir[i] = this.sweepAt(this.born[i]!);
        age = this.t - this.born[i]!;
      }
      const a = this.dir[i]!;
      const h = vh * age;
      const y = 0.32 + vv * age - 0.5 * G * age * age;
      tmpP.set(Math.sin(a) * h, Math.max(0, y), Math.cos(a) * h);
      const vy = vv - G * age;
      tmpQ.setFromEuler(tmpE.set(-Math.atan2(vy, vh), a, 0, 'YXZ'));
      const k = y < 0.02 ? 0.01 : 1;
      tmpS.set(k, k, k * 2.6);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this.drops.setMatrixAt(i, tmpM);
    }
    this.drops.instanceMatrix.needsUpdate = true;
    this.head.rotation.y = this.angle;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    this.drops.dispose();
    this.group.removeFromParent();
  }
}
