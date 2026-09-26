// ACT IV "OUT THE DOOR" — pure gameplay logic (no three.js, no DOM): the missing-item bookkeeping (search, carry,
// deliver), Ashley's departure trigger, the dog's hint timer, the star rating, the lines, and the path of Ashley's
// car backing down the driveway. Tested in tests/activities/rush/.
import type { GirlId } from '../../family/types';
import { ASHLEY_LEAVES, type MissingItem, type Stars } from '../../plan/types';
import type { ItemKind } from '../../props/types';
import type { IconId } from '../../ui/types';
import type { HideSpotId } from '../../world/types';

export const ITEM_NAME: Readonly<Record<ItemKind, string>> = {
  shoe: 'left shoe',
  backpack: 'backpack',
  libraryBook: 'library book',
  waterBottle: 'water bottle',
  hairTie: 'hair tie',
  permissionSlip: 'permission slip',
  jacket: 'jacket',
  lunchbox: 'lunchbox',
};

export const ITEM_ICON: Readonly<Record<ItemKind, IconId>> = {
  shoe: 'shoe',
  backpack: 'backpack',
  libraryBook: 'book',
  waterBottle: 'bottle',
  hairTie: 'hairTie',
  permissionSlip: 'slip',
  jacket: 'jacket',
  lunchbox: 'lunch',
};

export type ItemState = 'hidden' | 'carried' | 'delivered' | 'turnedUp';

export interface RushItem {
  readonly index: number;
  readonly item: ItemKind;
  readonly girl: GirlId;
  readonly spot: HideSpotId;
  state: ItemState;
}

export type LookResult = { kind: 'found'; item: RushItem } | { kind: 'empty' } | { kind: 'handsFull' } | { kind: 'searched' };
export type GiveResult = { kind: 'delivered'; item: RushItem; girlDone: boolean } | { kind: 'notHers'; item: RushItem; owner: GirlId } | { kind: 'emptyHands' };

/** Who needs what, what's been searched, what Chris is carrying. */
export class RushBook {
  readonly items: RushItem[];
  carried: RushItem | null = null;
  readonly searched = new Set<HideSpotId>();
  found = 0;
  wrongGives = 0;

  constructor(missing: readonly MissingItem[]) {
    this.items = missing.map((m, index) => ({ index, item: m.item, girl: m.girl, spot: m.spot, state: 'hidden' as ItemState }));
  }

  /** The item hidden at a spot (still hidden), if any. */
  at(spot: HideSpotId): RushItem | null {
    return this.items.find((i) => i.spot === spot && i.state === 'hidden') ?? null;
  }

  /** Can Chris look here now (hands free, not searched empty, not already emptied)? */
  canLook(spot: HideSpotId): boolean {
    return this.carried === null && !this.searched.has(spot);
  }

  look(spot: HideSpotId): LookResult {
    if (this.carried) return { kind: 'handsFull' };
    if (this.searched.has(spot)) return { kind: 'searched' };
    const it = this.at(spot);
    this.searched.add(spot);
    if (!it) return { kind: 'empty' };
    it.state = 'carried';
    this.carried = it;
    this.found++;
    return { kind: 'found', item: it };
  }

  give(girl: GirlId): GiveResult {
    const it = this.carried;
    if (!it) return { kind: 'emptyHands' };
    if (it.girl !== girl) {
      this.wrongGives++;
      return { kind: 'notHers', item: it, owner: it.girl };
    }
    it.state = 'delivered';
    this.carried = null;
    return { kind: 'delivered', item: it, girlDone: this.needs(girl).length === 0 };
  }

  /** What a girl still needs (hidden or carried). */
  needs(girl: GirlId): RushItem[] {
    return this.items.filter((i) => i.girl === girl && (i.state === 'hidden' || i.state === 'carried'));
  }

  /** Items the girl asked for this morning. */
  wants(girl: GirlId): RushItem[] {
    return this.items.filter((i) => i.girl === girl);
  }

  get remaining(): number {
    let n = 0;
    for (const i of this.items) if (i.state === 'hidden' || i.state === 'carried') n++;
    return n;
  }

  /** Still hidden (allocation-free count). */
  get hiddenCount(): number {
    let n = 0;
    for (const i of this.items) if (i.state === 'hidden') n++;
    return n;
  }

  get delivered(): number {
    let n = 0;
    for (const i of this.items) if (i.state === 'delivered') n++;
    return n;
  }

  get allDone(): boolean {
    return this.remaining === 0;
  }

  /** Still hidden (not picked up) — the dog's hint targets. */
  undiscovered(): RushItem[] {
    return this.items.filter((i) => i.state === 'hidden');
  }

  /** Wrap-up: everything still missing "turns up". Returns those items. */
  turnUpAll(): RushItem[] {
    const out: RushItem[] = [];
    for (const i of this.items) {
      if (i.state === 'hidden' || i.state === 'carried') {
        i.state = 'turnedUp';
        out.push(i);
      }
    }
    this.carried = null;
    return out;
  }
}

/** Ashley leaves at 7:45 or as soon as everything is delivered (whichever first) — never mid-animation. */
export function ashleyShouldLeave(minutes: number, allDone: boolean, alreadyLeft: boolean, busy: boolean): boolean {
  return !alreadyLeft && !busy && (minutes >= ASHLEY_LEAVES - 1e-6 || allDone);
}

/** After this many seconds without progress the dog "helps" (runs to an undiscovered spot and digs). */
export const DOG_HINT_AFTER = 20;

export class DogHelper {
  idle = 0;
  hints = 0;

  /** Progress (a find / delivery) resets the timer. */
  progress(): void {
    this.idle = 0;
  }

  /** Per frame; true on the frame a hint is due (the timer restarts). */
  update(dt: number, hasUndiscovered: boolean, canHint: boolean): boolean {
    if (!hasUndiscovered) {
      this.idle = 0;
      return false;
    }
    this.idle += Math.max(0, dt);
    if (this.idle >= DOG_HINT_AFTER && canHint) {
      this.idle = 0;
      this.hints++;
      return true;
    }
    return false;
  }
}

/** Which undiscovered item the dog digs at: the one furthest from Chris (the helpful one). */
export function pickHint<T extends { x: number; z: number }>(cands: readonly T[], chrisX: number, chrisZ: number): T | null {
  let best: T | null = null;
  let bestD = -1;
  for (const c of cands) {
    const d = Math.hypot(c.x - chrisX, c.z - chrisZ);
    if (d > bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

export interface RushScoreInput {
  total: number;
  /** Delivered by Chris (not "turned up" at the wrap-up). */
  delivered: number;
  /** Everything was delivered before Ashley left for work. */
  allBeforeAshley: boolean;
  /** Real seconds of search play. */
  seconds: number;
}

/** 1..3 stars: speed + everything delivered before 7:45. Never 0. */
export function rushStars(i: RushScoreInput): Stars {
  const all = i.total === 0 || i.delivered >= i.total;
  let p = 1;
  if (all && i.allBeforeAshley) p += 1;
  else if (i.total > 0 && i.delivered / i.total >= 0.6) p += 0.5;
  if (all) p += i.seconds <= 80 ? 1 : i.seconds <= 115 ? 0.5 : 0;
  const r = Math.round(p + 1e-9);
  return (r <= 1 ? 1 : r >= 3 ? 3 : 2) as Stars;
}

export function rushFlags(i: RushScoreInput, extra: { dogHints: number; lunches: boolean }): string[] {
  const f: string[] = [];
  if (i.total > 0 && i.delivered >= i.total && i.allBeforeAshley) f.push('rush:beforeAshley');
  if (i.total > 0 && i.delivered >= i.total && i.seconds <= 80) f.push('rush:fast');
  if (extra.dogHints > 0) f.push('rush:dogHelped');
  if (extra.lunches) f.push('rush:lunches');
  return f;
}

// ── lines ───────────────────────────────────────────────────────────────────

/** "I need my left shoe!" / "I need my backpack AND my hair tie!" */
export function needLine(items: readonly ItemKind[]): string {
  if (items.length === 0) return 'I’m ready!';
  const names = items.map((k) => `my ${ITEM_NAME[k]}`);
  if (names.length === 1) return `I need ${names[0]}!`;
  return `I need ${names.slice(0, -1).join(', ')} AND ${names[names.length - 1]}!`;
}

/** The wrap-up: the last item "turns up" (it was there the whole time). */
export function turnsUpLine(item: ItemKind, name: string): string {
  switch (item) {
    case 'libraryBook':
      return `${name} found her library book. In her backpack. The whole time.`;
    case 'shoe':
      return `${name}’s left shoe? On her left foot. The whole time.`;
    case 'backpack':
      return `${name}’s backpack was on her back. The whole time.`;
    case 'waterBottle':
      return `${name}’s water bottle was in her backpack. The whole time.`;
    case 'hairTie':
      return `${name}’s hair tie was on her wrist. The whole time.`;
    case 'permissionSlip':
      return `${name}’s permission slip was in her pocket. The whole time.`;
    case 'jacket':
      return `${name}’s jacket was tied around her waist. The whole time.`;
    case 'lunchbox':
      return `${name}’s lunchbox was in her backpack. The whole time.`;
  }
}

/** Chris finds nothing (a gentle joke; rotates). */
export const EMPTY_QUIPS: readonly string[] = [
  'Just dust bunnies.',
  'A sock! …Not the right sock.',
  'Three crayons and a mystery raisin.',
  'Nope. Just the TV remote. Huh!',
  'Only dog hair. So much dog hair.',
  'A hair clip from 2019.',
  'Nothing here but crumbs.',
  'A very important rock. Not it.',
];

export function emptyQuip(i: number): string {
  return EMPTY_QUIPS[((i % EMPTY_QUIPS.length) + EMPTY_QUIPS.length) % EMPTY_QUIPS.length]!;
}

/** Chris's find line. */
export function foundLine(item: ItemKind, name: string, spot: HideSpotId, dogName: string): string {
  if (spot === 'dogBed') return `${dogName} was guarding ${name}’s ${ITEM_NAME[item]}!`;
  return `Aha! ${name}’s ${ITEM_NAME[item]}!`;
}

/** What the girl says when she gets it. */
export const THANKS: readonly string[] = ['YES! Thank you!', 'My hero!', 'Thanks, Chris!', 'Woo-hoo!', 'You found it!'];

// ── Ashley's car backing down the driveway (quadratic Bézier) ───────────────

export interface P2 {
  x: number;
  z: number;
}

/** Point on the quadratic Bézier p0 → c → p2 at u. */
export function bezier(p0: P2, c: P2, p2: P2, u: number, out: P2): P2 {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const d = u * u;
  out.x = a * p0.x + b * c.x + d * p2.x;
  out.z = a * p0.z + b * c.z + d * p2.z;
  return out;
}

/** Tangent (derivative) of the Bézier at u. */
export function bezierTangent(p0: P2, c: P2, p2: P2, u: number, out: P2): P2 {
  out.x = 2 * (1 - u) * (c.x - p0.x) + 2 * u * (p2.x - c.x);
  out.z = 2 * (1 - u) * (c.z - p0.z) + 2 * u * (p2.z - c.z);
  return out;
}

/** Yaw of a car REVERSING along a direction of travel (its nose points the other way; yaw 0 = nose +Z). */
export function reverseYaw(tx: number, tz: number): number {
  return Math.atan2(-tx, -tz);
}

/** Yaw of a car driving forward along a direction (yaw 0 = nose +Z). */
export function forwardYaw(tx: number, tz: number): number {
  return Math.atan2(tx, tz);
}

/** Approximate arc length of the Bézier. */
export function bezierLength(p0: P2, c: P2, p2: P2, steps = 24): number {
  const a = { x: p0.x, z: p0.z };
  const b = { x: 0, z: 0 };
  let len = 0;
  for (let i = 1; i <= steps; i++) {
    bezier(p0, c, p2, i / steps, b);
    len += Math.hypot(b.x - a.x, b.z - a.z);
    a.x = b.x;
    a.z = b.z;
  }
  return len;
}

/** Advance u by a distance along the curve (constant speed). */
export function stepAlong(p0: P2, c: P2, p2: P2, u: number, dist: number, tmp: P2): number {
  bezierTangent(p0, c, p2, u, tmp);
  const sp = Math.hypot(tmp.x, tmp.z);
  if (sp < 1e-6) return Math.min(1, u + 0.01);
  return Math.min(1, u + dist / sp);
}
