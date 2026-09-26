import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../../src/hair', async () => {
  const h = await import('./helpers');
  return { createGirlHair: vi.fn(h.stubGirlHair), createBrush: vi.fn() };
});

import { createGirlHair } from '../../src/hair';
import { DEFAULT_LOOKS, createCharacter, createDog, createExtra, createFamily, sanitizeLooks } from '../../src/family';
import { HumanRig } from '../../src/family/character';
import { DogRig } from '../../src/family/dog';
import { liveGeometries } from '../../src/family/skin';
import { SPECS, hairFitFor } from '../../src/family/spec';
import { countTriangles } from '../../src/render/models/builder';
import type { Action, Character, Emote, ExtraKind, MemberId, SocketName } from '../../src/family/types';
import { MEMBERS } from '../../src/family/types';

const SOCKETS: SocketName[] = ['handR', 'handL', 'head', 'back', 'overhead', 'root'];

function step(c: { update(dt: number): void }, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) c.update(dt);
}

function drawables(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    let v: THREE.Object3D | null = o;
    while (v) {
      if (!v.visible) return;
      v = v.parent;
    }
    const m = o as THREE.Mesh;
    if ((m.isMesh || (o as THREE.Sprite).isSprite) && (m.material as THREE.Material).visible !== false) n++;
  });
  return n;
}

function finiteWorld(root: THREE.Object3D): boolean {
  root.updateMatrixWorld(true);
  let ok = true;
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) ok = false;
  });
  return ok;
}

const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

describe('family', () => {
  it('builds everyone with the requested heights and cartoon proportions', () => {
    const f = createFamily(DEFAULT_LOOKS);
    const H: Record<MemberId, number> = { chris: 1.85, ashley: 1.7, addy: 1.36, ellie: 1.36, heidi: 1.2 };
    for (const id of MEMBERS) {
      const c = f.member(id);
      expect(c.id).toBe(id);
      expect(c.height).toBeCloseTo(H[id], 3);
      for (const s of SOCKETS) expect(c.socket(s)).toBeInstanceOf(THREE.Object3D);
      expect(f.members).toContain(c);
    }
    expect(f.heidi.height / f.addy.height).toBeGreaterThan(0.85);
    expect(f.heidi.height / f.addy.height).toBeLessThan(0.9);
    // Head size: adults ≈ 1/4.5 of their height, kids ≈ 1/3.4.
    for (const [s, ratio] of [
      [SPECS.chris, 4.5],
      [SPECS.ashley, 4.5],
      [SPECS.twin, 3.4],
    ] as const) {
      expect(s.height / (s.headRy * 2)).toBeGreaterThan(ratio * 0.9);
      expect(s.height / (s.headRy * 2)).toBeLessThan(ratio * 1.1);
    }
    expect(f.girl('addy')).toBe(f.addy);
    f.update(1 / 60);
    f.dispose();
  });

  it('top of the head sits at the standing height', () => {
    const c = createCharacter('ashley', DEFAULT_LOOKS.members.ashley) as HumanRig;
    step(c, 0.1);
    const head = world(c.socket('head'));
    expect(head.y + SPECS.ashley.headRy).toBeCloseTo(1.7, 1);
    c.dispose();
  });

  it('gives only the girls brushable hair, fitted to their heads', () => {
    const mock = vi.mocked(createGirlHair);
    mock.mockClear();
    const f = createFamily(DEFAULT_LOOKS);
    expect(f.chris.hair).toBeNull();
    expect(f.ashley.hair).toBeNull();
    for (const g of ['addy', 'ellie', 'heidi'] as const) {
      const c = f.girl(g);
      expect(c.hair).not.toBeNull();
      expect(c.hair!.root.parent).toBe(c.socket('head'));
    }
    expect(mock).toHaveBeenCalledTimes(3);
    const calls = mock.mock.calls.map((a) => a[0]);
    const lengths = calls.map((o) => o.length).sort();
    expect(lengths).toEqual([0.56, 0.64, 0.64]);
    expect(new Set(calls.map((o) => o.seed)).size).toBe(3);
    for (const o of calls) {
      expect(o.color).toBe(o.length === 0.56 ? 0x7a4a2a : 0x6b3d24);
      expect(o.fit.backZ).toBeLessThan(0);
      expect(o.fit.shoulderY).toBeLessThan(o.fit.neckY);
      expect(o.fit.neckY).toBeLessThan(0);
    }
    // The rig updates the hair every frame.
    const h = f.addy.hair as unknown as { updates(): number };
    const before = h.updates();
    f.update(1 / 60);
    expect(h.updates()).toBe(before + 1);
    f.dispose();
  });

  it('stays within the triangle and draw-call budgets', () => {
    const f = createFamily(DEFAULT_LOOKS);
    for (const outfit of ['sleep', 'day'] as const) {
      for (const c of f.members) {
        c.setOutfit(outfit);
        c.update(1 / 60);
        const body = (c as HumanRig).body;
        const tris = countTriangles(body);
        const girl = c.hair !== null;
        // Girls leave ~5 k for the hair module inside the 12 k budget.
        expect(tris, `${c.id} ${outfit}`).toBeLessThanOrEqual(girl ? 7000 : 12000);
        expect(countTriangles(c.root, true) - tris).toBeLessThan(200); // shadow + sprite only
        c.emote('heart');
        c.update(0.2);
        // body + blob shadow + emote (+ the hair module's own meshes).
        expect(drawables(c.root) - (c.hair ? drawables(c.hair.root) : 0)).toBeLessThanOrEqual(3);
      }
    }
    expect(countTriangles(f.dog.root, true)).toBeLessThanOrEqual(5000);
    f.dispose();
  });

  it('shares geometry between identical looks and frees it on dispose', () => {
    const base = liveGeometries();
    const a = createCharacter('addy', DEFAULT_LOOKS.members.addy) as HumanRig;
    const b = createCharacter('addy', DEFAULT_LOOKS.members.addy) as HumanRig;
    expect(a.body.geometry).toBe(b.body.geometry);
    const c = createCharacter('addy', { ...DEFAULT_LOOKS.members.addy, glasses: true }) as HumanRig;
    expect(c.body.geometry).not.toBe(a.body.geometry);
    const sleepGeo = a.body.geometry;
    a.setOutfit('day');
    expect(a.body.geometry).not.toBe(sleepGeo);
    a.setOutfit('sleep');
    expect(a.body.geometry).toBe(sleepGeo);
    a.dispose();
    b.dispose();
    c.dispose();
    expect(liveGeometries()).toBe(base);
    expect(a.root.parent).toBeNull();
  });

  it('twins share face/body/height but not outfits', () => {
    const f = createFamily(DEFAULT_LOOKS);
    expect(f.addy.height).toBe(f.ellie.height);
    expect((f.addy as HumanRig).body.geometry).not.toBe((f.ellie as HumanRig).body.geometry);
    f.dispose();
  });
});

describe('character behaviour', () => {
  const mk = (id: MemberId = 'heidi') => createCharacter(id, DEFAULT_LOOKS.members[id]) as HumanRig;

  it('update tolerates garbage dt and never produces NaN transforms', () => {
    const c = mk('chris');
    c.play('dance', { loop: true });
    for (const dt of [0, NaN, -1, Infinity, 5, 1 / 60]) c.update(dt);
    c.setMotion(NaN);
    c.setMotion(3.5);
    c.lookAt(new THREE.Vector3(NaN, 1, 1));
    c.lookAt(new THREE.Vector3(0, 2, -5));
    c.setSleepiness(NaN);
    step(c, 1);
    expect(finiteWorld(c.root)).toBe(true);
    c.dispose();
  });

  it('never moves root (the game owns it)', () => {
    const c = mk('addy');
    c.root.position.set(2, 0, -3);
    c.root.rotation.y = 1;
    for (const a of ['jump', 'lunge', 'dance', 'noooo'] as Action[]) {
      c.play(a);
      step(c, 1);
    }
    c.setPose('lie');
    step(c, 1);
    expect(c.root.position.toArray()).toEqual([2, 0, -3]);
    expect(c.root.rotation.y).toBe(1);
    c.dispose();
  });

  it('plays every action: returns its duration, reports it, then finishes', () => {
    const c = mk('addy');
    const all: Action[] = ['wave', 'cheer', 'jump', 'yawn', 'stretch', 'gasp', 'noooo', 'point', 'shrug', 'checkWatch', 'sip', 'lunge', 'grab', 'pickUpLow', 'handOff', 'toss', 'giggle', 'hug', 'nod', 'shakeHead', 'facepalm', 'dance', 'hairFlip', 'inspect', 'brushFast', 'thumbsUp', 'shh', 'sleepwalk', 'bounce'];
    for (const a of all) {
      const d = c.play(a);
      expect(d, a).toBeGreaterThan(0.3);
      expect(c.action).toBe(a);
      step(c, d * 0.5);
      expect(finiteWorld(c.root), a).toBe(true);
      step(c, d * 0.6 + 0.05);
      expect(c.action, a).toBeNull();
    }
    expect(c.play('wave', { duration: 3 })).toBe(3);
    c.dispose();
  });

  it('loops until cancelled', () => {
    const c = mk('ellie');
    c.play('wave', { loop: true });
    step(c, 6);
    expect(c.action).toBe('wave');
    c.cancelAction();
    expect(c.action).toBeNull();
    c.play('sleepwalk', { loop: true });
    c.setMotion(0.6);
    step(c, 3);
    expect(c.action).toBe('sleepwalk');
    expect(c.expression).toBe('asleep');
    c.dispose();
  });

  it('expressions: base, timed (reverts), and action-driven', () => {
    const c = mk('addy');
    c.setExpression('happy');
    c.update(1 / 60);
    expect(c.expression).toBe('happy');
    c.setExpression('surprised', 1);
    step(c, 0.5);
    expect(c.expression).toBe('surprised');
    step(c, 0.7);
    expect(c.expression).toBe('happy');
    c.play('noooo');
    step(c, 0.3);
    expect(c.expression).toBe('dramatic');
    c.cancelAction();
    step(c, 0.1);
    expect(c.expression).toBe('happy');
    c.dispose();
  });

  it("eek is a playful eep (both eyes wide open, round mouth), with a little head pop", () => {
    const c = mk('heidi');
    step(c, 0.5);
    const bones = c.body.skeleton.bones;
    const head = bones[4]!;
    c.setExpression('eek');
    let maxPop = 0;
    const base = head.rotation.x;
    for (let i = 0; i < 20; i++) {
      c.update(1 / 60);
      maxPop = Math.max(maxPop, Math.abs(head.rotation.x - base));
    }
    step(c, 0.5);
    for (const open of [bones[19]!, bones[29]!]) expect(open.scale.x).toBeGreaterThan(0.99);
    for (const sq of [bones[19 + 7]!, bones[29 + 7]!]) expect(sq.scale.x).toBeLessThan(0.01);
    // Lids fully open.
    expect(bones[19 + 2]!.scale.y).toBeLessThan(0.05);
    const o = bones.find((b) => b.name === 'bone' + (39 + 4)) ?? bones[39 + 4]!;
    expect(o.scale.x).toBeGreaterThan(0.5); // the 'o' mouth is showing
    expect(maxPop).toBeGreaterThan(0.02);
    c.setExpression('dramatic');
    step(c, 0.5);
    for (const open of [bones[19]!, bones[29]!]) expect(open.scale.x).toBeGreaterThan(0.99);
    // Pupils rolled up toward the sky.
    expect(bones[19 + 1]!.position.y).toBeGreaterThan(0);
    c.dispose();
  });

  it('noooo is a theatrical swoon: back of the hand to the forehead, head thrown back', () => {
    const c = mk('addy');
    const d = c.play('noooo');
    step(c, d * 0.5);
    const hand = world(c.socket('handR'));
    const head = world(c.socket('head'));
    expect(hand.distanceTo(head)).toBeLessThan(SPECS.twin.headRy * 1.6);
    expect(hand.y).toBeGreaterThan(head.y);
    expect(c.body.skeleton.bones[4]!.rotation.x).toBeLessThan(-0.2);
    expect(c.expression).toBe('dramatic');
    c.dispose();
  });

  it('blinks from time to time', () => {
    const c = mk('addy');
    const lid = c.body.skeleton.bones[19 + 2]!;
    let closed = 0;
    for (let i = 0; i < 60 * 8; i++) {
      c.update(1 / 60);
      if (lid.scale.y > 0.8) closed++;
    }
    expect(closed).toBeGreaterThan(2);
    expect(closed).toBeLessThan(60);
    c.dispose();
  });

  it('sit: hips on the seat behind the root; lie: head toward −Z on the mattress', () => {
    const c = mk('chris');
    c.setPose('sit', { seatHeight: 0.45 });
    step(c, 1);
    expect(c.pose).toBe('sit');
    const hips = world(c.body.skeleton.bones[1]!);
    expect(hips.z).toBeLessThan(-0.15);
    expect(hips.y).toBeGreaterThan(0.45);
    expect(hips.y).toBeLessThan(0.7);
    c.setPose('lie', { seatHeight: 0.5 });
    step(c, 1.5);
    const head = world(c.socket('head'));
    const feet = world(c.body.skeleton.bones[15]!);
    expect(head.z).toBeLessThan(-0.5);
    expect(feet.z).toBeGreaterThan(0.5);
    expect(head.y).toBeGreaterThan(0.5);
    expect(head.y).toBeLessThan(0.5 + SPECS.chris.headRz * 2 + 0.05);
    // Overhead socket stays above the head in world space.
    const oh = world(c.socket('overhead'));
    expect(oh.y).toBeGreaterThan(head.y + 0.3);
    c.dispose();
  });

  it('kneel lowers the body; drive reaches for the wheel', () => {
    const c = mk('chris');
    c.setPose('kneel');
    step(c, 1);
    expect(world(c.socket('head')).y).toBeLessThan(1.45);
    c.setPose('drive', { seatHeight: 0.4 });
    step(c, 1);
    const hL = world(c.socket('handL'));
    const hR = world(c.socket('handR'));
    const chest = world(c.body.skeleton.bones[3]!);
    expect(hL.z).toBeGreaterThan(chest.z + 0.2);
    expect(hR.z).toBeGreaterThan(chest.z + 0.2);
    expect(hL.x).toBeGreaterThan(hR.x);
    c.dispose();
  });

  it('holds: mug in front at chest height, kept upright in the hand socket', () => {
    const c = mk('ashley');
    c.setHold('mug');
    step(c, 1);
    const h = world(c.socket('handR'));
    const chest = world(c.body.skeleton.bones[3]!);
    expect(h.z).toBeGreaterThan(0.15);
    expect(Math.abs(h.y - chest.y)).toBeLessThan(0.25);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(c.socket('handR').getWorldQuaternion(new THREE.Quaternion()));
    expect(up.y).toBeGreaterThan(0.95);
    c.setHold('brush');
    step(c, 1);
    expect(world(c.socket('handR')).y).toBeGreaterThan(chest.y + 0.15);
    c.dispose();
  });

  it('turns its head toward a lookAt target (clamped)', () => {
    const c = mk('heidi');
    c.lookAt(new THREE.Vector3(3, 1, 0.5)); // to its left (+X)
    step(c, 1.5);
    const head = c.body.skeleton.bones[4]!;
    expect(head.rotation.y).toBeGreaterThan(0.5);
    c.lookAt(new THREE.Vector3(0, 1, -5)); // straight behind
    step(c, 1.5);
    expect(Math.abs(head.rotation.y)).toBeLessThan(1.3);
    c.lookAt(null);
    c.dispose();
  });

  it('walks with stride tied to distance (the planted foot moves back at walking speed)', () => {
    const c = mk('chris');
    c.setMotion(1.2);
    step(c, 2);
    const fL = c.body.skeleton.bones[15]!;
    const fR = c.body.skeleton.bones[18]!;
    const dt = 1 / 120;
    let sum = 0;
    let n = 0;
    let prevL = world(fL);
    let prevR = world(fR);
    for (let i = 0; i < 240; i++) {
      c.update(dt);
      const l = world(fL);
      const r = world(fR);
      const planted = l.y < r.y - 0.02 ? [l, prevL] : r.y < l.y - 0.02 ? [r, prevR] : null;
      if (planted) {
        sum += (planted[0]!.z - planted[1]!.z) / dt;
        n++;
      }
      prevL = l;
      prevR = r;
    }
    expect(n).toBeGreaterThan(60);
    const v = sum / n;
    expect(v).toBeLessThan(-0.85);
    expect(v).toBeGreaterThan(-1.6);
    c.dispose();
  });

  it('emotes pop and expire; zzz loops until dismissed', () => {
    const c = mk('addy');
    const kinds: Emote[] = ['exclaim', 'question', 'heart', 'zzz', 'sweat', 'sparkle', 'music', 'shh', 'idea', 'check', 'star', 'huff'];
    for (const k of kinds) {
      c.emote(k, 0.5);
      c.update(0.1);
      expect(c.currentEmote).toBe(k);
      step(c, 0.6);
      expect(c.currentEmote).toBeNull();
    }
    c.emote('zzz');
    step(c, 10);
    expect(c.currentEmote).toBe('zzz');
    c.emote(null);
    step(c, 0.5);
    expect(c.currentEmote).toBeNull();
    c.dispose();
  });

  it('sleepiness closes the lids', () => {
    const c = mk('chris');
    c.setSleepiness(1);
    step(c, 2);
    const lid = c.body.skeleton.bones[19 + 2]!;
    expect(lid.scale.y).toBeGreaterThan(0.7);
    c.dispose();
  });

  it('personality idles trigger gestures without reporting an action', () => {
    const c = mk('heidi');
    const ys: number[] = [];
    for (let i = 0; i < 60 * 12; i++) {
      c.update(1 / 60);
      ys.push(c.body.skeleton.bones[0]!.rotation.y);
      expect(c.action).toBeNull();
    }
    // Heidi twirls: the whole body spins at some point.
    expect(Math.max(...ys.map(Math.abs))).toBeGreaterThan(1);
    c.dispose();
  });
});

describe('dog', () => {
  it('builds, poses, plays every action and stays finite', () => {
    const d = createDog({ name: '  Waffles  ', coat: 'chocolate' }) as DogRig;
    expect(d.name).toBe('Waffles');
    expect(d.coat).toBe('chocolate');
    for (const s of ['mouth', 'head', 'overhead', 'root'] as const) expect(d.socket(s)).toBeInstanceOf(THREE.Object3D);
    for (const p of ['sit', 'lie', 'sleep', 'curl', 'stand'] as const) {
      d.setPose(p);
      step(d, 0.8);
      expect(d.pose).toBe(p);
      expect(finiteWorld(d.root)).toBe(true);
    }
    const actions = ['bark', 'wag', 'sniff', 'pee', 'stare', 'zoomies', 'jump', 'shake', 'tilt', 'pounce', 'roll', 'scratch', 'beg', 'yawn', 'stretch', 'dig'] as const;
    for (const a of actions) {
      const dur = d.play(a);
      expect(dur).toBeGreaterThan(0.5);
      expect(d.action).toBe(a);
      step(d, dur + 0.1);
      expect(d.action).toBeNull();
      expect(finiteWorld(d.root)).toBe(true);
    }
    d.setMotion(1.5);
    step(d, 1);
    d.setMotion(4);
    step(d, 1);
    expect(finiteWorld(d.root)).toBe(true);
    d.dispose();
  });

  it('pee is discreet: turns its back to the camera (+Z), no extra objects', () => {
    const d = createDog({ name: 'Biscuit', coat: 'golden' }) as DogRig;
    step(d, 0.2);
    let meshes = 0;
    d.root.traverse((o) => (meshes += (o as THREE.Mesh).isMesh ? 1 : 0));
    d.play('pee');
    step(d, 3.4 * 0.45);
    const head = world(d.socket('head'));
    expect(head.z).toBeLessThan(d.root.position.z - 0.1); // facing away from the camera
    let meshes2 = 0;
    d.root.traverse((o) => (meshes2 += (o as THREE.Mesh).isMesh ? 1 : 0));
    expect(meshes2).toBe(meshes);
    step(d, 2);
    expect(world(d.socket('head')).z).toBeGreaterThan(0.1); // turned back
    d.dispose();
  });

  it('mood: excited shows the tongue; stare freezes the tail', () => {
    const d = createDog({ name: 'Biscuit', coat: 'golden' }) as DogRig;
    d.setMood('excited');
    step(d, 1.5);
    const bones = d.body.skeleton.bones;
    const tongue = bones.find((b) => b.name === 'dog:tongue')!;
    expect(tongue.scale.z).toBeGreaterThan(0.5);
    d.setMood('calm');
    d.play('stare', { loop: true });
    step(d, 1);
    const tail = bones.find((b) => b.name === 'dog:tail0')!;
    const y0 = tail.rotation.y;
    step(d, 0.13);
    expect(Math.abs(tail.rotation.y - y0)).toBeLessThan(0.02);
    expect(d.action).toBe('stare');
    d.cancelAction();
    d.dispose();
  });

  it('sanitizes a bad look', () => {
    const d = createDog({ name: '', coat: 'plaid' as never });
    expect(d.name).toBe('Biscuit');
    d.dispose();
  });
});

describe('extras', () => {
  it('builds every kind with seeded simple looks and lower detail', () => {
    for (const k of ['crossingGuard', 'jogger', 'teacher', 'kid', 'neighbor'] as ExtraKind[]) {
      const e: Character = createExtra(k, 5);
      expect(e.id).toBe('extra');
      expect(e.hair).toBeNull();
      expect(e.height).toBeGreaterThan(1.2);
      step(e, 0.5);
      expect(countTriangles((e as HumanRig).body)).toBeLessThanOrEqual(8000);
      e.play('wave');
      step(e, 0.5);
      expect(finiteWorld(e.root)).toBe(true);
      e.dispose();
    }
    // Deterministic per seed.
    const a = createExtra('kid', 42) as HumanRig;
    const b = createExtra('kid', 42) as HumanRig;
    expect(a.body.geometry).toBe(b.body.geometry);
    a.dispose();
    b.dispose();
  });
});

describe('sanitized input', () => {
  it('createFamily accepts garbage looks', () => {
    const f = createFamily(sanitizeLooks({ members: { chris: { skin: 99, beard: 'x' } }, dog: { name: 7 } }));
    expect(f.dog.name).toBe('Biscuit');
    f.dispose();
    expect(hairFitFor(SPECS.twin).rx).toBe(SPECS.twin.headRx);
  });
});
