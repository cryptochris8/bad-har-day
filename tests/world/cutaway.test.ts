import { describe, expect, it } from 'vitest';
import { computeCutTargets, focusNeighbourhood, hiddenRegion, segmentHitsRect, type CutView } from '../../src/world/cutaway';
import { WALLS, WALL_COUNT } from '../../src/world/layout';

const out = new Float32Array(WALL_COUNT + 1);
const wall = (axis: 'x' | 'z', c: number, a: number) => WALLS.find((w) => w.axis === axis && w.c === c && w.a === a)!;
const view = (fx: number, fz: number, mode: CutView['mode'] = 'dollhouse', cam?: [number, number, number]): CutView => ({
  mode,
  fx,
  fz,
  camX: cam?.[0] ?? fx,
  camY: cam?.[1] ?? 11,
  camZ: cam?.[2] ?? fz + 8,
});
const level = (w: { id: number }) => out[w.id];

describe('dollhouse cut-away selection', () => {
  it('focus in the twins room: its south wall + walls in front drop, north + side walls stay', () => {
    computeCutTargets(WALLS, view(-3.2, -4.3), out);
    expect(level(wall('x', -2.2, -5.4))).toBe(0); // twins south (hall north)
    expect(level(wall('x', -6.5, -5.4))).toBe(1); // twins north facade (window)
    expect(level(wall('z', -5.4, -6.5))).toBe(1); // twins/heidi side wall
    expect(level(wall('z', -1.0, -6.5))).toBe(1); // twins/bath side wall
    expect(out[0]).toBe(1);
  });

  it('focus in the kitchen: the kitchen south wall drops, the stations wall stays', () => {
    computeCutTargets(WALLS, view(5.8, -3.8), out);
    expect(level(wall('x', -0.6, 2.6))).toBe(0);
    expect(level(wall('x', -6.5, 2.6))).toBe(1);
    expect(level(wall('z', 9, -6.5))).toBe(1); // back door wall frames the kitchen
    expect(level(wall('z', 2.6, -6.5))).toBe(1);
  });

  it('focus in the living room: the front facade drops, the living-room north wall stays', () => {
    computeCutTargets(WALLS, view(4.5, 2), out);
    expect(level(wall('x', 4.5, 0.4))).toBe(0);
    expect(level(wall('x', -0.6, 2.6))).toBe(1);
  });

  it('focus in the hall: hall south walls drop, bedroom south walls stay as its backdrop', () => {
    computeCutTargets(WALLS, view(-3, -1.4), out);
    expect(level(wall('x', -0.6, -9))).toBe(0);
    expect(level(wall('x', -0.6, -3.6))).toBe(0);
    expect(level(wall('x', -2.2, -5.4))).toBe(1);
  });

  it('outside: the house stays whole when the focus is in the front yard or the driveway', () => {
    computeCutTargets(WALLS, view(-1.6, 6.2), out);
    for (const w of WALLS) expect(level(w), `wall ${w.id}`).toBe(1);
    computeCutTargets(WALLS, view(-13, 2.5), out);
    for (const w of WALLS) expect(level(w), `wall ${w.id}`).toBe(1);
  });

  it('neighbourhood: whole room inside, clipped square outside', () => {
    const r = { x0: 0, z0: 0, x1: 0, z1: 0 };
    focusNeighbourhood(5.8, -3.8, r);
    expect(r).toEqual({ x0: 2.6, z0: -6.5, x1: 9, z1: -0.6 });
    focusNeighbourhood(0, 6, r);
    expect(r.z0).toBeGreaterThan(4.5);
    focusNeighbourhood(14, -3, r);
    expect(r.x0).toBeGreaterThan(9);
  });

  it('hidden region of a south wall reaches ≈ 2 m behind it, none when the camera is behind', () => {
    const w = wall('x', -2.2, -5.4);
    const r = { x0: 0, z0: 0, x1: 0, z1: 0 };
    expect(hiddenRegion(w, -3.2, 11.5, 4, r)).toBe(true);
    expect(r.z1).toBe(-2.2);
    expect(-2.2 - r.z0).toBeGreaterThan(1.5);
    expect(-2.2 - r.z0).toBeLessThan(2.6);
    expect(hiddenRegion(w, -3.2, 11.5, -5, r)).toBe(false);
  });
});

describe('close-up cut-away', () => {
  it('only walls crossing the camera → focus line drop', () => {
    // camera in the hall looking north at Addy's bed: the twins' south wall drops, nothing else
    computeCutTargets(WALLS, view(-4.8, -5.6, 'closeup', [-4.2, 1.8, -1.4]), out);
    expect(level(wall('x', -2.2, -5.4))).toBe(0);
    expect(level(wall('x', -6.5, -5.4))).toBe(1);
    expect(level(wall('x', 4.5, -3.6))).toBe(1);
    // camera inside the bathroom behind the stools: nothing drops
    computeCutTargets(WALLS, view(0.9, -6.1, 'closeup', [0.9, 1.35, -3.3]), out);
    for (const w of WALLS) expect(level(w), `wall ${w.id}`).toBe(1);
  });

  it('segment/rect intersection', () => {
    const r = { x0: 0, z0: 0, x1: 1, z1: 1 };
    expect(segmentHitsRect(-1, 0.5, 2, 0.5, r)).toBe(true);
    expect(segmentHitsRect(-1, 2, 2, 2, r)).toBe(false);
    expect(segmentHitsRect(0.5, 0.5, 0.6, 0.6, r)).toBe(true);
    expect(segmentHitsRect(-2, -2, -1, -1, r)).toBe(false);
  });
});
