// ─────────────────────────────────────────────────────────────────────────────
// FAMILY CONTRACT — the five procedural family members, the dog, simple "extras"
// (crossing guard, jogger…), and the hand-off to the brushable HAIR rig.
//
// Owners: family module (src/family/*) builds bodies, faces, outfits, animation,
// short/adult hair, the dog and extras. The hair module (src/hair/*) builds the
// girls' brushable long hair (HairRig) and the brushes; the family module calls
// createGirlHair() and parents `hair.root` to the girl's 'head' socket.
// SHARED CONTRACT (frozen): changes go through the integrator.
//
// Conventions: metres, Y up. A character's root sits at its feet (y = 0) and it
// faces its local +Z. Rotate `root.rotation.y` to turn (yaw 0 = facing +Z,
// yaw π = facing −Z, toward the house's back wall). Everything is inked,
// vertex-coloured toon geometry (src/render/models/*).
// ─────────────────────────────────────────────────────────────────────────────
import type * as THREE from 'three';
import type { DogCoat } from '../render/palette';

export type MemberId = 'chris' | 'ashley' | 'addy' | 'ellie' | 'heidi';
export type GirlId = 'addy' | 'ellie' | 'heidi';
export const MEMBERS: readonly MemberId[] = ['chris', 'ashley', 'addy', 'ellie', 'heidi'];
export const GIRLS: readonly GirlId[] = ['addy', 'ellie', 'heidi'];

export const DISPLAY_NAME: Readonly<Record<MemberId, string>> = {
  chris: 'Chris',
  ashley: 'Ashley',
  addy: 'Addy',
  ellie: 'Ellie',
  heidi: 'Heidi',
};

// ── Looks (cosmetic, customisable in FAMILY SETUP; stored locally) ──────────

export interface MemberLook {
  /** Index into SKIN_TONES (0–7). */
  skin: number;
  /** Hair colour (hex). */
  hair: number;
  /** Iris colour (hex). */
  eyes: number;
  glasses: boolean;
  /** Facial hair — only Chris uses it (ignored for everyone else). */
  beard: 'none' | 'stubble' | 'beard';
}

export interface DogLook {
  /** Display name, ≤ 14 chars, user input: render with textContent only. */
  name: string;
  coat: DogCoat;
}

export interface FamilyLooks {
  members: Record<MemberId, MemberLook>;
  dog: DogLook;
}

// ── Character rig ─────────────────────────────────────────────────────────────

/** 'sleep' = pajamas/robe/hoodie (morning); 'day' = school clothes / work outfit / Chris's jacket + sneakers. */
export type Outfit = 'sleep' | 'day';

/**
 * Base pose (continuous). Locomotion (setMotion) only animates in 'stand'.
 *  - 'sit'   : seated; the root goes at the FRONT EDGE of the seat on the floor (y = 0) and the rig bends so the
 *              hips rest at `seatHeight` (setPose opts). Chairs, stools, couch, car seats.
 *  - 'lie'   : lying in bed — see LIE CONVENTION below.
 *  - 'kneel' : kneeling on one knee (looking under the couch, tying shoes).
 *  - 'drive' : seated with both hands on an (imaginary) wheel in front — the car adds the wheel.
 * LIE CONVENTION: with pose 'lie' the character lies on its back along its local Z axis, the body CENTRED on the
 * root: head top at local z = −height/2 (toward the headboard), soles at +height/2, back resting at `seatHeight`
 * (mattress top). `side: +1` lies on her left side facing +X. Bed anchors give the root position + yaw for this.
 * SIT: the hips go on the seat BEHIND the root (the root is the seat's front edge on the floor).
 * DRIVE: the hands grip `wheelGrip(spec)` (src/family/anim.ts) — the car places its wheel there.
 */
export type Pose = 'stand' | 'sit' | 'lie' | 'kneel' | 'drive';

export interface PoseOpts {
  /** Seat / mattress height (m) for 'sit', 'lie', 'drive'. Default 0.45 adults, 0.4 kids (lie: 0.5). */
  seatHeight?: number;
  /** For 'lie': 0 = on the back, ±1 = curled on the side (sleeping). */
  side?: number;
}

/** What the hands hold (sets arm poses; props attach to the 'handR' / 'handL' sockets). */
export type HoldKind =
  | 'none'
  | 'mug' // right hand at chest height, cup upright
  | 'bag' // right arm down, hand gripping a bag's knot at hip height (trash bag hangs below)
  | 'box' // both hands in front at waist (lunchboxes, a stack of plates, a shoe)
  | 'brush' // right hand raised to head height holding a brush (Ashley finishing hair, girls self-brushing)
  | 'phone' // right hand low-front (Ashley checking the time)
  | 'wheel'; // both hands forward at chest (driving)

/** One-shot gestures. Each returns its duration (s) from play(). */
export type Action =
  | 'wave'
  | 'cheer' // both arms up, bounce
  | 'jump' // happy hop
  | 'yawn' // big stretch-yawn (arms up, mouth wide)
  | 'stretch' // wake-up stretch
  | 'gasp' // hands to cheeks
  | 'noooo' // dramatic comic "nooo!" — knees bend, arms flung out, head tilted back (theatrical, NOT upset)
  | 'point' // point forward with the right arm
  | 'shrug'
  | 'checkWatch' // Chris glances at his wrist
  | 'sip' // sip from the held mug (hold 'mug')
  | 'lunge' // reach forward fast (the black-brush scramble)
  | 'grab' // quick grab / pick up in front at waist height
  | 'pickUpLow' // bend down and pick something up from the floor
  | 'handOff' // offer something forward with the right hand
  | 'toss' // underarm toss (trash into the bin)
  | 'giggle' // shoulders bounce, hand over mouth
  | 'hug' // arms forward-wide then close (pair two characters facing each other)
  | 'nod'
  | 'shakeHead'
  | 'facepalm' // gentle, comic
  | 'dance' // little happy wiggle (loopable)
  | 'hairFlip' // girls: proud hair flip (the hair rig reacts through its own motion)
  | 'inspect' // Ashley: lean in, one hand lifting, squinting (mock-serious)
  | 'brushFast' // Ashley: speedy loving brush flourish (hold 'brush')
  | 'thumbsUp'
  | 'shh' // finger to lips (Chris, quiet!)
  | 'sleepwalk' // arms slightly forward, eyes closed, shuffling (loop while moving)
  | 'bounce'; // excited bouncing on the spot (loopable)

export interface PlayOpts {
  /** Duration override (s). */
  duration?: number;
  /** Repeat until another play()/cancelAction(). */
  loop?: boolean;
}

export type Expression =
  | 'neutral'
  | 'happy'
  | 'joy' // eyes closed smile ^^
  | 'sleepy' // heavy lids
  | 'asleep' // closed eyes, peaceful
  | 'surprised'
  | 'determined'
  | 'worried' // eyebrows up, small mouth (comic, not sad)
  | 'pout' // playful pout
  | 'smug'
  | 'love' // big shiny eyes
  | 'eek' // playful "eep!" / "oops!" (brush snag) — eyes wide, brows up, small O mouth, a little head bob; NEVER pain
  | 'dramatic' // theatrical "nooo!" — eyes wide and rolled up, brows high, big O mouth, head back; comedic, never crying
  | 'proud' // chin up, satisfied smile
  | 'yawn'; // mouth wide open, eyes squeezed

/** Pop-up icons floating above the head (3D sprites owned by the family module). */
export type Emote = 'exclaim' | 'question' | 'heart' | 'zzz' | 'sweat' | 'sparkle' | 'music' | 'shh' | 'idea' | 'check' | 'star' | 'huff';

export type SocketName =
  // Hand sockets sit at the mitten centre and stay upright in the BODY frame (+Y up, +Z forward) — a prop parented
  // there (at −prop.grip.position) stands upright in the hand; actions tilt them (e.g. 'sip' tips the mug).
  | 'handR' // right hand (at −X when facing +Z)
  | 'handL'
  | 'head' // head centre (hair and hats attach here; head space: +Y up, +Z face forward)
  | 'back' // between the shoulder blades on the back surface (backpacks)
  | 'overhead' // ~0.35 m above the top of the head (speech bubbles, emotes)
  | 'root';

export interface Character {
  readonly id: MemberId | 'extra';
  /** Place/rotate this in the world. Faces local +Z; feet at y = 0. */
  readonly root: THREE.Group;
  /** Standing height to the top of the head (m, without hair volume). */
  readonly height: number;
  /** The brushable hair rig (girls only), null otherwise. */
  readonly hair: import('../hair/types').HairRig | null;
  setOutfit(outfit: Outfit): void;
  /** Horizontal speed (m/s) → idle / walk / jog blend; stride advances with distance (no foot skating). */
  setMotion(speed: number): void;
  setPose(pose: Pose, opts?: PoseOpts): void;
  readonly pose: Pose;
  setHold(kind: HoldKind): void;
  play(action: Action, opts?: PlayOpts): number;
  readonly action: Action | null;
  cancelAction(): void;
  /** Reverts to the character's default expression after `seconds` (omit = until changed). */
  setExpression(expression: Expression, seconds?: number): void;
  /** Blink-lid heaviness 0..1 layered on any expression (half-asleep sleepwalkers, 5 AM Chris). */
  setSleepiness(v: number): void;
  /** Turn head (+ eyes) toward a world point, null = straight ahead. Clamped to a natural range. */
  lookAt(world: THREE.Vector3 | null): void;
  socket(name: SocketName): THREE.Object3D;
  /** Pop an emote above the head for `seconds` (default 1.6). 'zzz' loops until emote(null). */
  emote(kind: Emote | null, seconds?: number): void;
  /** Advance animation (dt = 0 when paused). */
  update(dt: number): void;
  dispose(): void;
}

// ── Dog ───────────────────────────────────────────────────────────────────────

export type DogPose = 'stand' | 'sit' | 'lie' | 'sleep' | 'curl';

export type DogAction =
  | 'bark'
  | 'wag' // happy wag burst (tail always wags a bit when stand/sit)
  | 'sniff' // nose to the ground, sniff sniff
  | 'pee' // discreet: turns its back, lifts a leg briefly (no liquid, ever) — used behind the yard bush
  | 'stare' // freezes, staring into the distance, ears up (the "stares at nothing" joke)
  | 'zoomies' // excited spin/bounce on the spot (the caller moves the root for real laps)
  | 'jump' // hop up (greeting)
  | 'shake' // body shake (wet / after rolling)
  | 'tilt' // head tilt (confused by being called at the wrong time)
  | 'pounce' // play bow + pounce (leaf!)
  | 'roll' // roll over
  | 'scratch'
  | 'beg'
  | 'yawn'
  | 'stretch'
  | 'dig'; // paws at the ground / couch cushion (found something!)

export type DogSocket = 'mouth' | 'head' | 'overhead' | 'root';

export interface Dog {
  readonly root: THREE.Group;
  readonly name: string;
  /** Speed (m/s): idle / trot / run blend with bouncy gait. */
  setMotion(speed: number): void;
  setPose(pose: DogPose): void;
  readonly pose: DogPose;
  play(action: DogAction, opts?: PlayOpts): number;
  readonly action: DogAction | null;
  cancelAction(): void;
  lookAt(world: THREE.Vector3 | null): void;
  emote(kind: Emote | null, seconds?: number): void;
  /** Tongue out + fast wag (0) … calm (1) … sleepy (2). */
  setMood(mood: 'excited' | 'calm' | 'sleepy'): void;
  socket(name: DogSocket): THREE.Object3D;
  update(dt: number): void;
  dispose(): void;
}

// ── Extras (low-detail NPCs for the school run) ───────────────────────────────

export type ExtraKind = 'crossingGuard' | 'jogger' | 'teacher' | 'kid' | 'neighbor';

// ── Factory (src/family/index.ts) ─────────────────────────────────────────────

export interface Family {
  readonly chris: Character;
  readonly ashley: Character;
  readonly addy: Character;
  readonly ellie: Character;
  readonly heidi: Character;
  readonly dog: Dog;
  member(id: MemberId): Character;
  girl(id: GirlId): Character;
  readonly members: readonly Character[];
  update(dt: number): void;
  dispose(): void;
}

/*
 * src/family/index.ts exports:
 *   export function createFamily(looks: FamilyLooks): Family;
 *   export function createCharacter(id: MemberId, look: MemberLook): Character;
 *   export function createDog(look: DogLook): Dog;
 *   export function createExtra(kind: ExtraKind, seed: number): Character;
 *   export const DEFAULT_LOOKS: FamilyLooks;
 *   export function sanitizeLooks(input: unknown): FamilyLooks;   // never throws; fills defaults
 */
