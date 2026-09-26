import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/world';
import type { AnchorId } from '../../src/world/types';

describe('createWorld (smoke)', () => {
  const t0 = performance.now();
  const world = createWorld({ quality: 'high' });
  const buildMs = performance.now() - t0;
  const cam = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 1300);
  cam.position.set(0, 11.5, 6);

  it('builds quickly and exposes the contract', () => {
    expect(buildMs).toBeLessThan(8000);
    expect(world.root.children.length).toBeGreaterThan(3);
    expect(world.hideSpots).toHaveLength(12);
    expect(world.hideSpot('dogBed').label).toContain('dog');
    expect(world.roomName('twins')).toBe("Addy & Ellie's room");
    expect(world.roomAt(0.8, -4.3)).toBe('bath');
    expect(world.floorAt(3, 3)).toBe(0);
    const a = world.anchor('coffeeMaker' as AnchorId);
    expect(a.room).toBe('kitchen');
  });

  it('updates without throwing across the morning, weather and focus changes', () => {
    for (let m = 300; m <= 500; m += 7) {
      world.setClock(m);
      world.setFocus(-3 + (m % 11), -2, m % 2 ? 'dollhouse' : 'closeup');
      world.update(1 / 60, cam);
    }
    world.setWeather('drizzle');
    world.update(1 / 60, cam);
    world.setWeather('clear');
    expect(world.lighting.key.intensity).toBeGreaterThan(0);
  });

  it('doors block while closed and open over time', () => {
    const d = world.door('front');
    const out = { x: 0, z: 0 };
    d.close();
    for (let i = 0; i < 60; i++) world.update(1 / 30, cam);
    world.move(-1.6, 3.4, 0.28, 0, 2.5, out);
    expect(out.z).toBeLessThan(4.5);
    d.open();
    for (let i = 0; i < 60; i++) world.update(1 / 30, cam);
    expect(d.isOpen).toBe(true);
    expect(d.openness).toBeCloseTo(1, 5);
    world.move(-1.6, 3.4, 0.28, 0, 2.5, out);
    expect(out.z).toBeGreaterThan(5.5);
    d.close();
  });

  it('fixtures, beds, curtains, cars and markers respond', () => {
    world.fixtures.dishwasher.setDoor(1);
    world.fixtures.dishwasher.setRacks(1);
    expect(world.fixtures.dishwasher.bottomRack.position.z).toBeGreaterThan(0);
    world.fixtures.coffeeMaker.setBrewing(true);
    world.fixtures.sink.setWater(true);
    world.fixtures.fridge.setDoor(1);
    world.fixtures.kitchenTrash.setLid(1);
    world.fixtures.kitchenTrash.setBag(false);
    world.fixtures.outdoorBin.setLid(0.5);
    expect(world.fixtures.mugShelf.slots).toHaveLength(4);
    expect(world.fixtures.vanity.mirror.isMesh).toBe(true);
    world.bed('addy').setBlanket('burrito');
    world.bed('addy').wiggle(1);
    world.curtains('twins').open();
    expect(world.curtains('twins').isOpen).toBe(true);
    const van = world.car('minivan');
    van.setDoor(2, 1);
    van.roll(1.2, 0.3);
    van.setHeadlights(true);
    expect(van.seats).toHaveLength(5);
    const m = world.marker({ x: 1, y: 0, z: 1 });
    m.move({ x: 2, y: 0, z: 2 });
    for (let i = 0; i < 10; i++) world.update(1 / 30, cam);
    m.remove();
  });

  it('navPath returns ground points ending at the target', () => {
    const from = world.anchor('chrisStart');
    const to = world.anchor('yardFar');
    const p = world.navPath(from, to);
    expect(p.length).toBeGreaterThan(1);
    const last = p[p.length - 1]!;
    expect(Math.hypot(last.x - to.x, last.z - to.z)).toBeLessThan(0.05);
  });

  it('disposes cleanly', () => {
    world.dispose();
    expect(world.root.parent).toBeNull();
  });
});
