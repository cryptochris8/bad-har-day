// NPC movement director (girls, Ashley, the dog): nav-path walks, following, wandering, facing.
// The game calls update(dt) every frame; each mover's root position/yaw + setMotion are driven here.
import * as THREE from 'three';
import type { Mover, Npcs } from '../activities/types';
import type { Vec3Like } from '../render/types';
import type { AnchorId, World } from '../world/types';
import { stepPath, turnToward, wrapAngle, yawOf, type PathCursor } from './motion';

type Order =
  | { kind: 'idle' }
  | { kind: 'path'; path: Vec3Like[]; cursor: PathCursor; speed: number; faceYaw: number | null; style: 'walk' | 'run' | 'sleepwalk'; resolve: () => void }
  | { kind: 'follow'; leader: THREE.Object3D; distance: number; speed: number; path: Vec3Like[]; cursor: PathCursor; repath: number }
  | { kind: 'wander'; around: Vec3Like; radius: number; speed: number; pause: number; wait: number; path: Vec3Like[] | null; cursor: PathCursor };

interface Track {
  who: Mover;
  order: Order;
  yaw: number;
  faceTarget: number | null;
  speedNow: number;
}

const TURN_RATE = 9;

export class NpcsImpl implements Npcs {
  private readonly tracks = new Map<Mover, Track>();
  private seed = 0x51ed;

  constructor(private readonly world: World) {}

  private rnd(): number {
    this.seed = (Math.imul(this.seed ^ (this.seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0;
    return (this.seed >>> 8) / 16777216;
  }

  private track(who: Mover): Track {
    let t = this.tracks.get(who);
    if (!t) {
      t = { who, order: { kind: 'idle' }, yaw: who.root.rotation.y, faceTarget: null, speedNow: 0 };
      this.tracks.set(who, t);
    }
    return t;
  }

  private cancel(t: Track): void {
    const o = t.order;
    t.order = { kind: 'idle' };
    if (o.kind === 'path') {
      if (o.style === 'sleepwalk' && 'cancelAction' in t.who) t.who.cancelAction();
      o.resolve();
    }
  }

  walkTo(who: Mover, to: Vec3Like, opts: { speed?: number; faceYaw?: number; style?: 'walk' | 'run' | 'sleepwalk' } = {}): Promise<void> {
    const t = this.track(who);
    this.cancel(t);
    const p = who.root.position;
    const path = this.world.navPath({ x: p.x, y: 0, z: p.z }, to);
    const style = opts.style ?? 'walk';
    const speed = opts.speed ?? (style === 'run' ? 3.2 : style === 'sleepwalk' ? 0.7 : 1.7);
    if (style === 'sleepwalk' && 'setSleepiness' in who) who.play('sleepwalk', { loop: true });
    return new Promise((resolve) => {
      t.order = { kind: 'path', path, cursor: { x: p.x, z: p.z, i: 0, done: path.length === 0 }, speed, faceYaw: opts.faceYaw ?? null, style, resolve };
    });
  }

  place(who: Mover, at: Vec3Like, yaw: number): void {
    const t = this.track(who);
    this.cancel(t);
    who.root.position.set(at.x, at.y ?? 0, at.z);
    who.root.rotation.y = yaw;
    t.yaw = yaw;
    t.faceTarget = null;
    t.speedNow = 0;
  }

  placeAt(who: Mover, anchor: AnchorId): void {
    const a = this.world.anchor(anchor);
    this.place(who, a, a.yaw);
  }

  follow(who: Mover, leader: THREE.Object3D, opts: { distance?: number; speed?: number } = {}): void {
    const t = this.track(who);
    this.cancel(t);
    const p = who.root.position;
    t.order = { kind: 'follow', leader, distance: opts.distance ?? 1.3, speed: opts.speed ?? 2.6, path: [], cursor: { x: p.x, z: p.z, i: 0, done: true }, repath: 0 };
  }

  wander(who: Mover, around: Vec3Like, radius: number, opts: { speed?: number; pause?: number } = {}): void {
    const t = this.track(who);
    this.cancel(t);
    const p = who.root.position;
    t.order = { kind: 'wander', around, radius, speed: opts.speed ?? 1.4, pause: opts.pause ?? 1.5, wait: 0.3, path: null, cursor: { x: p.x, z: p.z, i: 0, done: true } };
  }

  stop(who: Mover): void {
    const t = this.track(who);
    this.cancel(t);
    who.setMotion(0);
  }

  isBusy(who: Mover): boolean {
    const o = this.tracks.get(who)?.order;
    return !!o && o.kind !== 'idle';
  }

  faceToward(who: Mover, at: Vec3Like): void {
    const t = this.track(who);
    const p = who.root.position;
    t.faceTarget = yawOf(at.x - p.x, at.z - p.z);
  }

  release(who: Mover): void {
    this.forget(who);
  }

  /** Forget a mover (e.g. the family was rebuilt). */
  forget(who: Mover): void {
    const t = this.tracks.get(who);
    if (t) this.cancel(t);
    this.tracks.delete(who);
  }

  clear(): void {
    for (const t of this.tracks.values()) this.cancel(t);
    this.tracks.clear();
  }

  private walk(t: Track, path: Vec3Like[], cursor: PathCursor, speed: number, dt: number): void {
    const root = t.who.root;
    const bx = cursor.x;
    const bz = cursor.z;
    stepPath(cursor, path, speed * dt);
    const dx = cursor.x - bx;
    const dz = cursor.z - bz;
    root.position.x = cursor.x;
    root.position.z = cursor.z;
    t.speedNow = Math.hypot(dx, dz) / dt;
    if (t.speedNow > 0.05) t.yaw = turnToward(t.yaw, yawOf(dx, dz), TURN_RATE * dt);
  }

  update(dt: number): void {
    if (dt <= 0) {
      for (const t of this.tracks.values()) t.who.setMotion(0);
      return;
    }
    for (const t of this.tracks.values()) {
      const o = t.order;
      const root = t.who.root;
      t.speedNow = 0;
      if (o.kind === 'path') {
        this.walk(t, o.path, o.cursor, o.speed, dt);
        if (o.cursor.done) {
          t.order = { kind: 'idle' };
          if (o.faceYaw !== null) t.faceTarget = o.faceYaw;
          if (o.style === 'sleepwalk' && 'cancelAction' in t.who) t.who.cancelAction();
          o.resolve();
        }
      } else if (o.kind === 'follow') {
        const lp = o.leader.getWorldPosition(tmp);
        const d = Math.hypot(lp.x - root.position.x, lp.z - root.position.z);
        o.repath -= dt;
        if (d > o.distance + 0.35) {
          if (o.repath <= 0 || o.cursor.done) {
            o.repath = 0.45;
            // Aim at a point `distance` short of the leader.
            const k = Math.max(0, (d - o.distance) / d);
            const goal = { x: root.position.x + (lp.x - root.position.x) * k, y: 0, z: root.position.z + (lp.z - root.position.z) * k };
            o.path = this.world.navPath({ x: root.position.x, y: 0, z: root.position.z }, goal);
            o.cursor = { x: root.position.x, z: root.position.z, i: 0, done: o.path.length === 0 };
          }
          const speed = d > o.distance + 2.5 ? o.speed * 1.35 : o.speed;
          this.walk(t, o.path, o.cursor, speed, dt);
        } else {
          o.cursor.done = true;
          t.faceTarget = yawOf(lp.x - root.position.x, lp.z - root.position.z);
        }
      } else if (o.kind === 'wander') {
        if (o.path === null || o.cursor.done) {
          o.wait -= dt;
          if (o.wait <= 0) {
            for (let tries = 0; tries < 6; tries++) {
              const a = this.rnd() * Math.PI * 2;
              const r = Math.sqrt(this.rnd()) * o.radius;
              const gx = o.around.x + Math.cos(a) * r;
              const gz = o.around.z + Math.sin(a) * r;
              if (!this.world.free(gx, gz, 0.3)) continue;
              o.path = this.world.navPath({ x: root.position.x, y: 0, z: root.position.z }, { x: gx, y: 0, z: gz });
              o.cursor = { x: root.position.x, z: root.position.z, i: 0, done: o.path.length === 0 };
              break;
            }
            o.wait = o.pause * (0.6 + this.rnd() * 0.8);
          }
        } else this.walk(t, o.path, o.cursor, o.speed, dt);
      }
      if (t.faceTarget !== null && t.speedNow < 0.1) {
        t.yaw = turnToward(t.yaw, t.faceTarget, TURN_RATE * 0.6 * dt);
        if (Math.abs(wrapAngle(t.yaw - t.faceTarget)) < 1e-3) t.faceTarget = null;
      }
      root.rotation.y = t.yaw;
      t.who.setMotion(t.speedNow);
    }
  }
}

const tmp = new THREE.Vector3();
