// ─────────────────────────────────────────────────────────────────────────────
// Hair module entry (implements src/hair/types.ts): the girls' long, thick, brushable
// stylised hair (HairRig) and the four brushes, incl. THE BLACK BRUSH.
//
// Also exports the pure hair-space helpers (cell mapping, field sampling, stroke sweeps,
// brush falloffs) so the brushing activity and the rig agree on one definition.
// ─────────────────────────────────────────────────────────────────────────────
import { GirlHairRig } from './rig';
import type { HairBuildOpts, HairRig } from './types';

export { createBrush } from './brush';
export {
  brushFalloffU,
  brushFalloffV,
  cellAt,
  cellCenter,
  cellIndex,
  colOf,
  fieldMax,
  fieldMean,
  rowOf,
  sampleBilinear,
  sampleLock,
  smoothFraction,
  sweepCells,
} from './space';
export { GirlHairRig } from './rig';
export { brushPoseOnHair, BRUSH_HEAD_OFFSET, BRUSH_TIP_DEPTH } from './place';

/** Build a girl's hair rig. Parent `rig.root` to the head socket (head space: origin at the head centre, +Z face). */
export function createGirlHair(opts: HairBuildOpts): HairRig {
  return new GirlHairRig(opts);
}
