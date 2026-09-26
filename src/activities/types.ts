// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY CONTRACT — every playable piece of the morning (chores, wake-up,
// hair, rush, school run) implements Activity. The game (src/game/*) owns the
// flow, the clock, the free-roam exploration, and the services below; an
// activity borrows them while it runs.
// Owner: integration. SHARED CONTRACT (frozen).
//
// Lifecycle: factory() → start(ctx) → update(dt, controls) every frame (dt = 0 while paused, controls neutral) →
// when `done` becomes true the game calls result() then dispose(), removes `ctx.root` (disposeTree) and shows the
// banner / ticks the task. The game resets after dispose(): pointer, prompt, instruction, portraits, activity layer,
// walker (enabled, speed), camera (follow Chris). The activity must restore character poses/holds it set on Chris
// (setHold('none'), setPose('stand')) and anything it re-parented. World fixtures/doors/cars may be left as the story
// needs them (a new morning resets the world).
// Timing: each act has a hard end (ACTS in src/plan/types.ts). The clock is CAPPED at the act's end: once
// ctx.clock.minutes ≥ act end − 1, wrap up gracefully (Mom arrives, the last item turns up, the school appears) —
// never fail. Required story beats may keep going; the clock simply blinks at the cap.
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';
import type { AudioEngine } from '../audio/types';
import type { Rng } from '../core/rng';
import type { Character, Dog, Family, GirlId } from '../family/types';
import type { MugDesign } from '../props/types';
import type { ControlScheme, GameControls, InputManager, PointerInput } from '../input/types';
import type { ActivityId, ActivityResult, DayPlan } from '../plan/types';
import type { CameraGoal, CameraRig, Fx, Projector, Vec3Like } from '../render/types';
import type { Settings } from '../storage/types';
import type { IconId, Meter, TaskItem, UiManager } from '../ui/types';
import type { AnchorId, World } from '../world/types';

// ── Services ─────────────────────────────────────────────────────────────────

export interface GameClock {
  /** Minutes since midnight (fractional). */
  readonly minutes: number;
  /** 'run' advances at `rate`; 'hold' freezes (cutscenes, act cards, pause). Activities may set it. */
  mode: 'run' | 'hold';
  /** Game minutes per real second while running (set per act by the game; activities may scale it briefly). */
  rate: number;
  /** Jump forward (montages: "breakfast +8 min"). Never backwards. */
  advance(minutes: number): void;
  /** "5:15 AM" */
  label(): string;
}

/** The player-controlled character in free roam (Chris). The game moves it from controls while `enabled`. */
export interface Walker {
  readonly character: Character;
  /** Read controls and move (camera-relative, collision via world.move). */
  enabled: boolean;
  /** Walk speed (m/s, default 2.4). Activities may lower it (carrying the trash bag). */
  speed: number;
  readonly position: THREE.Vector3;
  /** Current velocity (m/s, world XZ). */
  readonly velocity: THREE.Vector3;
  readonly yaw: number;
  teleport(x: number, z: number, yaw: number): void;
  /** Scripted walk along world.navPath (input ignored meanwhile). Resolves on arrival. */
  walkTo(target: Vec3Like, opts?: { speed?: number; faceYaw?: number }): Promise<void>;
  /** Turn in place (animated) to a yaw. */
  face(yaw: number): void;
}

export type Mover = Character | Dog;

/**
 * NPC movement (girls, Ashley, the dog). The game animates setMotion + root position/yaw each frame for every mover
 * it has been given an order (walkTo/place/follow/wander…). To pose/move a mover by hand (sitting it on a stool,
 * parenting it to a car seat), call release(who) first so the director stops writing its root transform.
 */
export interface Npcs {
  /** Walk along a nav path; replaces any current order. Resolves on arrival (or when cancelled by a new order). */
  walkTo(who: Mover, to: Vec3Like, opts?: { speed?: number; faceYaw?: number; style?: 'walk' | 'run' | 'sleepwalk' }): Promise<void>;
  /** Teleport. */
  place(who: Mover, at: Vec3Like, yaw: number): void;
  /** Place at a world anchor (position + yaw). */
  placeAt(who: Mover, anchor: AnchorId): void;
  /** Follow a moving object at a distance (the dog follows Chris; a guided sleepwalker follows Chris). */
  follow(who: Mover, leader: THREE.Object3D, opts?: { distance?: number; speed?: number }): void;
  /** Wander randomly near a point within a radius (the dog in the yard). */
  wander(who: Mover, around: Vec3Like, radius: number, opts?: { speed?: number; pause?: number }): void;
  stop(who: Mover): void;
  /** Stop driving this mover's root transform entirely (manual control). Any later order re-acquires it. */
  release(who: Mover): void;
  isBusy(who: Mover): boolean;
  /** Make a character face a point (turns smoothly). */
  faceToward(who: Mover, at: Vec3Like): void;
}

export interface CameraDirector {
  /** Raw rig: setGoal every frame or once, snap, shake, kick. */
  readonly rig: CameraRig;
  readonly camera: THREE.PerspectiveCamera;
  /** Dollhouse follow (the default view) of a target object; null = the walker. */
  follow(target?: THREE.Object3D | null): void;
  /** Take manual control with a goal (close-ups). Also switches the world cut-away to 'closeup' around the target. */
  shot(goal: CameraGoal, stiffness?: number): void;
  readonly mode: 'follow' | 'shot';
}

/** Free-roam interaction points: the game shows the nearest in-range one as a prompt and calls onUse. */
export interface Interactable {
  id: string;
  at: Vec3Like;
  /** Reach radius (m), default 1.2. */
  radius?: number;
  /** Prompt text, e.g. "Open the back door". */
  label: string;
  slot?: 'primary' | 'secondary';
  /** Hidden when this returns false. */
  enabled?: () => boolean;
  /** Draw the world marker (glowing ring) while enabled. */
  marker?: boolean;
  onUse: () => void;
}

export interface Interactions {
  add(i: Interactable): () => void;
}

/** Cross-activity facts (payoffs + report card). Mutable by activities. */
export interface MorningState {
  coffee: { made: boolean; stars: number; mug: MugDesign | null; liquid: number };
  lunches: { packed: boolean; notes: number };
  dogOut: boolean;
  trashOut: boolean;
  dishesDone: boolean;
  /** Times Chris made noise near sleeping girls (flavour). */
  loud: number;
  girlsUp: Record<GirlId, boolean>;
  hair: Record<GirlId, { smooth: number; momFinished: boolean; blackBrushSeconds: number; solo: boolean }>;
  itemsFound: number;
  ashleyLeft: boolean;
  /** Free-form award hints ('dog:fast', 'coffee:perfect'…). */
  flags: Set<string>;
}

/**
 * The activity's part of the HUD. The game owns ui.setHud() (it composes the clock + act label every frame), so
 * activities must NOT call ui.setHud themselves — write these fields instead (null = use the game's default).
 */
export interface ActivityHud {
  /** Sub-task checklist ("Wake Addy", "Wake Ellie"…) replacing the act's task list while set. */
  tasks: TaskItem[] | null;
  /** One-line objective under the task list. */
  objective: string | null;
  meters: Meter[] | null;
}

export interface ActivityContext {
  readonly scene: THREE.Scene;
  /** Parent for this activity's own objects — disposed after the activity ends. */
  readonly root: THREE.Group;
  /**
   * Parent for objects that must OUTLIVE the activity (Ashley's finished coffee at 'ashleySpot', the packed
   * lunchboxes…). Cleared when the morning ends. Name them so later activities can find them:
   *   'ashleys-coffee' (a MugProp root)          — made by coffee, picked up by wake / rush
   *   'lunchbox:addy' | 'lunchbox:ellie' | 'lunchbox:heidi' — made by lunch, used by rush
   * Find with ctx.persist.getObjectByName(name).
   */
  readonly persist: THREE.Group;
  readonly world: World;
  readonly family: Family;
  readonly fx: Fx;
  readonly audio: AudioEngine;
  /** Modal calls (choice / actCard / bossIntro) automatically switch input to menu navigation while open. */
  readonly ui: UiManager;
  /** This activity's HUD fields (see ActivityHud). */
  readonly hud: ActivityHud;
  readonly input: InputManager;
  readonly pointer: PointerInput;
  readonly camera: CameraDirector;
  readonly walker: Walker;
  readonly npcs: Npcs;
  readonly interact: Interactions;
  readonly clock: GameClock;
  readonly plan: DayPlan;
  readonly state: MorningState;
  /** Seeded per activity (plan seed + activity id). */
  readonly rng: Rng;
  readonly settings: Readonly<Settings>;
  readonly projector: Projector;
  /** For render targets (the bathroom mirror reflection). */
  readonly renderer: THREE.WebGLRenderer;
  /** Resolves after `seconds` of UNPAUSED game time. */
  wait(seconds: number): Promise<void>;
  /** Rumble (gamepad / phone vibration), respects settings. */
  rumble(kind: 'light' | 'medium' | 'heavy' | 'score'): void;
}

// ── Activity ─────────────────────────────────────────────────────────────────

export interface Activity {
  readonly id: ActivityId;
  start(ctx: ActivityContext): void;
  /** dt = 0 while paused. */
  update(dt: number, controls: GameControls): void;
  /** Touch overlay + prompts for the current phase. Return the SAME object while unchanged (compared by identity). */
  controls(): ControlScheme | null;
  readonly done: boolean;
  result(): ActivityResult;
  dispose(): void;
  /** Debug/e2e: finish right now with a plausible result (autopilot). */
  skip?(): void;
}

export interface ActivityInfo {
  id: ActivityId;
  /** Task-list label ("Take the dog out"). */
  label: string;
  icon: IconId;
  /** Banner when done ("DOG: WALKED"), shown by the game. */
  banner: string;
  /** Act I stations: where Chris starts it in free roam (interact prompt), null = starts when its act starts. */
  station: AnchorId | null;
  /** Station prompt text ("Make Ashley's coffee"). */
  prompt: string;
  create: () => Activity;
}

/*
 * src/activities/registry.ts (integration) exports ACTIVITIES: Record<ActivityId, ActivityInfo>, and every
 * activity folder exports `export const create: () => Activity` from its index.ts:
 *   src/activities/dog/  coffee/  lunch/  trash/  dishes/  wake/  hair/  rush/  drive/
 */
