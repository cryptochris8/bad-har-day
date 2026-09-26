// The school run's own DOM (inside ui.activityLayer(), UI-kit classes): a little TRIP STRIP (home → school,
// event pins, the van moving along, "NEXT: …"), a DASHBOARD of chips for mouse players (◀ ▶ lanes, BRAKE,
// GAS, HONK — the chips show device glyphs for keyboard/pad; hidden on touch, where the overlay has buttons),
// a soft fade for the cut to the road, and the end card. Static SVG only; every text via textContent.
import type { DriveEvent } from '../../plan/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Tiny pictograms for the pins (24×24 viewBox, plum ink on colour). */
const PIN_ICON: Readonly<Record<DriveEvent | 'home' | 'school', { color: string; paths: string[] }>> = {
  home: { color: '#ffc94a', paths: ['M4 12 L12 5 L20 12', 'M7 11 V19 H17 V11', 'M11 19 V15 H13 V19'] },
  school: { color: '#ff7a6b', paths: ['M4 19 V10 H20 V19 Z', 'M9 10 L12 6 L15 10', 'M11 19 V15 H13 V19', 'M12 6 V3 H15'] },
  crossingGuard: { color: '#ff6b6b', paths: ['M9 4 H15 L19 8 V14 L15 18 H9 L5 14 V8 Z', 'M12 18 V22'] },
  geese: { color: '#fff6ee', paths: ['M6 16 C6 12 10 11 13 12 L15 7 C15 5 18 5 18 7 L21 7', 'M6 16 C8 19 15 19 17 15 L15 12'] },
  greenLights: { color: '#6fd6a0', paths: ['M9 3 H15 V21 H9 Z', 'M12 7 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', 'M12 12 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', 'M12 17 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0'] },
  sprinkler: { color: '#7cc4f2', paths: ['M12 20 V13', 'M12 13 C8 9 6 10 4 12', 'M12 13 C16 9 18 10 20 12', 'M12 13 V6'] },
  jogger: { color: '#b79cf5', paths: ['M5 15 H14 V11 H5 Z', 'M7 18 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0', 'M14 11 L18 6', 'M18 6 H20'] },
  garbageTruck: { color: '#6fd6b6', paths: ['M3 16 V8 H14 V16 Z', 'M14 11 H19 L21 14 V16 H14', 'M7 18 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0', 'M17 18 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0'] },
  ball: { color: '#ffc94a', paths: ['M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0', 'M5 12 H19', 'M12 5 C9 9 9 15 12 19'] },
  puddle: { color: '#8fd3ff', paths: ['M4 15 C4 12 9 11 12 12 C15 11 20 12 20 15 C20 18 15 19 12 18 C9 19 4 18 4 15 Z', 'M12 4 C10 7 10 8 12 9 C14 8 14 7 12 4 Z'] },
};

function icon(kind: keyof typeof PIN_ICON, size: number): SVGSVGElement {
  const spec = PIN_ICON[kind];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  const bg = document.createElementNS(SVG_NS, 'circle');
  bg.setAttribute('cx', '12');
  bg.setAttribute('cy', '12');
  bg.setAttribute('r', '11');
  bg.setAttribute('fill', spec.color);
  bg.setAttribute('stroke', '#3a2330');
  bg.setAttribute('stroke-width', '2');
  svg.appendChild(bg);
  for (const d of spec.paths) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#3a2330');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}

function vanIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 20');
  svg.setAttribute('width', '34');
  svg.setAttribute('height', '22');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M2 14 V7 C2 4 4 3 7 3 H22 C25 3 27 5 29 8 L30 11 V14 Z');
  body.setAttribute('fill', '#6f9fd8');
  body.setAttribute('stroke', '#3a2330');
  body.setAttribute('stroke-width', '2');
  body.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(body);
  const win = document.createElementNS(SVG_NS, 'path');
  win.setAttribute('d', 'M6 6 H21 V9 H6 Z M23 6 H25 L27 9 H23 Z');
  win.setAttribute('fill', '#cfeaff');
  svg.appendChild(win);
  for (const cx of [8, 24]) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('cx', String(cx));
    c.setAttribute('cy', '15');
    c.setAttribute('r', '3.2');
    c.setAttribute('fill', '#33313a');
    c.setAttribute('stroke', '#3a2330');
    c.setAttribute('stroke-width', '1.5');
    svg.appendChild(c);
  }
  return svg;
}

export interface HudPin {
  kind: DriveEvent;
  /** 0..1 along the trip. */
  at: number;
}

export class DriveHud {
  private readonly root: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly van: HTMLDivElement;
  private readonly next: HTMLDivElement;
  private readonly pins: HTMLElement[] = [];
  private readonly dash: HTMLDivElement;
  private readonly fade: HTMLDivElement;
  private end: HTMLDivElement | null = null;
  private lastNext = '';
  private lastFrac = -1;
  private readonly offs: (() => void)[] = [];
  // mouse dashboard state
  gasHeld = false;
  brakeHeld = false;
  private honkQueued = false;
  private laneQueued: -1 | 0 | 1 = 0;
  private dashShown = true;

  private readonly track: HTMLDivElement;

  constructor(private readonly layer: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'bhd-layer bhd-drive';
    this.root = root;
    // ── trip strip ──
    // centred wrapper (the panel's pop-in animation owns its own transform)
    const strip = document.createElement('div');
    strip.style.cssText =
      'position:absolute;left:0;right:0;top:calc(10px + var(--bhd-safe-t, 0px));display:flex;justify-content:center;pointer-events:none;';
    this.strip = strip;
    const panel = document.createElement('div');
    panel.className = 'bhd-panel bhd-panel--sm bhd-pop';
    panel.style.cssText = 'width:min(440px,44vw);padding:6px 14px 5px;pointer-events:none;';
    this.panel = panel;
    strip.appendChild(panel);
    const track = document.createElement('div');
    track.style.cssText = 'position:relative;height:30px;margin:0 2px;';
    const line = document.createElement('div');
    line.style.cssText =
      'position:absolute;left:14px;right:14px;top:13px;height:5px;border-radius:3px;background:repeating-linear-gradient(90deg,#3a2330 0 8px,transparent 8px 13px);opacity:0.35;';
    track.appendChild(line);
    const pinAt = (el: HTMLElement, frac: number) => {
      el.style.position = 'absolute';
      el.style.top = '3px';
      el.style.left = `calc(14px + (100% - 28px) * ${frac.toFixed(4)} - 12px)`;
    };
    const home = document.createElement('div');
    home.appendChild(icon('home', 24));
    pinAt(home, 0);
    const school = document.createElement('div');
    school.appendChild(icon('school', 24));
    pinAt(school, 1);
    track.append(home, school);
    this.track = track;
    const van = document.createElement('div');
    van.appendChild(vanIcon());
    van.style.cssText = 'position:absolute;top:-4px;left:calc(14px - 17px);transition:none;filter:drop-shadow(0 2px 0 rgba(58,35,48,0.35));';
    this.van = van;
    track.appendChild(van);
    const next = document.createElement('div');
    next.style.cssText =
      'text-align:center;font-family:var(--bhd-font-ui);font-weight:800;font-size:13px;letter-spacing:0.04em;color:var(--bhd-plum);line-height:1.2;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    this.next = next;
    panel.append(track, next);
    root.appendChild(strip);
    // ── dashboard chips (mouse; glyphs for keys / pad) ──
    const dash = document.createElement('div');
    // a compact block in the bottom-right corner (clear of the centred prompt bar): HONK / BRAKE GAS / ◀ ▶
    dash.style.cssText =
      'position:absolute;right:calc(14px + var(--bhd-safe-r, 0px));bottom:calc(12px + var(--bhd-safe-b, 0px));display:grid;grid-template-columns:auto auto;gap:7px;justify-items:end;align-items:end;';
    const chip = (label: string, slot: string | null, down: () => void, up: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bhd-chip';
      if (slot) b.dataset.slot = slot;
      const t = document.createElement('span');
      t.textContent = label;
      b.appendChild(t);
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          b.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        down();
      };
      const onUp = () => up();
      b.addEventListener('pointerdown', onDown);
      b.addEventListener('pointerup', onUp);
      b.addEventListener('pointercancel', onUp);
      b.addEventListener('lostpointercapture', onUp);
      this.offs.push(() => {
        b.removeEventListener('pointerdown', onDown);
        b.removeEventListener('pointerup', onUp);
        b.removeEventListener('pointercancel', onUp);
        b.removeEventListener('lostpointercapture', onUp);
      });
      return b;
    };
    const honk = chip('HONK', 'alt', () => (this.honkQueued = true), () => {});
    honk.style.gridColumn = '1 / span 2';
    const lanes = document.createElement('div');
    lanes.style.cssText = 'grid-column:1 / span 2;display:flex;gap:7px;';
    lanes.append(
      chip('◀ LANE', null, () => (this.laneQueued = -1), () => {}),
      chip('LANE ▶', null, () => (this.laneQueued = 1), () => {}),
    );
    dash.append(
      honk,
      chip('BRAKE', 'secondary', () => (this.brakeHeld = true), () => (this.brakeHeld = false)),
      chip('GAS', 'primary', () => (this.gasHeld = true), () => (this.gasHeld = false)),
      lanes,
    );
    this.dash = dash;
    root.appendChild(dash);
    // ── fade (cut to the road) ──
    const fade = document.createElement('div');
    fade.style.cssText = 'position:absolute;inset:0;background:var(--bhd-cream,#fff6e9);opacity:0;transition:opacity 0.28s ease;pointer-events:none;';
    this.fade = fade;
    root.appendChild(fade);
    layer.appendChild(root);
    this.setDriving(false);
  }

  /** Event pins along the trip (0..1). */
  setPins(pins: readonly HudPin[]): void {
    for (const el of this.pins) el.remove();
    this.pins.length = 0;
    for (const p of pins) {
      const el = document.createElement('div');
      el.appendChild(icon(p.kind, 20));
      el.style.position = 'absolute';
      el.style.top = '5px';
      el.style.left = `calc(14px + (100% - 28px) * ${Math.max(0.05, Math.min(0.95, p.at)).toFixed(4)} - 10px)`;
      el.style.transition = 'opacity 0.4s';
      this.track.insertBefore(el, this.van);
      this.pins.push(el);
    }
  }

  /** Show / hide the driving widgets (strip + dashboard). */
  setDriving(on: boolean): void {
    this.strip.style.display = on ? 'flex' : 'none';
    this.dash.style.display = on && this.dashShown ? 'grid' : 'none';
    if (!on) {
      this.gasHeld = false;
      this.brakeHeld = false;
    }
  }

  /** Touch players use the overlay's buttons instead of the dashboard chips. */
  setTouch(touch: boolean, driving: boolean): void {
    const show = !touch;
    if (show === this.dashShown) return;
    this.dashShown = show;
    this.dash.style.display = driving && show ? 'grid' : 'none';
    if (!show) {
      this.gasHeld = false;
      this.brakeHeld = false;
    }
  }

  /** Narrow screens: move the strip below the HUD's clock card. */
  layout(narrow: boolean): void {
    this.strip.style.top = narrow ? 'calc(124px + var(--bhd-safe-t, 0px))' : 'calc(10px + var(--bhd-safe-t, 0px))';
    this.panel.style.width = narrow ? 'min(440px,86vw)' : 'min(440px,44vw)';
  }

  update(frac: number, nextLabel: string, resolved: readonly boolean[]): void {
    const f = Math.max(0, Math.min(1, frac));
    if (Math.abs(f - this.lastFrac) > 0.001) {
      this.lastFrac = f;
      this.van.style.left = `calc(14px + (100% - 28px) * ${f.toFixed(4)} - 17px)`;
    }
    if (nextLabel !== this.lastNext) {
      this.lastNext = nextLabel;
      this.next.textContent = nextLabel;
    }
    for (let i = 0; i < this.pins.length; i++) {
      const el = this.pins[i]!;
      const done = resolved[i] === true;
      const want = done ? '0.35' : '1';
      if (el.style.opacity !== want) el.style.opacity = want;
    }
  }

  takeHonk(): boolean {
    const h = this.honkQueued;
    this.honkQueued = false;
    return h;
  }

  takeLane(): -1 | 0 | 1 {
    const l = this.laneQueued;
    this.laneQueued = 0;
    return l;
  }

  setFade(v: number): void {
    this.fade.style.opacity = String(Math.max(0, Math.min(1, v)));
  }

  showEndCard(arrival: string): void {
    if (this.end) return;
    const wrap = document.createElement('div');
    wrap.className = 'bhd-center';
    wrap.style.pointerEvents = 'none';
    const card = document.createElement('div');
    card.className = 'bhd-panel bhd-pop';
    card.style.cssText = 'padding:22px 30px 18px;max-width:min(620px,88vw);text-align:center;pointer-events:none;transform:rotate(-1deg);';
    const hearts = document.createElement('div');
    hearts.textContent = '♥ ♥ ♥';
    hearts.style.cssText = 'color:var(--bhd-heart,#ff6b8a);font-size:22px;letter-spacing:0.3em;margin-bottom:6px;';
    const title = document.createElement('div');
    title.className = 'bhd-display';
    title.textContent = 'Somehow, everybody makes it out the door.';
    title.style.cssText = 'font-size:clamp(24px,4.6vw,42px);line-height:1.12;color:var(--bhd-plum);';
    const tag = document.createElement('div');
    tag.className = 'bhd-tag bhd-tag--mint';
    tag.textContent = `ARRIVED ${arrival}`;
    tag.style.marginTop = '12px';
    card.append(hearts, title, tag);
    wrap.appendChild(card);
    this.root.appendChild(wrap);
    this.end = wrap;
    this.setDriving(false);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.root.remove();
    void this.layer;
  }
}
