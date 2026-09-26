// ─────────────────────────────────────────────────────────────────────────────
// Body specs: cartoon proportions for every body the family module builds (pure).
// All heights are model-space metres with the feet at y = 0, facing +Z, in the
// standing rest (bind) pose. Adults' heads ≈ 1/4.5 of their height, kids' ≈ 1/3.4.
// ─────────────────────────────────────────────────────────────────────────────
import type { HairFit } from '../hair/types';
import type { MemberId } from './types';

export type BodyKind = 'man' | 'woman' | 'girl' | 'little' | 'kid';

export interface BodySpec {
  readonly kind: BodyKind;
  /** Top of the head (m, without hair volume). */
  readonly height: number;
  // head ellipsoid (head space: origin = head centre)
  readonly headRx: number;
  readonly headRy: number;
  readonly headRz: number;
  /** Head centre above / in front of the head bone pivot (top of the neck). */
  readonly headCY: number;
  readonly headCZ: number;
  // rest heights of the bones (model space)
  readonly hipsY: number;
  readonly spineY: number;
  readonly chestY: number;
  readonly neckY: number;
  readonly shoulderY: number;
  readonly shoulderX: number;
  readonly hipX: number;
  readonly thighL: number;
  readonly shinL: number;
  /** Ankle joint height above the sole. */
  readonly ankleY: number;
  readonly upperArmL: number;
  readonly foreArmL: number;
  /** Mitten radius. */
  readonly handR: number;
  /** Upper-arm radius (sleeves are a little wider). */
  readonly armR: number;
  /** Thigh radius. */
  readonly legR: number;
  /** Chest half width / half depth; waist; hips. */
  readonly torsoW: number;
  readonly torsoD: number;
  readonly waistW: number;
  readonly waistD: number;
  readonly hipW: number;
  readonly hipD: number;
  readonly footL: number;
  readonly footW: number;
  // face layout (angles on the head ellipsoid, radians) + eye size
  readonly eyeR: number;
  readonly eyeYaw: number;
  readonly eyePitch: number;
  readonly browPitch: number;
  readonly nosePitch: number;
  readonly mouthPitch: number;
  /** Iris radius relative to the eye radius. */
  readonly iris: number;
  /** Gait scale relative to an adult (step lengths). */
  readonly scale: number;
  readonly kid: boolean;
}

type Base = Omit<BodySpec, 'hipsY' | 'neckY' | 'scale' | 'kid'>;

function finish(b: Base, kid: boolean): BodySpec {
  const hipJoint = b.thighL + b.shinL + b.ankleY;
  const headC = b.height - b.headRy;
  return {
    ...b,
    hipsY: hipJoint + b.legR * 0.75,
    neckY: headC - b.headCY,
    scale: (b.thighL + b.shinL) / 0.8,
    kid,
  };
}

export const SPECS: Readonly<Record<'chris' | 'ashley' | 'twin' | 'heidi' | 'man' | 'woman' | 'kid', BodySpec>> = {
  chris: finish(
    {
      kind: 'man',
      height: 1.85,
      headRx: 0.185,
      headRy: 0.205,
      headRz: 0.182,
      headCY: 0.172,
      headCZ: 0.012,
      spineY: 1.0,
      chestY: 1.16,
      shoulderY: 1.375,
      shoulderX: 0.235,
      hipX: 0.1,
      thighL: 0.41,
      shinL: 0.39,
      ankleY: 0.07,
      upperArmL: 0.31,
      foreArmL: 0.265,
      handR: 0.074,
      armR: 0.068,
      legR: 0.0972,
      torsoW: 0.215,
      torsoD: 0.145,
      waistW: 0.195,
      waistD: 0.135,
      hipW: 0.19,
      hipD: 0.13,
      footL: 0.25,
      footW: 0.1,
      eyeR: 0.05,
      eyeYaw: 0.34,
      eyePitch: -0.02,
      browPitch: 0.44,
      nosePitch: -0.2,
      mouthPitch: -0.46,
      iris: 0.64,
    },
    false,
  ),
  ashley: finish(
    {
      kind: 'woman',
      height: 1.7,
      headRx: 0.172,
      headRy: 0.19,
      headRz: 0.17,
      headCY: 0.156,
      headCZ: 0.012,
      spineY: 0.93,
      chestY: 1.07,
      shoulderY: 1.262,
      shoulderX: 0.198,
      hipX: 0.093,
      thighL: 0.375,
      shinL: 0.365,
      ankleY: 0.065,
      upperArmL: 0.28,
      foreArmL: 0.245,
      handR: 0.064,
      armR: 0.0562,
      legR: 0.0893,
      torsoW: 0.175,
      torsoD: 0.125,
      waistW: 0.145,
      waistD: 0.11,
      hipW: 0.18,
      hipD: 0.13,
      footL: 0.215,
      footW: 0.085,
      eyeR: 0.052,
      eyeYaw: 0.35,
      eyePitch: -0.05,
      browPitch: 0.42,
      nosePitch: -0.22,
      mouthPitch: -0.48,
      iris: 0.66,
    },
    false,
  ),
  twin: finish(
    {
      kind: 'girl',
      height: 1.36,
      headRx: 0.19,
      headRy: 0.2,
      headRz: 0.185,
      headCY: 0.165,
      headCZ: 0.01,
      spineY: 0.665,
      chestY: 0.775,
      shoulderY: 0.905,
      shoulderX: 0.165,
      hipX: 0.077,
      thighL: 0.245,
      shinL: 0.245,
      ankleY: 0.06,
      upperArmL: 0.195,
      foreArmL: 0.172,
      handR: 0.058,
      armR: 0.0486,
      legR: 0.0689,
      torsoW: 0.148,
      torsoD: 0.108,
      waistW: 0.138,
      waistD: 0.1,
      hipW: 0.142,
      hipD: 0.105,
      footL: 0.17,
      footW: 0.074,
      eyeR: 0.058,
      eyeYaw: 0.35,
      eyePitch: -0.1,
      browPitch: 0.46,
      nosePitch: -0.27,
      mouthPitch: -0.52,
      iris: 0.7,
    },
    true,
  ),
  heidi: finish(
    {
      kind: 'little',
      height: 1.2,
      headRx: 0.19,
      headRy: 0.182,
      headRz: 0.18,
      headCY: 0.15,
      headCZ: 0.01,
      spineY: 0.58,
      chestY: 0.675,
      shoulderY: 0.79,
      shoulderX: 0.148,
      hipX: 0.072,
      thighL: 0.205,
      shinL: 0.205,
      ankleY: 0.056,
      upperArmL: 0.17,
      foreArmL: 0.152,
      handR: 0.055,
      armR: 0.0464,
      legR: 0.0655,
      torsoW: 0.142,
      torsoD: 0.108,
      waistW: 0.138,
      waistD: 0.104,
      hipW: 0.136,
      hipD: 0.1,
      footL: 0.152,
      footW: 0.07,
      eyeR: 0.063,
      eyeYaw: 0.36,
      eyePitch: -0.13,
      browPitch: 0.48,
      nosePitch: -0.3,
      mouthPitch: -0.54,
      iris: 0.72,
    },
    true,
  ),
  man: finish(
    {
      kind: 'man',
      height: 1.78,
      headRx: 0.178,
      headRy: 0.198,
      headRz: 0.175,
      headCY: 0.166,
      headCZ: 0.012,
      spineY: 0.96,
      chestY: 1.11,
      shoulderY: 1.315,
      shoulderX: 0.225,
      hipX: 0.097,
      thighL: 0.39,
      shinL: 0.375,
      ankleY: 0.068,
      upperArmL: 0.3,
      foreArmL: 0.255,
      handR: 0.071,
      armR: 0.0648,
      legR: 0.0938,
      torsoW: 0.205,
      torsoD: 0.14,
      waistW: 0.19,
      waistD: 0.13,
      hipW: 0.185,
      hipD: 0.128,
      footL: 0.24,
      footW: 0.096,
      eyeR: 0.047,
      eyeYaw: 0.34,
      eyePitch: -0.03,
      browPitch: 0.44,
      nosePitch: -0.2,
      mouthPitch: -0.46,
      iris: 0.62,
    },
    false,
  ),
  woman: finish(
    {
      kind: 'woman',
      height: 1.66,
      headRx: 0.168,
      headRy: 0.186,
      headRz: 0.166,
      headCY: 0.152,
      headCZ: 0.012,
      spineY: 0.91,
      chestY: 1.045,
      shoulderY: 1.232,
      shoulderX: 0.193,
      hipX: 0.09,
      thighL: 0.365,
      shinL: 0.355,
      ankleY: 0.064,
      upperArmL: 0.272,
      foreArmL: 0.238,
      handR: 0.062,
      armR: 0.0551,
      legR: 0.087,
      torsoW: 0.172,
      torsoD: 0.122,
      waistW: 0.148,
      waistD: 0.11,
      hipW: 0.178,
      hipD: 0.128,
      footL: 0.21,
      footW: 0.083,
      eyeR: 0.049,
      eyeYaw: 0.35,
      eyePitch: -0.05,
      browPitch: 0.42,
      nosePitch: -0.22,
      mouthPitch: -0.48,
      iris: 0.64,
    },
    false,
  ),
  kid: finish(
    {
      kind: 'kid',
      height: 1.3,
      headRx: 0.186,
      headRy: 0.195,
      headRz: 0.18,
      headCY: 0.16,
      headCZ: 0.01,
      spineY: 0.64,
      chestY: 0.745,
      shoulderY: 0.87,
      shoulderX: 0.16,
      hipX: 0.075,
      thighL: 0.235,
      shinL: 0.235,
      ankleY: 0.058,
      upperArmL: 0.188,
      foreArmL: 0.166,
      handR: 0.056,
      armR: 0.0475,
      legR: 0.0678,
      torsoW: 0.145,
      torsoD: 0.106,
      waistW: 0.136,
      waistD: 0.1,
      hipW: 0.14,
      hipD: 0.103,
      footL: 0.165,
      footW: 0.073,
      eyeR: 0.056,
      eyeYaw: 0.35,
      eyePitch: -0.1,
      browPitch: 0.46,
      nosePitch: -0.27,
      mouthPitch: -0.52,
      iris: 0.68,
    },
    true,
  ),
};

export function memberSpec(id: MemberId): BodySpec {
  switch (id) {
    case 'chris':
      return SPECS.chris;
    case 'ashley':
      return SPECS.ashley;
    case 'heidi':
      return SPECS.heidi;
    default:
      return SPECS.twin;
  }
}

/** Head centre in model space (standing rest pose). */
export function headCenter(s: BodySpec): [number, number, number] {
  return [0, s.neckY + s.headCY, s.headCZ];
}

/** Hip joint height (standing). */
export function hipJointY(s: BodySpec): number {
  return s.thighL + s.shinL + s.ankleY;
}

/** Total arm length shoulder → mitten centre. */
export function armLength(s: BodySpec): number {
  return s.upperArmL + s.foreArmL + s.handR * 0.85;
}

/**
 * Hair fit in HEAD SPACE (origin = head centre, +Y up, +Z face forward) for the girls' brushable hair.
 * Includes a small clothing margin so the hair drapes outside collars and shoulders.
 */
export function hairFitFor(s: BodySpec): HairFit {
  const [, cy, cz] = headCenter(s);
  const shoulderTop = s.shoulderY + s.armR * 0.7;
  return {
    rx: s.headRx,
    ry: s.headRy,
    rz: s.headRz,
    shoulderY: shoulderTop - cy,
    shoulderHalfWidth: s.shoulderX + s.armR * 1.05,
    backZ: -(s.torsoD * 0.96 + 0.012) - cz,
    neckY: -s.headCY,
  };
}
