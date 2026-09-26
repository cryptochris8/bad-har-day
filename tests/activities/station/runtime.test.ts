// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SurfaceProbe, Tweens, Shot } from '../../../src/activities/station/runtime';
import { StationUi, setVar, css } from '../../../src/activities/station/ui';

describe('Tweens', () => {
  it('hops an object to its target (arc on the way), scales, and calls done once', () => {
    const t = new Tweens();
    const o = new THREE.Object3D();
    o.scale.setScalar(0.5);
    let done = 0;
    t.hop(o, { x: 1, y: 0, z: 0 }, 1, 0.3, { scale: 1, done: () => done++ });
    expect(t.busy(o)).toBe(true);
    t.update(0.5);
    expect(o.position.x).toBeCloseTo(0.5, 5);
    expect(o.position.y).toBeCloseTo(0.3, 5); // top of the arc
    t.update(0.6);
    expect(o.position.x).toBe(1);
    expect(o.position.y).toBe(0);
    expect(o.scale.x).toBe(1);
    expect(done).toBe(1);
    expect(t.busy(o)).toBe(false);
    t.update(1);
    expect(done).toBe(1);
  });

  it('replaces a running tween on the same object and flush() finishes everything', () => {
    const t = new Tweens();
    const a = new THREE.Object3D();
    const b = new THREE.Object3D();
    let hits = 0;
    t.hop(a, { x: 5, y: 0, z: 0 }, 1, 0, { done: () => hits++ });
    t.hop(a, { x: -2, y: 0, z: 0 }, 1, 0);
    t.hop(b, { x: 0, y: 3, z: 0 }, 1, 0, { spin: Math.PI });
    t.flush();
    expect(a.position.x).toBe(-2);
    expect(b.position.y).toBe(3);
    expect(b.rotation.y).toBeCloseTo(Math.PI);
    expect(hits).toBe(0); // the replaced tween's callback never fires
    expect(t.any).toBe(false);
  });

  it('a done callback may start another hop (chains)', () => {
    const t = new Tweens();
    const o = new THREE.Object3D();
    t.hop(o, { x: 1, y: 0, z: 0 }, 0.1, 0, { done: () => t.hop(o, { x: 2, y: 0, z: 0 }, 0.1, 0) });
    t.update(0.2);
    expect(t.busy(o)).toBe(true);
    t.update(0.2);
    expect(o.position.x).toBe(2);
  });

  it('cancel() stops without snapping', () => {
    const t = new Tweens();
    const o = new THREE.Object3D();
    t.hop(o, { x: 1, y: 0, z: 0 }, 1, 0);
    t.update(0.5);
    t.cancel(o);
    t.update(1);
    expect(o.position.x).toBeCloseTo(0.5, 5);
  });
});

describe('SurfaceProbe', () => {
  it('finds the top of what is under a point inside the house group', () => {
    const world = new THREE.Group();
    const house = new THREE.Group();
    house.name = 'house';
    world.add(house);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.6), new THREE.MeshBasicMaterial());
    counter.position.set(0, 0.45, 0);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.26), new THREE.MeshBasicMaterial());
    board.position.set(-0.3, 0.9125, 0);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), new THREE.MeshBasicMaterial());
    proxy.name = 'shadowProxies';
    house.add(counter, board, proxy);
    const outside = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    world.add(outside); // not in the house → ignored
    const p = new SurfaceProbe(world);
    expect(p.heightAt(0.3, 0, 1.3, -1)).toBeCloseTo(0.9, 4);
    expect(p.heightAt(-0.3, 0, 1.3, -1)).toBeCloseTo(0.925, 4);
    expect(p.heightAt(3, 3, 1.3, -1)).toBe(-1);
  });
});

describe('Shot', () => {
  it('builds a reusable goal from a target + offset', () => {
    const s = new Shot().look(1, 2, 3, 0, 1, 2, 30);
    expect(s.goal.position).toEqual({ x: 1, y: 3, z: 5 });
    expect(s.goal.target).toEqual({ x: 1, y: 2, z: 3 });
    expect(s.goal.fov).toBe(30);
  });
});

describe('StationUi', () => {
  it('queues taps on pointerdown and reports held buttons until pointerup', () => {
    const layer = document.createElement('div');
    const ui = new StationUi(layer);
    const card = ui.card('Fill');
    const btn = ui.button(card, 'hold', '', ['Hold']);
    expect(layer.querySelector('.bhd-st')).not.toBeNull();
    expect(btn.hasAttribute('data-bhd-tap')).toBe(true);
    const ev = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { pointerId: number };
      Object.defineProperty(e, 'pointerId', { value: 1 });
      return e;
    };
    btn.dispatchEvent(ev('pointerdown'));
    expect(ui.held('hold')).toBe(true);
    expect([...ui.takeTaps()]).toEqual(['hold']);
    expect([...ui.takeTaps()]).toEqual([]);
    btn.dispatchEvent(ev('pointerup'));
    expect(ui.held('hold')).toBe(false);
    ui.dispose();
    expect(layer.querySelector('.bhd-st')).toBeNull();
  });

  it('setVar only writes changes; css() formats hex', () => {
    const el = document.createElement('div');
    setVar(el, 'value', 0.5);
    expect(el.style.getPropertyValue('--value')).toBe('0.500');
    setVar(el, 'value', Number.NaN);
    expect(el.style.getPropertyValue('--value')).toBe('0.000');
    expect(css(0x3b2418)).toBe('#3b2418');
    expect(css(0xff)).toBe('#0000ff');
  });
});
