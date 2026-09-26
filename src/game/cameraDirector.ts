// Camera director: the dollhouse follow-cam (fixed yaw, looking from +Z toward −Z at DOLLHOUSE_VIEW pitch) and
// manual close-up shots for activities. Also tells the world where the camera is focused (wall cut-away) and
// where to centre the shadow camera.
import * as THREE from 'three';
import type { CameraDirector } from '../activities/types';
import type { CameraRigImpl } from '../render/camera';
import type { CameraGoal } from '../render/types';
import { DOLLHOUSE_VIEW, type World } from '../world/types';

/** Pure: dollhouse camera goal for a focus point. */
export function dollhouseGoal(fx: number, fz: number, leadX = 0, leadZ = 0, zoom = 1): CameraGoal {
  const pitch = THREE.MathUtils.degToRad(DOLLHOUSE_VIEW.pitchDeg);
  const d = DOLLHOUSE_VIEW.distance * zoom;
  const tx = fx + leadX;
  const tz = fz + leadZ;
  const ty = DOLLHOUSE_VIEW.focusY;
  return {
    position: { x: tx, y: ty + Math.sin(pitch) * d, z: tz + Math.cos(pitch) * d },
    target: { x: tx, y: ty, z: tz },
    fov: DOLLHOUSE_VIEW.fov,
  };
}

export class CameraDirectorImpl implements CameraDirector {
  mode: 'follow' | 'shot' = 'follow';
  private target: THREE.Object3D | null = null;
  private readonly lead = new THREE.Vector2();
  private readonly lastPos = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private shotTarget = { x: 0, z: 0 };
  /** Dollhouse zoom factor (1 = DOLLHOUSE_VIEW.distance); phones in portrait zoom out a little. */
  zoom = 1;

  constructor(
    readonly rig: CameraRigImpl,
    private readonly world: World,
    private readonly defaultTarget: () => THREE.Object3D,
  ) {}

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera;
  }

  follow(target: THREE.Object3D | null = null): void {
    this.mode = 'follow';
    this.target = target;
    this.lead.set(0, 0);
    (target ?? this.defaultTarget()).getWorldPosition(this.lastPos);
  }

  shot(goal: CameraGoal, stiffness = 3.5): void {
    this.mode = 'shot';
    this.rig.setGoal(goal, stiffness);
    this.shotTarget = { x: goal.target.x, z: goal.target.z };
  }

  /** Jump straight to the current goal (act starts, teleports). */
  snap(): void {
    this.update(1 / 60, true);
    this.rig.snap();
  }

  update(dt: number, force = false): void {
    if (this.mode === 'shot') {
      this.world.setFocus(this.shotTarget.x, this.shotTarget.z, 'closeup');
      this.world.lighting.setShadowFocus(this.shotTarget.x, this.shotTarget.z);
      return;
    }
    const obj = this.target ?? this.defaultTarget();
    const p = obj.getWorldPosition(this.tmp);
    if (dt > 0) {
      // Look slightly ahead of where the character is walking.
      const vx = (p.x - this.lastPos.x) / dt;
      const vz = (p.z - this.lastPos.z) / dt;
      const k = 1 - Math.exp(-2.5 * dt);
      this.lead.x += (THREE.MathUtils.clamp(vx * 0.35, -1.2, 1.2) - this.lead.x) * k;
      this.lead.y += (THREE.MathUtils.clamp(vz * 0.25, -0.9, 0.9) - this.lead.y) * k;
    }
    this.lastPos.copy(p);
    const goal = dollhouseGoal(p.x, p.z, this.lead.x, this.lead.y, this.zoom);
    this.rig.setGoal(goal, force ? 100 : 4.5);
    this.world.setFocus(p.x, p.z, 'dollhouse');
    this.world.lighting.setShadowFocus(p.x, p.z);
  }
}
