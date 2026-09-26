// Static furniture + wall decor for the living room, entry, hall, bedrooms and bathroom.
import { PAL } from '../render/palette';
import { hash01, shadeHex, type GeoBuilder } from '../render/models/builder';
import { Frame, books, cushion, pictureFrame, plant, tallPlant, type Glows } from './kit';
import { BED_MATTRESS_H, COUCH_SEAT_H, FURN, IN, VANITY_H, type Furn } from './layout';
import { faceFrame, findWall } from './house';

const cx = (f: Furn) => (f.r.x0 + f.r.x1) / 2;
const cz = (f: Furn) => (f.r.z0 + f.r.z1) / 2;
const fw = (f: Furn) => f.r.x1 - f.r.x0;
const fd = (f: Furn) => f.r.z1 - f.r.z0;

// ── shared pieces ─────────────────────────────────────────────────────────────

/** Bed frame + mattress + pillows. Local: headboard at z = 0 (wall), foot toward +z, centred on x. */
export function bedFrame(
  f: Frame,
  w: number,
  L: number,
  o: { frame: number; head: number; headH: number; pillow: number; star?: boolean; tufted?: boolean; pillows?: number },
): void {
  const m = BED_MATTRESS_H;
  // legs + rails
  for (const sx of [-1, 1])
    for (const z of [0.08, L - 0.06]) f.cyl(0.035, 0.03, 0.2, 6, shadeHex(o.frame, 0.9), sx * (w / 2 - 0.05), 0.1, z);
  f.rbox(w + 0.04, 0.12, L - 0.02, 0.03, o.frame, 0, 0.25, L / 2 + 0.01);
  // mattress
  f.rbox(w - 0.02, m - 0.3, L - 0.1, 0.06, PAL.bedWhite, 0, 0.3 + (m - 0.3) / 2, L / 2 + 0.04, {}, 2);
  // headboard
  const hb = o.headH;
  f.rbox(w + 0.1, hb - 0.12, 0.08, 0.035, o.head, 0, 0.12 + (hb - 0.12) / 2, 0.04);
  f.ball((w + 0.1) / 2, 1, o.head, 0, hb - 0.12, 0.04, { scale: [1, 0.32, 0.075], smooth: true });
  if (o.tufted)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) f.ball(0.018, 0, shadeHex(o.head, 0.8), -w / 2 + 0.2 + c * ((w - 0.4) / 4) + (r % 2) * 0.08, 0.72 + r * 0.2, 0.085, { ink: false });
  if (o.star) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 0.07 : 0.16;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    f.extrude(pts, 0.03, PAL.starPrint, 0, hb - 0.24, 0.095);
  }
  // footboard
  f.rbox(w + 0.06, 0.34, 0.06, 0.03, o.frame, 0, 0.42, L - 0.02);
  // pillows
  const n = o.pillows ?? 1;
  for (let i = 0; i < n; i++) {
    const px = n === 1 ? 0 : (i - (n - 1) / 2) * (w / n);
    f.rbox(Math.min(0.7, w / n - 0.06), 0.14, 0.36, 0.07, o.pillow, px, m + 0.07, 0.28, { rot: [0.22, 0, 0] }, 2);
  }
}

function lampShade(f: Frame, x: number, y: number, z: number, r0: number, r1: number, h: number, color: number = PAL.lampShade): void {
  f.lathe(
    [
      [r1, 0],
      [r0, h],
      [r0 * 0.96, h],
      [r1 * 0.96, 0],
    ],
    14,
    color,
    x,
    y,
    z,
    { smooth: true },
  );
  f.ball(r0 * 0.55, 1, PAL.lampBulb, x, y + h * 0.35, z, { ink: false, smooth: true });
}

function tableLamp(f: Frame, glow: Frame, x: number, y: number, z: number, base: number): void {
  f.lathe(
    [
      [0, 0],
      [0.07, 0],
      [0.09, 0.08],
      [0.06, 0.18],
      [0.02, 0.2],
      [0, 0.2],
    ],
    12,
    base,
    x,
    y,
    z,
    { smooth: true },
  );
  f.cyl(0.008, 0.008, 0.1, 5, PAL.knobBrass, x, y + 0.24, z, { ink: false });
  lampShade(glow, x, y + 0.24, z, 0.08, 0.14, 0.17);
}

function rug(W: Frame, f: Furn, main: number, border: number, round = false): void {
  const x = cx(f);
  const z = cz(f);
  if (round) {
    W.cyl(fw(f) / 2, fw(f) / 2, 0.014, 28, border, x, 0.007, z, { scale: [1, 1, fd(f) / fw(f)] });
    W.cyl(fw(f) / 2 - 0.1, fw(f) / 2 - 0.1, 0.016, 28, main, x, 0.009, z, { scale: [1, 1, fd(f) / fw(f)], ink: false });
    return;
  }
  W.rbox(fw(f), 0.014, fd(f), 0.08, border, x, 0.007, z, {}, 1);
  W.rbox(fw(f) - 0.2, 0.016, fd(f) - 0.2, 0.06, main, x, 0.009, z, { ink: false }, 1);
}

function woodBox(f: Frame, w: number, h: number, d: number, color: number, x: number, y0: number, z: number, drawers: number, knob: number = PAL.knobBrass): void {
  f.rbox(w, h, d, 0.02, color, x, y0 + h / 2, z, {}, 1);
  const dh = (h - 0.08) / drawers;
  for (let i = 0; i < drawers; i++) {
    const y = y0 + 0.05 + dh * (i + 0.5);
    f.box(w - 0.06, dh - 0.03, 0.012, shadeHex(color, 1.06), x, y, z + d / 2 + 0.004, { ink: false });
    f.ball(0.016, 0, knob, x, y, z + d / 2 + 0.018, { ink: false });
  }
}

function clothesLump(W: Frame, x: number, z: number, seed: number, n: number, spread: number): void {
  const cols = [PAL.denim, PAL.chrisHoodie, PAL.addyMain, PAL.heidiMain, PAL.ellieMain, 0xf4efe6, PAL.fabricMustard];
  for (let i = 0; i < n; i++) {
    const a = hash01(seed, i) * Math.PI * 2;
    const r = hash01(seed, i, 2) * spread;
    W.rbox(0.3 + hash01(seed, i, 3) * 0.15, 0.07 + hash01(seed, i, 4) * 0.05, 0.22 + hash01(seed, i, 5) * 0.12, 0.035, cols[Math.floor(hash01(seed, i, 6) * cols.length)]!, x + Math.cos(a) * r, 0.04 + i * 0.03, z + Math.sin(a) * r, {
      rot: [0, a, (hash01(seed, i, 7) - 0.5) * 0.4],
    });
  }
}

/** String of little bulbs along a sagging curve (into the glow builder). */
function stringLights(g: Frame, wire: Frame, x0: number, x1: number, y: number, sag: number, n: number, z: number): void {
  const cols = [PAL.fairyLight, 0xffc9d8, 0xd9f5e8, 0xe6dcff];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const yy = y - sag * 4 * t * (1 - t);
    g.ball(0.028, 0, cols[i % 4]!, x, yy - 0.03, z, { ink: false });
    if (i < n) {
      const t2 = (i + 1) / n;
      const x2 = x0 + (x1 - x0) * t2;
      const y2 = y - sag * 4 * t2 * (1 - t2);
      const len = Math.hypot(x2 - x, y2 - yy);
      wire.box(len, 0.006, 0.006, 0x5a4a3a, (x + x2) / 2, (yy + y2) / 2, z, { rot: [0, 0, Math.atan2(y2 - yy, x2 - x)], ink: false });
    }
  }
}

// ── living room ──────────────────────────────────────────────────────────────

export function buildLiving(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  rug(W, FURN.livingRug, PAL.rugTerracotta, PAL.rugMustard);
  W.rbox(fw(FURN.livingRug) - 0.7, 0.018, fd(FURN.livingRug) - 0.7, 0.05, shadeHex(PAL.rugTerracotta, 1.12), cx(FURN.livingRug), 0.011, cz(FURN.livingRug), { ink: false }, 1);
  // couch
  const c = FURN.couch;
  const C = new Frame(b, cx(c), 0, c.r.z0, 0);
  const L = fw(c);
  const D = fd(c);
  for (const sx of [-1, 1]) for (const z of [0.12, D - 0.1]) C.cyl(0.03, 0.025, 0.1, 6, PAL.woodDark, sx * (L / 2 - 0.12), 0.05, z);
  C.rbox(L, 0.3, D - 0.05, 0.07, PAL.sofaTeal, 0, 0.25, D / 2);
  C.rbox(L, 0.55, 0.24, 0.09, PAL.sofaTeal, 0, 0.65, 0.12);
  for (const sx of [-1, 1]) C.rbox(0.24, 0.34, D - 0.02, 0.1, PAL.sofaTeal, sx * (L / 2 - 0.12), 0.52, D / 2);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.66;
    cushion(C, 0.64, 0.13, D - 0.3, PAL.sofaCushion, x, COUCH_SEAT_H - 0.035, D / 2 + 0.08);
    cushion(C, 0.62, 0.44, 0.18, PAL.sofaCushion, x, 0.74, 0.3, { rot: [-0.14, 0, 0] });
  }
  cushion(C, 0.34, 0.34, 0.12, PAL.fabricMustard, -0.92, 0.66, 0.42, { rot: [-0.25, 0, 0.22] });
  cushion(C, 0.32, 0.32, 0.12, PAL.fabricRose, 0.9, 0.66, 0.42, { rot: [-0.25, 0, -0.2] });
  // knitted throw over the right arm
  C.rbox(0.3, 0.05, D - 0.1, 0.02, PAL.fabricSage, L / 2 - 0.12, 0.7, D / 2, { rot: [0, 0, 0.05] });
  C.rbox(0.05, 0.36, D - 0.1, 0.02, PAL.fabricSage, L / 2 + 0.02, 0.52, D / 2);
  // coffee table
  const ct = FURN.coffeeTable;
  const T = new Frame(b, cx(ct), 0, cz(ct), 0);
  T.rbox(fw(ct), 0.05, fd(ct), 0.05, PAL.woodWarm, 0, 0.4, 0, {}, 2);
  T.rbox(fw(ct) - 0.12, 0.03, fd(ct) - 0.12, 0.03, shadeHex(PAL.woodWarm, 0.9), 0, 0.12, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.cyl(0.03, 0.025, 0.38, 6, PAL.woodDark, sx * (fw(ct) / 2 - 0.08), 0.19, sz * (fd(ct) / 2 - 0.07));
  T.rbox(0.3, 0.05, 0.22, 0.01, PAL.booksB, -0.3, 0.45, 0.02, { rot: [0, 0.2, 0] });
  T.rbox(0.26, 0.04, 0.2, 0.01, PAL.booksA, -0.3, 0.495, 0.02, { rot: [0, -0.1, 0] });
  T.lathe(
    [
      [0, 0],
      [0.07, 0],
      [0.1, 0.05],
      [0.09, 0.055],
      [0, 0.03],
    ],
    12,
    PAL.ellieMain,
    0.28,
    0.425,
    0,
    { smooth: true },
  );
  T.rbox(0.16, 0.02, 0.05, 0.01, PAL.stoveDark, 0.05, 0.435, 0.15, { rot: [0, 0.4, 0] });
  // floor lamp (shade glows at night)
  const fl = FURN.floorLamp;
  const FLf = new Frame(b, cx(fl), 0, cz(fl), 0);
  FLf.cyl(0.16, 0.18, 0.04, 14, PAL.knobBrass, 0, 0.02, 0);
  FLf.cyl(0.015, 0.015, 1.36, 6, PAL.knobBrass, 0, 0.7, 0);
  lampShade(FLf.on(g.night), 0, 1.33, 0, 0.14, 0.22, 0.28);
  // dog bed
  const dbd = FURN.dogBed;
  const DB = new Frame(b, cx(dbd), 0, cz(dbd), 0);
  DB.torus(0.33, 0.1, 8, 20, PAL.fabricMustard, 0, 0.1, 0, { rot: [Math.PI / 2, 0, 0], scale: [1.18, 1, 1], smooth: true });
  DB.cyl(0.36, 0.38, 0.1, 20, PAL.cabinetCream, 0, 0.05, 0, { scale: [1.18, 1, 1] });
  DB.cyl(0.028, 0.028, 0.16, 6, 0xfffaf0, 0.12, 0.13, 0.05, { rot: [0, 0.6, Math.PI / 2] });
  for (const s of [-1, 1]) DB.ball(0.035, 1, 0xfffaf0, 0.12 + Math.cos(0.6) * 0.08 * s, 0.13, 0.05 - Math.sin(0.6) * 0.08 * s, { scale: [1, 1, 1.5] });
  // TV console + TV (east wall, facing −X)
  const tv = FURN.tvConsole;
  const TV = new Frame(b, IN.EAST_IN, 0, cz(tv), -Math.PI / 2);
  TV.rbox(fd(tv), 0.5, fw(tv), 0.03, PAL.woodWarm, 0, 0.3, fw(tv) / 2, {}, 1);
  for (let i = 0; i < 3; i++) {
    const x = -fd(tv) / 2 + (i + 0.5) * (fd(tv) / 3);
    TV.box(fd(tv) / 3 - 0.05, 0.36, 0.012, shadeHex(PAL.woodWarm, 1.08), x, 0.3, fw(tv) + 0.006, { ink: false });
    TV.ball(0.016, 0, PAL.knobBrass, x + 0.1, 0.34, fw(tv) + 0.018, { ink: false });
  }
  for (const sx of [-1, 1]) TV.cyl(0.02, 0.015, 0.06, 5, PAL.woodDark, sx * (fd(tv) / 2 - 0.08), 0.03, fw(tv) / 2);
  TV.rbox(0.3, 0.03, 0.18, 0.01, PAL.stoveDark, 0, 0.565, 0.22);
  TV.box(0.06, 0.16, 0.04, PAL.stoveDark, 0, 0.66, 0.2);
  TV.rbox(1.24, 0.74, 0.06, 0.03, PAL.stoveDark, 0, 1.12, 0.2);
  TV.box(1.14, 0.64, 0.01, PAL.tvScreen, 0, 1.12, 0.234, { ink: false });
  TV.box(0.5, 0.04, 0.012, shadeHex(PAL.tvScreen, 1.4), -0.2, 1.3, 0.24, { rot: [0, 0, 0.5], ink: false });
  plant(TV.sub(0.72, 0.55, 0.22), 0, 0, 0.36, 11);
  TV.rbox(0.14, 0.24, 0.14, 0.03, PAL.stoveDark, -0.8, 0.67, 0.2);
  // armchair facing the TV + side table with a lamp
  const ac = FURN.armchair;
  const AC = new Frame(b, cx(ac), 0, cz(ac), Math.PI / 2);
  AC.rbox(0.82, 0.28, 0.78, 0.07, PAL.fabricMustard, 0, 0.26, 0);
  AC.rbox(0.82, 0.5, 0.2, 0.08, PAL.fabricMustard, 0, 0.62, -0.3);
  for (const sx of [-1, 1]) AC.rbox(0.18, 0.3, 0.78, 0.08, PAL.fabricMustard, sx * 0.34, 0.5, 0);
  cushion(AC, 0.48, 0.12, 0.52, shadeHex(PAL.fabricMustard, 1.1), 0, 0.44, 0.06);
  cushion(AC, 0.3, 0.3, 0.1, PAL.fabricSage, 0.05, 0.62, -0.15, { rot: [-0.3, 0, 0.1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) AC.cyl(0.025, 0.02, 0.1, 5, PAL.woodDark, sx * 0.33, 0.05, sz * 0.3);
  const st = FURN.sideTable;
  const ST = new Frame(b, cx(st), 0, cz(st), 0);
  ST.cyl(0.22, 0.22, 0.04, 16, PAL.woodWarm, 0, 0.53, 0);
  ST.cyl(0.03, 0.04, 0.5, 6, PAL.woodDark, 0, 0.26, 0);
  ST.cyl(0.14, 0.16, 0.03, 12, PAL.woodDark, 0, 0.015, 0);
  tableLamp(ST, ST.on(g.house), 0, 0.55, 0, PAL.ellieMain);
  // knitted pouf
  const pf = FURN.pouf;
  W.sphere(0.27, 14, 8, PAL.fabricRose, cx(pf), 0.19, cz(pf), { scale: [1, 0.7, 1] });
  for (let i = 0; i < 6; i++) W.torus(0.27 - Math.abs(i - 2.5) * 0.02, 0.012, 4, 18, shadeHex(PAL.fabricRose, 0.9), cx(pf), 0.07 + i * 0.045, cz(pf), { rot: [Math.PI / 2, 0, 0], ink: false });
  // bookcase (NE corner, facing −X)
  const bc = FURN.bookcase;
  const BC = new Frame(b, IN.EAST_IN, 0, cz(bc), -Math.PI / 2);
  const bw = fd(bc);
  BC.span(-bw / 2, bw / 2, 0, 1.7, 0, 0.36, PAL.woodWarm);
  BC.span(-bw / 2 + 0.04, bw / 2 - 0.04, 0.06, 1.66, 0.02, 0.34, shadeHex(PAL.woodWarm, 0.72), { ink: false });
  for (let i = 0; i < 4; i++) {
    const y = 0.08 + i * 0.4;
    BC.span(-bw / 2 + 0.03, bw / 2 - 0.03, y, y + 0.03, 0.02, 0.35, PAL.woodWarm, { ink: false });
    if (i < 3) books(BC, -bw / 2 + 0.06, bw / 2 - (i === 1 ? 0.3 : 0.06), y + 0.03, 0.2, 0.24, 20 + i);
  }
  BC.ball(0.09, 1, PAL.heidiMain, 0.34, 0.6, 0.2, { smooth: true });
  plant(BC.sub(0.0, 1.7, 0.18), 0, 0, 0.34, 8);
  // plants + toy basket
  tallPlant(W, cx(FURN.livingPlantA), cz(FURN.livingPlantA), 1.35, 1);
  plant(W, cx(FURN.livingPlantB), cz(FURN.livingPlantB), 1.0, 2);
  const tb = FURN.toyBasket;
  W.lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.24, 0.3],
      [0.22, 0.3],
      [0, 0.02],
    ],
    14,
    0xd9b27a,
    cx(tb),
    0,
    cz(tb),
    { smooth: true },
  );
  W.ball(0.1, 1, PAL.confettiE, cx(tb) - 0.06, 0.32, cz(tb), { smooth: true });
  W.ball(0.08, 1, PAL.confettiB, cx(tb) + 0.08, 0.31, cz(tb) + 0.05, { smooth: true });
  W.rbox(0.12, 0.12, 0.12, 0.02, PAL.confettiA, cx(tb) + 0.02, 0.3, cz(tb) - 0.09, { rot: [0.3, 0.4, 0] });
  // family photos above the couch (abstract, never likenesses) + big art above the dog bed
  const w10 = findWall('x', -0.6, 0.4);
  const w11 = findWall('x', -0.6, 2.6);
  pictureFrame(faceFrame(wb, w10, 1, 1.45, 0), 0, 1.62, 0.5, 0.4, PAL.woodWarm, 3);
  pictureFrame(faceFrame(wb, w10, 1, 2.2, 0), 0, 1.72, 0.34, 0.46, PAL.cabinetCream, 0);
  pictureFrame(faceFrame(wb, w11, 1, 3.0, 0), 0, 1.6, 0.32, 0.32, PAL.heidiMain, 1);
  pictureFrame(faceFrame(wb, w11, 1, 4.55, 0), 0, 1.66, 0.8, 0.56, PAL.woodDark, 2);
  // round mirror / art above the TV
  const w25 = findWall('z', 9, -0.6);
  const mr = faceFrame(wb, w25, -1, 2.1, 0);
  mr.cyl(0.26, 0.26, 0.03, 20, PAL.knobBrass, 0, 1.95, 0.015, { rot: [Math.PI / 2, 0, 0] });
  mr.cyl(0.22, 0.22, 0.01, 20, PAL.mirror, 0, 1.95, 0.035, { rot: [Math.PI / 2, 0, 0], ink: false });
}

// ── entry ────────────────────────────────────────────────────────────────────

export function buildEntry(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  const sb = FURN.shoeBench;
  const SB = new Frame(b, cx(sb), 0, sb.r.z0, 0);
  const L = fw(sb);
  SB.span(-L / 2, L / 2, 0.36, 0.42, 0, fd(sb), PAL.woodWarm);
  SB.span(-L / 2, L / 2, 0.02, 0.06, 0, fd(sb), PAL.woodWarm);
  for (const x of [-L / 2 + 0.03, -L / 6, L / 6, L / 2 - 0.03]) SB.span(x - 0.025, x + 0.025, 0.02, 0.4, 0.01, fd(sb) - 0.01, PAL.woodWarm);
  cushion(SB, L - 0.06, 0.07, fd(sb) - 0.04, PAL.fabricSage, 0, 0.455, fd(sb) / 2);
  // shoes in the cubbies (family colours)
  const shoe = (x: number, y: number, col: number, s: number) => {
    for (const d of [-0.05, 0.05]) {
      SB.rbox(0.08 * s, 0.07 * s, 0.2 * s, 0.03 * s, col, x + d * s, y + 0.035 * s, fd(sb) / 2 + 0.02);
      SB.box(0.06 * s, 0.01, 0.1 * s, 0xffffff, x + d * s, y + 0.004, fd(sb) / 2 + 0.03, { ink: false });
    }
  };
  shoe(-L / 3, 0.06, PAL.addyMain, 0.85);
  shoe(0, 0.06, PAL.ellieMain, 0.85);
  shoe(L / 3, 0.06, PAL.heidiMain, 0.8);
  shoe(-0.35, 0.0, PAL.slipper, 1.1);
  // hooks + coats on the wall above the bench
  const w9 = findWall('x', -0.6, -3.6);
  const H = faceFrame(wb, w9, 1, cx(sb), 0);
  H.span(-L / 2 + 0.05, L / 2 - 0.05, 1.52, 1.62, 0, 0.025, PAL.woodWarm);
  H.span(-L / 2 + 0.05, L / 2 - 0.05, 1.82, 1.85, 0, 0.18, PAL.woodWarm);
  const hooks = [-0.6, -0.3, 0, 0.3, 0.6];
  for (const x of hooks) H.cyl(0.012, 0.012, 0.09, 5, PAL.knobBrass, x, 1.57, 0.06, { rot: [Math.PI / 2, 0, 0], ink: false });
  // yellow raincoat, green jacket, a scarf, a cap
  H.rbox(0.36, 0.62, 0.12, 0.06, 0xf6c945, -0.6, 1.24, 0.1);
  H.rbox(0.14, 0.12, 0.1, 0.05, 0xf6c945, -0.6, 1.56, 0.1);
  H.rbox(0.38, 0.66, 0.13, 0.06, PAL.chrisJacket, -0.28, 1.22, 0.11);
  H.rbox(0.1, 0.8, 0.04, 0.03, PAL.confettiA, 0.02, 1.2, 0.07);
  H.rbox(0.1, 0.72, 0.04, 0.03, PAL.confettiA, 0.08, 1.24, 0.09, { rot: [0, 0, 0.08] });
  H.sphere(0.1, 10, 6, PAL.chrisHoodie, 0.32, 1.55, 0.1, { scale: [1, 0.6, 1] });
  H.rbox(0.18, 0.02, 0.1, 0.01, PAL.chrisHoodie, 0.32, 1.51, 0.19);
  // basket on the upper shelf
  H.rbox(0.36, 0.14, 0.14, 0.03, 0xd9b27a, -0.4, 1.93, 0.09);
  plant(H.sub(0.4, 1.85, 0.09), 0, 0, 0.26, 4);
  // round mirror on the west wall
  const w22 = findWall('z', -3.6, -0.6);
  const m = faceFrame(wb, w22, 1, 2.0, 0);
  m.cyl(0.24, 0.24, 0.03, 20, PAL.woodWarm, 0, 1.6, 0.015, { rot: [Math.PI / 2, 0, 0] });
  m.cyl(0.2, 0.2, 0.01, 20, PAL.mirror, 0, 1.6, 0.035, { rot: [Math.PI / 2, 0, 0], ink: false });
  // sconce between the bench and the arch (house lamp)
  const sc = faceFrame(wb, w9, 1, -1.45, 0);
  sc.box(0.08, 0.14, 0.03, PAL.knobBrass, 0, 1.8, 0.015);
  sc.cyl(0.01, 0.01, 0.1, 5, PAL.knobBrass, 0, 1.82, 0.06, { rot: [Math.PI / 2, 0, 0], ink: false });
  lampShade(sc.on(g.house), 0, 1.78, 0.12, 0.07, 0.1, 0.14);
  // door mat
  const em = FURN.entryMat;
  W.rbox(fw(em), 0.016, fd(em), 0.05, 0x8a5a3a, cx(em), 0.008, cz(em), {}, 1);
  W.ball(0.08, 1, PAL.heart, cx(em) - 0.06, 0.02, cz(em), { scale: [1, 0.1, 1], ink: false });
  W.ball(0.08, 1, PAL.heart, cx(em) + 0.06, 0.02, cz(em), { scale: [1, 0.1, 1], ink: false });
  W.cone(0.13, 0.14, 4, PAL.heart, cx(em), 0.02, cz(em) + 0.08, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.1], ink: false });
  // umbrella stand + plant
  const us = FURN.umbrellaStand;
  W.cyl(0.14, 0.12, 0.45, 12, PAL.shutter, cx(us), 0.225, cz(us));
  W.cyl(0.012, 0.012, 0.5, 5, PAL.woodDark, cx(us) - 0.04, 0.6, cz(us), { rot: [0.1, 0, 0.1] });
  W.cone(0.1, 0.4, 8, PAL.heart, cx(us) - 0.06, 0.62, cz(us) + 0.01, { rot: [0.1, 0, 0.1] });
  W.cone(0.09, 0.38, 8, PAL.uiSky, cx(us) + 0.05, 0.6, cz(us) - 0.02, { rot: [-0.08, 0, -0.12] });
  plant(W, cx(FURN.entryPlant), cz(FURN.entryPlant), 0.95, 6);
}

// ── hall ─────────────────────────────────────────────────────────────────────

export function buildHall(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  const hr = FURN.hallRunner;
  W.rbox(fw(hr), 0.012, fd(hr), 0.05, PAL.rugMustard, cx(hr), 0.006, cz(hr), {}, 1);
  for (let x = hr.r.x0 + 0.3; x < hr.r.x1 - 0.2; x += 0.5)
    W.box(0.14, 0.016, fd(hr) - 0.16, x % 1 < 0.5 ? PAL.rugTerracotta : PAL.rugSage, x, 0.008, cz(hr), { ink: false });
  // laundry basket with clothes
  const hb = FURN.hallBasket;
  W.lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.24, 0.36],
      [0.22, 0.36],
      [0, 0.03],
    ],
    14,
    0xe0c08a,
    cx(hb),
    0,
    cz(hb),
    { smooth: true },
  );
  for (let i = 0; i < 4; i++) W.torus(0.215 + i * 0.008, 0.008, 4, 16, 0xc9a56e, cx(hb), 0.07 + i * 0.09, cz(hb), { rot: [Math.PI / 2, 0, 0], ink: false });
  W.rbox(0.3, 0.1, 0.26, 0.05, PAL.chrisHoodie, cx(hb), 0.36, cz(hb) + 0.02, { rot: [0.2, 0.3, 0.1] });
  W.rbox(0.24, 0.08, 0.2, 0.04, 0xf4efe6, cx(hb) + 0.05, 0.42, cz(hb) - 0.04, { rot: [-0.2, 0.9, 0] });
  W.rbox(0.08, 0.04, 0.3, 0.02, PAL.heidiMain, cx(hb) - 0.2, 0.34, cz(hb) + 0.05, { rot: [0, 0.3, 0.9] });
  // frames along the hall
  const w5 = findWall('x', -2.2, -9);
  const w6 = findWall('x', -2.2, -5.4);
  const w7 = findWall('x', -2.2, -1.0);
  const w8 = findWall('x', -0.6, -9);
  const w9 = findWall('x', -0.6, -3.6);
  pictureFrame(faceFrame(wb, w5, 1, -8.0, 0), 0, 1.55, 0.36, 0.44, PAL.woodWarm, 4);
  pictureFrame(faceFrame(wb, w6, 1, -4.55, 0), 0, 1.6, 0.44, 0.34, PAL.cabinetCream, 5);
  pictureFrame(faceFrame(wb, w6, 1, -3.75, 0), 0, 1.5, 0.3, 0.3, PAL.addyMain, 1);
  pictureFrame(faceFrame(wb, w7, 1, 0.1, 0), 0, 1.55, 0.44, 0.34, PAL.woodDark, 0);
  pictureFrame(faceFrame(wb, w8, -1, -6.6, 0), 0, 1.55, 0.5, 0.36, PAL.cabinetCream, 3);
  pictureFrame(faceFrame(wb, w9, -1, -2.4, 0), 0, 1.6, 0.34, 0.42, PAL.ellieMain, 4);
  // night light (plug-in moon) on the hall's south wall
  const nl = faceFrame(wb, w9, -1, -2.4, 0);
  nl.box(0.07, 0.1, 0.025, 0xffffff, 0, 0.32, 0.012);
  nl.on(g.night).ball(0.05, 1, PAL.lampBulb, 0, 0.32, 0.04, { scale: [1, 1, 0.5], ink: false });
}

// ── master bedroom ───────────────────────────────────────────────────────────

export function buildMaster(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  rug(W, FURN.masterRug, 0xf3ead8, PAL.fabricSage);
  const mb = FURN.masterBed;
  bedFrame(new Frame(b, cx(mb), 0, mb.r.z0, 0), fw(mb), fd(mb), { frame: PAL.woodWarm, head: PAL.fabricSage, headH: 1.2, pillow: 0xfffaf0, tufted: true, pillows: 2 });
  // nightstands + lamps (Chris's side glows at 5:15) + alarm clock + book & glasses
  for (const [ns, grp, base] of [
    [FURN.nightstandW, g.house, PAL.fabricRose],
    [FURN.nightstandE, g.night, PAL.cabinetCream],
  ] as const) {
    const N = new Frame(b, cx(ns), 0, ns.r.z0, 0);
    woodBox(N, fw(ns), 0.56, fd(ns), PAL.woodWarm, 0, 0.02, fd(ns) / 2, 2);
    for (const sx of [-1, 1]) N.cyl(0.02, 0.015, 0.04, 5, PAL.woodDark, sx * (fw(ns) / 2 - 0.05), 0.02, fd(ns) / 2);
    tableLamp(N, N.on(grp), -0.08, 0.58, fd(ns) / 2 - 0.05, base);
  }
  const ne = FURN.nightstandE;
  const AC = new Frame(b, cx(ne) + 0.14, 0.58, ne.r.z0 + 0.3, -0.3);
  AC.rbox(0.13, 0.08, 0.06, 0.015, PAL.stoveDark, 0, 0.04, 0);
  AC.on(g.night).box(0.09, 0.035, 0.005, 0x9dffb0, 0, 0.045, 0.031, { ink: false });
  const nw = FURN.nightstandW;
  const BK = new Frame(b, cx(nw) + 0.12, 0.58, nw.r.z0 + 0.28, 0.3);
  BK.rbox(0.16, 0.04, 0.22, 0.01, PAL.booksA, 0, 0.02, 0);
  BK.torus(0.025, 0.004, 4, 10, PAL.outline, -0.03, 0.05, 0.02, { rot: [Math.PI / 2, 0, 0], ink: false });
  BK.torus(0.025, 0.004, 4, 10, PAL.outline, 0.03, 0.05, 0.02, { rot: [Math.PI / 2, 0, 0], ink: false });
  // dresser (west wall, facing +X) + oval mirror + trinkets
  const dr = FURN.dresser;
  const DR = new Frame(b, IN.WEST_IN, 0, cz(dr), Math.PI / 2);
  woodBox(DR, fd(dr), 0.96, fw(dr), PAL.cabinetCream, 0, 0.04, fw(dr) / 2, 3);
  for (const sx of [-1, 1]) DR.cyl(0.025, 0.02, 0.05, 5, PAL.woodDark, sx * (fd(dr) / 2 - 0.06), 0.025, fw(dr) / 2);
  DR.rbox(0.2, 0.1, 0.14, 0.02, PAL.fabricRose, -0.35, 1.05, 0.25);
  DR.cyl(0.03, 0.04, 0.12, 8, PAL.addyMain, 0.1, 1.06, 0.2);
  plant(DR.sub(0.42, 1.0, 0.22), 0, 0, 0.3, 9);
  pictureFrame(DR.sub(-0.05, 1.0, 0.1, 0), 0, 0.12, 0.18, 0.22, PAL.knobBrass, 3);
  const w17 = findWall('z', -9, -0.6);
  const mir = faceFrame(wb, w17, 1, cz(dr), 0);
  mir.cyl(0.34, 0.34, 0.03, 24, PAL.knobBrass, 0, 1.62, 0.015, { rot: [Math.PI / 2, 0, 0], scale: [0.78, 1, 1] });
  mir.cyl(0.3, 0.3, 0.01, 24, PAL.mirror, 0, 1.62, 0.035, { rot: [Math.PI / 2, 0, 0], scale: [0.78, 1, 1], ink: false });
  // armchair (SE corner) with a throw
  const ch = FURN.masterChair;
  const CH = new Frame(b, cx(ch), 0, cz(ch), -Math.PI / 2 + 0.4);
  CH.rbox(0.76, 0.26, 0.72, 0.07, PAL.fabricRose, 0, 0.26, 0);
  CH.rbox(0.76, 0.52, 0.18, 0.08, PAL.fabricRose, 0, 0.64, -0.28);
  for (const sx of [-1, 1]) CH.rbox(0.16, 0.28, 0.72, 0.07, PAL.fabricRose, sx * 0.32, 0.48, 0);
  cushion(CH, 0.46, 0.1, 0.5, shadeHex(PAL.fabricRose, 1.08), 0, 0.42, 0.05);
  CH.rbox(0.5, 0.04, 0.4, 0.02, 0xf4efe6, 0.05, 0.8, -0.2, { rot: [0.9, 0, 0.1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) CH.cyl(0.022, 0.018, 0.1, 5, PAL.woodDark, sx * 0.3, 0.05, sz * 0.28);
  // laundry pile, slippers, tall plant
  clothesLump(W, cx(FURN.laundryPile), cz(FURN.laundryPile), 3, 6, 0.2);
  for (const d of [-0.07, 0.07]) W.rbox(0.1, 0.06, 0.24, 0.04, PAL.slipper, -5.35 + d, 0.03, 0.85, { rot: [0, 0.2, 0] });
  tallPlant(W, cx(FURN.masterPlant), cz(FURN.masterPlant), 1.3, 7);
  // art above the bed
  const w8 = findWall('x', -0.6, -9);
  pictureFrame(faceFrame(wb, w8, 1, cx(mb), 0), 0, 1.88, 0.9, 0.5, PAL.woodWarm, 0);
}

// ── Heidi's room ─────────────────────────────────────────────────────────────

function plush(f: Frame, x: number, y: number, z: number, body: number, kind: 'bunny' | 'bear', yaw = 0): void {
  const P = f.sub(x, y, z, yaw);
  P.sphere(0.075, 10, 8, body, 0, 0.07, 0, { scale: [1, 1.05, 0.9] });
  P.sphere(0.06, 10, 8, body, 0, 0.18, 0.01);
  if (kind === 'bunny') {
    for (const s of [-1, 1]) P.sphere(0.022, 6, 5, body, s * 0.028, 0.28, 0, { scale: [0.8, 2.6, 0.6], rot: [0, 0, s * 0.2] });
  } else for (const s of [-1, 1]) P.sphere(0.022, 6, 5, body, s * 0.045, 0.23, 0);
  for (const s of [-1, 1]) P.ball(0.009, 0, PAL.outline, s * 0.02, 0.19, 0.058, { ink: false });
  P.ball(0.012, 0, PAL.heart, 0, 0.175, 0.062, { ink: false });
}

export function buildHeidi(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  rug(W, FURN.heidiRug, 0xffd6d6, PAL.heidiMain, true);
  const star = (f: Frame, x: number, y: number, z: number, r: number, col: number) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    f.extrude(pts, 0.01, col, x, y, z, { ink: false });
  };
  star(W, cx(FURN.heidiRug), 0.018, cz(FURN.heidiRug), 0.35, 0xffffff);
  const hbd = FURN.heidiBed;
  const bf = new Frame(b, cx(hbd), 0, hbd.r.z0, 0);
  bedFrame(bf, fw(hbd), fd(hbd), { frame: 0xfffaf0, head: PAL.heidiMain, headH: 1.0, pillow: 0xfff3f3, star: true });
  plush(bf, 0.33, 0.5, 0.2, 0xf4efe6, 'bunny', 0.3);
  plush(bf, -0.36, 0.5, 0.18, PAL.plushBrown, 'bear', -0.2);
  // toy chest (west wall, facing +X)
  const tc = FURN.toyChest;
  const TC = new Frame(b, IN.WEST_IN, 0, cz(tc), Math.PI / 2);
  TC.rbox(fd(tc), 0.46, fw(tc), 0.04, PAL.heidiMain, 0, 0.25, fw(tc) / 2);
  TC.rbox(fd(tc) + 0.03, 0.08, fw(tc) + 0.03, 0.04, PAL.starPrint, 0, 0.52, fw(tc) / 2);
  TC.ball(0.07, 1, 0xffffff, -0.05, 0.3, fw(tc) + 0.005, { scale: [1, 1, 0.2], ink: false });
  TC.ball(0.07, 1, 0xffffff, 0.05, 0.3, fw(tc) + 0.005, { scale: [1, 1, 0.2], ink: false });
  TC.ball(0.1, 1, PAL.confettiC, 0.2, 0.62, 0.25, { smooth: true });
  // bean bag + low shelf with toys + night light
  const bb = FURN.beanBag;
  W.sphere(0.36, 14, 10, PAL.fabricMustard, cx(bb), 0.24, cz(bb), { scale: [1, 0.66, 1], jitter: 0.01 });
  W.sphere(0.2, 12, 8, shadeHex(PAL.fabricMustard, 1.08), cx(bb) - 0.05, 0.4, cz(bb) - 0.1, { scale: [1.2, 0.5, 1] });
  const sh = FURN.heidiShelf;
  const SH = new Frame(b, cx(sh), 0, sh.r.z0, 0);
  SH.span(-fw(sh) / 2, fw(sh) / 2, 0, 0.9, 0, fd(sh), 0xfffaf0);
  SH.span(-fw(sh) / 2 + 0.03, fw(sh) / 2 - 0.03, 0.05, 0.86, 0.02, fd(sh) - 0.005, 0xf0dcd6, { ink: false });
  SH.span(-fw(sh) / 2, fw(sh) / 2, 0.44, 0.47, 0.02, fd(sh), 0xfffaf0, { ink: false });
  SH.rbox(0.1, 0.1, 0.1, 0.015, PAL.confettiB, -0.15, 0.12, 0.17, { rot: [0, 0.3, 0] });
  SH.rbox(0.1, 0.1, 0.1, 0.015, PAL.confettiE, -0.03, 0.12, 0.2);
  SH.rbox(0.1, 0.1, 0.1, 0.015, PAL.confettiA, -0.09, 0.22, 0.18, { rot: [0, -0.2, 0] });
  books(SH, 0.02, 0.24, 0.07, 0.17, 0.2, 31);
  books(SH, -0.24, 0.1, 0.47, 0.17, 0.2, 32);
  const nl = SH.sub(0.12, 0.9, 0.18);
  nl.cyl(0.05, 0.06, 0.04, 10, 0xfffaf0, 0, 0.02, 0);
  star(nl.on(g.night), 0, 0.14, 0, 0.1, PAL.starPrint);
  // bunting + star decals + a drawing on the north wall
  const w1 = findWall('x', -6.5, -9);
  const Nf = faceFrame(wb, w1, 1, 0, 0);
  const x0 = -8.8;
  const x1 = -7.25;
  const n = 6;
  const cols = [PAL.heidiMain, PAL.starPrint, PAL.ellieMain, PAL.addyMain, 0xffffff];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t;
    const y = 2.42 - 0.12 * 4 * t * (1 - t);
    Nf.extrude(
      [
        [-0.09, 0],
        [0.09, 0],
        [0, -0.17],
      ],
      0.01,
      cols[i % cols.length]!,
      x,
      y,
      0.03,
      { ink: false },
    );
  }
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const xa = x0 + (x1 - x0) * t0;
    const xb = x0 + (x1 - x0) * t1;
    const ya = 2.42 - 0.12 * 4 * t0 * (1 - t0);
    const yb = 2.42 - 0.12 * 4 * t1 * (1 - t1);
    Nf.box(Math.hypot(xb - xa, yb - ya), 0.008, 0.008, 0xf4efe6, (xa + xb) / 2, (ya + yb) / 2, 0.035, { rot: [0, 0, Math.atan2(yb - ya, xb - xa)], ink: false });
  }
  for (const [x, y, r] of [
    [-8.6, 1.9, 0.07],
    [-8.1, 1.62, 0.05],
    [-7.5, 1.95, 0.06],
    [-5.85, 1.55, 0.05],
  ] as const)
    star(Nf, x, y, 0.012, r, PAL.starPrint);
  pictureFrame(faceFrame(wb, w1, 1, -7.95, 0), 0, 1.45, 0.3, 0.36, PAL.heidiDark, 4);
}

// ── Addy & Ellie's room ──────────────────────────────────────────────────────

export function buildTwins(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  // striped oval rug
  const tr = FURN.twinsRug;
  W.cyl(fw(tr) / 2, fw(tr) / 2, 0.014, 32, PAL.addyMain, cx(tr), 0.007, cz(tr), { scale: [1, 1, fd(tr) / fw(tr)] });
  W.cyl(fw(tr) / 2 - 0.12, fw(tr) / 2 - 0.12, 0.016, 32, 0xfffaf0, cx(tr), 0.009, cz(tr), { scale: [1, 1, fd(tr) / fw(tr)], ink: false });
  W.cyl(fw(tr) / 2 - 0.3, fw(tr) / 2 - 0.3, 0.018, 32, PAL.ellieMain, cx(tr), 0.011, cz(tr), { scale: [1, 1, fd(tr) / fw(tr)], ink: false });
  W.cyl(fw(tr) / 2 - 0.46, fw(tr) / 2 - 0.46, 0.02, 32, 0xfffaf0, cx(tr), 0.013, cz(tr), { scale: [1, 1, fd(tr) / fw(tr)], ink: false });
  const beds: [Furn, number, number][] = [
    [FURN.bedAddy, PAL.addyMain, 0xf3eefe],
    [FURN.bedEllie, PAL.ellieMain, 0xeafbf6],
  ];
  for (const [bd, col, pill] of beds) {
    const bf = new Frame(b, cx(bd), 0, bd.r.z0, 0);
    bedFrame(bf, fw(bd), fd(bd), { frame: 0xfffaf0, head: col, headH: 1.0, pillow: pill });
    plush(bf, bd === FURN.bedAddy ? -0.33 : 0.33, 0.5, 0.2, bd === FURN.bedAddy ? PAL.plushBrown : 0xf4efe6, bd === FURN.bedAddy ? 'bear' : 'bunny', 0);
  }
  // nightstand under the window with a star lamp
  const ns = FURN.twinsNightstand;
  const N = new Frame(b, cx(ns), 0, ns.r.z0, 0);
  woodBox(N, fw(ns), 0.48, fd(ns), 0xfffaf0, 0, 0.02, fd(ns) / 2, 2, PAL.addyDark);
  N.cyl(0.05, 0.06, 0.05, 10, PAL.ellieMain, 0, 0.525, fd(ns) / 2);
  N.on(g.night).ball(0.085, 1, PAL.lampBulb, 0, 0.64, fd(ns) / 2, { smooth: true, ink: false });
  // desk + chair + corkboard (west wall)
  const dk = FURN.twinsDesk;
  const DK = new Frame(b, dk.r.x0, 0, cz(dk), Math.PI / 2);
  DK.rbox(fd(dk), 0.04, fw(dk) - 0.06, 0.015, 0xfffaf0, 0, 0.7, (fw(dk) - 0.06) / 2);
  woodBox(DK, 0.4, 0.62, fw(dk) - 0.1, PAL.addyMain, -fd(dk) / 2 + 0.22, 0.04, (fw(dk) - 0.06) / 2, 3);
  for (const s of [-1, 1]) DK.cyl(0.02, 0.02, 0.68, 6, 0xfffaf0, fd(dk) / 2 - 0.05, 0.34, (fw(dk) - 0.06) / 2 + s * 0.22);
  DK.cyl(0.035, 0.03, 0.1, 8, PAL.ellieMain, 0.3, 0.77, 0.2);
  for (let i = 0; i < 4; i++) DK.cyl(0.005, 0.005, 0.12, 4, [PAL.confettiA, PAL.confettiB, PAL.confettiC, PAL.confettiD][i]!, 0.29 + (i % 2) * 0.02, 0.84, 0.19 + (i >> 1) * 0.02, { ink: false });
  DK.rbox(0.3, 0.01, 0.22, 0.004, 0xffffff, -0.05, 0.725, 0.3, { rot: [0, 0.2, 0], ink: false });
  DK.sphere(0.08, 12, 8, PAL.uiSky, 0.05, 0.86, 0.12);
  DK.cyl(0.01, 0.03, 0.08, 6, PAL.knobBrass, 0.05, 0.75, 0.12);
  const dc = FURN.twinsDeskChair;
  const CH = new Frame(b, cx(dc), 0, cz(dc), -Math.PI / 2);
  CH.cyl(0.18, 0.18, 0.05, 14, PAL.ellieMain, 0, 0.46, 0);
  CH.rbox(0.34, 0.26, 0.05, 0.05, PAL.ellieMain, 0, 0.66, -0.15);
  CH.cyl(0.025, 0.025, 0.42, 6, 0xfffaf0, 0, 0.23, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    CH.cyl(0.015, 0.015, 0.2, 5, 0xfffaf0, Math.cos(a) * 0.1, 0.03, Math.sin(a) * 0.1, { rot: [0, -a, Math.PI / 2] });
  }
  const w18 = findWall('z', -5.4, -6.5);
  const cb = faceFrame(wb, w18, 1, cz(dk), 0);
  cb.span(-0.4, 0.4, 1.15, 1.65, 0, 0.02, 0xd9b27a);
  for (let i = 0; i < 5; i++) {
    const x = -0.3 + i * 0.15;
    const y = 1.3 + ((i * 37) % 3) * 0.1;
    cb.span(x - 0.055, x + 0.055, y - 0.07, y + 0.07, 0.02, 0.024, [0xffffff, 0xfff3b0, 0xdff0f7, 0xfbe3e8, 0xe7f3df][i]!, { rot: [0, 0, (i - 2) * 0.08], ink: false });
    cb.ball(0.012, 0, [PAL.confettiA, PAL.confettiC, PAL.confettiD][i % 3]!, x, y + 0.05, 0.03, { ink: false });
  }
  // bookshelf (east wall, facing −X)
  const bs = FURN.twinsBookshelf;
  const BS = new Frame(b, bs.r.x1, 0, cz(bs), -Math.PI / 2);
  const bw = fd(bs);
  BS.span(-bw / 2, bw / 2, 0, 1.3, 0, 0.36, 0xfffaf0);
  BS.span(-bw / 2 + 0.03, bw / 2 - 0.03, 0.05, 1.26, 0.02, 0.35, 0xe8e0f0, { ink: false });
  for (let i = 0; i < 3; i++) {
    const y = 0.06 + i * 0.41;
    BS.span(-bw / 2 + 0.02, bw / 2 - 0.02, y, y + 0.025, 0.02, 0.35, 0xfffaf0, { ink: false });
    books(BS, -bw / 2 + 0.05, bw / 2 - (i === 2 ? 0.35 : 0.05), y + 0.025, 0.2, 0.26, 40 + i);
  }
  plush(BS, 0.3, 0.885, 0.2, PAL.addyMain, 'bunny', 0);
  BS.sphere(0.08, 10, 8, PAL.ellieMain, 0, 1.38, 0.18);
  // string lights over the beds (glow) + a poster above each bed
  const w2 = findWall('x', -6.5, -5.4);
  const Nf = faceFrame(wb, w2, 1, 0, 0);
  stringLights(Nf.on(g.night), Nf, -5.25, -3.85, 2.36, 0.22, 7, 0.04);
  stringLights(Nf.on(g.night), Nf, -2.55, -1.15, 2.36, 0.22, 7, 0.04);
  pictureFrame(faceFrame(wb, w2, 1, cx(FURN.bedAddy), 0), 0, 1.5, 0.42, 0.32, PAL.addyDark, 2);
  pictureFrame(faceFrame(wb, w2, 1, cx(FURN.bedEllie), 0), 0, 1.5, 0.42, 0.32, PAL.ellieDark, 4);
}

// ── bathroom ─────────────────────────────────────────────────────────────────

export function buildBath(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  // vanity
  const v = FURN.vanity;
  const V = new Frame(b, cx(v), 0, v.r.z0, 0);
  const L = fw(v);
  const D = fd(v);
  V.span(-L / 2 + 0.005, L / 2 - 0.005, 0.1, VANITY_H - 0.04, 0, D - 0.035, PAL.cabinetCream);
  V.span(-L / 2 + 0.005, L / 2 - 0.005, 0, 0.1, 0, D - 0.09, shadeHex(PAL.cabinetCream, 0.7), { ink: false });
  const cols = 5;
  for (let i = 0; i < cols; i++) {
    const a = -L / 2 + (i * L) / cols + 0.02;
    const e = -L / 2 + ((i + 1) * L) / cols - 0.02;
    const drawers = i === 2;
    if (drawers)
      for (let k = 0; k < 3; k++) {
        const y0 = 0.14 + k * 0.22;
        V.span(a, e, y0, y0 + 0.19, D - 0.035, D - 0.012, shadeHex(PAL.cabinetCream, 1.03));
        V.box(0.1, 0.014, 0.02, PAL.knobBrass, (a + e) / 2, y0 + 0.13, D, { ink: false });
      }
    else {
      V.span(a, e, 0.14, VANITY_H - 0.08, D - 0.035, D - 0.012, shadeHex(PAL.cabinetCream, 1.03));
      V.span(a + 0.05, e - 0.05, 0.2, VANITY_H - 0.14, D - 0.012, D - 0.006, shadeHex(PAL.cabinetCream, 0.97), { ink: false });
      V.ball(0.016, 0, PAL.knobBrass, i < 2 ? e - 0.05 : a + 0.05, VANITY_H - 0.16, D, { ink: false });
    }
  }
  V.span(-L / 2 - 0.02, L / 2 + 0.02, VANITY_H - 0.045, VANITY_H, -0.005, D + 0.03, PAL.porcelain);
  // two small round basins at the ends (the middle stays clear for the brushes)
  for (const bx of [-L / 2 + 0.3, L / 2 - 0.3]) {
    V.cyl(0.16, 0.16, 0.012, 18, PAL.porcelain, bx, VANITY_H + 0.006, 0.3);
    V.cyl(0.13, 0.13, 0.006, 18, shadeHex(PAL.mirror, 0.92), bx, VANITY_H + 0.013, 0.3, { ink: false });
    V.cyl(0.016, 0.016, 0.2, 8, PAL.stainless, bx, VANITY_H + 0.1, 0.06);
    V.cyl(0.013, 0.013, 0.12, 8, PAL.stainless, bx, VANITY_H + 0.2, 0.12, { rot: [Math.PI / 2, 0, 0] });
  }
  // toothbrush cup + soap at the west end
  V.cyl(0.035, 0.03, 0.1, 10, PAL.ellieMain, -L / 2 + 0.08, VANITY_H + 0.05, 0.12);
  for (let i = 0; i < 3; i++) V.cyl(0.006, 0.006, 0.16, 4, [PAL.addyMain, PAL.ellieMain, PAL.heidiMain][i]!, -L / 2 + 0.07 + i * 0.012, VANITY_H + 0.13, 0.12, { rot: [0, 0, (i - 1) * 0.2], ink: false });
  V.cyl(0.03, 0.035, 0.12, 10, PAL.fabricRose, -L / 2 + 0.55, VANITY_H + 0.06, 0.1);
  // stools (family colours) — seat top = VANITY_STOOL_H 0.52
  const stools: [Furn, number][] = [
    [FURN.stool1, PAL.addyMain],
    [FURN.stool2, PAL.ellieMain],
    [FURN.stool3, PAL.heidiMain],
  ];
  for (const [s, col] of stools) {
    const S = new Frame(b, cx(s), 0, cz(s), 0);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      S.cyl(0.018, 0.022, 0.48, 6, PAL.woodWarm, Math.cos(a) * 0.12, 0.24, Math.sin(a) * 0.12, { rot: [Math.sin(a) * -0.12, 0, Math.cos(a) * 0.12] });
    }
    S.torus(0.115, 0.012, 4, 14, PAL.woodWarm, 0, 0.2, 0, { rot: [Math.PI / 2, 0, 0], ink: false });
    S.cyl(0.17, 0.16, 0.05, 16, PAL.woodWarm, 0, 0.455, 0);
    S.rbox(0.33, 0.07, 0.33, 0.035, col, 0, 0.49, 0, { smooth: true }, 2);
  }
  // clawfoot tub + duck
  const tb = FURN.tub;
  const TB = new Frame(b, cx(tb), 0, cz(tb), 0);
  TB.rbox(fw(tb) - 0.04, 0.48, fd(tb) - 0.04, 0.2, PAL.porcelain, 0, 0.37, 0, {}, 2);
  TB.rbox(fw(tb) - 0.18, 0.02, fd(tb) - 0.2, 0.1, 0xbfe0ee, 0, 0.6, 0, { ink: false }, 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) TB.ball(0.045, 1, PAL.knobBrass, sx * (fw(tb) / 2 - 0.12), 0.07, sz * (fd(tb) / 2 - 0.2), { scale: [1, 1.4, 1] });
  TB.cyl(0.02, 0.02, 0.3, 8, PAL.knobBrass, 0, 0.75, -fd(tb) / 2 + 0.1);
  TB.torus(0.07, 0.018, 5, 10, PAL.knobBrass, 0, 0.9, -fd(tb) / 2 + 0.17, { rot: [0, Math.PI / 2, 0] }, Math.PI);
  const duck = TB.sub(0.2, 0.61, 0.5, -0.6);
  duck.sphere(0.055, 10, 8, PAL.flowerYellow, 0, 0.045, 0, { scale: [1.2, 0.85, 1] });
  duck.sphere(0.035, 10, 8, PAL.flowerYellow, 0, 0.1, 0.04);
  duck.cone(0.015, 0.03, 6, 0xff9a3c, 0, 0.1, 0.085, { rot: [Math.PI / 2, 0, 0] });
  // bath mat, hamper, fern
  const bm = FURN.bathMat;
  W.rbox(fw(bm), 0.02, fd(bm), 0.12, PAL.fabricSage, cx(bm), 0.01, cz(bm), {}, 2);
  const hp = FURN.hamper;
  W.lathe(
    [
      [0, 0],
      [0.15, 0],
      [0.17, 0.52],
      [0, 0.52],
    ],
    14,
    0xe0c08a,
    cx(hp),
    0,
    cz(hp),
    { smooth: true },
  );
  W.cyl(0.18, 0.18, 0.04, 14, 0xc9a56e, cx(hp), 0.54, cz(hp));
  plant(W, cx(FURN.bathPlant), cz(FURN.bathPlant), 0.85, 13, 0xfbfbf8, 0x5fae63);
  // walls: tile wainscot on all four bath walls, mirror frame, light bar, towels, a shelf above the tub
  const w3 = findWall('x', -6.5, -1.0);
  const w7 = findWall('x', -2.2, -1.0);
  const w19 = findWall('z', -1.0, -6.5);
  const w20 = findWall('z', 2.6, -6.5);
  const tiles = (f: Frame, x0: number, x1: number, skip?: [number, number]) => {
    const ty = 1.18;
    f.span(x0, x1, 0.11, ty, 0, 0.006, 0xc4d3d9, { ink: false });
    let r = 0;
    for (let y = 0.11; y < ty - 0.01; y += 0.15, r++) {
      for (let x = x0; x < x1 - 0.01; x += 0.15) {
        const a = x + 0.006;
        const e = Math.min(x1, x + 0.144);
        if (skip && e > skip[0] && a < skip[1]) continue;
        const k = Math.round((x - x0) / 0.15);
        f.quad(a, e, y + 0.006, Math.min(ty, y + 0.144), 0.009, (r + k) % 2 ? PAL.tileWhite : PAL.tileSky);
      }
    }
    if (skip) {
      if (skip[0] > x0) f.span(x0, skip[0], ty, ty + 0.05, 0, 0.03, PAL.trim, { ink: false });
      if (skip[1] < x1) f.span(skip[1], x1, ty, ty + 0.05, 0, 0.03, PAL.trim, { ink: false });
    } else f.span(x0, x1, ty, ty + 0.05, 0, 0.03, PAL.trim, { ink: false });
  };
  const inner = 0.93;
  tiles(faceFrame(wb, w3, 1, 0, 0), -inner, 2.53);
  // south wall faces −Z: local x = −world x
  tiles(faceFrame(wb, w7, -1, 0, 0), -2.53, inner, [-2.35 - 0.08, -1.2 + 0.08]);
  // west wall (x = −1.0, bath side faces +X): local x = −world z
  tiles(faceFrame(wb, w19, 1, 0, 0), 2.27, 6.39);
  // east wall (x = 2.6, bath side faces −X): local x = +world z
  tiles(faceFrame(wb, w20, -1, 0, 0), -6.39, -2.27);
  // mirror frame + light bar
  const MF = faceFrame(wb, w3, 1, cx(v), 0);
  MF.rbox(2.34, 1.04, 0.035, 0.05, PAL.cabinetCream, 0, 1.5, 0.018);
  MF.span(-0.55, 0.55, 2.06, 2.1, 0, 0.06, PAL.knobBrass);
  for (let i = 0; i < 4; i++) {
    const x = -0.75 + i * 0.5;
    MF.cyl(0.02, 0.02, 0.06, 6, PAL.knobBrass, x, 2.12, 0.05, { rot: [Math.PI / 2, 0, 0], ink: false });
    MF.on(g.house).sphere(0.065, 12, 8, PAL.lampBulb, x, 2.12, 0.11, { ink: false });
  }
  MF.span(-1.05, 1.05, 2.1, 2.14, 0, 0.05, PAL.knobBrass);
  // towels (east wall)
  const TW = faceFrame(wb, w20, -1, 0, 0);
  TW.cyl(0.012, 0.012, 1.4, 6, PAL.knobBrass, -4.0, 1.42, 0.07, { rot: [0, 0, Math.PI / 2] });
  [PAL.addyMain, PAL.ellieMain, PAL.heidiMain].forEach((c, i) => {
    const x = -4.45 + i * 0.45;
    TW.rbox(0.36, 0.62, 0.05, 0.02, c, x, 1.12, 0.07);
    TW.box(0.36, 0.04, 0.052, 0xffffff, x, 0.95, 0.07, { ink: false });
  });
  // shelf above the tub (west wall) with rolled towels, candles, a tiny plant
  const SHf = faceFrame(wb, w19, 1, 0, 0);
  SHf.span(2.6, 3.9, 1.5, 1.54, 0, 0.2, PAL.woodWarm);
  for (let i = 0; i < 3; i++) SHf.cyl(0.05, 0.05, 0.22, 10, [0xffffff, PAL.fabricSage, PAL.fabricRose][i]!, 3.55 + i * 0.1, 1.59, 0.1, { rot: [0, 0, Math.PI / 2] });
  SHf.cyl(0.03, 0.03, 0.08, 8, 0xfff3dc, 2.9, 1.58, 0.1);
  plant(SHf.sub(3.15, 1.54, 0.1), 0, 0, 0.22, 17);
}
