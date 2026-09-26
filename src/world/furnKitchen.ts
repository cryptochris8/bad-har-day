// Kitchen + dining static furniture (cabinets, counters, range, upper cabinets, backsplash, table & chairs,
// dog bowls, rug, plant). Animated fixtures (fridge door, dishwasher, sink water, coffee maker, trash lid)
// live in fixtures.ts.
import { PAL } from '../render/palette';
import { hash01, shadeHex, type GeoBuilder } from '../render/models/builder';
import { Frame, cushion, plant, pictureFrame, tallPlant, type Glows } from './kit';
import { COUNTER_D, COUNTER_H, FURN, IN, TABLE_H, CHAIR_SEAT_H } from './layout';
import { faceFrame, findWall } from './house';

const SAGE_DOOR = shadeHex(PAL.cabinetSage, 1.08);
const SAGE_KICK = shadeHex(PAL.cabinetSage, 0.62);

/** Base cabinet run segment in a frame whose local z = 0 is the wall and +z is the room. */
export function baseCabinet(f: Frame, x0: number, x1: number, doors: number, drawer: boolean, color: number = PAL.cabinetSage): void {
  const D = COUNTER_D;
  f.span(x0 + 0.004, x1 - 0.004, 0.1, COUNTER_H - 0.04, 0, D - 0.035, color);
  f.span(x0 + 0.004, x1 - 0.004, 0, 0.1, 0, D - 0.09, SAGE_KICK, { ink: false });
  const dTop = drawer ? COUNTER_H - 0.19 : COUNTER_H - 0.07;
  const w = (x1 - x0) / doors;
  const doorCol = color === PAL.cabinetSage ? SAGE_DOOR : shadeHex(color, 1.04);
  for (let i = 0; i < doors; i++) {
    const a = x0 + i * w + 0.02;
    const b = x0 + (i + 1) * w - 0.02;
    f.span(a, b, 0.14, dTop, D - 0.035, D - 0.012, doorCol);
    f.span(a + 0.05, b - 0.05, 0.2, dTop - 0.06, D - 0.012, D - 0.006, shadeHex(doorCol, 0.95), { ink: false });
    const kx = doors > 1 ? (i % 2 === 0 ? b - 0.06 : a + 0.06) : b - 0.06;
    f.ball(0.018, 0, PAL.knobBrass, kx, dTop - 0.08, D - 0.0, { ink: false });
    if (drawer) {
      f.span(a, b, COUNTER_H - 0.17, COUNTER_H - 0.06, D - 0.035, D - 0.012, doorCol);
      f.box(0.1, 0.014, 0.02, PAL.knobBrass, (a + b) / 2, COUNTER_H - 0.115, D, { ink: false });
    }
  }
}

export function countertop(f: Frame, x0: number, x1: number, depth = COUNTER_D, color: number = PAL.countertop): void {
  f.span(x0, x1, COUNTER_H - 0.045, COUNTER_H, -0.005, depth + 0.03, color);
}

function chair(f: Frame, cushionColor: number): void {
  // local: seat centre at origin (x, z), faces +Z; seat top ≈ CHAIR_SEAT_H
  const wood = PAL.woodWarm;
  const s = CHAIR_SEAT_H;
  for (const [x, z] of [
    [-0.17, -0.17],
    [0.17, -0.17],
    [-0.17, 0.17],
    [0.17, 0.17],
  ] as const)
    f.cyl(0.022, 0.018, s - 0.04, 6, wood, x, (s - 0.04) / 2, z);
  f.rbox(0.44, 0.045, 0.43, 0.02, wood, 0, s - 0.045, 0);
  cushion(f, 0.38, 0.05, 0.37, cushionColor, 0, s + 0.005, 0.01);
  // back with rounded top rail + spindles
  f.rbox(0.44, 0.1, 0.045, 0.03, wood, 0, s + 0.42, -0.2);
  for (const x of [-0.17, -0.06, 0.06, 0.17]) f.cyl(0.013, 0.013, 0.38, 5, wood, x, s + 0.18, -0.2);
}

export function buildKitchen(b: GeoBuilder, wb: GeoBuilder, g: Glows): void {
  const W = new Frame(b, 0, 0, 0, 0);
  // ── north base run (local z = distance from the north wall face) ──
  const fN = new Frame(b, 0, 0, IN.NORTH_IN, 0);
  baseCabinet(fN, FURN.lunchCounter.r.x0, FURN.lunchCounter.r.x1, 2, true);
  baseCabinet(fN, FURN.coffeeCounter.r.x0, FURN.coffeeCounter.r.x1, 1, true);
  baseCabinet(fN, FURN.sinkCounter.r.x0, FURN.sinkCounter.r.x1, 2, false);
  baseCabinet(fN, FURN.cornerCounter.r.x0, FURN.cornerCounter.r.x1, 1, true);
  countertop(fN, FURN.lunchCounter.r.x0 - 0.02, FURN.cornerCounter.r.x1 + 0.02);
  // sink basin (rim + recessed-looking bowl) + faucet
  const sx = (FURN.sinkCounter.r.x0 + FURN.sinkCounter.r.x1) / 2;
  fN.span(sx - 0.38, sx + 0.38, COUNTER_H, COUNTER_H + 0.012, 0.1, 0.55, PAL.sinkSteel);
  fN.span(sx - 0.33, sx + 0.33, COUNTER_H + 0.012, COUNTER_H + 0.016, 0.14, 0.51, shadeHex(PAL.sinkSteel, 0.72), { ink: false });
  fN.span(sx - 0.01, sx + 0.01, COUNTER_H + 0.012, COUNTER_H + 0.018, 0.14, 0.51, shadeHex(PAL.sinkSteel, 0.9), { ink: false });
  fN.cyl(0.03, 0.035, 0.05, 10, PAL.stainless, sx, COUNTER_H + 0.03, 0.07);
  fN.cyl(0.018, 0.018, 0.3, 8, PAL.stainless, sx, COUNTER_H + 0.2, 0.07);
  fN.torus(0.1, 0.018, 6, 10, PAL.stainless, sx, COUNTER_H + 0.35, 0.17, { rot: [0, Math.PI / 2, 0] }, Math.PI);
  fN.cyl(0.018, 0.022, 0.04, 8, PAL.stainless, sx, COUNTER_H + 0.33, 0.27);
  for (const dx of [-0.1, 0.1]) fN.cyl(0.02, 0.025, 0.05, 8, PAL.stainless, sx + dx, COUNTER_H + 0.03, 0.07);
  // dish soap + sponge + a little herb pot by the window
  fN.cyl(0.028, 0.032, 0.17, 8, PAL.ellieMain, sx + 0.3, COUNTER_H + 0.085, 0.08);
  fN.rbox(0.1, 0.035, 0.065, 0.01, PAL.flowerYellow, sx - 0.28, COUNTER_H + 0.018, 0.1);
  plant(fN.sub(sx + 0.52, COUNTER_H, 0.12), 0, 0, 0.26, 3);
  // lunch counter: a cutting board + a fruit bowl at the back, leaving the front clear
  const lx = (FURN.lunchCounter.r.x0 + FURN.lunchCounter.r.x1) / 2;
  fN.rbox(0.4, 0.025, 0.26, 0.012, PAL.woodWarm, lx - 0.45, COUNTER_H + 0.013, 0.14);
  fN.lathe(
    [
      [0, 0],
      [0.09, 0.005],
      [0.14, 0.06],
      [0.13, 0.07],
      [0, 0.05],
    ],
    12,
    PAL.fabricMustard,
    lx + 0.45,
    COUNTER_H,
    0.15,
    { smooth: true },
  );
  fN.ball(0.045, 1, PAL.confettiA, lx + 0.42, COUNTER_H + 0.08, 0.13, { smooth: true });
  fN.ball(0.042, 1, PAL.flowerYellow, lx + 0.49, COUNTER_H + 0.085, 0.17, { smooth: true, scale: [1.3, 0.8, 0.8] });
  fN.ball(0.04, 1, 0x9ccf5a, lx + 0.47, COUNTER_H + 0.08, 0.11, { smooth: true });
  // canisters by the corner
  const cx = (FURN.cornerCounter.r.x0 + FURN.cornerCounter.r.x1) / 2;
  [0.2, 0.15, 0.11].forEach((h, i) => {
    fN.cyl(0.055, 0.055, h, 10, [PAL.cabinetCream, PAL.fabricSage, PAL.fabricRose][i]!, cx - 0.15 + i * 0.13, COUNTER_H + h / 2, 0.1);
    fN.cyl(0.058, 0.058, 0.02, 10, PAL.woodWarm, cx - 0.15 + i * 0.13, COUNTER_H + h + 0.01, 0.1);
  });

  // ── west run with the range (frame local x = −world z, z = +world x from the west wall face) ──
  const fW = new Frame(b, 2.67, 0, 0, Math.PI / 2);
  const wc = FURN.westCounter.r;
  // local x = −z: wc z ∈ [−4.45, −2.95] → local x ∈ [2.95, 4.45]
  baseCabinet(fW, 2.95, 3.3, 1, true);
  baseCabinet(fW, 4.05, 4.45, 1, true);
  countertop(fW, 2.93, 4.47, wc.x1 - wc.x0);
  // cream retro range (x 3.3 … 4.05)
  const r0 = 3.3;
  const r1 = 4.05;
  const rm = (r0 + r1) / 2;
  fW.span(r0 + 0.005, r1 - 0.005, 0.02, COUNTER_H - 0.02, 0, COUNTER_D - 0.01, PAL.cabinetCream);
  fW.span(r0 + 0.04, r1 - 0.04, 0.16, 0.66, COUNTER_D - 0.01, COUNTER_D + 0.005, PAL.stainless);
  fW.span(r0 + 0.12, r1 - 0.12, 0.3, 0.56, COUNTER_D + 0.005, COUNTER_D + 0.009, PAL.stoveDark, { ink: false });
  fW.cyl(0.012, 0.012, r1 - r0 - 0.16, 6, PAL.stainless, rm, 0.7, COUNTER_D + 0.04, { rot: [0, 0, Math.PI / 2] });
  fW.span(r0, r1, COUNTER_H - 0.02, COUNTER_H + 0.01, -0.005, COUNTER_D + 0.01, PAL.stoveDark);
  for (const [dx, dz] of [
    [-0.17, 0.17],
    [0.17, 0.17],
    [-0.17, 0.44],
    [0.17, 0.44],
  ] as const) {
    fW.torus(0.085, 0.014, 5, 16, 0x2a2d38, rm + dx, COUNTER_H + 0.018, dz, { rot: [Math.PI / 2, 0, 0], ink: false });
    fW.cyl(0.05, 0.05, 0.01, 12, 0x555a68, rm + dx, COUNTER_H + 0.016, dz, { ink: false });
  }
  fW.span(r0, r1, COUNTER_H + 0.01, COUNTER_H + 0.14, 0, 0.07, PAL.cabinetCream);
  for (let i = 0; i < 4; i++) fW.cyl(0.022, 0.022, 0.03, 8, PAL.stainless, r0 + 0.14 + i * 0.16, COUNTER_H + 0.075, 0.085, { rot: [Math.PI / 2, 0, 0] });
  // tea kettle
  fW.lathe(
    [
      [0, 0],
      [0.09, 0],
      [0.1, 0.06],
      [0.07, 0.13],
      [0.025, 0.15],
      [0, 0.16],
    ],
    12,
    PAL.heidiMain,
    rm + 0.17,
    COUNTER_H + 0.02,
    0.44,
    { smooth: true },
  );
  fW.cyl(0.012, 0.018, 0.1, 6, PAL.heidiMain, rm + 0.27, COUNTER_H + 0.11, 0.44, { rot: [0, 0, -0.9] });
  // range hood + utensil rail on the wall (cut with the bath/kitchen wall)
  const wallW = findWall('z', 2.6, -6.5);
  const hood = faceFrame(wb, wallW, 1, -rm, 0);
  hood.extrude(
    [
      [-0.4, 1.62],
      [0.4, 1.62],
      [0.14, 1.95],
      [0.14, 2.45],
      [-0.14, 2.45],
      [-0.14, 1.95],
    ],
    0.5,
    PAL.cabinetCream,
    0,
    0,
    0.25,
  );
  hood.box(0.82, 0.05, 0.52, PAL.stainless, 0, 1.62, 0.26);
  hood.on(g.house).box(0.5, 0.02, 0.3, PAL.lampBulb, 0, 1.595, 0.28, { ink: false });
  const rail = faceFrame(wb, wallW, 1, 3.1 * -1 - 0.0, 0);
  rail.cyl(0.01, 0.01, 0.55, 6, PAL.stainless, 0, 1.35, 0.04, { rot: [0, 0, Math.PI / 2] });
  for (let i = 0; i < 4; i++) {
    const x = -0.2 + i * 0.13;
    rail.cyl(0.006, 0.006, 0.18, 4, PAL.woodWarm, x, 1.25, 0.05);
    rail.ball(0.03, 0, i % 2 ? PAL.woodWarm : PAL.stainless, x, 1.15, 0.05, { scale: [1, 1.3, 0.4] });
  }

  // ── north wall: upper cabinets, mug shelf wall, backsplash tiles, window valance, clock face ──
  const wallN = findWall('x', -6.5, 2.6);
  const N = (along: number) => faceFrame(wb, wallN, 1, along, 0);
  const upper = (x0: number, x1: number, y0: number, y1: number, doors: number, lightGroup: GeoBuilder | null) => {
    const f = N(0);
    const D = 0.34;
    f.span(x0, x1, y0, y1, 0, D, PAL.cabinetSage);
    const w = (x1 - x0) / doors;
    for (let i = 0; i < doors; i++) {
      const a = x0 + i * w + 0.02;
      const bb = x0 + (i + 1) * w - 0.02;
      f.span(a, bb, y0 + 0.03, y1 - 0.03, D, D + 0.02, SAGE_DOOR);
      f.span(a + 0.06, bb - 0.06, y0 + 0.1, y1 - 0.1, D + 0.02, D + 0.026, shadeHex(SAGE_DOOR, 0.95), { ink: false });
      f.ball(0.018, 0, PAL.knobBrass, i % 2 ? a + 0.06 : bb - 0.06, y0 + 0.1, D + 0.035, { ink: false });
    }
    f.span(x0 - 0.02, x1 + 0.02, y1, y1 + 0.04, 0, D + 0.04, PAL.cabinetCream);
    if (lightGroup) f.on(lightGroup).span(x0 + 0.05, x1 - 0.05, y0 - 0.018, y0 - 0.002, 0.18, 0.26, PAL.lampBulb, { ink: false });
  };
  upper(FURN.lunchCounter.r.x0, FURN.lunchCounter.r.x1, 1.46, 2.22, 2, g.night);
  upper(7.05, FURN.cornerCounter.r.x1, 1.46, 2.22, 2, g.house);
  upper(FURN.fridge.r.x0, FURN.fridge.r.x1, 1.96, 2.36, 2, null);
  // backsplash subway tiles
  const tile = (x0: number, x1: number, y0: number, y1: number) => {
    const f = N(0);
    f.span(x0, x1, y0, y1, 0, 0.006, 0xd9d3c6, { ink: false });
    let row = 0;
    for (let y = y0; y < y1 - 0.01; y += 0.075, row++) {
      const off = row % 2 ? 0.075 : 0;
      for (let x = x0 - off; x < x1; x += 0.15) {
        const a = Math.max(x0, x + 0.004);
        const e = Math.min(x1, x + 0.146);
        if (e - a < 0.02) continue;
        f.quad(a, e, y + 0.004, Math.min(y1, y + 0.071), 0.01, shadeHex(PAL.tileWhite, 0.98 + hash01(row, Math.round(x * 100)) * 0.04));
      }
    }
  };
  tile(FURN.lunchCounter.r.x0, 5.86, COUNTER_H, 1.46);
  tile(7.02, FURN.cornerCounter.r.x1, COUNTER_H, 1.46);
  tile(5.86, 7.02, COUNTER_H, 0.985);
  // mug shelf wall board (the shelf itself is the fixture) — a little sign-free heart plaque above it
  N(0).rbox(0.14, 0.12, 0.02, 0.03, PAL.heart, 5.55, 1.86, 0.02);
  // valance over the sink window (scalloped fabric)
  const v = N(0);
  v.span(5.8, 7.1, 1.98, 2.12, 0.05, 0.07, PAL.fabricMustard);
  for (let i = 0; i < 8; i++) v.ball(0.075, 1, PAL.fabricMustard, 5.88 + i * 0.163, 1.985, 0.06, { scale: [1.1, 0.55, 0.25], ink: false });
  for (let i = 0; i < 12; i++) v.ball(0.012, 0, 0xffffff, 5.86 + i * 0.11, 2.05 + (i % 2) * 0.03, 0.072, { ink: false });
  v.cyl(0.012, 0.012, 1.4, 6, PAL.knobBrass, 6.45, 2.13, 0.06, { rot: [0, 0, Math.PI / 2] });
  // wall clock face (hands are animated separately)
  const ck = N(6.45);
  ck.cyl(0.165, 0.165, 0.04, 20, PAL.woodWarm, 0, 2.34, 0.02, { rot: [Math.PI / 2, 0, 0] });
  ck.cyl(0.14, 0.14, 0.012, 20, 0xfffaf0, 0, 2.34, 0.045, { rot: [Math.PI / 2, 0, 0], ink: false });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ck.box(i % 3 === 0 ? 0.012 : 0.008, i % 3 === 0 ? 0.03 : 0.018, 0.004, PAL.outline, Math.sin(a) * 0.115, 2.34 + Math.cos(a) * 0.115, 0.052, { rot: [0, 0, -a], ink: false });
  }
  ck.ball(0.012, 0, PAL.outline, 0, 2.34, 0.06, { ink: false });

  // ── east wall: calendar + drawing near the table ──
  const wallE = findWall('z', 9, -6.5);
  const cal = faceFrame(wb, wallE, -1, -3.55, 0);
  cal.span(-0.2, 0.2, 1.28, 1.78, 0, 0.012, 0xfffbf2);
  cal.span(-0.2, 0.2, 1.62, 1.78, 0.012, 0.016, PAL.fabricSage, { ink: false });
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 5; c++) cal.span(-0.17 + c * 0.07, -0.12 + c * 0.07, 1.33 + r * 0.07, 1.38 + r * 0.07, 0.012, 0.016, (r * 5 + c) % 7 === 3 ? PAL.heart : 0xe6dccb, { ink: false });
  pictureFrame(faceFrame(wb, wallE, -1, -0.95, 0), 0, 1.55, 0.36, 0.44, PAL.cabinetCream, 2);

  // ── dining: rug, table, chairs, placemats ──
  const rug = FURN.kitchenRug.r;
  W.rbox(rug.x1 - rug.x0, 0.014, rug.z1 - rug.z0, 0.12, PAL.rugSage, (rug.x0 + rug.x1) / 2, 0.007, (rug.z0 + rug.z1) / 2, {}, 1);
  W.rbox(rug.x1 - rug.x0 - 0.3, 0.016, rug.z1 - rug.z0 - 0.3, 0.1, shadeHex(PAL.rugSage, 1.1), (rug.x0 + rug.x1) / 2, 0.009, (rug.z0 + rug.z1) / 2, { ink: false }, 1);
  const t = FURN.table.r;
  const tx = (t.x0 + t.x1) / 2;
  const tz = (t.z0 + t.z1) / 2;
  const T = new Frame(b, tx, 0, tz, 0);
  T.rbox(t.x1 - t.x0, 0.05, t.z1 - t.z0, 0.025, PAL.woodWarm, 0, TABLE_H - 0.025, 0, {}, 2);
  T.span(-(t.x1 - t.x0) / 2 + 0.08, (t.x1 - t.x0) / 2 - 0.08, TABLE_H - 0.13, TABLE_H - 0.05, -0.4, 0.4, shadeHex(PAL.woodWarm, 0.9));
  for (const sx2 of [-1, 1])
    for (const sz of [-1, 1]) T.cyl(0.04, 0.03, TABLE_H - 0.05, 8, shadeHex(PAL.woodWarm, 0.9), sx2 * ((t.x1 - t.x0) / 2 - 0.12), (TABLE_H - 0.05) / 2, sz * 0.36);
  // fruit bowl + napkin holder in the middle
  T.lathe(
    [
      [0, 0],
      [0.1, 0],
      [0.16, 0.07],
      [0.15, 0.08],
      [0, 0.05],
    ],
    12,
    PAL.ellieMain,
    -0.25,
    TABLE_H,
    0.12,
    { smooth: true },
  );
  T.ball(0.05, 1, PAL.confettiA, -0.27, TABLE_H + 0.09, 0.12, { smooth: true });
  T.ball(0.045, 1, 0xff9f43, -0.19, TABLE_H + 0.09, 0.15, { smooth: true });
  T.ball(0.045, 1, 0x9ccf5a, -0.24, TABLE_H + 0.1, 0.06, { smooth: true });
  T.span(0.3, 0.36, TABLE_H, TABLE_H + 0.1, 0.05, 0.2, PAL.woodWarm);
  T.span(0.305, 0.355, TABLE_H + 0.02, TABLE_H + 0.12, 0.07, 0.18, 0xfffbf2, { ink: false });
  const seats: [keyof typeof FURN, number, number][] = [
    ['chairAddy', PAL.addyMain, 0],
    ['chairEllie', PAL.ellieMain, 0],
    ['chairHeidi', PAL.heidiMain, 0],
    ['chairChris', PAL.chrisHoodie, Math.PI / 2],
    ['chairAshley', PAL.ashleyRobe, -Math.PI / 2],
  ];
  for (const [id, col, yaw] of seats) {
    const r = FURN[id].r;
    const cxx = (r.x0 + r.x1) / 2;
    const czz = (r.z0 + r.z1) / 2;
    chair(new Frame(b, cxx, 0, czz, yaw), col);
    // placemat in front of each seat, in the family colour
    const px = cxx + Math.sin(yaw) * 0.45;
    const pz = czz + Math.cos(yaw) * 0.45;
    const mx = Math.max(t.x0 + 0.18, Math.min(t.x1 - 0.18, px));
    const mz = Math.max(t.z0 + 0.15, Math.min(t.z1 - 0.15, pz));
    W.rbox(yaw === 0 ? 0.4 : 0.3, 0.006, yaw === 0 ? 0.3 : 0.4, 0.04, shadeHex(col, 1.12), mx, TABLE_H + 0.003, mz, { ink: false }, 1);
  }
  // dog bowls on a mat (east wall, under the window)
  const db = FURN.dogBowl.r;
  const dbx = (db.x0 + db.x1) / 2;
  const dbz = (db.z0 + db.z1) / 2;
  W.rbox(0.34, 0.012, 0.6, 0.06, PAL.heidiDark, dbx, 0.006, dbz, {}, 1);
  for (const [dz, fill] of [
    [-0.14, PAL.dirt],
    [0.14, PAL.uiSky],
  ] as const) {
    W.lathe(
      [
        [0, 0],
        [0.1, 0],
        [0.12, 0.06],
        [0.1, 0.065],
        [0, 0.03],
      ],
      12,
      PAL.stainless,
      dbx,
      0.012,
      dbz + dz,
      { smooth: true },
    );
    W.cyl(0.085, 0.085, 0.01, 12, fill, dbx, 0.055, dbz + dz, { ink: false });
  }
  // tall plant by the living-room arch
  const kp = FURN.kitchenPlant.r;
  tallPlant(W, (kp.x0 + kp.x1) / 2, (kp.z0 + kp.z1) / 2, 1.25, 5);
}
