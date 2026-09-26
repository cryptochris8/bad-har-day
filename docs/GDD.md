# BAD HAIR DAY! — Game Design Document

> **Five family members. Three heads of hair. One black brush. One school morning.**
> *Somehow, everybody makes it out the door.*

A warm, funny, browser-based 3D family arcade game about one real family's school-morning routine, played as a
sequence of short, varied, satisfying activities across one compressed morning (5:15 AM → ~8:05 AM in
**10–20 real minutes**). Procedural 3D (Three.js, every model built in code), synthesized audio, keyboard +
mouse + touch + gamepad. Fourth game on Chris's browser-arcade shelf (MAILBOX MAYHEM, TRASH PANDA TROUBLE,
ATHLETE MAYHEM), same proven stack.

## 0. Tone rules (non-negotiable — every module)

- **Loving, warm, funny, exaggerated, family-friendly.** A playable animated family cartoon.
- The humor is the *universal chaos of getting a family out the door* — never mocking the kids, never
  criticising appearance, never parents-as-villains.
- **Ashley (Mom) is never frightening, harsh or cruel.** The comedy of the hair check is the *exaggerated,
  mock-epic seriousness* of "Mom is checking the hair" — boss-fight presentation, but she is smiling, warm,
  proud, and finishes a missed spot lovingly and fast. The girls' "nooo!" is them being dramatic about not
  having done it *themselves*, not fear.
- **No pain.** Brushing a tangle too fast makes the brush *stop* (a soft "boing"), the girl makes a playful
  "eep!"/"hey!" face, and the game suggests working another section. Never crying, never wincing in pain.
- **Pets are never punished or frustrating.** The dog is lovable; waiting for it is comedy, not failure.
- **No food moralising.** Lunch items are all fine; "favorites" add a heart, nothing is "bad".
- **Rotate traits.** Wake-up behaviours, who grabs the black brush first, who declares "done" early, etc. are
  seeded per morning so no child is permanently the sleepy one / the slow one / the one who gets checked.
- **No harsh failure anywhere.** The morning always completes. Performance changes the arrival time, stars,
  and the funny awards on the report card — never a game over.

## 1. The family (procedural cartoon characters — not likenesses)

| Who | Role | Silhouette & palette (defaults; hair/skin customisable in FAMILY SETUP) |
|---|---|---|
| **Chris** | Stepdad. Up first at 5:15. Dog, coffee, lunches, trash, dishes, drives to school. Loving, helpful, mildly sleepy, good-humoured "early-morning utility player". | Tallest. Short dark-brown hair, short beard (toggle), navy hoodie + grey joggers + slippers in the morning; adds a jacket + sneakers for the school run. Big sleepy-kind eyes, a coffee-less yawn. |
| **Ashley** | Mom. Wakes with the household, helps the girls get ready, **the Hair Check**, leaves for work at **7:45**. | Long soft wavy hair (medium brown default), cosy robe/pajamas early; smart work outfit (teal blazer) after 7:15. Warm, confident, expressive brows, proud smile. |
| **Addy** (9) | Twin. Long, thick, beautiful hair. | Lavender/purple accents (pajamas, scrunchie). |
| **Ellie** (9) | Addy's twin. Long, thick, beautiful hair. | Same face/height/hair as Addy (they read as twins) — mint/teal accents, a small clip. |
| **Heidi** (7) | Younger sister. Long, thick hair. | ~85 % of the twins' height, rounder face, coral/pink star pajamas. |
| **The dog** | Family dog (name editable; default "Biscuit"). Lovable goofball. | Medium, floppy ears, wagging tail, coat colour selectable. |

The three girls clearly read as **sisters** (shared face shape, same hair family). Every character has a
distinct idle personality animation and an expressive face (eyes, lids, brows, mouth shapes).
Hair is visually important: long, thick, stylised ribbon-lock hair that looks great both in the dollhouse view
and in close-up brushing.

## 2. Presentation

- **Dollhouse view** for exploration: the single-storey home seen from the front at ~50–55° pitch, **no ceiling,
  walls cut away** toward the camera (Sims-style) so rooms read like a cosy doll house. Camera follows the active
  character, eases between rooms.
- **Close-up stations** for detailed activities (coffee, dishes, lunches, hair) — the camera glides from the
  dollhouse into a tight, well-lit shot of the station; the rest of the house stays in the scene (no loading).
- **Time of day is visible.** 5:15 dark-blue pre-dawn outside, warm lamp pools inside, a quiet house; ~6:00 the
  sky warms (sunrise); by 7:45–8:05 bright morning. Windows glow, lamps switch off as daylight arrives.
- **Act cards** between acts: big clock time + title + subtitle (e.g. "5:15 AM" / "CHRIS'S EARLY SHIFT" /
  "EVERYBODY ELSE IS STILL ASLEEP.").
- **Legendary treatment of the black brush** (glow, slow-mo reveal, choir sting, "THE BLACK BRUSH HAS SPAWNED").
- Speech bubbles with gibberish "babble" voices (Animal-Crossing style) for character lines; emote pops (!, ?, ♥,
  ZZZ, sweat drop, sparkle, music note).

## 3. Structure — one school morning in five acts

The **in-game clock** runs continuously during play at a per-act rate and never goes backwards. Each act spans a
fixed clock window and **starts at its scheduled time** (finishing an act early fast-forwards the clock to the next
act — "time flies"; finishing Act I early earns Chris a few minutes of peace on the couch). An act ends when its
activities are done **or** its clock window runs out (optional leftovers are skipped with a joke — "The dishes will
wait. They always do."; story activities wrap up gracefully: Mom arrives, the last item turns up). Required
activities hold the clock at `window end − 1 min` until finished (the clock blinks "5:59 … 5:59 …" — a joke, not a
fail). The **arrival time** comes from the school run (Act V starts at 7:50): a great drive ≈ 7:57, an average one
≈ 8:01, never later than 8:05.

| Act | Clock | Title card | Content | Real time |
|---|---|---|---|---|
| I | 5:15 → 6:00 | **CHRIS'S EARLY SHIFT** · *EVERYBODY ELSE IS STILL ASLEEP.* | Explore the dark house as Chris; do the morning's randomized chore list (3–5 of: **Dog out** (always), **Ashley's coffee** (always), **Lunchboxes**, **Trash**, **Dishes**). Stay quiet: the girls sleep. | 3–5 min |
| II | 6:00 → 6:30 | **WAKE UP, GIRLS!** | Lights on, music up. Wake each girl (her seeded wake-up style), Ashley wakes and gets her coffee (payoff: ♥). Girls gather for breakfast. | 1.5–3 min |
| III | 6:30 → 7:15 | **THE BLACK BRUSH** · *EVERYBODY WANTS IT.* | The Black Brush Battle + brushing three heads of hair + **MOM'S HAIR CHECK**. The signature act. | 3–5 min |
| IV | 7:15 → 7:50 | **OUT THE DOOR** · *SHOES. BACKPACKS. LUNCHES. GO.* | The rush: find the missing items (a shoe, a backpack, a library book, a water bottle, a hair tie…) hidden around the house, deliver them to the right girl at the front door. **7:45: Ashley leaves for work** (cutscene: grabs her coffee, hugs, "Love you! Have a great day!"). | 2–3 min |
| V | 7:50 → ~8:05 | **THE SCHOOL RUN** | Load the girls in the car; a short cheerful drive through the (fictional) neighbourhood; drop-off line; girls hop out and wave. End card: *Somehow, everybody makes it out the door.* → **Morning Report Card**. | 1.5–2.5 min |

Arrival at school is always ≤ 8:05 (clamped). Faster, more thorough mornings arrive earlier ("7:58 — EARLY?!").

## 4. Act I — Chris's early shift (5:15)

The house is dark and quiet; warm lamp pools; Chris's slippers pad softly. The task list (HUD, top-left) shows
the morning's chores; glowing markers mark stations. The dog follows Chris everywhere, tail wagging.
**Quiet meter** (flavour): running near the girls' doors makes a "shh!" emote (no penalty beyond a small award
difference).

### 4.1 Take the dog out (always first on the list, can be done in any order)
Walk to the **back door** (the front door works too — the dog gives you a look: *"wrong door"* joke, then follows
you to the back). Open it → the dog bolts into the backyard. Seeded **dog quirk**: stares into the distance for no
reason · chases a leaf · sniffs every blade of grass · does zoomies · refuses to come in immediately.
Mechanic: **Call the dog** (primary). The dog glances back periodically (an "attention" bubble). Calling while it
glances makes it trot back; calling at other times gets a head-tilt / ignore (comedy, tiny time cost). Shaking the
treat bag (hold secondary) slowly raises attention. Chris checks his watch if you wait a while (idle animation).
The dog's business happens discreetly behind the bush (a sparkle + "✓", nothing shown). Dog back in, door closed →
"DOG: WALKED". Never fails; quicker = more stars.

### 4.2 Ashley's coffee (always)
Close-up at the coffee maker. Steps: (1) **pick Ashley's mug** from the mug shelf (her favourite has a sunflower /
"heart" design; others are fine but give fewer stars) · (2) **brew** — hold to fill, release at the fill line
(sweet zone) · (3) **add creamer/sugar** per her configured preference (FAMILY SETUP: black · splash of cream ·
cream & sugar · lots of cream) — pour until the colour matches the swatch · (4) set it at **Ashley's spot**.
Banner: **COFFEE: SECURED**. Payoff in Act II/IV: she sips it and a heart pops.

### 4.3 Lunchboxes (random ~65 % of mornings)
Close-up at the counter: three colour-coded lunchboxes (purple Addy, teal Ellie, coral Heidi). Items slide onto the
counter (sandwich, wrap, pasta cup · crackers, pretzels, granola bar · juice box, water bottle, milk · apple slices,
grapes, banana, clementine · a little note!). Each box needs one of each category (main / snack / drink / fruit);
each girl has a seeded **favourite** (heart icon) in one category. Tap/click an item then a box, or drag it;
gamepad: stick selects, A picks/places. Fast, snappy, "snap" sounds. Optional: tuck a love note in (bonus ♥).

### 4.4 Take out the trash (random ~50 %)
Pull the bag from the kitchen can (primary), carry it out the **side/front door** to the outdoor bin. The bag
swings with your movement: turning/running hard makes it swing more; if it swings too far something *almost*
falls out — a quick "save it!" prompt (press primary) catches it (miss = a banana peel drops, Chris sighs, picks
it up; small time cost). The dog may wander into the path; a door may swing shut (open it again). Toss into bin
(timing arc) → lid clunk → "TRASH: OUT".

### 4.5 Dishes (random ~60 %)
Close-up at the sink/dishwasher: dishes arrive one by one from the sink; send each to its place — plates → bottom
rack, cups/glasses → top rack, cutlery → basket (left / up / right, or tap the zone, or drag). A quick rinse beat
for sticky ones (hold). Satisfying clinks, suds bubbles; streak counter. Shut the door → "DISHES: DONE".

Act ends when all chores are done or at 6:00 (then remaining optional chores are skipped with a joke).

## 5. Act II — Wake up, girls! (6:00)

Big transition: alarm chime, music up, lights on, the sky starts to warm. Ashley wakes (stretch, yawn) and heads to
the kitchen; **if the coffee is ready**, she finds it, sips, heart pop, thumbs-up to Chris.
Chris visits each girl's bed (twins share a room; Heidi has her own). Each girl gets a **seeded wake-up style**
(a permutation each morning — no girl is permanently any style):
- **Pop-up**: springs up instantly — "GOOD MORNING!!!" — bounces off to the kitchen.
- **Blanket burrito**: hides under the blanket ("five more minutes…"). Gentle wake-up: open the curtains
  (sunlight beam), then a 4-beat **wake-up song** (press on the beat) — the lump wiggles, then emerges with bedhead.
- **Sleepwalker**: gets up but shuffles, half-asleep, in the wrong direction (closet, bathroom, dog bed).
  Catch up and gently guide her (walk next to her; she follows) to the kitchen.
The girls' **bedhead** is visible (big messy hair, flyaways) — a preview of Act III. Act ends when all three are at
the breakfast table (short breakfast montage: cereal crunch, giggles).

## 6. Act III — The Black Brush (6:30) — the signature act

### 6.1 The Black Brush Battle (scramble + choice)
Bathroom vanity; three stools; brushes on the counter: **THE BLACK BRUSH** plus three others (purple paddle, pink
round, teal detangler). Presentation: camera push-in, slow-motion, light gleam + glow, choir sting, banner
**THE BLACK BRUSH** → **EVERYBODY WANTS IT.** The three girls lunge in a comic hand-pile scramble (seeded winner
grabs it first; the others react: "Hey!", "I called it!", dramatic gasp). Then the player decides **who uses it
first** (three portrait cards; the grabber is pre-selected but you can reassign — the girls react).

### 6.2 Brushing (close-up)
Three girls sit on the stools; the camera is behind the **focused** girl (3/4 back view, her face visible in the
mirror, which shows her reaction). The player controls the brush:
- **Mouse**: hold left button + drag. **Touch**: drag. **Gamepad**: left stick moves the brush, hold A (or R2) to
  press it into the hair. **Keyboard**: arrows/WASD move, hold Space.
- The hair is a field of **locks (columns) × sections (rows, scalp → tips)**, each with a tangle amount. Knots are
  shown as twisted/frizzed lock sections, soft swirl markers and small tangled clusters.
- **Downward strokes** through a section smooth it (tangle ↓, shine ↑, sparkle particles, soft bristle "fff" sound,
  completion meter ↑). Strokes follow the hair downwards; upward motion does nothing.
- **Work from the ends up**: a section only detangles well when the section below it on the same lock is already
  mostly clear. Brushing down from the scalp through a knotted lower section **snags** — the brush stops ("boing"),
  the girl makes a playful "eep!" face in the mirror, the game suggests "Start lower — work the ends first!".
- **Controlled speed**: moving too fast through a tangled section snags too ("Gently… slower strokes!").
  A good stroke speed is shown by the brush's soft trail colour (white-gold = good).
- No punishment: a snag costs a second and a reaction; that's all.
- **Brushes**: every brush works. **THE BLACK BRUSH** is modestly better: wider (covers ~1.3× the locks), ~30 %
  faster detangling, and a larger "good speed" window. The HUD says which brush the focused girl has.
- **Focus & passing**: switch focus between girls (LB/RB · Q/R · tap a portrait). The un-focused girls brush
  themselves slowly (auto-progress; faster with the black brush). **PASS THE BLACK BRUSH** (secondary / button)
  hands it to the focused girl — the previous holder reacts dramatically ("Fiiine." / "Take good care of her.")
  and gets the girl's backup brush. That is the whole strategy: who uses it first, when to pass it, whether to use
  another brush temporarily.
- Each girl declares **"I'M DONE!"** on her own when *she* thinks she's done (seeded threshold ~70–90 % — the joke:
  she's *almost* done), or the player can press **DONE** for the focused girl (alt). The act's clock window also
  ends brushing (Mom arrives).
- **Hair conditions** (seeded per girl, positive wording): *Light tangles* · *Big bedhead* · *Sleep-mess* ·
  *Picture day!* (needs 100 % for a special sparkle) · *Rainy-day frizz* (more knots near the ends) ·
  *Extra-long brushing morning* (more sections).

### 6.3 MOM'S HAIR CHECK (playful boss encounter)
Music turns mock-dramatic (boss riff). Ashley enters the bathroom doorway in a backlit slow-mo walk; boss title
card **MOM** — *THE HAIR INSPECTOR* — with a (heart-shaped) "boss bar". The girls gulp comically.
For each girl: Ashley inspects (leans in, lifts a section, a magnifying-glass sweep over the field showing any
remaining knots as little red swirls):
- **≥ 95 % smooth** → **MOM APPROVED ✓** — Ashley beams, heart burst, girl celebrates (hair flip).
- **Otherwise** → **"I'LL JUST FINISH IT…"** — Ashley takes the brush and finishes the remaining knots lovingly and
  super fast (sparkles, a speedy flourish); the girl's comic "nooooo!" (she wanted to do it herself), then a hug
  / smile. Score: "Mom Assist" (fewer stars, no "Solo Brush" award) — never a failure.
All three done → girls admire their shiny hair; Act ends.

## 7. Act IV — Out the door (7:15)

Chris again, now daylight. The girls finish dressing (outfits switch to school clothes off-screen) and gather at
the front entrance, each with an **"I need…"** bubble. **3–5 missing items** (seeded: a left shoe, a backpack, a
library book, a water bottle, a hair tie, a permission slip, a jacket) are hidden in seeded **hide spots** (under
the couch cushion, in the dog bed — the dog took it —, bathroom, bedrooms, kitchen table, backyard…). Items sparkle
faintly; the dog sometimes "helps" (runs to a spot and barks). Pick up (primary) → carry → deliver to the right
girl at the door (matching colour ring). Lunchboxes (if packed) go into backpacks automatically (payoff).
**7:45 — Ashley leaves for work** (cutscene, triggered when the clock hits 7:45 or when the act completes, whichever
first): grabs her coffee (heart if made), hugs/kisses the girls' heads, "Love you! Have a great day!", waves, car
backs out of the driveway.

## 8. Act V — The school run (7:50)

Everyone into the car (girls buckle in: click-click-click). Short arcade drive along a cheerful fictional
neighbourhood road to school (~60–90 s): steer lanes (left/right), a gentle speed hold; wholesome obstacles: a
crossing guard's stop sign (stop in the zone → she waves), geese crossing, a sprinkler, a jogger with a stroller,
a garbage truck, green lights to catch; the girls sing along (babble) and point at things. Drop-off line: pull
into the zone, the girls hop out, turn, wave: "BYE! LOVE YOU!". End card: **Somehow, everybody makes it out the
door.** Then the **Morning Report Card**.

## 9. Scoring — the Morning Report Card

Every activity returns **1–3 stars** (never 0) + flags. The report card shows: arrival time (e.g. 7:58 AM),
stars per activity, total stars → a **morning grade** ("PANCAKE-LEVEL PERFECT", "SMOOTH OPERATOR", "WE MADE IT!",
"CONTROLLED CHAOS" — all positive), and **2–4 funny awards** picked from what happened: *Dog Whisperer*,
*Coffee Artisan*, *Lunchbox Legend*, *Tangle Tamer*, *Black Brush MVP* (the girl who used it most), *Solo
Brusher*, *Mom Approved ×3*, *Quiet as a Ninja*, *Sock Detective* (found items fast), *Carpool Captain*,
*Leaf Chaser* (the dog), *Early Bird*. Stats persist: mornings played, best arrival time, total stars, awards seen.

## 10. Replayability (all seeded — `DayPlan`)

Chore subset & order suggestions · lunchbox day · dog quirk · wake-up style permutation · who grabs the black
brush · each girl's hair condition & "I'm done" threshold · tangle layouts · missing items + hide spots · drive
obstacles · weather (clear / cloudy / drizzle → rainy-day hair). **NEW MORNING** = random seed; **DAILY MORNING** =
date seed (everyone gets the same morning that day).

## 11. Controls

| | Keyboard | Mouse / Touch | Gamepad (standard / DS4 / Xbox) |
|---|---|---|---|
| Move (Chris) | WASD / arrows | on-screen joystick (touch) | left stick / D-pad |
| Interact / primary | Space / J | tap the prompt button | Cross / A |
| Secondary (call dog, pass brush) | E / K | on-screen button | Circle / B or Square / X |
| Alt (done, hold) | Shift / L | on-screen button | R2 / R1 |
| Switch girl | Q / R | tap portrait | L1 / R1 (LB/RB) |
| Brush / pour / drag | arrows + hold Space | drag | stick + hold A |
| Pause | Esc / P | pause button | Options / Start |

Every activity shows its controls as device-appropriate glyph prompts and works fully with each input method.

## 12. Audio

Fully synthesized (Web Audio): cosy lo-fi pre-dawn theme (quiet, sparse), upbeat morning bustle, "legendary" choir
sting for the black brush, mock-epic boss riff for Mom's check, bouncy school-run tune, results fanfare, a gentle
title theme. SFX for every interaction (brush bristles, sparkle, snag boing, coffee brew/pour, clinks, suds, dog
barks/pants, doors, slippers, bag rustle, bin lid, lunchbox snaps, alarm chime, car, seatbelts, school bell) and
babble voices per character (pitch/timbre per person).

## 13. Settings & Family Setup

Settings: master/music/SFX volume, screen shake, reduced motion, quality (auto/high/low), touch controls
(auto/on/off, left-handed), vibration, show hints.
**Family Setup**: per member hair colour + skin tone (preset swatches), Chris beard toggle, glasses toggles,
Ashley's coffee order, the dog's name + coat. Stored locally; purely cosmetic.

## 14. Accessibility & platform

Static site (Netlify), no backend, no accounts. Desktop + mobile (landscape preferred; portrait works). 60 fps target
on mid-range phones (quality governor). Reduced motion setting tones down camera moves/shake. Every text uses
`textContent` (the dog's name is user input).
