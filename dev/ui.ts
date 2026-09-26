// UI gallery (dev only): every screen and in-game presentation piece over a static fake dollhouse.
//   dev/ui.html?show=title|boot|menu|family[&tab=N]|settings|howto[&tab=1]|credits|pause|results
//                    |hud|actcard:<predawn|sunrise|morning|bright>|banner:<secured|legendary|boss|approved|info|fun>
//                    |boss|bubbles|choice|portraits|prompt:<keyboard|playstation|xbox|nintendo|touch>|toast
//                    |icons|kit|touch
//   &device=keyboard|gamepad|touch &pad=playstation|xbox|nintendo|generic  (glyph style)
//   &blink=1 (hud clock held), &reduced=1
import { createUI } from '../src/ui';
import type { UiController } from '../src/ui/controller';
import { ICON_IDS, iconSvg } from '../src/ui/icons';
import { faceSvg } from '../src/ui/faces';
import { CONTROL_ICONS, controlIconSvg } from '../src/input/icons';
import { TouchOverlay } from '../src/input/touch';
import type { ControlScheme, InputDevice, PadStyle } from '../src/input/types';
import { DEFAULT_SETTINGS, type FamilySetup, type Stats } from '../src/storage/types';
import type { MorningReport } from '../src/plan/types';
import type { ActCard, BannerStyle, HudState, PortraitRow } from '../src/ui/types';
import type { Projector, Vec3Like } from '../src/render/types';

const params = new URLSearchParams(location.search);
const show = params.get('show') ?? 'title';
const [what, arg = ''] = show.split(':');
const app = document.getElementById('app') as HTMLElement;
if (params.get('reduced') === '1') app.classList.add('bhd-reduced-motion');

// ── fake scene ───────────────────────────────────────────────────────────────
const fake = document.createElement('div');
fake.className = 'fake';
fake.innerHTML =
  '<div class="fake__floor"></div><div class="fake__win" style="left:12%"></div><div class="fake__win" style="left:70%"></div>' +
  '<div class="fake__lamp" style="left:36%;top:10%"></div><div class="fake__sofa" style="left:8%"></div><div class="fake__rug"></div>';
if (what === 'actcard' || what === 'hud' || what === 'bubbles') fake.dataset.sky = 'night';
app.appendChild(fake);

// Fake projector: world metres → screen px around a ground line.
const projector: Projector = {
  project(p: Vec3Like, out: { x: number; y: number; visible: boolean }): void {
    const w = app.clientWidth;
    const h = app.clientHeight;
    const s = Math.min(w, h) / 6;
    out.x = w / 2 + p.x * s;
    out.y = h * 0.8 - p.y * s + p.z * s * 0.3;
    out.visible = p.z > -50 && out.x > -40 && out.x < w + 40 && out.y > -40 && out.y < h + 40;
  },
};

function pal(x: number, y: number, color: string, dog = false): void {
  const d = document.createElement('div');
  d.className = 'fake__pal' + (dog ? ' fake__pal--dog' : '');
  d.style.background = color;
  const out = { x: 0, y: 0, visible: true };
  const place = (): void => {
    projector.project({ x, y, z: 0 }, out);
    d.style.left = `${out.x}px`;
    d.style.top = `${out.y}px`;
  };
  place();
  addEventListener('resize', place);
  fake.appendChild(d);
}

// ── fake data ────────────────────────────────────────────────────────────────
const family: FamilySetup = {
  looks: {
    members: {
      chris: { skin: 1, hair: 0x44291b, eyes: 0x4a2e1f, glasses: true, beard: 'beard' },
      ashley: { skin: 2, hair: 0x6b3d24, eyes: 0x4f7f4f, glasses: false, beard: 'none' },
      addy: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
      ellie: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: true, beard: 'none' },
      heidi: { skin: 1, hair: 0xbf8a48, eyes: 0x3f6f9f, glasses: false, beard: 'none' },
    },
    dog: { name: 'Biscuit', coat: 'golden' },
  },
  coffee: 'creamSugar',
};
const stats: Stats = {
  mornings: 12,
  bestArrival: 7 * 60 + 56,
  totalStars: 212,
  bestStars: 25,
  awards: { dog: 3 },
  daily: {},
  momApproved: 20,
  playSeconds: 9000,
};
const report: MorningReport = {
  seed: 48213,
  daily: false,
  dateKey: null,
  arrival: 7 * 60 + 58,
  records: [
    { id: 'dog', label: 'Dog out', stars: 3, flags: [] },
    { id: 'coffee', label: 'Ashley’s coffee', stars: 3, flags: [] },
    { id: 'lunch', label: 'Lunchboxes', stars: 2, flags: [] },
    { id: 'dishes', label: 'Dishes', stars: 0, flags: [] },
    { id: 'wake', label: 'Wake up, girls!', stars: 2, flags: [] },
    { id: 'hair', label: 'Three heads of hair', stars: 3, flags: [] },
    { id: 'rush', label: 'Out the door', stars: 2, flags: [] },
    { id: 'drive', label: 'The school run', stars: 3, flags: [] },
  ],
  totalStars: 18,
  maxStars: 24,
  grade: { title: 'SMOOTH OPERATOR', blurb: 'Coffee made, hair brushed, nobody forgot a shoe. Well… almost nobody.' },
  awards: [
    { id: 'coffee', title: 'Coffee Artisan', blurb: 'Exactly how she likes it.', icon: 'coffee' },
    { id: 'bbmvp', title: 'Black Brush MVP', blurb: 'Ellie held it longest.', icon: 'blackBrush' },
    { id: 'mom3', title: 'Mom Approved ×3', blurb: 'Three shiny heads of hair.', icon: 'heart' },
    { id: 'leaf', title: 'Leaf Chaser', blurb: 'Biscuit found a very good leaf.', icon: 'dog' },
  ],
  newBestArrival: false,
  playSeconds: 812,
};

const hud: HudState = {
  clock: 5 * 60 + 38,
  clockBlink: params.get('blink') === '1',
  actLabel: 'ACT I · CHRIS’S EARLY SHIFT',
  tasks: [
    { id: 'dog', label: 'Take Biscuit out', icon: 'dog', state: 'done', stars: 3 },
    { id: 'coffee', label: 'Ashley’s coffee', icon: 'coffee', state: 'active' },
    { id: 'lunch', label: 'Pack lunchboxes', icon: 'lunch', state: 'todo' },
    { id: 'trash', label: 'Trash out', icon: 'trash', state: 'todo' },
    { id: 'dishes', label: 'Dishes', icon: 'dishes', state: 'skipped' },
  ],
  objective: 'Make Ashley’s coffee — the sunflower mug!',
  meters: [{ id: 'quiet', label: 'QUIET', value: 0.72, color: 'var(--bhd-sky)', icon: 'bed' }],
  pauseButton: true,
};

const ACT_CARDS: Record<string, ActCard> = {
  predawn: { time: '5:15 AM', act: 'ACT I', title: 'CHRIS’S EARLY SHIFT', subtitle: 'EVERYBODY ELSE IS STILL ASLEEP.', mood: 'predawn' },
  sunrise: { time: '6:00 AM', act: 'ACT II', title: 'WAKE UP, GIRLS!', subtitle: 'RISE AND SHINE, SLEEPYHEADS.', mood: 'sunrise' },
  morning: { time: '6:30 AM', act: 'ACT III', title: 'THE BLACK BRUSH', subtitle: 'EVERYBODY WANTS IT.', mood: 'morning' },
  bright: { time: '7:50 AM', act: 'ACT V', title: 'THE SCHOOL RUN', subtitle: 'BUCKLE UP, BUTTERCUPS.', mood: 'bright' },
};

const BANNERS: Record<BannerStyle, [string, string]> = {
  secured: ['COFFEE: SECURED', 'Sunflower mug · cream & sugar'],
  legendary: ['THE BLACK BRUSH HAS SPAWNED', 'EVERYBODY WANTS IT'],
  boss: ['MOM IS CHECKING THE HAIR', 'Look your shiniest!'],
  approved: ['MOM APPROVED ✓', 'Addy did it all by herself!'],
  info: ['7:45 — ASHLEY LEAVES FOR WORK', ''],
  fun: ['WRONG DOOR.', 'Biscuit gives you a look.'],
};

const portraits: PortraitRow = {
  compact: params.get('compact') === '1',
  items: [
    { id: 'addy', name: 'ADDY', color: 'var(--bhd-addy)', progress: 0.97, goal: 0.95, status: 'I’M DONE!', badge: null, mood: 'proud' },
    { id: 'ellie', name: 'ELLIE', color: 'var(--bhd-ellie)', progress: 0.46, goal: 0.95, status: 'Big bedhead', badge: 'blackBrush', focused: true, mood: 'happy' },
    { id: 'heidi', name: 'HEIDI', color: 'var(--bhd-heidi)', progress: 0.2, goal: 0.95, status: 'Oops!', badge: null, mood: params.get('mood') === 'dramatic' ? 'dramatic' : 'eek' },
  ],
  chips: [
    { id: 'pass', label: 'PASS THE BLACK BRUSH', slot: 'secondary', icon: 'blackBrush' },
    { id: 'done', label: 'SHE’S DONE', slot: 'alt', icon: 'check' },
    ...(params.get('chips') === '3' ? [{ id: 'mom', label: 'CALL MOM', icon: 'eye' as const }] : []),
  ],
};

const scheme: ControlScheme = {
  move: 'xy',
  moveLabel: 'MOVE',
  primary: { label: 'BRUSH', icon: 'brush', hold: true },
  secondary: { label: 'PASS', icon: 'pass' },
  alt: { label: 'DONE', icon: 'done' },
};

// ── UI ───────────────────────────────────────────────────────────────────────
const ui = createUI({ root: app, projector }) as UiController;
const log: string[] = [];
ui.onCommand((c) => log.push(JSON.stringify(c)));
window.__DEV__ = { ready: false, ui, log };

const device = (params.get('device') as InputDevice | null) ?? (arg === 'touch' ? 'touch' : arg && what === 'prompt' && arg !== 'keyboard' ? 'gamepad' : 'keyboard');
const pad = (params.get('pad') as PadStyle | null) ?? (what === 'prompt' && arg !== 'keyboard' && arg !== 'touch' ? (arg as PadStyle) : 'playstation');
ui.setInputDevice(device, pad);

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  ui.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const data = { settings: DEFAULT_SETTINGS, family, stats, dailyBest: 21 };
const ready = (): void => {
  if (window.__DEV__) window.__DEV__.ready = true;
};
const later = (ms: number, fn: () => void): void => {
  setTimeout(fn, ms);
};

function touchOverlay(): TouchOverlay {
  const t = new TouchOverlay(app, { onButton() {} });
  t.setScheme(scheme);
  t.setVisible(true);
  return t;
}

switch (what) {
  case 'boot':
    void ui.boot();
    ready();
    break;
  case 'splash':
    // The static index.html splash block (exactly as shipped), shown on top.
    void fetch('../index.html')
      .then((r) => r.text())
      .then((html) => {
        const a = html.indexOf('<!-- BEGIN loading splash');
        const b = html.indexOf('<!-- END loading splash -->');
        const holder = document.createElement('div');
        holder.innerHTML = html.slice(a, b); // trusted: our own index.html
        document.body.appendChild(holder);
        later(300, ready);
      });
    break;
  case 'title':
    ui.showScreen('title', data);
    ready();
    break;
  case 'menu':
    ui.showScreen('menu', data);
    ready();
    break;
  case 'family': {
    ui.showScreen('menu', data);
    ui.showScreen('family', data);
    const tab = Number(arg || params.get('tab') || 0);
    for (let i = 0; i < tab; i++) ui.handleMenuActions(['next']);
    if (params.get('row')) for (let i = 0; i < Number(params.get('row')); i++) ui.handleMenuActions(['down']);
    ready();
    break;
  }
  case 'settings':
    ui.showScreen('menu', data);
    ui.showScreen('settings', data);
    if (params.get('row')) for (let i = 0; i < Number(params.get('row')); i++) ui.handleMenuActions(['down']);
    ready();
    break;
  case 'howto':
    ui.showScreen('menu', data);
    ui.showScreen('howto', data);
    if (arg === '1' || params.get('tab') === '1') ui.handleMenuActions(['right']);
    ready();
    break;
  case 'credits':
    ui.showScreen('menu', data);
    ui.showScreen('credits', data);
    ready();
    break;
  case 'pause':
    ui.showScreen('none', data);
    ui.setHud(hud);
    ui.showScreen('pause', data);
    if (arg === 'quit') ui.handleMenuActions(['down', 'down', 'down', 'down', 'confirm']);
    ready();
    break;
  case 'results':
    ui.showScreen('results', { ...data, report });
    if (arg !== 'anim') later(200, () => ui.handleMenuActions(['confirm']));
    later(400, ready);
    break;
  case 'hud':
    ui.showScreen('none', data);
    ui.setHud(hud);
    ui.prompt({ text: 'Open the back door', slot: 'primary' });
    pal(-1.5, 0, '#33507a');
    pal(-0.5, 0, '#e0a458', true);
    ready();
    break;
  case 'actcard': {
    ui.showScreen('none', data);
    ui.setCardTimeScale(0);
    void ui.actCard(ACT_CARDS[arg] ?? ACT_CARDS.predawn!);
    ready();
    break;
  }
  case 'banner': {
    ui.showScreen('none', data);
    ui.setHud({ ...hud, tasks: hud.tasks?.slice(0, 3) });
    const style = (arg || 'secured') as BannerStyle;
    const [t, s] = BANNERS[style] ?? BANNERS.info;
    const pos = params.get('pos');
    ui.banner(t, style, { sub: s, seconds: 60, pos: pos === 'top' || pos === 'bottom' ? pos : 'center' });
    ready();
    break;
  }
  case 'boss':
    ui.showScreen('none', data);
    void ui.bossIntro('MOM', 'THE HAIR INSPECTOR');
    if (params.get('pause')) later(3200, ready);
    else {
      // Freeze once the heart bar is full (dt-driven; software GL runs at a low frame rate).
      const poll = setInterval(() => {
        if (ui.bossView.heartsLit >= 10) {
          ui.setCardTimeScale(0);
          clearInterval(poll);
          later(900, ready);
        }
      }, 50);
    }
    break;
  case 'bubbles': {
    ui.showScreen('none', data);
    ui.setHud({ clock: 6 * 60 + 12, actLabel: 'ACT II · WAKE UP, GIRLS!', pauseButton: true });
    pal(-2.6, 0, '#a78bfa');
    pal(-0.9, 0, '#4fd1b5');
    pal(0.8, 0, '#ff8a8a');
    pal(2.5, 0, '#33507a');
    pal(1.6, -0.9, '#e0a458', true);
    ui.bubble({ x: -2.6, y: 1.35, z: 0 }, 'GOOD MORNING!!!', { speaker: 'addy', style: 'shout', seconds: 999 });
    ui.bubble({ x: -0.9, y: 1.35, z: 0 }, 'five more minutes…', { speaker: 'ellie', style: 'think', seconds: 999 });
    ui.bubble({ x: 0.8, y: 1.35, z: 0 }, 'la la la, sunshine!', { speaker: 'heidi', style: 'sing', seconds: 999 });
    ui.bubble({ x: 2.5, y: 1.35, z: 0 }, 'shh… the girls are sleeping', { speaker: 'chris', style: 'whisper', seconds: 999 });
    ui.bubble({ x: 1.6, y: -0.35, z: 0 }, 'Woof? Is it breakfast?', { speaker: 'dog', style: 'say', seconds: 999 });
    ui.bubble({ x: 3.6, y: 3.1, z: 0 }, 'Love you! Have a great day!', { speaker: 'ashley', style: 'say', seconds: 999 });
    later(900, ready);
    break;
  }
  case 'choice':
    ui.showScreen('none', data);
    void ui.choice(
      'WHO GETS THE BLACK BRUSH FIRST?',
      [
        { id: 'addy', label: 'ADDY', sub: 'Grabbed it first!', color: 'var(--bhd-addy)', badge: 'blackBrush' },
        { id: 'ellie', label: 'ELLIE', sub: 'Big bedhead', color: 'var(--bhd-ellie)' },
        { id: 'heidi', label: 'HEIDI', sub: 'Picture day!', color: 'var(--bhd-heidi)' },
      ],
      { subtitle: 'Everybody wants it. You decide.', defaultId: 'addy' },
    ).then((id) => log.push('choice:' + id));
    later(800, ready);
    break;
  case 'portraits':
    ui.showScreen('none', data);
    if (portraits.compact) fake.style.background = 'radial-gradient(ellipse 30% 40% at 50% 38%, #f9d0ae 0 60%, #6b3d24 61% 100%), linear-gradient(#d2e6f2, #cfe6f2)';
    ui.setHud({
      clock: 6 * 60 + 52,
      actLabel: 'ACT III · HAIR TIME',
      tasks: [
        { id: 'hair', label: 'Brush three heads', icon: 'brush', state: 'active' },
        { id: 'mom', label: 'Mom’s hair check', icon: 'eye', state: 'todo' },
      ],
      objective: 'Brush from the ends up!',
      pauseButton: true,
    });
    ui.portraits(portraits);
    ui.instruction('Start low — work the ends first!', 'Gentle strokes. Slow and smooth.');
    ui.prompt({ text: 'Hold & drag to brush', slot: 'pointer' });
    if (device === 'touch') touchOverlay();
    later(600, ready);
    break;
  case 'prompt': {
    ui.showScreen('none', data);
    ui.setHud({ clock: 5 * 60 + 20, actLabel: 'ACT I · CHRIS’S EARLY SHIFT', pauseButton: true });
    if (device === 'touch') touchOverlay();
    pal(0, 0, '#33507a');
    ui.prompt({ text: 'Call Biscuit', slot: 'secondary', at: { x: 0, y: 1.9, z: 0 } });
    // A sample activity DOM using the UI kit: glyph pills + chips + a gauge + a meter.
    const layer = ui.activityLayer();
    const box = document.createElement('div');
    box.className = 'bhd-panel bhd-pop';
    box.style.cssText = 'position:absolute;left:50%;top:22%;transform:translateX(-50%);padding:14px 18px;display:flex;flex-direction:column;gap:10px;align-items:center';
    box.innerHTML =
      '<div class="bhd-row"><span class="bhd-glyph" data-slot="primary">Brew</span><span class="bhd-glyph" data-slot="secondary">Treat bag</span><span class="bhd-glyph" data-slot="alt">Done</span></div>' +
      '<div class="bhd-row"><span class="bhd-glyph" data-slot="move">Walk</span><span class="bhd-glyph" data-slot="switch">Switch girl</span><span class="bhd-glyph" data-slot="pause">Pause</span></div>' +
      '<div class="bhd-row"><button class="bhd-chip" data-slot="primary">GRAB</button><button class="bhd-chip" data-slot="secondary">PASS</button></div>';
    layer.appendChild(box);
    ui.prompt({ text: 'Open the back door', slot: 'primary' });
    // Show both prompts: the bottom one via the API, the anchored one cloned as a static sample.
    later(50, () => {
      const anchored = document.createElement('div');
      anchored.className = 'bhd-panel bhd-panel--sm';
      anchored.style.cssText = 'position:absolute;left:50%;top:60%;transform:translate(-50%,-100%);padding:6px 12px';
      anchored.innerHTML = '<span class="bhd-glyph" data-slot="secondary">Call Biscuit</span>';
      layer.appendChild(anchored);
    });
    later(500, ready);
    break;
  }
  case 'toast':
    ui.showScreen('none', data);
    ui.setHud({ clock: 7 * 60 + 22, actLabel: 'ACT IV · OUT THE DOOR', pauseButton: true });
    ui.toast('Found: Heidi’s left shoe!', 'shoe', 60);
    ui.toast('Biscuit is “helping”.', 'dog', 60);
    ui.toast('Lunchboxes packed into backpacks ♥', 'lunch', 60);
    ready();
    break;
  case 'kit': {
    ui.showScreen('none', data);
    const layer = ui.activityLayer();
    const wrap = document.createElement('div');
    wrap.className = 'bhd-center';
    wrap.innerHTML =
      '<div class="bhd-panel" style="padding:18px 22px;display:flex;gap:22px;align-items:flex-end">' +
      '<div class="bhd-gauge" style="--value:.62;--band-lo:.7;--band-hi:.82"></div>' +
      '<div class="bhd-gauge" style="--value:.76;--band-lo:.7;--band-hi:.82;--color:#a8784f"></div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;width:260px">' +
      '<div class="bhd-meter" style="--value:.4"><div class="bhd-meter__fill"></div></div>' +
      '<div class="bhd-meter" style="--value:.8;--color:var(--bhd-coral)"><div class="bhd-meter__fill"></div></div>' +
      '<div class="bhd-row"><span class="bhd-swatch" style="--sw:#a78bfa"></span><span class="bhd-swatch is-selected" style="--sw:#4fd1b5"></span><span class="bhd-swatch" style="--sw:#ff8a8a"></span></div>' +
      '<div class="bhd-row"><span class="bhd-tag">NEW</span><span class="bhd-tag bhd-tag--coral">FAVE ♥</span><span class="bhd-tag bhd-tag--mint">GOOD</span><span class="bhd-tag bhd-tag--soft">LATER</span></div>' +
      '<div class="bhd-row"><button class="bhd-btn bhd-btn--primary">PRIMARY</button><button class="bhd-btn">BUTTON</button></div>' +
      '<div class="bhd-row"><button class="bhd-chip" data-slot="primary">GRAB</button><span class="bhd-glyph bhd-wiggle" data-slot="alt">Hold</span></div>' +
      '</div></div>';
    layer.appendChild(wrap);
    later(300, ready);
    break;
  }
  case 'faces': {
    const grid = document.createElement('div');
    grid.className = 'dev-grid';
    grid.style.gridTemplateColumns = 'repeat(6, 1fr)';
    for (const who of ['addy', 'ellie', 'heidi', 'ashley', 'chris'] as const)
      for (const mood of ['happy', 'neutral', 'eek', 'proud', 'sleepy', 'dramatic'] as const)
        grid.insertAdjacentHTML('beforeend', `<div class="dev-cell"><div style="width:96px;height:96px">${faceSvg({ who, look: family.looks.members[who], mood })}</div><span>${who} · ${mood}</span></div>`);
    app.appendChild(grid);
    ready();
    break;
  }
  case 'icons': {
    const grid = document.createElement('div');
    grid.className = 'dev-grid';
    for (const id of ICON_IDS) grid.insertAdjacentHTML('beforeend', `<div class="dev-cell">${iconSvg(id)}<span>${id}</span></div>`);
    for (const id of CONTROL_ICONS)
      grid.insertAdjacentHTML('beforeend', `<div class="dev-cell"><div class="row"><span class="dev-btn dev-btn--p">${controlIconSvg(id)}</span><span class="dev-btn dev-btn--s">${controlIconSvg(id)}</span></div><span>${id}</span></div>`);
    app.appendChild(grid);
    ready();
    break;
  }
  case 'touch':
    ui.showScreen('none', data);
    ui.setHud({ clock: 5 * 60 + 31, actLabel: 'ACT I · CHRIS’S EARLY SHIFT', objective: 'Walk to the back door', pauseButton: true });
    ui.setInputDevice('touch', 'generic');
    touchOverlay();
    ui.prompt({ text: 'Brush gently', slot: 'primary', hold: true });
    later(400, ready);
    break;
  default:
    ui.showScreen('title', data);
    ready();
}

// &pause=N: open the pause menu N ms after the view is up (stacking / freeze checks).
if (params.get('pause')) later(Number(params.get('pause')) || 1200, () => ui.showScreen('pause', data));
