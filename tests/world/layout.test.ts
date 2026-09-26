import { describe, expect, it } from 'vitest';
import {
  ANCHORS,
  FURN,
  HIDE_SPOTS,
  ROOMS,
  SEATED_ANCHORS,
  WALLS,
  inRect,
  roomAt,
  roomBounds,
  solidPieces,
  BED_MATTRESS_H,
} from '../../src/world/layout';
import { buildPhysics, navPathOn } from '../../src/world/physics';
import { isWalkable } from '../../src/world/nav';
import type { AnchorId, HideSpotId, RoomId } from '../../src/world/types';

const ph = buildPhysics();
const R = 0.26; // character radius used for "free standing spot" checks
const ids = Object.keys(ANCHORS) as AnchorId[];

describe('rooms', () => {
  it('meet the size rules (rooms ≥ 3.5 m, hall ≥ 1.4 m wide)', () => {
    for (const r of ROOMS) {
      if (!r.inside) continue;
      const b = roomBounds(r.id);
      const w = b.x1 - b.x0;
      const d = b.z1 - b.z0;
      if (r.id === 'hall') expect(Math.min(w, d) - 0.14).toBeGreaterThanOrEqual(1.4);
      else expect(Math.min(w, d)).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('roomAt finds the right room at room centres and outside spots', () => {
    const expectAt: [number, number, RoomId | null][] = [
      [-7.2, -4.3, 'heidi'],
      [-3.2, -4.3, 'twins'],
      [0.8, -4.3, 'bath'],
      [5.8, -3.5, 'kitchen'],
      [-3, -1.4, 'hall'],
      [-6.3, 2, 'master'],
      [-1.6, 2, 'entry'],
      [4.7, 2, 'living'],
      [15, -6, 'yard'],
      [11, 2, 'side'],
      [-14, 2, 'driveway'],
      [3, 7.5, 'front'],
      [0, 17, 'street'],
      [0, -20, null],
    ];
    for (const [x, z, id] of expectAt) expect(roomAt(x, z), `${x},${z}`).toBe(id);
  });

  it('interior openings (archways, doors) are at least 1.1 m wide', () => {
    for (const w of WALLS) for (const o of w.openings) if (o.kind !== 'window') expect(o.b - o.a).toBeGreaterThanOrEqual(1.1 - 1e-9);
  });

  it('solid pieces skip door/arch openings', () => {
    const hallTwins = WALLS.find((w) => w.axis === 'x' && w.c === -2.2 && w.a === -5.4)!;
    const pieces = solidPieces(hallTwins);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]![1]).toBeCloseTo(-3.0);
    expect(pieces[1]![0]).toBeCloseTo(-1.8);
  });
});

describe('anchors', () => {
  it('every anchor sits in the room it claims', () => {
    for (const id of ids) {
      const a = ANCHORS[id];
      expect(roomAt(a.x, a.z), id).toBe(a.room);
      expect(Number.isFinite(a.yaw), id).toBe(true);
    }
  });

  it('standing anchors are free walkable spots', () => {
    for (const id of ids) {
      if (SEATED_ANCHORS.has(id)) continue;
      const a = ANCHORS[id];
      expect(ph.col.free(a.x, a.z, R), `${id} not free`).toBe(true);
      expect(isWalkable(ph.nav, a.x, a.z), `${id} not walkable`).toBe(true);
    }
  });

  it('bed anchors lie on their mattress with the head toward the north headboard', () => {
    const beds: [AnchorId, keyof typeof FURN][] = [
      ['bedAddy', 'bedAddy'],
      ['bedEllie', 'bedEllie'],
      ['bedHeidi', 'heidiBed'],
      ['masterBedChris', 'masterBed'],
      ['masterBedAshley', 'masterBed'],
    ];
    for (const [id, f] of beds) {
      const a = ANCHORS[id];
      const r = FURN[f].r;
      expect(inRect(r, a.x, a.z), id).toBe(true);
      expect(a.yaw).toBe(0); // feet → +Z, head at local −Z (north headboard)
      const len = id.startsWith('master') ? 1.85 : 1.36;
      expect(a.z - len, `${id} head beyond headboard`).toBeGreaterThan(r.z0 - 0.02);
    }
    expect(BED_MATTRESS_H).toBe(0.5);
  });

  it('seats face the table, stools face the mirror', () => {
    for (const s of ['seatAddy', 'seatEllie', 'seatHeidi'] as const) expect(ANCHORS[s].yaw).toBe(0);
    expect(ANCHORS.seatChris.yaw).toBeCloseTo(Math.PI / 2);
    expect(ANCHORS.seatAshley.yaw).toBeCloseTo(-Math.PI / 2);
    for (const s of ['stool1', 'stool2', 'stool3'] as const) {
      expect(ANCHORS[s].yaw).toBeCloseTo(Math.PI);
      expect(ANCHORS[s].z).toBeGreaterThan(FURN.vanity.r.z1); // in front of the vanity
    }
    expect(ANCHORS.stool2.x - ANCHORS.stool1.x).toBeGreaterThan(0.6);
  });

  it('seated anchors are reachable: a walkable spot within 1 m', () => {
    for (const id of SEATED_ANCHORS) {
      const a = ANCHORS[id];
      let ok = false;
      for (let r = 0.25; r <= 1.2 && !ok; r += 0.05)
        for (let k = 0; k < 16 && !ok; k++) {
          const x = a.x + Math.cos((k / 16) * Math.PI * 2) * r;
          const z = a.z + Math.sin((k / 16) * Math.PI * 2) * r;
          if (ph.col.free(x, z, R) && isWalkable(ph.nav, x, z)) ok = true;
        }
      expect(ok, id).toBe(true);
    }
  });
});

describe('hide spots', () => {
  it('all 12 exist with free stand spots, labels and item positions near the stand', () => {
    const want: HideSpotId[] = [
      'couchCushion',
      'dogBed',
      'bathCounter',
      'twinsFloor',
      'heidiFloor',
      'kitchenTable',
      'yardGrass',
      'masterChair',
      'hallBasket',
      'entryBench',
      'laundryPile',
      'underTwinsBed',
    ];
    expect(HIDE_SPOTS.map((h) => h.id).sort()).toEqual([...want].sort());
    for (const h of HIDE_SPOTS) {
      expect(ph.col.free(h.stand.x, h.stand.z, R), h.id).toBe(true);
      expect(roomAt(h.stand.x, h.stand.z), h.id).toBe(h.stand.room);
      expect(h.label.length).toBeGreaterThan(3);
      const d = Math.hypot(h.item.x - h.stand.x, h.item.z - h.stand.z);
      expect(d, h.id).toBeLessThan(1.3);
      expect(h.item.y).toBeGreaterThanOrEqual(0);
      // stand faces roughly toward the item
      const yawTo = Math.atan2(h.item.x - h.stand.x, h.item.z - h.stand.z);
      const diff = Math.atan2(Math.sin(yawTo - h.stand.yaw), Math.cos(yawTo - h.stand.yaw));
      expect(Math.abs(diff), h.id).toBeLessThan(0.9);
    }
  });
});

describe('navigation', () => {
  const key: AnchorId[] = [
    'chrisStart',
    'coffeeMaker',
    'sink',
    'lunchCounter',
    'fridge',
    'kitchenTrash',
    'backDoorIn',
    'backDoorOut',
    'yardCenter',
    'yardFar',
    'yardBush',
    'outdoorBin',
    'frontDoorIn',
    'frontDoorOut',
    'bedsideAddy',
    'bedsideEllie',
    'bedsideHeidi',
    'curtainTwins',
    'curtainHeidi',
    'bathDoor',
    'stool2',
    'entryGather1',
    'entryGather3',
    'dogBed',
    'dogBowl',
    'carDriver',
    'carSide',
    'ashleyCar',
    'drivewayEnd',
    'seatAddy',
  ];

  const pathLen = (pts: { x: number; z: number }[], sx: number, sz: number) => {
    let L = 0;
    let px = sx;
    let pz = sz;
    for (const p of pts) {
      L += Math.hypot(p.x - px, p.z - pz);
      px = p.x;
      pz = p.z;
    }
    return L;
  };

  it('finds walkable paths between all key anchors (ending at the target)', () => {
    for (const a of key) {
      for (const b of key) {
        if (a === b) continue;
        const A = ANCHORS[a];
        const B = ANCHORS[b];
        const pts = navPathOn(ph.nav, A.x, A.z, B.x, B.z);
        expect(pts.length, `${a}→${b}`).toBeGreaterThan(0);
        const last = pts[pts.length - 1]!;
        const tol = SEATED_ANCHORS.has(b) ? 1.2 : 0.05;
        expect(Math.hypot(last.x - B.x, last.z - B.z), `${a}→${b} ends far`).toBeLessThan(tol);
        for (const p of pts) expect(p.y).toBe(0);
        // no absurd detours
        const L = pathLen(pts, A.x, A.z);
        expect(L, `${a}→${b}`).toBeLessThan(Math.hypot(B.x - A.x, B.z - A.z) * 3 + 8);
      }
    }
  });

  it('paths only use walkable cells (segments never cross walls)', () => {
    const pairs: [AnchorId, AnchorId][] = [
      ['chrisStart', 'coffeeMaker'],
      ['bedsideHeidi', 'stool1'],
      ['coffeeMaker', 'yardFar'],
      ['frontDoorIn', 'outdoorBin'],
      ['bedsideAddy', 'carSide'],
    ];
    ph.doors.front.active = false; // closed doors count as open for paths
    ph.doors.back.active = false;
    for (const [a, b] of pairs) {
      const A = ANCHORS[a];
      const pts = navPathOn(ph.nav, A.x, A.z, ANCHORS[b].x, ANCHORS[b].z);
      let px = A.x;
      let pz = A.z;
      for (const p of pts) {
        const n = Math.ceil(Math.hypot(p.x - px, p.z - pz) / 0.05);
        for (let i = 1; i < n; i++) {
          const x = px + ((p.x - px) * i) / n;
          const z = pz + ((p.z - pz) * i) / n;
          expect(ph.col.free(x, z, 0.2), `${a}→${b} at ${x.toFixed(2)},${z.toFixed(2)}`).toBe(true);
        }
        px = p.x;
        pz = p.z;
      }
    }
  });

  it('snaps an unreachable target to the nearest free spot', () => {
    const pts = navPathOn(ph.nav, ANCHORS.chrisStart.x, ANCHORS.chrisStart.z, FURN.masterBed.r.x0 + 0.8, 0.5);
    const last = pts[pts.length - 1]!;
    expect(ph.col.free(last.x, last.z, 0.2)).toBe(true);
  });
});
