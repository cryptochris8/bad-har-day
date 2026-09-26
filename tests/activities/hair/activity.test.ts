// Activity-level checks with a fake game context (no WebGL): skip() end state, state.hair, result flags,
// update() robustness, dispose() restoring shared objects.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { create } from '../../../src/activities/hair';
import type { ActivityContext, MorningState } from '../../../src/activities/types';
import { GIRLS, type GirlId } from '../../../src/family/types';
import { createGirlHair } from '../../../src/hair';
import type { GirlHairRig } from '../../../src/hair/rig';
import { NO_CONTROLS, type GameControls } from '../../../src/input/types';
import { generatePlan } from '../../../src/plan';
import { Rng } from '../../../src/core/rng';

const FIT = { rx: 0.19, ry: 0.2, rz: 0.185, shoulderY: -0.2235, shoulderHalfWidth: 0.2123, backZ: -0.1257, neckY: -0.165 };

/** Any property / call returns itself (for services whose return values don't matter). */
function anything(): unknown {
  const f = function () {} as unknown as object;
  const p: unknown = new Proxy(f, {
    get: (_t, k) => (k === 'then' ? undefined : p),
    apply: () => p,
  });
  return p;
}

interface FakeChar {
  id: string;
  root: THREE.Group;
  hair: GirlHairRig | null;
  pose: string;
  hold: string;
  calls: string[];
}

function fakeChar(id: string, girl: boolean): FakeChar & Record<string, unknown> {
  const root = new THREE.Group();
  const head = new THREE.Object3D();
  head.position.set(0, 1.0, 0);
  root.add(head);
  const sockets: Record<string, THREE.Object3D> = { head, handR: new THREE.Object3D(), handL: new THREE.Object3D(), overhead: new THREE.Object3D(), back: new THREE.Object3D(), root };
  for (const k of ['handR', 'handL', 'overhead', 'back']) root.add(sockets[k]!);
  const hair = girl ? (createGirlHair({ fit: FIT, color: 0x6b3d24, length: 0.64, seed: id.length }) as GirlHairRig) : null;
  if (hair) head.add(hair.root);
  const c: FakeChar & Record<string, unknown> = {
    id,
    root,
    hair,
    pose: 'stand',
    hold: 'none',
    calls: [],
    setPose(p: string) {
      c.pose = p;
      c.calls.push('pose:' + p);
    },
    setHold(h: string) {
      c.hold = h;
    },
    play(a: string) {
      c.calls.push('play:' + a);
      return 1;
    },
    socket: (n: string) => sockets[n] ?? root,
    setExpression() {},
    setOutfit() {},
    setMotion() {},
    emote() {},
    lookAt() {},
    update(dt: number) {
      hair?.update(dt);
    },
  };
  return c;
}

function fakeCtx(seed: number) {
  const plan = generatePlan(seed);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const mirrorMat = new THREE.MeshBasicMaterial();
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.92), mirrorMat);
  mirror.position.set(0.9, 1.5, -6.35);
  const counter = new THREE.Object3D();
  counter.position.set(0.9, 0.861, -6.04);
  const worldRoot = new THREE.Group();
  worldRoot.add(mirror, counter);
  scene.add(worldRoot);
  const chars: Record<string, ReturnType<typeof fakeChar>> = {};
  for (const g of GIRLS) chars[g] = fakeChar(g, true);
  chars.ashley = fakeChar('ashley', false);
  for (const c of Object.values(chars)) scene.add(c.root);
  const anchors: Record<string, { x: number; y: number; z: number; yaw: number; room: string }> = {
    stool1: { x: 0.15, y: 0, z: -5.37, yaw: Math.PI, room: 'bath' },
    stool2: { x: 0.9, y: 0, z: -5.37, yaw: Math.PI, room: 'bath' },
    stool3: { x: 1.65, y: 0, z: -5.37, yaw: Math.PI, room: 'bath' },
    vanity: { x: 0.9, y: 0, z: -5.6, yaw: Math.PI, room: 'bath' },
    bathDoor: { x: 1.78, y: 0, z: -2.62, yaw: Math.PI, room: 'bath' },
  };
  const state: MorningState = {
    coffee: { made: true, stars: 2, mug: null, liquid: 0 },
    lunches: { packed: false, notes: 0 },
    dogOut: true,
    trashOut: false,
    dishesDone: false,
    loud: 0,
    girlsUp: { addy: true, ellie: true, heidi: true },
    hair: {
      addy: { smooth: 0, momFinished: false, blackBrushSeconds: 0, solo: false },
      ellie: { smooth: 0, momFinished: false, blackBrushSeconds: 0, solo: false },
      heidi: { smooth: 0, momFinished: false, blackBrushSeconds: 0, solo: false },
    },
    itemsFound: 0,
    ashleyLeft: false,
    flags: new Set(),
  };
  const any = anything() as never;
  let now = 0;
  const pending: { at: number; resolve: () => void }[] = [];
  const ctx = {
    scene,
    root,
    persist: new THREE.Group(),
    world: {
      root: worldRoot,
      anchor: (id: string) => anchors[id] ?? { x: 0, y: 0, z: 0, yaw: 0, room: 'bath' },
      fixtures: { vanity: { root: counter, counter, mirror } },
    },
    family: { girl: (g: GirlId) => chars[g], ashley: chars.ashley, member: (m: string) => chars[m] },
    fx: any,
    audio: any,
    ui: {
      ...(anything() as object),
      takeClicks: () => [],
      choice: () => new Promise<string>(() => {}),
      bossIntro: () => Promise.resolve(),
      handleMenuActions: () => true,
      portraits() {},
      instruction() {},
      prompt() {},
      toast() {},
      banner() {},
      bubble: () => ({ move() {}, close() {}, open: true }),
    },
    hud: { tasks: null, objective: null, meters: null },
    input: { lastDevice: 'keyboard' },
    pointer: { enable() {}, disable() {}, warp() {}, down: false, pressed: false, released: false, active: false, ndcX: 0, ndcY: 0, source: 'mouse' },
    camera: { shot() {}, follow() {}, rig: any, camera: new THREE.PerspectiveCamera(), mode: 'shot' },
    walker: { enabled: true },
    npcs: { place() {}, release() {}, walkTo: () => Promise.resolve(), stop() {}, faceToward() {} },
    interact: any,
    clock: { minutes: 390, mode: 'run', rate: 0.19, advance() {}, label: () => '6:30 AM' },
    plan,
    state,
    rng: new Rng(seed * 31 + 7),
    settings: { hints: true, quality: 'auto' },
    projector: any,
    renderer: { getRenderTarget: () => null, setRenderTarget() {}, clear() {}, render() {}, shadowMap: { autoUpdate: true }, xr: { enabled: false }, domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) } },
    wait: (s: number) => new Promise<void>((resolve) => pending.push({ at: now + s, resolve })),
    rumble() {},
  } as unknown as ActivityContext;
  const advance = async (seconds: number, act?: { update: (dt: number, c: GameControls) => void }) => {
    for (let t = 0; t < seconds; t += 0.05) {
      now += 0.05;
      act?.update(0.05, NO_CONTROLS);
      for (const c of Object.values(chars)) (c.update as (dt: number) => void)(0.05);
      for (let i = pending.length - 1; i >= 0; i--)
        if (pending[i]!.at <= now) {
          pending[i]!.resolve();
          pending.splice(i, 1);
        }
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { ctx, chars, state, mirror, mirrorMat, advance, plan };
}

describe('hair activity (fake context)', () => {
  it('starts, runs into the battle, and skip() finishes with a plausible result + end state', async () => {
    const f = fakeCtx(7);
    const act = create();
    act.start(f.ctx);
    // Starting tangles from the plan were written into every rig.
    for (const g of GIRLS) expect(Array.from(f.chars[g]!.hair!.tangle).some((v) => v > 0)).toBe(true);
    await f.advance(6, act);
    expect(act.done).toBe(false);
    act.skip!();
    expect(act.done).toBe(true);
    const r = act.result();
    expect([1, 2, 3]).toContain(r.stars);
    for (const g of GIRLS) {
      const h = f.state.hair[g];
      expect(h.smooth).toBeGreaterThanOrEqual(0);
      expect(h.smooth).toBeLessThanOrEqual(1);
      expect(h.momFinished).toBe(h.smooth < 0.95);
      expect(h.solo).toBe(!h.momFinished);
      expect(r.flags.includes(`mom:${g}`) || (r.flags.includes(`approved:${g}`) && r.flags.includes(`solo:${g}`))).toBe(true);
      // Brushed, shiny, standing.
      expect(Array.from(f.chars[g]!.hair!.tangle).every((v) => v === 0)).toBe(true);
      expect(f.chars[g]!.pose).toBe('stand');
      expect(f.chars[g]!.hold).toBe('none');
      expect(f.chars[g]!.hair!.state.bedhead).toBeLessThanOrEqual(1);
    }
    expect(Object.values(f.state.hair).some((h) => h.blackBrushSeconds > 0)).toBe(true);
    act.dispose();
    expect(f.mirror.material).toBe(f.mirrorMat); // the world's mirror material is restored
    for (const g of GIRLS) expect(f.chars[g]!.root.getObjectByName('brush-black')).toBeUndefined();
  });

  it('skip() right away (autopilot) also works, and update() never throws on odd input', async () => {
    const f = fakeCtx(12345);
    const act = create();
    act.start(f.ctx);
    const weird: GameControls = { ...NO_CONTROLS, moveX: Number.NaN, primary: true, primaryPressed: true, nextPressed: true, secondaryPressed: true, altPressed: true };
    expect(() => act.update(0.6, weird)).not.toThrow();
    expect(() => act.update(0, weird)).not.toThrow();
    expect(() => act.update(-1, weird)).not.toThrow();
    act.skip!();
    expect(act.done).toBe(true);
    expect(() => act.update(0.1, weird)).not.toThrow();
    act.dispose();
    act.dispose(); // idempotent
  });
});
