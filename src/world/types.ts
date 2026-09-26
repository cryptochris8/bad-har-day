// ─────────────────────────────────────────────────────────────────────────────
// WORLD CONTRACT — the family home (dollhouse cut-away), yard, driveway, cars,
// street, time-of-day sky & lighting, and the school-run route.
//
// Owner: world module (src/world/*). SHARED CONTRACT (frozen): changes go through
// the integrator.
//
// COORDINATES: metres, Y up, floor at y = 0. The house FRONT (street side) faces +Z.
// The exploration ("dollhouse") camera always looks from the +Z side toward −Z
// (yaw 0), pitched down DOLLHOUSE_VIEW.pitchDeg. So:
//  • walls whose line of sight to the focus point faces the camera are cut down low (Sims-style);
//  • every station / piece of furniture the close-up cameras look at stands against a wall
//    that is BEHIND it as seen from +Z (a north wall), facing +Z (yaw 0);
//  • every walkable area (rooms, backyard, driveway) must be visible from that camera without being hidden
//    by full-height geometry — e.g. the backyard is BESIDE/behind-beside the house, not straight behind it.
// Character yaw convention: yaw 0 faces +Z (toward the camera), yaw π faces −Z (toward a north wall).
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';
import type { Vec3Like } from '../render/types';

/** Fixed exploration camera (shared by world cut-away logic and the game's camera director). */
export const DOLLHOUSE_VIEW = {
  pitchDeg: 52,
  /** Camera distance from the focus point (m). */
  distance: 13.5,
  fov: 38,
  /** Focus point height above the floor (m). */
  focusY: 0.9,
} as const;

export type RoomId =
  | 'kitchen' // kitchen + dining table
  | 'living'
  | 'hall'
  | 'entry' // front entrance: door, shoe bench, backpack hooks
  | 'master' // Chris & Ashley's bedroom
  | 'twins' // Addy & Ellie's shared room
  | 'heidi' // Heidi's room
  | 'bath' // bathroom with the long vanity (three stools)
  | 'yard' // fenced backyard (dog)
  | 'side' // side path / trash bins
  | 'driveway'
  | 'front' // front lawn / walk
  | 'street';

export interface Anchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing a character should use here (rad, 0 = +Z). */
  readonly yaw: number;
  readonly room: RoomId;
}

/** Named spots every activity can rely on. All exist in every house build. */
export type AnchorId =
  // wake-up / beds
  | 'chrisStart' // beside the master bed, 5:15 AM start
  | 'masterBedChris' // lie pose (root + yaw) on Chris's side
  | 'masterBedAshley' // lie pose on Ashley's side
  | 'bedAddy'
  | 'bedEllie'
  | 'bedHeidi' // the SLEEPER'S FEET in the girls' beds (yaw = head toward −Z local); use layInBed() (src/game/morning.ts)
  | 'bedsideAddy'
  | 'bedsideEllie'
  | 'bedsideHeidi' // where Chris stands to wake each girl (facing the bed)
  | 'curtainTwins'
  | 'curtainHeidi' // stand here to open the curtains
  // kitchen
  | 'coffeeMaker' // stand here, facing the coffee maker (close-up station)
  | 'ashleySpot' // where Ashley's finished coffee is set down (counter/table spot)
  | 'sink' // stand here for dishes (sink + dishwasher station)
  | 'lunchCounter' // stand here for lunch prep (station)
  | 'fridge'
  | 'kitchenTrash' // stand here to pull the trash bag
  | 'seatAddy'
  | 'seatEllie'
  | 'seatHeidi'
  | 'seatChris'
  | 'seatAshley' // breakfast table seats: root at the seat front, yaw facing the table
  // doors (inside = in the house facing the door, outside = just outside facing away from it)
  | 'backDoorIn'
  | 'backDoorOut'
  | 'frontDoorIn'
  | 'frontDoorOut'
  // yard / outside
  | 'yardCenter'
  | 'yardBush' // the dog's discreet bush (dog stands behind it)
  | 'yardFar' // far corner of the yard (stare-into-the-distance spot)
  | 'outdoorBin' // stand here to toss the trash into the outdoor bin
  | 'dogBed'
  | 'dogBowl'
  // bathroom
  | 'vanity' // centre of the vanity (camera reference)
  | 'stool1'
  | 'stool2'
  | 'stool3' // brushing seats: root at stool front, yaw π (girl faces the mirror / −Z), seatHeight VANITY_STOOL_H
  | 'bathDoor' // doorway (Mom's dramatic entrance)
  // entry / living
  | 'entryGather1'
  | 'entryGather2'
  | 'entryGather3' // where the girls wait at the front door (Act IV)
  | 'couch'
  // car / outside front
  | 'carDriver' // stand here to get into the minivan (driver side)
  | 'carSide' // girls get in here (sliding door side)
  | 'ashleyCar' // Ashley's car door
  | 'drivewayEnd';

/** Seat height of the vanity stools (m). */
export const VANITY_STOOL_H = 0.52;

/** Where missing items can be hidden in Act IV. Each has an item rest position. */
export type HideSpotId =
  | 'couchCushion'
  | 'dogBed'
  | 'bathCounter'
  | 'twinsFloor'
  | 'heidiFloor'
  | 'kitchenTable'
  | 'yardGrass'
  | 'masterChair'
  | 'hallBasket'
  | 'entryBench'
  | 'laundryPile'
  | 'underTwinsBed';

export interface HideSpot {
  readonly id: HideSpotId;
  /** Where Chris stands to pick the item up. */
  readonly stand: Anchor;
  /** Where the item model rests (world). */
  readonly item: Vec3Like;
  /** Short label for the prompt, e.g. "under the couch cushion". */
  readonly label: string;
}

// ── Interactive fixtures ─────────────────────────────────────────────────────

export interface Door {
  readonly id: 'back' | 'front';
  /** 0 = closed … 1 = open (animated toward the target). */
  readonly openness: number;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Closed doors block movement (collision). */
}

export interface Bed {
  readonly id: 'addy' | 'ellie' | 'heidi' | 'master';
  /** 'tucked' = blanket up to the chin · 'burrito' = covers the head (wiggle-able lump) · 'thrown' = pulled back · 'made' = neat, nobody in it. */
  setBlanket(state: 'tucked' | 'burrito' | 'thrown' | 'made'): void;
  /** Blanket lump wiggle amplitude 0..1 (decays by itself after ~0.6 s; call repeatedly to keep it going). */
  wiggle(amount: number): void;
}

export interface Curtains {
  readonly room: 'twins' | 'heidi';
  readonly isOpen: boolean;
  open(): void;
  close(): void;
}

/**
 * Stations. Every `Object3D` handle is a positioned empty in world space (children allowed — activities may
 * parent their props to these). Everything faces +Z (toward the camera) unless noted.
 */
export interface Fixtures {
  coffeeMaker: {
    readonly root: THREE.Object3D;
    setBrewing(on: boolean): void;
    /** Where a mug stands to be filled (on the drip tray). */
    readonly mugSpot: THREE.Object3D;
  };
  /** Mug shelf / cabinet next to the coffee maker: 4 slots where mugs stand (the activity places the mugs). */
  mugShelf: { readonly root: THREE.Object3D; readonly slots: readonly THREE.Object3D[] };
  sink: { readonly root: THREE.Object3D; setWater(on: boolean): void; readonly basin: THREE.Object3D };
  dishwasher: {
    readonly root: THREE.Object3D;
    /** Door 0 = closed … 1 = fully open (drops toward +Z). */
    setDoor(open: number): void;
    /** Racks slide out toward +Z (0..1). */
    setRacks(out: number): void;
    readonly bottomRack: THREE.Object3D;
    readonly topRack: THREE.Object3D;
    readonly basket: THREE.Object3D;
  };
  /** Clear counter area for lunch packing (≥ 1.2 m wide). */
  lunchCounter: { readonly root: THREE.Object3D; readonly surface: THREE.Object3D };
  kitchenTrash: { readonly root: THREE.Object3D; setLid(open: number): void; setBag(visible: boolean): void };
  outdoorBin: { readonly root: THREE.Object3D; setLid(open: number): void; readonly mouth: THREE.Object3D };
  fridge: { readonly root: THREE.Object3D; setDoor(open: number): void };
  vanity: {
    readonly root: THREE.Object3D;
    /** Counter top empty where the brushes lie for the scramble (x spread ≈ ±0.6 m). */
    readonly counter: THREE.Object3D;
    /** The mirror plane (a Mesh, faces +Z). Activities may swap its material (reflection render target). */
    readonly mirror: THREE.Mesh;
  };
  /** Breakfast table top (centre). */
  table: { readonly root: THREE.Object3D; readonly top: THREE.Object3D };
}

export interface CarHandle {
  readonly root: THREE.Group;
  /** Door open amount 0..1 per door: 0 driver, 1 passenger, 2 sliding (girls' side), 3 trunk. */
  setDoor(door: 0 | 1 | 2 | 3, open: number): void;
  /** Wheels spin by the distance moved SINCE THE LAST CALL (m); steer angle (rad) turns the front wheels. */
  roll(distance: number, steer: number): void;
  setBrakeLights(on: boolean): void;
  setHeadlights(on: boolean): void;
  /** Seat anchors in CAR-LOCAL space (root + yaw 0 = facing +Z; use pose 'sit'/'drive' with the given seatHeight). */
  readonly seats: readonly { readonly x: number; readonly y: number; readonly z: number; readonly seatHeight: number }[];
}

// ── The house world ──────────────────────────────────────────────────────────

export interface World {
  readonly root: THREE.Group;
  anchor(id: AnchorId): Anchor;
  readonly hideSpots: readonly HideSpot[];
  hideSpot(id: HideSpotId): HideSpot;
  roomAt(x: number, z: number): RoomId | null;
  /** Room display name ("Kitchen", "Addy & Ellie's room"). */
  roomName(id: RoomId): string;
  readonly fixtures: Fixtures;
  door(id: 'back' | 'front'): Door;
  bed(id: 'addy' | 'ellie' | 'heidi' | 'master'): Bed;
  curtains(room: 'twins' | 'heidi'): Curtains;
  /** 'minivan' = the family car (Chris drives the girls), 'ashley' = Ashley's car. */
  car(id: 'minivan' | 'ashley'): CarHandle;
  /**
   * Move a circle of radius r from (x, z) by (dx, dz) against walls, furniture, fences and CLOSED doors,
   * sliding along obstacles. Writes the result to `out`. Allocation-free.
   */
  move(x: number, z: number, r: number, dx: number, dz: number, out: { x: number; z: number }): void;
  /** True when a circle fits at (x, z). */
  free(x: number, z: number, r: number): boolean;
  /**
   * Walking path (ground points, y = 0) from `from` to `to` through doorways, avoiding furniture; the last point is
   * `to` (snapped to the nearest free spot). Closed doors are treated as open (the caller opens them).
   */
  navPath(from: Vec3Like, to: Vec3Like): Vec3Like[];
  /** Minutes since midnight (315 = 5:15 AM … 485 = 8:05 AM). Drives sky, sun, lamps, windows. */
  setClock(minutes: number): void;
  setWeather(weather: 'clear' | 'cloudy' | 'drizzle'): void;
  /** Ground height (m) at (x, z) — 0 everywhere in the house; FX use it as the particle floor. */
  floorAt(x: number, z: number): number;
  /**
   * Cut-away control: the point the camera is focused on this frame. The world lowers walls between the camera and
   * this point (and restores the rest), animated. 'closeup' mode keeps full walls around a station except walls
   * directly between the camera and the focus.
   */
  setFocus(x: number, z: number, mode: 'dollhouse' | 'closeup'): void;
  /** Glowing interaction marker (pulsing ring + sparkle column) at a world point; returns a remover. */
  marker(at: Vec3Like, color?: number): { move(at: Vec3Like): void; remove(): void };
  /** Per-frame: sky follows the camera, animated fixtures, cut-away fades, lamp flicker. */
  update(dt: number, camera: THREE.Camera): void;
  /** Lights + sky are shared with the school-run route (see DriveRoute). */
  readonly lighting: WorldLighting;
  dispose(): void;
}

export interface WorldLighting {
  readonly hemi: THREE.HemisphereLight;
  /** The single shadow-casting key light (moon → sun). */
  readonly key: THREE.DirectionalLight;
  /** Shadow camera follows this point (set by the game to the camera focus). */
  setShadowFocus(x: number, z: number): void;
}

// ── The school-run route (Act V) ─────────────────────────────────────────────

/**
 * A straight-ish cheerful neighbourhood road built far from the house (world offset chosen by the world module),
 * in ROUTE SPACE: the road runs from s = 0 (leaving home) to s = length along −Z of `root`. Lanes (both driving our
 * direction): lane centre x = LANE_X[i] in route space. Sidewalks beyond |x| > 5.2.
 */
export const LANE_X: readonly number[] = [-1.8, 1.8];

export interface DriveRoute {
  readonly root: THREE.Group;
  readonly length: number;
  /** Route-space s → world position of the road centre line. */
  pointAt(s: number, x: number, out: THREE.Vector3): THREE.Vector3;
  /** Crosswalks (s) — crossing guard / geese / joggers cross here. */
  readonly crosswalks: readonly number[];
  /** Traffic lights (s): set their colour; the route draws the lights. */
  readonly lights: readonly number[];
  setLight(index: number, color: 'red' | 'yellow' | 'green'): void;
  /** Where the drop-off zone starts/ends (s) and its lateral x (pull-in lane on the right). */
  readonly dropoff: { readonly s0: number; readonly s1: number; readonly x: number };
  update(dt: number, camera: THREE.Camera): void;
  dispose(): void;
}

/*
 * src/world/index.ts exports:
 *   export function createWorld(opts: { quality: 'high' | 'low' }): World;
 *   export function createDriveRoute(world: World, seed: number): DriveRoute;   // parented under world.root
 */
