// The Morning Report Card (docs/GDD.md §9): grade + funny awards from what happened. PURE.
import { DISPLAY_NAME, GIRLS, type GirlId } from '../family/types';
import { T, type ActivityId, type ActivityRecord, type Award, type DayPlan, type MorningReport } from './types';

export interface ReportInput {
  plan: DayPlan;
  records: ActivityRecord[];
  /** Arrival at school (minutes since midnight). */
  arrival: number;
  playSeconds: number;
  flags: readonly string[];
  hair: Record<GirlId, { smooth: number; momFinished: boolean; blackBrushSeconds: number; solo: boolean }>;
  /** Times Chris was loud near sleeping girls. */
  loud: number;
  dogName: string;
  /** Previous best arrival (null = none) → newBestArrival. */
  bestArrival: number | null;
}

export function gradeFor(ratio: number): { title: string; blurb: string } {
  if (ratio >= 0.88) return { title: 'PANCAKE-LEVEL PERFECT', blurb: 'Coffee made, hair gleaming, nobody forgot a shoe. Frame this morning.' };
  if (ratio >= 0.72) return { title: 'SMOOTH OPERATOR', blurb: 'A few bumps, zero tears. That is a win in any house.' };
  if (ratio >= 0.55) return { title: 'WE MADE IT!', blurb: "Everybody's out the door. Mostly with both shoes." };
  return { title: 'CONTROLLED CHAOS', blurb: "It wasn't pretty, but it was ours. And everyone made it!" };
}

function starsOf(records: readonly ActivityRecord[], id: ActivityId): number {
  return records.find((r) => r.id === id)?.stars ?? 0;
}

/** 2..4 awards, most specific first (stable for the same input). */
export function pickAwards(input: ReportInput): Award[] {
  const { records, flags, hair, plan } = input;
  const has = (f: string) => flags.includes(f);
  const out: Award[] = [];
  const add = (id: string, title: string, blurb: string, icon: string) => {
    if (!out.some((a) => a.id === id)) out.push({ id, title, blurb, icon });
  };

  const allApproved = GIRLS.every((g) => hair[g].smooth >= 0.95 && !hair[g].momFinished);
  if (allApproved) add('momApproved3', 'MOM APPROVED ×3', 'Three heads of hair passed inspection on the first try.', 'crown');
  if (starsOf(records, 'coffee') === 3 || has('coffee:perfect')) add('coffeeArtisan', 'COFFEE ARTISAN', "Ashley's coffee: exactly how she likes it.", 'coffee');
  if (starsOf(records, 'dog') === 3 || has('dog:fast')) add('dogWhisperer', 'DOG WHISPERER', `${input.dogName} came back inside on the first call.`, 'dog');
  if (starsOf(records, 'lunch') === 3) add('lunchLegend', 'LUNCHBOX LEGEND', 'Three lunches, every favourite, zero complaints.', 'lunch');
  if (starsOf(records, 'rush') === 3) add('sockDetective', 'SOCK DETECTIVE', 'Found every missing thing before anyone panicked.', 'shoe');
  if (starsOf(records, 'wake') === 3) add('wakeDj', 'WAKE-UP DJ', 'Three sleepyheads, up and at it.', 'music');
  if (starsOf(records, 'drive') === 3) add('carpoolCaptain', 'CARPOOL CAPTAIN', 'Smoothest school run in the neighbourhood.', 'car');
  if (starsOf(records, 'dishes') === 3) add('dishTetris', 'DISHWASHER TETRIS MASTER', 'Every plate in its place.', 'dishes');
  if (starsOf(records, 'trash') === 3) add('curbside', 'CURBSIDE CHAMPION', 'The bag made it. All of it.', 'trash');
  if (input.loud === 0) add('ninja', 'QUIET AS A NINJA', 'Not a single creaky floorboard before 6:00.', 'star');
  if (input.arrival <= T(7, 58)) add('earlyBird', 'EARLY BIRD', 'At school before the bell even thought about ringing.', 'clock');

  const solo = GIRLS.filter((g) => hair[g].solo);
  if (!allApproved && solo.length > 0) add('solo', 'SOLO BRUSHER', `${solo.map((g) => DISPLAY_NAME[g]).join(' & ')} did it all by herself!`.replace('by herself', solo.length > 1 ? 'by themselves' : 'by herself'), 'brush');

  let mvp: GirlId | null = null;
  for (const g of GIRLS) if (hair[g].blackBrushSeconds > 0 && (mvp === null || hair[g].blackBrushSeconds > hair[mvp].blackBrushSeconds)) mvp = g;
  if (mvp !== null && out.length < 4) add('blackBrushMvp', `BLACK BRUSH MVP: ${DISPLAY_NAME[mvp].toUpperCase()}`, 'Held the legendary brush the longest. Rightfully so.', 'blackBrush');
  if (plan.dogQuirk === 'leaf' && out.length < 2) add('leafChaser', 'LEAF CHASER', `${input.dogName} won the war against the leaf.`, 'dog');
  if (out.length < 2) add('groupHug', 'GROUP HUG', 'Five family members. One big squeeze on the way out.', 'heart');
  if (out.length < 2) add('madeIt', 'WE MADE IT', 'Somehow, everybody made it out the door.', 'school');
  return out.slice(0, 4);
}

export function buildReport(input: ReportInput): MorningReport {
  const totalStars = input.records.reduce((s, r) => s + r.stars, 0);
  const maxStars = input.records.length * 3;
  const ratio = maxStars > 0 ? totalStars / maxStars : 1;
  return {
    seed: input.plan.seed,
    daily: input.plan.daily,
    dateKey: input.plan.dateKey,
    arrival: input.arrival,
    records: input.records,
    totalStars,
    maxStars,
    grade: gradeFor(ratio),
    awards: pickAwards(input),
    newBestArrival: input.bestArrival === null || input.arrival < input.bestArrival,
    playSeconds: input.playSeconds,
  };
}
