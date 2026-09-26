// UI module entry (docs/ARCHITECTURE.md, contract src/ui/types.ts): DOM screens, HUD, act cards,
// banners, speech bubbles, boss intro, choices, portraits, the Morning Report Card. Plain DOM + CSS
// (src/ui/styles.css, which also documents the shared UI kit for activity authors).
import './styles.css';
import { UiController } from './controller';
import type { UiManager, UiOptions } from './types';

export { formatClock } from './format';
export { UI_SOUND_EVENT } from './controller';
export { iconSvg, ICON_IDS } from './icons';

/**
 * Create the UI: appends its own `.bhd-ui` layer (z-index 3) to `opts.root` (#app). Starts with no
 * screen ('none'); call boot() for the splash → title. See src/ui/controller.ts for the few extras
 * beyond the contract (UI sound events, 'mute' handling, the HUD pause click id, glyph hydration).
 */
export function createUI(opts: UiOptions): UiManager {
  return new UiController(opts);
}
