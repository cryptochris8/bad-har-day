import { describe, expect, it } from 'vitest';
import { SPECS, armLength, hairFitFor, headCenter, hipJointY, memberSpec, type BodySpec } from '../../src/family/spec';
import { B, EYE_SCALE, F, MOUTHS, buildBones, faceBone, faceLayout, headSurface, mouthBone } from '../../src/family/skeleton';
import { MEMBERS } from '../../src/family/types';

const all = Object.entries(SPECS) as [string, BodySpec][];

describe('body specs', () => {
  it('stack up consistently (feet → hips → spine → chest → shoulders → neck → head top)', () => {
    for (const [name, s] of all) {
      expect(hipJointY(s), name).toBeLessThan(s.hipsY);
      expect(s.hipsY, name).toBeLessThan(s.spineY);
      expect(s.spineY, name).toBeLessThan(s.chestY);
      expect(s.chestY, name).toBeLessThan(s.shoulderY);
      expect(s.shoulderY, name).toBeLessThan(s.neckY);
      expect(headCenter(s)[1] + s.headRy, name).toBeCloseTo(s.height, 6);
      // Chunky mitten hands reach about hip level.
      expect(s.shoulderY - armLength(s), name).toBeLessThan(hipJointY(s) + 0.12);
      expect(s.shoulderY - armLength(s), name).toBeGreaterThan(hipJointY(s) - 0.25);
    }
  });

  it('maps members to the right bodies', () => {
    expect(memberSpec('chris').height).toBe(1.85);
    expect(memberSpec('ashley').height).toBe(1.7);
    expect(memberSpec('addy')).toBe(memberSpec('ellie'));
    expect(memberSpec('heidi').height).toBe(1.2);
    for (const id of MEMBERS) expect(memberSpec(id).kid).toBe(id !== 'chris' && id !== 'ashley');
  });

  it('Heidi: rounder face and proportionally bigger eyes than her sisters', () => {
    const t = SPECS.twin;
    const h = SPECS.heidi;
    expect(h.headRx / h.headRy).toBeGreaterThan(t.headRx / t.headRy);
    expect(h.eyeR / h.headRy).toBeGreaterThan(t.eyeR / t.headRy);
  });
});

describe('HairFit', () => {
  it('invariants (head space): backZ < 0, shoulderY < neckY < 0, radii positive', () => {
    for (const [name, s] of all) {
      const f = hairFitFor(s);
      expect(f.rx, name).toBeGreaterThan(0.1);
      expect(f.ry, name).toBeGreaterThan(0.1);
      expect(f.rz, name).toBeGreaterThan(0.1);
      expect(f.backZ, name).toBeLessThan(0);
      expect(f.neckY, name).toBeLessThan(0);
      expect(f.shoulderY, name).toBeLessThan(f.neckY);
      // Shoulders are wider than the head; the back is behind the head's back surface-ish.
      expect(f.shoulderHalfWidth, name).toBeGreaterThan(f.rx);
      expect(f.backZ, name).toBeGreaterThan(-f.rz * 1.2);
      // The shoulder line is within ~1.6 head radii below the head centre.
      expect(f.shoulderY, name).toBeGreaterThan(-f.ry * 1.6);
    }
  });

  it('matches the rig: shoulders and the back surface in head space', () => {
    const s = SPECS.twin;
    const f = hairFitFor(s);
    const [, cy, cz] = headCenter(s);
    expect(cy + f.shoulderY).toBeCloseTo(s.shoulderY + s.armR * 0.7, 6);
    expect(cz + f.backZ).toBeLessThan(-s.torsoD);
  });
});

describe('skeleton + face layout', () => {
  it('builds the fixed bone table with rest matrices', () => {
    const rig = buildBones(SPECS.twin);
    expect(rig.bones.length).toBe(B.count);
    expect(rig.rest.length).toBe(B.count);
    const y = (i: number) => rig.rest[i]!.elements[13]!;
    expect(y(B.hips)).toBeCloseTo(SPECS.twin.hipsY);
    expect(y(B.head)).toBeCloseTo(SPECS.twin.neckY);
    expect(y(B.footL)).toBeCloseTo(SPECS.twin.ankleY);
    // L = +X.
    expect(rig.rest[B.upperArmL]!.elements[12]).toBeGreaterThan(0);
    expect(rig.rest[B.upperArmR]!.elements[12]).toBeLessThan(0);
    expect(faceBone(1, F.open)).toBe(B.faceL);
    expect(faceBone(-1, F.blush)).toBe(B.faceR + 9);
    expect(mouthBone(MOUTHS[MOUTHS.length - 1]!)).toBe(B.mouth0 + MOUTHS.length - 1);
  });

  it('places the face on the head surface: eyes above the nose above the mouth, brows above the eyes', () => {
    for (const [name, s] of all) {
      const L = faceLayout(s);
      expect(L.eye[1].pos[0], name).toBeGreaterThan(0);
      expect(L.eye[-1].pos[0], name).toBeLessThan(0);
      expect(L.brow[1].pos[1], name).toBeGreaterThan(L.eye[1].pos[1] + s.eyeR * EYE_SCALE[1]);
      expect(L.eye[1].pos[1], name).toBeGreaterThan(L.nose.pos[1]);
      expect(L.nose.pos[1], name).toBeGreaterThan(L.mouth.pos[1]);
      // Eyes don't overlap each other.
      expect(L.eye[1].pos[0] - L.eye[-1].pos[0], name).toBeGreaterThan(2 * s.eyeR * EYE_SCALE[0]);
    }
    const p = headSurface(SPECS.chris, 0, 0);
    expect(p.pos[2]).toBeCloseTo(SPECS.chris.headCZ + SPECS.chris.headRz, 6);
  });
});
