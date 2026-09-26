// ─────────────────────────────────────────────────────────────────────────────
// HumanRig — implements the Character contract for the family and the extras.
// One SkinnedMesh (body + clothes + face + own hair, ONE draw call) driven by a
// bone skeleton; poses come from anim.ts and are cross-faded here. The girls'
// brushable hair (hair module) hangs off the 'head' socket.
//
//   root (game-owned transform)
//    ├─ shadow (blob), overhead socket (+ emote sprite)
//    └─ body (SkinnedMesh) ─ base ─ hips ─┬─ spine ─ chest ─┬─ head ─ face bones, hair chains, socket:head
//                                         │                 ├─ upperArm ─ foreArm ─ hand ─ finger (+ socket)
//                                         │                 └─ socket:back
//                                         └─ thigh ─ shin ─ foot
// update() is allocation-free.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Rng, hashString } from '../core/rng';
import { PAL } from '../render/palette';
import { cachedGeo } from '../render/models/common';
import { modelMaterial } from '../render/models/materials';
import { isShared, markShared } from '../render/models/shared';
import type { HairRig } from '../hair/types';
import {
  ACTION_DURATION,
  C,
  GESTURE_DURATION,
  PERSONA_GESTURES,
  actionBlocksLook,
  actionExpression,
  actionPose,
  actionProgress,
  basePose,
  defaultSeat,
  gaitOf,
  gestureExpression,
  gestureInterval,
  gesturePose,
  isCyclic,
  newDrive,
  phaseAdvance,
  stepLength,
  type ActCtx,
  type Drive,
  type Gesture,
  type Persona,
} from './anim';
import { EmoteSprite } from './emotes';
import { faceFor, type FaceFlavor } from './expressions';
import { legExtension, solveTwoBone } from './ik';
import { LOW_MOUTHS } from './head';
import { Pose, blendPose, clamp01, copyPose, smooth01 } from './pose';
import { B, EYE_SCALE, F, MOUTHS, buildBones, faceBone, type MouthKind, type Rig } from './skeleton';
import { acquireGeo, releaseGeo } from './skin';
import type { BodySpec } from './spec';
import type { Action, Character, Emote, Expression, HoldKind, MemberId, Outfit, PlayOpts, Pose as PoseKind, PoseOpts, SocketName } from './types';

const HIDE = 1e-4;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _sh = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _qIK = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

export interface HumanOpts {
  id: MemberId | 'extra';
  spec: BodySpec;
  persona: Persona;
  flavor: FaceFlavor;
  /** Geometry cache key for an outfit. */
  key: (outfit: Outfit) => string;
  /** Build the skinned geometry for an outfit (bones' rest matrices provided). */
  build: (outfit: Outfit, rig: Rig) => THREE.BufferGeometry;
  outfit: Outfit;
  /** Build the girls' hair (after the skeleton exists), or null. */
  hair: ((spec: BodySpec) => HairRig) | null;
  beard: boolean;
  /** Low-detail face (extras): fewer mouth shapes, no lower lids. */
  low: boolean;
  /** Which own-hair dynamics to run. */
  hairSim: 'none' | 'bounce' | 'long' | 'ponytail';
  seed: number;
}

let instances = 0;

export class HumanRig implements Character {
  readonly id: MemberId | 'extra';
  readonly root: THREE.Group;
  readonly height: number;
  readonly hair: HairRig | null;
  readonly spec: BodySpec;

  private readonly o: HumanOpts;
  private readonly rig: Rig;
  private readonly bones: THREE.Bone[];
  private readonly mesh: THREE.SkinnedMesh;
  private readonly geos = new Map<Outfit, THREE.BufferGeometry>();
  private outfit: Outfit;
  private readonly sockets: Record<SocketName, THREE.Object3D>;
  private readonly emoteSprite: EmoteSprite;
  private readonly shadow: THREE.Mesh;
  private readonly rng: Rng;
  private readonly restHipsY: number;
  private readonly restArm: [THREE.Vector3, THREE.Vector3];
  private readonly restFace: THREE.Vector3[] = [];
  private readonly restQ: THREE.Quaternion[] = [];
  private disposed = false;

  // animation state
  private readonly drive: Drive;
  private speedTarget = 0;
  private time = 0;
  private shiftT = 2;
  private shiftTarget = 0;
  private readonly base = new Pose();
  private readonly gest = new Pose();
  private readonly act = new Pose();
  private readonly out = new Pose();
  private readonly snap = new Pose();
  private fadeT = 1;
  private fadeDur = 0;
  private curAction: Action | null = null;
  private actT = 0;
  private actDur = 1;
  private actLoop = false;
  private gesture: Gesture | null = null;
  private gestT = 0;
  private gestIn = 3;
  private readonly ctx: ActCtx;

  // face state
  private baseExpr: Expression = 'neutral';
  private timedExpr: Expression | null = null;
  private timedLeft = 0;
  private expr: Expression = 'neutral';
  private sleepTarget = 0;
  private sleep = 0;
  private readonly fs = { lid: 0, lidR: 0, lidTilt: 0, lowLid: 0.08, browY: 0, browTilt: 0, browAsym: 0, pupil: 1, pupilY: 0, mouthScale: 1, blush: 0.75, headX: 0, headZ: 0 };
  private blinkIn = 2;
  private blinkT = -1;
  private readonly lookTarget = new THREE.Vector3();
  private hasLook = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private idleLookT = 2;
  private idleYaw = 0;
  private idlePitch = 0;

  // hair dynamics (own hair)
  private readonly headPrev = new THREE.Vector3();
  private readonly headVel = new THREE.Vector3();
  private hasHeadPrev = false;
  private readonly sway = { x: 0, vx: 0, z: 0, vz: 0, bob: 0, vbob: 0 };

  constructor(o: HumanOpts) {
    this.o = o;
    this.id = o.id;
    this.spec = o.spec;
    this.height = o.spec.height;
    this.outfit = o.outfit;
    this.rng = new Rng(hashString(String(o.id)) ^ Math.imul(o.seed | 0, 0x9e3779b1) ^ Math.imul(++instances, 0x85ebca6b));
    this.blinkIn = 0.6 + this.rng.next() * 2.5;
    this.gestIn = 2 + this.rng.next() * 4;
    this.drive = newDrive(o.spec, o.persona);
    this.ctx = { spec: o.spec, at: 0, t: 0, looping: false };

    const s = o.spec;
    this.rig = buildBones(s, o.beard);
    this.bones = this.rig.bones;
    this.restHipsY = s.hipsY;
    this.restArm = [this.bones[B.upperArmL]!.position.clone(), this.bones[B.upperArmR]!.position.clone()];
    for (let i = 0; i < B.count; i++) {
      this.restFace.push(this.bones[i]!.position.clone());
      this.restQ.push(this.bones[i]!.quaternion.clone());
    }

    this.root = new THREE.Group();
    this.root.name = 'char:' + o.id;
    const geo = this.geoFor(o.outfit);
    this.mesh = new THREE.SkinnedMesh(geo, modelMaterial());
    this.mesh.name = 'body';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.add(this.bones[B.base]!);
    this.root.add(this.mesh);
    this.root.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    // Generous fixed bounds (poses never leave them; no per-frame skinned bounds).
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, s.height * 0.5, 0), s.height * 0.85 + 0.25);
    this.mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-s.height * 0.75, -0.05, -s.height * 0.75), new THREE.Vector3(s.height * 0.75, s.height * 1.35, s.height * 0.75));

    // Sockets.
    const mk = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const ob = new THREE.Object3D();
      ob.name = 'socket:' + name;
      ob.position.set(x, y, z);
      parent.add(ob);
      return ob;
    };
    const head = mk('head', this.bones[B.head]!, 0, s.headCY, s.headCZ);
    const handR = mk('handR', this.bones[B.handR]!, 0, -s.handR * 0.82, 0);
    const handL = mk('handL', this.bones[B.handL]!, 0, -s.handR * 0.82, 0);
    const back = mk('back', this.bones[B.chest]!, 0, s.shoulderY - s.chestY - 0.09, -s.torsoD - 0.012);
    const overhead = mk('overhead', this.root, 0, s.height + 0.35, 0);
    this.sockets = { head, handR, handL, back, overhead, root: this.root };

    this.emoteSprite = new EmoteSprite(overhead);
    this.shadow = new THREE.Mesh(shadowGeo(), shadowMaterial());
    this.shadow.name = 'shadow';
    this.shadow.renderOrder = -1;
    const sr = Math.max(s.torsoW, s.hipW) * 1.9 + 0.08;
    this.shadow.scale.set(sr, 1, sr * 0.85);
    this.shadow.position.y = 0.012;
    this.root.add(this.shadow);

    this.hair = o.hair ? o.hair(s) : null;
    if (this.hair) head.add(this.hair.root);

    this.update(0);
  }

  // ── contract ───────────────────────────────────────────────────────────────

  get pose(): PoseKind {
    return this.drive.pose;
  }

  get action(): Action | null {
    return this.curAction;
  }

  /** Current resolved expression (diagnostics / tests). */
  get expression(): Expression {
    return this.expr;
  }

  /** Current emote (diagnostics / tests). */
  get currentEmote(): Emote | null {
    return this.emoteSprite.current;
  }

  get currentOutfit(): Outfit {
    return this.outfit;
  }

  /** The skinned body mesh (diagnostics / tests). */
  get body(): THREE.SkinnedMesh {
    return this.mesh;
  }

  setOutfit(outfit: Outfit): void {
    if (outfit !== 'sleep' && outfit !== 'day') return;
    if (outfit === this.outfit) return;
    this.outfit = outfit;
    this.mesh.geometry = this.geoFor(outfit);
  }

  setMotion(speed: number): void {
    this.speedTarget = Number.isFinite(speed) ? Math.max(0, Math.min(12, speed)) : 0;
  }

  setPose(pose: PoseKind, opts?: PoseOpts): void {
    const valid = pose === 'stand' || pose === 'sit' || pose === 'lie' || pose === 'kneel' || pose === 'drive';
    if (!valid) return;
    const seat = opts?.seatHeight !== undefined && Number.isFinite(opts.seatHeight) ? Math.max(0, Math.min(2, opts.seatHeight)) : defaultSeat(pose, this.spec);
    const side = opts?.side !== undefined && Number.isFinite(opts.side) ? Math.max(-1, Math.min(1, opts.side)) : 0;
    const d = this.drive;
    if (pose === d.pose && seat === d.seat && side === d.side) return;
    this.startFade(pose === d.pose ? 0.25 : 0.45);
    d.pose = pose;
    d.seat = seat;
    d.side = side;
    this.gesture = null;
  }

  setHold(kind: HoldKind): void {
    if (kind === this.drive.hold) return;
    this.startFade(0.2);
    this.drive.hold = kind;
  }

  play(action: Action, opts: PlayOpts = {}): number {
    const dur0 = ACTION_DURATION[action];
    if (dur0 === undefined) return 0;
    const dur = opts.duration !== undefined && Number.isFinite(opts.duration) && opts.duration > 0 ? Math.max(0.1, opts.duration) : dur0;
    this.startFade(this.curAction ? 0.12 : 0.14);
    this.curAction = action;
    this.actT = 0;
    this.actDur = dur;
    this.actLoop = !!opts.loop;
    this.gesture = null;
    return dur;
  }

  cancelAction(): void {
    if (!this.curAction) return;
    this.startFade(0.22);
    this.curAction = null;
  }

  setExpression(expression: Expression, seconds?: number): void {
    if (seconds === undefined || !Number.isFinite(seconds)) {
      this.baseExpr = expression;
      this.timedExpr = null;
      this.timedLeft = 0;
    } else {
      this.timedExpr = expression;
      this.timedLeft = Math.max(0, seconds);
    }
  }

  setSleepiness(v: number): void {
    this.sleepTarget = Number.isFinite(v) ? clamp01(v) : 0;
  }

  lookAt(world: THREE.Vector3 | null): void {
    if (!world || !Number.isFinite(world.x + world.y + world.z)) this.hasLook = false;
    else {
      this.lookTarget.copy(world);
      this.hasLook = true;
    }
  }

  socket(name: SocketName): THREE.Object3D {
    return this.sockets[name] ?? this.root;
  }

  emote(kind: Emote | null, seconds?: number): void {
    this.emoteSprite.show(kind, seconds);
  }

  update(dtIn: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.1, Math.max(0, Number.isFinite(dtIn) ? dtIn : 0));
    this.time += dt;
    const d = this.drive;
    const s = this.spec;
    d.t = this.time;

    // Motion (stride advances with distance → no foot skating).
    const k = 1 - Math.exp(-8 * dt);
    d.speed += (this.speedTarget - d.speed) * k;
    if (d.speed < 1e-3 && this.speedTarget === 0) d.speed = 0;
    d.gait = gaitOf(d.speed);
    d.move = d.pose === 'stand' ? smooth01((d.speed - 0.05) / 0.45) : 0;
    d.shuffle += ((this.curAction === 'sleepwalk' ? 1 : 0) - d.shuffle) * (1 - Math.exp(-6 * dt));
    if (d.pose === 'stand') {
      d.phase += phaseAdvance(d.speed * dt, stepLength(d.gait, s, d.shuffle));
      if (d.phase > 1000) d.phase -= Math.PI * 2 * 150;
    }
    // Idle weight shifts.
    this.shiftT -= dt;
    if (this.shiftT <= 0) {
      this.shiftT = 2.4 + this.rng.next() * 3.2;
      this.shiftTarget = this.shiftTarget > 0 ? -0.35 - this.rng.next() * 0.65 : 0.35 + this.rng.next() * 0.65;
    }
    d.shift += (this.shiftTarget - d.shift) * (1 - Math.exp(-2.5 * dt));

    // Base pose + idle gesture layer.
    basePose(this.base, d);
    this.updateGesture(dt);
    let target = this.base;
    if (this.gesture) {
      copyPose(this.gest, this.base);
      const gd = GESTURE_DURATION[this.gesture];
      this.ctx.spec = s;
      this.ctx.at = this.gestT;
      this.ctx.t = this.time;
      this.ctx.looping = false;
      gesturePose(this.gest, this.gesture, Math.min(1, this.gestT / gd), this.ctx);
      target = this.gest;
    }
    // Action layer.
    let finished = false;
    if (this.curAction) {
      this.actT += dt;
      const u = actionProgress(this.curAction, this.actT, this.actDur, this.actLoop);
      copyPose(this.act, target);
      this.ctx.at = this.actT * (ACTION_DURATION[this.curAction] / this.actDur);
      this.ctx.t = this.time;
      this.ctx.looping = this.actLoop && isCyclic(this.curAction);
      actionPose(this.act, this.curAction, u, this.ctx);
      target = this.act;
      if (!this.actLoop && this.actT >= this.actDur) finished = true;
    }
    if (this.fadeT < this.fadeDur) {
      this.fadeT += dt;
      blendPose(this.out, this.snap, target, smooth01(this.fadeT / this.fadeDur));
    } else copyPose(this.out, target);
    if (finished) {
      this.startFade(0.2);
      this.curAction = null;
    }

    this.updateFace(dt);
    this.applyPose(this.out);
    this.applyFace();
    this.root.updateMatrixWorld(true);
    this.updateSockets();
    this.updateHair(dt);
    this.emoteSprite.update(dt);
    if (this.hair) this.hair.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    if (this.hair) this.hair.dispose();
    this.emoteSprite.dispose();
    for (const g of this.geos.values()) releaseGeo(g);
    this.geos.clear();
    this.mesh.skeleton.dispose();
    this.root.traverse((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.geometry && !isShared(m.geometry)) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats) if (mat && !isShared(mat)) mat.dispose();
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private geoFor(outfit: Outfit): THREE.BufferGeometry {
    let g = this.geos.get(outfit);
    if (!g) {
      g = acquireGeo(this.o.key(outfit), () => this.o.build(outfit, this.rig));
      this.geos.set(outfit, g);
    }
    return g;
  }

  private startFade(dur: number): void {
    copyPose(this.snap, this.out);
    this.fadeT = 0;
    this.fadeDur = dur;
  }

  private updateGesture(dt: number): void {
    const d = this.drive;
    const idle = d.pose === 'stand' && d.move < 0.05 && !this.curAction && d.hold === 'none' && this.expr !== 'asleep' && this.sleep < 0.6;
    if (this.gesture) {
      this.gestT += dt;
      if (this.gestT >= GESTURE_DURATION[this.gesture] || !idle) {
        if (!idle) this.startFade(0.2);
        this.gesture = null;
      }
      return;
    }
    if (!idle || dt <= 0) return;
    this.gestIn -= dt;
    if (this.gestIn > 0) return;
    const gi = gestureInterval(d.persona);
    this.gestIn = gi[0] + this.rng.next() * (gi[1] - gi[0]);
    const list = PERSONA_GESTURES[d.persona];
    this.gesture = list[Math.floor(this.rng.next() * list.length) % list.length]!;
    this.gestT = 0;
  }

  private resolveExpression(): Expression {
    if (this.timedExpr) return this.timedExpr;
    if (this.curAction) {
      const u = actionProgress(this.curAction, this.actT, this.actDur, this.actLoop);
      const e = actionExpression(this.curAction, u);
      if (e) return e;
    }
    if (this.gesture) {
      const e = gestureExpression(this.gesture);
      if (e) return e;
    }
    return this.baseExpr;
  }

  private updateFace(dt: number): void {
    if (this.timedExpr) {
      this.timedLeft -= dt;
      if (this.timedLeft <= 0) {
        this.timedExpr = null;
        this.timedLeft = 0;
      }
    }
    this.expr = this.resolveExpression();
    const f = faceFor(this.expr, this.o.flavor);
    const fs = this.fs;
    const k = this.time < 0.05 ? 1 : dt > 0 ? 1 - Math.exp(-14 * dt) : 0;
    this.sleep += (this.sleepTarget - this.sleep) * (dt > 0 ? 1 - Math.exp(-3 * dt) : this.time < 0.05 ? 1 : 0);
    fs.lid += (f.lid - fs.lid) * k;
    fs.lidR += (f.lidR - fs.lidR) * k;
    fs.lidTilt += (f.lidTilt - fs.lidTilt) * k;
    fs.lowLid += (f.lowLid - fs.lowLid) * k;
    fs.browY += (f.browY - fs.browY) * k;
    fs.browTilt += (f.browTilt - fs.browTilt) * k;
    fs.browAsym += (f.browAsym - fs.browAsym) * k;
    fs.pupil += (f.pupil - fs.pupil) * k;
    fs.pupilY += (f.pupilY - this.sleep * 0.3 - fs.pupilY) * k;
    fs.mouthScale += (f.mouthScale - fs.mouthScale) * k;
    fs.blush += (f.blush - fs.blush) * k;
    fs.headX += (f.headX + this.sleep * 0.08 - fs.headX) * k;
    fs.headZ += (f.headZ - fs.headZ) * k;

    // Blinks (slower when sleepy).
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.16 + this.sleep * 0.2) this.blinkT = -1;
    } else if (dt > 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0;
        this.blinkIn = 1.8 + this.rng.next() * 3.4;
        if (this.rng.next() < 0.14) this.blinkIn = 0.25;
      }
    }

    // Look target (chest frame from the last frame's matrices).
    const s = this.spec;
    const blocked = this.curAction !== null && actionBlocksLook(this.curAction);
    let yaw = 0;
    let pitch = 0;
    if (this.hasLook) {
      const chest = this.bones[B.chest]!;
      _m.copy(chest.matrixWorld).invert();
      _v.copy(this.lookTarget).applyMatrix4(_m);
      _v.y -= s.neckY - s.chestY + s.headCY;
      _v.z -= s.headCZ;
      yaw = Math.atan2(_v.x, _v.z);
      pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      if (_v.z < 0 && Math.abs(yaw) > 1.6) yaw = Math.sign(yaw) * 1.1; // behind: turn as far as natural
    } else if (!this.curAction && !this.gesture && this.drive.move < 0.3 && this.drive.pose !== 'lie') {
      this.idleLookT -= dt;
      if (this.idleLookT <= 0) {
        this.idleLookT = 1.8 + this.rng.next() * 3.4;
        const r = this.rng.next();
        this.idleYaw = r < 0.45 ? 0 : (this.rng.next() - 0.5) * 0.9;
        this.idlePitch = (this.rng.next() - 0.5) * 0.18;
      }
      yaw = this.idleYaw;
      pitch = this.idlePitch;
    }
    const w = blocked ? 0 : this.curAction ? 0.6 : 1;
    yaw = Math.max(-1.1, Math.min(1.1, yaw)) * w;
    pitch = Math.max(-0.55, Math.min(0.55, pitch)) * w;
    const lk = this.time < 0.05 ? 1 : dt > 0 ? 1 - Math.exp(-7 * dt) : 0;
    this.lookYaw += (yaw - this.lookYaw) * lk;
    this.lookPitch += (pitch - this.lookPitch) * lk;
  }

  private applyPose(p: Pose): void {
    const s = this.spec;
    const bn = this.bones;
    const v = p.v;
    // Whole body.
    const base = bn[B.base]!;
    base.position.set(v[C.btx]!, v[C.bty]!, v[C.btz]!);
    base.rotation.set(v[C.bx]!, v[C.by]!, v[C.bz]!, 'XYZ');
    const sq = Math.max(0.6, Math.min(1.4, v[C.sq]!));
    const sxz = 1 / Math.sqrt(sq);
    base.scale.set(sxz, sq, sxz);

    // Legs.
    const tL = bn[B.thighL]!;
    const tR = bn[B.thighR]!;
    tL.rotation.set(v[C.lLx]!, v[C.lLt]!, v[C.lLo]!, 'XZY');
    tR.rotation.set(v[C.lRx]!, -v[C.lRt]!, -v[C.lRo]!, 'XZY');
    bn[B.shinL]!.rotation.x = v[C.lLk]!;
    bn[B.shinR]!.rotation.x = v[C.lRk]!;
    bn[B.footL]!.rotation.x = v[C.lLa]!;
    bn[B.footR]!.rotation.x = v[C.lRa]!;
    const hipDrop = s.hipsY - (s.thighL + s.shinL + s.ankleY);
    const kr = s.legR * 0.85;
    const ext = Math.max(
      legExtension(s.thighL, s.shinL, s.ankleY, s.footL, kr, v[C.lLx]!, v[C.lLo]!, v[C.lLk]!, v[C.lLa]!),
      legExtension(s.thighL, s.shinL, s.ankleY, s.footL, kr, v[C.lRx]!, v[C.lRo]!, v[C.lRk]!, v[C.lRa]!),
    );
    const locked = hipDrop + ext;
    const gl = clamp01(v[C.gl]!);
    const hips = bn[B.hips]!;
    hips.position.set(v[C.hpx]!, this.restHipsY + (locked - this.restHipsY) * gl + v[C.hpy]!, v[C.hpz]!);
    hips.rotation.set(v[C.px]!, v[C.pyaw]!, v[C.pz]!, 'YXZ');
    bn[B.spine]!.rotation.set(v[C.sx]!, v[C.sy]!, v[C.sz]!, 'YXZ');
    bn[B.chest]!.rotation.set(v[C.cx]!, v[C.cy]!, v[C.cz]!, 'YXZ');

    // Head (+ look + expression tilt).
    const hy = v[C.hy]! + this.lookYaw * 0.78;
    const hx = v[C.hx]! - this.lookPitch * 0.72 + this.fs.headX;
    bn[B.head]!.rotation.set(hx, hy, v[C.hz]! + this.fs.headZ, 'YXZ');

    // Arms (FK, then IK blended on top).
    const uL = bn[B.upperArmL]!;
    const uR = bn[B.upperArmR]!;
    uL.position.copy(this.restArm[0]);
    uL.position.y += v[C.shL]!;
    uR.position.copy(this.restArm[1]);
    uR.position.y += v[C.shR]!;
    uL.rotation.set(v[C.aLx]!, v[C.aLt]!, v[C.aLo]!, 'XZY');
    uR.rotation.set(v[C.aRx]!, -v[C.aRt]!, -v[C.aRo]!, 'XZY');
    bn[B.foreArmL]!.rotation.x = -v[C.aLe]!;
    bn[B.foreArmR]!.rotation.x = -v[C.aRe]!;
    bn[B.handL]!.rotation.set(v[C.wLx]!, v[C.wLt]!, v[C.wLz]!, 'XYZ');
    bn[B.handR]!.rotation.set(v[C.wRx]!, -v[C.wRt]!, -v[C.wRz]!, 'XYZ');
    const fL = v[C.fL]!;
    const fR = v[C.fR]!;
    bn[B.fingerL]!.scale.setScalar(fL > 0.03 ? fL : HIDE);
    bn[B.fingerR]!.scale.setScalar(fR > 0.03 ? fR : HIDE);
    const ikL = clamp01(v[C.ikL]!);
    const ikR = clamp01(v[C.ikR]!);
    if (ikL > 0.001) this.solveArm(0, p, ikL);
    if (ikR > 0.001) this.solveArm(1, p, ikR);
  }

  private solveArm(i: 0 | 1, p: Pose, w: number): void {
    const s = this.spec;
    const v = p.v;
    const side = i === 0 ? 1 : -1;
    const up = this.bones[i === 0 ? B.upperArmL : B.upperArmR]!;
    const fo = this.bones[i === 0 ? B.foreArmL : B.foreArmR]!;
    const b = i === 0 ? C.ikL : C.ikR;
    _sh.copy(up.position);
    _tgt.set(_sh.x + side * v[b + 1]!, _sh.y + v[b + 2]!, _sh.z + v[b + 3]!);
    _pole.set(side * v[b + 4]!, v[b + 5]!, v[b + 6]!);
    const bend = solveTwoBone(_sh, _tgt, s.upperArmL, s.foreArmL + s.handR * 0.8, _pole, _qIK);
    up.quaternion.slerp(_qIK, w);
    const fk = i === 0 ? v[C.aLe]! : v[C.aRe]!;
    fo.rotation.x = -(fk + (bend - fk) * w);
  }

  private mouthFor(kind: MouthKind): MouthKind {
    if (!this.o.low || LOW_MOUTHS.includes(kind)) return kind;
    switch (kind) {
      case 'pout':
      case 'wavy':
        return 'o';
      case 'eek':
        return 'grin';
      default:
        return 'smile';
    }
  }

  private applyFace(): void {
    const bn = this.bones;
    const s = this.spec;
    const fs = this.fs;
    const f = faceFor(this.expr, this.o.flavor);
    const er = s.eyeR;
    const ey = er * EYE_SCALE[1];
    const blink = this.blinkT >= 0 ? Math.sin(Math.min(1, this.blinkT / (0.16 + this.sleep * 0.2)) * Math.PI) : 0;
    const sleepLid = this.sleep * 0.82;
    for (let side = 1; side >= -1; side -= 2) {
      const sd = side as 1 | -1;
      const shape = sd > 0 ? f.eyeL : f.eyeR;
      const o = faceBone(sd, 0);
      scaleOr(bn[o + F.open]!, shape === 'open');
      scaleOr(bn[o + F.joy]!, shape === 'joy');
      scaleOr(bn[o + F.closed]!, shape === 'closed');
      scaleOr(bn[o + F.squeeze]!, shape === 'squeeze');
      if (shape === 'open') {
        const forced = fs.lid < 0 ? -fs.lid : 0;
        let c = Math.max(0, fs.lid + (sd < 0 ? fs.lidR : 0)) + sleepLid * (1 - forced);
        c = Math.max(c, blink);
        c = Math.min(1, c);
        const lu = bn[o + F.lidU]!;
        // Flatter lid while barely closed so it hugs the eye instead of standing out like a shelf.
        if (c < 0.02) lu.scale.setScalar(HIDE);
        else lu.scale.set(1, c, Math.min(1, 0.5 + c * 0.9));
        lu.rotation.z = sd * fs.lidTilt * (1 - blink);
        // Lash line at the lid edge: height along the eye, narrowed to the eye's width there.
        const la = bn[o + F.lash]!;
        const top = ey * 1.02;
        const yEdge = top - 2.04 * ey * c;
        const kk = Math.sqrt(Math.max(0.03, 1 - (yEdge / (ey * 1.06)) * (yEdge / (ey * 1.06))));
        if (c < 0.03) la.scale.setScalar(HIDE);
        else la.scale.set(kk, 1, kk * Math.min(1, 0.5 + c * 0.9));
        la.position.set(0, yEdge, 0);
        la.rotation.z = lu.rotation.z;
        const ld = bn[o + F.lidD]!;
        const low = Math.min(0.55, fs.lowLid) * (1 - blink);
        if (low < 0.14 || this.o.low) ld.scale.setScalar(HIDE);
        else ld.scale.set(1, low, Math.min(1, 0.35 + low));
        const ir = bn[o + F.iris]!;
        const px = Math.max(-er * 0.2, Math.min(er * 0.2, this.lookYaw * er * 0.22));
        const py = Math.max(-er * 0.16, Math.min(er * 0.14, this.lookPitch * er * 0.3 + fs.pupilY * er * 0.12));
        ir.position.set(px, py, 0);
        const ps = Math.max(0.5, fs.pupil);
        ir.scale.set(ps, ps, 1);
      }
      const br = bn[o + F.brow]!;
      const rq = this.restQ[o + F.brow]!;
      // Brow lift along the face's up (rest frame), tilt about its local Z.
      _v.set(0, (fs.browY + (sd > 0 ? fs.browAsym : 0) - (blink > 0.5 ? 0.02 : 0) - this.sleep * 0.04) * er, 0).applyQuaternion(rq);
      br.position.copy(this.restFace[o + F.brow]!).add(_v);
      _e.set(0, 0, sd * fs.browTilt, 'XYZ');
      br.quaternion.copy(rq).multiply(_q2.setFromEuler(_e));
      const bl = bn[o + F.blush]!;
      const b = fs.blush < 0.05 ? HIDE : 0.75 + Math.min(0.5, fs.blush * 0.35);
      bl.scale.set(b, b, 1);
    }
    // Mouth: show one shape.
    let ms = fs.mouthScale;
    if (this.expr === 'yawn' || this.expr === 'dramatic') ms *= 1 + 0.07 * Math.sin(this.time * 3.2);
    const want = this.mouthFor(f.mouth);
    for (let i = 0; i < MOUTHS.length; i++) {
      const bone = bn[B.mouth0 + i]!;
      if (MOUTHS[i] === want) bone.scale.set(ms, ms, 1);
      else bone.scale.setScalar(HIDE);
    }
  }

  private updateSockets(): void {
    const bn = this.bones;
    // Overhead: above the head centre in root space (world up when lying down).
    const hs = this.sockets.head;
    hs.getWorldPosition(_v);
    this.root.worldToLocal(_v);
    this.sockets.overhead.position.set(_v.x, _v.y + this.spec.headRy + 0.35, _v.z);
    // Hand sockets keep props upright in the body frame (+Y up, +Z forward), tilted by s?x/s?z.
    const v = this.out.v;
    this.root.getWorldQuaternion(_q);
    _q.multiply(bn[B.base]!.quaternion);
    for (let i = 0; i < 2; i++) {
      const hand = bn[i === 0 ? B.handL : B.handR]!;
      const sock = i === 0 ? this.sockets.handL : this.sockets.handR;
      _e.set(i === 0 ? v[C.sLx]! : v[C.sRx]!, 0, i === 0 ? v[C.sLz]! : v[C.sRz]!, 'XYZ');
      _q2.setFromEuler(_e).premultiply(_q);
      hand.matrixWorld.decompose(_v2, sock.quaternion, _s);
      sock.quaternion.invert().multiply(_q2);
      sock.updateMatrixWorld(true);
    }
    // Blob shadow under the hips.
    bn[B.hips]!.getWorldPosition(_v);
    this.root.worldToLocal(_v);
    this.shadow.position.set(_v.x, 0.012, _v.z);
  }

  private updateHair(dt: number): void {
    const sim = this.o.hairSim;
    if (sim === 'none' || dt <= 0) return;
    const bn = this.bones;
    // Head motion in its own frame → spring-driven lag.
    const head = bn[B.head]!;
    head.getWorldPosition(_v);
    if (!this.hasHeadPrev) {
      this.headPrev.copy(_v);
      this.hasHeadPrev = true;
    }
    _v2.subVectors(_v, this.headPrev).divideScalar(dt);
    this.headPrev.copy(_v);
    // acceleration ≈ Δvelocity
    const ax = (_v2.x - this.headVel.x) / dt;
    const ay = (_v2.y - this.headVel.y) / dt;
    const az = (_v2.z - this.headVel.z) / dt;
    this.headVel.copy(_v2);
    head.getWorldQuaternion(_q).invert();
    _v.set(ax, ay, az).applyQuaternion(_q);
    const sw = this.sway;
    const K = 55;
    const D = 7;
    const tx = Math.max(-0.5, Math.min(0.5, _v.z * 0.012)) + 0.02 * Math.sin(this.time * 1.3);
    const tz = Math.max(-0.4, Math.min(0.4, -_v.x * 0.012));
    sw.vx += (-K * (sw.x - tx) - D * sw.vx) * dt;
    sw.x += sw.vx * dt;
    sw.vz += (-K * (sw.z - tz) - D * sw.vz) * dt;
    sw.z += sw.vz * dt;
    sw.vbob += (-120 * (sw.bob - Math.max(-0.4, Math.min(0.4, -_v.y * 0.004))) - 9 * sw.vbob) * dt;
    sw.bob += sw.vbob * dt;
    if (!Number.isFinite(sw.x + sw.z + sw.bob)) sw.x = sw.vx = sw.z = sw.vz = sw.bob = sw.vbob = 0;
    if (sim === 'bounce') {
      const top = bn[B.hairTop]!;
      top.scale.set(1, 1 + sw.bob * 0.12, 1);
      top.rotation.set(sw.x * 0.1, 0, sw.z * 0.1);
      return;
    }
    // Long hair: keep it hanging (counter part of the head pitch/roll) + sway lag down the chain.
    const hx = head.rotation.x;
    const hz = head.rotation.z;
    const x0 = Math.max(-0.08, sw.x * 0.55 - hx * 0.45);
    bn[B.hairBack0]!.rotation.set(x0, 0, sw.z * 0.5 - hz * 0.4);
    bn[B.hairBack1]!.rotation.set(Math.max(-0.1, sw.x * 0.35), 0, sw.z * 0.35);
    bn[B.hairBack2]!.rotation.set(Math.max(-0.1, sw.x * 0.25), 0, sw.z * 0.25);
    if (sim === 'long') {
      for (let i = 0; i < 2; i++) {
        const a = bn[i === 0 ? B.hairSideL0 : B.hairSideR0]!;
        const b2 = bn[i === 0 ? B.hairSideL1 : B.hairSideR1]!;
        a.rotation.set(Math.max(-0.05, sw.x * 0.25 - hx * 0.25), 0, sw.z * 0.3 - hz * 0.3);
        b2.rotation.set(Math.max(-0.05, sw.x * 0.2), 0, sw.z * 0.2);
      }
    }
  }
}

function scaleOr(b: THREE.Object3D, on: boolean): void {
  if (on) b.scale.setScalar(1);
  else b.scale.setScalar(HIDE);
}

// ── shared blob shadow ────────────────────────────────────────────────────────

let shadowMat: THREE.MeshBasicMaterial | null = null;
export function shadowMaterial(): THREE.MeshBasicMaterial {
  if (!shadowMat) {
    shadowMat = markShared(
      new THREE.MeshBasicMaterial({ color: PAL.outline, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    shadowMat.name = 'bhd-blob-shadow';
  }
  return shadowMat;
}

/** Soft round blob (RGBA vertex colours, alpha fades to the rim), unit radius, in XZ. */
export function shadowGeo(): THREE.BufferGeometry {
  return cachedGeo('bhd-family-shadow', () => {
    const seg = 24;
    const rings = [0, 0.5, 0.82, 1];
    const alpha = [0.32, 0.26, 0.12, 0];
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let ri = 0; ri < rings.length; ri++) {
      const rr = rings[ri]!;
      const n = ri === 0 ? 1 : seg;
      for (let i = 0; i < n; i++) {
        const a = (i / seg) * Math.PI * 2;
        pos.push(Math.cos(a) * rr, 0, Math.sin(a) * rr);
        col.push(1, 1, 1, alpha[ri]!);
      }
    }
    for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
    for (let ri = 1; ri < rings.length - 1; ri++) {
      const b0 = 1 + (ri - 1) * seg;
      const b1 = 1 + ri * seg;
      for (let i = 0; i < seg; i++) {
        const i1 = (i + 1) % seg;
        idx.push(b0 + i, b0 + i1, b1 + i, b0 + i1, b1 + i1, b1 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  });
}
