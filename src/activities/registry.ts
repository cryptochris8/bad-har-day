// Every activity of the morning (integration): task-list label, icon, completion banner, Act I station.
import type { ActivityInfo } from './types';
import type { ActivityId } from '../plan/types';
import { create as dog } from './dog';
import { create as coffee } from './coffee';
import { create as lunch } from './lunch';
import { create as trash } from './trash';
import { create as dishes } from './dishes';
import { create as wake } from './wake';
import { create as hair } from './hair';
import { create as rush } from './rush';
import { create as drive } from './drive';

export const ACTIVITIES: Readonly<Record<ActivityId, ActivityInfo>> = {
  dog: { id: 'dog', label: 'Take the dog out', icon: 'dog', banner: 'DOG: WALKED', station: 'backDoorIn', prompt: 'Let the dog out', create: dog },
  coffee: { id: 'coffee', label: "Make Ashley's coffee", icon: 'coffee', banner: 'COFFEE: SECURED', station: 'coffeeMaker', prompt: "Make Ashley's coffee", create: coffee },
  lunch: { id: 'lunch', label: 'Pack the lunchboxes', icon: 'lunch', banner: 'LUNCHES: PACKED', station: 'lunchCounter', prompt: 'Pack the lunchboxes', create: lunch },
  trash: { id: 'trash', label: 'Take out the trash', icon: 'trash', banner: 'TRASH: OUT', station: 'kitchenTrash', prompt: 'Take out the trash', create: trash },
  dishes: { id: 'dishes', label: 'Do the dishes', icon: 'dishes', banner: 'DISHES: DONE', station: 'sink', prompt: 'Do the dishes', create: dishes },
  wake: { id: 'wake', label: 'Wake up the girls', icon: 'sun', banner: 'EVERYBODY: AWAKE', station: null, prompt: '', create: wake },
  hair: { id: 'hair', label: 'Brush three heads of hair', icon: 'blackBrush', banner: '', station: null, prompt: '', create: hair },
  rush: { id: 'rush', label: 'Get everyone out the door', icon: 'backpack', banner: 'EVERYBODY: READY', station: null, prompt: '', create: rush },
  drive: { id: 'drive', label: 'Drive to school', icon: 'car', banner: '', station: null, prompt: '', create: drive },
};

/** Quips when the clock runs out on an optional chore (docs/GDD.md §3). */
export const SKIP_QUIPS: Readonly<Partial<Record<ActivityId, string>>> = {
  dishes: 'The dishes will wait. They always do.',
  trash: 'The trash can hold one more day. Probably.',
  lunch: 'Lunch money it is!',
};
