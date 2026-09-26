// ACT V — the school run (docs/GDD.md §8): load the girls into the minivan, drive the neighbourhood to Maple Grove
// Elementary through the morning's wholesome events, drop-off, "BYE! LOVE YOU!".
import type { Activity } from '../types';
import { DriveActivity } from './activity';

export const create = (): Activity => new DriveActivity();
