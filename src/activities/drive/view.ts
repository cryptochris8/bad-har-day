// The drive's 3D actors, synced every frame from DriveSim: the crossing guard (with her STOP sign) and the
// kids she walks across, a waddling goose parade (instanced, flapping when they hurry), the jogger with her
// stroller, the garbage truck, the kids' ball, the puddle, the over-the-road sprinkler, plus flavour
// (a neighbour waving, a neighbour's dog) and the school's teacher + kids walking in. Everything lives under
// `group` (placed at the route origin, route-local coordinates x, y, −s).
import * as THREE from 'three';
import { createDog, createExtra } from '../../family';
import type { Character, Dog } from '../../family/types';
import { makeProp } from '../../props';
import type { Prop } from '../../props/types';
import { modelMaterial } from '../../render/models/materials';
import { Spray } from '../../world/route/sprinkler';
import type { RouteWithExtras } from '../../world/route';
import { ballGeometry, garbageTruck, gooseGeometry, puddleMesh, strollerGroup, type TruckModel, wingGeometry } from './actors';
import { Ball, CrossingGuard, GarbageTruck, Geese, Jogger, PUDDLE, Puddle, Sprinkler, type DriveEventLogic } from './events';
import type { DriveSim } from './sim';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpE = new THREE.Euler();
const tmpQ3 = new THREE.Quaternion();
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpV2 = new THREE.Vector3();

/** Turn a character smoothly toward a yaw. */
function faceTo(c: { root: THREE.Object3D }, yaw: number, rate: number, dt: number): void {
  let d = yaw - c.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  c.root.rotation.y += d * Math.min(1, rate * dt);
}

interface GuardActors {
  ev: CrossingGuard;
  guard: Character;
  sign: Prop;
  kids: Character[];
  /** After crossing, the kids stroll along the far sidewalk (view-only offset). */
  stroll: number[];
}
interface GeeseActors {
  ev: Geese;
  body: THREE.InstancedMesh;
  wings: THREE.InstancedMesh;
  phase: number[];
  flap: number;
}
interface JoggerActors {
  ev: Jogger;
  jogger: Character;
  stroller: THREE.Group;
}
interface TruckActors {
  ev: GarbageTruck;
  truck: TruckModel;
  rolled: number;
}
interface BallActors {
  ev: Ball;
  ball: THREE.Mesh;
  kid: Character;
  spin: THREE.Quaternion;
}

export class DriveView {
  readonly group = new THREE.Group();
  readonly extras: Character[] = [];
  private readonly dogs: Dog[] = [];
  private readonly props: Prop[] = [];
  private readonly sprays: Spray[] = [];
  private guard: GuardActors | null = null;
  private geese: GeeseActors | null = null;
  private jogger: JoggerActors | null = null;
  private truck: TruckActors | null = null;
  private ball: BallActors | null = null;
  /** Flavour + school actors. */
  readonly teacher: Character;
  private readonly schoolKids: { c: Character; t: number; x0: number }[] = [];
  private neighbor: Character | null = null;
  private neighborS = 0;
  private dog: Dog | null = null;
  private dogS = 0;
  private time = 0;
  private readonly instanced: THREE.InstancedMesh[] = [];

  constructor(
    parent: THREE.Object3D,
    route: RouteWithExtras,
    sim: DriveSim,
    seed: number,
  ) {
    this.group.name = 'drive:actors';
    this.group.position.copy(route.root.position);
    parent.add(this.group);
    for (const e of sim.events) this.build(e, seed);
    // school: a teacher at the curb by the door, two kids walking in
    const door = route.extras.schoolDoor;
    this.teacher = this.extra('teacher', seed + 31);
    this.teacher.root.position.set(door.x - 1.4, 0, -(door.s - 3.8));
    this.teacher.root.rotation.y = -Math.PI / 2 - 0.4;
    for (let i = 0; i < 2; i++) {
      const k = this.extra('kid', seed + 40 + i);
      this.schoolKids.push({ c: k, t: i * 3.1, x0: 10.2 + i * 0.5 });
    }
    // flavour: a neighbour waving from a front yard + a neighbour's dog behind its fence
    const free = (s: number) => !sim.events.some((e) => Math.abs(e.s - s) < 30);
    const nS = [160, 250, 390, 110].find(free);
    if (nS !== undefined) {
      this.neighbor = this.extra('neighbor', seed + 51);
      this.neighborS = nS;
      this.neighbor.root.position.set(-10.2, 0, -nS);
      this.neighbor.root.rotation.y = Math.PI / 2;
    }
    const dS = [200, 300, 60, 420].find((s) => free(s) && s !== nS);
    if (dS !== undefined) {
      const coats = ['golden', 'spotted', 'chocolate', 'cream'] as const;
      const d = createDog({ name: 'Pepper', coat: coats[Math.abs(seed) % coats.length]! });
      d.root.position.set(10.4, 0, -dS);
      d.root.rotation.y = -Math.PI / 2;
      d.setPose('sit');
      d.setMood('excited');
      this.group.add(d.root);
      this.dogs.push(d);
      this.dog = d;
      this.dogS = dS;
    }
  }

  private extra(kind: 'crossingGuard' | 'jogger' | 'teacher' | 'kid' | 'neighbor', seed: number): Character {
    const c = createExtra(kind, seed);
    this.group.add(c.root);
    this.extras.push(c);
    return c;
  }

  private build(e: DriveEventLogic, seed: number): void {
    if (e instanceof CrossingGuard) {
      const guard = this.extra('crossingGuard', seed + 1);
      const sign = makeProp('stopSign');
      this.props.push(sign);
      guard.setHold('brush');
      const hand = guard.socket('handR');
      hand.add(sign.root);
      sign.root.position.copy(sign.grip.position).multiplyScalar(-1);
      const kids = [this.extra('kid', seed + 2), this.extra('kid', seed + 3)];
      this.guard = { ev: e, guard, sign, kids, stroll: [0, 0] };
      guard.root.position.set(e.guard.x, 0, -e.guard.s);
      guard.root.rotation.y = -Math.PI / 2;
      kids.forEach((k, i) => {
        const o = e.kids[i]!;
        k.root.position.set(o.x, 0, -o.s);
        k.root.rotation.y = -Math.PI / 2;
      });
    } else if (e instanceof Geese) {
      const n = e.geese.length;
      const body = new THREE.InstancedMesh(gooseGeometry(), modelMaterial(), n);
      const wings = new THREE.InstancedMesh(wingGeometry(), modelMaterial(), n * 2);
      body.frustumCulled = false;
      wings.frustumCulled = false;
      body.castShadow = true;
      this.group.add(body, wings);
      this.instanced.push(body, wings);
      this.geese = { ev: e, body, wings, phase: e.geese.map((_g, i) => i * 1.7), flap: 0 };
    } else if (e instanceof Jogger) {
      const j = this.extra('jogger', seed + 11);
      j.setHold('box');
      const st = strollerGroup(Math.abs(seed) % 8);
      st.position.set(0, 0, 0.95);
      j.root.add(st);
      j.root.visible = false;
      this.jogger = { ev: e, jogger: j, stroller: st };
    } else if (e instanceof GarbageTruck) {
      const t = garbageTruck();
      t.root.visible = false;
      this.group.add(t.root);
      this.truck = { ev: e, truck: t, rolled: 0 };
    } else if (e instanceof Ball) {
      const m = new THREE.Mesh(ballGeometry(), modelMaterial());
      m.castShadow = true;
      this.group.add(m);
      const kid = this.extra('kid', seed + 21);
      kid.root.position.set(e.side * 9.8, 0, -(e.s + 1.2));
      kid.root.rotation.y = e.side > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.ball = { ev: e, ball: m, kid, spin: new THREE.Quaternion() };
    } else if (e instanceof Puddle) {
      const p = puddleMesh();
      p.position.set(PUDDLE.x, 0, -e.s);
      this.group.add(p);
    } else if (e instanceof Sprinkler) {
      const sp = new Spray({ yaw: -Math.PI / 2, sweep: 0.62, speed: 7.3, elevation: 0.74, count: 120, period: 2.2, wet: 0x3f434e, drop: 0.085 });
      sp.group.position.set(6.2, 0, -e.s);
      this.group.add(sp.group);
      this.sprays.push(sp);
    }
  }

  /** Actors an event keeps hidden until it starts (the jogger appears when triggered). */
  private hiddenByEvent(c: Character): boolean {
    if (this.jogger && c === this.jogger.jogger) return !this.jogger.ev.jogger.shown;
    return this.schoolKids.some((k) => k.c === c);
  }

  /** The crossing guard (for reactions / bubbles), if any. */
  get guardChar(): Character | null {
    return this.guard?.guard ?? null;
  }
  get guardKids(): readonly Character[] {
    return this.guard?.kids ?? [];
  }
  get joggerChar(): Character | null {
    return this.jogger?.jogger ?? null;
  }
  get ballKid(): Character | null {
    return this.ball?.kid ?? null;
  }
  get neighborChar(): Character | null {
    return this.neighbor;
  }
  get neighborAt(): number {
    return this.neighborS;
  }
  get dogAt(): number {
    return this.dogS;
  }
  get neighborDog(): Dog | null {
    return this.dog;
  }
  /** World position of the first goose's head (honk bubbles). */
  gooseHead(out: THREE.Vector3): THREE.Vector3 | null {
    const g = this.geese;
    if (!g) return null;
    const o = g.ev.geese[Math.floor(g.ev.geese.length / 2)]!;
    return out.set(o.x, 1.2, -o.s).add(this.group.position);
  }
  truckPos(out: THREE.Vector3): THREE.Vector3 | null {
    const t = this.truck;
    if (!t) return null;
    return out.set(t.ev.truck.x, 3.6, -(t.ev.truck.s + 2.8)).add(this.group.position);
  }

  /** Make the geese flap for a moment (honk / close call). */
  flapGeese(seconds = 1.2): void {
    if (this.geese) this.geese.flap = Math.max(this.geese.flap, seconds);
  }

  update(dt: number, sim: DriveSim): void {
    this.time += dt;
    const carS = sim.car.s;
    // ── crossing guard + kids ──
    const g = this.guard;
    if (g) {
      const e = g.ev;
      const gc = g.guard;
      const wasX = gc.root.position.x;
      gc.root.position.set(e.guard.x, 0, -e.guard.s);
      const vx = dt > 0 ? (e.guard.x - wasX) / dt : 0;
      gc.setMotion(Math.abs(vx));
      const yaw = e.phase === 'out' ? -Math.PI / 2 : e.phase === 'back' ? Math.PI / 2 : e.phase === 'hold' ? 0 : -Math.PI / 2;
      faceTo(gc, yaw, 8, dt);
      for (let i = 0; i < e.kids.length; i++) {
        const o = e.kids[i]!;
        const k = g.kids[i]!;
        const walking = o.vx !== 0;
        if (!walking && o.x < -6) {
          // done crossing: stroll along the far sidewalk toward school
          g.stroll[i] = (g.stroll[i] ?? 0) + 1.1 * dt;
          k.root.position.set(-7.4, 0, -(o.s + g.stroll[i]!));
          k.setMotion(1.1);
          faceTo(k, Math.PI, 6, dt);
        } else {
          k.root.position.set(o.x, 0, -o.s);
          k.setMotion(walking ? Math.abs(o.vx) : 0);
          faceTo(k, -Math.PI / 2, 8, dt);
        }
      }
    }
    // ── geese ──
    const gz = this.geese;
    if (gz) {
      const e = gz.ev;
      gz.flap = Math.max(0, gz.flap - dt);
      const hurry = e.hurried || gz.flap > 0;
      for (let i = 0; i < e.geese.length; i++) {
        const o = e.geese[i]!;
        const walking = Math.abs(o.vx) > 0.05;
        const ph = gz.phase[i]! + this.time * (hurry ? 16 : walking ? 9 : 2.5);
        const bob = walking ? Math.abs(Math.sin(ph)) * 0.05 : 0;
        const dir = o.vx < -0.05 ? -1 : 1;
        const yaw = walking || e.started ? (dir * Math.PI) / 2 : Math.PI / 2 + Math.sin(this.time * 0.6 + i) * 0.8;
        tmpE.set(0, yaw, walking ? Math.sin(ph) * 0.13 : Math.sin(ph) * 0.05, 'YXZ');
        tmpQ.setFromEuler(tmpE);
        // pecking the grass while waiting
        if (!e.started) tmpQ.multiply(tmpQ2.setFromAxisAngle(tmpP.set(1, 0, 0), Math.max(0, Math.sin(this.time * 1.3 + i * 2)) * 0.6));
        tmpP.set(o.x, bob, -o.s);
        tmpS.set(1, 1, 1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        gz.body.setMatrixAt(i, tmpM);
        // wings: the +X wing mesh, turned around (never mirrored: instance matrices must keep their winding)
        const open = hurry ? 0.35 + Math.abs(Math.sin(ph * 1.6)) * 1.15 : 0.08;
        for (let w = 0; w < 2; w++) {
          const side = w === 0 ? 1 : -1;
          tmpQ2.copy(tmpQ);
          if (side < 0) tmpQ2.multiply(tmpQ3.setFromAxisAngle(Y_AXIS, Math.PI));
          tmpQ2.multiply(tmpQ3.setFromAxisAngle(Z_AXIS, open));
          tmpP.set(side * 0.16, 0.5, -0.02).applyQuaternion(tmpQ).add(tmpV2.set(o.x, bob, -o.s));
          tmpM.compose(tmpP, tmpQ2, tmpS);
          gz.wings.setMatrixAt(i * 2 + w, tmpM);
        }
      }
      gz.body.instanceMatrix.needsUpdate = true;
      gz.wings.instanceMatrix.needsUpdate = true;
    }
    // ── jogger ──
    const j = this.jogger;
    if (j) {
      const o = j.ev.jogger;
      j.jogger.root.visible = o.shown;
      if (o.shown) {
        j.jogger.root.position.set(o.x, 0, -(o.s - 0.45));
        j.jogger.setMotion(Math.hypot(o.vs, o.vx));
        faceTo(j.jogger, Math.atan2(o.vx, -o.vs) || Math.PI, 6, dt);
      }
    }
    // ── garbage truck ──
    const t = this.truck;
    if (t) {
      const o = t.ev.truck;
      t.truck.root.visible = o.shown;
      if (o.shown) {
        t.rolled += o.vs * dt;
        t.truck.root.position.set(o.x, 0, -o.s);
        t.truck.root.rotation.y = Math.PI - Math.atan2(o.vx, Math.max(0.5, o.vs)) * 0.6;
        t.truck.set(t.ev.arm, t.rolled, this.time);
      }
    }
    // ── ball + kid ──
    const b = this.ball;
    if (b) {
      const o = b.ev.ball;
      b.ball.position.set(o.x, o.y, -o.s);
      if (dt > 0) {
        tmpQ.setFromAxisAngle(tmpP.set(0, 0, 1), (-o.vx * dt) / 0.3);
        tmpQ2.setFromAxisAngle(tmpP.set(1, 0, 0), (-o.vs * dt) / 0.3);
        b.spin.premultiply(tmpQ).premultiply(tmpQ2);
        b.ball.quaternion.copy(b.spin);
      }
      const k = b.kid;
      const e = b.ev;
      // the kid never steps into the street: runs to the sidewalk edge and waits there
      const targetX = e.launched ? e.side * 8.0 : e.side * (9.6 + Math.sin(this.time * 1.4) * 0.5);
      const kx = k.root.position.x;
      const nx = kx + Math.sign(targetX - kx) * Math.min(Math.abs(targetX - kx), 3.2 * dt);
      k.root.position.x = nx;
      k.setMotion(dt > 0 ? Math.abs(nx - kx) / dt : 0);
      faceTo(k, e.side > 0 ? -Math.PI / 2 : Math.PI / 2, 6, dt);
    }
    // ── sprinklers ──
    for (const sp of this.sprays) sp.update(dt);
    // ── school kids walking in (loop) ──
    for (const sk of this.schoolKids) {
      sk.t += dt;
      const T = 9;
      const u = (sk.t % T) / T;
      const doorS = 521;
      const s = doorS - 14 + u * 14;
      const x = sk.x0 + (u > 0.75 ? (u - 0.75) * 4 * 4 : 0);
      sk.c.root.position.set(x, 0, -s);
      sk.c.root.visible = u < 0.97 && carS > doorS - 170;
      sk.c.setMotion(1.5);
      faceTo(sk.c, u > 0.75 ? Math.PI / 2 : Math.PI, 8, dt);
    }
    // ── flavour ──
    if (this.neighbor && Math.abs(this.neighborS - carS) < 60 && !this.neighbor.action && Math.sin(this.time * 0.9) > 0.97) this.neighbor.play('wave');
    if (this.dog && Math.abs(this.dogS - carS) < 50 && !this.dog.action && Math.sin(this.time * 1.3) > 0.98) this.dog.play('bark');
    // extras / dogs only exist (render + animate) near the van: ahead ≤ 170 m, behind ≤ 45 m
    for (const c of this.extras) {
      const s = -c.root.position.z;
      const on = s < carS + 170 && s > carS - 45;
      if (c.root.parent === this.group) {
        if (!on) c.root.visible = false;
        else if (c.root.visible === false && !this.hiddenByEvent(c)) c.root.visible = true;
      }
      if (on) c.update(dt);
    }
    for (const d of this.dogs) {
      const s = -d.root.position.z;
      d.root.visible = s < carS + 170 && s > carS - 45;
      if (d.root.visible) d.update(dt);
    }
  }

  dispose(): void {
    for (const p of this.props) p.dispose();
    for (const c of this.extras) c.dispose();
    for (const d of this.dogs) d.dispose();
    for (const s of this.sprays) s.dispose();
    for (const m of this.instanced) m.dispose();
    this.group.removeFromParent();
  }
}
