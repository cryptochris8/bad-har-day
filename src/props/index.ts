// ─────────────────────────────────────────────────────────────────────────────
// PROPS — every hand-held / interactive household item (contract: ./types.ts).
// Procedural, inked, vertex-coloured toon models built with GeoBuilder, geometry
// cached per kind/colour (creating many is cheap: one Mesh per part sharing the
// cached geometry + the shared model material). Cartoon scale ≈ 1.25× real,
// origin at the bottom centre, front toward +Z, `grip` at the natural grip point.
//
//   makeFood(kind)            16 lunch items + the love note
//   makeDish(kind, color?)    dishwasher dishes (+ setDirty(v) for the rinse beat)
//   makeMug(design)           6 designs; setFill / setLiquid / setSteam / update
//   makeLunchbox(color)       hinged lid, 4 compartment slots, note slot
//   makeTrashBag()            knotted, bulgy; setPeek(v) = banana peel pokes out
//   makeItem(kind, color)     Act IV missing items tinted with the girl's colour
//   makeProp(kind)            misc (carafe, creamer, … stop sign, ball)
//   fitInSlot(prop, slot)     scale/orient a prop into a lunchbox compartment
// ─────────────────────────────────────────────────────────────────────────────
import { PAL } from '../render/palette';
import { BaseProp, propGeo } from './base';
import { DEFAULT_ACCENT, DISH_KINDS, DISH_SPECS } from './dishes';
import { FOOD_BUILDERS, FOOD_KINDS } from './food';
import { ITEM_KINDS, ITEM_SPECS } from './items';
import { Lunchbox } from './lunchbox';
import { MISC_KINDS, MISC_SPECS, type MiscKind } from './misc';
import { MUG_DESIGNS, Mug } from './mug';
import { TrashBag } from './trashbag';
import type { DishKind, FoodKind, ItemKind, LunchboxProp, MugDesign, MugProp, Prop, TrashBagProp } from './types';

export { COFFEE_COLORS, MUG_DESIGNS, liquidY, MUG_LIQUID } from './mug';
export { FOOD_KINDS } from './food';
export { DISH_KINDS } from './dishes';
export { ITEM_KINDS } from './items';
export { MISC_KINDS, type MiscKind } from './misc';
export { fitInSlot, slotFit, slotLayout, LUNCHBOX, type SlotFit, type SlotSize } from './lunchbox';
export type { DishKind, FoodKind, ItemKind, LunchboxProp, MugDesign, MugProp, Prop, TrashBagProp } from './types';

/** A dish with an optional "sticky" overlay (syrup, milk, crumbs) for the rinse beat. */
export interface DishProp extends Prop {
  /** 0 = clean … 1 = sticky (overlay visible and full size). */
  setDirty(v: number): void;
}

/** Default dish accent colour (plate rims, bowls, cups, cutlery handles). */
export const DISH_ACCENT = DEFAULT_ACCENT;

/** Put the grip at the centre of the measured bounds (half height). */
function centreGrip(p: BaseProp): void {
  const bb = p.root.userData.bounds as { min: { x: number; z: number }; max: { x: number; z: number } } | undefined;
  const cx = bb ? (bb.min.x + bb.max.x) / 2 : 0;
  const cz = bb ? (bb.min.z + bb.max.z) / 2 : 0;
  p.setGrip(cx, p.height * 0.5, cz);
}

export function makeFood(kind: FoodKind): Prop {
  const k: FoodKind = kind in FOOD_BUILDERS ? kind : 'sandwich';
  const p = new BaseProp('food:' + k);
  p.addPart(propGeo('food|' + k, FOOD_BUILDERS[k]));
  p.measure();
  centreGrip(p);
  return p;
}

class Dish extends BaseProp implements DishProp {
  private readonly dirtyMesh;
  private dirt = 0;

  constructor(kind: DishKind, color: number) {
    super('dish:' + kind);
    const spec = DISH_SPECS[kind];
    const key = kind === 'glass' ? 'glass' : `${kind}|${color.toString(16)}`;
    this.addPart(propGeo('dish|' + key, () => spec.body(color)));
    this.dirtyMesh = this.addPart(propGeo('dish|dirty|' + kind, spec.dirty));
    this.dirtyMesh.name = 'dirty';
    this.dirtyMesh.visible = false;
    this.dirtyMesh.castShadow = false;
    this.measure();
    this.setGrip(spec.grip[0], spec.grip[1], spec.grip[2]);
  }

  get dirtiness(): number {
    return this.dirt;
  }

  setDirty(v: number): void {
    this.dirt = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    this.dirtyMesh.visible = this.dirt > 0.01;
    const s = 0.55 + 0.45 * this.dirt;
    this.dirtyMesh.scale.set(s, 1, s);
  }
}

export function makeDish(kind: DishKind, color: number = DEFAULT_ACCENT): DishProp {
  const k: DishKind = kind in DISH_SPECS ? kind : 'plate';
  return new Dish(k, color);
}

export function makeMug(design: MugDesign): MugProp {
  return new Mug(design);
}

export function makeLunchbox(color: number): LunchboxProp {
  return new Lunchbox(color);
}

export function makeTrashBag(): TrashBagProp {
  return new TrashBag();
}

export function makeItem(kind: ItemKind, color: number): Prop {
  if (kind === 'lunchbox') return new Lunchbox(color);
  const k = (kind in ITEM_SPECS ? kind : 'backpack') as Exclude<ItemKind, 'lunchbox'>;
  const spec = ITEM_SPECS[k];
  const p = new BaseProp('item:' + k);
  p.addPart(propGeo(`item|${k}|${color.toString(16)}`, () => spec.build(color)));
  p.measure();
  if (spec.grip) p.setGrip(spec.grip[0], spec.grip[1], spec.grip[2]);
  else centreGrip(p);
  return p;
}

export function makeProp(kind: MiscKind): Prop {
  const k: MiscKind = kind in MISC_SPECS ? kind : 'ball';
  const spec = MISC_SPECS[k];
  const p = new BaseProp('misc:' + k);
  p.addPart(propGeo('misc|' + k, spec.build));
  p.measure();
  if (spec.grip) p.setGrip(spec.grip[0], spec.grip[1], spec.grip[2]);
  else centreGrip(p);
  return p;
}

/** Everything a dev page / test might want to enumerate. */
export const PROP_CATALOG = {
  food: FOOD_KINDS,
  dish: DISH_KINDS,
  mug: MUG_DESIGNS,
  item: ITEM_KINDS,
  misc: MISC_KINDS,
} as const;

/** Girl colours for lunchboxes / items (convenience). */
export const GIRL_COLORS = { addy: PAL.addyMain, ellie: PAL.ellieMain, heidi: PAL.heidiMain } as const;
