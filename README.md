# BAD HAIR DAY!

> **Five family members. Three heads of hair. One black brush. One school morning.**
> *Somehow, everybody makes it out the door.*

A warm, funny, browser-based 3D family arcade game about one real family's school-morning routine — Chris, Ashley,
Addy, Ellie, Heidi and the dog — played as one compressed morning from **5:15 AM to ~8:05 AM in 10–20 minutes**.
Everything is procedural: every model is built in code (no downloaded 3D assets), every sound and song is synthesized
at runtime. Keyboard, mouse, touch and gamepad. Static site — no backend, no accounts.

## The morning

| Act | Time | What happens |
|---|---|---|
| I · Chris's Early Shift | 5:15 | Tiptoe around the dark house: dog out, Ashley's coffee, and the morning's random chores (lunches, trash, dishes). |
| II · Wake Up, Girls! | 6:00 | Every girl wakes up her own (seeded) way: pop-up, blanket burrito, or sleepwalker. |
| III · Hair Time | 6:30 | **THE BLACK BRUSH.** Everybody wants it. Brush three heads of hair, pass the legendary brush, then face **MOM** — *The Hair Inspector*. |
| IV · Out the Door | 7:15 | Find the missing shoe, book, backpack…; Ashley leaves for work at 7:45 (coffee secured, hugs). |
| V · The School Run | 7:50 | Drive the girls to school, wave goodbye — then the **Morning Report Card**. |

Every morning is seeded (chores, dog quirk, wake-up styles, hair conditions, who grabs the black brush, missing
items, the drive). **NEW MORNING** is random; **DAILY MORNING** is the same for everyone on a given date.
**FAMILY SETUP** lets you pick hair colours, skin tones, glasses/beard, Ashley's coffee order and the dog's name.
**SETTINGS → Start the morning at** lets the girls skip Chris's early shift and start at 6:00 (wake-up), 6:30 (hair
time), 7:15 (out the door) or 7:50 (the school run).

## Controls

| | Keyboard | Mouse / Touch | Gamepad |
|---|---|---|---|
| Move | WASD / arrows | on-screen joystick | left stick / D-pad |
| Interact | Space / J | tap the button | ✕ / A |
| Secondary | E / K | on-screen button | ○ / B |
| Alt | Shift / L | on-screen button | R2 / RT |
| Switch girl | Q / R | tap a portrait | L1 / R1 |
| Brush / pour / drag | arrows + hold Space | drag | stick + hold ✕ / A |
| Pause | Esc / P | pause button | Options / Start |

## Development

```bash
npm install
npm run dev          # http://localhost:5190
npm test             # Vitest unit tests
npm run test:e2e     # Playwright (builds, serves the production build, real Chrome + software WebGL)
npm run build        # typecheck + production build → dist/
```

- Design: [`docs/GDD.md`](docs/GDD.md) · Architecture, module contracts, conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Dev URL params: `?test=1` (debug hooks `window.__BHD__`), `?seed=N`, `?act=1..5` or `?activity=dog|coffee|lunch|trash|dishes|wake|hair|rush|drive` (jump straight in), `?autostart=1`, `?quality=auto|high|low`, `?noboot=1`.
- Per-module test pages: `dev/*.html` (served by `npm run dev` only).
- Screenshots: `node tools/shot.mjs "/?test=1&act=3" shots/x.png` · walkthroughs: `node tools/walk.mjs "/?test=1&autostart=1" shots/w "sleep:3000" "eval:window.__BHD__.autopilot(true)" "wait:results" "shot:end"`.

Stack: Vite 8 · TypeScript 7 (strict) · Three.js 0.186 · Web Audio · Gamepad API. Same proven format as MAILBOX
MAYHEM, TRASH PANDA TROUBLE and ATHLETE MAYHEM.

**Play it:** https://bad-hair-day.netlify.app — static deploy (`dist/`) on Netlify (`netlify.toml`).
