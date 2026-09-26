// TAKE OUT THE TRASH — Act I free-roam chore (docs/GDD.md §4.4). See ./activity.ts.
import type { Activity } from '../types';
import { TakeOutTrash } from './activity';

export const create = (): Activity => new TakeOutTrash();
