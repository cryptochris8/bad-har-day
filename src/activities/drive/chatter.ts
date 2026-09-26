// What the girls (and Chris) say on the school run — warm, silly, sibling-sweet. Pure: picks lines with the
// activity's seeded Rng and avoids repeating the same line twice in a row.
import type { Rng } from '../../core/rng';
import type { BabbleMood } from '../../audio/types';
import type { GirlId } from '../../family/types';
import type { CueType } from './events';
import type { DriveEvent } from '../../plan/types';

export interface Line {
  /** Who says it: a girl, 'girls' (a random girl, others may echo), or 'chris'. */
  who: GirlId | 'girls' | 'chris';
  text: string;
  mood: BabbleMood;
  style?: 'say' | 'shout' | 'sing';
}

const L = (who: Line['who'], text: string, mood: BabbleMood = 'normal', style?: Line['style']): Line => (style ? { who, text, mood, style } : { who, text, mood });

export const SPOT_LINES: Readonly<Record<DriveEvent, readonly Line[]>> = {
  crossingGuard: [L('girls', "It's Ms. Rosa! Hi, Ms. Rosa!", 'excited', 'shout'), L('girls', 'Crossing guard! Stop at the line!', 'excited')],
  geese: [L('girls', 'GEESE!!', 'excited', 'shout'), L('girls', 'Look! A goose parade!', 'excited'), L('girls', 'Honk honk! Geese!', 'excited', 'shout')],
  greenLights: [L('girls', "Green light! Hurry before it's red!", 'excited', 'shout'), L('girls', 'Go go go, green light!', 'excited')],
  sprinkler: [L('girls', 'SPRINKLER! Drive through it! Pleeease!', 'excited', 'shout'), L('girls', 'Sprinkler on the right! Wheee time!', 'excited')],
  jogger: [L('girls', 'A baby in a stroller! Awww!', 'normal'), L('girls', "There's a jogger, Daddy!", 'normal')],
  garbageTruck: [L('girls', 'GARBAGE TRUCK!!!', 'excited', 'shout'), L('girls', 'Can he honk? Can he honk?!', 'excited')],
  ball: [L('girls', 'Kids playing ball — careful!', 'normal'), L('girls', 'Ooh, they have a bouncy ball!', 'normal')],
  puddle: [L('girls', 'Giant puddle! SPLASH IT!', 'excited', 'shout'), L('girls', 'Puddle! Puddle! Puddle!', 'excited')],
};

export const CUE_LINES: Readonly<Partial<Record<CueType, readonly Line[]>>> = {
  guardThanks: [L('girls', 'Thank you, Ms. Rosa!', 'excited'), L('girls', 'Bye, Ms. Rosa!', 'excited')],
  guardTsk: [L('girls', 'Daaad! The line!', 'dramatic'), L('girls', 'Oopsie, Daddy!', 'normal')],
  geeseHurry: [L('girls', 'Excuse us, geese!', 'excited'), L('girls', 'Honk honk! Thank you, geese!', 'excited')],
  geeseFlap: [L('girls', 'Sorry, geese!', 'dramatic')],
  greenBonus: [L('girls', 'WE MADE IT!', 'excited', 'shout'), L('girls', 'Green light champion!', 'excited')],
  redWait: [L('girls', 'Red light… waiting… waiting…', 'sleepy'), L('girls', 'Red means stop! Good job, Daddy!', 'normal')],
  sprinklerSplash: [L('girls', 'WHEEEEE!', 'excited', 'shout'), L('girls', 'We got SPRINKLED!', 'excited', 'shout')],
  sprinklerMiss: [L('girls', 'Awww, we missed it!', 'dramatic')],
  joggerPass: [L('girls', 'Bye, baby! Bye!', 'excited'), L('girls', 'The baby waved at me!', 'excited')],
  joggerBye: [L('girls', 'Bye, jogger lady!', 'normal')],
  truckPass: [L('girls', 'He HONKED!! Best day ever!', 'excited', 'shout'), L('girls', 'Bye, garbage truck!!', 'excited', 'shout')],
  ballSaved: [L('girls', 'Nice stop, Daddy!', 'excited'), L('girls', 'Phew! Good braking!', 'normal')],
  ballBonk: [L('girls', 'BOING! Hee hee!', 'excited', 'shout'), L('girls', 'Oops! Sorry, ball!', 'dramatic')],
  puddleSplash: [L('girls', 'SPLASH!! Again! Again!', 'excited', 'shout'), L('girls', 'Best puddle EVER!', 'excited', 'shout')],
  puddleMiss: [L('girls', 'Awww, no splash!', 'dramatic')],
  bump: [L('girls', 'Whoa! Easy, Daddy!', 'dramatic'), L('girls', 'Oopsie!', 'normal'), L('chris', 'Oops! Sorry!', 'normal')],
  assist: [L('girls', 'Stop, stop, stop!', 'dramatic')],
  laneBlocked: [L('girls', 'Wait, Daddy! Not yet!', 'normal')],
  bayHint: [L('girls', "There's school! I see my classroom!", 'excited', 'shout'), L('girls', 'Drop-off lane! On the right!', 'excited')],
  bayAssist: [L('girls', 'This way, Daddy! Drop-off lane!', 'excited')],
};

export const IDLE_LINES: readonly Line[] = [
  L('girls', '♪ The wheels on the van go round and round ♪', 'sing', 'sing'),
  L('girls', '♪ School day, school day, la la la! ♪', 'sing', 'sing'),
  L('addy', 'Are we there yet?', 'normal'),
  L('ellie', "Heidi's in my bubble!", 'dramatic'),
  L('heidi', "It's a SHARED bubble!", 'normal'),
  L('girls', 'I can see a doggy!', 'excited'),
  L('girls', 'Can we get pancakes on Saturday?', 'normal'),
  L('girls', 'My hair looks SO good today.', 'normal'),
  L('girls', 'Daddy, turn up the song!', 'excited'),
  L('chris', 'Who has their lunch? Everybody?', 'normal'),
  L('girls', "I'm gonna be first in line!", 'excited'),
];

export const START_LINES: readonly Line[] = [L('girls', 'School run! School run!', 'excited', 'shout'), L('chris', 'Here we go, buttercups!', 'normal')];

export const ARRIVE_LINE: Line = L('girls', 'BYE! LOVE YOU!', 'excited', 'shout');
export const CHRIS_BYE: Line = L('chris', 'Love you! Have a great day!', 'normal');
export const HURRY_LINE: Line = L('girls', 'Almost there! Go go go!', 'excited', 'shout');

/** Picks lines without immediate repeats. */
export class Chatter {
  private last = '';
  constructor(private readonly rng: Rng) {}

  pick(lines: readonly Line[] | undefined): Line | null {
    if (!lines || lines.length === 0) return null;
    let l = lines[Math.floor(this.rng.next() * lines.length)]!;
    if (lines.length > 1 && l.text === this.last) l = lines[(lines.indexOf(l) + 1) % lines.length]!;
    this.last = l.text;
    return l;
  }

  /** Resolve 'girls' to one girl (seeded). */
  speaker(l: Line): GirlId | 'chris' {
    if (l.who !== 'girls') return l.who;
    const g: readonly GirlId[] = ['addy', 'ellie', 'heidi'];
    return g[Math.floor(this.rng.next() * 3)]!;
  }
}
