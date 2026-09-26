// Traffic-light bulbs (dynamic): one unlit vertex-coloured mesh for every bulb on the route plus one additive
// halo mesh. setLight(i, colour) rewrites the colour attribute (on = bright, off = dark lens; halos off = black).
import * as THREE from 'three';
import { PAL } from '../../render/palette';
import { linear } from '../../render/models/builder';
import { basicMaterial } from '../../render/models/materials';
import { SIGNAL } from './furniture';
import { INTERSECTIONS } from './layout';

export type SignalColor = 'red' | 'yellow' | 'green';

const ORDER: readonly SignalColor[] = ['red', 'yellow', 'green'];
const ON: Record<SignalColor, number> = { red: PAL.signalRedOn, yellow: PAL.signalYellowOn, green: PAL.signalGreenOn };
const OFF: Record<SignalColor, number> = { red: PAL.signalRedOff, yellow: PAL.signalYellowOff, green: PAL.signalGreenOff };

export interface Signals {
  readonly group: THREE.Group;
  set(index: number, color: SignalColor): void;
  get(index: number): SignalColor;
  update(t: number): void;
  dispose(): void;
}

export function buildSignals(): Signals {
  const group = new THREE.Group();
  group.name = 'route:signals';
  const bulbPos: number[] = [];
  const bulbCol: number[] = [];
  const haloPos: number[] = [];
  const haloCol: number[] = [];
  /** [light][lamp] → vertex ranges. */
  const ranges: { b0: number; b1: number; h0: number; h1: number; c: SignalColor }[][] = [];
  const disc = new THREE.CircleGeometry(0.135, 14).toNonIndexed();
  const halo = new THREE.CircleGeometry(0.34, 16).toNonIndexed();
  const haloW: number[] = [];
  const dp = disc.getAttribute('position');
  const hp = halo.getAttribute('position');
  INTERSECTIONS.forEach((c, li) => {
    const list: (typeof ranges)[number] = [];
    const z = -(c + SIGNAL.headS) + 0.19;
    for (let lamp = 0; lamp < 3; lamp++) {
      const col = ORDER[lamp]!;
      const y = SIGNAL.headY + 0.37 - lamp * 0.37;
      const b0 = bulbPos.length / 3;
      const h0 = haloPos.length / 3;
      for (const hx of SIGNAL.headXs) {
        for (let i = 0; i < dp.count; i++) bulbPos.push(hx + dp.getX(i), y + dp.getY(i), z);
        for (let i = 0; i < hp.count; i++) {
          haloPos.push(hx + hp.getX(i), y + hp.getY(i), z + 0.03);
          haloW.push(Math.hypot(hp.getX(i), hp.getY(i)) < 1e-3 ? 1 : 0);
        }
      }
      list.push({ b0, b1: bulbPos.length / 3, h0, h1: haloPos.length / 3, c: col });
      void li;
    }
    ranges.push(list);
  });
  disc.dispose();
  halo.dispose();
  for (let i = 0; i < bulbPos.length / 3; i++) bulbCol.push(0, 0, 0);
  for (let i = 0; i < haloPos.length / 3; i++) haloCol.push(0, 0, 0);
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bulbPos, 3));
  const bcol = new THREE.Float32BufferAttribute(bulbCol, 3);
  bg.setAttribute('color', bcol);
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(haloPos, 3));
  const hcol = new THREE.Float32BufferAttribute(haloCol, 3);
  hg.setAttribute('color', hcol);
  const bulbs = new THREE.Mesh(bg, basicMaterial(0xffffff, { vertexColors: true }));
  bulbs.name = 'route:bulbs';
  const halos = new THREE.Mesh(hg, basicMaterial(0xffffff, { vertexColors: true, additive: true }));
  halos.name = 'route:halos';
  halos.renderOrder = 4;
  group.add(bulbs, halos);
  const state: SignalColor[] = INTERSECTIONS.map(() => 'green');

  const paint = (li: number) => {
    const list = ranges[li];
    if (!list) return;
    for (const r of list) {
      const on = state[li] === r.c;
      const [cr, cg, cb] = linear(on ? ON[r.c] : OFF[r.c]);
      for (let v = r.b0; v < r.b1; v++) bcol.setXYZ(v, cr, cg, cb);
      const [hr, hgc, hb] = on ? linear(ON[r.c]) : [0, 0, 0];
      for (let v = r.h0; v < r.h1; v++) {
        const k = (haloW[v] ?? 0) * 0.7;
        hcol.setXYZ(v, hr! * k, hgc! * k, hb! * k);
      }
    }
    bcol.needsUpdate = true;
    hcol.needsUpdate = true;
  };
  state.forEach((_c, i) => paint(i));

  return {
    group,
    set(index, color) {
      if (index < 0 || index >= state.length) return;
      if (color !== 'red' && color !== 'yellow' && color !== 'green') return;
      if (state[index] === color) return;
      state[index] = color;
      paint(index);
    },
    get: (index) => state[index] ?? 'green',
    update(t) {
      // the lit lamps breathe a little
      halos.scale.setScalar(1);
      halos.position.z = Math.sin(t * 6) * 0.0005;
    },
    dispose() {
      bg.dispose();
      hg.dispose();
      group.removeFromParent();
    },
  };
}
