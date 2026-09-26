// ─────────────────────────────────────────────────────────────────────────────
// The family home as pure data (no three.js): rooms, wall runs with openings,
// furniture footprints (shared by the visual builders and collision), anchors,
// hide spots and lamps. Everything is in world metres, Y up, front = +Z.
//
// Plan (centre lines of walls; the house spans x −9…9, z −6.5…4.5):
//
//   z −6.5 ┌──────────┬──────────────┬───────────┬──────────────────┐
//          │  HEIDI   │    TWINS     │   BATH    │     KITCHEN      │  ← stations on the north wall
//   z −2.2 ├───  ─────┴──────  ──────┴──────  ───┤  + dining table  │ back door (east) → YARD
//          │                HALL                    (arch)          │
//   z −0.6 ├───────────  ──┬────────  ──┬────────┴──────  ─────────┤
//          │   MASTER      │   ENTRY    │          LIVING           │
//   z  4.5 └───────────────┴─── door ───┴───────────────────────────┘
//        x −9            −3.6          0.4                          9
//
// West of the house: the driveway (minivan + Ashley's car, nose-in). East: the
// fenced backyard (north-east, beside the kitchen) and the side path with the
// outdoor bins (south of the yard fence). Street along X at z ≈ 13.4…20.6.
// ─────────────────────────────────────────────────────────────────────────────
import type { Anchor, AnchorId, HideSpotId, RoomId } from './types';

export interface Rect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

/** Footprint centred at (x, z) with size w (X) × d (Z). */
export const box = (x: number, z: number, w: number, d: number): Rect => rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2);

export const inRect = (r: Rect, x: number, z: number, pad = 0): boolean =>
  x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;

// ── house dimensions ──────────────────────────────────────────────────────────
export const HOUSE = { x0: -9, x1: 9, z0: -6.5, z1: 4.5 } as const;
export const WALL_H = 2.6;
export const EXT_T = 0.22;
export const INT_T = 0.14;
/** Cut-away walls drop to this height (m). */
export const CUT_H = 0.5;
/** Everything above this height is squashed into [CUT_BASE, CUT_H] when cut. */
export const CUT_BASE = 0.44;
/** Doorway / arch head height (m). */
export const DOOR_HEAD = 2.12;

/** Mattress top height of every bed (m) — the 'lie' pose seatHeight. */
export const BED_MATTRESS_H = 0.5;
/** Dining chair seat height (m) — the 'sit' pose seatHeight at the table. */
export const CHAIR_SEAT_H = 0.45;
/** Couch seat height (m). */
export const COUCH_SEAT_H = 0.42;
/** Kitchen counter height (m). */
export const COUNTER_H = 0.9;
/** Vanity counter height (m). */
export const VANITY_H = 0.86;
/** Dining table top height (m). */
export const TABLE_H = 0.74;

// ── rooms ─────────────────────────────────────────────────────────────────────
export interface RoomDef {
  readonly id: RoomId;
  readonly name: string;
  readonly rects: readonly Rect[];
  readonly inside: boolean;
}

export const ROOMS: readonly RoomDef[] = [
  { id: 'heidi', name: "Heidi's room", rects: [rect(-9, -6.5, -5.4, -2.2)], inside: true },
  { id: 'twins', name: "Addy & Ellie's room", rects: [rect(-5.4, -6.5, -1.0, -2.2)], inside: true },
  { id: 'bath', name: 'Bathroom', rects: [rect(-1.0, -6.5, 2.6, -2.2)], inside: true },
  { id: 'kitchen', name: 'Kitchen', rects: [rect(2.6, -6.5, 9, -0.6)], inside: true },
  { id: 'hall', name: 'Hallway', rects: [rect(-9, -2.2, 2.6, -0.6)], inside: true },
  { id: 'master', name: "Chris & Ashley's room", rects: [rect(-9, -0.6, -3.6, 4.5)], inside: true },
  { id: 'entry', name: 'Front entry', rects: [rect(-3.6, -0.6, 0.4, 4.5)], inside: true },
  { id: 'living', name: 'Living room', rects: [rect(0.4, -0.6, 9, 4.5)], inside: true },
  { id: 'yard', name: 'Backyard', rects: [rect(9, -13, 20.5, -0.8)], inside: false },
  { id: 'side', name: 'Side path', rects: [rect(9, -0.8, 13.6, 4.5)], inside: false },
  { id: 'driveway', name: 'Driveway', rects: [rect(-18.6, -3.6, -10.4, 13.4), rect(-10.4, -3.6, -9, 4.5)], inside: false },
  { id: 'front', name: 'Front yard', rects: [rect(-10.4, 4.5, 21.5, 10.6), rect(13.6, -0.8, 21.5, 4.5)], inside: false },
  { id: 'street', name: 'Street', rects: [rect(-60, 10.6, 60, 24)], inside: false },
];

const ROOM_BY_ID = new Map<RoomId, RoomDef>(ROOMS.map((r) => [r.id, r]));
export const roomDef = (id: RoomId): RoomDef => ROOM_BY_ID.get(id)!;

/** First room whose rects contain (x, z) (house rooms win over outdoor ones). */
export function roomAt(x: number, z: number): RoomId | null {
  for (const r of ROOMS) for (const rc of r.rects) if (x >= rc.x0 && x < rc.x1 && z >= rc.z0 && z < rc.z1) return r.id;
  return null;
}

const BOUNDS_CACHE = new Map<RoomId, Rect>();

/** Bounding rect of a room (union of its rects). Cached — never mutate the result. */
export function roomBounds(id: RoomId): Rect {
  let c = BOUNDS_CACHE.get(id);
  if (!c) {
    c = computeRoomBounds(id);
    BOUNDS_CACHE.set(id, c);
  }
  return c;
}

function computeRoomBounds(id: RoomId): Rect {
  const r = roomDef(id);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const rc of r.rects) {
    x0 = Math.min(x0, rc.x0);
    z0 = Math.min(z0, rc.z0);
    x1 = Math.max(x1, rc.x1);
    z1 = Math.max(z1, rc.z1);
  }
  return { x0, z0, x1, z1 };
}

// ── walls ─────────────────────────────────────────────────────────────────────
export type OpeningKind = 'arch' | 'door' | 'window';

export interface Opening {
  /** Start/end along the wall run (x for E-W walls, z for N-S walls). */
  readonly a: number;
  readonly b: number;
  readonly kind: OpeningKind;
  /** Window sill height. */
  readonly sill?: number;
  /** Top of the opening (door head / window head). */
  readonly head?: number;
  readonly door?: 'front' | 'back';
  /** Window with curtains (girls' rooms). */
  readonly curtains?: 'twins' | 'heidi';
}

export interface WallDef {
  /** Segment id (1-based) — the cut-away unit. */
  readonly id: number;
  /** 'x' = runs along X at z = c (E-W wall); 'z' = runs along Z at x = c (N-S wall). */
  readonly axis: 'x' | 'z';
  readonly c: number;
  readonly a: number;
  readonly b: number;
  readonly t: number;
  readonly ext: boolean;
  /** Room on the negative side (−Z for 'x' walls, −X for 'z' walls) and on the positive side (null = outside). */
  readonly neg: RoomId | null;
  readonly pos: RoomId | null;
  readonly openings: readonly Opening[];
}

const win = (centre: number, w: number, sill = 0.95, head = 2.05, curtains?: 'twins' | 'heidi'): Opening => ({
  a: centre - w / 2,
  b: centre + w / 2,
  kind: 'window',
  sill,
  head,
  ...(curtains ? { curtains } : {}),
});
const arch = (a: number, b: number): Opening => ({ a, b, kind: 'arch', head: DOOR_HEAD });

let wid = 0;
const W = (axis: 'x' | 'z', c: number, a: number, b: number, ext: boolean, neg: RoomId | null, pos: RoomId | null, openings: Opening[] = []): WallDef => ({
  id: ++wid,
  axis,
  c,
  a,
  b,
  t: ext ? EXT_T : INT_T,
  ext,
  neg,
  pos,
  openings,
});

export const WINDOW_TWINS = win(-3.2, 1.15, 0.95, 2.05, 'twins');
export const WINDOW_HEIDI = win(-6.55, 1.1, 0.95, 2.05, 'heidi');
export const FRONT_DOOR: Opening = { a: -2.15, b: -1.05, kind: 'door', head: DOOR_HEAD, door: 'front' };
export const BACK_DOOR: Opening = { a: -5.12, b: -4.02, kind: 'door', head: DOOR_HEAD, door: 'back' };

export const WALLS: readonly WallDef[] = [
  // north facade (full height backdrops; windows show the sky)
  W('x', -6.5, -9, -5.4, true, null, 'heidi', [WINDOW_HEIDI]),
  W('x', -6.5, -5.4, -1.0, true, null, 'twins', [WINDOW_TWINS]),
  W('x', -6.5, -1.0, 2.6, true, null, 'bath'),
  W('x', -6.5, 2.6, 9, true, null, 'kitchen', [win(6.45, 1.1, 1.12, 2.08)]),
  // hall north (bedroom / bath south walls)
  W('x', -2.2, -9, -5.4, false, 'heidi', 'hall', [arch(-6.8, -5.65)]),
  W('x', -2.2, -5.4, -1.0, false, 'twins', 'hall', [arch(-3.0, -1.8)]),
  W('x', -2.2, -1.0, 2.6, false, 'bath', 'hall', [arch(1.2, 2.35)]),
  // hall south / kitchen south
  W('x', -0.6, -9, -3.6, false, 'hall', 'master', [arch(-4.95, -3.8)]),
  W('x', -0.6, -3.6, 0.4, false, 'hall', 'entry', [arch(-1.25, 0.25)]),
  W('x', -0.6, 0.4, 2.6, false, 'hall', 'living'),
  W('x', -0.6, 2.6, 9, false, 'kitchen', 'living', [arch(5.8, 8.2)]),
  // south facade (street side)
  W('x', 4.5, -9, -3.6, true, 'master', null, [win(-6.45, 1.2, 0.9, 2.05)]),
  W('x', 4.5, -3.6, 0.4, true, 'entry', null, [FRONT_DOOR, win(-0.35, 0.7, 0.95, 2.05)]),
  W('x', 4.5, 0.4, 9, true, 'living', null, [win(2.8, 1.6, 0.8, 2.05), win(6.1, 1.6, 0.8, 2.05)]),
  // west facade
  W('z', -9, -6.5, -2.2, true, null, 'heidi', [win(-3.6, 1.0, 0.95, 2.0)]),
  W('z', -9, -2.2, -0.6, true, null, 'hall', [win(-1.4, 0.7, 1.0, 1.9)]),
  W('z', -9, -0.6, 4.5, true, null, 'master', [win(1.05, 1.1, 0.95, 2.05)]),
  // interior N-S
  W('z', -5.4, -6.5, -2.2, false, 'heidi', 'twins'),
  W('z', -1.0, -6.5, -2.2, false, 'twins', 'bath'),
  W('z', 2.6, -6.5, -2.2, false, 'bath', 'kitchen'),
  W('z', 2.6, -2.2, -0.6, false, 'hall', 'kitchen', [arch(-2.12, -0.68)]),
  W('z', -3.6, -0.6, 4.5, false, 'master', 'entry'),
  W('z', 0.4, -0.6, 4.5, false, 'entry', 'living', [arch(0.6, 3.2)]),
  // east facade
  W('z', 9, -6.5, -0.6, true, 'kitchen', null, [BACK_DOOR, win(-2.25, 1.2, 0.95, 2.05)]),
  W('z', 9, -0.6, 4.5, true, 'living', null, [win(3.7, 0.9, 1.0, 2.0)]),
];

export const WALL_COUNT = WALLS.length;

/** Solid pieces of a wall run between its door/arch openings (windows are solid for collision). */
export function solidPieces(w: WallDef, includeWindows = false): [number, number][] {
  const ops = w.openings.filter((o) => includeWindows || o.kind !== 'window').slice().sort((p, q) => p.a - q.a);
  const out: [number, number][] = [];
  let s = w.a;
  for (const o of ops) {
    if (o.a > s + 1e-6) out.push([s, o.a]);
    s = Math.max(s, o.b);
  }
  if (w.b > s + 1e-6) out.push([s, w.b]);
  return out;
}

/** Axis-aligned rect of a wall piece [a, b] (thickness included). */
export function wallRect(w: WallDef, a: number, b: number): Rect {
  const h = w.t / 2;
  return w.axis === 'x' ? rect(a, w.c - h, b, w.c + h) : rect(w.c - h, a, w.c + h, b);
}

/** Door leaf swing specs. */
export interface DoorSpec {
  readonly id: 'front' | 'back';
  readonly wall: WallDef;
  readonly opening: Opening;
  /** Hinge (world) and the closed-leaf direction; the leaf swings by `swing` rad (sign = direction). */
  readonly hingeX: number;
  readonly hingeZ: number;
  readonly width: number;
  /** Closed yaw of the leaf group (leaf extends along its local +X). */
  readonly closedYaw: number;
  readonly swing: number;
}

const FRONT_WALL = WALLS.find((w) => w.openings.includes(FRONT_DOOR))!;
const BACK_WALL = WALLS.find((w) => w.openings.includes(BACK_DOOR))!;

export const DOORS: readonly DoorSpec[] = [
  // Front door: hinge on the west jamb, leaf along +X when closed, swings inward (−Z) by −90°… (yaw +π/2 turns +X → −Z).
  { id: 'front', wall: FRONT_WALL, opening: FRONT_DOOR, hingeX: FRONT_DOOR.a + 0.04, hingeZ: FRONT_WALL.c, width: FRONT_DOOR.b - FRONT_DOOR.a - 0.08, closedYaw: 0, swing: Math.PI / 2 },
  // Back door: hinge on the north jamb, leaf along +Z when closed (yaw −π/2 maps +X → +Z), swings outward into the yard (+X).
  { id: 'back', wall: BACK_WALL, opening: BACK_DOOR, hingeX: BACK_WALL.c, hingeZ: BACK_DOOR.a + 0.04, width: BACK_DOOR.b - BACK_DOOR.a - 0.08, closedYaw: -Math.PI / 2, swing: Math.PI / 2 },
];

/** Collider rect filling a door opening (active while the door is closed). */
export function doorRect(d: DoorSpec): Rect {
  return wallRect(d.wall, d.opening.a, d.opening.b);
}

// ── furniture footprints (colliders + builders share these) ────────────────────
/** Named furniture footprints. `h` = height (m) for reference; `solid` false = walk-over (rugs, dog bed). */
export interface Furn {
  readonly r: Rect;
  readonly h: number;
  readonly solid: boolean;
  /** Circle collider instead of the rect (stools, bins, plants). */
  readonly circle?: number;
}

const F = (r: Rect, h: number, solid = true, circle?: number): Furn => (circle !== undefined ? { r, h, solid, circle } : { r, h, solid });
const Fc = (x: number, z: number, radius: number, h: number): Furn => F(box(x, z, radius * 2, radius * 2), h, true, radius);

// Inner wall faces (handy).
const NORTH_IN = HOUSE.z0 + EXT_T / 2; // −6.39
const SOUTH_IN = HOUSE.z1 - EXT_T / 2; // 4.39
const WEST_IN = HOUSE.x0 + EXT_T / 2; // −8.89
const EAST_IN = HOUSE.x1 - EXT_T / 2; // 8.89
const HALL_N_S = -2.2 + INT_T / 2; // −2.13 (south face of the hall-north wall)
const HALL_N_N = -2.2 - INT_T / 2; // −2.27
const HALL_S_N = -0.6 - INT_T / 2; // −0.67
const HALL_S_S = -0.6 + INT_T / 2; // −0.53

export const IN = { NORTH_IN, SOUTH_IN, WEST_IN, EAST_IN, HALL_N_S, HALL_N_N, HALL_S_N, HALL_S_S } as const;

export const COUNTER_D = 0.62;
const KN = NORTH_IN + COUNTER_D; // kitchen counter front z = −5.77

export const FURN = {
  // kitchen — north run (west → east)
  fridge: F(rect(2.74, NORTH_IN, 3.64, NORTH_IN + 0.72), 1.86),
  lunchCounter: F(rect(3.64, NORTH_IN, 5.14, KN), COUNTER_H),
  coffeeCounter: F(rect(5.14, NORTH_IN, 5.94, KN), COUNTER_H),
  sinkCounter: F(rect(5.94, NORTH_IN, 6.94, KN), COUNTER_H),
  dishwasher: F(rect(6.94, NORTH_IN, 7.54, KN), COUNTER_H),
  cornerCounter: F(rect(7.54, NORTH_IN, 8.14, KN), COUNTER_H),
  kitchenTrash: Fc(8.5, -6.1, 0.22, 0.62),
  // kitchen — west run (stove)
  westCounter: F(rect(2.67, -4.45, 2.67 + COUNTER_D, -2.95), COUNTER_H),
  // dining
  table: F(rect(4.74, -2.95, 6.94, -1.95), TABLE_H),
  chairAddy: F(box(5.19, -3.36, 0.44, 0.44), 0.9),
  chairEllie: F(box(5.84, -3.36, 0.44, 0.44), 0.9),
  chairHeidi: F(box(6.49, -3.36, 0.44, 0.44), 0.9),
  chairChris: F(box(4.29, -2.45, 0.44, 0.44), 0.9),
  chairAshley: F(box(7.39, -2.45, 0.44, 0.44), 0.9),
  dogBowl: F(box(8.55, -3.2, 0.3, 0.55), 0.1, false),
  kitchenRug: F(rect(4.3, -3.9, 7.4, -1.4), 0.01, false),
  kitchenPlant: Fc(8.5, -1.05, 0.26, 1.2),
  // living
  couch: F(rect(1.0, HALL_S_S, 3.4, HALL_S_S + 0.95), 0.85),
  coffeeTable: F(rect(1.6, 1.55, 2.8, 2.15), 0.42),
  livingRug: F(rect(0.8, 0.3, 3.8, 2.9), 0.01, false),
  floorLamp: Fc(0.78, -0.18, 0.2, 1.62),
  dogBed: F(box(4.25, 0.12, 0.95, 0.8), 0.18, false),
  tvConsole: F(rect(EAST_IN - 0.45, 1.1, EAST_IN, 3.1), 0.55),
  armchair: F(box(6.6, 2.5, 0.9, 0.85), 0.85),
  sideTable: Fc(5.85, 3.15, 0.22, 0.55),
  pouf: Fc(5.2, 1.45, 0.26, 0.36),
  livingPlantA: Fc(5.38, -0.18, 0.26, 1.35),
  livingPlantB: Fc(8.5, 4.0, 0.26, 1.1),
  bookcase: F(rect(EAST_IN - 0.36, -0.53, EAST_IN, 0.55), 1.7),
  toyBasket: Fc(0.85, 3.95, 0.24, 0.35),
  // entry
  shoeBench: F(rect(-3.35, HALL_S_S, -1.65, HALL_S_S + 0.42), 0.46),
  entryMat: F(box(-1.6, 3.85, 1.05, 0.62), 0.01, false),
  umbrellaStand: Fc(-3.25, 4.05, 0.16, 0.6),
  entryPlant: Fc(0.05, 4.05, 0.22, 1.0),
  // master
  masterBed: F(rect(-7.3, HALL_S_S, -5.6, HALL_S_S + 2.25), 1.0),
  nightstandW: F(rect(-7.88, HALL_S_S, -7.36, HALL_S_S + 0.45), 0.58),
  nightstandE: F(rect(-5.54, HALL_S_S, -5.02, HALL_S_S + 0.45), 0.58),
  dresser: F(rect(WEST_IN, 2.15, WEST_IN + 0.5, 3.45), 1.0),
  masterChair: F(box(-4.3, 3.62, 0.82, 0.8), 0.85),
  masterRug: F(rect(-7.7, 0.9, -5.2, 3.2), 0.01, false),
  laundryPile: F(box(-8.35, 3.95, 0.7, 0.55), 0.3, false),
  masterPlant: Fc(-3.95, 1.9, 0.24, 1.3),
  // hall
  hallBasket: Fc(-8.5, -1.4, 0.24, 0.42),
  hallRunner: F(rect(-7.9, -1.75, 1.9, -1.05), 0.01, false),
  // heidi
  heidiBed: F(rect(-8.86, NORTH_IN, -7.84, NORTH_IN + 2.0), 0.95),
  toyChest: F(rect(WEST_IN, -3.2, WEST_IN + 0.5, -2.3), 0.55),
  heidiRug: F(box(-7.0, -3.6, 1.8, 1.4), 0.01, false),
  beanBag: Fc(-6.05, -4.3, 0.34, 0.5),
  heidiShelf: F(rect(-6.05, NORTH_IN, -5.47, NORTH_IN + 0.34), 0.9),
  // twins
  bedAddy: F(rect(-5.3, NORTH_IN, -4.3, NORTH_IN + 2.0), 0.95),
  bedEllie: F(rect(-2.1, NORTH_IN, -1.1, NORTH_IN + 2.0), 0.95),
  twinsNightstand: F(rect(-3.45, NORTH_IN, -2.95, NORTH_IN + 0.38), 0.5),
  twinsDesk: F(rect(-5.33, -3.75, -4.73, -2.55), 0.72),
  twinsDeskChair: F(box(-4.42, -3.15, 0.4, 0.4), 0.8),
  twinsBookshelf: F(rect(-1.43, -3.95, -1.07, -2.95), 1.3),
  twinsRug: F(box(-3.2, -3.45, 2.0, 1.5), 0.01, false),
  // bath
  vanity: F(rect(-0.35, NORTH_IN, 2.15, NORTH_IN + 0.55), VANITY_H),
  stool1: Fc(0.15, -5.2, 0.17, 0.52),
  stool2: Fc(0.9, -5.2, 0.17, 0.52),
  stool3: Fc(1.65, -5.2, 0.17, 0.52),
  tub: F(rect(-0.93, -4.25, -0.12, -2.27), 0.58),
  hamper: Fc(2.33, -6.15, 0.17, 0.55),
  bathPlant: Fc(-0.68, -6.12, 0.2, 0.9),
  bathMat: F(box(0.45, -3.3, 0.7, 0.9), 0.01, false),
} as const satisfies Record<string, Furn>;

export type FurnId = keyof typeof FURN;

// ── outdoor footprints ────────────────────────────────────────────────────────
export const YARD = { x0: 9, x1: 20.5, z0: -13, z1: -0.8, gateA: 10.2, gateB: 11.4 } as const;
export const DRIVEWAY = { x0: -18.0, x1: -10.4, z0: -3.2, z1: 13.4 } as const;
export const STREET = { sidewalk0: 10.6, sidewalk1: 12.6, road0: 13.4, road1: 20.6 } as const;

export const OUT = {
  yardBush: Fc(17.2, -9.4, 0.72, 1.05),
  yardTree: Fc(18.9, -11.3, 0.3, 5.2),
  yardTreeSmall: Fc(11.2, -11.9, 0.2, 3.6),
  swingSet: F(rect(13.3, -12.6, 15.9, -11.4), 2.2),
  patioTable: Fc(11.7, -3.6, 0.42, 0.72),
  binTrash: F(box(9.52, 1.05, 0.62, 0.68), 1.05),
  binRecycle: F(box(9.52, 1.95, 0.62, 0.68), 1.05),
  mailbox: Fc(0.35, 10.05, 0.12, 1.15),
  frontTree: Fc(16.6, 8.6, 0.22, 4.4),
  hoseReel: Fc(9.45, 3.3, 0.2, 0.6),
  planterA: Fc(9.55, -6.6, 0.28, 0.6),
} as const satisfies Record<string, Furn>;

/** Car parking (world). Cars face −Z (nose toward the house, yaw π). */
export const CAR_PARK = {
  minivan: { x: -12.3, z: 2.2, yaw: Math.PI, w: 2.0, l: 4.9 },
  ashley: { x: -16.0, z: 2.8, yaw: Math.PI, w: 1.78, l: 4.0 },
} as const;

/** Lot boundary colliders (fences / hedges). */
export const FENCE_T = 0.12;
export interface FenceRun {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly kind: 'picket' | 'hedge';
}
export const FENCES: readonly FenceRun[] = [
  { x0: YARD.x0, z0: YARD.z0, x1: YARD.x1, z1: YARD.z0, kind: 'picket' }, // north
  { x0: YARD.x1, z0: YARD.z0, x1: YARD.x1, z1: YARD.z1, kind: 'picket' }, // east
  { x0: HOUSE.x1 + EXT_T / 2, z0: YARD.z1, x1: YARD.gateA, z1: YARD.z1, kind: 'picket' }, // south (west of the gate)
  { x0: YARD.gateB, z0: YARD.z1, x1: YARD.x1, z1: YARD.z1, kind: 'picket' }, // south (east of the gate)
  { x0: YARD.x0, z0: YARD.z0, x1: YARD.x0, z1: HOUSE.z0 - EXT_T / 2, kind: 'picket' }, // west (behind the house line)
  { x0: -18.6, z0: -3.6, x1: HOUSE.x0 - EXT_T / 2, z1: -3.6, kind: 'hedge' }, // behind the driveway
  { x0: -18.6, z0: -3.6, x1: -18.6, z1: 10.4, kind: 'hedge' }, // west lot line
  { x0: 21.3, z0: -0.8, x1: 21.3, z1: 10.4, kind: 'hedge' }, // east lot line
];

/** World bounds for movement / navigation. */
export const BOUNDS: Rect = rect(-19.2, -13.6, 21.8, 14.0);

// ── anchors ───────────────────────────────────────────────────────────────────
const PI = Math.PI;
const A = (x: number, z: number, yaw: number, room: RoomId, y = 0): Anchor => ({ x, y, z, yaw, room });

/** Lie anchors: root at the FEET end (on the mattress centre line), y = 0, yaw 0 → head toward the north headboard. */
const bedFoot = (r: Rect): number => r.z1;

export const ANCHORS: Readonly<Record<AnchorId, Anchor>> = {
  // master bedroom
  chrisStart: A(-5.05, 1.0, 0, 'master'),
  masterBedChris: A(-6.02, bedFoot(FURN.masterBed.r) - 0.28, 0, 'master'),
  masterBedAshley: A(-6.88, bedFoot(FURN.masterBed.r) - 0.4, 0, 'master'),
  // girls' beds (lie) — chins line up ≈ 0.62 m from the headboard
  bedAddy: A(-4.8, bedFoot(FURN.bedAddy.r) - 0.3, 0, 'twins'),
  bedEllie: A(-1.6, bedFoot(FURN.bedEllie.r) - 0.3, 0, 'twins'),
  bedHeidi: A(-8.35, bedFoot(FURN.heidiBed.r) - 0.46, 0, 'heidi'),
  bedsideAddy: A(-3.88, -5.0, -PI / 2, 'twins'),
  bedsideEllie: A(-2.52, -5.0, PI / 2, 'twins'),
  bedsideHeidi: A(-7.36, -5.15, -PI / 2, 'heidi'),
  curtainTwins: A(-3.2, -5.55, PI, 'twins'),
  curtainHeidi: A(-6.55, -5.55, PI, 'heidi'),
  // kitchen
  coffeeMaker: A(5.45, -5.3, PI, 'kitchen'),
  ashleySpot: A(6.72, -2.45, -PI / 2, 'kitchen', TABLE_H + 0.005),
  sink: A(6.45, -5.3, PI, 'kitchen'),
  lunchCounter: A(4.39, -5.3, PI, 'kitchen'),
  fridge: A(3.19, -5.15, PI, 'kitchen'),
  kitchenTrash: A(8.35, -5.45, PI, 'kitchen'),
  seatAddy: A(5.19, -3.14, 0, 'kitchen'),
  seatEllie: A(5.84, -3.14, 0, 'kitchen'),
  seatHeidi: A(6.49, -3.14, 0, 'kitchen'),
  seatChris: A(4.51, -2.45, PI / 2, 'kitchen'),
  seatAshley: A(7.17, -2.45, -PI / 2, 'kitchen'),
  // doors
  backDoorIn: A(8.3, -4.57, PI / 2, 'kitchen'),
  backDoorOut: A(9.95, -4.45, PI / 2, 'yard'),
  frontDoorIn: A(-1.6, 3.45, 0, 'entry'),
  frontDoorOut: A(-1.6, 5.45, 0, 'front'),
  // yard / outside
  yardCenter: A(14.6, -6.2, 0, 'yard'),
  yardBush: A(17.2, -10.45, PI, 'yard'),
  yardFar: A(19.7, -12.35, (3 * PI) / 4, 'yard'),
  outdoorBin: A(10.45, 1.05, -PI / 2, 'side'),
  dogBed: A(4.25, 0.12, 0, 'living'),
  dogBowl: A(8.05, -3.2, PI / 2, 'kitchen'),
  // bathroom
  vanity: A(0.9, -5.6, PI, 'bath'),
  stool1: A(0.15, -5.37, PI, 'bath'),
  stool2: A(0.9, -5.37, PI, 'bath'),
  stool3: A(1.65, -5.37, PI, 'bath'),
  bathDoor: A(1.78, -2.62, PI, 'bath'),
  // entry / living
  entryGather1: A(-3.0, 2.45, 0, 'entry'),
  entryGather2: A(-2.35, 2.95, 0, 'entry'),
  entryGather3: A(-0.55, 2.8, 0, 'entry'),
  couch: A(2.2, FURN.couch.r.z1 + 0.02, 0, 'living'),
  // car / outside front
  carDriver: A(-14.0, 1.6, PI / 2, 'driveway'),
  carSide: A(-10.55, 2.45, -PI / 2, 'driveway'),
  ashleyCar: A(-17.45, 2.35, PI / 2, 'driveway'),
  drivewayEnd: A(-13.4, 11.2, 0, 'driveway'),
};

/** Anchors that are ON furniture (beds, seats, stools, the table spot) — not free standing spots. */
export const SEATED_ANCHORS: ReadonlySet<AnchorId> = new Set<AnchorId>([
  'masterBedChris',
  'masterBedAshley',
  'bedAddy',
  'bedEllie',
  'bedHeidi',
  'seatAddy',
  'seatEllie',
  'seatHeidi',
  'seatChris',
  'seatAshley',
  'ashleySpot',
  'stool1',
  'stool2',
  'stool3',
  'couch',
  'vanity',
  'yardBush',
]);

// ── hide spots ────────────────────────────────────────────────────────────────
export interface HideSpotDef {
  readonly id: HideSpotId;
  readonly stand: Anchor;
  readonly item: { readonly x: number; readonly y: number; readonly z: number };
  readonly label: string;
}

const H = (id: HideSpotId, stand: Anchor, ix: number, iy: number, iz: number, label: string): HideSpotDef => ({ id, stand, item: { x: ix, y: iy, z: iz }, label });

export const HIDE_SPOTS: readonly HideSpotDef[] = [
  H('couchCushion', A(2.85, 0.98, PI, 'living'), 2.85, COUCH_SEAT_H - 0.04, -0.05, 'under the couch cushion'),
  H('dogBed', A(4.25, 1.02, PI, 'living'), 4.35, 0.14, 0.18, 'in the dog bed'),
  H('bathCounter', A(2.2, -5.35, PI, 'bath'), 1.58, VANITY_H + 0.01, -5.98, 'on the bathroom counter'),
  H('twinsFloor', A(-2.62, -3.45, -PI / 2, 'twins'), -3.3, 0.02, -3.45, "on Addy & Ellie's rug"),
  H('heidiFloor', A(-6.35, -3.55, -PI / 2, 'heidi'), -7.05, 0.02, -3.55, "on Heidi's floor"),
  H('kitchenTable', A(5.3, -1.45, PI, 'kitchen'), 5.2, TABLE_H + 0.01, -2.15, 'on the kitchen table'),
  H('yardGrass', A(13.2, -7.9, PI, 'yard'), 13.2, 0.03, -8.6, 'in the backyard grass'),
  H('masterChair', A(-5.18, 3.62, PI / 2, 'master'), -4.3, 0.47, 3.62, 'on the bedroom chair'),
  H('hallBasket', A(-7.78, -1.4, -PI / 2, 'hall'), -8.5, 0.3, -1.4, 'in the laundry basket'),
  H('entryBench', A(-2.1, 0.5, PI, 'entry'), -2.1, 0.5, -0.3, 'on the shoe bench'),
  H('laundryPile', A(-7.45, 3.75, -PI / 2, 'master'), -8.3, 0.2, 3.95, 'in the laundry pile'),
  H('underTwinsBed', A(-2.5, -4.25, PI / 2, 'twins'), -1.6, 0.06, -4.75, "under Ellie's bed"),
];

// ── lamps ─────────────────────────────────────────────────────────────────────
/** 'night' lamps are on in the dark pre-dawn house; 'house' lamps switch on at 6:00; 'outdoor' = porch / street. */
export type LampGroup = 'night' | 'house' | 'outdoor';

export interface LampDef {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly group: LampGroup;
  /** Floor pool radius (m); 0 = none. */
  readonly pool: number;
  /** Candidate for one of the (max 3) real point lights. */
  readonly point: number;
  /** Halo sprite size (m). */
  readonly halo: number;
  /** Pool on a wall behind the lamp: facing axis ('z+' = wall faces +Z, i.e. a north wall). */
  readonly wall?: 'z+' | 'x+' | 'x-';
}

const L = (x: number, y: number, z: number, group: LampGroup, pool: number, point: number, halo: number, wall?: LampDef['wall']): LampDef =>
  wall ? { x, y, z, group, pool, point, halo, wall } : { x, y, z, group, pool, point, halo };

export const LAMPS: readonly LampDef[] = [
  // master bedside lamps (Chris's side glows at 5:15)
  L(-5.28, 0.95, -0.3, 'night', 1.9, 5, 0.34, 'z+'),
  L(-7.62, 0.95, -0.3, 'house', 1.7, 4, 0.32, 'z+'),
  // living floor lamp
  L(0.78, 1.5, -0.18, 'night', 2.4, 7, 0.4, 'z+'),
  // kitchen: under-cabinet glow + stove hood light
  L(4.39, 1.42, -6.15, 'night', 2.2, 5, 0.3, 'z+'),
  L(2.95, 1.62, -3.7, 'house', 1.6, 0, 0.4),
  L(7.85, 1.42, -6.15, 'house', 1.6, 4, 0.28, 'z+'),
  // hall night light
  L(-2.4, 0.3, -0.72, 'night', 1.2, 2.5, 0.3),
  // entry sconce
  L(-3.0, 1.9, -0.55, 'house', 1.6, 4, 0.45, 'z+'),
  // twins: star lamp on the nightstand + (string lights are decorative)
  L(-3.2, 0.72, -6.2, 'night', 1.6, 2.2, 0.3, 'z+'),
  // heidi: night light
  L(-5.75, 1.05, -6.2, 'night', 1.5, 2.2, 0.3, 'z+'),
  // bath vanity bar
  L(0.9, 2.12, -6.28, 'house', 1.3, 4, 0.22, 'z+'),
  // porch lights + back door light
  L(-2.55, 1.95, 4.68, 'outdoor', 1.8, 0, 0.55),
  L(9.14, 2.0, -3.75, 'outdoor', 1.8, 0, 0.5),
  // street lamps
  L(-12.0, 3.9, 12.95, 'outdoor', 3.2, 0, 1.1),
  L(7.0, 3.9, 12.95, 'outdoor', 3.2, 0, 1.1),
];
