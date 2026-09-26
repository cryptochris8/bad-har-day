// The real front-end flow with the keyboard: title → menu → NEW MORNING → Act I, then pause → resume.
import { expect, test } from '@playwright/test';
import { appScreen, expectNoErrors, frames, hooks, trackErrors } from './helpers';

test('keyboard: title → menu → new morning → pause → resume', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?test=1&quality=low&noboot=1&seed=42');
  await hooks(page);
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'title', null, { timeout: 90_000 });
  await frames(page, 10);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__BHD__!.uiScreen() === 'menu', null, { timeout: 30_000 });
  await frames(page, 10);
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); // NEW MORNING is focused first
  await page.waitForFunction(() => window.__BHD__!.act() === 1, null, { timeout: 60_000 });
  expect(await appScreen(page)).toBe('playing');
  // Let the act card finish, then pause and resume.
  await page.waitForFunction(() => window.__BHD__!.clock() > 315.05, null, { timeout: 90_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__BHD__!.screen() === 'paused', null, { timeout: 30_000 });
  const frozen = (await page.evaluate(() => window.__BHD__!.clock())) as number;
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__BHD__!.clock())).toBe(frozen);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__BHD__!.screen() === 'playing', null, { timeout: 30_000 });
  expectNoErrors(errors);
});
