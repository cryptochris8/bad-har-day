// ─────────────────────────────────────────────────────────────────────────────
// ACT III — THE BLACK BRUSH (docs/GDD.md §6): the Black Brush Battle, close-up brushing of three heads of hair,
// and MOM'S HAIR CHECK. Built on the hair rig (src/hair) + the pure rules/session in this folder.
//
//   setup    the girls hurry into the bathroom and hop onto their stools (stool1..3, facing the mirror)
//   battle   four brushes on the counter; THE BLACK BRUSH reveal (push-in, glow, choir, banner); the scramble
//   choice   "WHO GETS THE BLACK BRUSH FIRST?" (the grabber pre-selected)
//   brushing close-up behind the focused girl (her face in a real mirror reflection); pointer / touch / virtual
//            cursor strokes; ends-first + gentle-speed rules; focus switching; passing the black brush;
//            the others brush themselves; "I'M DONE!"s
//   mom      MOM — THE HAIR INSPECTOR: approve (≥ 95 %) or "I'll just finish it…" (lovingly, super fast)
//   end      shiny hair, the girls standing in the bathroom
// Every cutscene is an async script guarded by a generation token so skip()/dispose() cancel it cleanly.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import type { Activity, ActivityContext } from '../types';
import type { ActivityResult } from '../../plan/types';
import { ACTS } from '../../plan/types';
import type { ControlScheme, GameControls } from '../../input/types';
import { DISPLAY_NAME, GIRLS, type Character, type GirlId } from '../../family/types';
import { brushPoseOnHair, createBrush } from '../../hair';
import type { GirlHairRig } from '../../hair/rig';
import type { Brush, BrushKind, HairRig } from '../../hair/types';
import { CELL_GLOW, hairSpriteMaterial } from '../../hair/material';
import { PAL } from '../../render/palette';
import type { CameraGoal, Vec3Like } from '../../render/types';
import type { Portrait, PortraitRow } from '../../ui/types';
import { VANITY_STOOL_H, type AnchorId } from '../../world/types';
import { CONDITION_INFO, bedheadFor } from './conditions';
import { effectiveFov } from '../../render/camera';
import { colOf, rowOf } from '../../hair/space';
import { HairGuides, type CellHint } from './guides';
import { MirrorReflection } from './mirror';
import { COUNTER_LAYOUT, SHOT_SIDES, brushingShot, fitScale, inspectBackShot, inspectShot, magnifier, wideShot } from './props';
import { APPROVE_T, CLEAR_T, KNOT_T, displayPercent, guideRow, hairStars, momVerdict, speedBand, type SnagReason } from './rules';
import { HairSession } from './session';

type Phase = 'setup' | 'battle' | 'choice' | 'brushing' | 'mom' | 'end';

const STOOL: Readonly<Record<GirlId, AnchorId>> = { addy: 'stool1', ellie: 'stool2', heidi: 'stool3' };
const COLOR: Readonly<Record<GirlId, string>> = { addy: 'var(--bhd-addy)', ellie: 'var(--bhd-ellie)', heidi: 'var(--bhd-heidi)' };
const ACT3 = ACTS[2]!;

const SCHEME_POINTER: ControlScheme = {
  move: 'none',
  moveLabel: '',
  primary: null,
  secondary: { label: 'PASS', icon: 'pass' },
  alt: { label: 'DONE', icon: 'done' },
};
const SCHEME_PAD: ControlScheme = {
  move: 'xy',
  moveLabel: 'AIM',
  primary: { label: 'BRUSH', icon: 'brush', hold: true },
  secondary: { label: 'PASS', icon: 'pass' },
  alt: { label: 'DONE', icon: 'done' },
};

const HANDOFF_LINES = ['Fiiine.', 'Take good care of her.', 'Be gentle with her!', "I'll be back for you…", 'Nooo, my precious…'];
const GRAB_LINES_OTHERS = ['Hey!', 'I called it!', 'No fair!'];
const GULP_LINES = ['Uh-oh.', 'Act natural!', 'Is that… MOM?'];

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const realNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ndc = new THREE.Vector2();

interface GirlStage {
  id: GirlId;
  c: Character;
  rig: GirlHairRig;
  /** Stool anchor (root at the seat front, facing −Z). */
  stool: Vec3Like;
  /** Smoothed seated head centre (camera framing). */
  head: THREE.Vector3;
  seated: boolean;
  startMean: number;
  commitT: number;
  /** Self-brush wobble phase. */
  wob: number;
  eekT: number;
  /** Seconds left of a look over her shoulder (snag / delight). */
  lookT: number;
  lastSmooth: number;
}

class HairActivity implements Activity {
  readonly id = 'hair' as const;
  private ctx: ActivityContext | null = null;
  private phase: Phase = 'setup';
  private finished = false;
  private gen = 0;
  private session: HairSession | null = null;
  private readonly stages = new Map<GirlId, GirlStage>();
  private readonly brushes = new Map<BrushKind, Brush>();
  private mirror: MirrorReflection | null = null;
  private grabber: GirlId = 'addy';
  private momEarly = false;
  private momStarted = false;
  /** Countdown to Mom once everyone is confirmed done (s), −1 = not called. */
  private momCallT = -1;
  /** "Everyone says they're done — call Mom?" was offered. */
  private askedMom = false;
  private warned = false;
  private guides: HairGuides | null = null;
  private readonly goalCam = new THREE.PerspectiveCamera();
  private mirrorPos = new THREE.Vector3();
  private mirrorNrm = new THREE.Vector3(0, 0, 1);
  private mirrorHalf = { w: 1.1, h: 0.46 };
  /** Pad/keyboard hint sequence: 0 = brush prompt, 1 = switch prompt, 2 = none. */
  private hintStage = 0;
  private hintPromptT = 0;
  /** Real (wall-clock) time of the last applied stroke segment — stroke speed never uses capped game time. */
  private lastApplyReal = 0;
  /**
   * Raw pointer path since the last frame (clientX, clientY, time ms): mouse/touch strokes are applied along every
   * event, not just one sample per frame — strokes stay exact on slow devices / low frame rates.
   */
  private readonly evBuf = new Float64Array(3 * 128);
  private evCount = 0;
  private evDown = false;
  private evCanvas: HTMLElement | null = null;
  private readonly onPtrEvent = (e: Event): void => {
    if (this.phase !== 'brushing' || this.choiceOpen) return;
    const ev = e as PointerEvent;
    if (ev.type === 'pointerdown') {
      this.evCount = 0;
      this.evDown = true;
    } else if (!this.evDown && !this.pressing) return; // only the path of a pressed stroke matters
    if (this.evCount >= 128) return;
    const o = this.evCount * 3;
    this.evBuf[o] = ev.clientX;
    this.evBuf[o + 1] = ev.clientY;
    this.evBuf[o + 2] = realNow();
    this.evCount++;
  };
  /** Dev stats: stroke segments applied, snags by reason, tangle removed. */
  private readonly stats = { segments: 0, ends: 0, speed: 0, removed: 0, downs: 0, misses: 0, stuckFrames: 0, lastSpeed: 0, maxSpeed: 0, dvSum: 0 };
  private choiceOpen = false;
  private readonly inspected = new Map<GirlId, { smooth: number; approved: boolean }>();
  /** Dev/e2e: which girl Mom is on and what she's doing. */
  private momStep = '';
  private readonly ray = new THREE.Raycaster();
  private camGoal: CameraGoal = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, fov: 42 };
  private camStiff = 4;
  private whipT = 0;
  private time = 0;
  private portraitT = 0;
  private hintT = 0;
  private firstStroke = true;
  private toastT = 0;

  // brushing state
  private pressing = false;
  private strokeStartV = 0;
  private lastU = 0.5;
  private lastV = 0.8;
  private lastT = 0;
  private accDt = 0;
  private stuckT = 0;
  private stuckU = 0;
  private stuckV = 0;
  private hoverU = 0.5;
  private hoverV = 0.85;
  private speedS = 0;
  private toolLift = 0.05;
  private stickX = 0;
  private stickY = 0;
  private virtualPlaced = false;
  private passing = 0;
  private loop: ReturnType<ActivityContext['audio']['loop']> | null = null;
  private trail: ReturnType<ActivityContext['fx']['trail']> | null = null;
  private readonly toolHead = new THREE.Object3D();
  private trailBand: 'slow' | 'good' | 'fast' | '' = '';
  private glow: THREE.Mesh | null = null;
  private magnifierMesh: THREE.Mesh | null = null;

  // ── lifecycle ─────────────────────────────────────────────────────────────

  start(ctx: ActivityContext): void {
    this.ctx = ctx;
    ctx.walker.enabled = false;
    ctx.hud.objective = 'Hair time!';
    const plan = ctx.plan;
    this.grabber = GIRLS.includes(plan.blackBrushGrabber) ? plan.blackBrushGrabber : 'addy';

    // Girls, rigs, stools.
    let cols = 9;
    let rows = 4;
    for (const g of GIRLS) {
      const c = ctx.family.girl(g);
      const rig = c.hair as GirlHairRig | null;
      if (!rig) continue;
      cols = rig.cols;
      rows = rig.rows;
      const a = ctx.world.anchor(STOOL[g]);
      const hp = c.socket('head').getWorldPosition(v3());
      this.stages.set(g, { id: g, c, rig, stool: { x: a.x, y: 0, z: a.z }, head: hp, seated: false, startMean: 0, commitT: 0, wob: GIRLS.indexOf(g) * 2.1, eekT: 0, lookT: 0, lastSmooth: 0 });
    }
    const session = new HairSession({ girls: GIRLS, plan: plan.hair, holder: this.grabber, backup: plan.backupBrush, cols, rows });
    this.session = session;
    for (const st of this.stages.values()) {
      const s = session.g[st.id];
      st.startMean = s.startMean;
      st.lastSmooth = session.smooth(st.id);
      st.rig.tangle.set(s.field);
      st.rig.commit();
      st.rig.setBedhead(CONDITION_INFO[s.condition].bedhead);
      st.rig.setShine(0.35);
      st.rig.setKnotMarkers('off');
      st.rig.setBrush(null);
    }

    // The four brushes on the vanity counter (THE BLACK BRUSH in the middle).
    const counter = ctx.world.fixtures.vanity.counter.getWorldPosition(v3());
    for (const l of COUNTER_LAYOUT) {
      const b = createBrush(l.kind);
      b.root.position.set(counter.x + l.dx, counter.y + (l.kind === 'pink' ? 0.03 : 0.012), counter.z + 0.02);
      b.root.rotation.set(-Math.PI / 2, 0, l.yaw);
      ctx.root.add(b.root);
      this.brushes.set(l.kind, b);
    }
    this.toolHead.position.set(0, 0.116, 0.035);

    // The mirror reflection (bathroom + family + our props + lights).
    try {
      const low = ctx.settings.quality === 'low';
      const m = new MirrorReflection(ctx.renderer, ctx.scene, ctx.world.fixtures.vanity.mirror, { width: low ? 448 : 640, height: low ? 224 : 320, hz: low ? 15 : 30 });
      const wr = ctx.world.root;
      for (const name of ['furniture:bath', 'walls0', 'walls1', 'walls2', 'walls3', 'floors', 'fixtures']) m.include(wr.getObjectByName(name));
      ctx.scene.traverse((o) => {
        if ((o as THREE.Light).isLight) m.includeOne(o);
      });
      for (const g of GIRLS) m.include(ctx.family.girl(g).root);
      m.include(ctx.family.ashley.root);
      m.include(ctx.root);
      this.mirror = m;
    } catch (e) {
      console.warn('[hair] mirror reflection unavailable', e);
      this.mirror = null;
    }

    const mm = ctx.world.fixtures.vanity.mirror;
    mm.updateWorldMatrix(true, false);
    this.mirrorPos.setFromMatrixPosition(mm.matrixWorld);
    this.mirrorNrm.set(0, 0, 1).transformDirection(mm.matrixWorld);
    mm.geometry.computeBoundingBox();
    const bb = mm.geometry.boundingBox;
    if (bb) this.mirrorHalf = { w: (bb.max.x - bb.min.x) / 2, h: (bb.max.y - bb.min.y) / 2 };
    this.guides = new HairGuides();
    const canvas = ctx.renderer.domElement as HTMLElement | undefined;
    if (canvas && typeof canvas.addEventListener === 'function') {
      this.evCanvas = canvas;
      for (const t of ['pointerdown', 'pointermove', 'pointerup'] as const) canvas.addEventListener(t, this.onPtrEvent, { passive: true });
    }

    if (import.meta.env?.DEV) (globalThis as unknown as { __BHD_HAIR__?: unknown }).__BHD_HAIR__ = this.debugApi();
    void this.run(++this.gen);
  }

  update(dt: number, controls: GameControls): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    try {
      if (dt <= 0) return;
      this.time += dt;
      const clicks = ctx.ui.takeClicks();
      for (const b of this.brushes.values()) b.update(dt);
      this.updateHeads(dt);
      if (this.phase === 'brushing') this.brushingUpdate(dt, controls, clicks);
      if (this.phase === 'brushing' || this.phase === 'mom') this.commitAll(dt);
      if (this.glow) this.glow.visible = this.phase === 'mom';
      if (this.phase !== 'setup' && this.phase !== 'choice' && this.mirror) this.mirror.update(dt, ctx.camera.camera);
      this.portraitT -= dt;
      if (this.portraitT <= 0 && this.phase === 'brushing') {
        this.portraitT = 0.12;
        ctx.ui.portraits(this.portraitRow());
      }
    } catch (e) {
      console.error('[hair] update error', e);
    }
  }

  controls(): ControlScheme | null {
    if (this.phase !== 'brushing' || !this.ctx) return null;
    return this.ctx.input.lastDevice === 'touch' ? SCHEME_POINTER : this.ctx.input.lastDevice === 'keyboard' || this.ctx.input.lastDevice === 'gamepad' ? SCHEME_PAD : SCHEME_POINTER;
  }

  get done(): boolean {
    return this.finished;
  }

  result(): ActivityResult {
    const flags: string[] = [];
    const smooth: number[] = [];
    let solo = 0;
    for (const g of GIRLS) {
      const r = this.inspected.get(g);
      const s = r?.smooth ?? this.session?.smooth(g) ?? 0.8;
      smooth.push(s);
      if (r?.approved) {
        flags.push(`approved:${g}`, `solo:${g}`);
        solo++;
      } else flags.push(`mom:${g}`);
    }
    return { stars: hairStars({ smooth, solo, early: this.momEarly }), flags };
  }

  dispose(): void {
    const ctx = this.ctx;
    this.gen++;
    if (!ctx) return;
    try {
      this.stopBrushFx();
      if (this.evCanvas) for (const t of ['pointerdown', 'pointermove', 'pointerup'] as const) this.evCanvas.removeEventListener(t, this.onPtrEvent);
      this.evCanvas = null;
      this.guides?.dispose();
      this.guides = null;
      this.mirror?.dispose();
      this.mirror = null;
      for (const b of this.brushes.values()) b.dispose();
      this.brushes.clear();
      this.magnifierMesh?.removeFromParent();
      for (const st of this.stages.values()) {
        st.rig.setBrush(null);
        st.rig.setKnotMarkers('off');
        st.c.setHold('none');
        if (st.c.pose !== 'stand') st.c.setPose('stand');
      }
      ctx.family.ashley.setHold('none');
      ctx.ui.portraits(null);
      ctx.ui.instruction(null);
      ctx.ui.prompt(null);
      ctx.pointer.disable();
      ctx.clock.mode = 'run';
      ctx.hud.objective = null;
    } catch (e) {
      console.error('[hair] dispose error', e);
    }
    const g = globalThis as unknown as { __BHD_HAIR__?: unknown };
    if (g.__BHD_HAIR__) delete g.__BHD_HAIR__;
  }

  /** Autopilot / debug: finish now with a plausible result and the same end state. */
  skip(): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    this.gen++;
    if (this.choiceOpen) ctx.ui.handleMenuActions(['confirm']); // resolve the open choice with its default
    const session = this.session;
    for (const st of this.stages.values()) {
      const plan = ctx.plan.hair[st.id];
      const own = session ? session.smooth(st.id) : 0.7;
      // A plausible morning (seeded): some girls pass Mom's check on their own, some get a loving assist.
      const solo = ctx.rng.chance(0.55);
      const smooth = Math.min(1, Math.max(own, solo ? ctx.rng.range(0.955, 1) : Math.min(0.94, plan.doneAt + ctx.rng.range(0.02, 0.1))));
      const approved = momVerdict(smooth) === 'approved';
      this.inspected.set(st.id, { smooth, approved });
    }
    if (session) session.g[session.holder].blackSeconds += 45;
    this.writeState();
    this.finale(true);
  }

  // ── scripts ───────────────────────────────────────────────────────────────

  private alive(gen: number): boolean {
    return gen === this.gen && !this.finished && !!this.ctx;
  }

  private async run(gen: number): Promise<void> {
    try {
      await this.setupScript(gen);
      if (!this.alive(gen)) return;
      await this.battleScript(gen);
      if (!this.alive(gen)) return;
      this.beginBrushing();
    } catch (e) {
      console.error('[hair] script error', e);
      if (this.alive(gen)) this.beginBrushing();
    }
  }

  private async setupScript(gen: number): Promise<void> {
    const ctx = this.ctx!;
    this.phase = 'setup';
    const vanity = ctx.world.anchor('vanity');
    const stoolZ = ctx.world.anchor('stool2').z;
    ctx.camera.shot({ position: { x: vanity.x + 1.25, y: 2.2, z: stoolZ + 2.75 }, target: { x: vanity.x - 0.1, y: 0.9, z: stoolZ - 0.4 }, fov: 48 }, 100);
    const door = ctx.world.anchor('bathDoor');
    const arrivals: Promise<void>[] = [];
    let i = 0;
    for (const st of this.stages.values()) {
      const c = st.c;
      c.emote(null);
      c.setPose('stand');
      c.setHold('none');
      c.setExpression('happy');
      c.setOutfit('sleep');
      // Stage them in the hall just outside the bathroom (off camera), then they hurry in.
      const sx = door.x - 0.25 + i * 0.28;
      const sz = door.z + 0.9 + i * 0.35;
      ctx.npcs.place(c, { x: sx, y: 0, z: sz }, Math.PI);
      const k = i;
      arrivals.push(
        ctx.wait(0.25 + k * 0.35).then(() => (this.alive(gen) ? ctx.npcs.walkTo(c, { x: st.stool.x, y: 0, z: st.stool.z + 0.42 }, { speed: 2.3, style: 'run', faceYaw: Math.PI }) : undefined)),
      );
      i++;
    }
    const grab = this.stages.get(this.grabber);
    if (grab) void ctx.wait(0.9).then(() => this.alive(gen) && this.say(grab.c, 'HAIR TIME!', 'shout', 1.6));
    await Promise.race([Promise.all(arrivals), ctx.wait(5.5)]);
    if (!this.alive(gen)) return;
    for (const st of this.stages.values()) this.seat(st);
    ctx.audio.play('pop', { volume: 0.6 });
    await ctx.wait(0.7);
  }

  private seat(st: GirlStage): void {
    const ctx = this.ctx!;
    ctx.npcs.release(st.c);
    st.c.root.position.set(st.stool.x, 0, st.stool.z);
    st.c.root.rotation.set(0, Math.PI, 0);
    st.c.setMotion(0);
    st.c.setPose('sit', { seatHeight: VANITY_STOOL_H });
    st.seated = true;
  }

  private async battleScript(gen: number): Promise<void> {
    const ctx = this.ctx!;
    this.phase = 'battle';
    ctx.clock.mode = 'hold';
    ctx.hud.objective = 'THE BLACK BRUSH has appeared…';
    const counter = ctx.world.fixtures.vanity.counter.getWorldPosition(v3());
    const black = this.brushes.get('black')!;
    const stoolZ = ctx.world.anchor('stool2').z;
    const vanity = ctx.world.anchor('vanity');
    // Reveal: slow push-in on the counter between Addy and Ellie; the brush lifts, glows, gleams.
    const bx = black.root.position.x;
    ctx.camera.shot({ position: { x: bx + 0.14, y: counter.y + 0.52, z: counter.z + 0.36 }, target: { x: bx - 0.03, y: counter.y + 0.2, z: counter.z - 0.12 }, fov: 44 }, 1.8);
    ctx.audio.duck(0.75, 4.5);
    ctx.audio.play('blackBrushSting');
    for (const st of this.stages.values()) {
      st.c.setExpression('surprised');
      st.c.lookAt(black.root.position);
    }
    const y0 = black.root.position.y;
    const rise = async () => {
      for (let t = 0; t <= 1.8 && this.alive(gen); t += 0.05) {
        const k = Math.min(1, t / 1.8);
        black.setGlow(k);
        black.root.position.y = y0 + 0.05 * Math.sin(k * Math.PI * 0.5);
        black.root.rotation.z = COUNTER_LAYOUT[2]!.yaw + 0.25 * Math.sin(k * Math.PI);
        await ctx.wait(0.05);
      }
    };
    const rising = rise();
    await ctx.wait(0.9);
    if (!this.alive(gen)) return;
    ctx.ui.banner('THE BLACK BRUSH', 'legendary', { sub: 'EVERYBODY WANTS IT.', seconds: 3.2, icon: 'blackBrush' });
    await rising;
    ctx.audio.play('blackBrushGleam');
    ctx.fx.burst('sparkle', { x: bx, y: y0 + 0.08, z: counter.z }, { count: 14, color: PAL.blackBrushSheen });
    for (const st of this.stages.values()) st.c.setExpression('love');
    await ctx.wait(1.4);
    if (!this.alive(gen)) return;

    // The scramble: a comic hand-pile lunge; the grabber snatches it.
    ctx.camera.shot(wideShot(vanity.x, stoolZ), 6);
    await ctx.wait(0.35);
    if (!this.alive(gen)) return;
    let k = 0;
    for (const st of this.stages.values()) {
      const kk = k++;
      void ctx.wait(kk * 0.06).then(() => this.alive(gen) && st.c.play('lunge'));
      st.c.setExpression('determined');
    }
    ctx.audio.play('whoosh');
    await ctx.wait(0.35);
    if (!this.alive(gen)) return;
    ctx.fx.burst('dust', { x: bx, y: counter.y + 0.08, z: counter.z + 0.05 }, { count: 18 });
    ctx.fx.burst('star', { x: bx, y: counter.y + 0.15, z: counter.z + 0.05 }, { count: 8 });
    ctx.audio.play('boing');
    ctx.camera.rig.shake(0.35);
    ctx.rumble('medium');
    const grab = this.stages.get(this.grabber)!;
    this.attachToHand(black, grab.c);
    black.setGlow(0.6);
    grab.c.setHold('brush');
    await ctx.wait(0.4);
    if (!this.alive(gen)) return;
    grab.c.play('cheer');
    grab.c.setExpression('smug');
    this.say(grab.c, 'GOT IT!', 'shout', 1.8);
    ctx.audio.play('blackBrushGleam', { volume: 0.7 });
    let o = 0;
    for (const st of this.stages.values()) {
      if (st.id === this.grabber) continue;
      const line = GRAB_LINES_OTHERS[(o + ctx.plan.seed) % GRAB_LINES_OTHERS.length]!;
      const oo = o++;
      void ctx.wait(0.25 + oo * 0.45).then(() => {
        if (!this.alive(gen)) return;
        st.c.play(oo === 0 ? 'gasp' : 'noooo');
        st.c.setExpression(oo === 0 ? 'surprised' : 'pout', 2.5);
        this.say(st.c, line, 'shout', 1.7);
      });
    }
    await ctx.wait(2.4);
    if (!this.alive(gen)) return;

    // Who uses it first? (the grabber is pre-selected; the player may reassign).
    this.phase = 'choice';
    for (const st of this.stages.values()) st.c.lookAt(null);
    const options = GIRLS.map((g) => ({
      id: g,
      label: DISPLAY_NAME[g],
      sub: g === this.grabber ? 'Grabbed it first!' : CONDITION_INFO[ctx.plan.hair[g].condition].tag,
      color: COLOR[g],
      badge: g === this.grabber ? ('blackBrush' as const) : undefined,
    }));
    this.choiceOpen = true;
    let pick: string;
    try {
      pick = await ctx.ui.choice('WHO GETS THE BLACK BRUSH FIRST?', options, { defaultId: this.grabber, subtitle: 'You can pass it later.' });
    } finally {
      this.choiceOpen = false;
    }
    if (!this.alive(gen)) return;
    const chosen: GirlId = GIRLS.includes(pick as GirlId) ? (pick as GirlId) : this.grabber;
    const session = this.session!;
    if (chosen !== this.grabber) {
      session.pass(chosen);
      session.passes = 0;
      const to = this.stages.get(chosen)!;
      grab.c.play('handOff');
      grab.c.setExpression('pout', 3);
      this.say(grab.c, 'Hmph… fine!', 'say', 1.8);
      await ctx.wait(0.45);
      if (!this.alive(gen)) return;
      this.attachToHand(black, to.c);
      to.c.play('cheer');
      to.c.setExpression('joy', 2.5);
      this.say(to.c, 'Yesss!', 'shout', 1.5);
      ctx.audio.play('brushPass');
    } else {
      this.say(grab.c, 'Obviously.', 'say', 1.6);
      for (const st of this.stages.values()) if (st.id !== chosen) st.c.setExpression('pout', 2.5);
    }
    // Everyone else grabs a backup brush.
    for (const st of this.stages.values()) {
      if (st.id === session.holder) continue;
      const b = this.brushes.get(session.brushOf(st.id));
      if (b) this.attachToHand(b, st.c);
      st.c.setHold('brush');
    }
    session.focus = session.holder;
    black.setGlow(0.3);
    await ctx.wait(0.9);
  }

  private beginBrushing(): void {
    const ctx = this.ctx;
    const session = this.session;
    if (!ctx || !session || this.finished) return;
    for (const st of this.stages.values()) if (!st.seated) this.seat(st);
    this.phase = 'brushing';
    ctx.clock.mode = 'run';
    ctx.audio.setMusic('brushing');
    ctx.hud.objective = 'Brush DOWN · ends first!';
    this.loop = ctx.audio.loop('brushing');
    this.loop.set(0, 1);
    this.enablePointer();
    this.applyFocus(session.focus, true);
    const dev = ctx.input.lastDevice;
    const sub =
      dev === 'touch'
        ? 'Drag down on her hair from the glowing line · tap a portrait to switch girls'
        : dev === 'gamepad'
          ? 'Aim with the stick, hold the button to brush · switch girls anytime'
          : 'Drag down with the mouse — or aim with the arrows and hold the button';
    ctx.ui.instruction('Brush DOWN — start at the ENDS!', sub);
    this.hintT = 7;
    // Device glyph prompts (never hard-coded button names): hold to brush, then how to switch girls.
    this.hintStage = dev === 'touch' ? 2 : 0;
    this.hintPromptT = 0;
    if (this.hintStage === 0) ctx.ui.prompt({ text: 'Hold to brush DOWN', slot: 'primary', hold: true });
  }

  private enablePointer(): void {
    const ctx = this.ctx!;
    const dev = ctx.input.lastDevice;
    ctx.pointer.enable({ virtual: 'auto', cursor: 'ring', speed: dev === 'keyboard' ? 0.5 : 0.75 });
  }

  // ── brushing (per frame) ──────────────────────────────────────────────────

  private brushingUpdate(dt: number, controls: GameControls, clicks: readonly string[]): void {
    const ctx = this.ctx!;
    const session = this.session!;
    // A modal prompt ("call Mom?") is open: everything waits (clicks under it are ignored).
    if (this.choiceOpen) {
      this.updateCamera(dt);
      return;
    }
    // Hints / timers.
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) ctx.ui.instruction(null);
    }
    this.toastT -= dt;
    // Focus switching (Q/R · L1/R1 · portraits).
    let want: GirlId | null = null;
    if (controls.prevPressed) want = this.cycle(-1);
    if (controls.nextPressed) want = this.cycle(1);
    for (const c of clicks) if (GIRLS.includes(c as GirlId)) want = c as GirlId;
    if (want && want !== session.focus) this.applyFocus(want, false);
    // PASS / DONE / CALL MOM.
    if (controls.secondaryPressed || clicks.includes('pass')) this.tryPass();
    if (controls.altPressed || clicks.includes('done')) this.declareFocused();
    if (clicks.includes('mom')) this.callMom();
    if (this.choiceOpen) return; // DONE may have just opened the "call Mom?" prompt
    this.updateHintPrompt(dt);

    const ev = session.tick(dt, true);
    for (const g of ev.declared) this.onDeclared(g);
    for (const g of ev.perfect) this.onPerfect(g);
    this.selfBrushVisuals(dt);
    this.stickX = Number.isFinite(controls.moveX) ? controls.moveX : 0;
    this.stickY = Number.isFinite(controls.moveY) ? controls.moveY : 0;
    this.brushInput(dt);
    this.updateCamera(dt);

    // Mom comes when the player has said DONE for everyone (or they're all at 100 %), or at the clock cap. If the
    // girls all SAY they're done while unattended, the player is asked (never auto-started).
    const actEnd = ACT3.end;
    if (!this.warned && ctx.clock.minutes >= actEnd - 7) {
      this.warned = true;
      ctx.ui.toast("Mom's hair check is coming soon!", 'eye', 3);
    }
    if (session.allConfirmed && this.momCallT < 0 && !this.momStarted) {
      this.momCallT = 2.2;
      ctx.ui.toast('Everybody’s ready… MOM IS COMING!', 'eye', 2.5);
      ctx.audio.play('clockTick');
    } else if (session.allDeclared && !session.allConfirmed && !this.askedMom && !this.choiceOpen && this.momCallT < 0) {
      this.askedMom = true;
      void this.askMom();
    }
    if (this.momCallT > 0) {
      this.momCallT -= dt;
      if (this.momCallT <= 0 && !this.momStarted) this.startMom(true);
    }
    if (!this.momStarted && ctx.clock.minutes >= actEnd - 1) this.startMom(false);
  }

  /** Hint prompts for keys / pad, with the UI's own device glyphs. */
  private updateHintPrompt(dt: number): void {
    const ctx = this.ctx!;
    if (this.hintStage >= 2) return;
    this.hintPromptT += dt;
    if (this.hintStage === 0 && (!this.firstStroke || this.hintPromptT > 12)) {
      this.hintStage = 1;
      this.hintPromptT = 0;
      ctx.ui.prompt({ text: 'Switch girls', slot: 'switch' });
    } else if (this.hintStage === 1 && this.hintPromptT > 4) {
      this.hintStage = 2;
      ctx.ui.prompt(null);
    }
  }

  /** "Everyone says they're done — call Mom?" (the player decides; KEEP BRUSHING is the default). */
  private async askMom(): Promise<void> {
    const ctx = this.ctx!;
    const gen = this.gen;
    if (this.choiceOpen || this.momStarted) return;
    this.endStroke();
    const prevMode = ctx.clock.mode;
    ctx.clock.mode = 'hold';
    this.choiceOpen = true;
    let pick = 'keep';
    try {
      pick = await ctx.ui.choice(
        "EVERYONE SAYS THEY'RE DONE!",
        [
          { id: 'mom', label: 'CALL MOM', sub: 'Hair check time!', icon: 'eye', color: 'var(--bhd-coral)' },
          { id: 'keep', label: 'KEEP BRUSHING', sub: 'A few more strokes…', icon: 'brush', color: 'var(--bhd-mint)' },
        ],
        { defaultId: 'keep', subtitle: '…are they, though? Mom approves at 95 %.' },
      );
    } finally {
      this.choiceOpen = false;
    }
    if (!this.alive(gen) || this.phase !== 'brushing') return;
    ctx.clock.mode = prevMode === 'hold' ? 'run' : prevMode;
    if (pick === 'mom') this.callMom();
    else ctx.ui.toast('Keep going — tap CALL MOM when they’re ready.', 'brush', 2.4);
  }

  /** The player calls Mom now. */
  private callMom(): void {
    const ctx = this.ctx!;
    const session = this.session!;
    if (this.momStarted || this.momCallT > 0 || this.phase !== 'brushing') return;
    session.confirmAll();
    this.momCallT = 1.2;
    ctx.ui.toast('MOM IS COMING!', 'eye', 2);
    ctx.audio.play('clockTick');
  }

  private cycle(dir: 1 | -1): GirlId {
    const s = this.session!;
    const i = GIRLS.indexOf(s.focus);
    return GIRLS[(i + dir + GIRLS.length) % GIRLS.length]!;
  }

  private applyFocus(g: GirlId, first: boolean): void {
    const ctx = this.ctx!;
    const session = this.session!;
    const prev = session.focus;
    if (!first && prev === g) return;
    this.endStroke();
    const prevSt = this.stages.get(prev);
    if (prevSt && !first) {
      // The previous girl takes her brush back and brushes herself.
      const b = this.brushes.get(session.brushOf(prev));
      if (b) this.attachToHand(b, prevSt.c);
      prevSt.c.setHold(session.g[prev].perfect ? 'none' : 'brush');
      prevSt.rig.setBrush(null);
      prevSt.rig.setKnotMarkers('off');
    }
    session.focus = g;
    const st = this.stages.get(g)!;
    this.guides?.attach(st.rig);
    st.c.setHold('none');
    st.c.setExpression('happy');
    st.rig.setKnotMarkers('soft');
    const tool = this.toolBrush();
    if (tool) {
      tool.root.removeFromParent();
      ctx.root.add(tool.root);
      tool.root.add(this.toolHead);
    }
    this.hoverU = 0.5;
    this.hoverV = 0.9;
    this.toolLift = 0.08;
    if (!first) {
      this.whipT = 0.45;
      ctx.audio.play('whoosh', { volume: 0.5 });
    }
    // Put a live virtual cursor near her ends — projected with the camera she is framed by AFTER the swing (the
    // goal), not the one still looking at the previous girl. (Only when the virtual cursor is already active:
    // PointerInput.warp() flips the source to 'virtual' without activating it.)
    this.shotFor(st, this.camGoal);
    if (ctx.pointer.source === 'virtual' && ctx.pointer.active) this.warpToEnds(st.rig, this.goalCamera(this.camGoal));
  }

  /** A scratch camera matching a shot goal (for projecting where things will be once the camera arrives). */
  private goalCamera(goal: CameraGoal): THREE.PerspectiveCamera {
    const cam = this.ctx!.camera.camera;
    const gc = this.goalCam;
    gc.aspect = cam.aspect;
    gc.near = cam.near;
    gc.far = cam.far;
    gc.fov = effectiveFov(goal.fov ?? cam.fov, cam.aspect);
    gc.position.set(goal.position.x, goal.position.y, goal.position.z);
    gc.lookAt(goal.target.x, goal.target.y, goal.target.z);
    gc.updateProjectionMatrix();
    gc.updateMatrixWorld(true);
    return gc;
  }

  private toolBrush(): Brush | null {
    const s = this.session;
    return s ? (this.brushes.get(s.brushOf(s.focus)) ?? null) : null;
  }

  private tryPass(): void {
    const ctx = this.ctx!;
    const session = this.session!;
    if (this.passing > 0) return;
    const to = session.focus;
    if (to === session.holder) {
      if (this.toastT <= 0) {
        ctx.ui.toast(`${DISPLAY_NAME[to]} already has THE BLACK BRUSH!`, 'blackBrush', 2);
        this.toastT = 1.5;
      }
      return;
    }
    const oldTool = this.toolBrush();
    const res = session.pass(to);
    if (!res) return;
    this.endStroke();
    const from = this.stages.get(res.from)!;
    const recv = this.stages.get(to)!;
    const black = this.brushes.get('black')!;
    const giveBack = oldTool; // the receiver's old brush goes to the previous holder
    // Hand-off animation: the black brush flies from her hand to the brushing spot; the other brush flies back.
    const gen = this.gen;
    this.passing = 0.55;
    from.c.play('handOff');
    ctx.audio.play('brushPass');
    ctx.rumble('medium');
    black.setGlow(1);
    const line = HANDOFF_LINES[(session.passes + ctx.plan.seed) % HANDOFF_LINES.length]!;
    void ctx.wait(0.35).then(() => {
      if (!this.alive(gen)) return;
      from.c.setExpression('pout', 2.2);
      this.say(from.c, line, 'say', 2);
      recv.c.setExpression('joy', 2);
      recv.c.play('cheer');
      this.say(recv.c, 'Yay!', 'shout', 1.2);
    });
    // Black brush: world-space arc into the tool position.
    const start = black.root.getWorldPosition(v3());
    black.root.removeFromParent();
    ctx.root.add(black.root);
    black.root.position.copy(start);
    black.root.add(this.toolHead);
    if (giveBack) this.attachToHand(giveBack, from.c);
    from.c.setHold(session.g[from.id].perfect ? 'none' : 'brush');
    void ctx.wait(0.9).then(() => this.alive(gen) && black.setGlow(0.3));
    ctx.fx.burst('sparkle', start, { count: 10, color: PAL.blackBrushSheen });
  }

  /** DONE for the focused girl: she's ready for Mom. Pressed again once everyone says so → offer to call Mom. */
  private declareFocused(): void {
    const ctx = this.ctx!;
    const session = this.session!;
    const g = session.focus;
    if (session.declare(g, true)) {
      this.onDeclared(g, true);
      return;
    }
    if (session.allDeclared && !this.choiceOpen) {
      void this.askMom();
      return;
    }
    if (this.toastT <= 0) {
      ctx.ui.toast(`${DISPLAY_NAME[g]} is ready for Mom — switch girls!`, 'check', 2);
      this.toastT = 1.5;
    }
  }

  /** "I'M DONE!" — by herself (unattended; she keeps fussing with her hair) or via the player's DONE. */
  private onDeclared(g: GirlId, byPlayer = false): void {
    const ctx = this.ctx!;
    const st = this.stages.get(g);
    if (!st) return;
    ctx.audio.play('girlDone');
    this.say(st.c, byPlayer ? 'All done!' : "I'M DONE!", 'shout', 2);
    st.c.setExpression('proud', 3);
    st.c.emote('check', 1.6);
  }

  /** 100 %: every section brushed out (picture day's special sparkle moment). */
  private onPerfect(g: GirlId): void {
    const ctx = this.ctx!;
    const st = this.stages.get(g);
    if (!st) return;
    const s = this.session!.g[g];
    if (s.perfectNeeded) ctx.ui.banner('PICTURE PERFECT!', 'fun', { sub: `${DISPLAY_NAME[g]} is ready for her close-up`, icon: 'sparkle', seconds: 2.4, pos: 'bottom' });
    else this.say(st.c, '100%! I’M DONE!', 'shout', 2);
    ctx.audio.play('shine');
    ctx.audio.play('girlDone', { delay: 0.2 });
    ctx.fx.burst('sparkle', st.rig.surfacePoint(0.5, 0.4, v3()), { count: 26, color: PAL.sparkle, size: 1.3 });
    st.c.setExpression('love', 2.5);
    st.c.emote('sparkle', 1.8);
    if (g !== this.session!.focus) {
      st.c.setHold('none');
      st.rig.setBrush(null);
    }
  }

  /** Pointer → hair-space strokes on the focused girl. */
  private brushInput(dt: number): void {
    const ctx = this.ctx!;
    const session = this.session!;
    const st = this.stages.get(session.focus)!;
    const rig = st.rig;
    const p = ctx.pointer;
    const cam = ctx.camera.camera;
    const tool = this.toolBrush();
    if (this.passing > 0) {
      this.passing -= dt;
      // Fly the black brush into place.
      if (tool) {
        brushPoseOnHair(rig, this.hoverU, this.hoverV, _p, _q, { lift: 0.06 });
        const k = 1 - Math.exp(-14 * dt);
        tool.root.position.lerp(_p, k);
        tool.root.quaternion.slerp(_q, k);
      }
      return;
    }
    // A virtual cursor (keys / pad) that just came alive starts on her ends — where brushing starts.
    if (p.source === 'virtual' && p.active && !this.virtualPlaced) {
      this.virtualPlaced = true;
      this.warpToEnds(rig);
    }
    // Mouse / touch: replay the exact pointer path since the last frame.
    if (p.source !== 'virtual' && this.evCount > 0 && this.stuckT <= 0) this.replayPath(rig, cam);
    else if (this.evCount > 0) {
      this.evCount = 0;
      this.evDown = false;
    }
    // Raycast the proxy (hair space uv).
    let hit = false;
    let u = this.hoverU;
    let v = this.hoverV;
    if (p.active) {
      _ndc.set(p.ndcX, p.ndcY);
      this.ray.setFromCamera(_ndc, cam);
      const h = this.ray.intersectObject(rig.proxy, false)[0];
      if (h?.uv) {
        hit = true;
        u = h.uv.x;
        v = h.uv.y;
      } else if (p.source === 'virtual' && Math.hypot(this.stickX, this.stickY) < 0.1) this.snapAssist(rig, dt);
    }
    if (this.stuckT > 0) {
      this.stats.stuckFrames++;
      this.stuckT -= dt;
      u = this.stuckU;
      v = this.stuckV;
      rig.setBrush({ u, v, pressure: 1, width: session.spec(session.focus).width, du: 0, dv: 0 });
      if (this.stuckT <= 0) {
        this.strokeStartV = hit ? v : this.stuckV;
        this.lastU = hit ? u : this.stuckU;
        this.lastV = this.strokeStartV;
        this.accDt = 0;
      }
    } else if (p.down && (hit || this.pressing)) {
      if (!this.pressing) {
        if (!hit) {
          if (p.pressed) this.stats.misses++;
          return;
        }
        this.stats.downs++;
        this.pressing = true;
        this.strokeStartV = v;
        this.lastU = u;
        this.lastV = v;
        this.accDt = 0;
        this.speedS = 0;
        this.lastApplyReal = realNow();
      }
      this.accDt += dt;
      if (hit) {
        const moved = Math.hypot(u - this.lastU, v - this.lastV);
        if (moved > 0.004 || this.accDt > 0.12) this.applyStroke(u, v);
      }
      const spec = session.spec(session.focus);
      rig.setBrush({ u: this.lastU, v: this.lastV, pressure: 1, width: spec.width, du: 0, dv: clamp01(this.speedS) * 1.5 });
      u = this.lastU;
      v = this.lastV;
    } else {
      if (this.pressing) this.endStroke();
      if (hit) {
        this.hoverU = u;
        this.hoverV = v;
      }
      u = this.hoverU;
      v = this.hoverV;
      rig.setBrush(null);
    }
    // Brush tool pose (sits ON the hair while pressing, hovers a little otherwise).
    const pressingNow = this.pressing || this.stuckT > 0;
    this.toolLift = damp(this.toolLift, pressingNow ? 0 : 0.035, 16, dt);
    if (tool) {
      const wob = this.stuckT > 0 ? Math.sin(this.time * 60) * 0.02 * this.stuckT : 0;
      brushPoseOnHair(rig, clamp01(u + wob), clamp01(v), _p, _q, { lift: this.toolLift });
      const k = 1 - Math.exp(-30 * dt);
      tool.root.position.lerp(_p, k);
      tool.root.quaternion.slerp(_q, k);
    }
    this.updateGuides(dt, rig, u, v);
    // Sound + trail follow the stroke speed.
    this.speedS = damp(this.speedS, 0, 3, dt);
    if (this.loop) this.loop.set(this.pressing ? clamp01(0.25 + this.speedS * 0.45) : 0, 0.85 + clamp01(this.speedS * 0.5) * 0.4);
    if (this.pressing && tool) {
      const band = speedBand(this.speedS, session.spec(session.focus));
      if (!this.trail) {
        this.trail = ctx.fx.trail(this.toolHead, PAL.sparkle, 0.05);
        this.trailBand = '';
      }
      if (band !== this.trailBand) {
        this.trailBand = band;
        this.trail.setColor(band === 'good' ? PAL.great : band === 'fast' ? PAL.knot : PAL.sparkle);
      }
    } else if (this.trail) {
      this.trail.stop();
      this.trail = null;
    }
  }

  /** Apply the buffered pointer path (every event since the last frame) as stroke segments. */
  private replayPath(rig: GirlHairRig, cam: THREE.Camera): void {
    const ctx = this.ctx!;
    const n = this.evCount;
    const down = this.evDown;
    this.evCount = 0;
    this.evDown = false;
    const rect = ctx.renderer.domElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return;
    for (let i = 0; i < n; i++) {
      const o = i * 3;
      _ndc.set(((this.evBuf[o]! - rect.left) / rect.width) * 2 - 1, -(((this.evBuf[o + 1]! - rect.top) / rect.height) * 2 - 1));
      this.ray.setFromCamera(_ndc, cam);
      const h = this.ray.intersectObject(rig.proxy, false)[0];
      if (!h?.uv) continue;
      const u = h.uv.x;
      const v = h.uv.y;
      const t = this.evBuf[o + 2]!;
      if (!this.pressing) {
        if (!down || i !== 0) continue; // a stroke starts where the finger / button went down
        this.pressing = true;
        this.stats.downs++;
        this.strokeStartV = v;
        this.lastU = u;
        this.lastV = v;
        this.accDt = 0;
        this.speedS = 0;
        this.lastApplyReal = t;
        continue;
      }
      if (Math.hypot(u - this.lastU, v - this.lastV) > 0.003) this.applyStroke(u, v, t);
      if (this.stuckT > 0) break; // snagged: the rest of this path is held
    }
  }

  /** Apply the movement since the last stroke point to the focused girl's field. */
  private applyStroke(u: number, v: number, at?: number): void {
    const ctx = this.ctx!;
    const session = this.session!;
    const g = session.focus;
    const st = this.stages.get(g)!;
    // Real time between samples (game dt is capped at 0.1 s per frame, which would make gentle strokes on a
    // slow device read as "too fast"); generously clamped.
    const now = at ?? realNow();
    const dt = Math.min(0.6, Math.max(1 / 240, this.accDt, (now - this.lastApplyReal) / 1000));
    this.lastApplyReal = now;
    const r = session.stroke(g, this.lastU, this.lastV, u, v, dt, this.strokeStartV);
    this.stats.segments++;
    this.stats.removed += r.removed;
    this.stats.lastSpeed = Math.round(r.speed * 100) / 100;
    this.stats.maxSpeed = Math.max(this.stats.maxSpeed, this.stats.lastSpeed);
    this.stats.dvSum += Math.max(0, v - this.lastV);
    if (r.snag) this.stats[r.snag.reason]++;
    const dvs = (v - this.lastV) / dt;
    if (dvs > 0) this.speedS = Math.max(this.speedS * 0.6, dvs);
    this.accDt = 0;
    if (r.removed > 0 || r.releases > 0 || r.cleared.length > 0) {
      st.commitT = 0; // commit this frame
      if (this.firstStroke && r.removed > 0.02) {
        this.firstStroke = false;
        ctx.audio.play('brushStroke', { volume: 0.7 });
        if (this.hintT > 1.2) this.hintT = 1.2; // got it — clear the big hint soon
      }
    }
    if (r.releases > 0) {
      ctx.audio.play('detangle', { pitch: 0.9 + Math.random() * 0.3, volume: 0.7 });
      ctx.fx.burst('sparkle', st.rig.surfacePoint(u, v, v3()), { count: 3 });
    }
    for (const i of r.cleared) {
      const smooth = session.smooth(g);
      ctx.audio.play('sectionClear', { pitch: 0.8 + smooth * 0.7 });
      const col = i % session.cols;
      const row = Math.floor(i / session.cols);
      st.rig.surfacePoint((col + 0.5) / session.cols, (row + 0.5) / session.rows, _p);
      ctx.fx.burst('sparkle', _p, { count: 9, color: PAL.sparkle });
      if (Math.random() < 0.35) {
        st.c.setExpression('joy', 1.2);
        if (st.lookT <= 0 && Math.random() < 0.5) {
          st.c.lookAt(ctx.camera.camera.position);
          st.lookT = 0.9;
        }
      }
    }
    if (r.snag) {
      this.onSnag(g, r.snag.col, r.snag.row, r.snag.reason, u, r.endV);
      this.lastU = u;
      this.lastV = r.endV;
      return;
    }
    this.lastU = u;
    this.lastV = v;
    if (dvs > 0.2 && r.removed > 0 && Math.random() < 0.08) ctx.audio.play('brushStroke', { volume: clamp01(0.3 + dvs * 0.2) });
  }

  private onSnag(g: GirlId, col: number, row: number, reason: SnagReason, u: number, v: number): void {
    const ctx = this.ctx!;
    const st = this.stages.get(g)!;
    st.rig.snag(col, row);
    ctx.audio.play('brushSnag');
    ctx.rumble('light');
    this.stuckT = 0.45;
    this.stuckU = u;
    this.stuckV = v;
    st.c.setExpression('surprised', 1.2);
    // She glances back over her shoulder at the brush ("eep!") so her face reads from behind, too.
    st.c.lookAt(ctx.camera.camera.position);
    st.lookT = 1.1;
    if (st.eekT <= 0) {
      this.say(st.c, reason === 'ends' ? 'Eep!' : 'Hey!', 'shout', 1);
      st.eekT = 1.6;
    }
    if (this.toastT <= 0) {
      ctx.ui.toast(reason === 'ends' ? 'Start lower — work the ends first!' : 'Gently… slower strokes!', 'brush', 2.2);
      this.toastT = 2.6;
    }
  }

  private endStroke(): void {
    this.pressing = false;
    this.stuckT = 0;
    this.accDt = 0;
    this.stopBrushFx();
    const s = this.session;
    if (s) this.stages.get(s.focus)?.rig.setBrush(null);
  }

  private stopBrushFx(): void {
    if (this.trail) {
      this.trail.stop();
      this.trail = null;
    }
    if (this.loop) this.loop.set(0, 1);
  }

  /** Put the virtual cursor on the girl's hair ends (keys / pad), as seen by `cam` (default: the live camera). */
  private warpToEnds(rig: HairRig, cam?: THREE.Camera): void {
    const ctx = this.ctx!;
    rig.surfacePoint(0.5, 0.8, _p).project(cam ?? ctx.camera.camera);
    if (Number.isFinite(_p.x) && Number.isFinite(_p.y)) ctx.pointer.warp(Math.max(-0.9, Math.min(0.9, _p.x)), Math.max(-0.9, Math.min(0.9, _p.y)));
  }

  /**
   * The ENDS guide band (top of the lowest section that still has a knot) + the knotted section under the brush:
   * gold = work it now; pink = a knot further down this lock will catch the brush (start lower).
   */
  private updateGuides(dt: number, rig: GirlHairRig, u: number, v: number): void {
    const g = this.guides;
    const session = this.session!;
    if (!g) return;
    const f = session.g[session.focus].field;
    const cols = session.cols;
    const rows = session.rows;
    const band = guideRow(f, cols, rows);
    const bandV = band >= 1 ? band / rows : null;
    let cell: { u0: number; u1: number; v0: number; v1: number; hint: CellHint } | null = null;
    const col = colOf(u, cols);
    const r0 = rowOf(v, rows);
    let rk = -1;
    for (let r = rows - 1; r >= 0; r--)
      if (f[r * cols + col]! >= KNOT_T) {
        rk = r;
        break;
      }
    let row = -1;
    let hint: CellHint = 'go';
    if (rk >= 0 && r0 <= rk) {
      row = rk;
      hint = r0 === rk ? 'go' : 'wait';
    } else if (f[r0 * cols + col]! >= 0.15) {
      row = r0;
      hint = r0 === rows - 1 || f[(r0 + 1) * cols + col]! <= CLEAR_T ? 'go' : 'wait';
    }
    if (row >= 0) cell = { u0: col / cols, u1: (col + 1) / cols, v0: row / rows, v1: (row + 1) / rows, hint };
    g.update(dt, rig, bandV, cell, this.pressing);
  }

  /** Keyboard / gamepad cursor: gently pull it back onto the hair when it drifts off. */
  private snapAssist(rig: HairRig, dt: number): void {
    const ctx = this.ctx!;
    const cam = ctx.camera.camera;
    const p = ctx.pointer;
    let best = 1e9;
    let bx = 0;
    let by = 0;
    for (let a = 0; a <= 8; a++)
      for (let b = 1; b <= 8; b++) {
        rig.surfacePoint(a / 8, b / 8, _p).project(cam);
        const d = (_p.x - p.ndcX) ** 2 + (_p.y - p.ndcY) ** 2;
        if (d < best) {
          best = d;
          bx = _p.x;
          by = _p.y;
        }
      }
    // Gentle, and only while the stick is idle (never fights the player).
    const k = 1 - Math.exp(-2.5 * Math.min(dt, 1 / 30));
    p.warp(p.ndcX + (bx - p.ndcX) * k, p.ndcY + (by - p.ndcY) * k);
  }

  /** Unfocused girls brush themselves (visible parting where they work). */
  private selfBrushVisuals(dt: number): void {
    const session = this.session!;
    for (const st of this.stages.values()) {
      if (st.id === session.focus) continue;
      st.eekT -= dt;
      const s = session.g[st.id];
      if (s.working < 0) {
        st.rig.setBrush(null);
        continue;
      }
      st.wob += dt * 2.2;
      const col = s.working % session.cols;
      const row = Math.floor(s.working / session.cols);
      const u = (col + 0.5 + 0.3 * Math.sin(st.wob * 1.3)) / session.cols;
      const v = (row + 0.5 + 0.35 * Math.sin(st.wob)) / session.rows;
      st.rig.setBrush({ u: clamp01(u), v: clamp01(v), pressure: 0.55, width: 0.18, du: 0, dv: 0.8 });
    }
    const f = this.stages.get(session.focus);
    if (f) f.eekT -= dt;
  }

  /** Upload tangles (focused girl every frame she changes, others ~8 Hz) + bedhead/shine easing. */
  private commitAll(dt: number): void {
    const session = this.session!;
    for (const st of this.stages.values()) {
      st.commitT -= dt;
      if (st.commitT > 0) continue;
      st.commitT = st.id === session.focus ? 0 : 0.12;
      const s = session.g[st.id];
      st.rig.tangle.set(s.field);
      st.rig.commit();
      const mean = 1 - session.smooth(st.id);
      st.rig.setBedhead(bedheadFor(s.condition, mean, st.startMean));
      st.rig.setShine(clamp01(1 - mean * 1.6));
    }
  }

  private updateHeads(dt: number): void {
    for (const st of this.stages.values()) {
      if (st.lookT > 0) {
        st.lookT -= dt;
        if (st.lookT <= 0 && (this.phase === 'brushing' || this.phase === 'end')) st.c.lookAt(null);
      }
      st.c.socket('head').getWorldPosition(_p);
      if (Number.isFinite(_p.y)) st.head.lerp(_p, 1 - Math.exp(-4 * dt));
    }
  }

  private updateCamera(dt: number): void {
    const ctx = this.ctx!;
    const st = this.stages.get(this.session!.focus);
    if (!st) return;
    this.whipT -= dt;
    this.camStiff = this.whipT > 0 ? 10 : 4.5;
    this.shotFor(st, this.camGoal);
    ctx.camera.shot(this.camGoal, this.camStiff);
  }

  /** The brushing framing for a girl (pulled back on narrow screens so all her locks fit). */
  private shotFor(st: GirlStage, out: CameraGoal): CameraGoal {
    const cam = this.ctx!.camera.camera;
    const s = SHOT_SIDES[GIRLS.indexOf(st.id)]!;
    const xs = [this.stages.get('addy')?.stool.x ?? 0, this.stages.get('heidi')?.stool.x ?? 0];
    const tanV = Math.tan((effectiveFov(s.fov, cam.aspect) * Math.PI) / 360);
    return brushingShot(st.head.x, st.head.y, st.head.z, s, Math.min(...xs) - 0.85, Math.max(...xs) + 0.8, out, fitScale(cam.aspect, tanV));
  }

  private portraitRow(): PortraitRow {
    const session = this.session!;
    const items: Portrait[] = GIRLS.map((g) => {
      const s = session.g[g];
      const insp = this.inspected.get(g);
      const smooth = session.smooth(g);
      const st = this.stages.get(g);
      const pct = displayPercent(s.field);
      const status = insp
        ? insp.approved
          ? 'MOM APPROVED ✓'
          : 'MOM ASSIST ♥'
        : s.confirmed
          ? `READY ✓ · ${pct}%`
          : s.declared
            ? `I'M DONE! · ${pct}%`
            : `${pct}%`;
      const mood: Portrait['mood'] = st && st.eekT > 0.6 ? 'eek' : s.declared || insp?.approved ? 'proud' : smooth < 0.5 ? 'sleepy' : 'happy';
      return {
        id: g,
        name: DISPLAY_NAME[g],
        color: COLOR[g],
        progress: clamp01(pct / 100),
        goal: APPROVE_T,
        status,
        badge: session.holder === g ? 'blackBrush' : null,
        focused: this.phase === 'brushing' && session.focus === g,
        mood,
      };
    });
    if (this.phase !== 'brushing') return { items, compact: true };
    const focusHolds = session.focus === session.holder;
    const touch = this.ctx!.input.lastDevice === 'touch';
    const chips: NonNullable<PortraitRow['chips']> = [];
    // Touch already has big PASS / DONE buttons: no duplicate chips there.
    if (!touch) {
      chips.push({ id: 'pass', label: 'PASS THE BLACK BRUSH', slot: 'secondary', icon: 'blackBrush', disabled: focusHolds });
      chips.push({ id: 'done', label: "SHE'S DONE", slot: 'alt', icon: 'check', disabled: session.g[session.focus].confirmed && !session.allDeclared });
    }
    if (session.allDeclared && !this.momStarted && this.momCallT < 0) chips.push({ id: 'mom', label: 'CALL MOM', icon: 'eye' });
    // Compact row (top-right corner) keeps the centre/upper-middle clear for her face in the mirror.
    return chips.length ? { items, chips, compact: true } : { items, compact: true };
  }

  // ── Mom's hair check ──────────────────────────────────────────────────────

  private startMom(early: boolean): void {
    if (this.momStarted) return;
    this.momStarted = true;
    this.momEarly = early;
    // Never leave a "call Mom?" prompt hanging over her check (resolves it with its default).
    if (this.choiceOpen && this.ctx) this.ctx.ui.handleMenuActions(['confirm']);
    const gen = this.gen;
    void this.momScript(gen).catch((e: unknown) => {
      console.error('[hair] mom script error', e);
      if (this.alive(gen)) this.finale(false);
    });
  }

  private async momScript(gen: number): Promise<void> {
    const ctx = this.ctx!;
    const session = this.session!;
    this.phase = 'mom';
    this.endStroke();
    ctx.pointer.disable();
    ctx.ui.instruction(null);
    ctx.ui.prompt(null);
    this.loop?.stop();
    this.loop = null;
    // Everyone holds their brush in their lap; the tool goes back to its owner.
    const tool = this.toolBrush();
    const fst = this.stages.get(session.focus);
    if (tool && fst) this.attachToHand(tool, fst.c);
    for (const st of this.stages.values()) {
      st.c.setHold('none');
      st.rig.setBrush(null);
      st.rig.setKnotMarkers('off');
    }
    ctx.hud.objective = "MOM'S HAIR CHECK";
    ctx.ui.portraits(null);
    this.guides?.detach();
    ctx.audio.setMusic('boss');
    ctx.audio.play('bossIntro');
    await ctx.ui.bossIntro('MOM', 'THE HAIR INSPECTOR');
    if (!this.alive(gen)) return;

    // Entrance: the girls in the foreground, Mom backlit in the doorway, slow and dramatic.
    const ashley = ctx.family.ashley;
    const door = ctx.world.anchor('bathDoor');
    const vanity = ctx.world.anchor('vanity');
    const stoolZ = ctx.world.anchor('stool2').z;
    ashley.emote(null);
    ashley.setPose('stand');
    ashley.setHold('none');
    ashley.setExpression('smug');
    ctx.npcs.place(ashley, { x: door.x, y: 0, z: door.z + 0.7 }, Math.PI);
    ctx.camera.shot({ position: { x: vanity.x + 0.05, y: 1.52, z: stoolZ - 0.86 }, target: { x: door.x - 0.2, y: 1.0, z: door.z - 0.3 }, fov: 54 }, 100);
    this.backlight(door.x, door.z + 0.25);
    const walkIn = ctx.npcs.walkTo(ashley, { x: vanity.x + 0.15, y: 0, z: stoolZ + 0.95 }, { speed: 0.75, faceYaw: Math.PI });
    await ctx.wait(0.5);
    this.momStep = 'entrance';
    let gi = 0;
    for (const st of this.stages.values()) {
      const k = gi++;
      st.c.lookAt(ashley.socket('head').getWorldPosition(v3()));
      void ctx.wait(0.3 + k * 0.55).then(() => {
        if (!this.alive(gen)) return;
        st.c.setExpression('worried', 3);
        if (k < GULP_LINES.length) this.say(st.c, GULP_LINES[k]!, 'whisper', 1.6);
      });
    }
    await Promise.race([walkIn, ctx.wait(4.2)]);
    if (!this.alive(gen)) return;
    ashley.setExpression('happy');
    this.say(ashley, "Let's see those beautiful heads of hair!", 'say', 2.4);
    await ctx.wait(1.6);
    for (const st of this.stages.values()) st.c.lookAt(null);

    // One girl at a time.
    for (const g of GIRLS) {
      if (!this.alive(gen)) return;
      const st = this.stages.get(g);
      if (!st) continue;
      await this.inspect(gen, st);
    }
    if (!this.alive(gen)) return;
    this.writeState();
    await this.finaleScript(gen);
  }

  private async inspect(gen: number, st: GirlStage): Promise<void> {
    const ctx = this.ctx!;
    const session = this.session!;
    const ashley = ctx.family.ashley;
    const shotSide = SHOT_SIDES[GIRLS.indexOf(st.id)]!;
    const xs = [this.stages.get('addy')?.stool.x ?? 0, this.stages.get('heidi')?.stool.x ?? 0];
    const minX = Math.min(...xs) - 0.85;
    const maxX = Math.max(...xs) + 0.8;
    const cam = ctx.camera.camera;
    const tanV = Math.tan((effectiveFov(56, cam.aspect) * Math.PI) / 360);
    const scale = fitScale(cam.aspect, tanV);
    // Mom leans in beside her, on the far side from the camera, so her hair's back (where the knots are) faces
    // the camera — the magnifier sweep and the red swirls read from behind.
    const momSide = -shotSide.side;
    const spot = { x: st.stool.x + momSide * (st.id === 'ellie' ? 0.27 : 0.32), y: 0, z: st.stool.z + 0.5 };
    const faceYaw = Math.atan2(st.stool.x - spot.x, st.stool.z + 0.08 - spot.z);
    const back: CameraGoal = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    inspectBackShot(st.head.x, st.head.y, st.head.z, shotSide, minX, maxX, back, scale);
    const front: CameraGoal = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } };
    inspectShot(st.head.x, st.head.z, st.head.y, front, momSide as -1 | 1);
    this.momStep = `walk:${st.id}`;
    ctx.camera.shot(back, 3.2);
    await Promise.race([ctx.npcs.walkTo(ashley, spot, { speed: 1.5, faceYaw }), ctx.wait(2.2)]);
    if (!this.alive(gen)) return;
    ctx.npcs.place(ashley, spot, faceYaw);
    this.momStep = `inspect:${st.id}`;
    ashley.play('inspect', { duration: 2.4 });
    ashley.setExpression('smug'); // mock-serious, never stern
    st.rig.setKnotMarkers('inspect');
    ctx.audio.play('momInspect');
    this.say(ashley, 'Hmmm…', 'think', 1.6);
    st.c.setExpression('worried', 2.4);
    // The magnifying-glass sweep across the back of her hair.
    const mag = this.magnifierMesh ?? magnifier();
    if (!this.magnifierMesh) {
      this.magnifierMesh = mag;
      this.mirror?.include(mag);
    }
    ctx.root.add(mag);
    for (let t = 0; t <= 2.0 && this.alive(gen); t += 0.04) {
      const k = t / 2.0;
      const u = 0.12 + 0.76 * (0.5 - 0.5 * Math.cos(k * Math.PI * 2));
      const v = 0.3 + 0.5 * k;
      st.rig.surfacePoint(u, v, _p);
      st.rig.surfaceNormal(u, v, _n);
      mag.position.copy(_p).addScaledVector(_n, 0.11);
      mag.lookAt(ctx.camera.camera.position);
      await ctx.wait(0.04);
    }
    mag.removeFromParent();
    if (!this.alive(gen)) return;
    const smooth = session.smooth(st.id);
    const verdict = momVerdict(smooth);
    this.momStep = `${verdict}:${st.id}`;
    if (verdict === 'approved') {
      this.inspected.set(st.id, { smooth, approved: true });
      st.rig.setKnotMarkers('off');
      // Their reactions first, face to face (no banner over Mom's face)…
      ctx.camera.shot(front, 6);
      ctx.audio.play('momApproved');
      ctx.rumble('score');
      ashley.play('thumbsUp');
      ashley.setExpression('love', 2.5);
      ashley.emote('heart', 1.8);
      st.c.play('hairFlip');
      st.c.setExpression('proud', 3);
      ctx.audio.play('hairFlip', { delay: 0.25 });
      await ctx.wait(0.35);
      if (!this.alive(gen)) return;
      ctx.fx.burst('heart', this.bubbleAnchor(ashley, v3()), { count: 10 });
      this.say(ashley, 'Gorgeous!', 'say', 1.6);
      await ctx.wait(1.3);
      if (!this.alive(gen)) return;
      // …then the stamp, over the back view of her shiny hair.
      ctx.camera.shot(back, 4);
      ctx.fx.burst('sparkle', st.rig.surfacePoint(0.5, 0.45, v3()), { count: 20, color: PAL.sparkle });
      ctx.ui.banner('MOM APPROVED ✓', 'approved', { sub: DISPLAY_NAME[st.id].toUpperCase(), icon: 'check', seconds: 1.9, pos: 'top' });
      await ctx.wait(2.0);
    } else {
      this.inspected.set(st.id, { smooth, approved: false });
      // The stamp first (back view, nobody's face under it), then Mom's line and her speedy, loving finishing
      // touches right there on the knots.
      ctx.ui.banner("I'LL JUST FINISH IT…", 'boss', { seconds: 1.5, icon: 'heart', pos: 'bottom' });
      ashley.setExpression('happy');
      await ctx.wait(1.3);
      if (!this.alive(gen)) return;
      this.say(ashley, 'Almost! Let me help…', 'say', 1.8);
      await ctx.wait(0.4);
      if (!this.alive(gen)) return;
      const b = this.brushes.get(session.brushOf(st.id));
      if (b) this.attachToHand(b, ashley);
      ashley.setHold('brush');
      ashley.play('brushFast', { duration: 2 });
      ctx.audio.play('momFinish');
      st.c.play('noooo');
      st.c.setExpression('pout', 2.4);
      void ctx.wait(0.5).then(() => this.alive(gen) && this.say(st.c, 'Nooo! I wanted to do it myself!', 'shout', 2));
      const f = session.g[st.id].field;
      for (let k = 0; k < 20 && this.alive(gen); k++) {
        for (let i = 0; i < f.length; i++) f[i] = f[i]! * 0.72;
        if (k === 19) f.fill(0);
        st.rig.tangle.set(f);
        st.rig.commit();
        st.rig.setBedhead(bedheadFor(session.g[st.id].condition, 1 - session.smooth(st.id), st.startMean));
        st.rig.setShine(clamp01(0.4 + k / 20));
        if (k % 3 === 0) ctx.fx.burst('sparkle', st.rig.surfacePoint(0.15 + Math.random() * 0.7, 0.3 + Math.random() * 0.6, v3()), { count: 6 });
        await ctx.wait(0.1);
      }
      if (!this.alive(gen)) return;
      st.rig.setKnotMarkers('off');
      ashley.setHold('none');
      if (b) this.attachToHand(b, st.c);
      // The hug, face to face.
      ctx.camera.shot(front, 6);
      ctx.audio.play('sparkle');
      ashley.play('hug');
      st.c.play('giggle');
      st.c.setExpression('joy', 2.5);
      ashley.setExpression('love', 2);
      ashley.emote('heart', 2);
      await ctx.wait(0.3);
      if (!this.alive(gen)) return;
      ctx.fx.burst('heart', this.bubbleAnchor(st.c, v3()), { count: 8 });
      ctx.audio.play('heart');
      await ctx.wait(1.9);
    }
  }

  private async finaleScript(gen: number): Promise<void> {
    const ctx = this.ctx!;
    this.momStep = 'finale';
    const vanity = ctx.world.anchor('vanity');
    const stoolZ = ctx.world.anchor('stool2').z;
    // Wide on the three of them + Mom cheering beside the vanity end (all in frame, faces in the mirror).
    ctx.camera.shot({ position: { x: vanity.x - 0.2, y: 1.85, z: stoolZ + 2.0 }, target: { x: vanity.x - 0.25, y: 1.02, z: stoolZ - 0.55 }, fov: 50 }, 3);
    ctx.audio.setMusic('brushing');
    const ashley = ctx.family.ashley;
    ctx.npcs.place(ashley, { x: vanity.x - 1.5, y: 0, z: stoolZ - 0.12 }, 0.35);
    ashley.setHold('none');
    ashley.setExpression('love', 3);
    for (const st of this.stages.values()) {
      st.rig.setBedhead(0);
      st.rig.setShine(1);
      st.c.play('hairFlip');
      st.c.setExpression('joy', 3);
      ctx.fx.burst('sparkle', st.rig.surfacePoint(0.5, 0.35, v3()), { count: 16, color: PAL.sparkle });
    }
    ctx.audio.play('hairFlip');
    ctx.audio.play('shine', { delay: 0.3 });
    ctx.ui.banner('HAIR: GORGEOUS', 'secured', { icon: 'blackBrush', sub: 'Three heads of hair. One black brush.', pos: 'bottom' });
    ctx.audio.play('taskDone', { delay: 0.2 });
    ashley.play('cheer');
    this.say(ashley, 'My beautiful girls!', 'say', 2.2);
    await ctx.wait(2.6);
    if (!this.alive(gen)) return;
    this.finale(false);
  }

  /** End state: brushed, shiny, standing in the bathroom; brushes put away. */
  private finale(instant: boolean): void {
    const ctx = this.ctx;
    if (!ctx || this.finished) return;
    this.phase = 'end';
    this.endStroke();
    this.loop?.stop();
    this.loop = null;
    this.writeState();
    for (const st of this.stages.values()) {
      const s = this.session?.g[st.id];
      if (s) s.field.fill(0);
      st.rig.tangle.fill(0);
      st.rig.commit();
      st.rig.setBedhead(0);
      st.rig.setShine(1);
      st.rig.setBrush(null);
      st.rig.setKnotMarkers('off');
      if (instant || !st.seated) {
        ctx.npcs.release(st.c);
        st.c.root.position.set(st.stool.x, 0, st.stool.z + 0.45);
        st.c.root.rotation.set(0, 0, 0);
      } else {
        st.c.root.position.set(st.stool.x, 0, st.stool.z + 0.45);
        st.c.root.rotation.set(0, 0, 0);
      }
      st.c.setHold('none');
      st.c.setPose('stand');
      st.c.setExpression('happy');
      st.c.lookAt(null);
    }
    for (const b of this.brushes.values()) b.dispose();
    this.brushes.clear();
    ctx.family.ashley.setHold('none');
    ctx.ui.portraits(null);
    this.finished = true;
  }

  /** ctx.state.hair from the inspection (or the current smoothness). */
  private writeState(): void {
    const ctx = this.ctx!;
    const session = this.session;
    for (const g of GIRLS) {
      const r = this.inspected.get(g);
      const smooth = r?.smooth ?? session?.smooth(g) ?? 0;
      ctx.state.hair[g] = {
        smooth,
        momFinished: r ? !r.approved : smooth < APPROVE_T,
        blackBrushSeconds: Math.round((session?.g[g].blackSeconds ?? 0) * 10) / 10,
        solo: r ? r.approved : smooth >= APPROVE_T,
      };
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private attachToHand(b: Brush, c: Character): void {
    const hand = c.socket('handR');
    b.root.removeFromParent();
    if (this.toolHead.parent === b.root) b.root.remove(this.toolHead);
    hand.add(b.root);
    b.root.position.set(0, 0, 0);
    b.root.quaternion.identity();
    b.root.scale.setScalar(1);
  }

  private say(c: Character, text: string, style: 'say' | 'shout' | 'whisper' | 'think', seconds = 1.8): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const who = c.id === 'extra' ? 'extra' : c.id;
    ctx.ui.bubble(this.bubbleAnchor(c, v3()), text, { speaker: who, style, seconds });
    if (who !== 'extra') ctx.audio.babble(who, text, style === 'shout' ? 'excited' : style === 'whisper' ? 'whisper' : 'normal');
  }

  /**
   * A world point for a speech bubble that is ON SCREEN (below the top UI band): her face in the mirror when it's
   * in the frame (the close-ups: the line pops out of her reflection), else above her head, else her head clamped
   * into the frame.
   */
  private bubbleAnchor(c: Character, out: THREE.Vector3): THREE.Vector3 {
    const ctx = this.ctx!;
    const cam = ctx.camera.camera;
    cam.updateMatrixWorld();
    // The top ~22 % belongs to the portrait row — except in the finale (no portraits; banner at the bottom),
    // where a bubble over Mom's head is better than one over her mouth.
    const top = this.momStep === 'finale' ? 0.62 : 0.42;
    const safe = (p: THREE.Vector3) => p.z > -1 && p.z < 1 && Math.abs(p.x) <= 0.8 && p.y >= -0.62 && p.y <= top;
    const head = c.socket('head').getWorldPosition(_a);
    // 1. Her reflection (a point just above her head, mirrored across the glass), if seen through the mirror.
    const girl = GIRLS.includes(c.id as GirlId) && this.stages.get(c.id as GirlId)?.seated;
    if (girl && (this.phase === 'brushing' || this.phase === 'mom')) {
      _b.set(head.x, head.y + 0.14, head.z);
      const d = _b.clone().sub(this.mirrorPos).dot(this.mirrorNrm);
      _b.addScaledVector(this.mirrorNrm, -2 * d);
      // Seen through the glass? (the line camera → reflection crosses the mirror rectangle)
      const cp = cam.position;
      const dc = cp.clone().sub(this.mirrorPos).dot(this.mirrorNrm);
      const dr = _b.clone().sub(this.mirrorPos).dot(this.mirrorNrm);
      if (dc > 0 && dr < 0) {
        const t = dc / (dc - dr);
        const hitX = cp.x + (_b.x - cp.x) * t - this.mirrorPos.x;
        const hitY = cp.y + (_b.y - cp.y) * t - this.mirrorPos.y;
        if (Math.abs(hitX) < this.mirrorHalf.w * 0.95 && Math.abs(hitY) < this.mirrorHalf.h * 0.95) {
          out.copy(_b);
          if (safe(_n.copy(out).project(cam))) return out;
        }
      }
    }
    // 2. Above her head.
    c.socket('overhead').getWorldPosition(out);
    if (safe(_n.copy(out).project(cam))) return out;
    out.copy(head).y += 0.2;
    if (safe(_n.copy(out).project(cam))) return out;
    // 3. Just above her head (still in out), clamped into the safe part of the frame.
    _n.copy(out).project(cam);
    if (!(_n.z > -1 && _n.z < 1)) _n.z = 0.95;
    _n.x = Math.max(-0.8, Math.min(0.8, _n.x));
    _n.y = Math.max(-0.6, Math.min(top - 0.02, _n.y));
    return out.copy(_n).unproject(cam);
  }

  /** A warm backlight glow in the doorway for Mom's entrance. */
  private backlight(x: number, z: number): void {
    const ctx = this.ctx!;
    if (!this.glow) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
      g.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
      const c = new THREE.Color(PAL.lampWarm);
      g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array([c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b]), 3));
      g.setAttribute('aParam', new THREE.BufferAttribute(new Float32Array([1.1, 0, 0.75, CELL_GLOW, 1.1, 0, 0.75, CELL_GLOW, 1.1, 0, 0.75, CELL_GLOW, 1.1, 0, 0.75, CELL_GLOW]), 4));
      g.setAttribute('aAdd', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1]), 1));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      const m = new THREE.Mesh(g, hairSpriteMaterial());
      m.frustumCulled = false;
      m.renderOrder = 1;
      this.glow = m;
      ctx.root.add(m);
    }
    const pos = this.glow.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < 4; i++) pos.setXYZ(i, x, 1.15, z);
    pos.needsUpdate = true;
  }

  private debugApi() {
    return {
      phase: () => this.phase,
      momStep: () => this.momStep,
      stats: () => ({ ...this.stats, removed: Math.round(this.stats.removed * 100) / 100, dvSum: Math.round(this.stats.dvSum * 100) / 100 }),
      pointer: () => {
        const p = this.ctx?.pointer;
        return p ? { src: p.source, active: p.active, down: p.down, x: Math.round(p.x), y: Math.round(p.y), pressing: this.pressing } : null;
      },
      focus: () => this.session?.focus ?? null,
      heads: () =>
        Object.fromEntries(
          [...this.stages.values()].map((st) => [st.id, { head: st.head.toArray().map((x) => +x.toFixed(3)), stool: [st.stool.x, st.stool.z], tip: st.rig.surfacePoint(0.5, 1, v3()).toArray().map((x) => +x.toFixed(3)), crown: st.rig.surfacePoint(0.5, 0, v3()).toArray().map((x) => +x.toFixed(3)), side: st.rig.surfacePoint(0, 0.6, v3()).toArray().map((x) => +x.toFixed(3)) }]),
        ),
      holder: () => this.session?.holder ?? null,
      smooth: () => Object.fromEntries(GIRLS.map((g) => [g, this.session ? Math.round(this.session.smooth(g) * 1000) / 1000 : null])),
      declared: () => Object.fromEntries(GIRLS.map((g) => [g, !!this.session?.g[g].declared])),
      confirmed: () => Object.fromEntries(GIRLS.map((g) => [g, !!this.session?.g[g].confirmed])),
      percent: () => Object.fromEntries(GIRLS.map((g) => [g, this.session ? displayPercent(this.session.g[g].field) : null])),
      guide: () => (this.guides ? { band: this.guides.band.visible, cell: this.guides.cell.visible } : null),
      callMom: () => this.callMom(),
      /** Tell Mom she can come (the player's DONE for everyone). */
      confirmAll: () => this.session?.confirmAll(),
      mirrorMs: () => this.mirror?.lastMs ?? null,
      mirrorPass: () => (this.mirror ? { calls: this.mirror.lastCalls, tris: this.mirror.lastTris, ms: this.mirror.lastMs } : null),
      mirrorRenders: () => this.mirror?.renders ?? 0,
      mirrorProbe: () => this.mirror?.probe() ?? null,
      mirrorImage: () => this.mirror?.image() ?? null,
      /** Screen (CSS px) of a hair-space point on the focused girl (for scripted drags). */
      screenOf: (u: number, v: number) => {
        const ctx = this.ctx;
        const st = this.session ? this.stages.get(this.session.focus) : null;
        if (!ctx || !st) return null;
        st.rig.surfacePoint(u, v, _p).project(ctx.camera.camera);
        const el = ctx.renderer.domElement.getBoundingClientRect();
        return { x: el.left + ((_p.x + 1) / 2) * el.width, y: el.top + ((1 - _p.y) / 2) * el.height };
      },
      /** Scripted mouse drag on the focused girl's hair through real pointer events (walkthroughs). */
      drag: async (u: number, v0: number, v1: number, steps = 12, release = true, ms = 45, pointerType: 'mouse' | 'touch' = 'mouse') => {
        const ctx = this.ctx;
        const st = this.session ? this.stages.get(this.session.focus) : null;
        if (!ctx || !st) return null;
        const canvas = ctx.renderer.domElement;
        const at = (vv: number) => {
          st.rig.surfacePoint(u, vv, _p).project(ctx.camera.camera);
          const r = canvas.getBoundingClientRect();
          return { clientX: r.left + ((_p.x + 1) / 2) * r.width, clientY: r.top + ((1 - _p.y) / 2) * r.height };
        };
        const opts = { bubbles: true, cancelable: true, pointerId: pointerType === 'touch' ? 11 : 7, pointerType, isPrimary: true, button: 0, buttons: 1 };
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...opts, ...at(v0) }));
        for (let i = 1; i <= steps; i++) {
          await new Promise((r) => setTimeout(r, ms));
          canvas.dispatchEvent(new PointerEvent('pointermove', { ...opts, ...at(v0 + ((v1 - v0) * i) / steps) }));
        }
        if (release) {
          await new Promise((r) => setTimeout(r, ms));
          canvas.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, ...at(v1) }));
        }
        return this.session ? Math.round(this.session.smooth(this.session.focus) * 1000) / 1000 : null;
      },
      /** Let the unattended girls say they're done (dev: exercises the "call Mom?" prompt). */
      allSay: () => {
        const s = this.session;
        if (!s) return;
        s.elapsed = Math.max(s.elapsed, 60);
        for (const g of GIRLS) {
          s.g[g].field.fill(Math.min(0.18, 1 - s.g[g].doneAt - 0.01));
          if (g === s.focus) s.declare(g, true);
        }
      },
      /** Guided in-page brushing of the focused girl until `target` %: returns strokes used (real pointer events). */
      brushTo: async (target = 95, max = 80) => {
        const s = this.session;
        if (!s) return null;
        const g = s.focus;
        let n = 0;
        while (displayPercent(s.g[g].field) < target && n < max && this.phase === 'brushing') {
          const f = s.g[g].field;
          const band = guideRow(f, s.cols, s.rows);
          const v0 = band >= 0 ? Math.max(0.06, band / s.rows + 0.02) : 0.06;
          let best = 0;
          let bt = -1;
          for (let c = 0; c < s.cols; c++) {
            let x = 0;
            for (let r = Math.max(0, band); r < s.rows; r++) x += f[r * s.cols + c]!;
            if (x > bt) {
              bt = x;
              best = c;
            }
          }
          const u = n % 3 === 2 ? 0.12 + ((n * 0.37) % 0.76) : (best + 0.5) / s.cols;
          // A comfortable ~1.2 v/s stroke (longer strokes take longer).
          const len = 0.99 - v0;
          const steps = Math.max(6, Math.round(len * 16));
          await (this.debugApi().drag as (u: number, a: number, b: number, st: number, rel: boolean, ms: number) => Promise<unknown>)(u, v0, 0.99, steps, true, Math.round((len / 1.2 / steps) * 1000));
          n++;
          await new Promise((r) => setTimeout(r, 120));
        }
        return { girl: g, strokes: n, percent: displayPercent(s.g[g].field), clock: this.ctx?.clock.label() };
      },
      /** Force Mom's check now (dev). */
      mom: () => this.startMom(true),
      /** Brush one girl nearly clean (dev). */
      cheat: (g: GirlId, to = 0.02) => this.session?.g[g].field.fill(to),
    };
  }
}

export const create = (): Activity => new HairActivity();
