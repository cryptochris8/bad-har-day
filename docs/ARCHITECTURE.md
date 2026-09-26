# BAD HAIR DAY! — Architecture & module contracts

Stack: **Vite 8 + TypeScript 7 (strict) + Three.js 0.186**, no UI framework, no backend, static deploy (Netlify).
Same proven format as MAILBOX MAYHEM (`C:\Users\chris\One-Shot`), TRASH PANDA TROUBLE (`C:\Users\chris\Trash-Panda`)
and ATHLETE MAYHEM (`C:\Users\chris\Athlete-Mayhem`) — all three are **read-only references: never edit them**.
Copy/adapt code from them freely (Athlete Mayhem is the most mature: `src/athlete/*` rig/face/anim, `src/audio/*`
synth engine, `src/ui/*` DOM menus/focus/HUD/CSS, `src/stadium/*` sky/lights).
Everything is procedural: models are built in code (no GLB/GLTF/FBX/OBJ, no downloaded assets), audio is synthesized
at runtime. Only shipped assets: fonts (`@fontsource/*`), favicon/icons.

Design: `docs/GDD.md` (read it first — especially §0 Tone rules).

```
index.html                 single page; #app root                                          [integration]
src/main.ts                bootstrap + URL params                                           [integration]
src/game/                  app state machine, frame loop, flow/acts, clock, free roam (walker, npcs,
                           interactions), camera director, pointer, debug hooks              [integration]
src/plan/                  DayPlan generation (seeded), scoring, awards, report (pure)      [integration]
src/storage/               localStorage save data                                           [integration]
src/core/                  rng.ts (seeded RNG), math.ts                                     [shared, frozen]
src/render/                renderer core, camera rig, quality governor                      [integration]
  palette.ts toon.ts       colour tokens + shared toon gradient                             [shared, frozen*]
  models/                  GeoBuilder (inked vertex-colour geometry), materials, helpers   [shared, frozen]
  fx/                      particles, confetti, rings, trails (implements Fx)               [props]
src/family/                the 5 family members + dog + extras: bodies, faces, outfits, anim [family]
src/hair/                  the girls' brushable long hair (HairRig) + brushes               [hair]
src/world/                 house (dollhouse cut-away), yard, cars, street, sky & time-of-day
                           lighting, school-run route                                       [world]
src/props/                 hand-held / interactive items (mugs, lunch, dishes, bags, items)  [props]
src/audio/                 Web Audio synth SFX, babble voices, procedural music              [audio]
src/input/                 keyboard, gamepad, touch overlay (logic)                         [integration]
  icons.ts touchStyles.ts  touch-button icon art + overlay styling                          [ui]
src/ui/                    DOM screens, HUD, act cards, banners, bubbles, choices, results, CSS [ui]
src/activities/            one folder per activity: dog/ coffee/ lunch/ trash/ dishes/ wake/
                           hair/ rush/ drive/ (+ registry.ts [integration])                 [activity owners]
dev/*.html + dev/*.ts      per-module test pages (dev server only, not in the build);
                           dev/harness.ts = shared renderer/scene/orbit-camera harness      [each owner]
tests/<module>/            vitest unit tests                                                [each owner]
e2e/                       Playwright tests                                                 [integration]
tools/shot.mjs             screenshot/smoke tool (starts its own Vite server)
tools/walk.mjs             scripted walkthrough (keys/pad/taps + screenshots)
```
\* palette.ts: you MAY append tokens (in the right section) — never repurpose or delete existing ones.

## Contracts (frozen — read the file header of each)

| Contract | File | Implemented in |
|---|---|---|
| Family characters, dog, extras | `src/family/types.ts` | `src/family/index.ts` |
| Brushable hair + brushes | `src/hair/types.ts` | `src/hair/index.ts` |
| House, fixtures, doors, beds, cars, lighting, route | `src/world/types.ts` | `src/world/index.ts` |
| Props | `src/props/types.ts` | `src/props/index.ts` |
| Audio | `src/audio/types.ts` | `src/audio/index.ts` |
| UI | `src/ui/types.ts` | `src/ui/index.ts` |
| Input + pointer | `src/input/types.ts` | `src/input/*`, `src/game/pointer.ts` |
| Activities + game services | `src/activities/types.ts` | `src/game/*`, `src/activities/*` |
| Day plan, acts, report | `src/plan/types.ts` | `src/plan/*` |
| Save data | `src/storage/types.ts` | `src/storage/*` |
| Render / camera / fx | `src/render/types.ts` | `src/render/*` |

Until a module's owner lands it, `src/<module>/index.ts` is a **stub** by the integrator that honours the
contract (capsule people, a floor, silent audio, bare DOM). Owners replace the stub wholesale.

## World conventions

- Metres, **Y up**, floor y = 0. The house **front faces +Z** (street side).
- The exploration **dollhouse camera** always looks from +Z toward −Z (yaw 0), pitch `DOLLHOUSE_VIEW.pitchDeg`
  (src/world/types.ts). Walls between camera and focus are cut down (Sims-style) by the world.
- **Characters face their local +Z**; `root.rotation.y = yaw` (0 faces +Z / the camera, π faces a north wall).
- Close-up stations (coffee maker, sink, lunch counter, vanity, beds) stand against **north walls facing +Z**, so the
  close-up cameras look from +Z toward −Z like the dollhouse view (smooth glides, consistent lighting).
- Screen-relative move input with the fixed camera: `worldX = moveX`, `worldZ = −moveY`.
- Activity props go under `ctx.root`; the game disposes that subtree after the activity.

## DOM layering (z-order, bottom → top)

1. `#app > canvas` — WebGL.
2. `#app > .bhd-fade` — black fade for transitions (game).
3. `#app > .bhd-touch` — touch controls overlay (input): joystick left, buttons right (mirrored for left hand).
   Bottom ~45 % of the screen during gameplay; never covers the top HUD band. Hidden when a scheme is null.
   `#app > .bhd-pointer` — the virtual cursor ring (game/pointer), pointer-events none.
4. `#app > .bhd-ui` — HUD, prompts, bubbles, activity layer, banners, act cards, menus (ui). HUD in the top band
   (safe-area aware), `pointer-events: none` except buttons/portraits/chips. Menus full-screen above everything.

Every layer honours `env(safe-area-inset-*)`. The page never scrolls or zooms (`touch-action: none`).
CSS class prefix **`bhd-`** everywhere. User strings (the dog's name) → `textContent` only.

## UI kit (shared CSS classes, src/ui/styles.css — activities build their DOM with these)

`bhd-panel` (cream card, plum ink border, soft shadow) · `bhd-btn` / `bhd-btn--primary` (chunky rounded button) ·
`bhd-chip` (small pill action, `data-slot` shows its glyph) · `bhd-meter` + `bhd-meter__fill` (rounded progress bar,
`--value: 0..1` custom property, `--color`) · `bhd-gauge` (vertical fill gauge with a target band: `--value`,
`--band-lo`, `--band-hi`) · `bhd-swatch` (colour circle) · `bhd-tag` (tiny label) · `bhd-glyph` (button glyph pill,
`data-slot`) · `bhd-pop` (pop-in animation) · `bhd-wiggle` · `bhd-center` (centred column) · `bhd-row`.
Theme tokens as CSS custom properties on `.bhd-ui`: `--bhd-cream --bhd-plum --bhd-coral --bhd-sunshine --bhd-mint
--bhd-lilac --bhd-sky --bhd-addy --bhd-ellie --bhd-heidi --bhd-ink-soft`. Fonts: display **Luckiest Guy**, UI
**Baloo 2** (rounded, friendly), body **Nunito**.

## Visual style guide (every module that builds geometry)

- **A playable animated family cartoon**: soft, rounded, cosy, expressive; slightly exaggerated proportions (big
  heads, big eyes, chunky hands); clean readable silhouettes; toy-like but not childish. Never realistic.
- Build with **GeoBuilder** (`src/render/models/builder.ts`): primitives merged into ONE vertex-coloured geometry per
  rigid part, **inked outlines** baked in (inverted hull; `inked()`), shared `modelMaterial()` (3-band toon, the soft
  cosy ramp in `toon.ts`). `smooth: true` on rounded parts (heads, hands, hair, cushions, mugs). Scenery that
  doesn't need outlines: `new GeoBuilder(false, false)` + `sceneryMaterial()`.
- Colours **only** from `src/render/palette.ts` (append tokens if needed). Warm creams/oak inside, sage/blush/sky/
  lavender room accents, family colours: Addy lavender, Ellie mint/teal, Heidi coral, Chris navy, Ashley rose→teal.
  Readable gameplay colours: interact = warm gold, knots = soft pink-red, good = mint.
- Lighting is owned by the world (hemisphere + ONE shadow-casting key light that is moon→sun, + fake lamp glows via
  `aGlow` vertex colours / additive sprites). Activities add **no real-time lights**.
- Cache geometry (`cachedGeo`), share materials (`markShared()` caches), dispose the rest (`disposeTree`).
- **Performance budget** (mid-range phone, 60 fps): ≤ 250 draw calls, ≤ 400 k triangles on screen. No per-frame
  allocations in hot paths. Characters ≤ ~12 k tris each (girls' hair included). Quality 'low' may drop shadows.

## Rules for every module

- TypeScript strict; no `any` without a comment explaining why. **No new runtime dependencies** (three only).
- **Only edit files you own** (tree above). Shared contracts (`src/*/types.ts`, `src/core/*`, `src/render/models/*`,
  `src/render/toon.ts`) are frozen — if you truly need a change, describe it in your final report instead. You MAY
  append tokens to `palette.ts`.
- Every non-trivial pure function gets a Vitest test (`tests/<module>/…`). All your tests pass before you finish
  (`npx vitest run tests/<module>`).
- `npx tsc --noEmit` must be clean for your files (others may be mid-edit — only your files count).
- Never use `Math.random()` in gameplay logic: use `Rng` from `src/core/rng.ts` (seeded). Cosmetic-only randomness
  is ok (prefer hash-based `rand01`).
- Verify visually: `node tools/shot.mjs dev/<page>.html shots/<name>.png --until "window.__DEV__ && window.__DEV__.ready"`
  and **look at the PNG**. Any page error = failure. Scratch screenshots go in `shots/` (gitignored). The machine is
  shared by several agents at once — don't leave servers running, and keep screenshot runs sequential.
- Tone (GDD §0): loving, warm, family-friendly. No pain, no scary Mom, no mocking, no food moralising, pets never
  punished.

## Debug hooks / URL params

With `?test=1` (always in dev) the app exposes `window.__BHD__` (src/game/debug.ts): `screen()`, `act()`,
`activity()`, `clock()`, `startMorning(seed?)`, `jumpTo(act | activityId)`, `skipActivity()`, `setClock(min)`, `plan()`,
`state()`, `stats()`. URL params: `?seed=N`, `?act=1..5` / `?activity=<id>` + `&autostart=1` (jump straight in),
`?quality=auto|high|low`, `?noboot=1`, `?test=1`.
