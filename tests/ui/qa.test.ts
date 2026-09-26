// @vitest-environment jsdom
// Regression tests for the first QA playtest batch (pause freeze/stacking, credits, results clicks,
// portrait goal notch + compact row, banner pos, phone TO-DO chip, friendly moods, tab prev/next).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUI } from '../../src/ui';
import type { UiController } from '../../src/ui/controller';
import { faceSvg } from '../../src/ui/faces';
import type { FamilyScreen } from '../../src/ui/screens/family';
import type { ResultsScreen } from '../../src/ui/screens/results';
import type { MenuAction } from '../../src/input/types';
import type { MorningReport } from '../../src/plan/types';
import type { Projector } from '../../src/render/types';
import { DEFAULT_SETTINGS } from '../../src/storage/types';
import type { HudState, UiCommand } from '../../src/ui/types';

const projector: Projector = {
  project(p, out) {
    out.x = 400 + p.x * 100;
    out.y = 500 - p.y * 100;
    out.visible = true;
  },
};

const REPORT: MorningReport = {
  seed: 12,
  daily: false,
  dateKey: null,
  arrival: 7 * 60 + 59,
  records: [
    { id: 'dog', label: 'Take the dog out', stars: 2, flags: [] },
    { id: 'coffee', label: 'Make Ashley’s coffee', stars: 3, flags: [] },
  ],
  totalStars: 5,
  maxStars: 6,
  grade: { title: 'WE MADE IT!', blurb: 'Everybody out the door.' },
  awards: [{ id: 'a', title: 'Sock Detective', blurb: 'Found it.', icon: 'shoe' }],
  newBestArrival: true,
  playSeconds: 200,
};

const HUD: HudState = { clock: 315, actLabel: 'ACT I · CHRIS’S EARLY SHIFT', pauseButton: true };

function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const ui = createUI({ root, projector }) as UiController;
  const cmds: UiCommand[] = [];
  ui.onCommand((c) => cmds.push(c));
  const act = (...a: MenuAction[]): void => {
    for (const x of a) ui.handleMenuActions([x]);
  };
  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += 0.1) ui.update(Math.min(0.1, seconds - t));
  };
  const data = { settings: DEFAULT_SETTINGS, dailyBest: null };
  return { ui, root, cmds, act, run, data };
}

const click = (el: Element): void => void el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
const label = (el: Element): string => el.querySelector('.bhd-btn__label')?.textContent ?? '';

afterEach(() => {
  vi.useRealTimers();
});

describe('pause freezes and covers everything', () => {
  it('the act card (dt timeline AND wall-clock safety net) is frozen while paused, then resumes', async () => {
    vi.useFakeTimers();
    const { ui, run } = setup();
    ui.showScreen('none');
    let done = false;
    void ui.actCard({ time: '5:15 AM', act: 'ACT I', title: 'X', subtitle: '', mood: 'predawn' }).then(() => (done = true));
    run(1);
    ui.showScreen('pause');
    expect(ui.actCardView.safetyArmed).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); // paused for 30 s of wall-clock time
    run(10); // the UI keeps being updated while paused
    expect(done).toBe(false);
    expect(ui.actCardView.active).toBe(true);
    ui.showScreen('none');
    expect(ui.actCardView.safetyArmed).toBe(true);
    run(3);
    await Promise.resolve();
    expect(done).toBe(true);
  });

  it('the boss card safety net resumes its remaining time after the pause', async () => {
    vi.useFakeTimers();
    const { ui } = setup();
    ui.showScreen('none');
    let done = false;
    void ui.bossIntro('MOM', 'THE HAIR INSPECTOR').then(() => (done = true));
    await vi.advanceTimersByTimeAsync(2000); // nobody pumps update()
    ui.showScreen('pause');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(done).toBe(false);
    ui.showScreen('none');
    await vi.advanceTimersByTimeAsync(8000);
    expect(done).toBe(true);
  });

  it('menu screens stack above the gameplay layer that holds choices, cards and prompts', () => {
    const { ui } = setup();
    const kids = [...ui.layer.children];
    const play = kids.findIndex((k) => k.classList.contains('bhd-play'));
    expect(play).toBeGreaterThanOrEqual(0);
    expect(kids.indexOf(ui.screenEl('pause'))).toBeGreaterThan(play);
    const playEl = kids[play]!;
    for (const sel of ['.bhd-choice', '.bhd-actcard', '.bhd-boss', '.bhd-prompt-layer']) expect(playEl.querySelector(sel)).not.toBeNull();
  });
});

describe('credits close', () => {
  it('with Esc/back and with a tap on the backdrop (not on the card)', () => {
    const { ui, act, data } = setup();
    ui.showScreen('menu', data);
    ui.showScreen('credits', data);
    act('back');
    expect(ui.screen).toBe('menu');
    ui.showScreen('credits', data);
    click(ui.screenEl('credits').querySelector('.bhd-credits__card')!);
    expect(ui.screen).toBe('credits');
    click(ui.screenEl('credits'));
    expect(ui.screen).toBe('menu');
    expect(ui.screenEl('credits').querySelector('.bhd-credits__body.bhd-scroll')).not.toBeNull();
  });
});

describe('results', () => {
  it('clicking PLAY AGAIN mid-reveal acts immediately (and finishes the card)', () => {
    const { ui, cmds, data } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    const scr = ui.screens.results as ResultsScreen;
    expect(scr.revealing).toBe(true);
    const again = [...ui.screenEl('results').querySelectorAll('.bhd-btn')].find((b) => label(b) === 'PLAY AGAIN')!;
    click(again);
    expect(cmds).toEqual([{ type: 'playAgain' }]);
    expect(scr.revealing).toBe(false);
  });

  it('a background click (or confirm) only skips the reveal', () => {
    const { ui, cmds, data, act } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    click(ui.screenEl('results').querySelector('.bhd-rc__paper')!);
    expect((ui.screens.results as ResultsScreen).revealing).toBe(false);
    ui.showScreen('menu', data);
    ui.showScreen('results', { ...data, report: { ...REPORT } });
    act('confirm');
    expect((ui.screens.results as ResultsScreen).revealing).toBe(false);
    expect(cmds).toEqual([]);
  });

  it('the stamp shares a wrapping row with the time (never overlaps the AM)', () => {
    const { ui, data } = setup();
    ui.showScreen('results', { ...data, report: REPORT });
    const row = ui.screenEl('results').querySelector('.bhd-rc__timerow')!;
    expect(row.querySelector('.bhd-rc__time')!.textContent).toBe('7:59 AM');
    expect(row.querySelector('.bhd-stamp')!.textContent).toBe('NEW BEST!');
  });
});

describe('portraits goal notch, compact row, banner pos', () => {
  const item = (over: Record<string, unknown> = {}) => ({ id: 'addy' as const, name: 'ADDY', color: 'var(--bhd-addy)', progress: 0.5, ...over });

  it('draws a goal notch at the given fraction and marks it met', () => {
    const { ui, root } = setup();
    ui.portraits({ items: [item({ goal: 0.95 })] });
    const p = root.querySelector('.bhd-portrait') as HTMLElement;
    const g = p.querySelector('.bhd-portrait__goal') as SVGGElement;
    expect(g.style.display).toBe('');
    expect(g.getAttribute('transform')).toBe('rotate(342.0 50 50)');
    expect(p.classList.contains('is-goal-met')).toBe(false);
    ui.portraits({ items: [item({ goal: 0.95, progress: 0.97 })] });
    expect(p.classList.contains('is-goal-met')).toBe(true);
    ui.portraits({ items: [item()] });
    expect(g.style.display).toBe('none');
  });

  it('compact rows get the compact layout class', () => {
    const { ui, root } = setup();
    ui.portraits({ items: [item()], compact: true });
    expect(root.querySelector('.bhd-portraits')!.classList.contains('is-compact')).toBe(true);
    ui.portraits({ items: [item()] });
    expect(root.querySelector('.bhd-portraits')!.classList.contains('is-compact')).toBe(false);
  });

  it('compact rows on touch hide chips that duplicate a visible on-screen button (same slot)', () => {
    const { ui, root } = setup();
    const btn = document.createElement('div');
    btn.className = 'bhd-touch__btn bhd-touch__btn--secondary';
    btn.dataset.on = 'true';
    btn.innerHTML = '<span class="bhd-touch__icon"><svg class="bhd-ico bhd-ico--pass"></svg></span><span class="bhd-touch__label">PASS</span>';
    root.appendChild(btn);
    ui.setInputDevice('touch', 'generic');
    const chips = [
      { id: 'pass', label: 'PASS THE BLACK BRUSH', slot: 'secondary' as const },
      { id: 'done', label: 'SHE’S DONE', slot: 'alt' as const }, // no alt button on screen → kept
      { id: 'mom', label: 'CALL MOM' },
    ];
    ui.portraits({ items: [item()], chips, compact: true });
    const dup = (id: string): boolean => root.querySelector(`.bhd-chip[data-id="${id}"]`)!.classList.contains('is-dup');
    expect(dup('pass')).toBe(true);
    expect(dup('done')).toBe(false);
    expect(dup('mom')).toBe(false);
    ui.portraits({ items: [item()], chips }); // not compact → every chip stays
    expect(dup('pass')).toBe(false);
    ui.setInputDevice('keyboard', 'generic');
    ui.portraits({ items: [item()], chips, compact: true }); // keyboard → chips show their key glyphs
    expect(dup('pass')).toBe(false);
  });

  it('banner pos top / bottom / default centre', () => {
    const { ui, root, run } = setup();
    ui.showScreen('none');
    ui.banner('MOM APPROVED', 'approved', { pos: 'top', seconds: 1 });
    expect(ui.debug.bannerPos).toBe('top');
    expect((root.querySelector('.bhd-banner') as HTMLElement).dataset.pos).toBe('top');
    run(1.2);
    ui.banner('HI', 'info', { pos: 'bottom', seconds: 1 });
    expect(ui.debug.bannerPos).toBe('bottom');
    run(1.2);
    ui.banner('HI', 'info', { pos: 'sideways' as unknown as 'top' });
    expect(ui.debug.bannerPos).toBe('center');
  });
});

describe('phone HUD & tabs', () => {
  it('the TO-DO chip mirrors the count, opens on tap and folds itself away', () => {
    const { ui, root } = setup();
    ui.showScreen('none');
    ui.setHud({
      ...HUD,
      tasks: [
        { id: 'a', label: 'A', icon: 'dog', state: 'done', stars: 2 },
        { id: 'b', label: 'B', icon: 'coffee', state: 'active' },
      ],
    });
    const chip = root.querySelector('.bhd-taskchip') as HTMLElement;
    expect(chip.hidden).toBe(false);
    expect(chip.querySelector('.bhd-taskchip__n')!.textContent).toBe('1/2');
    expect(chip.querySelector('.bhd-taskchip__ico svg')!.getAttribute('class')).toContain('bhd-i--coffee');
    click(chip);
    expect(ui.hud.tasksExpanded).toBe(true);
    expect(root.querySelector('.bhd-hud')!.classList.contains('is-tasks-open')).toBe(true);
    for (let i = 0; i < 70; i++) ui.update(0.1);
    expect(ui.hud.tasksExpanded).toBe(false);
    ui.setHud({ ...HUD, tasks: [] });
    expect(chip.hidden).toBe(true);
  });

  it('family tabs follow prev / next (Q / R, Tab, L1 / R1)', () => {
    const { ui, act, data } = setup();
    ui.showScreen('family', data);
    const fam = ui.screens.family as FamilyScreen;
    act('next', 'next');
    expect(fam.currentTab).toBe('addy');
    act('prev');
    expect(fam.currentTab).toBe('ashley');
    act('prev', 'prev');
    expect(fam.currentTab).toBe('dog');
  });
});

describe('friendly moods', () => {
  it("'eek' is a surprised oops: round eyes and a small o, no squint, no gritted teeth", () => {
    const eek = faceSvg({ who: 'heidi', mood: 'eek' });
    expect(eek).not.toContain('<rect');
    expect(eek).not.toContain('l7 4-7 4');
    expect(eek.split('r="6.4" fill="#fff"').length - 1).toBe(2);
  });

  it("'dramatic' is a theatrical swoon (closed eyes), not wide scared eyes", () => {
    const d = faceSvg({ who: 'addy', mood: 'dramatic' });
    expect(d).not.toContain('r="6.6"');
  });
});
