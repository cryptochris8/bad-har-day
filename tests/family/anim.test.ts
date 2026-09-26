import { describe, expect, it } from 'vitest';
import {
  ACTION_DURATION,
  ACTIONS,
  C,
  GESTURE_DURATION,
  PERSONA_GESTURES,
  actionExpression,
  actionPose,
  actionProgress,
  basePose,
  gaitOf,
  gestureInterval,
  gesturePose,
  hipJointY,
  isCyclic,
  kneelPose,
  liePose,
  loopRange,
  newDrive,
  phaseAdvance,
  sitPose,
  standPose,
  stepLength,
  swingAmplitude,
  wheelGrip,
  type Gesture,
  type Persona,
} from '../../src/family/anim';
import { Pose, poseFinite } from '../../src/family/pose';
import { EXPRESSIONS } from '../../src/family/expressions';
import { SPECS } from '../../src/family/spec';
import type { Action, HoldKind } from '../../src/family/types';

const CONTRACT_ACTIONS: Action[] = [
  'wave', 'cheer', 'jump', 'yawn', 'stretch', 'gasp', 'noooo', 'point', 'shrug', 'checkWatch', 'sip', 'lunge', 'grab', 'pickUpLow',
  'handOff', 'toss', 'giggle', 'hug', 'nod', 'shakeHead', 'facepalm', 'dance', 'hairFlip', 'inspect', 'brushFast', 'thumbsUp', 'shh', 'sleepwalk', 'bounce',
];

describe('action table', () => {
  it('has a sensible duration for every contract Action', () => {
    expect([...ACTIONS].sort()).toEqual([...CONTRACT_ACTIONS].sort());
    for (const a of CONTRACT_ACTIONS) {
      expect(ACTION_DURATION[a]).toBeGreaterThanOrEqual(0.5);
      expect(ACTION_DURATION[a]).toBeLessThanOrEqual(3);
    }
    expect(ACTION_DURATION.nod).toBeLessThan(ACTION_DURATION.yawn);
    expect(ACTION_DURATION.grab).toBeLessThan(ACTION_DURATION.hug);
  });

  it('loop ranges are inside [0, 1] and non-empty', () => {
    for (const a of CONTRACT_ACTIONS) {
      const [lo, hi] = loopRange(a);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(hi).toBeLessThanOrEqual(1);
      expect(hi - lo).toBeGreaterThan(0.2);
    }
    expect(isCyclic('dance')).toBe(true);
    expect(isCyclic('bounce')).toBe(true);
    expect(isCyclic('sleepwalk')).toBe(true);
    expect(isCyclic('wave')).toBe(false);
  });

  it('progress: one-shots clamp at 1, loops cycle inside their range forever', () => {
    expect(actionProgress('wave', 0, 1.8, false)).toBe(0);
    expect(actionProgress('wave', 0.9, 1.8, false)).toBeCloseTo(0.5);
    expect(actionProgress('wave', 5, 1.8, false)).toBe(1);
    const [lo, hi] = loopRange('wave');
    for (let t = 0; t < 30; t += 0.37) {
      const u = actionProgress('wave', t, 1.8, true);
      expect(u).toBeGreaterThanOrEqual(0);
      if (t / 1.8 > hi) {
        expect(u).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(u).toBeLessThanOrEqual(hi + 1e-9);
      }
    }
    // Continuous at the loop seam.
    const tSeam = hi * 1.8;
    expect(actionProgress('wave', tSeam - 1e-4, 1.8, true)).toBeCloseTo(hi, 3);
    expect(actionProgress('wave', tSeam + 1e-4, 1.8, true)).toBeCloseTo(lo, 3);
  });

  it('maps actions to friendly expressions', () => {
    expect(actionExpression('noooo', 0.5)).toBe('dramatic');
    expect(actionExpression('yawn', 0.3)).toBe('yawn');
    expect(actionExpression('sleepwalk', 0.3)).toBe('asleep');
    expect(actionExpression('gasp', 0.3)).toBe('surprised');
    expect(actionExpression('cheer', 0.5)).toBe('joy');
    expect(actionExpression('hairFlip', 0.5)).toBe('proud');
    for (const a of CONTRACT_ACTIONS) {
      for (const u of [0, 0.5, 1]) {
        const e = actionExpression(a, u);
        expect(e === null || (EXPRESSIONS as readonly string[]).includes(e)).toBe(true);
      }
    }
  });
});

describe('gait', () => {
  const s = SPECS.chris;
  it('walks below 1.6 m/s, jogs from 2.8', () => {
    expect(gaitOf(0)).toBe(0);
    expect(gaitOf(1.2)).toBe(0);
    expect(gaitOf(3)).toBe(1);
    expect(gaitOf(2.2)).toBeGreaterThan(0);
    expect(gaitOf(2.2)).toBeLessThan(1);
  });
  it('stride is tied to distance: π of phase per step', () => {
    const step = stepLength(0, s);
    expect(phaseAdvance(step, step)).toBeCloseTo(Math.PI);
    expect(phaseAdvance(step * 3, step)).toBeCloseTo(3 * Math.PI);
    // Swing amplitude gives the planted foot one step of travel per half cycle (2·L·sin A ≈ step).
    const L = s.thighL + s.shinL;
    expect(2 * L * Math.sin(swingAmplitude(step, s))).toBeCloseTo(step, 6);
  });
  it('kids take shorter steps; shuffling takes much shorter steps', () => {
    expect(stepLength(0, SPECS.twin)).toBeLessThan(stepLength(0, SPECS.chris));
    expect(stepLength(0, SPECS.twin, 1)).toBeLessThan(stepLength(0, SPECS.twin) * 0.6);
    expect(stepLength(1, s)).toBeGreaterThan(stepLength(0, s));
  });
});

describe('pose writers', () => {
  const personas: Persona[] = ['chris', 'ashley', 'addy', 'ellie', 'heidi', 'extra', 'neighbor', 'guard', 'kid'];
  const holds: HoldKind[] = ['none', 'mug', 'bag', 'box', 'brush', 'phone', 'wheel'];

  it('every base pose × hold × persona is finite', () => {
    const p = new Pose();
    for (const persona of personas) {
      const d = newDrive(SPECS.twin, persona);
      for (const pose of ['stand', 'sit', 'lie', 'kneel', 'drive'] as const) {
        for (const hold of holds) {
          d.pose = pose;
          d.hold = hold;
          d.seat = 0.45;
          for (const t of [0, 1.3, 7.7]) {
            d.t = t;
            d.move = pose === 'stand' ? 0.6 : 0;
            d.phase = t * 3;
            basePose(p, d);
            expect(poseFinite(p), `${persona}/${pose}/${hold}`).toBe(true);
          }
        }
      }
    }
  });

  it('every action and gesture writes a finite pose at every progress', () => {
    const p = new Pose();
    const d = newDrive(SPECS.ashley, 'ashley');
    for (const a of CONTRACT_ACTIONS) {
      for (let u = 0; u <= 1.0001; u += 0.1) {
        standPose(p, d);
        actionPose(p, a, u, { spec: SPECS.ashley, at: u * 2, t: 3, looping: false });
        expect(poseFinite(p), a).toBe(true);
      }
    }
    for (const g of Object.keys(GESTURE_DURATION) as Gesture[]) {
      for (let u = 0; u <= 1.0001; u += 0.1) {
        standPose(p, d);
        gesturePose(p, g, u, { spec: SPECS.ashley, at: u * 2, t: 3, looping: false });
        expect(poseFinite(p), g).toBe(true);
      }
    }
  });

  it('actions start and end at the base pose (smooth blend in/out)', () => {
    const d = newDrive(SPECS.chris, 'chris');
    const base = new Pose();
    const p = new Pose();
    standPose(base, d);
    for (const a of CONTRACT_ACTIONS) {
      if (isCyclic(a)) continue;
      for (const u of [0, 1]) {
        standPose(p, d);
        actionPose(p, a, u, { spec: SPECS.chris, at: 0, t: 0, looping: false });
        for (let i = 0; i < p.v.length; i++) expect(Math.abs(p.v[i]! - base.v[i]!), `${a}@${u} ch${i}`).toBeLessThan(0.02);
      }
    }
  });

  it('sit: hips on the seat, behind the root, thighs forward, feet on the floor (adults)', () => {
    const s = SPECS.chris;
    const d = newDrive(s, 'chris');
    d.pose = 'sit';
    d.seat = 0.45;
    const p = new Pose();
    sitPose(p, d);
    expect(p.gl).toBe(0);
    const hipJ = hipJointY(s) + p.hpy;
    expect(hipJ).toBeCloseTo(0.45 + s.legR * 0.85, 5);
    expect(p.hpz).toBeLessThan(-0.2);
    expect(p.lLx).toBeLessThan(-1.3);
    // Knee height minus lower leg reaches the floor: shin tilted forward so the sole is at y ≈ 0.
    const kneeH = hipJ - s.thighL * Math.sin(-(p.lLx + Math.PI / 2) * -1);
    const shinWorld = p.lLx + p.lLk; // 0 = vertical
    const sole = kneeH - (s.shinL + s.ankleY) * Math.cos(shinWorld);
    expect(Math.abs(sole)).toBeLessThan(0.012);
  });

  it('kids sitting on a 0.4 m chair let their feet dangle', () => {
    const s = SPECS.heidi;
    const d = newDrive(s, 'heidi');
    d.pose = 'sit';
    d.seat = 0.4;
    const p = new Pose();
    sitPose(p, d);
    const hipJ = hipJointY(s) + p.hpy;
    const sole = hipJ - (s.shinL + s.ankleY);
    expect(sole).toBeGreaterThan(0.05);
  });

  it('lie: on the back along local Z with the head at −Z, resting at seat height', () => {
    const s = SPECS.twin;
    const d = newDrive(s, 'addy');
    d.pose = 'lie';
    d.seat = 0.5;
    const p = new Pose();
    liePose(p, d);
    expect(p.bx).toBeCloseTo(-Math.PI / 2);
    expect(p.by).toBe(0);
    // Body point (0, y, z) → (0, z + bty, −y + btz) under Rx(−π/2): the head top maps to −Z.
    const headTopZ = -s.height + p.btz;
    expect(headTopZ).toBeCloseTo(-s.height / 2);
    // Back surface (z = −torsoD) rests on the mattress.
    expect(-s.torsoD + p.bty).toBeCloseTo(0.5, 2);
    // Side sleeping rolls the body.
    d.side = 1;
    liePose(p, d);
    expect(p.by).toBeCloseTo(Math.PI / 2);
    expect(p.lLk).toBeGreaterThan(1);
  });

  it('kneel: one knee on the floor, the other foot planted', () => {
    const s = SPECS.chris;
    const d = newDrive(s, 'chris');
    d.pose = 'kneel';
    const p = new Pose();
    kneelPose(p, d);
    const hipJ = hipJointY(s) + p.hpy;
    // Right thigh ~vertical: knee near the floor.
    expect(hipJ - s.thighL * Math.cos(p.lRx)).toBeLessThan(s.legR * 1.2);
    // Left shin vertical, sole near the floor.
    const knee = hipJ - s.thighL * Math.cos(p.lLx);
    expect(Math.abs(knee - s.shinL - s.ankleY)).toBeLessThan(0.05);
  });

  it('drive: both hands on the wheel via IK', () => {
    const d = newDrive(SPECS.chris, 'chris');
    d.pose = 'drive';
    const p = new Pose();
    basePose(p, d);
    expect(p.ikL).toBe(1);
    expect(p.ikR).toBe(1);
    const g = wheelGrip(SPECS.chris);
    expect(p.tRf).toBeCloseTo(g.fwd);
    expect(g.fwd).toBeGreaterThan(0.3);
  });

  it('holds set arm poses', () => {
    const d = newDrive(SPECS.ashley, 'ashley');
    const p = new Pose();
    d.hold = 'mug';
    standPose(p, d);
    expect(p.ikR).toBeCloseTo(1);
    expect(p.tRf).toBeGreaterThan(0.15);
    d.hold = 'box';
    standPose(p, d);
    expect(p.ikL).toBeCloseTo(1);
    expect(p.ikR).toBeCloseTo(1);
    d.hold = 'brush';
    standPose(p, d);
    expect(p.tRu).toBeGreaterThan(0);
    d.hold = 'bag';
    standPose(p, d);
    expect(p.aRo).toBeGreaterThan(0.15);
  });

  it('personality gestures exist for every persona with sane intervals', () => {
    const ps: Persona[] = ['chris', 'ashley', 'addy', 'ellie', 'heidi', 'extra', 'neighbor', 'guard', 'kid'];
    for (const p of ps) {
      expect(PERSONA_GESTURES[p].length).toBeGreaterThan(0);
      const [a, b] = gestureInterval(p);
      expect(a).toBeGreaterThan(1);
      expect(b).toBeGreaterThan(a);
    }
    expect(PERSONA_GESTURES.chris).toContain('rubEye');
    expect(PERSONA_GESTURES.chris).toContain('scratchBeard');
    expect(PERSONA_GESTURES.heidi).toContain('twirl');
  });

  it('channel index table matches the Pose accessors', () => {
    const p = new Pose();
    p.aRx = 1.25;
    expect(p.v[C.aRx]).toBe(1.25);
    p.v[C.hx] = -0.5;
    expect(p.hx).toBe(-0.5);
  });
});
