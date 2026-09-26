// ─────────────────────────────────────────────────────────────────────────────
// FAMILY MODULE — the five family members, the dog and the school-run extras
// (implements src/family/types.ts). Every character is ONE skinned, inked,
// vertex-coloured mesh (+ the girls' brushable hair from src/hair, a blob
// shadow and an emote sprite), so a character costs a handful of draw calls.
// ─────────────────────────────────────────────────────────────────────────────
import { createGirlHair } from '../hair';
import { HumanRig } from './character';
import { DogRig } from './dog';
import { extraKey, extraLook, buildExtra, buildMember } from './outfits';
import { DEFAULT_LOOKS, lookKey, sanitizeDog, sanitizeLooks, sanitizeMember } from './looks';
import { hairFitFor, memberSpec } from './spec';
import type { Persona } from './anim';
import type { FaceFlavor } from './expressions';
import type { Character, Dog, DogLook, ExtraKind, Family, FamilyLooks, GirlId, MemberId, MemberLook } from './types';
import { MEMBERS } from './types';

export { DEFAULT_LOOKS, sanitizeLooks };

/** Cosmetic hair seeds per girl (lock variation, part side). */
export const GIRL_HAIR_SEED: Readonly<Record<GirlId, number>> = { addy: 101, ellie: 202, heidi: 303 };
/** Hair length (crown → tips, m). */
export const GIRL_HAIR_LENGTH: Readonly<Record<GirlId, number>> = { addy: 0.55, ellie: 0.55, heidi: 0.48 };

const isGirl = (id: MemberId): id is GirlId => id === 'addy' || id === 'ellie' || id === 'heidi';

export function createCharacter(id: MemberId, look: MemberLook): Character {
  const memberId: MemberId = (MEMBERS as readonly string[]).includes(id) ? id : 'addy';
  const l = sanitizeMember(look, DEFAULT_LOOKS.members[memberId]);
  const spec = memberSpec(memberId);
  const flavor: FaceFlavor = memberId === 'chris' ? 'chris' : memberId === 'ashley' ? 'ashley' : 'girl';
  const lk = lookKey(l);
  return new HumanRig({
    id: memberId,
    spec,
    persona: memberId as Persona,
    flavor,
    key: (outfit) => `member|${memberId}|${lk}|${outfit}`,
    build: (outfit, rig) => buildMember(memberId, spec, l, outfit, rig),
    outfit: 'sleep',
    hair: isGirl(memberId)
      ? (s) =>
          createGirlHair({
            fit: hairFitFor(s),
            color: l.hair,
            length: GIRL_HAIR_LENGTH[memberId],
            seed: GIRL_HAIR_SEED[memberId],
          })
      : null,
    beard: memberId === 'chris' && l.beard === 'beard',
    low: false,
    hairSim: memberId === 'chris' ? 'bounce' : memberId === 'ashley' ? 'long' : 'none',
    seed: 7,
  });
}

export function createDog(look: DogLook): Dog {
  return new DogRig(sanitizeDog(look));
}

const EXTRA_PERSONA: Readonly<Record<ExtraKind, Persona>> = {
  crossingGuard: 'guard',
  jogger: 'extra',
  teacher: 'extra',
  kid: 'kid',
  neighbor: 'neighbor',
};

export function createExtra(kind: ExtraKind, seed: number): Character {
  const k: ExtraKind = kind in EXTRA_PERSONA ? kind : 'neighbor';
  const x = extraLook(k, Number.isFinite(seed) ? Math.floor(seed) : 1);
  const key = 'extra|' + extraKey(x);
  const rig = new HumanRig({
    id: 'extra',
    spec: x.spec,
    persona: EXTRA_PERSONA[k],
    flavor: 'extra',
    key: () => key,
    build: (_outfit, r) => buildExtra(x, r),
    outfit: 'day',
    hair: null,
    beard: false,
    low: true,
    hairSim: x.hair === 'ponytail' && k !== 'crossingGuard' ? 'ponytail' : x.hair === 'none' ? 'none' : 'bounce',
    seed: seed | 0,
  });
  if (k === 'neighbor') rig.setHold('none');
  return rig;
}

export function createFamily(looks: FamilyLooks): Family {
  const l = sanitizeLooks(looks);
  const m: Record<MemberId, Character> = {
    chris: createCharacter('chris', l.members.chris),
    ashley: createCharacter('ashley', l.members.ashley),
    addy: createCharacter('addy', l.members.addy),
    ellie: createCharacter('ellie', l.members.ellie),
    heidi: createCharacter('heidi', l.members.heidi),
  };
  const dog = createDog(l.dog);
  const members: readonly Character[] = [m.chris, m.ashley, m.addy, m.ellie, m.heidi];
  return {
    chris: m.chris,
    ashley: m.ashley,
    addy: m.addy,
    ellie: m.ellie,
    heidi: m.heidi,
    dog,
    member: (id: MemberId) => m[id] ?? m.chris,
    girl: (id: GirlId) => m[id] ?? m.addy,
    members,
    update(dt: number) {
      for (let i = 0; i < members.length; i++) members[i]!.update(dt);
      dog.update(dt);
    },
    dispose() {
      for (const c of members) c.dispose();
      dog.dispose();
    },
  };
}
