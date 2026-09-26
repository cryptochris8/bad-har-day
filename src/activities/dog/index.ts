// TAKE THE DOG OUT — Act I free-roam chore (docs/GDD.md §4.1). See ./activity.ts.
import type { Activity } from '../types';
import { DogOut } from './activity';

export const create = (): Activity => new DogOut();
