// Audio bench: a big unlock button, then a button for every SfxId, every loop (toggle +
// live volume / pitch), every MusicId (+ intensity, crossfade), babble voice × mood with a
// text box, master / music / sfx volume, mute / pause / duck, a live output level meter,
// scripted game moments and the offline QA report (renders through the real mixer).
//
// Automation (tools/shot.mjs --eval / --until):
//   window.__audio        the engine (createAudioEngine: contract + debugInfo() + level())
//   window.__audioQa(part?, quick?) → { failures, warnings, lines }
//   window.__DEV__.ready  true once the page is wired
import '@fontsource/luckiest-guy';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '@fontsource/baloo-2/800.css';
import { MOODS, VOICE_IDS } from '../src/audio/babble';
import { createAudioEngine } from '../src/audio/index';
import { LOOP_META } from '../src/audio/loops';
import { SFX_IDS } from '../src/audio/sfx';
import { MUSIC_IDS, SONGS } from '../src/audio/song';
import type { LoopHandle, LoopId, MusicId, SfxId } from '../src/audio/types';

const audio = createAudioEngine();
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

declare global {
  interface Window {
    __audio?: typeof audio;
    __audioQa?: (part?: string, quick?: boolean) => Promise<{ failures: number; warnings: number; lines: string[] }>;
    __DEV__?: Record<string, unknown> & { ready?: boolean; frames?: number };
  }
}

window.__audio = audio;
window.__audioQa = async (part = 'all', quick = true) => {
  const qa = await import('../src/audio/qa');
  const s = await qa.runQa(quick, part as Parameters<typeof qa.runQa>[1]);
  return { failures: s.failures, warnings: s.warnings, lines: qa.formatQa(s) };
};

// ── Unlock ────────────────────────────────────────────────────────────────
const unlockBtn = $<HTMLButtonElement>('unlock');
unlockBtn.addEventListener('click', () => {
  audio.unlock();
  log('unlock()');
});

const logEl = $('log');
function log(msg: string): void {
  const line = document.createElement('div');
  line.textContent = `${(performance.now() / 1000).toFixed(1)}s  ${msg}`;
  logEl.prepend(line);
  while (logEl.childElementCount > 60) logEl.lastElementChild?.remove();
}

function bindSlider(id: string, onChange: (v: number) => void): HTMLInputElement {
  const el = $<HTMLInputElement>(id);
  const out = $(id + 'V');
  const apply = (): void => {
    const v = Number(el.value);
    out.textContent = String(v);
    onChange(v);
  };
  el.addEventListener('input', apply);
  apply();
  return el;
}

function button(parent: HTMLElement, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

function slider(min: number, max: number, step: number, value: number, onInput: (v: number) => void): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'range';
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.value = String(value);
  el.addEventListener('input', () => onInput(Number(el.value)));
  return el;
}

// ── Mix ────────────────────────────────────────────────────────────────────
const vols = { master: 1, music: 0.8, sfx: 1 };
bindSlider('vMaster', (v) => audio.setVolumes({ ...vols, master: (vols.master = v) }));
bindSlider('vMusic', (v) => audio.setVolumes({ ...vols, music: (vols.music = v) }));
bindSlider('vSfx', (v) => audio.setVolumes({ ...vols, sfx: (vols.sfx = v) }));
$<HTMLInputElement>('mute').addEventListener('change', (e) => audio.setMuted((e.target as HTMLInputElement).checked));
$<HTMLInputElement>('pause').addEventListener('change', (e) => audio.setPaused((e.target as HTMLInputElement).checked));
$('duck').addEventListener('click', () => {
  audio.duck(0.6, 2);
  log('duck(0.6, 2)');
});

// ── Music ──────────────────────────────────────────────────────────────────
const fadeEl = bindSlider('fade', () => undefined);
const trackButtons = new Map<MusicId | null, HTMLButtonElement>();
for (const t of [...MUSIC_IDS, null] as Array<MusicId | null>) {
  const label = t === null ? 'silence' : `${t} · ${SONGS[t].title}`;
  trackButtons.set(
    t,
    button($('tracks'), label, () => {
      audio.setMusic(t, { fade: Number(fadeEl.value) });
      for (const [k, bb] of trackButtons) bb.classList.toggle('active', k === t);
      log(`setMusic(${t === null ? 'null' : `'${t}'`}, fade ${fadeEl.value})`);
    }),
  );
}
bindSlider('intensity', (v) => audio.setIntensity(v));

// ── Loops ──────────────────────────────────────────────────────────────────
for (const id of Object.keys(LOOP_META) as LoopId[]) {
  const row = document.createElement('div');
  row.className = 'loop';
  let handle: LoopHandle | null = null;
  let vol = 0.8;
  let pitch = 1;
  const btn = button(row, id, () => {
    if (handle) {
      handle.stop();
      handle = null;
      btn.classList.remove('active');
      log(`loop ${id} stop()`);
    } else {
      handle = audio.loop(id);
      handle.set(vol, pitch);
      btn.classList.add('active');
      log(`loop('${id}')`);
    }
  });
  const vl = document.createElement('label');
  vl.textContent = 'vol';
  vl.appendChild(
    slider(0, 1, 0.01, vol, (v) => {
      vol = v;
      handle?.set(vol, pitch);
    }),
  );
  const pl = document.createElement('label');
  pl.textContent = 'pit';
  pl.appendChild(
    slider(0.5, 2.5, 0.01, pitch, (v) => {
      pitch = v;
      handle?.set(vol, pitch);
    }),
  );
  row.appendChild(vl);
  row.appendChild(pl);
  $('loops').appendChild(row);
}

// ── Babble ─────────────────────────────────────────────────────────────────
const textEl = $<HTMLInputElement>('text');
const grid = $('babble');
grid.appendChild(document.createElement('span'));
for (const mood of MOODS) {
  const h = document.createElement('span');
  h.className = 'who';
  h.textContent = mood;
  grid.appendChild(h);
}
for (const voice of VOICE_IDS) {
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = voice;
  grid.appendChild(who);
  for (const mood of MOODS) {
    button(grid, '▶', () => {
      audio.babble(voice, textEl.value, mood);
      log(`babble(${voice}, "${textEl.value.slice(0, 30)}", ${mood})`);
    });
  }
}

// ── SFX (grouped like the contract) ────────────────────────────────────────
const pitchEl = bindSlider('sfxPitch', () => undefined);
const volEl = bindSlider('sfxVol', () => undefined);
const panEl = bindSlider('sfxPan', () => undefined);
const GROUPS: ReadonlyArray<readonly [string, readonly SfxId[]]> = [
  ['UI / presentation', ['uiMove', 'uiConfirm', 'uiBack', 'uiToggle', 'actCard', 'banner', 'taskDone', 'star', 'award', 'clockTick', 'clockChime', 'alarm']],
  ['Hair', ['brushStroke', 'brushSnag', 'detangle', 'sectionClear', 'sparkle', 'shine', 'hairFlip', 'blackBrushSting', 'blackBrushGleam', 'brushPass', 'girlDone', 'bossIntro', 'momInspect', 'momApproved', 'momFinish']],
  ['Kitchen', ['mugPick', 'mugPlace', 'brewStart', 'pour', 'stir', 'coffeeSecured', 'fridgeOpen', 'lunchSnap', 'itemPick', 'itemPlace', 'dishClink', 'glassClink', 'cutlery', 'rinse', 'dishwasherShut', 'suds', 'crunch']],
  ['House', ['footstep', 'doorOpen', 'doorClose', 'lightSwitch', 'curtain', 'blanketRustle', 'bedCreak', 'trashRustle', 'binLid', 'binThud', 'pickup', 'deliver', 'zipper', 'found', 'whoosh', 'pop', 'boing', 'thud', 'shh', 'heart', 'kiss']],
  ['Dog', ['dogBark', 'dogBarkSmall', 'dogPant', 'dogWhine', 'dogCollar', 'dogPaws', 'whistle', 'treatShake', 'sniff']],
  ['Car / school run', ['carDoor', 'slidingDoor', 'seatbelt', 'carStart', 'carHorn', 'brake', 'turnSignal', 'honkGoose', 'splash', 'schoolBell', 'cheer', 'kidsYay']],
];
const listed = new Set<SfxId>();
const addGroup = (title: string, ids: readonly SfxId[]): void => {
  const h = document.createElement('h3');
  h.textContent = title;
  $('sfx').appendChild(h);
  const g = document.createElement('div');
  g.className = 'btns';
  $('sfx').appendChild(g);
  for (const id of ids) {
    listed.add(id);
    button(g, id, () => {
      audio.play(id, { pitch: Number(pitchEl.value), volume: Number(volEl.value), pan: Number(panEl.value) });
      log(`play('${id}')`);
    });
  }
};
for (const [title, ids] of GROUPS) addGroup(title, ids);
// Anything added to the contract later still gets a button.
const rest = SFX_IDS.filter((n) => !listed.has(n));
if (rest.length) addGroup('Other', rest);

// ── Scripted moments ───────────────────────────────────────────────────────
const timers: number[] = [];
function at(sec: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, sec * 1000));
}
const scenes: Record<string, () => void> = {
  '5:15 — early shift': () => {
    audio.setMusic('predawn');
    for (let i = 0; i < 6; i++) at(0.3 + i * 0.42, () => audio.play('footstep', { volume: 0.6 }));
    at(0.4, () => audio.play('dogPaws'));
    at(2.8, () => audio.play('lightSwitch'));
    at(3.2, () => audio.play('mugPick'));
    at(3.8, () => audio.play('mugPlace'));
    at(4.3, () => audio.play('brewStart'));
    at(4.5, () => {
      const brew = audio.loop('brew');
      at(3, () => brew.stop());
    });
    at(7.8, () => audio.play('coffeeSecured'));
    at(7.9, () => audio.play('banner'));
  },
  '6:00 — wake up!': () => {
    audio.play('clockChime');
    at(1.4, () => audio.play('alarm'));
    at(2.2, () => audio.setMusic('wake'));
    at(2.6, () => audio.play('curtain'));
    at(3.4, () => audio.babble('ellie', 'Five more minutes...', 'sleepy'));
    at(5.0, () => audio.play('blanketRustle'));
    at(5.6, () => audio.babble('heidi', 'GOOD MORNING!!!', 'excited'));
    at(6.6, () => audio.babble('ashley', 'Mmm, coffee. Thank you!', 'normal'));
    at(7.3, () => audio.play('heart'));
  },
  'THE BLACK BRUSH': () => {
    audio.setMusic('brushing', { fade: 0.8 });
    at(0.3, () => audio.play('actCard'));
    at(2.0, () => audio.play('blackBrushGleam'));
    at(2.3, () => audio.play('blackBrushSting'));
    at(5.4, () => audio.babble('addy', 'I called it!', 'excited'));
    at(5.9, () => audio.babble('heidi', 'Hey!', 'excited'));
    at(6.3, () => audio.babble('ellie', 'Not fair...', 'dramatic'));
  },
  'Brushing session': () => {
    audio.setMusic('brushing');
    const bed = audio.loop('brushing');
    for (let i = 0; i < 12; i++) {
      at(0.2 + i * 0.35, () => {
        const v = 0.4 + 0.5 * Math.abs(Math.sin(i));
        bed.set(v, 1 + 0.1 * (i % 3));
        audio.play('brushStroke', { volume: v, pitch: 0.9 + 0.05 * (i % 4) });
      });
      if (i % 3 === 2) at(0.35 + i * 0.35, () => audio.play('detangle'));
    }
    at(1.5, () => audio.play('brushSnag'));
    at(1.8, () => audio.babble('addy', 'Eep!', 'excited'));
    for (let k = 0; k < 4; k++) at(2.2 + k * 0.5, () => audio.play('sectionClear', { pitch: 1 + 0.12 * k }));
    at(4.4, () => bed.stop());
    at(4.6, () => audio.play('girlDone'));
  },
  "MOM'S HAIR CHECK": () => {
    audio.setMusic('boss', { fade: 0.4 });
    at(0.2, () => audio.play('bossIntro'));
    at(2.6, () => audio.play('momInspect'));
    at(3.8, () => audio.play('momApproved'));
    at(4.0, () => audio.play('heart'));
    at(4.2, () => audio.play('hairFlip'));
    at(5.2, () => audio.play('momInspect'));
    at(6.3, () => audio.babble('ashley', "I'll just finish it...", 'normal'));
    at(7.3, () => audio.play('momFinish'));
    at(8.2, () => audio.babble('heidi', 'Nooooo!', 'dramatic'));
  },
  'Out the door (rush)': () => {
    audio.setMusic('rush');
    audio.setIntensity(0.2);
    at(0.5, () => audio.play('found'));
    at(1.0, () => audio.play('pickup'));
    at(1.8, () => audio.play('deliver'));
    at(2.2, () => audio.play('zipper'));
    at(3.0, () => audio.setIntensity(0.8));
    at(3.4, () => audio.play('dogBark'));
    at(4.4, () => audio.babble('ashley', 'Love you! Have a great day!', 'excited'));
    at(5.8, () => audio.play('kiss'));
  },
  'School run': () => {
    audio.setMusic('drive');
    [0.2, 0.45, 0.7].forEach((s) => at(s, () => audio.play('seatbelt')));
    at(1.0, () => audio.play('carStart'));
    at(2.2, () => {
      const eng = audio.loop('engine');
      eng.set(0.6, 1);
      at(2, () => eng.set(0.8, 1.5));
      at(5.5, () => eng.stop());
    });
    at(3.0, () => audio.babble('heidi', 'La la la, we are going to school', 'sing'));
    at(4.2, () => audio.play('honkGoose'));
    at(5.0, () => audio.play('brake'));
    at(6.3, () => audio.play('schoolBell'));
    at(7.4, () => audio.play('kidsYay'));
  },
  'Report card': () => {
    audio.setMusic('results', { fade: 0.3 });
    for (let i = 0; i < 5; i++) at(1.4 + i * 0.35, () => audio.play('star', { pitch: 1 + 0.08 * i }));
    at(3.6, () => audio.play('award'));
    at(5.2, () => audio.play('cheer'));
  },
  'Spam (limiter test)': () => {
    for (let i = 0; i < 40; i++) at(i * 0.02, () => audio.play('brushStroke'));
    for (let i = 0; i < 30; i++) at(1 + i * 0.01, () => audio.play('detangle'));
    for (let i = 0; i < 20; i++) at(1.6 + i * 0.03, () => audio.babble('addy', 'I called it!', 'excited'));
  },
};
for (const [name, fn] of Object.entries(scenes)) {
  button($('scenes'), name, () => {
    audio.unlock();
    log(`moment: ${name}`);
    fn();
  });
}
button($('scenes'), 'Stop moments', () => {
  for (const t of timers) clearTimeout(t);
  timers.length = 0;
});

// ── Status + meter ─────────────────────────────────────────────────────────
const fill = $('meterFill');
const peakEl = $('meterPeak');
const dbEl = $('meterDb');
let hold = 0;
let holdT = 0;
function frame(t: number): void {
  const on = audio.unlocked;
  const lock = $('lock');
  lock.textContent = on ? 'audio running' : 'locked';
  lock.classList.toggle('on', on);
  unlockBtn.classList.toggle('done', on);
  const d = audio.debugInfo();
  $('dbg').textContent = `ctx ${d.state} · ${d.music ?? '—'} ${d.bpm ? d.bpm.toFixed(0) + ' bpm' : ''} L${d.intensityLevel} · voices ${d.voices} · loops ${d.loops} · babble ${d.babbles}${d.paused ? ' · PAUSED' : ''}`;
  const lvl = on ? audio.level() : 0;
  const db = lvl > 0 ? 20 * Math.log10(lvl) : -Infinity;
  const frac = Number.isFinite(db) ? Math.min(1, Math.max(0, (db + 60) / 60)) : 0;
  fill.style.width = `${(frac * 100).toFixed(1)}%`;
  if (frac >= hold || t - holdT > 1200) {
    hold = frac;
    holdT = t;
  }
  peakEl.style.left = `calc(${(hold * 100).toFixed(1)}% - 3px)`;
  dbEl.textContent = on ? `peak ${Number.isFinite(db) ? db.toFixed(1) : '-inf'} dBFS` : 'unlock to meter';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── QA ─────────────────────────────────────────────────────────────────────
async function qa(part: string, quick: boolean): Promise<void> {
  $('qa').textContent = 'rendering…';
  try {
    const r = await window.__audioQa!(part, quick);
    $('qa').textContent = r.lines.join('\n');
  } catch (e) {
    $('qa').textContent = 'QA failed: ' + String(e);
  }
}
button($('qaButtons'), 'Run quick QA (all)', () => void qa('all', true), 'primary');
button($('qaButtons'), 'Full QA', () => void qa('all', false));
for (const part of ['sfx', 'loop', 'music', 'babble', 'scene']) button($('qaButtons'), part, () => void qa(part, true));

window.__DEV__ = { ready: true };
