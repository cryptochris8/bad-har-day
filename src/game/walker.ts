// The player-controlled character in free roam (Chris). Camera-relative stick movement with
// acceleration, collision/sliding through world.move, smooth turning, footsteps, and scripted walks.
import * as THREE from 'three';
import type { Walker } from '../activities/types';
import type { AudioEngine } from '../audio/types';
import type { Character } from '../family/types';
import type { GameControls } from '../input/types';
import type { Vec3Like } from '../render/types';
import type { World } from '../world/types';
import { stepPath, stickToWorld, turnToward, yawOf, type PathCursor } from './motion';

export const WALKER_RADIUS = 0.3;
const ACCEL = 14;
const TURN_RATE = 12;

interface Scripted {
  path: Vec3Like[];
  cursor: PathCursor;
  speed: number;
  faceYaw: number | null;
  resolve: () => void;
}

export class WalkerImpl implements Walker {
  enabled = true;
  speed = 2.4;
  readonly velocity = new THREE.Vector3();
  private yawNow = 0;
  private faceTarget: number | null = null;
  private scripted: Scripted | null = null;
  private stepAcc = 0;
  private readonly out = { x: 0, z: 0 };

  constructor(
    readonly character: Character,
    private readonly world: World,
    private readonly audio: AudioEngine | null,
  ) {
    this.yawNow = character.root.rotation.y;
  }

  get position(): THREE.Vector3 {
    return this.character.root.position;
  }

  get yaw(): number {
    return this.yawNow;
  }

  /** True while a scripted walkTo is running. */
  get busy(): boolean {
    return this.scripted !== null;
  }

  teleport(x: number, z: number, yaw: number): void {
    this.cancelScript();
    this.character.root.position.set(x, 0, z);
    this.yawNow = yaw;
    this.faceTarget = null;
    this.character.root.rotation.y = yaw;
    this.velocity.set(0, 0, 0);
  }

  walkTo(target: Vec3Like, opts: { speed?: number; faceYaw?: number } = {}): Promise<void> {
    this.cancelScript();
    const p = this.position;
    const path = this.world.navPath({ x: p.x, y: 0, z: p.z }, target);
    return new Promise((resolve) => {
      this.scripted = {
        path,
        cursor: { x: p.x, z: p.z, i: 0, done: path.length === 0 },
        speed: opts.speed ?? this.speed,
        faceYaw: opts.faceYaw ?? null,
        resolve,
      };
    });
  }

  face(yaw: number): void {
    this.faceTarget = yaw;
  }

  private cancelScript(): void {
    const s = this.scripted;
    this.scripted = null;
    s?.resolve();
  }

  update(dt: number, controls: GameControls): void {
    if (dt <= 0) {
      this.character.setMotion(0);
      return;
    }
    const root = this.character.root;
    const s = this.scripted;
    let speedNow = 0;
    if (s) {
      const before = { x: s.cursor.x, z: s.cursor.z };
      stepPath(s.cursor, s.path, s.speed * dt);
      const dx = s.cursor.x - before.x;
      const dz = s.cursor.z - before.z;
      root.position.x = s.cursor.x;
      root.position.z = s.cursor.z;
      speedNow = Math.hypot(dx, dz) / dt;
      this.velocity.set(dx / dt, 0, dz / dt);
      if (speedNow > 0.05) this.yawNow = turnToward(this.yawNow, yawOf(dx, dz), TURN_RATE * dt);
      if (s.cursor.done) {
        this.scripted = null;
        this.velocity.set(0, 0, 0);
        if (s.faceYaw !== null) this.faceTarget = s.faceYaw;
        s.resolve();
      }
    } else {
      const want = this.enabled ? stickToWorld(controls.moveX, controls.moveY) : { x: 0, z: 0 };
      const tx = want.x * this.speed;
      const tz = want.z * this.speed;
      const k = Math.min(1, ACCEL * dt);
      this.velocity.x += (tx - this.velocity.x) * k;
      this.velocity.z += (tz - this.velocity.z) * k;
      if (Math.hypot(this.velocity.x, this.velocity.z) < 0.02) this.velocity.set(0, 0, 0);
      const p = root.position;
      this.world.move(p.x, p.z, WALKER_RADIUS, this.velocity.x * dt, this.velocity.z * dt, this.out);
      const mdx = this.out.x - p.x;
      const mdz = this.out.z - p.z;
      p.x = this.out.x;
      p.z = this.out.z;
      speedNow = Math.hypot(mdx, mdz) / dt;
      if (Math.hypot(tx, tz) > 0.1) {
        this.faceTarget = null;
        this.yawNow = turnToward(this.yawNow, yawOf(tx, tz), TURN_RATE * dt);
      }
    }
    if (this.faceTarget !== null && speedNow < 0.1) {
      this.yawNow = turnToward(this.yawNow, this.faceTarget, TURN_RATE * 0.6 * dt);
      if (Math.abs(this.yawNow - this.faceTarget) < 1e-3) this.faceTarget = null;
    }
    root.rotation.y = this.yawNow;
    this.character.setMotion(speedNow);
    // Soft slipper footsteps.
    if (speedNow > 0.3) {
      this.stepAcc += speedNow * dt;
      if (this.stepAcc > 0.62) {
        this.stepAcc = 0;
        this.audio?.play('footstep', { volume: 0.35, pitch: 0.9 + ((root.position.x * 13.7) % 1) * 0.2 });
      }
    }
  }
}
