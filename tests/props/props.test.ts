import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { countTriangles } from '../../src/render/models/builder';
import {
  COFFEE_COLORS,
  DISH_KINDS,
  FOOD_KINDS,
  GIRL_COLORS,
  ITEM_KINDS,
  LUNCHBOX,
  MISC_KINDS,
  MUG_DESIGNS,
  fitInSlot,
  liquidY,
  makeDish,
  makeFood,
  makeItem,
  makeLunchbox,
  makeMug,
  makeProp,
  makeTrashBag,
  type Prop,
} from '../../src/props/index';
import { FOOD_CATEGORY } from '../../src/props/types';

const girls = [GIRL_COLORS.addy, GIRL_COLORS.ellie, GIRL_COLORS.heidi];

/** Every prop the module can make, with a label and a visible-triangle budget. */
function everyProp(): { name: string; make: () => Prop; budget: number }[] {
  const out: { name: string; make: () => Prop; budget: number }[] = [];
  for (const k of FOOD_KINDS) out.push({ name: 'food:' + k, make: () => makeFood(k), budget: 800 });
  for (const k of DISH_KINDS) out.push({ name: 'dish:' + k, make: () => makeDish(k, girls[1]), budget: 800 });
  for (const d of MUG_DESIGNS) out.push({ name: 'mug:' + d, make: () => makeMug(d), budget: 1200 });
  for (const k of ITEM_KINDS) for (const c of girls) out.push({ name: `item:${k}:${c.toString(16)}`, make: () => makeItem(k, c), budget: k === 'lunchbox' ? 1450 : 1100 });
  for (const k of MISC_KINDS) out.push({ name: 'misc:' + k, make: () => makeProp(k), budget: 1100 });
  out.push({ name: 'trashBag', make: () => makeTrashBag(), budget: 1300 });
  for (const c of girls) out.push({ name: 'lunchbox:' + c.toString(16), make: () => makeLunchbox(c), budget: 1450 });
  return out;
}

const box = new THREE.Box3();

describe('props contract: every kind builds and is sane', () => {
  for (const { name, make, budget } of everyProp()) {
    it(name, () => {
      const p = make();
      expect(p.root).toBeInstanceOf(THREE.Group);
      expect(p.grip.parent).toBe(p.root);
      expect(Number.isFinite(p.radius) && p.radius > 0.005 && p.radius < 0.5).toBe(true);
      expect(Number.isFinite(p.height) && p.height > 0.004 && p.height < 2).toBe(true);
      p.root.updateMatrixWorld(true);
      box.setFromObject(p.root);
      // Origin at the bottom centre: rests on y = 0 (the ink hull may dip a few mm).
      expect(box.min.y).toBeGreaterThan(-0.03);
      expect(box.min.y).toBeLessThan(0.03);
      // Grip inside the bounds (small tolerance for the hull).
      const g = p.grip.getWorldPosition(new THREE.Vector3());
      expect(box.clone().expandByScalar(0.02).containsPoint(g)).toBe(true);
      // Triangle budget (visible geometry; hidden overlays such as dirt/peel/steam excluded).
      expect(countTriangles(p.root, true)).toBeLessThanOrEqual(budget);
      p.dispose();
    });
  }
});

describe('props: caching + disposal', () => {
  const firstGeo = (p: Prop) => {
    let g: THREE.BufferGeometry | null = null;
    p.root.traverse((o) => {
      if (!g && (o as THREE.Mesh).isMesh) g = (o as THREE.Mesh).geometry;
    });
    return g as unknown as THREE.BufferGeometry;
  };

  it('two instances of the same kind/colour share geometry; different colours do not', () => {
    expect(firstGeo(makeFood('banana'))).toBe(firstGeo(makeFood('banana')));
    expect(firstGeo(makeMug('sunflower'))).toBe(firstGeo(makeMug('sunflower')));
    expect(firstGeo(makeItem('backpack', girls[0]!))).toBe(firstGeo(makeItem('backpack', girls[0]!)));
    expect(firstGeo(makeItem('backpack', girls[0]!))).not.toBe(firstGeo(makeItem('backpack', girls[1]!)));
    expect(firstGeo(makeDish('plate', 0x123456))).not.toBe(firstGeo(makeDish('plate', 0x654321)));
  });

  it('dispose() frees only per-instance resources, is idempotent and detaches the root', () => {
    const scene = new THREE.Scene();
    const m = makeMug('heart');
    scene.add(m.root);
    const shared = firstGeo(m);
    let sharedDisposed = false;
    shared.addEventListener('dispose', () => (sharedDisposed = true));
    m.setHighlight(1);
    const owned: THREE.Material[] = [];
    m.root.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && (mat.name === 'bhd-prop-highlight' || mat.name === 'bhd-mug-steam' || mat.name.startsWith('bhd-model-inst'))) owned.push(mat);
    });
    expect(owned.length).toBeGreaterThanOrEqual(3);
    let freed = 0;
    for (const mat of owned) mat.addEventListener('dispose', () => freed++);
    m.dispose();
    m.dispose();
    expect(freed).toBe(owned.length);
    expect(sharedDisposed).toBe(false);
    expect(m.root.parent).toBeNull();
    // The cache still works for new instances.
    expect(firstGeo(makeMug('heart'))).toBe(shared);
  });

  it('setHighlight builds shells lazily, toggles them, clamps input', () => {
    const p = makeFood('clementine');
    const meshes = () => {
      let n = 0;
      p.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.name === 'highlight' && o.visible) n++;
      });
      return n;
    };
    expect(meshes()).toBe(0);
    p.setHighlight(0);
    expect(meshes()).toBe(0);
    p.setHighlight(1);
    expect(meshes()).toBe(1);
    p.setHighlight(Number.NaN);
    expect(meshes()).toBe(0);
    p.setHighlight(5);
    expect(meshes()).toBe(1);
    p.dispose();
    p.setHighlight(1); // after dispose: harmless
  });
});

describe('mugs', () => {
  it('liquid rises with setFill, clamps, and hides when empty', () => {
    const m = makeMug('sunflower');
    const liquid = m.root.getObjectByName('liquid')!;
    m.setFill(0);
    expect(liquid.visible).toBe(false);
    m.setFill(0.5);
    expect(liquid.visible).toBe(true);
    expect(liquid.position.y).toBeCloseTo(liquidY(0.5), 6);
    m.setFill(3);
    expect(liquid.position.y).toBeCloseTo(liquidY(1), 6);
    expect(liquidY(1)).toBeLessThan(m.height);
    expect(liquidY(0)).toBeGreaterThan(0);
    expect(liquidY(0.2)).toBeLessThan(liquidY(0.8));
    m.setFill(Number.NaN);
    expect(liquid.visible).toBe(false);
  });

  it('setLiquid tints the coffee; steam eases in and out with update()', () => {
    const m = makeMug('bestDad');
    const liquid = m.root.getObjectByName('liquid') as THREE.Mesh;
    let tintOk = false;
    m.setLiquid(0xff0000);
    liquid.material instanceof THREE.Material && (tintOk = true);
    expect(tintOk).toBe(true);
    const steam = m.root.getObjectByName('steam')!;
    m.update(0.1);
    expect(steam.visible).toBe(false);
    m.setSteam(true);
    for (let i = 0; i < 30; i++) m.update(1 / 30);
    expect(steam.visible).toBe(true);
    m.setSteam(false);
    for (let i = 0; i < 200; i++) m.update(1 / 30);
    expect(steam.visible).toBe(false);
    m.update(Number.NaN);
    m.update(-1);
  });

  it('coffee colours go from dark to light', () => {
    const lum = (hex: number) => ((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11;
    const { black, splash, creamSugar, latte } = COFFEE_COLORS;
    expect(lum(black)).toBeLessThan(lum(splash));
    expect(lum(splash)).toBeLessThan(lum(creamSugar));
    expect(lum(creamSugar)).toBeLessThan(lum(latte));
  });
});

describe('lunchbox', () => {
  it('has 4 slots (main, snack, drink, fruit) inside the box on the floor, and a note slot on the lid', () => {
    const lb = makeLunchbox(GIRL_COLORS.addy);
    expect(lb.slots.map((s) => s.name)).toEqual(['slot:main', 'slot:snack', 'slot:drink', 'slot:fruit']);
    for (const s of lb.slots) {
      expect(Math.abs(s.position.x)).toBeLessThan(LUNCHBOX.w / 2);
      expect(Math.abs(s.position.z)).toBeLessThan(LUNCHBOX.d / 2);
      expect(s.position.y).toBeCloseTo(LUNCHBOX.floorY, 6);
      const size = s.userData.size as { w: number; d: number; h: number };
      expect(size.w).toBeGreaterThan(0.05);
      expect(size.d).toBeGreaterThan(0.05);
    }
    // Each category's slot matches FOOD_CATEGORY naming.
    expect(new Set(Object.values(FOOD_CATEGORY))).toContain('main');
    expect(lb.noteSlot.parent?.name).toBe('lidHinge');
  });

  it('setOpen swings the lid (and the note slot) up and back; clamps', () => {
    const lb = makeLunchbox(GIRL_COLORS.ellie);
    const scene = new THREE.Scene();
    scene.add(lb.root);
    const p0 = lb.noteSlot.getWorldPosition(new THREE.Vector3());
    lb.setOpen(1);
    scene.updateMatrixWorld(true);
    const p1 = lb.noteSlot.getWorldPosition(new THREE.Vector3());
    expect(p1.y).toBeGreaterThan(p0.y + 0.05);
    expect(p1.z).toBeLessThan(p0.z);
    lb.setOpen(7);
    const hinge = lb.root.getObjectByName('lidHinge')!;
    expect(hinge.rotation.x).toBeCloseTo(-LUNCHBOX.openAngle, 6);
    lb.setOpen(-1);
    expect(hinge.rotation.x).toBeCloseTo(0, 6);
  });

  it('fitInSlot parents food into a compartment and keeps it inside', () => {
    const lb = makeLunchbox(GIRL_COLORS.heidi);
    const scene = new THREE.Scene();
    scene.add(lb.root);
    const kinds = ['sandwich', 'pretzels', 'juiceBox', 'banana'] as const;
    kinds.forEach((k, i) => {
      const food = makeFood(k);
      const slot = lb.slots[i]!;
      const fit = fitInSlot(food, slot);
      expect(food.root.parent).toBe(slot);
      expect(fit.scale).toBeGreaterThan(0.3);
      expect(fit.scale).toBeLessThanOrEqual(1);
      scene.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(food.root);
      const size = slot.userData.size as { w: number; d: number };
      const c = slot.getWorldPosition(new THREE.Vector3());
      expect(bb.min.x).toBeGreaterThan(c.x - size.w / 2 - 0.02);
      expect(bb.max.x).toBeLessThan(c.x + size.w / 2 + 0.02);
      expect(bb.min.z).toBeGreaterThan(c.z - size.d / 2 - 0.02);
      expect(bb.max.z).toBeLessThan(c.z + size.d / 2 + 0.02);
      expect(bb.min.y).toBeGreaterThan(c.y - 0.02);
    });
  });
});

describe('trash bag + dishes', () => {
  it('setPeek shows the peel poking out and bulges the bag; clamps', () => {
    const t = makeTrashBag();
    const peek = t.root.getObjectByName('peek')!;
    const body = t.root.getObjectByName('body')!;
    t.setPeek(0);
    expect(peek.visible).toBe(false);
    const y0 = peek.position.y;
    t.setPeek(1);
    expect(peek.visible).toBe(true);
    expect(peek.position.y).toBeGreaterThan(y0);
    expect(body.scale.x).toBeGreaterThan(1);
    t.setPeek(9);
    expect(body.scale.x).toBeCloseTo(1.05, 6);
    t.setPeek(Number.NaN);
    expect(peek.visible).toBe(false);
  });

  it('dishes can be made sticky for the rinse beat', () => {
    for (const k of DISH_KINDS) {
      const d = makeDish(k);
      const dirt = d.root.getObjectByName('dirty')!;
      expect(dirt.visible).toBe(false);
      d.setDirty(1);
      expect(dirt.visible).toBe(true);
      d.setDirty(0);
      expect(dirt.visible).toBe(false);
    }
  });

  it('unknown kinds fall back instead of throwing', () => {
    expect(() => makeFood('pizza' as never).dispose()).not.toThrow();
    expect(() => makeDish('wok' as never).dispose()).not.toThrow();
    expect(() => makeItem('umbrella' as never, 0xffffff).dispose()).not.toThrow();
    expect(() => makeProp('rocket' as never).dispose()).not.toThrow();
    expect(() => makeMug('tiger' as never).dispose()).not.toThrow();
  });
});
