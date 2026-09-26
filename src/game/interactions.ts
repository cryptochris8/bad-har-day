// Free-roam interaction points: the nearest enabled one within reach of the walker becomes the prompt;
// primary/secondary uses it. Enabled points with `marker` get a glowing world marker.
import type { Interactable, Interactions } from '../activities/types';
import type { GameControls } from '../input/types';
import type { PromptSpec } from '../ui/types';
import type { World } from '../world/types';

interface Entry {
  i: Interactable;
  marker: { move(at: { x: number; y: number; z: number }): void; remove(): void } | null;
}

/** Pure: index of the nearest in-reach candidate (−1 if none). */
export function nearestInReach(
  px: number,
  pz: number,
  items: readonly { at: { x: number; z: number }; radius?: number; enabled: boolean }[],
): number {
  let best = -1;
  let bestD = Infinity;
  items.forEach((it, idx) => {
    if (!it.enabled) return;
    const d = Math.hypot(it.at.x - px, it.at.z - pz);
    if (d <= (it.radius ?? 1.2) && d < bestD) {
      bestD = d;
      best = idx;
    }
  });
  return best;
}

export class InteractionsImpl implements Interactions {
  private readonly entries: Entry[] = [];
  private current: Entry | null = null;
  private lastPrompt: PromptSpec | null = null;
  /** The game disables prompts during activities that own the controls / cutscenes. */
  active = true;

  constructor(private readonly world: World) {}

  add(i: Interactable): () => void {
    const e: Entry = { i, marker: null };
    this.entries.push(e);
    return () => {
      const k = this.entries.indexOf(e);
      if (k >= 0) this.entries.splice(k, 1);
      e.marker?.remove();
      e.marker = null;
      if (this.current === e) this.current = null;
    };
  }

  clear(): void {
    for (const e of this.entries) e.marker?.remove();
    this.entries.length = 0;
    this.current = null;
  }

  /** Per frame. Returns the prompt to show (null = none). */
  update(px: number, pz: number, controls: GameControls, canUse: boolean): PromptSpec | null {
    const view = this.entries.map((e) => ({ at: e.i.at, radius: e.i.radius, enabled: this.active && (e.i.enabled?.() ?? true) }));
    // Markers follow enabled state.
    this.entries.forEach((e, k) => {
      const want = !!e.i.marker && view[k]!.enabled;
      if (want && !e.marker) e.marker = this.world.marker(e.i.at);
      else if (!want && e.marker) {
        e.marker.remove();
        e.marker = null;
      }
    });
    const idx = canUse ? nearestInReach(px, pz, view) : -1;
    this.current = idx >= 0 ? this.entries[idx]! : null;
    if (!this.current) {
      this.lastPrompt = null;
      return null;
    }
    const i = this.current.i;
    const slot = i.slot ?? 'primary';
    const used = slot === 'primary' ? controls.primaryPressed : controls.secondaryPressed;
    if (used) {
      this.current = null;
      this.lastPrompt = null;
      i.onUse();
      return null;
    }
    if (!this.lastPrompt || this.lastPrompt.text !== i.label || this.lastPrompt.slot !== slot) {
      this.lastPrompt = { text: i.label, slot, at: { x: i.at.x, y: (i.at.y ?? 0) + 1.9, z: i.at.z } };
    }
    return this.lastPrompt;
  }
}
