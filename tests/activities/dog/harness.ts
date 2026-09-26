// Headless playthrough harness for the free-roam chores (dog + trash): the REAL world, family, walker, npcs,
// camera director and FX, a fake UI / input, and a frame loop that feeds scripted bot controls — so a whole
// activity can be played start to finish in node. (Not a test file itself: vitest only runs *.test.ts.)
import * as THREE from 'three';
import { createAudio } from '../../../src/audio';
import { Rng, hashInts, hashString } from '../../../src/core/rng';
import { createFamily, DEFAULT_LOOKS } from '../../../src/family';
import { CameraDirectorImpl } from '../../../src/game/cameraDirector';
import { GameClockImpl } from '../../../src/game/clock';
import { InteractionsImpl } from '../../../src/game/interactions';
import { freshState, resetWorldState } from '../../../src/game/morning';
import { NpcsImpl } from '../../../src/game/npcs';
import { WalkerImpl } from '../../../src/game/walker';
import { NO_CONTROLS, type GameControls, type InputManager, type PointerInput } from '../../../src/input/types';
import { generatePlan } from '../../../src/plan';
import { CameraRigImpl } from '../../../src/render/camera';
import { createFx } from '../../../src/render/fx';
import { DEFAULT_SETTINGS } from '../../../src/storage/types';
import type { Activity, ActivityContext, ActivityHud } from '../../../src/activities/types';
import type { ActivityId } from '../../../src/plan/types';
import type { BubbleHandle, PromptSpec, UiManager } from '../../../src/ui/types';
import { createWorld } from '../../../src/world';

export interface UiLog {
  bubbles: string[];
  prompts: (PromptSpec | null)[];
  instructions: (string | null)[];
}

function fakeUi(log: UiLog): UiManager {
  const layer = { textContent: '' } as unknown as HTMLElement;
  return {
    showScreen: () => {},
    screen: 'none',
    onCommand: () => () => {},
    handleMenuActions: () => false,
    setInputDevice: () => {},
    boot: async () => {},
    actCard: async () => {},
    banner: () => {},
    bossIntro: async () => {},
    bubble: (_at, text): BubbleHandle => {
      log.bubbles.push(text);
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
    toast: () => {},
    choice: async (_t, o) => o[0]!.id,
    setHud: () => {},
    prompt: (p) => void log.prompts.push(p),
    instruction: (t) => void log.instructions.push(t),
    activityLayer: () => layer,
    portraits: () => {},
    takeClicks: () => [],
    update: () => {},
    dispose: () => {},
  };
}

function fakePointer(): PointerInput {
  return {
    x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, pressed: false, released: false, vx: 0, vy: 0,
    active: false, source: 'mouse', enabled: false,
    enable() {}, disable() {}, warp() {}, update() {}, dispose() {},
  };
}

export interface Harness {
  ctx: ActivityContext;
  hud: ActivityHud;
  log: UiLog;
  controls: GameControls;
  world: ReturnType<typeof createWorld>;
  family: ReturnType<typeof createFamily>;
  walker: WalkerImpl;
  npcs: NpcsImpl;
  /** Seconds simulated so far. */
  time: number;
  /** One frame: bot → activity → walker/npcs/camera/world/family → timers → microtasks. */
  frame(activity: Activity, dt?: number): Promise<void>;
  dispose(): void;
}

interface Stage {
  scene: THREE.Scene;
  world: ReturnType<typeof createWorld>;
  family: ReturnType<typeof createFamily>;
  audio: ReturnType<typeof createAudio>;
  fx: ReturnType<typeof createFx>;
}

/**
 * The world + family are heavy to build: one shared stage per test file (reset between playthroughs), so a
 * suite of playthroughs doesn't churn hundreds of MB on a busy machine.
 */
let stage: Stage | null = null;
function getStage(): Stage {
  if (stage) return stage;
  const scene = new THREE.Scene();
  const world = createWorld({ quality: 'low' });
  scene.add(world.root);
  const family = createFamily(DEFAULT_LOOKS);
  for (const m of family.members) scene.add(m.root);
  scene.add(family.dog.root);
  stage = { scene, world, family, audio: createAudio(), fx: createFx({ quality: 'low' }) };
  return stage;
}

export function createHarness(seed: number, id: ActivityId, opts: { atStation?: boolean } = {}): Harness {
  const log: UiLog = { bubbles: [], prompts: [], instructions: [] };
  const { scene, world, family, audio, fx } = getStage();
  // Reset the shared stage (a failed test may have skipped its dispose()).
  const chris = family.chris;
  const leftovers: THREE.Object3D[] = [];
  for (const r of [chris.root, family.dog.root]) r.traverse((o) => void (/^(trash|dog):/.test(o.name) && leftovers.push(o)));
  for (const o of leftovers) o.removeFromParent();
  chris.setHold('none');
  chris.setPose('stand');
  chris.cancelAction();
  chris.emote(null);
  const dogRig = family.dog;
  dogRig.cancelAction();
  dogRig.setPose('stand');
  dogRig.emote(null);
  dogRig.lookAt(null);
  const walker = new WalkerImpl(family.chris, world, audio);
  const rig = new CameraRigImpl();
  const camera = new CameraDirectorImpl(rig, world, () => family.chris.root);
  const npcs = new NpcsImpl(world);
  const clock = new GameClockImpl(315);
  clock.mode = 'run';
  clock.rate = 0.17;
  const plan = generatePlan(seed);
  const state = freshState();
  resetWorldState(world);
  world.update(5, rig.camera); // settle doors / lids from the previous playthrough
  const root = new THREE.Group();
  scene.add(root);
  const persist = new THREE.Group();
  scene.add(persist);
  const hud: ActivityHud = { tasks: null, objective: null, meters: null };
  const timers: { left: number; resolve: () => void }[] = [];
  // Chris starts at the chore's station (normal Act I flow) or in the bedroom (dev jump-in).
  const station = id === 'dog' ? world.anchor('backDoorIn') : world.anchor('kitchenTrash');
  const start = opts.atStation === false ? world.anchor('chrisStart') : station;
  walker.teleport(start.x, start.z + (opts.atStation === false ? 0 : 0.6), start.yaw);
  npcs.place(family.dog, { x: start.x - 1, y: 0, z: start.z + 0.8 }, 0);
  npcs.follow(family.dog, family.chris.root, { distance: 1.2 });
  const controls: GameControls = { ...NO_CONTROLS };
  const ctx: ActivityContext = {
    scene,
    root,
    persist,
    world,
    family,
    fx,
    audio,
    ui: fakeUi(log),
    hud,
    input: { lastDevice: 'keyboard', rumble() {} } as unknown as InputManager,
    pointer: fakePointer(),
    camera,
    walker,
    npcs,
    interact: new InteractionsImpl(world),
    clock,
    plan,
    state,
    rng: new Rng(hashInts(plan.seed, hashString(id))),
    settings: DEFAULT_SETTINGS,
    projector: { project: (_w, o) => void (o.visible = false) },
    renderer: {} as THREE.WebGLRenderer,
    wait: (s) => new Promise<void>((resolve) => timers.push({ left: s, resolve })),
    rumble: () => {},
  };
  const h: Harness = {
    ctx,
    hud,
    log,
    controls,
    world,
    family,
    walker,
    npcs,
    time: 0,
    async frame(activity, dt = 1 / 20) {
      h.time += dt;
      clock.update(dt);
      activity.update(dt, controls);
      walker.update(dt, controls);
      npcs.update(dt);
      camera.update(dt);
      world.update(dt, rig.camera);
      // Only the two actors on stage (the others sleep; keeps the headless run light).
      family.chris.update(dt);
      family.dog.update(dt);
      for (let i = timers.length - 1; i >= 0; i--) {
        const t = timers[i]!;
        t.left -= dt;
        if (t.left <= 0) {
          timers.splice(i, 1);
          t.resolve();
        }
      }
      // Edges last one frame.
      controls.primaryPressed = controls.primaryReleased = false;
      controls.secondaryPressed = controls.secondaryReleased = false;
      await Promise.resolve();
      await Promise.resolve();
    },
    dispose() {
      // The stage is shared: only detach this playthrough's own groups.
      scene.remove(root, persist);
    },
  };
  return h;
}

/** Press (edge) or release primary / secondary for the next frame. */
export function press(c: GameControls, slot: 'primary' | 'secondary'): void {
  if (slot === 'primary') {
    c.primary = true;
    c.primaryPressed = true;
  } else {
    c.secondary = true;
    c.secondaryPressed = true;
  }
}

export function release(c: GameControls, slot: 'primary' | 'secondary'): void {
  if (slot === 'primary') {
    if (c.primary) c.primaryReleased = true;
    c.primary = false;
  } else {
    if (c.secondary) c.secondaryReleased = true;
    c.secondary = false;
  }
}

/** Point the stick at a world target (camera-relative: +X right, −Z up the screen). */
export function steer(c: GameControls, from: { x: number; z: number }, to: { x: number; z: number }, gain = 1): void {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.05) {
    c.moveX = c.moveY = 0;
    return;
  }
  const k = Math.min(1, gain) / l;
  c.moveX = dx * k;
  c.moveY = -dz * k;
}
