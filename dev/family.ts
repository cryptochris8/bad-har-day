// Family dev page: the five family members + the dog in a lineup (names under them).
// URL params:
//   outfit=sleep|day · expr=<Expression> · action=<Action> (looping unless loop=0) · pose=<Pose>
//   seat=<m> · side=-1..1 (lie) · hold=<HoldKind> · turn=<deg> · focus=<id|dog> · dog=<DogAction>
//   dogpose=<DogPose> · mood=excited|calm|sleepy · walk=1|<m/s> · t=<s> (step then freeze)
//   emote=<Emote> · sleepy=0..1 · look=cam|x,y,z · only=chris,addy,… · extras=1 (school-run extras row)
//   glasses=1 · beard=none|stubble|beard · skin=0..7 · coat=<DogCoat>
import * as THREE from 'three';
import { createHarness } from './harness';
import { createExtra, createFamily, sanitizeLooks } from '../src/family';
import { PAL } from '../src/render/palette';
import { countTriangles } from '../src/render/models/builder';
import type { Action, Character, DogAction, DogPose, Emote, Expression, HoldKind, MemberId, Outfit, Pose } from '../src/family/types';
import { MEMBERS } from '../src/family/types';

const h = createHarness({ ground: 7, camera: { pos: [0.3, 1.3, 6.2], look: [0.3, 0.78, 0], fov: 36 } });
const q = h.params;
const num = (k: string, d: number) => {
  const v = Number(q.get(k));
  return q.has(k) && Number.isFinite(v) ? v : d;
};

const looks = sanitizeLooks({});
if (q.get('glasses') === '1') for (const id of MEMBERS) looks.members[id].glasses = true;
const beard = q.get('beard');
if (beard === 'none' || beard === 'stubble' || beard === 'beard') looks.members.chris.beard = beard;
if (q.has('skin')) for (const id of MEMBERS) looks.members[id].skin = num('skin', 1);
if (q.get('coat')) looks.dog.coat = q.get('coat') as typeof looks.dog.coat;
const fam = createFamily(sanitizeLooks(looks));

const only = q.get('only')?.split(',').filter(Boolean) ?? null;
const X: Record<MemberId, number> = { chris: -1.75, ashley: -0.85, addy: 0.05, ellie: 0.8, heidi: 1.52 };
const shown: Character[] = [];
for (const id of MEMBERS) {
  const c = fam.member(id);
  if (only && !only.includes(id)) continue;
  c.root.position.set(X[id], 0, 0);
  h.scene.add(c.root);
  shown.push(c);
}
const dog = fam.dog;
const showDog = !only || only.includes('dog');
if (showDog) {
  dog.root.position.set(2.35, 0, 0.15);
  dog.root.rotation.y = -0.35;
  h.scene.add(dog.root);
}

// Optional extras row behind.
const extras: Character[] = [];
if (q.get('extras') === '1') {
  const kinds = ['crossingGuard', 'jogger', 'teacher', 'kid', 'neighbor'] as const;
  kinds.forEach((k, i) => {
    const e = createExtra(k, 11 + i);
    e.root.position.set(-1.8 + i * 0.95, 0, -1.4);
    h.scene.add(e.root);
    extras.push(e);
  });
}

// Params.
const turn = (num('turn', 0) * Math.PI) / 180;
for (const c of [...shown, ...extras]) c.root.rotation.y += turn;
if (showDog && q.has('turn')) dog.root.rotation.y = turn;
const outfit = q.get('outfit') as Outfit | null;
if (outfit) for (const c of shown) c.setOutfit(outfit);
const pose = q.get('pose') as Pose | null;
const seat = q.has('seat') ? num('seat', 0.45) : undefined;
if (pose) {
  for (const c of [...shown, ...extras]) {
    c.setPose(pose, { seatHeight: seat, side: num('side', 0) });
    // Simple furniture so poses read.
    const sh = seat ?? (pose === 'lie' ? 0.5 : c.height < 1.5 ? 0.4 : 0.45);
    if (pose === 'sit' || pose === 'drive') {
      const stool = new THREE.Mesh(new THREE.BoxGeometry(0.5, sh, 0.46), new THREE.MeshToonMaterial({ color: PAL.woodWarm }));
      stool.position.set(0, sh / 2, -0.22);
      c.root.add(stool);
    } else if (pose === 'lie') {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(0.85, sh, c.height + 0.35), new THREE.MeshToonMaterial({ color: PAL.bedWhite }));
      bed.position.set(0, sh / 2, 0);
      c.root.add(bed);
    }
  }
}
if (q.get('hair') === '0') for (const c of shown) if (c.hair) c.hair.root.visible = false;
const hold = q.get('hold') as HoldKind | null;
if (hold) for (const c of shown) c.setHold(hold);
const expr = q.get('expr') as Expression | null;
if (expr) for (const c of shown) c.setExpression(expr);
const action = q.get('action') as Action | null;
const loop = q.get('loop') !== '0';
if (action) for (const c of [...shown, ...extras]) c.play(action, { loop });
const walk = q.get('walk');
if (walk) {
  const sp = walk === '1' ? 1.2 : Number(walk);
  for (const c of [...shown, ...extras]) c.setMotion(sp);
  if (showDog) dog.setMotion(sp);
}
if (q.has('sleepy')) for (const c of shown) c.setSleepiness(num('sleepy', 0));
const emote = q.get('emote') as Emote | null;
if (emote) {
  for (const c of shown) c.emote(emote, 999);
  if (showDog) dog.emote(emote, 999);
}
const dogAction = q.get('dog') as DogAction | null;
if (dogAction) dog.play(dogAction, { loop });
const dogPose = q.get('dogpose') as DogPose | null;
if (dogPose) dog.setPose(dogPose);
const mood = q.get('mood');
if (mood === 'excited' || mood === 'calm' || mood === 'sleepy') dog.setMood(mood);
const look = q.get('look');
if (look) {
  const v = look === 'cam' ? null : look.split(',').map(Number);
  const target = v && v.length === 3 ? new THREE.Vector3(v[0], v[1], v[2]) : h.camera.position.clone();
  for (const c of shown) c.lookAt(target);
  if (showDog) dog.lookAt(target);
}

// Step to ?t= then freeze.
const tFreeze = q.has('t') ? num('t', 0) : -1;
const step = 1 / 60;
let simT = 0;
const tick = (dt: number) => {
  fam.update(dt);
  for (const e of extras) e.update(dt);
};
if (tFreeze >= 0) {
  while (simT < tFreeze - 1e-9) {
    tick(step);
    simT += step;
  }
} else tick(0.016);

// Focus framing (close-up on a head).
const focus = q.get('focus');
if (focus && !q.has('cam')) {
  const target = focus === 'dog' ? dog.socket('head') : shown.find((c) => c.id === focus)?.socket('head');
  if (target) {
    const p = new THREE.Vector3();
    target.getWorldPosition(p);
    const dist = focus === 'dog' ? 0.95 : 1.05;
    const dir = new THREE.Vector3(Math.sin(turn) * 0 + 0, 0.08, 1).normalize();
    h.frame([p.x + dir.x * dist, p.y + dir.y * dist, p.z + dir.z * dist], [p.x, p.y - 0.02, p.z], 30);
  }
}

// Name labels.
const labels: { el: HTMLDivElement; obj: THREE.Object3D }[] = [];
const mkLabel = (text: string, obj: THREE.Object3D) => {
  const el = document.createElement('div');
  el.className = 'label';
  el.textContent = text;
  document.body.appendChild(el);
  labels.push({ el, obj });
};
if (q.get('labels') !== '0' && !focus) {
  for (const c of shown) mkLabel(c.id[0]!.toUpperCase() + c.id.slice(1), c.root);
  if (showDog) mkLabel(dog.name, dog.root);
}
const proj = { x: 0, y: 0, visible: false };
const tmp = new THREE.Vector3();

// Stats.
const tri = shown.map((c) => `${c.id} ${(countTriangles(c.root, true) / 1000).toFixed(1)}k`).join(' · ');
h.setInfo(`${tri}${showDog ? ` · dog ${(countTriangles(dog.root, true) / 1000).toFixed(1)}k` : ''}`);

h.onUpdate((dt) => {
  if (tFreeze < 0) tick(dt);
  else tick(0);
  for (const l of labels) {
    l.obj.getWorldPosition(tmp);
    tmp.y -= 0.02;
    h.renderer.projector.project(tmp, proj);
    l.el.style.left = `${proj.x}px`;
    l.el.style.top = `${proj.y + 6}px`;
    l.el.style.display = proj.visible ? 'block' : 'none';
  }
});
Object.assign(window.__DEV__ ?? {}, { family: fam, extras });
h.start();
window.__DEV__!.family = fam;
