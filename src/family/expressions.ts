// ─────────────────────────────────────────────────────────────────────────────
// Expression → face targets (pure data, frozen, shared). The rig smooths the
// numbers and swaps eye / mouth parts. Per-member flavour: Chris's eyes are a
// little sleepy-kind; Ashley's face is always warm (never stern brows).
// ─────────────────────────────────────────────────────────────────────────────
import type { EyeShape, MouthKind } from './skeleton';
import type { Expression } from './types';

export interface FaceTarget {
  eyeL: EyeShape;
  eyeR: EyeShape;
  mouth: MouthKind;
  /** Upper-lid closure added to the base (−1 = force wide open … 1 = closed). */
  lid: number;
  /** Extra lid closure on the right eye only (asymmetric squints). */
  lidR: number;
  /** Lid tilt: + = inner corners down (focused), − = inner corners up (worried). */
  lidTilt: number;
  /** Lower-lid raise 0..1 (smiling / squinting eyes). */
  lowLid: number;
  /** Brow lift (in eye radii). */
  browY: number;
  /** Brow tilt: + = inner ends down (focused), − = inner ends up (worried / pleading). */
  browTilt: number;
  /** Extra lift of the left brow (eye radii). */
  browAsym: number;
  /** Iris/pupil scale (surprised 0.75 … love 1.3). */
  pupil: number;
  /** Pupil vertical bias −1..1. */
  pupilY: number;
  mouthScale: number;
  /** Blush size 0..1.5. */
  blush: number;
  /** Extra head pitch (+ = down) and roll. */
  headX: number;
  headZ: number;
}

export const EXPRESSIONS: readonly Expression[] = [
  'neutral',
  'happy',
  'joy',
  'sleepy',
  'asleep',
  'surprised',
  'determined',
  'worried',
  'pout',
  'smug',
  'love',
  'eek',
  'dramatic',
  'proud',
  'yawn',
];

export type FaceFlavor = 'chris' | 'ashley' | 'girl' | 'extra';

function base(): FaceTarget {
  return { eyeL: 'open', eyeR: 'open', mouth: 'smile', lid: 0, lidR: 0, lidTilt: 0, lowLid: 0.08, browY: 0, browTilt: 0, browAsym: 0, pupil: 1, pupilY: 0, mouthScale: 1, blush: 0.75, headX: 0, headZ: 0 };
}

function build(e: Expression, flavor: FaceFlavor): FaceTarget {
  const f = base();
  switch (e) {
    case 'neutral':
      break;
    case 'happy':
      f.mouth = 'bigSmile';
      f.lowLid = 0.3;
      f.browY = 0.1;
      f.browTilt = -0.1;
      f.blush = 1;
      f.headX = -0.03;
      break;
    case 'joy':
      f.eyeL = f.eyeR = 'joy';
      f.mouth = 'grin';
      f.browY = 0.16;
      f.browTilt = -0.15;
      f.blush = 1.2;
      f.headX = -0.08;
      f.mouthScale = 1.05;
      break;
    case 'sleepy':
      f.mouth = 'smile';
      f.mouthScale = 0.8;
      f.lid = 0.55;
      f.lidTilt = -0.12;
      f.browY = -0.02;
      f.browTilt = -0.12;
      f.pupilY = -0.3;
      f.headX = 0.07;
      f.headZ = 0.05;
      break;
    case 'asleep':
      f.eyeL = f.eyeR = 'closed';
      f.mouth = 'smile';
      f.mouthScale = 0.72;
      f.browY = -0.03;
      f.browTilt = -0.08;
      f.blush = 0.9;
      f.headX = 0.05;
      break;
    case 'surprised':
      f.mouth = 'o';
      f.mouthScale = 1.25;
      f.lid = -1;
      f.lowLid = 0;
      f.browY = 0.3;
      f.browTilt = -0.15;
      f.pupil = 0.74;
      f.headX = -0.06;
      break;
    case 'determined':
      f.mouth = 'smirk';
      f.lid = 0.22;
      f.lowLid = 0.3;
      f.lidTilt = 0.15;
      f.browY = -0.06;
      f.browTilt = 0.24;
      f.blush = 0.8;
      break;
    case 'worried':
      f.mouth = 'wavy';
      f.mouthScale = 0.8;
      f.browY = 0.18;
      f.browTilt = -0.42;
      f.lidTilt = -0.15;
      f.pupil = 0.92;
      f.headZ = 0.07;
      break;
    case 'pout':
      f.mouth = 'pout';
      f.lid = 0.18;
      f.browY = 0.06;
      f.browTilt = -0.22;
      f.blush = 1.25;
      f.headX = 0.06;
      f.headZ = 0.1;
      break;
    case 'smug':
      f.mouth = 'smirk';
      f.lid = 0.4;
      f.lowLid = 0.22;
      f.browAsym = 0.14;
      f.browTilt = 0.05;
      f.headX = -0.08;
      f.headZ = 0.08;
      break;
    case 'love':
      f.mouth = 'bigSmile';
      f.pupil = 1.3;
      f.lowLid = 0.18;
      f.browY = 0.14;
      f.browTilt = -0.22;
      f.blush = 1.45;
      f.headZ = 0.12;
      break;
    case 'eek':
      // Playful "eep! oops!" (brush snag) — NOT a wince: eyes pop wide (the right one extra wide),
      // brows up, small round mouth, cheeky head tilt (+ a tiny pop from the rig).
      f.lid = -1;
      f.lowLid = 0;
      f.mouth = 'o';
      f.mouthScale = 0.85;
      f.browY = 0.26;
      f.browAsym = -0.1;
      f.browTilt = -0.1;
      f.pupil = 0.82;
      f.blush = 1.25;
      f.headX = -0.04;
      f.headZ = -0.1;
      break;
    case 'dramatic':
      // Theatrical "nooo!": eyes wide and rolled up to the sky, brows high, a big round O.
      f.lid = -1;
      f.lowLid = 0;
      f.mouth = 'o';
      f.mouthScale = 1.75;
      f.browY = 0.36;
      f.browTilt = -0.22;
      f.pupil = 0.9;
      f.pupilY = 1;
      f.blush = 1.0;
      f.headX = -0.25;
      break;
    case 'proud':
      f.mouth = 'bigSmile';
      f.lid = 0.32;
      f.lowLid = 0.36;
      f.browY = 0.08;
      f.browTilt = -0.05;
      f.blush = 1.1;
      f.headX = -0.16;
      break;
    case 'yawn':
      f.eyeL = f.eyeR = 'squeeze';
      f.mouth = 'yawn';
      f.mouthScale = 1.2;
      f.browY = 0.2;
      f.browTilt = -0.3;
      f.headX = -0.18;
      break;
  }
  if (flavor === 'ashley') {
    // Always warm: never focused/stern brows; "determined" keeps a kind smile.
    f.browTilt = Math.min(f.browTilt, 0.06);
    f.lidTilt = Math.min(f.lidTilt, 0.05);
    if (e === 'determined') f.mouth = 'smile';
  }
  if (flavor === 'chris' && (e === 'neutral' || e === 'happy')) f.lid += 0.2; // sleepy-kind eyes
  return f;
}

const FLAVORS: readonly FaceFlavor[] = ['chris', 'ashley', 'girl', 'extra'];
const TABLE = {} as Record<FaceFlavor, Record<Expression, Readonly<FaceTarget>>>;
for (const fl of FLAVORS) {
  const row = {} as Record<Expression, Readonly<FaceTarget>>;
  for (const e of EXPRESSIONS) row[e] = Object.freeze(build(e, fl));
  TABLE[fl] = row;
}

/** Shared, frozen face targets (no per-frame allocation). */
export function faceFor(e: Expression, flavor: FaceFlavor): Readonly<FaceTarget> {
  return TABLE[flavor]?.[e] ?? TABLE.girl.neutral;
}

/** Default resting expression per member. */
export function defaultExpression(flavor: FaceFlavor): Expression {
  void flavor;
  return 'neutral';
}
