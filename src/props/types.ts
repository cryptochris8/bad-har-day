// ─────────────────────────────────────────────────────────────────────────────
// PROPS CONTRACT — every hand-held / interactive household item used by the
// activities: mugs, coffee things, lunch items + lunchboxes, dishes, trash bag,
// backpacks, shoes, missing items, breakfast, the dog's treat bag…
//
// Owner: props module (src/props/*). SHARED CONTRACT (frozen).
// Conventions: metres (cartoon scale ≈ 1.25× real so items read in the dollhouse
// view), origin at the BOTTOM CENTRE (rests on a surface at y = 0), front faces +Z,
// inked vertex-colour toon geometry from cached builders (cheap to create many).
// For hand-held use, `grip` is an empty at the natural grip point: to hold a prop,
// parent it to a hand socket and set `prop.root.position` = −grip.position.
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';

export type LunchCategory = 'main' | 'snack' | 'drink' | 'fruit';

export type FoodKind =
  // main
  | 'sandwich'
  | 'wrap'
  | 'pastaCup'
  | 'pbj'
  // snack
  | 'crackers'
  | 'pretzels'
  | 'granolaBar'
  | 'cheeseStick'
  // drink
  | 'juiceBox'
  | 'waterBottle'
  | 'milkCarton'
  // fruit
  | 'appleSlices'
  | 'grapes'
  | 'banana'
  | 'clementine'
  // extras
  | 'loveNote';

export const FOOD_CATEGORY: Readonly<Record<FoodKind, LunchCategory | 'extra'>> = {
  sandwich: 'main',
  wrap: 'main',
  pastaCup: 'main',
  pbj: 'main',
  crackers: 'snack',
  pretzels: 'snack',
  granolaBar: 'snack',
  cheeseStick: 'snack',
  juiceBox: 'drink',
  waterBottle: 'drink',
  milkCarton: 'drink',
  appleSlices: 'fruit',
  grapes: 'fruit',
  banana: 'fruit',
  clementine: 'fruit',
  loveNote: 'extra',
};

export const FOOD_NAME: Readonly<Record<FoodKind, string>> = {
  sandwich: 'Sandwich',
  wrap: 'Wrap',
  pastaCup: 'Pasta cup',
  pbj: 'PB & J',
  crackers: 'Crackers',
  pretzels: 'Pretzels',
  granolaBar: 'Granola bar',
  cheeseStick: 'Cheese stick',
  juiceBox: 'Juice box',
  waterBottle: 'Water',
  milkCarton: 'Milk',
  appleSlices: 'Apple slices',
  grapes: 'Grapes',
  banana: 'Banana',
  clementine: 'Clementine',
  loveNote: 'Love note',
};

export type DishKind = 'plate' | 'bowl' | 'cup' | 'glass' | 'fork' | 'spoon' | 'butterKnife' | 'sippy' | 'pan';

/** Act IV missing items. */
export type ItemKind = 'shoe' | 'backpack' | 'libraryBook' | 'waterBottle' | 'hairTie' | 'permissionSlip' | 'jacket' | 'lunchbox';

export type MugDesign = 'sunflower' | 'heart' | 'stripes' | 'dots' | 'plain' | 'bestDad';

export interface Prop {
  readonly root: THREE.Group;
  /** Natural grip point (empty child of root). */
  readonly grip: THREE.Object3D;
  /** Approximate footprint radius (m) for layout / hit tests. */
  readonly radius: number;
  /** Approximate height (m). */
  readonly height: number;
  /** Highlight for "selected / hover" (warm rim glow) 0..1. */
  setHighlight(v: number): void;
  dispose(): void;
}

export interface MugProp extends Prop {
  /** Coffee level 0..1 (liquid surface rises inside). */
  setFill(v: number): void;
  /** Liquid colour (hex) — black coffee → creamy latte. */
  setLiquid(hex: number): void;
  /** Gentle steam wisps (animated in update). */
  setSteam(on: boolean): void;
  update(dt: number): void;
}

export interface LunchboxProp extends Prop {
  /** Lid 0 = closed … 1 = open (hinged at the back). */
  setOpen(v: number): void;
  /** Four compartment spots (main, snack, drink, fruit order) as empties inside the box. */
  readonly slots: readonly THREE.Object3D[];
  /** Spot for the love note (tucked under the lid). */
  readonly noteSlot: THREE.Object3D;
}

export interface TrashBagProp extends Prop {
  /** 0..1 how full/bulgy; `peek` shows an item poking out (something "almost falls out"). */
  setPeek(v: number): void;
}

/*
 * src/props/index.ts exports:
 *   export function makeFood(kind: FoodKind): Prop;
 *   export function makeDish(kind: DishKind, color?: number): Prop;          // color = plate/cup accent
 *   export function makeMug(design: MugDesign): MugProp;
 *   export function makeLunchbox(color: number): LunchboxProp;               // girl colour (PAL.addyMain…)
 *   export function makeTrashBag(): TrashBagProp;
 *   export function makeItem(kind: ItemKind, color: number): Prop;           // girl colour accents
 *   export function makeProp(kind: 'coffeeCarafe' | 'creamer' | 'sugarJar' | 'spoon' | 'treatBag' | 'bananaPeel'
 *     | 'leaf' | 'cerealBox' | 'cerealBowl' | 'toast' | 'keys' | 'alarmClock' | 'stopSign' | 'ball'): Prop;
 *   export const COFFEE_COLORS: { black: number; splash: number; creamSugar: number; latte: number };
 */
