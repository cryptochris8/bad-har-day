// PLACEHOLDER activity (integration) — keeps the whole morning playable end-to-end until the real activity lands.
// Frames the relevant spot, shows what the activity will be, and finishes on primary / click / after a while.
import type { Activity, ActivityContext } from './types';
import type { ActivityId, ActivityResult } from '../plan/types';
import type { AnchorId } from '../world/types';
import type { ControlScheme, GameControls } from '../input/types';

const FOCUS: Record<ActivityId, AnchorId> = {
  dog: 'backDoorIn',
  coffee: 'coffeeMaker',
  lunch: 'lunchCounter',
  trash: 'kitchenTrash',
  dishes: 'sink',
  wake: 'bedsideAddy',
  hair: 'vanity',
  rush: 'frontDoorIn',
  drive: 'carDriver',
};

const SCHEME: ControlScheme = { move: 'none', moveLabel: '', primary: { label: 'DONE', icon: 'done' }, secondary: null, alt: null };

export function placeholder(id: ActivityId, title: string): () => Activity {
  return () => {
    let ctx: ActivityContext | null = null;
    let t = 0;
    let finished = false;
    const finish = () => {
      finished = true;
    };
    return {
      id,
      start(c) {
        ctx = c;
        const a = c.world.anchor(FOCUS[id]);
        c.walker.enabled = false;
        c.camera.shot({ position: { x: a.x, y: 2.6, z: a.z + 3.2 }, target: { x: a.x, y: 1, z: a.z - 0.4 }, fov: 40 });
        c.ui.instruction(title, 'Placeholder — this activity is being built. Press to continue.');
        c.pointer.enable({ cursor: 'none' });
        if (id === 'wake') {
          for (const g of ['addy', 'ellie', 'heidi'] as const) {
            const girl = c.family.girl(g);
            girl.setPose('stand');
            girl.emote(null);
            c.state.girlsUp[g] = true;
          }
          c.world.bed('addy').setBlanket('thrown');
          c.world.bed('ellie').setBlanket('thrown');
          c.world.bed('heidi').setBlanket('thrown');
          void c.npcs.walkTo(c.family.addy, c.world.anchor('seatAddy'));
          void c.npcs.walkTo(c.family.ellie, c.world.anchor('seatEllie'));
          void c.npcs.walkTo(c.family.heidi, c.world.anchor('seatHeidi'));
          c.family.ashley.setPose('stand');
          c.family.ashley.emote(null);
          void c.npcs.walkTo(c.family.ashley, c.world.anchor('ashleySpot'));
        }
      },
      update(dt: number, controls: GameControls) {
        if (!ctx || finished) return;
        t += dt;
        if (controls.primaryPressed || ctx.pointer.pressed || t > 25) finish();
      },
      controls: () => SCHEME,
      get done() {
        return finished;
      },
      result(): ActivityResult {
        return { stars: 2, flags: [] };
      },
      dispose() {
        ctx?.ui.instruction(null);
        ctx?.pointer.disable();
      },
      skip: finish,
    };
  };
}
