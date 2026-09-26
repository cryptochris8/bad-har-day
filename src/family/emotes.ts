// ─────────────────────────────────────────────────────────────────────────────
// Emotes: bold, cute billboard icons popping above a character's head. Icons are
// drawn once on canvases (shared, cached textures) in the palette colours with a
// thick plum outline so they read at the dollhouse distance. Timing is pure.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PAL } from '../render/palette';
import { markShared } from '../render/models/shared';
import type { Emote } from './types';

export const EMOTES: readonly Emote[] = ['exclaim', 'question', 'heart', 'zzz', 'sweat', 'sparkle', 'music', 'shh', 'idea', 'check', 'star', 'huff'];

export const EMOTE_DEFAULT_SECONDS = 1.6;
export const EMOTE_POP_IN = 0.28;
export const EMOTE_POP_OUT = 0.2;
/** World size (m) of an emote icon. */
export const EMOTE_SIZE = 0.46;

const css = (hex: number): string => '#' + hex.toString(16).padStart(6, '0');

// ── timing (pure) ─────────────────────────────────────────────────────────────

function easeOutBack(t: number): number {
  const c1 = 1.9;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/**
 * Scale (0..~1.12) of an emote `t` seconds after it popped, shown for `dur` seconds (loop = until
 * dismissed). `outT` ≥ 0 = seconds since it was dismissed (pop-out), −1 = not dismissed.
 */
export function emoteScale(t: number, dur: number, loop: boolean, outT = -1): number {
  if (t < 0) return 0;
  let s = t < EMOTE_POP_IN ? Math.max(0, easeOutBack(t / EMOTE_POP_IN)) : 1 + 0.035 * Math.sin((t - EMOTE_POP_IN) * 5);
  let out = outT;
  if (!loop && out < 0 && t > dur - EMOTE_POP_OUT) out = t - (dur - EMOTE_POP_OUT);
  if (out >= 0) {
    const k = Math.min(1, out / EMOTE_POP_OUT);
    s *= k < 0.3 ? 1 + 0.12 * (k / 0.3) : 1.12 * (1 - (k - 0.3) / 0.7);
  }
  return Math.max(0, s);
}

/** True once an emote has fully finished (hide it). */
export function emoteDone(t: number, dur: number, loop: boolean, outT = -1): boolean {
  if (outT >= 0) return outT >= EMOTE_POP_OUT;
  return !loop && t >= dur;
}

/** Gentle float (m) above the socket. zzz drifts more lazily. */
export function emoteBob(kind: Emote, t: number): number {
  return kind === 'zzz' ? 0.04 * Math.sin(t * 1.8) + 0.02 : 0.02 * Math.sin(t * 4.2);
}

// ── textures ──────────────────────────────────────────────────────────────────

const cache = new Map<Emote, THREE.Texture>();

export function emoteTexture(kind: Emote): THREE.Texture {
  let t = cache.get(kind);
  if (t) return t;
  if (typeof document === 'undefined') {
    // Headless (unit tests): a 1×1 placeholder.
    const d = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    d.needsUpdate = true;
    t = d;
  } else {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    if (g) draw(g, kind);
    const ct = new THREE.CanvasTexture(c);
    ct.colorSpace = THREE.SRGBColorSpace;
    ct.anisotropy = 2;
    t = ct;
  }
  markShared(t);
  cache.set(kind, t);
  return t;
}

const INK = css(PAL.outline);

function outlinedPath(g: CanvasRenderingContext2D, fill: string, path: () => void, lw = 10): void {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  path();
  g.lineWidth = lw;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

function glint(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = -0.6): void {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, fill: string, rot = 0): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `900 ${size}px "Luckiest Guy", "Baloo 2", "Arial Black", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(8, size * 0.16);
  g.strokeStyle = INK;
  g.strokeText(s, 0, 0);
  g.fillStyle = fill;
  g.fillText(s, 0, 0);
  g.restore();
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, ro: number, ri: number, n = 5, rot = -Math.PI / 2): void {
  for (let k = 0; k < n * 2; k++) {
    const r = k % 2 ? ri : ro;
    const a = rot + (k / (n * 2)) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

function sparkle4(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  outlinedPath(
    g,
    fill,
    () => {
      g.moveTo(cx, cy - r);
      g.quadraticCurveTo(cx + r * 0.16, cy - r * 0.16, cx + r, cy);
      g.quadraticCurveTo(cx + r * 0.16, cy + r * 0.16, cx, cy + r);
      g.quadraticCurveTo(cx - r * 0.16, cy + r * 0.16, cx - r, cy);
      g.quadraticCurveTo(cx - r * 0.16, cy - r * 0.16, cx, cy - r);
      g.closePath();
    },
    7,
  );
}

function heartPath(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.25, cy + s * 0.05, cx - s * 0.95, cy - s * 0.95, cx, cy - s * 0.35);
  g.bezierCurveTo(cx + s * 0.95, cy - s * 0.95, cx + s * 1.25, cy + s * 0.05, cx, cy + s * 0.9);
  g.closePath();
}

function draw(g: CanvasRenderingContext2D, kind: Emote): void {
  g.clearRect(0, 0, 128, 128);
  switch (kind) {
    case 'exclaim':
      outlinedPath(g, css(PAL.uiCoral), () => {
        g.roundRect(50, 12, 28, 72, 14);
      });
      outlinedPath(g, css(PAL.uiCoral), () => {
        g.arc(64, 104, 13, 0, Math.PI * 2);
      });
      glint(g, 58, 26, 5, 9, 0);
      break;
    case 'question':
      text(g, '?', 64, 70, 112, css(PAL.uiSky));
      break;
    case 'heart':
      outlinedPath(g, css(PAL.heart), () => heartPath(g, 64, 62, 50));
      glint(g, 44, 46, 9, 14);
      break;
    case 'zzz':
      text(g, 'Z', 40, 88, 58, css(PAL.uiLilac), -0.15);
      text(g, 'z', 74, 58, 46, css(PAL.uiLilac), 0.1);
      text(g, 'z', 100, 30, 36, css(PAL.uiLilac), -0.1);
      break;
    case 'sweat':
      outlinedPath(g, css(PAL.sweat), () => {
        g.moveTo(64, 12);
        g.bezierCurveTo(78, 42, 98, 60, 98, 82);
        g.arc(64, 82, 34, 0, Math.PI, false);
        g.bezierCurveTo(30, 60, 50, 42, 64, 12);
        g.closePath();
      });
      glint(g, 52, 78, 7, 13, 0.2);
      break;
    case 'sparkle':
      sparkle4(g, 58, 64, 44, css(PAL.uiSunshine));
      sparkle4(g, 100, 28, 18, css(PAL.interactGlow));
      sparkle4(g, 104, 98, 14, css(PAL.uiSunshine));
      break;
    case 'music':
      outlinedPath(g, css(PAL.uiMint), () => {
        g.ellipse(40, 96, 17, 13, -0.35, 0, Math.PI * 2);
      });
      outlinedPath(g, css(PAL.uiMint), () => {
        g.ellipse(92, 84, 17, 13, -0.35, 0, Math.PI * 2);
      });
      outlinedPath(g, css(PAL.uiMint), () => {
        g.moveTo(50, 94);
        g.lineTo(50, 28);
        g.lineTo(104, 16);
        g.lineTo(104, 82);
        g.lineTo(96, 82);
        g.lineTo(96, 34);
        g.lineTo(58, 42);
        g.lineTo(58, 94);
        g.closePath();
      }, 8);
      break;
    case 'shh':
      text(g, 'shh', 64, 66, 54, css(PAL.uiLilac), -0.08);
      break;
    case 'idea':
      g.strokeStyle = INK;
      g.lineWidth = 7;
      g.lineCap = 'round';
      for (const [a, r0, r1] of [
        [-Math.PI / 2, 48, 60],
        [-Math.PI / 2 - 0.8, 46, 58],
        [-Math.PI / 2 + 0.8, 46, 58],
        [-Math.PI, 44, 56],
        [0, 44, 56],
      ] as const) {
        g.beginPath();
        g.moveTo(64 + Math.cos(a) * r0, 58 + Math.sin(a) * r0);
        g.lineTo(64 + Math.cos(a) * r1, 58 + Math.sin(a) * r1);
        g.stroke();
      }
      outlinedPath(g, css(PAL.uiSunshine), () => {
        g.arc(64, 56, 30, Math.PI * 0.8, Math.PI * 2.2);
        g.lineTo(76, 96);
        g.lineTo(52, 96);
        g.closePath();
      });
      outlinedPath(g, css(PAL.stainless), () => {
        g.roundRect(50, 96, 28, 18, 6);
      }, 7);
      glint(g, 54, 44, 6, 11);
      break;
    case 'check':
      outlinedPath(g, css(PAL.good), () => {
        g.arc(64, 64, 50, 0, Math.PI * 2);
      });
      g.strokeStyle = '#ffffff';
      g.lineWidth = 15;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(40, 66);
      g.lineTo(57, 83);
      g.lineTo(89, 46);
      g.stroke();
      break;
    case 'star':
      outlinedPath(g, css(PAL.great), () => starPath(g, 64, 68, 56, 25));
      glint(g, 50, 52, 6, 11);
      break;
    case 'huff':
      outlinedPath(g, css(PAL.steam), () => {
        g.arc(52, 70, 24, 0, Math.PI * 2);
      });
      outlinedPath(g, css(PAL.steam), () => {
        g.arc(82, 60, 20, 0, Math.PI * 2);
      });
      outlinedPath(g, css(PAL.steam), () => {
        g.arc(100, 88, 14, 0, Math.PI * 2);
      });
      outlinedPath(g, css(PAL.steam), () => {
        g.arc(30, 96, 12, 0, Math.PI * 2);
      });
      break;
  }
}

// ── sprite ────────────────────────────────────────────────────────────────────

export class EmoteSprite {
  readonly sprite: THREE.Sprite;
  private readonly material: THREE.SpriteMaterial;
  private kind: Emote | null = null;
  private t = 0;
  private dur = EMOTE_DEFAULT_SECONDS;
  private loop = false;
  private outT = -1;

  constructor(parent: THREE.Object3D) {
    this.material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true, fog: false });
    this.material.name = 'bhd-emote';
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.name = 'emote';
    this.sprite.visible = false;
    this.sprite.renderOrder = 20;
    this.sprite.center.set(0.5, 0.2);
    parent.add(this.sprite);
  }

  get current(): Emote | null {
    return this.outT >= 0 ? null : this.kind;
  }

  show(kind: Emote | null, seconds?: number): void {
    if (kind === null) {
      if (this.kind && this.outT < 0) this.outT = 0;
      return;
    }
    const tex = emoteTexture(kind);
    if (this.material.map !== tex) {
      this.material.map = tex;
      this.material.needsUpdate = true;
    }
    this.kind = kind;
    this.t = 0;
    this.outT = -1;
    this.loop = kind === 'zzz' && seconds === undefined;
    this.dur = seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : EMOTE_DEFAULT_SECONDS;
    this.sprite.visible = true;
  }

  update(dt: number): void {
    if (!this.kind) return;
    this.t += dt;
    if (this.outT >= 0) this.outT += dt;
    if (emoteDone(this.t, this.dur, this.loop, this.outT)) {
      this.kind = null;
      this.sprite.visible = false;
      return;
    }
    const s = emoteScale(this.t, this.dur, this.loop, this.outT) * EMOTE_SIZE;
    this.sprite.scale.set(Math.max(1e-4, s), Math.max(1e-4, s), 1);
    this.sprite.position.y = emoteBob(this.kind, this.t);
    this.material.rotation = this.kind === 'zzz' ? 0.08 * Math.sin(this.t * 1.3) : 0;
  }

  dispose(): void {
    this.sprite.removeFromParent();
    this.material.dispose();
  }
}
