// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUI, formatClock } from '../../src/ui';
import { UiController, UI_SOUND_EVENT } from '../../src/ui/controller';
import type { FamilyScreen } from '../../src/ui/screens/family';
import type { PauseScreen } from '../../src/ui/screens/menus';
import type { ResultsScreen } from '../../src/ui/screens/results';
import type { MenuAction } from '../../src/input/types';
import type { MorningReport } from '../../src/plan/types';
import type { Projector, Vec3Like } from '../../src/render/types';
import { DEFAULT_SETTINGS, type FamilySetup } from '../../src/storage/types';
import type { HudState, UiCommand } from '../../src/ui/types';

// ── helpers ──────────────────────────────────────────────────────────────────

class FakeProjector implements Projector {
  visible = true;
  project(p: Vec3Like, out: { x: number; y: number; visible: boolean }): void {
    out.x = 400 + p.x * 100;
    out.y = 500 - p.y * 100;
    out.visible = this.visible;
  }
}

function family(dogName = 'Biscuit'): FamilySetup {
  return {
    looks: {
      members: {
        chris: { skin: 1, hair: 0x44291b, eyes: 0x4a2e1f, glasses: false, beard: 'beard' },
        ashley: { skin: 2, hair: 0x6b3d24, eyes: 0x4f7f4f, glasses: false, beard: 'none' },
        addy: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
        ellie: { skin: 1, hair: 0x6b3d24, eyes: 0x6b4a2b, glasses: false, beard: 'none' },
        heidi: { skin: 1, hair: 0xbf8a48, eyes: 0x3f6f9f, glasses: false, beard: 'none' },
      },
      dog: { name: dogName, coat: 'golden' },
    },
    coffee: 'splash',
  };
}

const REPORT: MorningReport = {
  seed: 7,
  daily: true,
  dateKey: '2026-09-26',
  arrival: 7 * 60 + 58,
  records: [
    { id: 'dog', label: 'Dog out', stars: 3, flags: [] },
    { id: 'coffee', label: 'Coffee', stars: 2, flags: [] },
    { id: 'dishes', label: 'Dishes', stars: 0, flags: [] },
    { id: 'hair', label: 'Hair', stars: 1, flags: [] },
  ],
  totalStars: 6,
  maxStars: 9,
  grade: { title: 'WE MADE IT!', blurb: 'Everybody out the door.' },
  awards: [
    { id: 'a', title: 'Dog Whisperer', blurb: 'Good dog.', icon: 'dog' },
    { id: 'b', title: 'Coffee Artisan', blurb: 'Perfect.', icon: 'coffee' },
    { id: 'c', title: 'Mystery', blurb: 'Unknown icon falls back.', icon: 'not-an-icon' },
  ],
  newBestArrival: false,
  playSeconds: 600,
};

const HUD: HudState = {
  clock: 315,
  actLabel: 'ACT I · CHRIS’S EARLY SHIFT',
  tasks: [
    { id: 'dog', label: 'Dog out', icon: 'dog', state: 'active' },
    { id: 'coffee', label: 'Coffee', icon: 'coffee', state: 'todo' },
  ],
  objective: 'Open the back door',
  meters: [{ id: 'quiet', label: 'QUIET', value: 0.5, color: 'var(--bhd-sky)' }],
  pauseButton: true,
};

function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.id = 'app';
  document.body.appendChild(root);
  const projector = new FakeProjector();
  const ui = createUI({ root, projector }) as UiController;
  const cmds: UiCommand[] = [];
  ui.onCommand((c) => cmds.push(c));
  const sounds: string[] = [];
  root.addEventListener(UI_SOUND_EVENT, (e) => sounds.push((e as CustomEvent).detail.kind));
  const act = (...a: MenuAction[]): boolean => {
    let any = false;
    for (const x of a) any = ui.handleMenuActions([x]) || any;
    return any;
  };
  const focused = (): HTMLElement | null => ui.screenEl(ui.screen).querySelector('.is-focused');
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) ui.update(Math.min(0.1, seconds - t));
  };
  const data = { settings: DEFAULT_SETTINGS, family: family(), dailyBest: null };
  return { ui, root, projector, cmds, sounds, act, focused, run, data };
}

function click(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

const label = (el: Element | null): string => el?.querySelector('.bhd-btn__label')?.textContent ?? el?.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('createUI', () => {
  it('appends the .bhd-ui layer, starts on no screen and exports formatClock', () => {
    const { ui, root } = setup();
    expect(root.querySelector(':scope > .bhd-ui')).not.toBeNull();
    expect(ui.screen).toBe('none');
    expect(formatClock(315)).toBe('5:15 AM');
    ui.dispose();
    expect(root.querySelector('.bhd-ui')).toBeNull();
  });

  it('boot() shows the splash then resolves on the title', async () => {
    vi.useFakeTimers();
    const { ui } = setup();
    const p = ui.boot();
    await vi.advanceTimersByTimeAsync(2500);
    await p;
    expect(ui.screen).toBe('title');
  });
});

describe('menus & focus navigation', () => {
  it('title: any button goes to the menu', () => {
    const { ui, act, data } = setup();
    ui.showScreen('title', data);
    expect(act('confirm')).toBe(true);
    expect(ui.screen).toBe('menu');
  });

  it('menu: keyboard/pad focus moves through every item and confirm emits commands', () => {
    const { ui, act, focused, cmds, sounds, data } = setup();
    ui.showScreen('menu', data);
    expect(label(focused())).toBe('NEW MORNING');
    act('down');
    expect(label(focused())).toBe('DAILY MORNING');
    act('down');
    expect(label(focused())).toBe('FAMILY SETUP');
    act('right');
    expect(label(focused())).toBe('HOW TO PLAY');
    act('down');
    expect(label(focused())).toBe('CREDITS');
    act('left');
    expect(label(focused())).toBe('SETTINGS');
    act('up', 'up', 'up');
    expect(label(focused())).toBe('NEW MORNING');
    expect(sounds).toContain('move');
    act('confirm');
    expect(cmds).toEqual([{ type: 'newMorning' }]);
    act('down', 'confirm');
    expect(cmds[1]).toEqual({ type: 'dailyMorning' });
  });

  it('menu: every focusable item carries exactly one focus ring', () => {
    const { ui, act, data } = setup();
    ui.showScreen('menu', data);
    for (let i = 0; i < 8; i++) {
      act('next');
      expect(ui.screenEl('menu').querySelectorAll('.is-focused').length).toBe(1);
    }
  });

  it('sub-screens push and pop (menu → settings → back → menu; pause → howto → back → pause)', () => {
    const { ui, act, data, cmds } = setup();
    ui.showScreen('menu', data);
    act('down', 'down', 'down', 'confirm'); // SETTINGS
    expect(ui.screen).toBe('settings');
    act('back');
    expect(ui.screen).toBe('menu');
    ui.showScreen('none', data);
    ui.showScreen('pause', data);
    act('down', 'down', 'confirm'); // HOW TO PLAY
    expect(ui.screen).toBe('howto');
    act('back');
    expect(ui.screen).toBe('pause');
    expect(cmds).toEqual([]);
  });

  it('mouse clicks activate menu buttons', () => {
    const { ui, cmds, data } = setup();
    ui.showScreen('menu', data);
    const btns = [...ui.screenEl('menu').querySelectorAll<HTMLButtonElement>('.bhd-btn')];
    click(btns.find((b) => label(b) === 'DAILY MORNING')!);
    expect(cmds).toEqual([{ type: 'dailyMorning' }]);
    click(ui.screenEl('menu').querySelector('.bhd-menu__full')!);
    expect(cmds[1]).toEqual({ type: 'fullscreen' });
  });

  it('mute action emits a settings patch and a toast', () => {
    const { ui, act, cmds } = setup();
    ui.showScreen('none');
    expect(act('mute')).toBe(true);
    expect(cmds).toEqual([{ type: 'settings', patch: { muted: true } }]);
    expect(ui.debug.toasts).toContain('Sound off');
  });
});

describe('pause', () => {
  it('pause / back resume; restart + quit go through a friendly confirm', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('none', data);
    expect(act('pause')).toBe(false); // gameplay: the game handles 'pause'
    ui.showScreen('pause', data);
    act('pause');
    expect(cmds.pop()).toEqual({ type: 'resume' });
    act('back');
    expect(cmds.pop()).toEqual({ type: 'resume' });
    act('confirm'); // RESUME focused
    expect(cmds.pop()).toEqual({ type: 'resume' });
    act('down', 'down', 'down', 'down', 'confirm'); // QUIT TO MENU
    const pause = (ui as UiController).screens.pause as PauseScreen;
    expect(pause.confirming).toBe(true);
    expect(cmds).toEqual([]);
    act('back'); // closes the confirm, not the pause
    expect(pause.confirming).toBe(false);
    expect(cmds).toEqual([]);
    act('confirm'); // QUIT again (focus kept)
    act('right', 'confirm'); // YES
    expect(cmds).toEqual([{ type: 'quitToMenu' }]);
  });

  it('restart morning emits restartMorning after YES', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('pause', data);
    act('down', 'confirm', 'right', 'confirm');
    expect(cmds).toEqual([{ type: 'restartMorning' }]);
  });
});

describe('settings', () => {
  it('adjusting rows emits settings patches and updates the rows', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('settings', data);
    act('right'); // master 0.85 → 0.95
    expect(cmds[0]).toEqual({ type: 'settings', patch: { master: 0.95 } });
    act('down', 'down', 'down', 'confirm'); // mute toggle
    expect(cmds[1]).toEqual({ type: 'settings', patch: { muted: true } });
    const toggle = ui.screenEl('settings').querySelectorAll('.bhd-toggle')[0]!;
    expect(toggle.classList.contains('is-on')).toBe(true);
    for (let i = 0; i < 5; i++) act('down'); // → Graphics
    act('right');
    expect(cmds[2]).toEqual({ type: 'settings', patch: { quality: 'high' } });
    act('down', 'down', 'right'); // Buttons on the → left
    expect(cmds[3]).toEqual({ type: 'settings', patch: { touchHand: 'left' } });
    expect(ui.debug.settings.touchHand).toBe('left');
  });

  it('reduced motion (setting or #app class) flags the layer', () => {
    const { ui, root, data } = setup();
    expect(ui.layer.dataset.motion).toBe('full');
    ui.showScreen('settings', { ...data, settings: { ...DEFAULT_SETTINGS, reducedMotion: true } });
    expect(ui.layer.dataset.motion).toBe('reduced');
    ui.showScreen('settings', data);
    expect(ui.layer.dataset.motion).toBe('full');
    root.classList.add('bhd-reduced-motion');
    expect(ui.reducedMotion()).toBe(true);
  });

  it('leaving the game for the menu clears transient bubbles and banners', () => {
    const { ui, data } = setup();
    ui.showScreen('none', data);
    ui.bubble({ x: 0, y: 0, z: 0 }, 'hi', { seconds: 30 });
    ui.banner('COFFEE: SECURED', 'secured');
    ui.showScreen('menu', data);
    expect(ui.debug.bubbles).toBe(0);
    expect(ui.debug.banner).toBeNull();
    expect(ui.layer.dataset.mode).toBe('menu');
  });

  it('reset stats is two-step', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('settings', data);
    act('up'); // wraps to DONE
    act('up'); // reset row
    act('confirm');
    expect(cmds).toEqual([]);
    act('confirm');
    expect(cmds).toEqual([{ type: 'resetStats' }]);
  });

  it('clicking a segmented choice selects it', () => {
    const { ui, cmds, data } = setup();
    ui.showScreen('settings', data);
    const seg = [...ui.screenEl('settings').querySelectorAll<HTMLElement>('.bhd-seg')].find((s) => s.dataset.value === 'low')!;
    click(seg);
    expect(cmds).toEqual([{ type: 'settings', patch: { quality: 'low' } }]);
  });
});

describe('family setup', () => {
  it('swatches / toggles / coffee order emit a full FamilySetup', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('family', data);
    act('down', 'right'); // HAIR → next swatch
    expect(cmds.length).toBe(1);
    const c0 = cmds[0]!;
    expect(c0.type).toBe('family');
    if (c0.type !== 'family') throw new Error();
    expect(c0.family.looks.members.chris.hair).not.toBe(0x44291b);
    expect(c0.family.looks.members.ashley.hair).toBe(0x6b3d24);
    act('down', 'down', 'confirm'); // GLASSES toggle
    const c1 = cmds[1]!;
    if (c1.type !== 'family') throw new Error();
    expect(c1.family.looks.members.chris.glasses).toBe(true);
    act('down', 'left'); // BEARD beard → stubble
    const c2 = cmds[2]!;
    if (c2.type !== 'family') throw new Error();
    expect(c2.family.looks.members.chris.beard).toBe('stubble');
    // next tab = Ashley: coffee order row exists
    act('next');
    expect((ui.screens.family as FamilyScreen).currentTab).toBe('ashley');
    act('down', 'down', 'down', 'down', 'right');
    const c3 = cmds[3]!;
    if (c3.type !== 'family') throw new Error();
    expect(c3.family.coffee).toBe('creamSugar');
    // The game's object is never mutated.
    expect(data.family.looks.members.chris.glasses).toBe(false);
  });

  it("the dog's name is always text (never markup)", () => {
    const { ui, act, data, root, cmds } = setup();
    const evil = '<img src=x onerror=alert(1)>';
    ui.showScreen('family', { ...data, family: family(evil) });
    for (let i = 0; i < 5; i++) act('next'); // DOG tab
    expect((ui.screens.family as FamilyScreen).currentTab).toBe('dog');
    const name = ui.screenEl('family').querySelector('.bhd-fam__name')!;
    expect(name.textContent).toBe('<img src=x oner'.slice(0, 14));
    expect(root.querySelector('img')).toBeNull();
    const input = ui.screenEl('family').querySelector<HTMLInputElement>('.bhd-input')!;
    expect(input.maxLength).toBe(14);
    // Typing into the field emits the sanitised name.
    const before = cmds.length;
    input.value = 'Waffles<b>';
    input.dispatchEvent(new Event('input'));
    expect(name.textContent).toBe('Waffles<b>'); // preview updates at once…
    expect(cmds.length).toBe(before); // …the command waits for a pause / blur
    input.dispatchEvent(new Event('blur'));
    expect(cmds.length).toBe(before + 1);
    expect(ui.debug.family.looks.dog.name).toBe('Waffles<b>');
    expect(root.querySelector('b')).toBeNull();
    // Speech bubbles tag the dog with its (text) name.
    ui.showScreen('none');
    ui.bubble({ x: 0, y: 1, z: 0 }, 'Woof', { speaker: 'dog' });
    const tag = root.querySelector('.bhd-bubble:not([hidden]) .bhd-bubble__tag')!;
    expect(tag.textContent).toBe('Waffles<b>');
    expect(root.querySelector('b')).toBeNull();
  });

  it('shuffle suggests a new dog name (gamepad friendly)', () => {
    const { ui, act, data, cmds } = setup();
    ui.showScreen('family', data);
    for (let i = 0; i < 5; i++) act('next');
    act('down', 'right', 'confirm'); // name row → shuffle button
    const c = cmds[cmds.length - 1]!;
    if (c.type !== 'family') throw new Error('expected family');
    expect(c.family.looks.dog.name).not.toBe('Biscuit');
  });
});

describe('results — the Morning Report Card', () => {
  it('renders every activity, lights the earned stars, shows 2–4 awards and the tagline', () => {
    const { ui, act, data } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    const scr = ui.screens.results as ResultsScreen;
    expect(scr.revealing).toBe(true);
    const el = ui.screenEl('results');
    expect(el.querySelectorAll('.bhd-rc__row').length).toBe(4);
    expect(el.querySelectorAll('.bhd-rc__row.is-skipped').length).toBe(1);
    expect(el.querySelector('.bhd-rc__time')!.textContent).toBe('7:58 AM');
    expect(el.textContent).toContain('Somehow, everybody makes it out the door.');
    act('confirm'); // skip the reveal
    expect(scr.revealing).toBe(false);
    expect(scr.litStars).toBe(6);
    expect(el.querySelectorAll('.bhd-sticker').length).toBe(3);
    expect(el.querySelectorAll('.bhd-sticker.is-in').length).toBe(3);
    expect(el.querySelector('.bhd-rc__totaln')!.textContent).toBe('6');
    expect(el.textContent).toContain('WE MADE IT!');
  });

  it('the reveal plays by itself over time', () => {
    const { ui, run, data } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    const scr = ui.screens.results as ResultsScreen;
    run(1);
    expect(scr.revealing).toBe(true);
    run(8);
    expect(scr.revealing).toBe(false);
    expect(scr.litStars).toBe(6);
  });

  it('PLAY AGAIN / MENU emit their commands', () => {
    const { ui, act, cmds, data } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    act('confirm'); // skip
    act('confirm'); // PLAY AGAIN (default)
    expect(cmds).toEqual([{ type: 'playAgain' }]);
    act('left', 'confirm');
    expect(cmds[1]).toEqual({ type: 'toMenu' });
  });
});

describe('HUD', () => {
  it('renders the clock, act label, tasks, objective and meters', () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    ui.setHud(HUD);
    expect(root.querySelector('.bhd-clock__time')!.textContent).toBe('5:15');
    expect(root.querySelector('.bhd-clock__ampm')!.textContent).toBe('AM');
    expect(root.querySelectorAll('.bhd-task').length).toBe(2);
    expect(root.querySelector('.bhd-obj__t')!.textContent).toBe('Open the back door');
    expect((root.querySelector('.bhd-hmeter') as HTMLElement).style.getPropertyValue('--value')).toBe('0.5');
    ui.setHud(null);
    expect((root.querySelector('.bhd-hud') as HTMLElement).hidden).toBe(true);
  });

  it('is diffed: identical state causes zero DOM mutations', async () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    ui.setHud(HUD);
    const hudEl = root.querySelector('.bhd-hud')!;
    const records: MutationRecord[] = [];
    const mo = new MutationObserver((r) => records.push(...r));
    mo.observe(hudEl, { subtree: true, childList: true, attributes: true, characterData: true });
    for (let i = 0; i < 30; i++) {
      ui.setHud({ ...HUD, clock: 315.4, tasks: HUD.tasks!.map((t) => ({ ...t })), meters: HUD.meters!.map((m) => ({ ...m })) });
    }
    await Promise.resolve();
    expect(records.length).toBe(0);
    // A new minute touches only the clock.
    ui.setHud({ ...HUD, clock: 316 });
    await Promise.resolve();
    mo.disconnect();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) expect((r.target as Element).closest?.('.bhd-clock') ?? r.target.parentElement?.closest('.bhd-clock')).toBeTruthy();
  });

  it('checks tasks off with a one-shot animation and stars', () => {
    const { ui, root } = setup();
    ui.setHud(HUD);
    ui.setHud({ ...HUD, tasks: [{ id: 'dog', label: 'Dog out', icon: 'dog', state: 'done', stars: 3 }, HUD.tasks![1]!] });
    const li = root.querySelector('.bhd-task') as HTMLElement;
    expect(li.dataset.state).toBe('done');
    expect(li.classList.contains('is-justdone')).toBe(true);
    expect(li.querySelectorAll('.bhd-task__star').length).toBe(3);
    expect(root.querySelector('.bhd-tasks__count')!.textContent).toBe('1/2');
  });

  it('clock blink + pause button click id', () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    ui.setHud({ ...HUD, clockBlink: true });
    expect(root.querySelector('.bhd-clock')!.classList.contains('is-blink')).toBe(true);
    const btn = root.querySelector('.bhd-pausebtn') as HTMLElement;
    expect(btn.hidden).toBe(false);
    click(btn);
    expect(ui.takeClicks()).toEqual(['pause']);
    expect(ui.takeClicks()).toEqual([]);
  });
});

describe('speech bubbles', () => {
  it('project every update, hide when the anchor is off screen, follow move() and close()', () => {
    const { ui, root, projector } = setup();
    ui.showScreen('none');
    const h = ui.bubble({ x: 1, y: 2, z: 0 }, 'GOOD MORNING!!!', { speaker: 'addy', style: 'shout', seconds: 10 });
    expect(h.open).toBe(true);
    const wrap = root.querySelector('.bhd-bubble:not([hidden])') as HTMLElement;
    expect(wrap.dataset.style).toBe('shout');
    expect(wrap.dataset.speaker).toBe('addy');
    expect(wrap.querySelectorAll('.bhd-bubble__w').length).toBe(2);
    expect(wrap.style.transform).toBe('translate3d(500px, 300px, 0)');
    h.move({ x: 2, y: 2, z: 0 });
    ui.update(0.016);
    expect(wrap.style.transform).toBe('translate3d(600px, 300px, 0)');
    projector.visible = false;
    ui.update(0.016);
    expect(wrap.style.visibility).toBe('hidden');
    projector.visible = true;
    ui.update(0.016);
    expect(wrap.style.visibility).toBe('');
    h.close();
    expect(h.open).toBe(false);
    ui.update(0.3);
    expect(wrap.hidden).toBe(true);
    expect(ui.debug.bubbles).toBe(0);
  });

  it('bubbles close on their own after `seconds`, and a stale handle cannot close a recycled bubble', () => {
    const { ui } = setup();
    ui.showScreen('none');
    const h = ui.bubble({ x: 0, y: 0, z: 0 }, 'hi', { seconds: 1 });
    for (let i = 0; i < 15; i++) ui.update(0.1);
    expect(h.open).toBe(false);
    expect(ui.debug.bubbles).toBe(0);
    const h2 = ui.bubble({ x: 0, y: 0, z: 0 }, 'again', { seconds: 5 });
    h.close();
    expect(h2.open).toBe(true);
  });
});

describe('choice', () => {
  it('navigates with the pad and resolves with the chosen id', async () => {
    const { ui, act } = setup();
    ui.showScreen('none');
    const p = ui.choice('WHO GETS THE BLACK BRUSH FIRST?', [
      { id: 'addy', label: 'ADDY', badge: 'blackBrush', color: 'var(--bhd-addy)' },
      { id: 'ellie', label: 'ELLIE', color: 'var(--bhd-ellie)' },
      { id: 'heidi', label: 'HEIDI', color: 'red;background:url(x)' },
    ]);
    expect(ui.debug.choice).toBe(true);
    expect(act('right')).toBe(true);
    expect(act('confirm')).toBe(true);
    await expect(p).resolves.toBe('ellie');
    expect(ui.debug.choice).toBe(false);
  });

  it('honours defaultId and resolves on a click', async () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    const p = ui.choice('PICK', [
      { id: 'a', label: 'A', icon: 'coffee' },
      { id: 'b', label: 'B', icon: 'dog' },
    ], { defaultId: 'b' });
    expect(root.querySelector('.bhd-pcard.is-focused')!.getAttribute('data-id')).toBe('b');
    click(root.querySelector('.bhd-pcard[data-id="a"]')!);
    await expect(p).resolves.toBe('a');
  });
});

describe('prompt glyphs per device', () => {
  const glyphOf = (ui: UiController): string => ui.promptView.glyphHtml;

  it('keyboard → keycaps from bindingLabels', () => {
    const { ui } = setup();
    ui.setInputDevice('keyboard', 'generic');
    ui.prompt({ text: 'Open the door', slot: 'primary' });
    expect(glyphOf(ui)).toContain('data-g="key-space"');
    ui.prompt({ text: 'Switch', slot: 'switch' });
    expect(glyphOf(ui)).toContain('>Q</kbd>');
    expect(glyphOf(ui)).toContain('>R</kbd>');
    ui.prompt({ text: 'Walk', slot: 'move' });
    expect(glyphOf(ui)).toContain('data-g="key-wasd"');
  });

  it('gamepads → PlayStation shapes, Xbox / Nintendo letters, triggers as pills', () => {
    const { ui } = setup();
    ui.setInputDevice('gamepad', 'playstation');
    ui.prompt({ text: 'Open', slot: 'primary' });
    expect(glyphOf(ui)).toContain('data-g="ps-cross"');
    ui.prompt({ text: 'Call', slot: 'secondary' });
    expect(glyphOf(ui)).toContain('data-g="ps-circle"');
    ui.prompt({ text: 'Done', slot: 'alt' });
    expect(glyphOf(ui)).toContain('data-g="shoulder-r2"');
    ui.setInputDevice('gamepad', 'xbox');
    ui.prompt({ text: 'Open', slot: 'primary' });
    expect(glyphOf(ui)).toContain('data-g="xbox-a"');
    ui.setInputDevice('gamepad', 'nintendo');
    expect(glyphOf(ui)).toContain('data-g="nintendo-b"'); // re-rendered on device change
  });

  it('touch → a replica of the on-screen button (its ControlIcon)', () => {
    const { ui, root } = setup();
    const btn = document.createElement('div');
    btn.className = 'bhd-touch__btn bhd-touch__btn--primary';
    btn.dataset.on = 'true';
    btn.innerHTML = '<span class="bhd-touch__icon"><svg class="bhd-ico bhd-ico--brush"></svg></span><span class="bhd-touch__label">BRUSH</span>';
    const overlay = document.createElement('div');
    overlay.className = 'bhd-touch';
    overlay.appendChild(btn);
    root.appendChild(overlay);
    ui.setInputDevice('touch', 'generic');
    ui.prompt({ text: 'Brush', slot: 'primary', hold: true });
    expect(glyphOf(ui)).toContain('data-g="touch-primary-brush"');
    expect(glyphOf(ui)).toContain('BRUSH');
    ui.prompt({ text: 'Walk', slot: 'move' });
    expect(glyphOf(ui)).toContain('data-g="joystick"');
  });

  it('world-anchored prompts follow the projector', () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    ui.prompt({ text: 'Call the dog', slot: 'secondary', at: { x: 1, y: 1, z: 0 } });
    const bar = root.querySelector('.bhd-prompt') as HTMLElement;
    expect(bar.classList.contains('is-anchored')).toBe(true);
    expect(bar.style.transform).toContain('translate3d(500px, 400px, 0)');
    ui.prompt(null);
    expect(bar.hidden).toBe(true);
  });

  it('activity-layer .bhd-glyph[data-slot] elements get their glyph filled in', async () => {
    const { ui } = setup();
    ui.setInputDevice('gamepad', 'playstation');
    const pill = document.createElement('span');
    pill.className = 'bhd-glyph';
    pill.dataset.slot = 'primary';
    pill.textContent = 'Pour';
    ui.activityLayer().appendChild(pill);
    await Promise.resolve();
    await Promise.resolve();
    expect(pill.querySelector('.bhd-glyph__g')!.innerHTML).toContain('ps-cross');
    expect(pill.textContent).toContain('Pour');
    ui.setInputDevice('keyboard', 'generic');
    expect(pill.querySelector('.bhd-glyph__g')!.innerHTML).toContain('key-space');
  });
});

describe('act cards, boss intro, banners, toasts', () => {
  it('act card shows ~3.2 s then resolves; confirm skips (after a short guard)', async () => {
    const { ui, act, run, root } = setup();
    ui.showScreen('none');
    let done = false;
    const p = ui.actCard({ time: '5:15 AM', act: 'ACT I', title: "CHRIS'S EARLY SHIFT", subtitle: 'EVERYBODY ELSE IS STILL ASLEEP.', mood: 'predawn' }).then(() => (done = true));
    const card = root.querySelector('.bhd-actcard') as HTMLElement;
    expect(card.hidden).toBe(false);
    expect(card.dataset.mood).toBe('predawn');
    expect(card.querySelectorAll('.bhd-flip__d').length).toBe(3);
    expect(card.querySelector('.bhd-flip__ampm')!.textContent).toBe('AM');
    expect(act('confirm')).toBe(true); // swallowed by the guard
    run(0.5);
    act('confirm'); // skips to the outro
    run(0.5);
    await p;
    expect(done).toBe(true);
    expect(card.hidden).toBe(true);
  });

  it('act card resolves by itself', async () => {
    const { ui, run } = setup();
    ui.showScreen('none');
    const p = ui.actCard({ time: '6:00 AM', act: 'ACT II', title: 'WAKE UP, GIRLS!', subtitle: '', mood: 'sunrise' });
    run(4);
    await expect(p).resolves.toBeUndefined();
  });

  it('boss intro fills the heart bar to MAX and can be skipped', async () => {
    const { ui, run, act, root } = setup();
    ui.showScreen('none');
    const p = ui.bossIntro('MOM', 'THE HAIR INSPECTOR');
    expect(root.querySelector('.bhd-boss__name')!.textContent).toBe('MOM');
    expect(root.querySelector('.bhd-boss__title')!.textContent).toBe('THE HAIR INSPECTOR');
    run(1.6);
    const lit = ui.bossView.heartsLit;
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(10);
    act('confirm');
    expect(ui.bossView.heartsLit).toBe(10);
    run(0.5);
    await expect(p).resolves.toBeUndefined();
  });

  it('banners in all six styles queue and expire', () => {
    const { ui, run } = setup();
    ui.showScreen('none');
    ui.banner('COFFEE: SECURED', 'secured');
    expect(ui.debug.banner).toBe('COFFEE: SECURED');
    ui.banner('THE BLACK BRUSH HAS SPAWNED', 'legendary'); // interrupts
    expect(ui.debug.bannerStyle).toBe('legendary');
    ui.banner('MOM APPROVED ✓', 'approved');
    ui.banner('WRONG DOOR.', 'fun');
    ui.banner('7:45', 'info');
    ui.banner('MOM IS CHECKING THE HAIR', 'boss');
    run(4.1);
    expect(ui.debug.bannerStyle).toBe('boss');
    run(20);
    expect(ui.debug.banner).toBeNull();
  });

  it('toasts stack and fade', () => {
    const { ui, run } = setup();
    ui.toast('Found a shoe!', 'shoe', 1);
    ui.toast('Biscuit is helping', 'dog', 3);
    expect(ui.debug.toasts).toEqual(['Found a shoe!', 'Biscuit is helping']);
    run(1.2);
    expect(ui.debug.toasts).toEqual(['Biscuit is helping']);
  });

  it('instruction shows and hides', () => {
    const { ui } = setup();
    ui.instruction('Pour until it matches the swatch!', 'Hold to pour');
    expect(ui.debug.instruction).toBe('Pour until it matches the swatch!');
    ui.instruction(null);
    expect(ui.debug.instruction).toBeNull();
  });

  it('confirm during plain gameplay emits skip (cutscenes)', () => {
    const { ui, act, cmds } = setup();
    ui.showScreen('none');
    expect(act('confirm')).toBe(true);
    expect(cmds).toEqual([{ type: 'skip' }]);
  });
});

describe('portraits', () => {
  it('renders a diffed row with progress, badge, focus and click ids', async () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    const row = {
      items: [
        { id: 'addy' as const, name: 'ADDY', color: 'var(--bhd-addy)', progress: 0.5, badge: 'blackBrush' as const, focused: true, mood: 'happy' as const },
        { id: 'ellie' as const, name: 'ELLIE', color: '#4fd1b5', progress: 0.2, status: 'I’M DONE!' },
      ],
      chips: [{ id: 'pass', label: 'PASS THE BLACK BRUSH', slot: 'secondary' as const, icon: 'blackBrush' as const }],
    };
    ui.portraits(row);
    const ps = root.querySelectorAll<HTMLElement>('.bhd-portrait');
    expect(ps.length).toBe(2);
    expect(ps[0]!.classList.contains('is-current')).toBe(true);
    expect(ps[0]!.style.getPropertyValue('--p')).toBe('0.5');
    expect(ps[0]!.querySelector('.bhd-portrait__badge svg')).not.toBeNull();
    expect(ps[1]!.querySelector('.bhd-portrait__status')!.textContent).toBe('I’M DONE!');
    const mo = new MutationObserver(() => {});
    const records: MutationRecord[] = [];
    const mo2 = new MutationObserver((r) => records.push(...r));
    mo2.observe(root.querySelector('.bhd-portraits')!, { subtree: true, childList: true, attributes: true, characterData: true });
    ui.portraits({ ...row, items: row.items.map((i) => ({ ...i })), chips: row.chips.map((c) => ({ ...c })) });
    await Promise.resolve();
    expect(records.length).toBe(0);
    mo.disconnect();
    mo2.disconnect();
    click(ps[1]!);
    click(root.querySelector('.bhd-chip')!);
    expect(ui.takeClicks()).toEqual(['ellie', 'pass']);
    ui.portraits(null);
    expect((root.querySelector('.bhd-portraits') as HTMLElement).hidden).toBe(true);
  });

  it('disabled chips do not click', () => {
    const { ui, root } = setup();
    ui.portraits({ items: [], chips: [{ id: 'done', label: 'DONE', disabled: true }] });
    click(root.querySelector('.bhd-chip')!);
    expect(ui.takeClicks()).toEqual([]);
  });
});

describe('the UI never renders user strings as markup', () => {
  it('toasts, banners, instructions, bubbles and choices use textContent', () => {
    const { ui, root } = setup();
    const evil = '<img src=x onerror=alert(1)>';
    ui.showScreen('none');
    ui.toast(evil);
    ui.banner(evil, 'fun', { sub: evil });
    ui.instruction(evil, evil);
    ui.bubble({ x: 0, y: 0, z: 0 }, evil);
    void ui.choice(evil, [{ id: 'x', label: evil, sub: evil }], { subtitle: evil });
    ui.prompt({ text: evil, slot: 'primary' });
    ui.setHud({ clock: 400, actLabel: evil, objective: evil, tasks: [{ id: 't', label: evil, icon: 'dog', state: 'todo' }], meters: [{ id: 'm', label: evil, value: 1 }] });
    ui.portraits({ items: [{ id: 'heidi', name: evil, color: evil, progress: 1, status: evil }], chips: [{ id: 'c', label: evil }] });
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain(evil);
  });
});
