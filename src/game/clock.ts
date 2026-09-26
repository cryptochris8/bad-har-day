// The morning's in-game clock (docs/GDD.md §3): minutes since midnight, runs at a per-act rate, never goes
// backwards, and can be CAPPED (required tasks hold it at the act's last minute — the "5:59 … 5:59 …" joke).
import type { GameClock } from '../activities/types';

/** 315 → "5:15 AM". */
export function clockLabel(minutes: number): string {
  const total = Math.floor(minutes + 1e-6);
  const h24 = Math.floor(total / 60) % 24;
  const m = ((total % 60) + 60) % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

export class GameClockImpl implements GameClock {
  mode: 'run' | 'hold' = 'hold';
  rate = 0.17;
  /** The clock never passes this minute (Infinity = no cap). */
  cap = Number.POSITIVE_INFINITY;
  private m: number;

  constructor(start: number) {
    this.m = start;
  }

  get minutes(): number {
    return this.m;
  }

  /** True while the clock sits at its cap (the HUD blinks it). */
  get atCap(): boolean {
    return Number.isFinite(this.cap) && this.m >= this.cap - 1e-6;
  }

  /** Advance by real seconds (only in 'run'). */
  update(dt: number): void {
    if (this.mode !== 'run' || !(dt > 0)) return;
    this.m = Math.min(this.cap, this.m + this.rate * dt);
  }

  advance(minutes: number): void {
    if (minutes > 0) this.m = Math.min(this.cap, this.m + minutes);
  }

  /** Jump to a minute if it is later (acts starting at a fixed time). Ignores the cap. */
  jumpTo(minutes: number): void {
    if (minutes > this.m) this.m = minutes;
  }

  label(): string {
    return clockLabel(this.m);
  }
}
