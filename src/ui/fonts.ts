// Bundled web fonts (no network): Luckiest Guy (display), Baloo 2 (UI, rounded & friendly), Nunito
// (body). Latin subsets only — the UI text is English.
import '@fontsource/luckiest-guy/latin-400.css';
import '@fontsource/baloo-2/latin-500.css';
import '@fontsource/baloo-2/latin-600.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';

/** Start loading every UI face now (during boot) so the title never flashes a fallback font. */
export function warmFonts(): void {
  try {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts || typeof fonts.load !== 'function') return;
    for (const spec of ['400 1em "Luckiest Guy"', '600 1em "Baloo 2"', '700 1em "Baloo 2"', '800 1em "Baloo 2"', '700 1em Nunito', '800 1em Nunito']) {
      fonts.load(spec).catch(() => {});
    }
  } catch {
    /* font loading is best-effort */
  }
}
