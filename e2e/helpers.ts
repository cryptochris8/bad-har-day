// Shared e2e helpers: boot the game with debug hooks, read window.__BHD__, wait on frames.
import { expect, type Page } from '@playwright/test';
import type {} from '../src/game/debug'; // window.__BHD__ typing

/** Collects page errors and console errors for the whole test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/** Chrome's own message when the host has no usable audio device (headless) — not a game error. */
const HOST_AUDIO_DEVICE_ERROR = /The AudioContext encountered an error from the audio device or the WebAudio renderer/;

export function expectNoErrors(errors: string[]): void {
  const real = errors.filter((e) => !HOST_AUDIO_DEVICE_ERROR.test(e));
  expect(real, real.join('\n')).toEqual([]);
}

export async function hooks(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__BHD__, null, { timeout: 90_000 });
}

export const appScreen = (page: Page): Promise<string> => page.evaluate(() => String(window.__BHD__!.screen()));

export async function waitAppScreen(page: Page, id: string, timeout = 240_000): Promise<void> {
  await page.waitForFunction((s) => window.__BHD__!.screen() === s, id, { timeout, polling: 200 });
}

/** Wait for n animation frames in the page. */
export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let k = 0;
        const f = (): void => {
          if (++k >= count) resolve();
          else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }),
    n,
  );
}
