// Text + pictogram signs for the route, drawn at runtime on ONE canvas atlas (procedural, no assets): the
// school's name, the monument sign, the DROP-OFF sign, school-zone / kids-at-play signs, street names, the park
// sign, the school flag, and road paint ("SCHOOL", "DROP OFF"). Sign faces merge into one mesh (lit toon with the
// atlas) and road paint into another (alpha-tested). Without a DOM (unit tests) the faces are simply skipped.
import * as THREE from 'three';
import { toonGradient } from '../../render/toon';

export type Region = 'fence' | 'schoolName' | 'monument' | 'dropoff' | 'schoolZone' | 'paintSchool' | 'paintDropoff' | 'street0' | 'street1' | 'street2' | 'street3' | 'park' | 'flag' | 'kidsAtPlay';

const SIZE = 1024;
export const REGIONS: Readonly<Record<Region, readonly [number, number, number, number]>> = {
  schoolName: [0, 0, 1024, 128],
  monument: [0, 128, 1024, 256],
  dropoff: [0, 384, 512, 256],
  schoolZone: [512, 384, 256, 256],
  street0: [768, 384, 256, 64],
  street1: [768, 448, 256, 64],
  street2: [768, 512, 256, 64],
  street3: [768, 576, 256, 64],
  paintSchool: [0, 640, 512, 128],
  paintDropoff: [512, 640, 512, 128],
  park: [0, 768, 512, 128],
  flag: [512, 768, 256, 160],
  kidsAtPlay: [768, 768, 256, 256],
  fence: [0, 896, 384, 128],
};

export const STREET_NAMES = ['MAPLE GROVE LN', 'SUNNY AVE', 'BUTTERCUP ST', 'ACORN WAY'] as const;

const DISPLAY = '"Luckiest Guy", "Baloo 2", "Arial Black", sans-serif';
const UI = '"Baloo 2", "Nunito", "Arial Rounded MT Bold", sans-serif';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitText(g: CanvasRenderingContext2D, text: string, font: string, size: number, maxW: number): void {
  let s = size;
  g.font = `${s}px ${font}`;
  while (g.measureText(text).width > maxW && s > 8) {
    s -= 2;
    g.font = `${s}px ${font}`;
  }
}

function kid(g: CanvasRenderingContext2D, x: number, y: number, s: number, flip = 1): void {
  g.beginPath();
  g.arc(x, y - s * 0.9, s * 0.22, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = s * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y - s * 0.65);
  g.lineTo(x, y - s * 0.15);
  g.moveTo(x, y - s * 0.15);
  g.lineTo(x - s * 0.22 * flip, y + s * 0.35);
  g.moveTo(x, y - s * 0.15);
  g.lineTo(x + s * 0.25 * flip, y + s * 0.3);
  g.moveTo(x, y - s * 0.55);
  g.lineTo(x + s * 0.32 * flip, y - s * 0.3);
  g.moveTo(x, y - s * 0.55);
  g.lineTo(x - s * 0.3 * flip, y - s * 0.35);
  g.stroke();
}

function draw(g: CanvasRenderingContext2D): void {
  g.clearRect(0, 0, SIZE, SIZE);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const R = (id: Region) => REGIONS[id];
  // school name (facade panel: cream with teal letters)
  {
    const [x, y, w, h] = R('schoolName');
    g.fillStyle = '#fff4e0';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#2f6f74';
    fitText(g, 'MAPLE GROVE ELEMENTARY', DISPLAY, 92, w - 40);
    g.fillText('MAPLE GROVE ELEMENTARY', x + w / 2, y + h / 2 + 6);
  }
  // monument sign
  {
    const [x, y, w, h] = R('monument');
    g.fillStyle = '#fff4e0';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#2f6f74';
    g.lineWidth = 10;
    roundRect(g, x + 14, y + 14, w - 28, h - 28, 26);
    g.stroke();
    g.fillStyle = '#2f6f74';
    fitText(g, 'MAPLE GROVE', DISPLAY, 96, w - 80);
    g.fillText('MAPLE GROVE', x + w / 2, y + 78);
    fitText(g, 'ELEMENTARY', DISPLAY, 64, w - 80);
    g.fillText('ELEMENTARY', x + w / 2, y + 146);
    g.fillStyle = '#e0675a';
    fitText(g, '★ Have a great day! ★', UI, 44, w - 80);
    g.font = `800 ${g.font}`;
    g.fillText('★ Have a great day! ★', x + w / 2, y + 206);
  }
  // DROP-OFF sign
  {
    const [x, y, w, h] = R('dropoff');
    g.fillStyle = '#2f8f86';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    roundRect(g, x + 10, y + 10, w - 20, h - 20, 22);
    g.stroke();
    g.fillStyle = '#ffffff';
    fitText(g, 'DROP-OFF', DISPLAY, 96, w - 60);
    g.fillText('DROP-OFF', x + w / 2, y + 88);
    fitText(g, 'KISS & GO LANE', UI, 44, w - 60);
    g.font = `800 ${g.font}`;
    g.fillText('KISS & GO LANE', x + w / 2, y + 160);
    // arrow
    g.beginPath();
    g.moveTo(x + w / 2 - 70, y + 212);
    g.lineTo(x + w / 2 + 40, y + 212);
    g.lineTo(x + w / 2 + 40, y + 194);
    g.lineTo(x + w / 2 + 80, y + 218);
    g.lineTo(x + w / 2 + 40, y + 242);
    g.lineTo(x + w / 2 + 40, y + 224);
    g.lineTo(x + w / 2 - 70, y + 224);
    g.closePath();
    g.fill();
  }
  // school zone pentagon
  {
    const [x, y, w, h] = R('schoolZone');
    g.fillStyle = '#3a3040';
    g.beginPath();
    g.moveTo(x + w / 2, y + 6);
    g.lineTo(x + w - 6, y + h * 0.42);
    g.lineTo(x + w - 6, y + h - 6);
    g.lineTo(x + 6, y + h - 6);
    g.lineTo(x + 6, y + h * 0.42);
    g.closePath();
    g.fill();
    g.fillStyle = '#f6d04a';
    g.beginPath();
    g.moveTo(x + w / 2, y + 18);
    g.lineTo(x + w - 18, y + h * 0.44);
    g.lineTo(x + w - 18, y + h - 18);
    g.lineTo(x + 18, y + h - 18);
    g.lineTo(x + 18, y + h * 0.44);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a3040';
    g.strokeStyle = '#3a3040';
    kid(g, x + w * 0.4, y + h * 0.72, 90, 1);
    kid(g, x + w * 0.62, y + h * 0.76, 72, -1);
  }
  // street names
  STREET_NAMES.forEach((name, i) => {
    const [x, y, w, h] = R(`street${i}` as Region);
    g.fillStyle = '#3f9a6a';
    g.fillRect(x, y, w, h);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.fillStyle = '#ffffff';
    fitText(g, name, UI, 38, w - 24);
    g.font = `800 ${g.font}`;
    g.fillText(name, x + w / 2, y + h / 2 + 2);
  });
  // road paint (transparent background)
  {
    const [x, y, w, h] = R('paintSchool');
    g.clearRect(x, y, w, h);
    g.fillStyle = '#ffffff';
    fitText(g, 'SCHOOL', DISPLAY, 110, w - 20);
    g.fillText('SCHOOL', x + w / 2, y + h / 2 + 6);
  }
  {
    const [x, y, w, h] = R('paintDropoff');
    g.clearRect(x, y, w, h);
    g.fillStyle = '#ffd24a';
    fitText(g, 'DROP OFF', DISPLAY, 104, w - 20);
    g.fillText('DROP OFF', x + w / 2, y + h / 2 + 6);
  }
  // park sign
  {
    const [x, y, w, h] = R('park');
    g.fillStyle = '#6b4a2e';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#fff4e0';
    fitText(g, 'MAPLE GROVE PARK', DISPLAY, 60, w - 50);
    g.fillText('MAPLE GROVE PARK', x + w / 2, y + h / 2 + 4);
  }
  // school flag: sky blue, a golden star + "MG"
  {
    const [x, y, w, h] = R('flag');
    g.fillStyle = '#6fb6f0';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(x, y + h - 26, w, 12);
    g.fillStyle = '#ffd45e';
    const cx = x + w * 0.5;
    const cy = y + h * 0.42;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 22 : 52;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
  // picket-fence panel (white pickets, plum ink outlines, transparent gaps) — 8 pickets per 2.4 m panel
  {
    const [x, y, w, h] = R('fence');
    g.clearRect(x, y, w, h);
    const ink = '#3a2330';
    const white = '#f6ecdc';
    for (const ry of [0.42, 0.75]) {
      g.fillStyle = ink;
      g.fillRect(x, y + h * ry - 9, w, 18);
      g.fillStyle = white;
      g.fillRect(x, y + h * ry - 6, w, 12);
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      const cx = x + ((i + 0.5) * w) / n;
      const pw = 30;
      const top = y + 8;
      g.beginPath();
      g.moveTo(cx - pw / 2, y + h);
      g.lineTo(cx - pw / 2, top + 16);
      g.lineTo(cx, top);
      g.lineTo(cx + pw / 2, top + 16);
      g.lineTo(cx + pw / 2, y + h);
      g.closePath();
      g.fillStyle = white;
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = ink;
      g.stroke();
    }
  }
  // kids at play (yellow diamond)
  {
    const [x, y, w, h] = R('kidsAtPlay');
    const cx = x + w / 2;
    const cy = y + h / 2;
    g.fillStyle = '#3a3040';
    g.beginPath();
    g.moveTo(cx, y + 4);
    g.lineTo(x + w - 4, cy);
    g.lineTo(cx, y + h - 4);
    g.lineTo(x + 4, cy);
    g.closePath();
    g.fill();
    g.fillStyle = '#f6d04a';
    g.beginPath();
    g.moveTo(cx, y + 16);
    g.lineTo(x + w - 16, cy);
    g.lineTo(cx, y + h - 16);
    g.lineTo(x + 16, cy);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a3040';
    g.strokeStyle = '#3a3040';
    kid(g, cx - 4, cy + 22, 84, 1);
    g.beginPath();
    g.arc(cx + 50, cy + 44, 16, 0, Math.PI * 2);
    g.fill();
  }
}

export interface SignAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly signMat: THREE.Material;
  readonly paintMat: THREE.Material;
  readonly flagMat: THREE.Material;
  dispose(): void;
}

export function createSignAtlas(): SignAtlas | null {
  if (typeof document === 'undefined') return null;
  let canvas: HTMLCanvasElement;
  let g: CanvasRenderingContext2D | null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    g = canvas.getContext('2d');
  } catch {
    return null;
  }
  if (!g) return null;
  const ctx = g;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  // redraw once the display fonts are ready (they're bundled; this is usually instant)
  try {
    const fonts = document.fonts;
    if (fonts && typeof fonts.load === 'function')
      void Promise.all([fonts.load('60px "Luckiest Guy"'), fonts.load('800 40px "Baloo 2"')])
        .then(() => {
          draw(ctx);
          texture.needsUpdate = true;
        })
        .catch(() => {});
  } catch {
    /* best effort */
  }
  const signMat = new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradient(), alphaTest: 0.5 });
  signMat.name = 'route-signs';
  const paintMat = new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradient(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  paintMat.name = 'route-paint';
  const flagMat = new THREE.MeshToonMaterial({ map: texture, gradientMap: toonGradient(), side: THREE.DoubleSide });
  flagMat.name = 'route-flag';
  return {
    texture,
    signMat,
    paintMat,
    flagMat,
    dispose() {
      texture.dispose();
      signMat.dispose();
      paintMat.dispose();
      flagMat.dispose();
    },
  };
}

/** Collects textured quads (sign faces / road paint) and builds one merged geometry. */
export class QuadBatch {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];

  /**
   * A quad centred at (x, y, z) in route-root space, `w` × `h`, facing yaw (0 = +Z), optionally lying flat
   * (road paint: faces up, `yaw` turns the text so it reads toward the approaching car).
   */
  add(region: Region, x: number, y: number, z: number, w: number, h: number, yaw: number, flat = false, uvInset = 0.004): void {
    const [rx, ry, rw, rh] = REGIONS[region];
    const u0 = rx / SIZE + uvInset;
    const u1 = (rx + rw) / SIZE - uvInset;
    const v1 = 1 - ry / SIZE - uvInset;
    const v0 = 1 - (ry + rh) / SIZE + uvInset;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // local corners (x right, y up) → rotate by yaw around Y (flat: map local y onto −Z first)
    const corner = (lx: number, ly: number): [number, number, number] => {
      if (flat) {
        const lz = -ly;
        return [x + lx * c + lz * s, y, z - lx * s + lz * c];
      }
      return [x + lx * c, y + ly, z - lx * s];
    };
    const a = corner(-w / 2, -h / 2);
    const b = corner(w / 2, -h / 2);
    const d = corner(w / 2, h / 2);
    const e = corner(-w / 2, h / 2);
    this.pos.push(...a, ...b, ...d, ...a, ...d, ...e);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    const n: [number, number, number] = flat ? [0, 1, 0] : [s, 0, c];
    for (let i = 0; i < 6; i++) this.nor.push(...n);
  }

  get empty(): boolean {
    return this.pos.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    return g;
  }
}
