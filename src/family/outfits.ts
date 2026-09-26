// ─────────────────────────────────────────────────────────────────────────────
// Outfit composition: one skinned geometry per (member, look, outfit) — body,
// clothes, face and own hair — plus the extras' simple seeded outfits.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CONFETTI_COLORS, EYE_COLORS, HAIR_COLORS, PAL, SKIN_TONES } from '../render/palette';
import { mixHex, shadeHex } from '../render/models/builder';
import { rand01 } from '../render/models/common';
import {
  arms,
  band,
  buttons,
  collar,
  drawstrings,
  feet,
  frontPatch,
  hands,
  hipJ,
  hood,
  kneeY,
  legs,
  neckR,
  print,
  scrunchie,
  skirt,
  stripes,
  torsoRings,
  torsoTube,
  edgeTrim,
  vOpen,
  type BodyCtx,
  type ShoeStyle,
} from './body';
import { alignY, ringTube, tubePoint as pointOn } from './geo';
import { buildHair, type HairStyle } from './hairdo';
import { buildHead, type HeadStyle } from './head';
import { B, type Rig } from './skeleton';
import { SkinBuilder } from './skin';
import { SPECS, type BodySpec } from './spec';
import type { ExtraKind, MemberId, MemberLook, Outfit } from './types';

export function skinHex(look: MemberLook): number {
  return SKIN_TONES[look.skin] ?? SKIN_TONES[1]!;
}

const GLASSES: Record<MemberId, number> = {
  chris: PAL.glassesFrame,
  ashley: PAL.glassesFrameWarm,
  addy: PAL.addyDark,
  ellie: PAL.ellieDark,
  heidi: PAL.heidiDark,
};

export function memberHeadStyle(id: MemberId, look: MemberLook): HeadStyle {
  return {
    skin: skinHex(look),
    eyes: look.eyes,
    hair: look.hair,
    lashes: id !== 'chris',
    glasses: look.glasses ? GLASSES[id] : null,
    beard: id === 'chris' ? look.beard : 'none',
    brows: id === 'chris' ? 'thick' : id === 'ashley' ? 'arched' : 'soft',
    ears: id === 'chris',
    starClip: id === 'ellie' ? PAL.ellieMain : null,
    low: false,
  };
}

/** Pelvis / shorts / trouser top (crotch → waist), under tops. */
function pelvis(ctx: BodyCtx, color: number, toY = ctx.s.spineY + 0.02): void {
  const rings = torsoRings(ctx.s, 1.0).filter((r) => r.y <= toY + 1e-4);
  torsoTube(ctx, rings, color, { closeBottom: true });
}

interface TopOpts {
  color: number;
  loose?: number;
  hemY?: number;
  flare?: number;
  hemBand?: number | null;
  phi0?: number;
  phiLen?: number;
  /** V opening: [neckline, waist, hem] half-angles (rad), waist at spineY + vWaist. */
  v?: [number, number, number];
  vWaist?: number;
}

function top(ctx: BodyCtx, o: TopOpts): { b: ReturnType<SkinBuilder['blend']>; rings: ReturnType<typeof torsoRings> } {
  // A little hem flare keeps tops clear of the trousers underneath (no z-fighting at the hem).
  let rings = torsoRings(ctx.s, o.loose ?? 1.04, o.hemY, o.flare ?? 0.035);
  if (o.v) rings = vOpen(rings, ctx.s.spineY + (o.vWaist ?? 0), o.v[0], o.v[1], o.v[2]);
  const b = torsoTube(ctx, rings, o.color, { phi0: o.phi0, phiLen: o.phiLen });
  if (o.hemBand) band(b, rings, rings[0]!.y, rings[0]!.y + 0.03, o.hemBand, 0.004, ctx.low ? 9 : 12, true, o.phi0, o.phiLen);
  return { b, rings };
}

const sneaker = (accent: number): ShoeStyle => ({ kind: 'sneaker', color: PAL.sneakerWhite, accent });

// ── the family ─────────────────────────────────────────────────────────────────

export function buildMember(id: MemberId, s: BodySpec, look: MemberLook, outfit: Outfit, rig: Rig): THREE.BufferGeometry {
  const sb = new SkinBuilder(rig.rest);
  const ctx: BodyCtx = { sb, s, skin: skinHex(look), low: false };
  buildHead(sb, s, memberHeadStyle(id, look));
  hands(ctx);
  switch (id) {
    case 'chris':
      chris(ctx, outfit);
      buildHair(sb, s, rig, 'chris', look.hair);
      break;
    case 'ashley':
      ashley(ctx, outfit);
      buildHair(sb, s, rig, 'ashley', look.hair);
      break;
    case 'addy':
      addy(ctx, outfit);
      break;
    case 'ellie':
      ellie(ctx, outfit);
      break;
    case 'heidi':
      heidi(ctx, outfit);
      break;
  }
  return sb.build();
}

function chris(ctx: BodyCtx, outfit: Outfit): void {
  const s = ctx.s;
  const hoodie = PAL.chrisHoodie;
  const rib = shadeHex(hoodie, 0.82);
  const hem = hipJ(s) - s.legR * 0.05;
  const day = outfit === 'day';
  pelvis(ctx, day ? PAL.jeansDark : PAL.chrisJoggers);
  const t = top(ctx, { color: hoodie, loose: 1.07, hemY: hem, flare: 0.02, hemBand: rib });
  frontPatch(t.b, t.rings, s.spineY - 0.035, s.waistW * 0.6, 0.06, mixHex(hoodie, 0xffffff, 0.08), 0.012);
  hood(ctx, hoodie, shadeHex(hoodie, 0.7), day ? 1.1 : 1);
  drawstrings(ctx, PAL.hoodieString, 0.13);
  // Wristwatch on his left wrist (checkWatch).
  const hw = ctx.sb.on(B.handL);
  hw.torus(s.armR * 0.72, 0.008, 3, 10, PAL.glassesFrame, { at: [0, -0.004, 0], rot: [Math.PI / 2, 0, 0], ink: false });
  hw.cyl(0.017, 0.017, 0.008, 8, PAL.goldTrim, { at: [s.armR * 0.72, -0.004, 0], rot: [0, 0, Math.PI / 2], ink: false });
  hw.cyl(0.013, 0.013, 0.009, 8, PAL.mugBody, { at: [s.armR * 0.74, -0.004, 0], rot: [0, 0, Math.PI / 2], ink: false });
  if (!day) {
    arms(ctx, { color: hoodie, width: 1.14, length: 'wrist', cuff: rib });
    legs(ctx, { color: PAL.chrisJoggers, width: 1.12, cuff: shadeHex(PAL.chrisJoggers, 0.84) });
    feet(ctx, { kind: 'slipper', color: PAL.slipper, accent: PAL.pajamaCream });
    return;
  }
  // Day: green zip jacket over the hoodie (open front), jeans, sneakers.
  const jacket = PAL.chrisJacket;
  const j = top(ctx, { color: jacket, loose: 1.14, hemY: hipJ(s) - s.legR * 0.35, flare: 0.03, hemBand: shadeHex(jacket, 0.8), phi0: 0.34, phiLen: Math.PI * 2 - 0.68 });
  // Zip edges.
  for (const phi of [0.34, -0.34]) {
    const e = j.rings;
    const rs = e.map((r) => ({ y: r.y, w: r.w + 0.004, d: r.d + 0.004, z: r.z }));
    j.b.add(ringTube(rs.slice(0, -1), 1, { phi0: phi - 0.03, phiLen: 0.06 }), shadeHex(jacket, 0.78), { smooth: true, ink: false });
  }
  collar(ctx, jacket, 0.022, 0.9);
  arms(ctx, { color: jacket, width: 1.2, length: 'wrist', cuff: shadeHex(jacket, 0.8) });
  legs(ctx, { color: PAL.jeansDark, width: 1.04, cuff: null, hemBand: null });
  feet(ctx, sneaker(PAL.chrisHoodie));
}

function ashley(ctx: BodyCtx, outfit: Outfit): void {
  const s = ctx.s;
  if (outfit === 'sleep') {
    const robe = PAL.ashleyRobe;
    const pj = PAL.ashleyPJ;
    pelvis(ctx, pj);
    legs(ctx, { color: pj, width: 1.12, cuff: null });
    // PJ top under a wrap robe with a V neckline + rolled shawl collar.
    top(ctx, { color: pj, loose: 1.02, hemY: s.spineY - 0.02 });
    const t = top(ctx, { color: robe, loose: 1.11, hemY: s.spineY - 0.04, v: [0.72, 0.03, 0.03], vWaist: 0.01 });
    edgeTrim(t.b, t.rings, s.spineY, 0.019, mixHex(robe, 0xffffff, 0.2));
    collar(ctx, mixHex(robe, 0xffffff, 0.2), 0.02, 1.35);
    // Robe skirt to the knees + belt tie.
    const sk = skirt(ctx, s.spineY + 0.02, kneeY(s) - 0.02, s.waistW * 1.14, s.waistD * 1.16, s.hipW * 1.42, s.hipD * 1.4, robe);
    void sk;
    const belt = ctx.sb.blend(B.base, (x, y, z, o) => {
      o.i[0] = B.spine;
      o.w[0] = 1;
      o.i[1] = o.i[2] = o.i[3] = 0;
      o.w[1] = o.w[2] = o.w[3] = 0;
      void x;
      void y;
      void z;
    });
    const beltY = s.spineY - 0.005;
    belt.add(
      ringTube(
        [
          { y: beltY - 0.016, w: s.waistW * 1.17, d: s.waistD * 1.2 },
          { y: beltY + 0.016, w: s.waistW * 1.16, d: s.waistD * 1.18 },
        ],
        16,
      ),
      shadeHex(robe, 0.86),
      { smooth: true },
    );
    const kx = s.waistW * 0.55;
    const kz = s.waistD * 1.08;
    belt.sphere(0.022, 8, 5, shadeHex(robe, 0.86), { at: [kx, beltY, kz], smooth: true });
    for (const e of [-1, 1]) belt.sphere(0.03, 8, 5, shadeHex(robe, 0.9), { at: [kx + e * 0.028, beltY + 0.006, kz - 0.004], rot: [0, 0, e * 0.5], scale: [1.2, 0.6, 0.5], smooth: true });
    for (const e of [-1, 1]) belt.sphere(0.014, 6, 4, shadeHex(robe, 0.86), { at: [kx + e * 0.012, beltY - 0.07, kz + 0.004], scale: [1, 4.5, 0.6], rot: [0, 0, e * 0.15], smooth: true });
    arms(ctx, { color: robe, width: 1.16, length: 'wrist', flare: 0.32, cuff: mixHex(robe, 0xffffff, 0.22) });
    feet(ctx, { kind: 'fuzzy', color: PAL.fuzzySlipper, accent: PAL.pajamaCream });
    return;
  }
  // Day: teal blazer, cream top, dark trousers, flats.
  pelvis(ctx, PAL.trouserPlum);
  top(ctx, { color: PAL.ashleyTop, loose: 1.02, hemY: hipJ(s) + 0.02 });
  collar(ctx, PAL.ashleyTop, 0.012, 1.2);
  const bl = PAL.ashleyBlazer;
  const j = top(ctx, { color: bl, loose: 1.1, hemY: hipJ(s) - s.legR * 0.2, flare: 0.04, v: [0.62, 0.07, 0.3], vWaist: -0.02 });
  edgeTrim(j.b, j.rings, s.spineY - 0.01, 0.017, shadeHex(bl, 0.82), 0.007);
  collar(ctx, shadeHex(bl, 0.82), 0.02, 1.3);
  buttons(j.b, j.rings, s.spineY - 0.035, s.spineY - 0.005, 1, PAL.goldTrim, 0.012, 0.16);
  arms(ctx, { color: bl, width: 1.12, length: 'wrist', cuff: PAL.ashleyTop });
  legs(ctx, { color: PAL.trouserPlum, width: 1.05 });
  feet(ctx, { kind: 'flat', color: PAL.flatShoe, accent: PAL.goldTrim });
}

function torsoPoint(rings: ReturnType<typeof torsoRings>, phi: number, y: number, lift: number) {
  return pointOn(rings, phi, y, lift);
}


function pjSet(ctx: BodyCtx, main: number, deco: { kind: 'dot' | 'star' | 'stripe'; color: number }, trim: number): void {
  const s = ctx.s;
  pelvis(ctx, main);
  const t = top(ctx, { color: main, loose: 1.07, hemY: hipJ(s) - s.legR * 0.2, flare: 0.05, hemBand: trim });
  const y0 = hipJ(s) + 0.01;
  const y1 = s.shoulderY - 0.01;
  const size = s.kid ? 0.012 : 0.014;
  if (deco.kind === 'stripe') stripes(t.b, t.rings, deco.color, y0, y1, 5, 0.016, 12);
  else print(t.b, t.rings, deco.kind, deco.color, deco.kind === 'star' ? size * 1.25 : size, y0, y1, 4, 8, main & 0xff);
  collar(ctx, trim, 0.014);
  const legPrint = deco.kind === 'stripe' ? null : { kind: deco.kind, color: deco.color, size: deco.kind === 'star' ? size * 1.2 : size * 0.95, rows: 3, perRow: 5 };
  legs(ctx, { color: main, width: 1.16, cuff: trim, print: legPrint, stripes: deco.kind === 'stripe' ? { color: deco.color, count: 4 } : null });
  arms(ctx, {
    color: main,
    width: 1.14,
    length: 'wrist',
    cuff: trim,
    print: deco.kind === 'stripe' ? null : { kind: deco.kind, color: deco.color, size: size * 0.9, rows: 3, perRow: 4 },
    stripes: deco.kind === 'stripe' ? { color: deco.color, count: 3 } : null,
  });
  feet(ctx, { kind: 'sock', color: PAL.pajamaCream, accent: trim });
}

function addy(ctx: BodyCtx, outfit: Outfit): void {
  const s = ctx.s;
  const scr = mixHex(PAL.addyMain, PAL.addyDark, 0.45);
  if (outfit === 'sleep') {
    pjSet(ctx, PAL.addyMain, { kind: 'dot', color: PAL.pajamaCream }, PAL.pajamaCream);
  } else {
    const hoodieC = mixHex(PAL.addyMain, PAL.addyDark, 0.55);
    const rib = shadeHex(hoodieC, 0.84);
    pelvis(ctx, PAL.leggingPlum);
    const t = top(ctx, { color: hoodieC, loose: 1.08, hemY: hipJ(s) + 0.005, flare: 0.03, hemBand: rib });
    frontPatch(t.b, t.rings, s.spineY - 0.02, s.waistW * 0.6, 0.045, mixHex(hoodieC, 0xffffff, 0.1), 0.01);
    hood(ctx, hoodieC, PAL.addyMain, 1);
    drawstrings(ctx, PAL.hoodieString, 0.09);
    skirt(ctx, s.spineY - 0.035, hipJ(s) - s.thighL * 0.42, s.waistW * 1.12, s.waistD * 1.14, s.hipW * 1.34, s.hipD * 1.28, PAL.denim, 0.7);
    legs(ctx, { color: PAL.leggingPlum, width: 0.95 });
    arms(ctx, { color: hoodieC, width: 1.14, length: 'wrist', cuff: rib });
    feet(ctx, sneaker(PAL.addyMain));
  }
  scrunchie(ctx, -1, scr);
}

function ellie(ctx: BodyCtx, outfit: Outfit): void {
  const s = ctx.s;
  if (outfit === 'sleep') {
    pjSet(ctx, PAL.mintPJ, { kind: 'stripe', color: PAL.pajamaCream }, PAL.ellieMain);
    return;
  }
  const tee = PAL.ellieMain;
  const denim = PAL.denim;
  // Overall shorts: shorts + bib + straps over a teal tee.
  pelvis(ctx, denim);
  const t = top(ctx, { color: tee, loose: 1.04, hemY: hipJ(s) + 0.01 });
  void t;
  collar(ctx, shadeHex(tee, 0.86), 0.012);
  const waist = ctx.sb.blend(B.base, (x, y, z, o) => {
    const tS = Math.max(0, Math.min(1, (y - s.spineY) / (s.chestY - s.spineY)));
    o.i[0] = B.spine;
    o.w[0] = 1 - tS;
    o.i[1] = B.chest;
    o.w[1] = tS;
    o.i[2] = o.i[3] = 0;
    o.w[2] = o.w[3] = 0;
    void x;
    void z;
  });
  const shortsTop = torsoRings(s, 1.06).filter((r) => r.y <= s.spineY + 0.035);
  waist.add(ringTube([...shortsTop.slice(1), { y: s.spineY + 0.035, w: s.waistW * 1.07, d: s.waistD * 1.08 }], 14), denim, { smooth: true });
  const bibRings = torsoRings(s, 1.06);
  frontPatch(waist, bibRings, s.chestY - 0.02, s.torsoW * 0.55, 0.075, denim, 0.012, true);
  frontPatch(waist, bibRings, s.chestY - 0.035, s.torsoW * 0.26, 0.026, mixHex(denim, 0xffffff, 0.12), 0.016, false);
  // Straps over the shoulders + buckles.
  const ch = ctx.sb.on(B.chest);
  for (const sd of [-1, 1]) {
    const x = sd * s.torsoW * 0.42;
    const yT = s.shoulderY - s.chestY + s.armR * 0.62;
    ch.box(0.028, 0.012, s.torsoD * 1.85, denim, { at: [x, yT, -0.004], ink: false });
    ch.box(0.028, s.shoulderY - s.chestY, 0.01, denim, { at: [x, (yT + (s.chestY - s.chestY)) / 2, s.torsoD * 0.93], rot: [-0.12, 0, 0], ink: false });
    ch.box(0.028, s.shoulderY - s.chestY + 0.04, 0.01, denim, { at: [x, yT / 2 - 0.02, -s.torsoD * 0.95], rot: [0.1, 0, 0], ink: false });
    ch.sphere(0.012, 6, 4, PAL.goldTrim, { at: [x, 0.005, s.torsoD * 0.99], scale: [1, 1, 0.5], ink: false });
  }
  legs(ctx, { color: denim, width: 1.12, hemY: kneeY(s) + s.thighL * 0.5, below: ctx.skin, hemBand: mixHex(denim, 0xffffff, 0.2) });
  arms(ctx, { color: tee, width: 1.12, length: 'short', below: ctx.skin, cuff: shadeHex(tee, 0.86) });
  feet(ctx, sneaker(PAL.ellieDark));
}

function heidi(ctx: BodyCtx, outfit: Outfit): void {
  const s = ctx.s;
  if (outfit === 'sleep') {
    pjSet(ctx, PAL.heidiMain, { kind: 'star', color: mixHex(PAL.starPrint, PAL.heidiDress, 0.55) }, PAL.pajamaCream);
    return;
  }
  const dress = PAL.heidiDress;
  const card = PAL.heidiMain;
  pelvis(ctx, dress);
  top(ctx, { color: dress, loose: 1.03, hemY: s.spineY - 0.04 });
  collar(ctx, PAL.pajamaCream, 0.012);
  skirt(ctx, s.spineY + 0.01, kneeY(s) + 0.035, s.waistW * 1.1, s.waistD * 1.12, s.hipW * 1.55, s.hipD * 1.45, dress, 0.8);
  const c = top(ctx, { color: card, loose: 1.1, hemY: s.spineY - 0.02, flare: 0.03, hemBand: PAL.heidiDark, v: [0.7, 0.3, 0.34] });
  edgeTrim(c.b, c.rings, s.spineY - 0.02, 0.012, PAL.heidiDark, 0.006);
  buttons(c.b, c.rings, s.spineY + 0.0, s.chestY + 0.02, 2, PAL.pajamaCream, 0.011, 0.4);
  legs(ctx, { color: ctx.skin, width: 0.84 });
  arms(ctx, { color: card, width: 1.14, length: 'wrist', cuff: PAL.heidiDark });
  feet(ctx, sneaker(PAL.heidiMain));
}

// ── extras ────────────────────────────────────────────────────────────────────

export interface ExtraLook {
  kind: ExtraKind;
  spec: BodySpec;
  look: MemberLook;
  hair: HairStyle;
  main: number;
  accent: number;
  female: boolean;
}

/** Deterministic simple look for an extra (seeded). */
export function extraLook(kind: ExtraKind, seed: number): ExtraLook {
  const r = (k: number) => rand01(seed | 0, k);
  const pick = <T>(arr: readonly T[], k: number): T => arr[Math.floor(r(k) * arr.length) % arr.length]!;
  const female = kind === 'teacher' ? r(1) < 0.7 : kind === 'crossingGuard' ? r(1) < 0.6 : r(1) < 0.5;
  const spec = kind === 'kid' ? SPECS.kid : female ? SPECS.woman : SPECS.man;
  const hairHex = pick(HAIR_COLORS, 2).hex;
  const look: MemberLook = {
    skin: Math.floor(r(3) * SKIN_TONES.length) % SKIN_TONES.length,
    hair: kind === 'neighbor' && r(9) < 0.5 ? (HAIR_COLORS.find((h) => h.id === 'silver')?.hex ?? hairHex) : hairHex,
    eyes: pick(EYE_COLORS, 4),
    glasses: kind === 'teacher' ? r(5) < 0.6 : r(5) < 0.15,
    beard: !female && kind !== 'kid' && r(6) < 0.35 ? 'stubble' : 'none',
  };
  let hair: HairStyle;
  if (kind === 'kid') hair = female ? 'ponytail' : 'short';
  else if (female) hair = kind === 'jogger' ? 'ponytail' : 'bun';
  else hair = r(7) < 0.3 ? 'buzz' : 'short';
  return { kind, spec, look, hair, main: pick(CONFETTI_COLORS, 8), accent: pick(CONFETTI_COLORS, 10), female };
}

export function extraKey(x: ExtraLook): string {
  return `${x.kind}|${x.female ? 1 : 0}|${x.look.skin}|${x.look.hair}|${x.look.eyes}|${x.look.glasses ? 1 : 0}|${x.look.beard}|${x.hair}|${x.main}|${x.accent}`;
}

export function buildExtra(x: ExtraLook, rig: Rig): THREE.BufferGeometry {
  const s = x.spec;
  const sb = new SkinBuilder(rig.rest);
  const ctx: BodyCtx = { sb, s, skin: skinHex(x.look), low: true };
  buildHead(sb, s, {
    skin: ctx.skin,
    eyes: x.look.eyes,
    hair: x.look.hair,
    lashes: x.female,
    glasses: x.look.glasses ? PAL.glassesFrame : null,
    beard: x.look.beard,
    brows: x.female ? 'arched' : 'thick',
    ears: true,
    starClip: null,
    low: true,
  });
  hands(ctx);
  const capped = x.kind === 'crossingGuard';
  buildHair(sb, s, rig, capped ? (x.female ? 'short' : 'buzz') : x.hair, x.look.hair, 3);
  switch (x.kind) {
    case 'crossingGuard': {
      pelvis(ctx, PAL.guardNavy);
      top(ctx, { color: PAL.guardNavy, loose: 1.04, hemY: hipJ(s) + 0.01 });
      const v = top(ctx, { color: PAL.hiVis, loose: 1.1, hemY: hipJ(s) - 0.01, phi0: 0.3, phiLen: Math.PI * 2 - 0.6 });
      for (const y of [s.spineY + 0.01, s.chestY + 0.04]) band(v.b, v.rings, y, y + 0.025, PAL.hiVisStripe, 0.003, 10, false, 0.3, Math.PI * 2 - 0.6);
      arms(ctx, { color: PAL.guardNavy, width: 1.1, length: 'wrist', cuff: null });
      legs(ctx, { color: PAL.guardNavy, width: 1.05 });
      feet(ctx, { kind: 'boot', color: 0x3b2e2a, accent: 0x3b2e2a });
      // Cap: hi-vis crown + navy brim (on the hair bone so it sits on the hair).
      const cap = sb.on(B.hairTop);
      const C: [number, number, number] = [0, -s.headRy * 0.35, 0];
      cap.add(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, 1.32), PAL.hiVis, { at: C, rot: [-0.22, 0, 0], scale: [s.headRx * 1.12, s.headRy * 1.1, s.headRz * 1.12], smooth: true });
      cap.add(new THREE.CylinderGeometry(s.headRx * 0.72, s.headRx * 0.72, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), PAL.guardNavy, {
        at: [0, C[1] + s.headRy * 0.36, s.headRz * 0.88],
        rot: [0.28, 0, 0],
        scale: [1.05, 1, 0.9],
      });
      break;
    }
    case 'jogger': {
      pelvis(ctx, 0x3a3a48);
      top(ctx, { color: x.main, loose: 1.03, hemY: hipJ(s) + 0.01 });
      collar(ctx, x.accent, 0.012);
      arms(ctx, { color: x.main, width: 1.08, length: 'short', below: ctx.skin, cuff: x.accent });
      legs(ctx, { color: 0x3a3a48, width: 1.1, hemY: kneeY(s) + s.thighL * 0.55, below: ctx.skin, hemBand: x.accent });
      feet(ctx, sneaker(x.accent));
      const hb = sb.on(B.hairTop);
      hb.torus(s.headRx * 1.02, 0.014, 4, 18, x.accent, { at: [0, -s.headRy * 0.45, s.headCZ * 0], rot: [Math.PI / 2 - 0.2, 0, 0], scale: [1, s.headRz / s.headRx, 1], smooth: true });
      break;
    }
    case 'teacher': {
      pelvis(ctx, PAL.trouserPlum);
      top(ctx, { color: PAL.ashleyTop, loose: 1.02, hemY: hipJ(s) + 0.015 });
      const c = top(ctx, { color: PAL.teacherCardigan, loose: 1.09, hemY: hipJ(s) - 0.02, hemBand: shadeHex(PAL.teacherCardigan, 0.85), v: [0.66, 0.34, 0.36] });
      buttons(c.b, c.rings, s.spineY, s.chestY + 0.05, 3, PAL.pajamaCream, 0.01, 0.48);
      arms(ctx, { color: PAL.teacherCardigan, width: 1.12, length: 'wrist', cuff: shadeHex(PAL.teacherCardigan, 0.85) });
      legs(ctx, { color: PAL.trouserPlum, width: 1.04 });
      feet(ctx, { kind: 'flat', color: PAL.flatShoe, accent: PAL.flatShoe });
      // Lanyard + badge.
      const ch = sb.on(B.chest, false);
      const nr = neckR(s);
      const yT = s.shoulderY - s.chestY + s.armR * 0.7;
      for (const sd of [-1, 1]) ch.box(0.01, 0.16, 0.006, PAL.lanyard, { at: [sd * nr * 0.9, yT - 0.08, s.torsoD * 0.9], rot: [-0.15, 0, sd * 0.25] });
      ch.box(0.05, 0.065, 0.008, 0xffffff, { at: [0, yT - 0.18, s.torsoD * 1.0], rot: [-0.1, 0, 0] });
      ch.box(0.036, 0.012, 0.004, PAL.lanyard, { at: [0, yT - 0.16, s.torsoD * 1.01], rot: [-0.1, 0, 0] });
      break;
    }
    case 'kid': {
      const jeans = r2(x) ? PAL.denim : 0x4b4f63;
      pelvis(ctx, jeans);
      const t = top(ctx, { color: x.main, loose: 1.06, hemY: hipJ(s) + 0.005, hemBand: shadeHex(x.main, 0.85) });
      void t;
      collar(ctx, shadeHex(x.main, 0.85), 0.012);
      arms(ctx, { color: x.main, width: 1.12, length: 'wrist', cuff: shadeHex(x.main, 0.85) });
      legs(ctx, { color: jeans, width: 1.08 });
      feet(ctx, sneaker(x.accent));
      // Backpack on the chest bone (behind the back).
      const bp = sb.on(B.chest);
      const by = (s.shoulderY - s.chestY) * 0.2;
      bp.sphere(1, 10, 6, x.accent, { at: [0, by, -s.torsoD - 0.055], scale: [s.torsoW * 0.8, (s.shoulderY - s.chestY) * 1.05, 0.07], smooth: true });
      bp.sphere(1, 8, 5, shadeHex(x.accent, 0.85), { at: [0, by - 0.05, -s.torsoD - 0.115], scale: [s.torsoW * 0.5, 0.06, 0.03], smooth: true });
      for (const sd of [-1, 1]) bp.box(0.022, (s.shoulderY - s.chestY) * 1.4, 0.012, shadeHex(x.accent, 0.7), { at: [sd * s.torsoW * 0.5, by + 0.02, s.torsoD * 0.85], rot: [-0.1, 0, 0], ink: false });
      break;
    }
    case 'neighbor': {
      const robe = PAL.robeBlue;
      pelvis(ctx, 0x8a8fa0);
      legs(ctx, { color: 0x8a8fa0, width: 1.1 });
      top(ctx, { color: robe, loose: 1.1, hemY: s.spineY - 0.04 });
      skirt(ctx, s.spineY + 0.02, kneeY(s) - 0.01, s.waistW * 1.15, s.waistD * 1.16, s.hipW * 1.4, s.hipD * 1.38, robe);
      collar(ctx, mixHex(robe, 0xffffff, 0.25), 0.02, 1.0);
      arms(ctx, { color: robe, width: 1.16, length: 'wrist', flare: 0.25, cuff: mixHex(robe, 0xffffff, 0.25) });
      feet(ctx, { kind: 'slipper', color: PAL.slipper, accent: PAL.pajamaCream });
      // Mug in the left hand.
      const hL = sb.on(B.handL);
      const r = s.handR;
      hL.cyl(0.042, 0.038, 0.1, 10, PAL.mugBody, { at: [0, -r * 0.9, r * 1.1], smooth: true });
      hL.torus(0.026, 0.008, 4, 10, PAL.mugBody, { at: [0, -r * 0.9, r * 1.1 - 0.045], rot: [0, Math.PI / 2, 0] }, Math.PI);
      hL.cyl(0.036, 0.036, 0.004, 10, 0x6b4430, { at: [0, -r * 0.9 + 0.049, r * 1.1], ink: false });
      break;
    }
  }
  return sb.build();
}

function r2(x: ExtraLook): boolean {
  return (x.main & 1) === 0;
}
