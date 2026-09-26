// Morning flow integration (headless): the whole morning under autopilot with a fake UI / input — acts in order,
// every activity recorded, clock monotonic and within 5:15–8:05, a report at the end. Also the Act I rules.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createAudio } from '../../src/audio';
import { createFamily, DEFAULT_LOOKS } from '../../src/family';
import { CameraDirectorImpl } from '../../src/game/cameraDirector';
import { GameClockImpl } from '../../src/game/clock';
import { InteractionsImpl } from '../../src/game/interactions';
import { Morning, type MorningDeps } from '../../src/game/morning';
import { NpcsImpl } from '../../src/game/npcs';
import { WalkerImpl } from '../../src/game/walker';
import { NO_CONTROLS, type InputManager, type PointerInput } from '../../src/input/types';
import { generatePlan, SCHOOL_DEADLINE, T } from '../../src/plan';
import { CameraRigImpl } from '../../src/render/camera';
import { createFx } from '../../src/render/fx';
import { DEFAULT_SETTINGS } from '../../src/storage/types';
import type { BubbleHandle, UiManager } from '../../src/ui/types';
import { createWorld } from '../../src/world';

function fakeUi(log: string[]): UiManager {
  const bubble: BubbleHandle = { move() {}, close() {}, open: false };
  const layer = { textContent: '' } as unknown as HTMLElement;
  return {
    showScreen: () => {},
    screen: 'none',
    onCommand: () => () => {},
    handleMenuActions: () => false,
    setInputDevice: () => {},
    boot: async () => {},
    actCard: async (c) => void log.push(`card:${c.act}:${c.time}`),
    banner: (t) => void log.push(`banner:${t}`),
    bossIntro: async () => {},
    bubble: () => bubble,
    toast: (t) => void log.push(`toast:${t}`),
    choice: async (_t, o) => o[0]!.id,
    setHud: () => {},
    prompt: () => {},
    instruction: () => {},
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

function setup(seed: number) {
  const log: string[] = [];
  const scene = new THREE.Scene();
  const world = createWorld({ quality: 'low' });
  scene.add(world.root);
  const family = createFamily(DEFAULT_LOOKS);
  for (const m of family.members) scene.add(m.root);
  scene.add(family.dog.root);
  const audio = createAudio();
  const walker = new WalkerImpl(family.chris, world, audio);
  const rig = new CameraRigImpl();
  const clock = new GameClockImpl(315);
  const deps: MorningDeps = {
    scene,
    renderer: {} as THREE.WebGLRenderer,
    projector: { project: (_w, o) => void (o.visible = false) },
    world,
    family,
    fx: createFx({ quality: 'low' }),
    audio,
    ui: fakeUi(log),
    input: { lastDevice: 'keyboard', rumble() {} } as unknown as InputManager,
    pointer: fakePointer(),
    camera: new CameraDirectorImpl(rig, world, () => family.chris.root),
    walker,
    npcs: new NpcsImpl(world),
    interactions: new InteractionsImpl(world),
    clock,
    settings: () => DEFAULT_SETTINGS,
    dogName: () => 'Biscuit',
    bestArrival: () => null,
    rumble: () => {},
    seen: () => true,
    markSeen: () => {},
  };
  const m = new Morning(deps, generatePlan(seed));
  return { m, clock, log, family };
}

/** Step the morning with real microtask flushes between frames (the flow is async). */
async function runUntil(m: Morning, pred: () => boolean, maxFrames: number, dt = 1 / 30): Promise<number> {
  for (let i = 0; i < maxFrames; i++) {
    m.update(dt, NO_CONTROLS, []);
    await Promise.resolve();
    await Promise.resolve();
    if (pred()) return i;
  }
  throw new Error('runUntil: condition not reached');
}

// Real modules make this a heavy headless run: generous timeouts under a parallel suite.
describe('Morning (autopilot)', { timeout: 120_000 }, () => {
  it('plays all five acts in order to a report', async () => {
    const { m, clock, log } = setup(99);
    m.autopilot = true;
    m.start();
    let last = clock.minutes;
    let monotonic = true;
    await runUntil(
      m,
      () => {
        if (clock.minutes < last - 1e-9) monotonic = false;
        last = clock.minutes;
        return m.done;
      },
      60_000,
    );
    expect(monotonic).toBe(true);
    const cards = log.filter((l) => l.startsWith('card:')).map((l) => l.split(':')[1]);
    expect(cards).toEqual(['ACT I', 'ACT II', 'ACT III', 'ACT IV', 'ACT V']);
    // Acts start at their scheduled times.
    expect(log).toContain('card:ACT II:6:00 AM');
    expect(log).toContain('card:ACT III:6:30 AM');
    expect(log).toContain('card:ACT IV:7:15 AM');
    expect(log).toContain('card:ACT V:7:50 AM');
    const ids = m.records.map((r) => r.id);
    for (const c of m.plan.chores) expect(ids).toContain(c);
    expect(ids.slice(-4)).toEqual(['wake', 'hair', 'rush', 'drive']);
    expect(m.report).not.toBeNull();
    expect(m.report!.arrival).toBeGreaterThanOrEqual(T(7, 50));
    expect(m.report!.arrival).toBeLessThanOrEqual(SCHOOL_DEADLINE);
    expect(log.some((l) => l === 'banner:COFFEE: SECURED')).toBe(true);
  });

  it('finishing Act I early earns a few minutes of peace before 6:00', async () => {
    const { m, clock } = setup(5);
    m.autopilot = true;
    m.start();
    await runUntil(m, () => m.act === 2, 20_000);
    expect(m.state.flags.has('act1:early')).toBe(true);
    expect(clock.minutes).toBeGreaterThanOrEqual(T(6, 0));
    m.dispose();
  });

  it('jumping to an act starts at that act', async () => {
    const { m, log } = setup(3);
    m.autopilot = true;
    m.start({ act: 4 });
    await runUntil(m, () => m.done, 30_000);
    expect(log.filter((l) => l.startsWith('card:')).map((l) => l.split(':')[1])).toEqual(['ACT IV', 'ACT V']);
    expect(m.records.map((r) => r.id)).toEqual(['rush', 'drive']);
  });
});
