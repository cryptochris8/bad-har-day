// Headless playthroughs of the whole school run (loading → drive → drop-off) with the REAL world, family,
// walker, npcs, camera director and FX, a fake UI and neutral input (the van auto-cruises; autopilot on).
import * as THREE from 'three';
import { afterAll, describe, expect, it } from 'vitest';
import { create } from '../../../src/activities/drive';
import type { ActivityContext, ActivityHud } from '../../../src/activities/types';
import { createAudio } from '../../../src/audio';
import { Rng, hashInts, hashString } from '../../../src/core/rng';
import { DEFAULT_LOOKS, createFamily } from '../../../src/family';
import { GIRLS } from '../../../src/family/types';
import { CameraDirectorImpl } from '../../../src/game/cameraDirector';
import { GameClockImpl } from '../../../src/game/clock';
import { InteractionsImpl } from '../../../src/game/interactions';
import { freshState, resetWorldState } from '../../../src/game/morning';
import { NpcsImpl } from '../../../src/game/npcs';
import { WalkerImpl } from '../../../src/game/walker';
import { NO_CONTROLS, type GameControls, type InputManager, type PointerInput } from '../../../src/input/types';
import { generatePlan } from '../../../src/plan';
import { ACTS, SCHOOL_DEADLINE, T } from '../../../src/plan/types';
import { CameraRigImpl } from '../../../src/render/camera';
import { createFx } from '../../../src/render/fx';
import { DEFAULT_SETTINGS } from '../../../src/storage/types';
import type { BubbleHandle, PromptSpec, UiManager } from '../../../src/ui/types';
import { createWorld } from '../../../src/world';

const scene = new THREE.Scene();
const world = createWorld({ quality: 'low' });
scene.add(world.root);
const family = createFamily(DEFAULT_LOOKS);
for (const m of family.members) scene.add(m.root);
scene.add(family.dog.root);
const audio = createAudio();
const fx = createFx({ quality: 'low' });

afterAll(() => {
  fx.dispose();
  family.dispose();
  world.dispose();
});

interface Run {
  ctx: ActivityContext;
  clock: GameClockImpl;
  walker: WalkerImpl;
  bubbles: string[];
  prompts: (PromptSpec | null)[];
  frame(a: ReturnType<typeof create>, dt?: number, ctl?: GameControls): Promise<void>;
}

function setup(seed: number): Run {
  const bubbles: string[] = [];
  const prompts: (PromptSpec | null)[] = [];
  const ui = {
    bubble: (_at: unknown, text: string): BubbleHandle => {
      bubbles.push(text);
      let open = true;
      return {
        move() {},
        close() {
          open = false;
        },
        get open() {
          return open;
        },
      };
    },
    prompt: (p: PromptSpec | null) => void prompts.push(p),
    instruction: () => {},
    activityLayer: () => ({ textContent: '' }) as unknown as HTMLElement,
    banner: () => {},
    toast: () => {},
  } as unknown as UiManager;
  resetWorldState(world);
  // Act V setting (like the game's skipTo(5)): girls at the front door in school clothes, Chris outside
  for (const [g, a] of [
    ['addy', 'entryGather1'],
    ['ellie', 'entryGather2'],
    ['heidi', 'entryGather3'],
  ] as const) {
    const c = family.girl(g);
    if (c.root.parent !== scene) scene.attach(c.root);
    c.setPose('stand');
    const an = world.anchor(a);
    c.root.position.set(an.x, 0, an.z);
  }
  if (family.chris.root.parent !== scene) scene.add(family.chris.root);
  const walker = new WalkerImpl(family.chris, world, audio);
  const s = world.anchor('frontDoorOut');
  walker.teleport(s.x, s.z, s.yaw);
  const rig = new CameraRigImpl();
  const camera = new CameraDirectorImpl(rig, world, () => family.chris.root);
  const npcs = new NpcsImpl(world);
  npcs.placeAt(family.dog, 'dogBed');
  const clock = new GameClockImpl(ACTS[4]!.start);
  clock.mode = 'run';
  clock.rate = ACTS[4]!.rate;
  clock.cap = ACTS[4]!.end;
  const plan = generatePlan(seed);
  const root = new THREE.Group();
  scene.add(root);
  const hud: ActivityHud = { tasks: null, objective: null, meters: null };
  const timers: { left: number; resolve: () => void }[] = [];
  const ctx: ActivityContext = {
    scene,
    root,
    persist: new THREE.Group(),
    world,
    family,
    fx,
    audio,
    ui,
    hud,
    input: { lastDevice: 'keyboard', rumble() {} } as unknown as InputManager,
    pointer: { enable() {}, disable() {} } as unknown as PointerInput,
    camera,
    walker,
    npcs,
    interact: new InteractionsImpl(world),
    clock,
    plan,
    state: freshState(),
    rng: new Rng(hashInts(plan.seed, hashString('drive'))),
    settings: DEFAULT_SETTINGS,
    projector: { project: (_w, o) => void (o.visible = false) },
    renderer: {} as THREE.WebGLRenderer,
    wait: (sec) => new Promise<void>((resolve) => timers.push({ left: sec, resolve })),
    rumble: () => {},
  };
  const run: Run = {
    ctx,
    clock,
    walker,
    bubbles,
    prompts,
    async frame(a, dt = 1 / 20, ctl = NO_CONTROLS) {
      clock.update(dt);
      a.update(dt, ctl);
      walker.update(dt, ctl);
      npcs.update(dt);
      camera.update(dt);
      world.update(dt, rig.camera);
      family.update(dt);
      fx.update(dt, rig.camera);
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i]!;
        t.left -= dt;
        if (t.left <= 0) {
          timers.splice(i, 1);
          t.resolve();
        }
      }
      await Promise.resolve();
      await Promise.resolve();
    },
  };
  return run;
}

/** Peek at the activity's private state (tests only). */
type Dbg = { readonly phase: string; readonly sim: { autopilot: boolean; car: { s: number } } | null };

describe('the school run, played headless', () => {
  it('loads the van, drives the route, drops everyone off and holds the clock', async () => {
    const r = setup(42);
    const a = create();
    a.start(r.ctx);
    const d = a as unknown as Dbg;
    const scheme0 = a.controls();
    expect(scheme0).toBeNull(); // cutscene: no touch buttons
    let t = 0;
    while (d.phase !== 'drive' && t < 40) {
      await r.frame(a);
      t += 1 / 20;
    }
    expect(d.phase).toBe('drive');
    expect(t).toBeLessThan(20); // snappy loading
    // everyone is in the van, the van is on the route
    const car = world.car('minivan');
    for (const g of GIRLS) {
      let p: THREE.Object3D | null = family.girl(g).root.parent;
      let inCar = false;
      for (; p; p = p.parent) if (p === car.root) inCar = true;
      expect(inCar).toBe(true);
    }
    expect(car.root.parent?.name).toBe('route');
    expect(r.bubbles.filter((b) => b === 'click!').length).toBe(3);
    const s1 = a.controls();
    expect(s1).not.toBeNull();
    expect(a.controls()).toBe(s1); // same object while unchanged
    expect(s1!.move).toBe('x');
    expect(s1!.primary?.icon).toBe('gas');
    // drive to school by itself
    d.sim!.autopilot = true;
    const clockAtStart = r.clock.minutes;
    while (!a.done && t < 260) {
      await r.frame(a);
      t += 1 / 20;
    }
    expect(a.done).toBe(true);
    expect(r.clock.mode).toBe('hold');
    expect(r.clock.minutes).toBeGreaterThan(clockAtStart);
    expect(r.clock.minutes).toBeLessThanOrEqual(SCHOOL_DEADLINE);
    expect(r.bubbles).toContain('BYE! LOVE YOU!');
    const res = a.result();
    expect([1, 2, 3]).toContain(res.stars);
    expect(res.flags).toContain('drive:guard');
    // girls got out at school (not parented to the van anymore)
    for (const g of GIRLS) expect(family.girl(g).root.parent).toBe(scene);
    a.dispose();
    // Chris is back on his feet in the scene; the van stays parked at school (the game resets it next morning)
    expect(family.chris.root.parent).toBe(scene);
    expect(family.chris.pose).toBe('stand');
    expect(car.root.parent?.name).toBe('route');
    expect((car.root.children[0] as THREE.Mesh).geometry.getAttribute('position').count).toBeGreaterThan(0);
  }, 240_000);

  it('skip() mid-loading lands on a plausible drop-off (8:01, 2 stars) and never throws', async () => {
    const r = setup(7);
    const a = create();
    a.start(r.ctx);
    for (let i = 0; i < 30; i++) await r.frame(a);
    a.skip!();
    expect(a.done).toBe(true);
    expect(r.clock.mode).toBe('hold');
    expect(r.clock.minutes).toBeGreaterThanOrEqual(T(8, 1) - 1e-6);
    expect(a.result().stars).toBe(2);
    // robust against odd frames after finishing
    a.update(Number.NaN, NO_CONTROLS);
    a.update(-1, NO_CONTROLS);
    a.dispose();
    expect(family.chris.root.parent).toBe(scene);
    for (const g of GIRLS) expect(family.girl(g).pose).toBe('stand');
    // resetting the world brings the van home for the next morning
    resetWorldState(world);
    expect(world.car('minivan').root.parent).toBe(world.root);
  }, 240_000);
});
