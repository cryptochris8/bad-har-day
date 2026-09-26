// ─────────────────────────────────────────────────────────────────────────────
// BAD HAIR DAY! colour tokens — the single source of truth for the art direction:
// "a cosy suburban family home at dawn". Warm creams and oak inside, sage/blush/sky
// room accents, soft plum-brown ink outlines (never pure black), candy-but-warm
// family colours. Hex numbers for Three.js; the UI mirrors the UI_* values as CSS
// custom properties (src/ui/styles.css).
// SHARED CONTRACT: add tokens if you need them (append in the right section), never
// repurpose or delete existing ones.
// ─────────────────────────────────────────────────────────────────────────────

export const PAL = {
  // ── ink ──
  /** Outline colour for every inked model (warm plum-brown, softer than black). */
  outline: 0x3a2330,

  // ── sky keyframes (time of day; the world lerps between them) ──
  skyTop: 0x0f1a3e, // clear colour fallback = pre-dawn top
  skyNightTop: 0x0f1a3e,
  skyNightHorizon: 0x2b3f7a,
  skyDawnTop: 0x3b4d96,
  skyDawnHorizon: 0xf7a88a,
  skySunriseGlow: 0xffc27a,
  skyMorningTop: 0x5fb0f0,
  skyMorningHorizon: 0xd6eeff,
  star: 0xfff6dc,
  cloudDay: 0xffffff,
  cloudDawn: 0xf6b8b0,
  sunDisc: 0xffe6a3,
  moon: 0xf4f0ff,

  // ── lighting keyframes ──
  hemiSkyNight: 0x5a6ca8,
  hemiGroundNight: 0x2a2440,
  hemiSkyDay: 0xdfeeff,
  hemiGroundDay: 0x8a7a64,
  keyNight: 0x9fb2ff, // moonlight
  keyDawn: 0xffb98a,
  keyDay: 0xfff3dc,
  lampWarm: 0xffd49a, // interior lamp light / glow pools
  lampBulb: 0xfff1c8,
  windowWarm: 0xffd27a, // lit window glass seen from outside
  windowNight: 0x2a3a6e,
  windowDay: 0xbfe3ff,
  sunbeam: 0xfff0c0,

  // ── house interior ──
  wallCream: 0xf6e7cf,
  wallSage: 0xd3e3c6, // kitchen
  wallBlush: 0xf6d6d0, // Heidi's room
  wallLavender: 0xe4d8f2, // twins' room
  wallSky: 0xd2e6f2, // bathroom
  wallButter: 0xf8e9b8, // hallway / entry
  wallTaupe: 0xe8dccb, // master bedroom
  wallCut: 0xc9b79c, // cut-away wall top cap
  trim: 0xfff8ee,
  floorOak: 0xd9a66b,
  floorOakDark: 0xc48d55,
  floorTile: 0xe6eff2,
  floorTileGrout: 0xc7d5da,
  carpetCream: 0xefe3d0,
  rugTerracotta: 0xe07a5f,
  rugMustard: 0xf2b84b,
  rugSage: 0x9cc3a4,
  sofaTeal: 0x3f8a8c,
  sofaCushion: 0x57a3a3,
  woodWarm: 0xb9824f,
  woodDark: 0x8a5a36,
  cabinetSage: 0x8fb39a,
  countertop: 0xf2ece2,
  appliance: 0xeef0f2,
  stainless: 0xc8ced4,
  sinkSteel: 0xaeb8c2,
  porcelain: 0xfbfbf8,
  mirror: 0xcfe6f2,
  plantGreen: 0x5fae63,
  plantPot: 0xd9825b,
  bedWhite: 0xfbf6ee,
  // world module additions (house interior)
  floorTileWarm: 0xe7c9a4, // entry terracotta-cream tiles
  floorTileWarmB: 0xd9b287,
  floorCheckA: 0xf4ecdc, // kitchen checker
  floorCheckB: 0xcfe0c8,
  carpetLavender: 0xece4f2,
  carpetBlush: 0xf6e4df,
  tileWhite: 0xf8f5ee, // subway / bath wall tiles
  tileSky: 0xc9e1ee,
  cabinetCream: 0xf3ead8,
  knobBrass: 0xe0b45a,
  stoveDark: 0x3d4150,
  tvScreen: 0x2c3242,
  frontDoor: 0xe0675a, // cheerful coral-red front door
  shutter: 0x7fa6a0,
  fabricMustard: 0xf2b84b,
  fabricSage: 0xa9c9a4,
  fabricRose: 0xf2b3b8,
  plushBrown: 0xc8946a,
  booksA: 0x6f9fd8,
  booksB: 0xf28c7a,
  booksC: 0xf6d06b,
  lampShade: 0xfff1d6,
  fairyLight: 0xffe2a0,

  // ── exterior ──
  grassA: 0x7cc36b,
  grassB: 0x62b05a,
  grassNight: 0x2f4a4a,
  dirt: 0xa77a52,
  dirtDark: 0x86603f,
  fence: 0xf3e8d6,
  siding: 0xe9dcc4,
  sidingShadow: 0xd4c4a8,
  brick: 0xc8745a,
  roofSlate: 0x5b6b84,
  roofSlateDark: 0x46546b,
  sidewalk: 0xd9d4cc,
  asphalt: 0x4c505c,
  asphaltLine: 0xf5e6a8,
  driveway: 0xc2bcb1,
  hedge: 0x4f9a52,
  treeLeaf: 0x6dbb5e,
  treeLeafDark: 0x4e9a4c,
  treeTrunk: 0x8a5c3a,
  flowerPink: 0xff8fb1,
  flowerYellow: 0xffd45e,
  schoolBrick: 0xd0705a,
  schoolTrim: 0xfff4e0,
  busYellow: 0xffc72c,
  carBody: 0x6f9fd8, // the family car (friendly blue minivan)
  carTrim: 0x2b3444,
  glass: 0x9fd0f0,
  // world module additions (exterior)
  carAshley: 0xe8918f, // Ashley's small rose car
  tire: 0x33313a,
  foundation: 0xb9ae9f,
  mulch: 0x8a5d3f,
  paver: 0xd6c7b0,
  paverB: 0xc4b39a,
  curb: 0xcfcac1,
  binTrash: 0x5b7f66,
  binRecycle: 0x4f86c6,
  gnomeRed: 0xe0564a,
  neighborA: 0xe7d3b8,
  neighborB: 0xcfdcd6,
  neighborC: 0xf0d6c4,
  neighborRoofA: 0x8a6a5a,
  neighborRoofB: 0x6b7b8c,
  distantTree: 0x5c9a6a,
  rain: 0xc9d8ea,

  // ── family defaults (outfits; hair/skin are customisable, see src/family/looks.ts) ──
  chrisHoodie: 0x33507a,
  chrisJoggers: 0x767d8a,
  chrisJacket: 0x4f7a5a,
  ashleyRobe: 0xf0b7c6,
  ashleyPJ: 0xf6d2dc,
  ashleyBlazer: 0x2f7f86,
  ashleyTop: 0xfff3e6,
  addyMain: 0xa78bfa, // lavender / purple
  addyDark: 0x7c5ce0,
  ellieMain: 0x4fd1b5, // mint / teal
  ellieDark: 0x22a38a,
  heidiMain: 0xff8a8a, // coral / pink
  heidiDark: 0xf0647a,
  starPrint: 0xfff3b0,
  slipper: 0x8a6f5a,
  sneakerWhite: 0xf7f7f2,
  denim: 0x5b7fb8,
  // family module additions (faces, outfit details, the dog, extras)
  eyeWhite: 0xfffdf7,
  eyeInk: 0x2c1a24, // pupils, closed-eye lines, lashes
  lipLine: 0x5b2636,
  mouthDark: 0x7a2c40,
  tongue: 0xf28a9c,
  teeth: 0xfffbf2,
  blush: 0xff8f9e,
  glassesFrame: 0x3b2a33,
  glassesFrameWarm: 0x8a4f3c,
  goldTrim: 0xf6c54f,
  pajamaCream: 0xfff1d6,
  mintPJ: 0x9fe8d4,
  hoodieString: 0xf4ede2,
  jeansDark: 0x3f5f93,
  trouserPlum: 0x3d3450,
  flatShoe: 0x6b3a4e,
  leggingPlum: 0x4b3b63,
  heidiDress: 0xffd05a,
  fuzzySlipper: 0xf7c9d4,
  sneakerSole: 0xe9e4da,
  dogNose: 0x2a1c22,
  dogCollar: 0xe2463d,
  hiVis: 0xd6f23a,
  hiVisStripe: 0xeef0f4,
  guardNavy: 0x2e3e63,
  teacherCardigan: 0xd98b5f,
  lanyard: 0x4f86d9,
  robeBlue: 0x7fa6d6,
  mugBody: 0xfdf6ea,

  // ── brushes ──
  blackBrush: 0x17151c,
  blackBrushSheen: 0xb9a6ff, // legendary glint / glow
  brushPurple: 0x9b6bd6,
  brushPink: 0xf28cb3,
  brushTeal: 0x2fb7a8,
  bristle: 0xf4efe6,
  // hair module additions (girls' hair shading + brush details)
  hairSheen: 0xfff1dc, // glossy highlight tint mixed into each girl's hair colour
  hairTipLight: 0xffd9a6, // sun-kissed lightening toward the tips
  brushPad: 0x2b2733, // the black brush's cushion
  blackBrushEdge: 0x5f4aa8, // the black brush's subtle violet edge
  bristleTip: 0x3a3340, // ball tips on paddle-brush pins

  // ── gameplay readability ──
  interact: 0xffe27a, // station markers / prompts (warm gold)
  interactGlow: 0xfff3c4,
  good: 0x6fd6a0,
  great: 0xffd24a,
  knot: 0xff6b8a, // remaining-knot markers (soft pink-red swirl)
  sparkle: 0xfff6d6,
  heart: 0xff6b8a,
  sweat: 0x8fd3ff,

  // ── fx / confetti ──
  confettiA: 0xff7a6b,
  confettiB: 0xffc94a,
  confettiC: 0x6fd6b6,
  confettiD: 0xb79cf5,
  confettiE: 0x7cc4f2,
  bubble: 0xeaf6ff,
  steam: 0xf4f4f4,
  leafAutumn: 0xe8a33d,
  // props module additions (fx)
  fxDust: 0xf2e8d8,
  fireA: 0xffe14a,
  fireB: 0xffa020,
  fireC: 0xff6a2a,
  fireD: 0xff4a3a,
  heartLight: 0xffa3bf,
  leafRed: 0xe0583a,
  leafGold: 0xf2c043,
  leafBrown: 0xb8743a,
  splash: 0x8fd3ff,
  crumbCookie: 0xbf8248,
  crumbChoc: 0x6b3f28,

  // ── props (food, coffee, dishes, household items; props module) ──
  bread: 0xf7dcaa,
  breadCrust: 0xc98848,
  toast: 0xe6a95a,
  butter: 0xffe792,
  lettuce: 0x86d45e,
  cheese: 0xffd049,
  ham: 0xf5a7a6,
  tomato: 0xf2614c,
  peanutButter: 0xcf9152,
  jelly: 0xa04fc8,
  tortilla: 0xf3dba6,
  tortillaSpot: 0xd8a45e,
  pasta: 0xffd35c,
  cracker: 0xecb45a,
  pretzel: 0xa9612d,
  salt: 0xfffbf2,
  granola: 0xc99858,
  stringCheese: 0xfff2c8,
  juiceOrange: 0xff9b36,
  waterBlue: 0xaee0f7,
  milkBlue: 0x5d93dc,
  appleRed: 0xe9483d,
  appleFlesh: 0xfff4d6,
  grapeGreen: 0xa4d85a,
  banana: 0xffdb4d,
  bananaTip: 0x6b4a2a,
  clementine: 0xff9a2e,
  cereal: 0xf2c064,
  milk: 0xfdfbf4,
  paper: 0xfffcf2,
  paperLine: 0xc5d3e8,
  kraft: 0xd6a66a,
  coffeeBlack: 0x3b2418,
  coffeeSplash: 0x6e4a30,
  coffeeCreamSugar: 0x9d6d47,
  coffeeLatte: 0xc79f73,
  mugCream: 0xfff5e4,
  mugSky: 0x9fd0ee,
  mugBlush: 0xf8c6d2,
  mugMint: 0x93dcc4,
  mugOat: 0xe8cda6,
  mugNavy: 0x34507c,
  mugStripe: 0xff7f6e,
  sunflowerCenter: 0x7a4a26,
  carafeGlass: 0xdcecf2,
  carafeBlack: 0x3a3440,
  plasticWhite: 0xf6f3ee,
  metalDark: 0x5a5d68,
  trashBag: 0x4a4a5c,
  trashBagSheen: 0x76768c,
  bagTie: 0xff7a6b,
  stopRed: 0xe5483f,
  ballYellow: 0xd9ee52,
  keyBrass: 0xe8c25a,
  wrapperSun: 0xffc94a,
  wrapperBerry: 0xff6f8e,
  grapePurple: 0x8f5cc8,
  dishBlue: 0x7cb8e8,
  ketchup: 0xe0503a,
  syrup: 0xb0692c,
  cocoa: 0x8a5a3a,
  eggWhite: 0xfffaf0,
  eggYolk: 0xffc93a,
  cowSpot: 0x4a3a44,
  clockBody: 0x7fd3c0,
  cerealBox: 0xff8a5c,
  cerealPanel: 0xffe07a,
  fobDark: 0x3a3f4a,
  treatBone: 0xf3dcb0,

  // ── UI (mirrored in CSS custom properties) ──
  uiCream: 0xfff6e9,
  uiPlum: 0x3a2330,
  uiCoral: 0xff7a6b,
  uiSunshine: 0xffc94a,
  uiMint: 0x6fd6b6,
  uiLilac: 0xb79cf5,
  uiSky: 0x7cc4f2,
} as const;

export type PalKey = keyof typeof PAL;

/** Confetti colours (fx). */
export const CONFETTI_COLORS: readonly number[] = [PAL.confettiA, PAL.confettiB, PAL.confettiC, PAL.confettiD, PAL.confettiE];

/** Skin tone presets (index stored in looks). Warm cartoon tones, light → deep. */
export const SKIN_TONES: readonly number[] = [0xffe0c7, 0xf9d0ae, 0xf0bb90, 0xe0a57a, 0xc98a5e, 0xa86d45, 0x85522f, 0x5f3a22];

/** Hair colour presets (swatches in FAMILY SETUP). */
export const HAIR_COLORS: readonly { id: string; name: string; hex: number }[] = [
  { id: 'espresso', name: 'Espresso', hex: 0x2e1d15 },
  { id: 'darkBrown', name: 'Dark brown', hex: 0x44291b },
  { id: 'chestnut', name: 'Chestnut', hex: 0x6b3d24 },
  { id: 'auburn', name: 'Auburn', hex: 0x8c3e22 },
  { id: 'caramel', name: 'Caramel', hex: 0x9b6536 },
  { id: 'honey', name: 'Honey', hex: 0xbf8a48 },
  { id: 'golden', name: 'Golden blonde', hex: 0xd9ad5f },
  { id: 'platinum', name: 'Light blonde', hex: 0xead29a },
  { id: 'strawberry', name: 'Strawberry', hex: 0xc56a3e },
  { id: 'black', name: 'Black', hex: 0x1b1616 },
  { id: 'silver', name: 'Silver', hex: 0xb9b6bd },
];

/** Eye colour presets. */
export const EYE_COLORS: readonly number[] = [0x4a2e1f, 0x6b4a2b, 0x3f6f9f, 0x4f7f4f, 0x7a8a5a, 0x2e2e3a];

/** The dog's coat presets. */
export const DOG_COATS = {
  golden: { main: 0xe0a458, light: 0xf6d7a4, dark: 0xb97a3a },
  chocolate: { main: 0x7a4b2e, light: 0xb0835f, dark: 0x5a3420 },
  black: { main: 0x2a2528, light: 0x5a5057, dark: 0x171416 },
  spotted: { main: 0xf4eee4, light: 0xffffff, dark: 0x3a2e2a },
  gray: { main: 0x8e939c, light: 0xc8ccd3, dark: 0x5e636b },
  cream: { main: 0xf1dfbf, light: 0xfff4de, dark: 0xcfb58a },
} as const;
export type DogCoat = keyof typeof DOG_COATS;
