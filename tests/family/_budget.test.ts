import { it } from 'vitest';
import { buildBones, B } from '../../src/family/skeleton';
import { buildMember } from '../../src/family/outfits';
import { memberSpec } from '../../src/family/spec';
import { DEFAULT_LOOKS } from '../../src/family/looks';
const names: Record<number, string> = {};
for (const [k, v] of Object.entries(B)) names[v as number] = k;
for (let i = 0; i < 10; i++) { names[B.faceL + i] = 'faceL' + i; names[B.faceR + i] = 'faceR' + i; names[B.mouth0 + i] = 'mouth' + i; }
it('breakdown', () => {
  for (const id of ['chris', 'addy'] as const) {
    const s = memberSpec(id);
    const rig = buildBones(s);
    const g = buildMember(id, s, DEFAULT_LOOKS.members[id], 'sleep', rig);
    const si = g.getAttribute('skinIndex');
    const sw = g.getAttribute('skinWeight');
    const tally = new Map<string, number>();
    for (let t = 0; t < si.count / 3; t++) {
      // dominant bone of first vertex
      let best = 0, bw = -1;
      for (let q = 0; q < 4; q++) { const w = sw.getComponent(t * 3, q); if (w > bw) { bw = w; best = si.getComponent(t * 3, q); } }
      const n = names[best] ?? String(best);
      const key = n.startsWith('mouth') ? 'mouths' : n.startsWith('face') ? 'face:' + n.slice(5) : n;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    console.log(id, si.count / 3, JSON.stringify([...tally.entries()].sort((a, b) => b[1] - a[1])));
  }
});
